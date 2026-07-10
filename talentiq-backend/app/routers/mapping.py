"""
app/routers/mapping.py
─────────────────────────────────────────────────────────────
Skill mapping endpoints. ALL reads are filtered to the latest
period of each respective table:
  • requisitions       → MAX(requisition_file_date)
  • msd_allocations    → MAX(allocation_month)
  • bench_employee_ids → MAX(bench_week_date)

The backend may have many older snapshots; the frontend sees
only the most recent.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Requisition, MsdAllocation, BenchEmployeeId
from app.processors import (
    extract_positions,
    build_bench_resources,
    get_match_score,
    is_grade_match,
    same_shore,
)

router = APIRouter(prefix="/api", tags=["mapping"])


class ManualBenchIdsRequest(BaseModel):
    employee_ids: list[str]
    file_week: str | None = None
    effective_date: str | None = None


class DeleteBenchIdsRequest(BaseModel):
    employee_ids: list[str]
    effective_date: str | None = None

MSD_ALL_FIELDS = {
    "name": ("name", "Name", "Employee Name", "Resource Name"),
    "employee_id": ("employee_id", "Employee Id", "Emp Id", "EmployeeId"),
    "designation": ("designation", "Designation as per HRIS", "Designation", "Job Title"),
    "date_of_joining": (
        "date_of_joining", "DOJ as per HRIS", "Date of Joining",
        "Joining Date", "DOJ", "Hire Date",
    ),
    "grade": ("grade", "Grade as per HRIS", "Grade", "Band"),
    "rm": ("rm", "RM as per HRIS", "RM", "Reporting Manager"),
    "office_location": ("office_location", "work_location", "Office Location as per HRIS", "Office Location"),
    "project_name": ("project_name", "Project Name", "Project"),
    "project_vertical": ("vertical", "Project Vertical", "Vertical", "Practice"),
    "customer_name": ("customer_name", "Customer Name", "Customer", "Client Name"),
    "resource_category": ("resource_category", "Resource Category", "Category"),
    "skillsets": ("skillsets", "Skillsets", "Skill Sets", "Skills"),
    "lob": ("lob", "LOB as per HRIS", "LOB", "Line of Business"),
    "billability": ("billability", "Billability", "Billable", "Billing Status"),
    "allocation_percentage": (
        "allocation_percentage", "Allocation Percentage", "Allocation %",
        "Allocation Percent", "Allocation", "Utilization Percentage", "Utilization %",
    ),
    "project_start_date": ("project_start_date", "Project Start Date", "Allocation Start Date"),
    "project_end_date": ("project_end_date", "Project End Date", "Allocation End Date"),
}


# ── helpers to fetch latest snapshots ───────────────────────
def _latest_requisitions(db: Session, status: str | None = None):
    latest = db.query(func.max(Requisition.requisition_file_date)).scalar()
    if latest is None:
        return []
    q = db.query(Requisition).filter(Requisition.requisition_file_date == latest)
    if status:
        q = q.filter(Requisition.status == status)
    return q.all()


def _latest_msd(db: Session):
    latest = db.query(func.max(MsdAllocation.allocation_month)).scalar()
    if latest is None:
        return []
    return db.query(MsdAllocation).filter(
        MsdAllocation.allocation_month == latest
    ).all()


def _latest_msd_month(db: Session):
    return db.query(func.max(MsdAllocation.allocation_month)).scalar()


def _latest_bench_ids(db: Session) -> list[str]:
    return [row.employee_id for row in _latest_bench_records(db)]


def _latest_bench_records(db: Session):
    latest = _latest_bench_week(db)
    if latest is None:
        return []
    return db.query(BenchEmployeeId).filter(
        BenchEmployeeId.bench_week_date == latest
    ).order_by(BenchEmployeeId.employee_id).all()


def _inventory_rows_for_records(msd_rows, records) -> list[dict]:
    employee_ids = [record.employee_id for record in records]
    resources = build_bench_resources(msd_rows, employee_ids)
    by_id = {_norm_emp_id(r.get("id")): r for r in resources}
    rows = []
    for record in records:
        employee_id = record.employee_id
        key = _norm_emp_id(employee_id)
        resource = by_id.get(key)
        metadata = {
            "recordId": record.id,
            "effectiveDate": record.bench_week_date.isoformat(),
            "updatedAt": record.uploaded_at.isoformat() if record.uploaded_at else None,
            "resourceSource": record.source or "file_upload",
        }
        if resource:
            rows.append({**resource, **metadata, "foundInMsd": True})
        else:
            rows.append({
                **metadata,
                "id": employee_id,
                "name": "",
                "grade": "",
                "designation": "",
                "location": "",
                "workLocation": "",
                "division": "",
                "lob": "",
                "vertical": "",
                "client": "",
                "skills": [],
                "benchDays": None,
                "benchProject": None,
                "currentProject": "",
                "available": "ID saved, MSD details not found",
                "foundInMsd": False,
            })
    return rows


def _latest_bench_week(db: Session):
    return db.query(func.max(BenchEmployeeId.bench_week_date)).scalar()


def _parse_iso_week(value: str) -> date:
    try:
        year, week_part = str(value or "").strip().upper().split("-W")
        return date.fromisocalendar(int(year), int(week_part), 1)
    except (ValueError, AttributeError):
        raise HTTPException(400, f"Invalid week '{value}'. Expected format YYYY-Www e.g. 2026-W25.")


def _parse_effective_date(value: str) -> date:
    try:
        return date.fromisoformat(str(value or "").strip())
    except (ValueError, AttributeError):
        raise HTTPException(400, f"Invalid effective date '{value}'. Expected format YYYY-MM-DD.")


def _current_iso_week_monday() -> date:
    today = date.today()
    iso_year, iso_week, _ = today.isocalendar()
    return date.fromisocalendar(iso_year, iso_week, 1)


def _row_mapping(row) -> dict:
    if isinstance(row, dict):
        return row
    table = getattr(row, "__table__", None)
    if table is not None:
        return {col.name: getattr(row, col.name, None) for col in table.columns}
    return dict(getattr(row, "__dict__", {}) or {})


def _norm_key(value: str) -> str:
    return " ".join(str(value).lower().split())


def _pick(row, *candidates: str) -> str:
    data = _row_mapping(row)
    for candidate in candidates:
        if candidate in data and data[candidate] is not None and str(data[candidate]).strip() != "":
            return str(data[candidate]).strip()

    normalized = {_norm_key(k): k for k in data.keys()}
    for candidate in candidates:
        key = normalized.get(_norm_key(candidate))
        if key is not None and data[key] is not None and str(data[key]).strip() != "":
            return str(data[key]).strip()
    return ""


def _normalize_shore(label: str) -> str:
    value = str(label or "").strip().lower()
    if not value:
        return ""
    if "offshore" in value or value.startswith("off"):
        return "Offshore"
    if "onshore" in value or value.startswith("on"):
        return "Onshore"
    return ""


def _all_msd_resource_row(row) -> dict:
    shore = _pick(row, "onshore_offshore_label", "Onshore/Offshore", "Shore")
    return {
        **{field: _pick(row, *candidates) for field, candidates in MSD_ALL_FIELDS.items()},
        "onshore_offshore": _normalize_shore(shore),
    }


# ── endpoints ───────────────────────────────────────────────
@router.get("/positions")
def get_positions(db: Session = Depends(get_db)):
    return extract_positions(_latest_requisitions(db, status="Open"))


@router.get("/bench-resources")
def get_bench_resources(db: Session = Depends(get_db)):
    return build_bench_resources(_latest_msd(db), _latest_bench_ids(db))


@router.get("/bench-inventory")
def get_bench_inventory(db: Session = Depends(get_db)):
    target_date = _latest_bench_week(db)
    if target_date is None:
        return {"rows": [], "as_of": None, "week": None, "available_dates": [], "last_updated_at": None}

    records = _latest_bench_records(db)
    rows = _inventory_rows_for_records(_latest_msd(db), records)
    iso_year, iso_week, _ = target_date.isocalendar()
    available_dates = [
        row[0].isoformat()
        for row in db.query(BenchEmployeeId.bench_week_date)
        .distinct()
        .order_by(BenchEmployeeId.bench_week_date.desc())
        .all()
    ]
    last_updated = max((r.uploaded_at for r in records if r.uploaded_at), default=None)
    return {
        "rows": rows,
        "as_of": target_date.isoformat(),
        "week": f"{iso_year}-W{iso_week:02d}",
        "available_dates": available_dates,
        "last_updated_at": last_updated.isoformat() if last_updated else None,
    }


@router.post("/bench-ids/manual")
def add_manual_bench_ids(payload: ManualBenchIdsRequest, db: Session = Depends(get_db)):
    target_week = (
        _parse_effective_date(payload.effective_date)
        if payload.effective_date
        else _parse_iso_week(payload.file_week)
        if payload.file_week
        else (_latest_bench_week(db) or date.today())
    )
    latest_week = _latest_bench_week(db)
    if latest_week and target_week < latest_week:
        raise HTTPException(
            409,
            f"Cannot update historical bench snapshot {target_week.isoformat()}. "
            f"The active latest snapshot is {latest_week.isoformat()}.",
        )
    iso_year, iso_week, _ = target_week.isocalendar()

    seen = set()
    cleaned_ids = []
    for raw_id in payload.employee_ids:
        employee_id = str(raw_id or "").strip()
        if employee_id.lower().endswith(".0"):
            employee_id = employee_id[:-2]
        if not employee_id or employee_id.lower() in {"undefined", "null"}:
            continue
        key = employee_id.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned_ids.append(employee_id)

    if not cleaned_ids:
        raise HTTPException(400, "Enter at least one employee ID.")

    existing = {
        str(row.employee_id).strip().lower()
        for row in db.query(BenchEmployeeId).filter(
            BenchEmployeeId.bench_week_date == target_week
        ).all()
    }

    objs = [
        BenchEmployeeId(
            bench_week_date=target_week,
            employee_id=employee_id,
            source="manual",
        )
        for employee_id in cleaned_ids
        if employee_id.lower() not in existing
    ]
    if objs:
        db.bulk_save_objects(objs)
        db.commit()

    skipped = len(cleaned_ids) - len(objs)
    message = f"{len(objs)} employee ID{'s' if len(objs) != 1 else ''} added for week {iso_year}-W{iso_week:02d}"
    if skipped:
        message += f" ({skipped} already saved)"
    manual_records = db.query(BenchEmployeeId).filter(
        BenchEmployeeId.bench_week_date == target_week,
        func.lower(BenchEmployeeId.employee_id).in_([employee_id.lower() for employee_id in cleaned_ids]),
    ).all()
    manual_rows = _inventory_rows_for_records(_latest_msd(db), manual_records)
    return {
        "rows_inserted": len(objs),
        "message": message,
        "period": f"{iso_year}-W{iso_week:02d}",
        "rows": manual_rows,
        "matched_count": len([r for r in manual_rows if r.get("foundInMsd")]),
    }


@router.delete("/bench-ids")
def delete_bench_ids(payload: DeleteBenchIdsRequest, db: Session = Depends(get_db)):
    target_date = _latest_bench_week(db)
    if target_date is None:
        return {"rows_deleted": 0, "period": None, "message": "No bench snapshot exists."}
    if payload.effective_date and _parse_effective_date(payload.effective_date) != target_date:
        raise HTTPException(
            409,
            f"Deletion is allowed only from the active latest snapshot {target_date.isoformat()}.",
        )

    normalized_ids = {_norm_emp_id(value) for value in payload.employee_ids if _norm_emp_id(value)}
    if not normalized_ids:
        raise HTTPException(400, "Select at least one employee ID to delete.")

    candidates = db.query(BenchEmployeeId).filter(
        BenchEmployeeId.bench_week_date == target_date
    ).all()
    to_delete = [row for row in candidates if _norm_emp_id(row.employee_id) in normalized_ids]
    for row in to_delete:
        db.delete(row)
    db.commit()
    return {
        "rows_deleted": len(to_delete),
        "period": target_date.isoformat(),
        "message": f"{len(to_delete)} bench resource{'s' if len(to_delete) != 1 else ''} deleted for {target_date.isoformat()}.",
    }


@router.get("/msd-all")
def get_all_msd_resources(db: Session = Depends(get_db)):
    latest = _latest_msd_month(db)
    if latest is None:
        return {"rows": [], "as_of": None}

    rows = db.query(MsdAllocation).filter(
        MsdAllocation.allocation_month == latest
    ).all()
    return {
        "rows": [_all_msd_resource_row(row) for row in rows],
        "as_of": latest.strftime("%Y-%m"),
    }


def _norm_emp_id(value) -> str:
    """Normalize an employee id for matching (strip trailing .0, whitespace, case)."""
    text = str(value or "").strip().lower()
    return text[:-2] if text.endswith(".0") else text


def _clean(value) -> str:
    """Return database values as trimmed strings, including numeric columns."""
    return str(value).strip() if value is not None else ""


def _parse_loose_date(value):
    """Best-effort parse of a date string for SORTING only (never raises).

    Handles ISO dates/datetimes, common slash/dash formats, and bare Excel
    serial numbers. Returns a date or None. Kept out of the upload path so
    upload speed is unaffected — only the (rare) history read pays for it.
    """
    from datetime import date as _date, timedelta
    text = str(value or "").strip()
    if not text:
        return None
    # Excel serial number (e.g. "45292" or "45292.0")
    try:
        if text.replace(".", "", 1).isdigit():
            serial = float(text)
            if 1 < serial < 100000:
                return _date(1899, 12, 30) + timedelta(days=int(serial))
    except (ValueError, OverflowError):
        pass
    head = text.split(" ")[0].split("T")[0]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(head, fmt).date()
        except ValueError:
            continue
    return None


@router.get("/employee-history/{employee_id}")
def get_employee_history(employee_id: str, db: Session = Depends(get_db)):
    """Reconstruct one employee's project history across ALL uploaded months.

    Each MSD row carries the project's start/end dates and billability, so we
    gather every row for the employee (across all allocation_months), dedupe
    repeated project stints, and return them newest-first.
    """
    target = _norm_emp_id(employee_id)
    if not target:
        return {
            "employee_id": employee_id,
            "employee": None,
            "as_of": None,
            "current_alignments": [],
            "projects": [],
            "promotions": [],
        }

    latest_month = _latest_msd_month(db)
    # Pull every row that could belong to this employee. Exact match first via
    # the index; fall back to a normalized scan only if the index misses.
    rows = db.query(MsdAllocation).filter(MsdAllocation.employee_id == employee_id).all()
    if not rows:
        rows = [r for r in db.query(MsdAllocation).all() if _norm_emp_id(r.employee_id) == target]

    if not rows:
        return {
            "employee_id": employee_id,
            "employee": None,
            "as_of": None,
            "current_alignments": [],
            "projects": [],
            "promotions": [],
        }

    # Identity fields — take the values from the most recent snapshot row.
    rows_by_recency = sorted(rows, key=lambda r: r.allocation_month or date.min, reverse=True)
    head = rows_by_recency[0]
    date_of_joining = next(
        (
            str(row.date_of_joining).strip()
            for row in rows_by_recency
            if row.date_of_joining and str(row.date_of_joining).strip()
        ),
        "",
    )
    employee = {
        "employee_id": head.employee_id,
        "name": head.name or "",
        "grade": head.grade or "",
        "designation": head.designation or "",
        "date_of_joining": date_of_joining,
        "office_location": head.office_location or head.work_location or "",
        "onshore_offshore": _normalize_shore(head.onshore_offshore_label),
    }

    current_rows = [r for r in rows if r.allocation_month == latest_month]
    current_alignments = []
    for r in current_rows:
        project = (r.project_name or "").strip()
        customer = (r.customer_name or "").strip()
        if not (project or customer or r.billability or r.allocation_percentage):
            continue
        current_alignments.append({
            "project_name": project,
            "customer_name": customer,
            "project_vertical": (r.vertical or "").strip(),
            "billability": (r.billability or "").strip(),
            "allocation_percentage": _clean(r.allocation_percentage),
            "start_date": (r.project_start_date or r.allocation_start_date or "").strip(),
            "end_date": (r.project_end_date or "").strip(),
        })

    # One grade per monthly snapshot is enough to identify grade changes even
    # when an employee has several project rows in that month.
    monthly_profile: dict[date, dict] = {}
    for r in sorted(rows, key=lambda item: item.allocation_month or date.min):
        if not r.allocation_month:
            continue
        profile = monthly_profile.setdefault(
            r.allocation_month,
            {"grade": "", "designation": ""},
        )
        if not profile["grade"] and r.grade:
            profile["grade"] = str(r.grade).strip()
        if not profile["designation"] and r.designation:
            profile["designation"] = str(r.designation).strip()

    promotions = []
    previous_grade = ""
    for month, profile in sorted(monthly_profile.items()):
        grade = profile["grade"]
        if not grade:
            continue
        if previous_grade and grade.casefold() != previous_grade.casefold():
            promotions.append({
                "from_grade": previous_grade,
                "to_grade": grade,
                "effective_month": month.strftime("%Y-%m"),
                "designation": profile["designation"],
            })
        previous_grade = grade

    # Group into distinct project stints. Same stint repeats across months, so
    # dedupe on (project, customer, start, end); merge the months it spans.
    stints: dict[tuple, dict] = {}
    for r in rows:
        project = (r.project_name or "").strip()
        customer = (r.customer_name or "").strip()
        start = (r.project_start_date or r.allocation_start_date or "").strip()
        end = (r.project_end_date or "").strip()
        if not (project or customer or start or end):
            continue
        key = (project.lower(), customer.lower(), start.lower(), end.lower())
        existing = stints.get(key)
        if existing is None:
            stints[key] = {
                "project_name": project,
                "customer_name": customer,
                "project_vertical": (r.vertical or "").strip(),
                "billability": (r.billability or "").strip(),
                "allocation_percentage": _clean(r.allocation_percentage),
                "designation": (r.designation or "").strip(),
                "grade": (r.grade or "").strip(),
                "start_date": start,
                "end_date": end,
                "_months": {r.allocation_month} if r.allocation_month else set(),
                # Ongoing if seen in the latest snapshot and no explicit end date.
                "is_current": (r.allocation_month == latest_month) and not end,
            }
        else:
            if r.allocation_month:
                existing["_months"].add(r.allocation_month)
            if (r.allocation_month == latest_month) and not end:
                existing["is_current"] = True
            for field, value in (
                ("project_vertical", r.vertical),
                ("billability", r.billability),
                ("allocation_percentage", r.allocation_percentage),
                ("designation", r.designation),
                ("grade", r.grade),
            ):
                if not existing[field] and value:
                    existing[field] = str(value).strip()

    projects = []
    for stint in stints.values():
        months = sorted(stint.pop("_months"))
        stint["first_seen_month"] = months[0].strftime("%Y-%m") if months else None
        stint["last_seen_month"] = months[-1].strftime("%Y-%m") if months else None
        projects.append(stint)

    # Newest start first. For equal starts, ongoing assignments come first,
    # followed by the latest end date and latest observed month.
    def _sort_key(p):
        start = _parse_loose_date(p["start_date"])
        end = _parse_loose_date(p["end_date"])
        return (
            start or date.min,
            bool(p.get("is_current") or not p.get("end_date")),
            end or date.max,
            p.get("last_seen_month") or "",
        )

    projects.sort(key=_sort_key, reverse=True)
    return {
        "employee_id": employee_id,
        "employee": employee,
        "as_of": latest_month.strftime("%Y-%m") if latest_month else None,
        "current_alignments": current_alignments,
        "projects": projects,
        "promotions": promotions,
    }


@router.get("/matches/{position_id}")
def get_matches_for_position(position_id: str, db: Session = Depends(get_db)):
    """Ranked bench-resource matches for a single open position."""
    open_reqs = _latest_requisitions(db, status="Open")
    pos_row = next((r for r in open_reqs if r.job_req_id == position_id), None)
    if not pos_row:
        raise HTTPException(404, "Position not found in latest snapshot")

    position = extract_positions([pos_row])[0]
    resources = build_bench_resources(_latest_msd(db), _latest_bench_ids(db))

    matches = []
    for res in resources:
        if not same_shore(position["location"], res["location"]):
            continue
        ms = get_match_score(position["skills"], res["skills"])
        matches.append({
            "resource": res,
            "score": ms["score"],
            "matched": ms["matched"],
            "total": ms["total"],
            "grade_compatible": is_grade_match(position["grade"], res["grade"]),
        })
    matches.sort(key=lambda m: (m["score"], m["grade_compatible"]), reverse=True)
    return {"position": position, "matches": matches}


@router.get("/all-matches")
def get_all_matches(min_score: int = 40, db: Session = Depends(get_db)):
    """Bulk endpoint — every open position with all bench matches above min_score."""
    positions = extract_positions(_latest_requisitions(db, status="Open"))
    resources = build_bench_resources(_latest_msd(db), _latest_bench_ids(db))

    out = []
    for position in positions:
        matches = []
        for res in resources:
            if not same_shore(position["location"], res["location"]):
                continue
            ms = get_match_score(position["skills"], res["skills"])
            if ms["score"] < min_score:
                continue
            matches.append({
                "resource_id": res["id"],
                "resource_name": res["name"],
                "score": ms["score"],
                "matched": ms["matched"],
                "total": ms["total"],
                "grade_compatible": is_grade_match(position["grade"], res["grade"]),
            })
        matches.sort(key=lambda m: m["score"], reverse=True)
        out.append({"position": position, "matches": matches})
    return out
