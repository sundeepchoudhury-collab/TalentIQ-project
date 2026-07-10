"""
app/processors.py
─────────────────────────────────────────────────────────────
Pure Python port of the frontend's dataProcessor.js logic.

Every function here is a 1-to-1 equivalent of the JS version,
so dashboard numbers are identical to what users saw before.

These functions take SQLAlchemy ORM rows (or plain dicts)
and produce dashboard-ready / mapping-ready Python objects.
"""

import re
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Iterable, Optional, Tuple

# ── Grade Hierarchy ───────────────────────────────────────────
GRADE_ORDER = ["A","1A","2A","2B","3A","3B","4A","4B","5A","5B","6A","6B","6C","7A","7B","8A"]


def grade_rank(g: Optional[str]) -> int:
    if g is None:
        return -1
    try:
        return GRADE_ORDER.index(str(g).strip())
    except ValueError:
        return -1


def is_grade_match(pos_grade: Optional[str], res_grade: Optional[str]) -> bool:
    p, r = grade_rank(pos_grade), grade_rank(res_grade)
    if p < 0 or r < 0:
        return True            # unknown → no penalty
    return abs(p - r) <= 2


# ── Shore Logic ──────────────────────────────────────────────
ONSHORE_COUNTRIES = {"US", "CA", "MX"}


def is_offshore(country: Optional[str]) -> bool:
    return str(country or "").upper().strip() == "IN"


def is_onshore(country: Optional[str]) -> bool:
    return str(country or "").upper().strip() in ONSHORE_COUNTRIES


def get_shore(country: Optional[str]) -> str:
    return "Offshore" if is_offshore(country) else "Onshore"


def normalize_shore_label(label: Optional[str]) -> str:
    l = str(label or "").lower()
    if "offshore" in l or l.startswith("off"):
        return "offshore"
    if "onshore" in l or l.startswith("on"):
        return "onshore"
    return ""


def same_shore(position_location: Optional[str], resource_location: Optional[str]) -> bool:
    pos_shore = normalize_shore_label(position_location)
    if not pos_shore:
        return True
    return normalize_shore_label(resource_location) == pos_shore


def get_shore_from_label(label: Optional[str]) -> str:
    shore = normalize_shore_label(label)
    if shore == "offshore":
        return "Offshore"
    if shore == "onshore":
        return "Onshore"
    return "Offshore"


# ── Aging Bucket ─────────────────────────────────────────────
def aging_bucket(age: Optional[int], req_status: Optional[str]) -> str:
    if req_status == "Pre-Approved" or age is None:
        return "Pre-appr."
    if age <= 30:
        return "1–30 d"
    if age <= 60:
        return "31–60 d"
    if age <= 90:
        return "61–90 d"
    return "91+ d"


_BUCKET_KEYS = {
    "Pre-appr.": "pre",
    "1–30 d": "d30",
    "31–60 d": "d60",
    "61–90 d": "d90",
    "91+ d":  "p90",
}
def bucket_key(bucket: str) -> str:
    return _BUCKET_KEYS.get(bucket, "p90")


# ── Skill Parsing ────────────────────────────────────────────
_SKILL_SPLIT = re.compile(r"[,;+/]")


def parse_skills(*fields: Optional[str]) -> List[str]:
    """Split on , ; + / — dedupe — drop noise like 'NA', '-', single chars."""
    seen = set()
    out = []
    for f in fields:
        if not f:
            continue
        for raw in _SKILL_SPLIT.split(str(f)):
            s = re.sub(r"\s+", " ", raw).strip()
            if not s or len(s) <= 1 or s.lower() == "na" or s == "-":
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
    return out


def _normalize_skill(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower()).strip()


def get_match_score(pos_skills: List[str], res_skills: List[str]) -> Dict[str, Any]:
    """
    Returns {"score": 0..100, "matched": [skill names], "total": int}.
    Same fuzzy logic as JS: exact + substring containment.
    """
    if not pos_skills:
        return {"score": 0, "matched": [], "total": 0}

    res_norm = {_normalize_skill(s): s for s in res_skills if s}
    matched: List[str] = []

    for ps in pos_skills:
        pn = _normalize_skill(ps)
        if not pn:
            continue
        if pn in res_norm:
            matched.append(ps)
            continue
        # partial contains either direction
        for rn in res_norm:
            if pn in rn or rn in pn:
                matched.append(ps)
                break

    return {
        "score": round((len(matched) / len(pos_skills)) * 100),
        "matched": matched,
        "total": len(pos_skills),
    }


# ── Bench Tenure ─────────────────────────────────────────────
def months_on_bench(bench_days: Optional[int]) -> int:
    if bench_days is None:
        return 0


def _parse_any_date(value) -> Optional[date]:
    text = str(value or "").strip()
    if not text:
        return None

    try:
        if text.replace(".", "", 1).isdigit():
            serial = float(text)
            if 1 < serial < 100000:
                return date(1899, 12, 30) + timedelta(days=int(serial))
    except (ValueError, OverflowError):
        pass

    head = text.split(" ")[0].split("T")[0]
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%d-%b-%Y",
        "%d-%b-%y",
        "%m/%d/%y",
        "%d/%m/%y",
    ):
        try:
            return datetime.strptime(head, fmt).date()
        except ValueError:
            continue
    return None


def _business_days_between(start: Optional[date], end: date) -> int:
    if start is None or start > end:
        return 0
    days = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            days += 1
        current += timedelta(days=1)
    return days
    try:
        return round(float(bench_days) / 30)
    except (TypeError, ValueError):
        return 0


# ═════════════════════════════════════════════════════════════
# 1. PROCESS REQUISITIONS → Dashboard
# ═════════════════════════════════════════════════════════════
def process_dashboard(reqs: Iterable) -> Dict[str, Any]:
    """
    Input: iterable of Requisition ORM rows (or dicts with same attrs).
    Output: dict matching the JS processTAData() return value.
    """
    all_rows = [_normalize_req(r) for r in reqs]

    active = [r for r in all_rows if r["status"] in ("Open", "Offered")]
    open_rows = [r for r in active if r["status"] == "Open"]
    offered_rows = [r for r in active if r["status"] == "Offered"]

    off_open = sum(1 for r in open_rows if is_offshore(r["country"]))
    on_open = sum(1 for r in open_rows if is_onshore(r["country"]))
    off_offered = sum(1 for r in offered_rows if is_offshore(r["country"]))
    on_offered = sum(1 for r in offered_rows if is_onshore(r["country"]))
    new_reqs = sum(1 for r in open_rows if r["age"] is not None and r["age"] <= 10)

    def avg(xs: List[float]) -> float:
        return round(sum(xs) / len(xs), 1) if xs else 0.0

    active_ages = [r["age"] for r in active if r["age"] is not None]
    off_ages = [r["age"] for r in active if r["age"] is not None and is_offshore(r["country"])]
    on_ages = [r["age"] for r in active if r["age"] is not None and is_onshore(r["country"])]

    kpis = {
        "totalActive": len(active),
        "open": len(open_rows),
        "offered": len(offered_rows),
        "newReqs": new_reqs,
        "avgAging": avg(active_ages),
        "offOpen": off_open,
        "onOpen": on_open,
        "offOffered": off_offered,
        "onOffered": on_offered,
        "offAging": avg(off_ages),
        "onAging": avg(on_ages),
    }

    # ── Client bar chart
    client_map: Dict[str, Dict[str, Any]] = {}
    for r in active:
        c = r["client"] or "Unknown"
        client_map.setdefault(c, {"name": c, "Open": 0, "Offered": 0})
        if r["status"] in ("Open", "Offered"):
            client_map[c][r["status"]] += 1
    client_bar = sorted(
        client_map.values(),
        key=lambda x: x["Open"] + x["Offered"],
        reverse=True,
    )

    # ── Aging pipeline + leakage
    bucket_order = ["Pre-appr.", "1–30 d", "31–60 d", "61–90 d", "91+ d"]
    bucket_colors = {
        "Pre-appr.": "#5EEAD4", "1–30 d": "#0D9488", "31–60 d": "#64748B",
        "61–90 d": "#D97706", "91+ d": "#DC2626",
    }
    bucket_counts = {b: 0 for b in bucket_order}
    for r in active:
        b = aging_bucket(r["age"], r["req_status"])
        if b in bucket_counts:
            bucket_counts[b] += 1
    aging_pipeline = [
        {"bucket": b, "value": bucket_counts[b], "color": bucket_colors[b]}
        for b in bucket_order
    ]
    leakage_map: Dict[str, Dict[str, Any]] = {}
    snapshot_dates = [
        _parse_any_date(r.get("snapshotDate"))
        for r in active
        if r.get("snapshotDate")
    ]
    # Freeze historical leakage to the uploaded TA snapshot. Using the
    # server's current date makes totals drift and can activate requisitions
    # whose start date was still in the future when the snapshot was taken.
    fallback_today = max((d for d in snapshot_dates if d), default=date.today())
    for r in active:
        customer = r["customer"] or "Unknown"
        daily = float(r["billingRate"] or 0) * 8
        start_date = _parse_any_date(r["jobStartDate"])
        as_of_date = _parse_any_date(r["todaysDate"]) or fallback_today
        business_days = _business_days_between(start_date, as_of_date)
        active_daily = daily if business_days > 0 else 0
        row = leakage_map.setdefault(
            customer,
            {"name": customer, "dailyLeakage": 0.0, "totalLeakage": 0.0},
        )
        row["dailyLeakage"] += active_daily
        row["totalLeakage"] += business_days * daily
    leakage = sorted(
        leakage_map.values(),
        key=lambda row: row["dailyLeakage"],
        reverse=True,
    )

    # ── Heatmap (client × aging-bucket × shore)
    heatmap_map: Dict[str, Dict[str, Any]] = {}
    for r in active:
        client = r["client"] or "Unknown"
        b = aging_bucket(r["age"], r["req_status"])
        shore = "Off" if is_offshore(r["country"]) else "On"
        if client not in heatmap_map:
            row = {"client": client}
            for bk in bucket_order:
                k = bucket_key(bk)
                row[f"{k}Off"] = 0
                row[f"{k}On"] = 0
                row[f"{k}T"] = 0
            heatmap_map[client] = row
        k = bucket_key(b)
        heatmap_map[client][f"{k}{shore}"] += 1
        heatmap_map[client][f"{k}T"] += 1

    heatmap = sorted(
        heatmap_map.values(),
        key=lambda r: sum(r.get(f"{k}T", 0) for k in ["pre", "d30", "d60", "d90", "p90"]),
        reverse=True,
    )

    heatmap_totals: Dict[str, int] = {}
    for k in ["pre", "d30", "d60", "d90", "p90"]:
        heatmap_totals[f"{k}Off"] = sum(r.get(f"{k}Off", 0) for r in heatmap)
        heatmap_totals[f"{k}On"] = sum(r.get(f"{k}On", 0) for r in heatmap)
        heatmap_totals[f"{k}T"] = sum(r.get(f"{k}T", 0) for r in heatmap)

    off_on_bar = [
        {"name": "Open", "Offshore": off_open, "Onshore": on_open},
        {"name": "Offered", "Offshore": off_offered, "Onshore": on_offered},
    ]
    grade_distribution = build_grade_distribution(open_rows)

    return {
        "kpis": kpis,
        "clientBar": client_bar,
        "agingPipeline": aging_pipeline,
        "leakage": leakage,
        "heatmap": heatmap,
        "heatmapTotals": heatmap_totals,
        "offOnBar": off_on_bar,
        "gradeDistribution": grade_distribution,
    }


def grade_level(grade: Optional[str]) -> Optional[str]:
    match = re.search(r"\d+", str(grade or "").strip())
    return match.group(0) if match else None


def build_grade_distribution(open_rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts: Dict[str, int] = {}
    for row in open_rows:
        level = grade_level(row.get("grade"))
        if not level:
            continue
        counts[level] = counts.get(level, 0) + 1

    total = sum(counts.values())
    palette = ["#0D9488", "#2DD4BF", "#334155", "#D97706", "#DC2626", "#64748B"]
    levels = sorted(counts.keys(), key=lambda x: int(x), reverse=True)
    return [
        {
            "label": f"Level {level}",
            "value": counts[level],
            "pct": round((counts[level] / total) * 100) if total else 0,
            "color": palette[i % len(palette)],
        }
        for i, level in enumerate(levels)
    ]


def _normalize_req(r) -> Dict[str, Any]:
    """Pull attributes whether r is an ORM row or a dict."""
    g = (lambda k: r.get(k)) if isinstance(r, dict) else (lambda k: getattr(r, k, None))
    return {
        "reqId":      g("job_req_id") or "",
        "client":     g("client_name") or "",
        "customer":   g("customer_name") or "",
        "status":     g("status") or "",
        "country":    str(g("country") or "").upper().strip(),
        "age":        g("age"),
        "req_status": g("requisition_status") or "",
        "jobTitle":   g("job_title") or "",
        "jobStartDate": g("job_start_date") or "",
        "todaysDate": g("todays_date") or "",
        "snapshotDate": g("requisition_file_date") or "",
        "billingRate": g("billing_rate"),
        "primarySkill": g("primary_skill_1") or "",
        "l3Skills":   g("l3_skills") or "",
        "grade":      g("grade") or "",
        "lob":        g("lob") or "",
        "vertical":   g("vertical") or "",
        "criticality": g("criticality") or "",
    }


# ═════════════════════════════════════════════════════════════
# 2. EXTRACT OPEN POSITIONS FOR SKILL MAPPING
# ═════════════════════════════════════════════════════════════
def extract_positions(reqs: Iterable) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in reqs:
        n = _normalize_req(r)
        if n["status"] != "Open":
            continue
        priority = n["criticality"] or (
            "High" if (n["age"] or 0) >= 60
            else "Medium" if (n["age"] or 0) >= 30
            else "Low"
        )
        out.append({
            "id":       n["reqId"],
            "client":   n["client"],
            "customer":  n["customer"],
            "role":     n["jobTitle"],
            "jobStartDate": n["jobStartDate"],
            "todaysDate": n["todaysDate"],
            "billingRate": n["billingRate"],
            "skills":   parse_skills(n["primarySkill"], n["l3Skills"]),
            "priority": priority,
            "aging":    n["age"] or 0,
            "location": get_shore(n["country"]),
            "grade":    n["grade"],
            "vertical": n["vertical"],
            "lob":      n["lob"],
        })
    return out


# ═════════════════════════════════════════════════════════════
# 3. MATCHING RESOURCES (MSD rows filtered by uploaded employee IDs)
# ═════════════════════════════════════════════════════════════
def build_bench_resources(
    msd_rows: Iterable,
    bench_ids: Iterable[str],
) -> List[Dict[str, Any]]:
    def norm_emp_id(value) -> str:
        text = str(value or "").strip().lower()
        return text[:-2] if text.endswith(".0") else text

    uploaded_ids = [str(i).strip() for i in bench_ids if str(i).strip()]
    bench_set = {norm_emp_id(i) for i in uploaded_ids}
    emp_map: Dict[str, Dict[str, Any]] = {}

    for r in msd_rows:
        g = (lambda k: r.get(k)) if isinstance(r, dict) else (lambda k: getattr(r, k, None))
        emp_id = (g("employee_id") or "").strip()
        emp_key = norm_emp_id(emp_id)
        if not emp_id or emp_key not in bench_set:
            continue

        project = g("project_name") or ""
        is_bench_proj = "bench" in project.lower()
        bd = g("bench_ageing_days")
        bench_days = int(bd) if bd not in (None, "") else None

        if emp_key not in emp_map:
            emp_map[emp_key] = {
                "id":             emp_id,
                "name":           g("name") or "",
                "grade":          g("grade") or "",
                "designation":    g("designation") or "",
                "location":       get_shore_from_label(g("onshore_offshore_label")),
                "workLocation":   g("work_location") or "",
                "division":       g("division") or "",
                "lob":            g("lob") or "",
                "vertical":       g("vertical") or "",
                "client":         g("customer_name") or "",
                "skills":         [],
                "benchDays":      bench_days,
                "benchProject":   project if is_bench_proj else None,
                "currentProject": project,
                "available":      "Uploaded Employee List",
                "resourceSource": "uploaded_employee_id",
                # carry raw fields so we can rebuild skills if needed
                "_skillsets":     g("skillsets") or "",
                "_l3":            g("l3_skill_family") or "",
                "_l4":            g("l4_sub_skill") or "",
            }

        if is_bench_proj and bench_days is not None:
            emp_map[emp_key]["benchDays"] = bench_days
            emp_map[emp_key]["benchProject"] = project

        row_skills = parse_skills(g("skillsets"), g("l4_sub_skill"), g("l3_skill_family"))
        if len(row_skills) > len(emp_map[emp_key]["skills"]):
            emp_map[emp_key]["skills"] = row_skills
            emp_map[emp_key]["currentProject"] = project or emp_map[emp_key]["currentProject"]
            emp_map[emp_key]["_skillsets"] = g("skillsets") or emp_map[emp_key]["_skillsets"]
            emp_map[emp_key]["_l3"] = g("l3_skill_family") or emp_map[emp_key]["_l3"]
            emp_map[emp_key]["_l4"] = g("l4_sub_skill") or emp_map[emp_key]["_l4"]

    out = []
    for emp_id in uploaded_ids:
        emp = emp_map.get(norm_emp_id(emp_id))
        if not emp:
            continue

        if not emp["skills"]:
            emp["skills"] = parse_skills(emp["_skillsets"], emp["_l4"], emp["_l3"])
        for k in ("_skillsets", "_l3", "_l4"):
            emp.pop(k, None)
        out.append(emp)
    return out
