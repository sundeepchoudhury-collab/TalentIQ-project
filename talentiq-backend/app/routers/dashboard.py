"""
app/routers/dashboard.py
─────────────────────────────────────────────────────────────
GET /api/dashboard
GET /api/data-status

The dashboard ALWAYS reads only the most recent
requisition_file_date — the backend may hold many historical
snapshots, but the frontend always sees the latest one.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Requisition, MsdAllocation, BenchEmployeeId
from app.processors import process_dashboard

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    # Find the latest date we have requisition data for
    latest = db.query(func.max(Requisition.requisition_file_date)).scalar()
    if latest is None:
        # No data yet — return empty shell so the frontend renders gracefully
        return process_dashboard([])

    rows = db.query(Requisition).filter(
        Requisition.requisition_file_date == latest
    ).all()
    result = process_dashboard(rows)
    result["as_of"] = latest.isoformat()  # so the UI can show "data as of YYYY-MM-DD"
    return result


@router.get("/data-status")
def get_data_status(db: Session = Depends(get_db)):
    """
    Tells the frontend (and operators) which periods are loaded
    in each table — useful for the upload modal so users can see
    what's already been uploaded BEFORE picking a date.
    """
    def summarize(model, date_col, period_formatter):
        latest = db.query(func.max(date_col)).scalar()
        last_updated = db.query(func.max(model.uploaded_at)).scalar()
        all_dates = [r[0] for r in db.query(date_col).distinct().order_by(date_col.desc()).all()]
        row_count = db.query(model).count()
        return {
            "latest": period_formatter(latest) if latest else None,
            "all_periods": [period_formatter(d) for d in all_dates],
            "row_count": row_count,
            "last_updated_at": last_updated.isoformat() if last_updated else None,
        }

    return {
        "requisitions": summarize(
            Requisition, Requisition.requisition_file_date,
            lambda d: d.isoformat(),
        ),
        "msd_allocations": summarize(
            MsdAllocation, MsdAllocation.allocation_month,
            lambda d: d.strftime("%Y-%m"),
        ),
        "bench_employee_ids": summarize(
            BenchEmployeeId, BenchEmployeeId.bench_week_date,
            lambda d: f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}",
        ),
    }
