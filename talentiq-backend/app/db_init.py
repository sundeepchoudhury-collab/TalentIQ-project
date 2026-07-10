"""
Database initialization helpers for TalentIQ.

The installer and the FastAPI app both call initialize_database() so a copied
folder can create or update the PostgreSQL schema before the app starts.
"""

from sqlalchemy import inspect, text

from app import models  # noqa: F401 - registers ORM tables on Base.metadata
from app.database import Base, engine


def _ensure_msd_columns():
    inspector = inspect(engine)
    if "msd_allocations" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("msd_allocations")}
    additions = [
        ("rm", "VARCHAR"),
        ("date_of_joining", "VARCHAR"),
        ("office_location", "VARCHAR"),
        ("customer_name", "VARCHAR"),
        ("resource_category", "VARCHAR"),
        ("project_start_date", "VARCHAR"),
        ("project_end_date", "VARCHAR"),
        ("billability", "VARCHAR"),
        ("allocation_percentage", "DOUBLE PRECISION"),
    ]
    with engine.begin() as conn:
        for name, sqltype in additions:
            if name not in existing:
                conn.execute(text(f'ALTER TABLE msd_allocations ADD COLUMN {name} {sqltype}'))


def _ensure_requisition_columns():
    inspector = inspect(engine)
    if "requisitions" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("requisitions")}
    additions = [
        ("job_start_date", "VARCHAR"),
        ("todays_date", "VARCHAR"),
        ("billing_rate", "DOUBLE PRECISION"),
    ]
    with engine.begin() as conn:
        for name, sqltype in additions:
            if name not in existing:
                conn.execute(text(f'ALTER TABLE requisitions ADD COLUMN {name} {sqltype}'))


def _ensure_bench_columns():
    inspector = inspect(engine)
    if "bench_employee_ids" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("bench_employee_ids")}
    with engine.begin() as conn:
        if "source" not in existing:
            conn.execute(
                text(
                    "ALTER TABLE bench_employee_ids "
                    "ADD COLUMN source VARCHAR NOT NULL DEFAULT 'file_upload'"
                )
            )
        conn.execute(
            text(
                "UPDATE bench_employee_ids SET source='file_upload' "
                "WHERE source IS NULL OR TRIM(source)=''"
            )
        )


def initialize_database():
    """Create missing tables and apply lightweight additive schema updates."""
    Base.metadata.create_all(bind=engine)
    _ensure_msd_columns()
    _ensure_requisition_columns()
    _ensure_bench_columns()
