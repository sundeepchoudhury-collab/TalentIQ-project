"""
app/models.py
─────────────────────────────────────────────────────────────
SQLAlchemy ORM models. Each class = one PostgreSQL table.

Three tables, one per Excel upload type:
  • requisitions         ← TA Data, tagged with requisition_file_date
  • msd_allocations      ← MSD Allocation, tagged with allocation_month
  • bench_employee_ids   ← Bench IDs, tagged with bench_week_date

Each upload APPENDS rows tagged with its date. Reads filter to
the MAX date so the frontend only sees the latest snapshot, but
the database keeps everything for history.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, Float, Index, UniqueConstraint, Text
from app.database import Base


class Requisition(Base):
    __tablename__ = "requisitions"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── NEW: every row tagged with the file's date ────────────
    # Multiple files for different dates accumulate; same date = duplicate.
    requisition_file_date = Column(Date, nullable=False, index=True)

    job_req_id = Column(String, index=True)
    client_name = Column(String, index=True)
    customer_name = Column(String)
    project_name = Column(String)
    status = Column(String, index=True)
    country = Column(String, index=True)
    age = Column(Integer, nullable=True)
    requisition_status = Column(String)
    job_title = Column(String)
    job_start_date = Column(String, nullable=True)
    todays_date = Column(String, nullable=True)
    billing_rate = Column(Float, nullable=True)
    primary_skill_1 = Column(String)
    l3_skills = Column(String)
    grade = Column(String)
    lob = Column(String)
    vertical = Column(String)
    criticality = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class MsdAllocation(Base):
    __tablename__ = "msd_allocations"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── NEW: stored as the FIRST DAY of the month (e.g. 2024-03-01) ──
    # User picks "March 2024" in the UI, we store 2024-03-01.
    allocation_month = Column(Date, nullable=False, index=True)

    employee_id = Column(String, index=True)
    name = Column(String)
    grade = Column(String)
    designation = Column(String)
    date_of_joining = Column(String, nullable=True)
    rm = Column(String)
    onshore_offshore_label = Column(String)
    office_location = Column(String)
    work_location = Column(String)
    division = Column(String)
    lob = Column(String)
    vertical = Column(String)
    customer_name = Column(String)
    resource_category = Column(String)
    skillsets = Column(String)
    l3_skill_family = Column(String)
    l4_sub_skill = Column(String)
    bench_ageing_days = Column(Integer, nullable=True)
    project_name = Column(String)
    allocation_start_date = Column(String, nullable=True)
    # Captured per-row from the allocation sheet so an employee's project
    # history (and current billability) can be reconstructed across months.
    project_start_date = Column(String, nullable=True)
    project_end_date = Column(String, nullable=True)
    billability = Column(String, nullable=True)
    allocation_percentage = Column(Float, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class BenchEmployeeId(Base):
    __tablename__ = "bench_employee_ids"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── NEW: stored as the MONDAY of the ISO week ──
    # User picks "2024-W12" in the UI, we store 2024-03-18 (the Monday).
    bench_week_date = Column(Date, nullable=False, index=True)

    employee_id = Column(String, index=True)
    source = Column(String, nullable=False, default="file_upload")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # An employee can appear in multiple weeks, but only once per week.
    __table_args__ = (
        UniqueConstraint("employee_id", "bench_week_date", name="uq_bench_emp_week"),
    )


# Helpful composite index for the heatmap query
Index("ix_req_client_status", Requisition.client_name, Requisition.status)


class AiMatchCache(Base):
    __tablename__ = "ai_match_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(String(64), nullable=False, unique=True, index=True)
    position_id = Column(String, index=True)
    position_signature = Column(Text, nullable=False)
    resource_signature = Column(Text, nullable=False)
    stage1_model = Column(String, nullable=False)
    stage2_model = Column(String, nullable=False)
    result_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    access_count = Column(Integer, default=1, nullable=False)
