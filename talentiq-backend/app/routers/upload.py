"""
app/routers/upload.py
─────────────────────────────────────────────────────────────
Three upload endpoints. Each one now also supports:
  • A "replace" flag — if true, existing rows for that period
    are DELETED first, then new rows inserted (atomic).
  • TA endpoint additionally filters rows: only Status in
    (Open, Offered) are kept, and only the LOBs the user
    selected from the frontend.

Form fields:
  • TA      → file, file_date=YYYY-MM-DD,  [replace=true|false],  [lobs=A,B,C]
  • MSD     → file, file_month=YYYY-MM,    [replace=true|false]
  • Bench   → file, file_week=YYYY-Www,    [replace=true|false]
"""

import io
from datetime import date
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
import pandas as pd

from app.database import get_db
from app.models import Requisition, MsdAllocation, BenchEmployeeId
from app.schemas import UploadResponse

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_STATUSES = {"Open", "Offered"}


# ── date parsers ────────────────────────────────────────────
def _parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s.strip())
    except (ValueError, AttributeError):
        raise HTTPException(400, f"Invalid date '{s}'. Expected format YYYY-MM-DD.")


def _parse_month(s: str) -> date:
    try:
        s = s.strip()
        return date(int(s[:4]), int(s[5:7]), 1)
    except (ValueError, IndexError):
        raise HTTPException(400, f"Invalid month '{s}'. Expected format YYYY-MM.")


def _parse_iso_week(s: str) -> date:
    try:
        s = s.strip().upper()
        year, week_part = s.split("-W")
        return date.fromisocalendar(int(year), int(week_part), 1)
    except (ValueError, AttributeError):
        raise HTTPException(400, f"Invalid week '{s}'. Expected format YYYY-Www e.g. 2024-W12.")


# ── helpers ─────────────────────────────────────────────────
def _norm_header(value) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _read_excel(
    upload: UploadFile,
    sheet_hint: str | None = None,
    required_header_groups: tuple[tuple[str, ...], ...] | None = None,
) -> pd.DataFrame:
    try:
        content = upload.file.read()
        if upload.filename.lower().endswith(".csv"):
            return pd.read_csv(io.BytesIO(content))
        xls = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
        sheets = xls.sheet_names
        if required_header_groups:
            normalized_groups = [
                {_norm_header(alias) for alias in group}
                for group in required_header_groups
            ]
            for sheet in sheets:
                preview = pd.read_excel(
                    xls, sheet_name=sheet, header=None, nrows=20
                )
                for row_index, row in preview.iterrows():
                    headers = {
                        _norm_header(value)
                        for value in row.tolist()
                        if pd.notna(value) and str(value).strip()
                    }
                    if all(headers.intersection(group) for group in normalized_groups):
                        return pd.read_excel(
                            xls, sheet_name=sheet, header=row_index
                        )
        if sheet_hint:
            for s in sheets:
                if sheet_hint.lower() in s.lower():
                    return pd.read_excel(xls, sheet_name=s)
        for s in sheets:
            if "lookup" not in s.lower():
                return pd.read_excel(xls, sheet_name=s)
        return pd.read_excel(xls, sheet_name=sheets[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")


def _pick(row: dict, *candidates: str) -> str:
    for c in candidates:
        if c in row and pd.notna(row[c]) and str(row[c]).strip() != "":
            return str(row[c]).strip()
    norm = {_norm_header(k): k for k in row.keys()}
    for c in candidates:
        target = _norm_header(c)
        if target in norm:
            v = row[norm[target]]
            if pd.notna(v) and str(v).strip() != "":
                return str(v).strip()
    return ""


def _to_int(s: str) -> int | None:
    try:
        return int(float(s)) if s != "" else None
    except (TypeError, ValueError):
        return None


def _to_float(s: str) -> float | None:
    if s is None:
        return None
    text = str(s).strip()
    if not text:
        return None
    text = text.replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _to_percentage(s: str) -> float | None:
    """Normalize allocation values to percentage points (e.g. 0.5 -> 50)."""
    if s is None:
        return None
    text = str(s).strip()
    if not text:
        return None
    had_percent_sign = text.endswith("%")
    if had_percent_sign:
        text = text[:-1].strip()
    try:
        value = float(text.replace(",", ""))
    except (TypeError, ValueError):
        return None
    if not had_percent_sign and 0 < value <= 1:
        value *= 100
    return value


def _parse_lobs(lobs_str: str) -> set[str] | None:
    """Comma-separated string → set, or None if empty (= no LOB filter)."""
    if not lobs_str or not lobs_str.strip():
        return None
    return {l.strip() for l in lobs_str.split(",") if l.strip()}


# ── 1. TA Data — filter by Status + LOBs ────────────────────
@router.post("/ta", response_model=UploadResponse)
def upload_ta(
    file: UploadFile = File(...),
    file_date: str = Form(..., description="Exact file date, format YYYY-MM-DD"),
    replace: bool = Form(False, description="If true, delete existing rows for this date before inserting"),
    lobs: str = Form("", description="Comma-separated LOBs to KEEP. Empty = keep all LOBs."),
    db: Session = Depends(get_db),
):
    parsed = _parse_date(file_date)
    selected_lobs = _parse_lobs(lobs)

    # Duplicate handling
    existing_count = db.query(Requisition.id).filter(
        Requisition.requisition_file_date == parsed
    ).count()

    if existing_count > 0 and not replace:
        raise HTTPException(
            status_code=409,
            detail=f"A requisition file dated {parsed.isoformat()} already exists "
                   f"({existing_count} rows). Re-upload with replace=true to overwrite.",
        )

    deleted = 0
    if existing_count > 0 and replace:
        deleted = db.query(Requisition).filter(
            Requisition.requisition_file_date == parsed
        ).delete()
        db.flush()

    # Parse and filter rows
    df = _read_excel(
        file,
        sheet_hint="req",
        required_header_groups=(
            ("Job_Req_ID", "Job Req ID", "Requisition ID", "Req ID"),
            ("Status", "Req Status"),
            ("LOB", "Line of Business"),
        ),
    )
    rows = df.to_dict(orient="records")

    skipped_status = 0
    skipped_lob = 0
    objs = []
    for r in rows:
        status = _pick(r, "Status")
        if status not in ALLOWED_STATUSES:
            skipped_status += 1
            continue
        row_lob = _pick(r, "LOB")
        if selected_lobs is not None and row_lob not in selected_lobs:
            skipped_lob += 1
            continue
        objs.append(Requisition(
            requisition_file_date=parsed,
            job_req_id=_pick(r, "Job_Req_ID"),
            client_name=_pick(r, "Client_Name"),
            customer_name=_pick(r, "Customer_Name"),
            project_name=_pick(r, "Project_Name"),
            status=status,
            country=_pick(r, "Country").upper(),
            age=_to_int(_pick(r, "Age")),
            requisition_status=_pick(r, "Requisition_Status"),
            job_title=_pick(r, "Job_Title"),
            job_start_date=_pick(r, "Job_Start_Date", "Job Start Date", "Start Date") or None,
            todays_date=_pick(r, "Today's date", "Todays date", "Today date", "Today") or None,
            billing_rate=_to_float(_pick(r, "Billing_Rate", "Billing Rate", "Bill Rate", "Rate")),
            primary_skill_1=_pick(r, "Primary_Skill_1"),
            l3_skills=_pick(r, "L3_Skills"),
            grade=_pick(r, "Grade"),
            lob=row_lob,
            vertical=_pick(r, "Vertical"),
            criticality=_pick(r, "Criticality"),
        ))

    db.bulk_save_objects(objs)
    db.commit()

    parts = [f"{len(objs)} rows inserted for {parsed.isoformat()}"]
    if deleted:
        parts.append(f"{deleted} replaced")
    if skipped_status:
        parts.append(f"{skipped_status} skipped (Status≠Open/Offered)")
    if skipped_lob:
        parts.append(f"{skipped_lob} skipped (LOB not selected)")

    return UploadResponse(
        rows_inserted=len(objs),
        message=" · ".join(parts),
        period=parsed.isoformat(),
    )


# ── 2. MSD Allocation — month + replace ─────────────────────
@router.post("/msd", response_model=UploadResponse)
def upload_msd(
    file: UploadFile = File(...),
    file_month: str = Form(..., description="Allocation month, format YYYY-MM"),
    replace: bool = Form(False),
    db: Session = Depends(get_db),
):
    parsed = _parse_month(file_month)

    existing = db.query(MsdAllocation.id).filter(
        MsdAllocation.allocation_month == parsed
    ).count()
    if existing > 0 and not replace:
        raise HTTPException(
            status_code=409,
            detail=f"An allocation file for month {parsed.strftime('%B %Y')} already exists "
                   f"({existing} rows). Re-upload with replace=true to overwrite.",
        )
    deleted = 0
    if existing > 0 and replace:
        deleted = db.query(MsdAllocation).filter(
            MsdAllocation.allocation_month == parsed
        ).delete()
        db.flush()

    df = _read_excel(
        file,
        required_header_groups=(
            ("Employee Id", "Employee_Id", "EmployeeId", "Emp Id", "Emp ID"),
            ("Project Name", "Project_Name", "Project"),
        ),
    )
    rows = df.to_dict(orient="records")

    objs = []
    for r in rows:
        emp_id = _pick(r, "Employee Id", "Employee_Id", "EmployeeId", "Emp Id", "Emp ID", "ID")
        if not emp_id:
            continue
        bench_days = _to_int(_pick(
            r, "Bench Ageing(days)", "Bench_Ageing_days", "Bench Ageing",
            "Bench Aging (days)", "Bench Aging", "Bench Days",
        ))
        office_loc = _pick(
            r,
            "Office Location as per HRIS", "Office Location",
            "Work Location as per HRIS", "Work Location",
            "Location", "City",
        )
        objs.append(MsdAllocation(
            allocation_month=parsed,
            employee_id=emp_id,
            name=_pick(r, "Name", "Employee Name", "Full Name", "Resource Name", "Emp Name"),
            grade=_pick(r, "Grade as per HRIS", "Grade", "HRIS Grade", "Band"),
            designation=_pick(r, "Designation as per HRIS", "Designation", "Job Title", "Title", "Role"),
            date_of_joining=_pick(
                r, "DOJ as per HRIS", "DOJ As Per HRIS", "Date of Joining",
                "Joining Date", "Date Of Joining", "DOJ",
                "Employee Joining Date", "Hire Date",
            ) or None,
            rm=_pick(r, "RM as per HRIS", "RM", "Reporting Manager", "Manager"),
            onshore_offshore_label=_pick(r, "Onshore/Offshore", "Onshore Offshore", "Shore", "Location Type"),
            office_location=office_loc,
            work_location=office_loc,
            division=_pick(r, "Division", "BU", "Business Unit"),
            lob=_pick(r, "LOB as per HRIS", "LOB", "Line of Business"),
            vertical=_pick(r, "Project Vertical", "Vertical", "Practice"),
            customer_name=_pick(r, "Customer Name", "Customer", "Client Name", "Client"),
            resource_category=_pick(r, "Resource Category", "Category", "Resource Type"),
            skillsets=_pick(r, "Skillsets", "Skill Sets", "Skills"),
            l3_skill_family=_pick(r, "L3 (Skill Family)", "L3", "Skill Family", "Primary Skill"),
            l4_sub_skill=_pick(r, "L4 (Sub Skill)", "L4", "Sub Skill", "Secondary Skill"),
            bench_ageing_days=bench_days,
            project_name=_pick(r, "Project Name", "Project_Name", "Project"),
            allocation_start_date=_pick(r, "Allocation Start Date", "Start Date") or None,
            project_start_date=_pick(
                r, "Project Start Date", "Project_Start_Date", "Allocation Start Date",
                "Start Date", "Assignment Start Date",
            ) or None,
            project_end_date=_pick(
                r, "Project End Date", "Project_End_Date", "Allocation End Date",
                "End Date", "Assignment End Date", "Release Date", "Roll Off Date",
            ) or None,
            billability=_pick(
                r, "Billability", "Billable", "Billable/Non-Billable", "Billing Status",
                "Resource Billability", "Billable Status",
            ) or None,
            allocation_percentage=_to_percentage(_pick(
                r, "Allocation Percentage", "Allocation %", "Allocation Percent",
                "AllocationPercentage", "Allocation_Percentage", "Allocation",
                "Utilization Percentage", "Utilization %", "Utilization",
            )),
        ))
    db.bulk_save_objects(objs)
    db.commit()

    msg = f"MSD allocation for {parsed.strftime('%B %Y')} uploaded ({len(objs)} rows"
    if deleted:
        msg += f", {deleted} replaced"
    msg += ")"

    return UploadResponse(
        rows_inserted=len(objs),
        message=msg,
        period=parsed.strftime("%Y-%m"),
    )


# ── 3. Bench Employee IDs — week + replace ──────────────────
@router.post("/bench", response_model=UploadResponse)
def upload_bench(
    file: UploadFile = File(...),
    file_week: str = Form(..., description="ISO week, format YYYY-Www"),
    replace: bool = Form(False),
    db: Session = Depends(get_db),
):
    parsed = _parse_iso_week(file_week)
    iso_year, iso_week, _ = parsed.isocalendar()

    existing = db.query(BenchEmployeeId.id).filter(
        BenchEmployeeId.bench_week_date == parsed
    ).count()
    if existing > 0 and not replace:
        raise HTTPException(
            status_code=409,
            detail=f"A bench file for week {iso_year}-W{iso_week:02d} already exists "
                   f"({existing} rows). Re-upload with replace=true to overwrite.",
        )
    deleted = 0
    if existing > 0 and replace:
        deleted = db.query(BenchEmployeeId).filter(
            BenchEmployeeId.bench_week_date == parsed
        ).delete()
        db.flush()

    df = _read_excel(file)
    rows = df.to_dict(orient="records")

    seen = set()
    objs = []
    for r in rows:
        emp_id = _pick(r, "Employee Id", "Employee_Id", "EmployeeId", "Emp ID", "Emp Id", "ID", "id")
        if emp_id and emp_id not in seen and emp_id not in ("undefined", "null"):
            seen.add(emp_id)
            objs.append(BenchEmployeeId(
                bench_week_date=parsed,
                employee_id=emp_id,
                source="file_upload",
            ))
    db.bulk_save_objects(objs)
    db.commit()

    msg = f"Bench IDs for week {iso_year}-W{iso_week:02d} uploaded ({len(objs)} rows"
    if deleted:
        msg += f", {deleted} replaced"
    msg += ")"

    return UploadResponse(
        rows_inserted=len(objs),
        message=msg,
        period=f"{iso_year}-W{iso_week:02d}",
    )
