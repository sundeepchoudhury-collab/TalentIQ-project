"""
scripts/test_endpoints.py
─────────────────────────────────────────────────────────────
End-to-end test using an in-memory SQLite DB (no real Postgres
needed). Verifies:
  • Upload accepts a date and tags rows correctly
  • Duplicate-date upload returns 409
  • Reads filter to MAX(date)
  • Older snapshots stay in the DB (accumulation)

Run with:  python -m scripts.test_endpoints
"""

import os
import io
import pandas as pd

# IMPORTANT: must set DATABASE_URL BEFORE importing the app, and
# we use a single shared SQLite in-memory engine so all the
# imported modules share state.
os.environ["DATABASE_URL"] = "sqlite:///file::memory:?cache=shared&uri=true"

from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Replace the engine with a StaticPool one so every connection
# sees the same in-memory database.
from app import database as _db
_db.engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_db.SessionLocal = sessionmaker(bind=_db.engine, autoflush=False, autocommit=False)

from app.database import engine, Base, SessionLocal, get_db
from app import models  # registers tables on Base.metadata
Base.metadata.create_all(bind=engine)

from app.main import app

# Make the FastAPI app use OUR engine/session
def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
app.dependency_overrides[get_db] = _get_db

client = TestClient(app)


# ── Build tiny Excel files in memory ────────────────────────
def make_excel(rows, sheet="Sheet1"):
    df = pd.DataFrame(rows)
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as w:
        df.to_excel(w, sheet_name=sheet, index=False)
    bio.seek(0)
    return bio


# ── Test 1: TA upload, duplicate rejected, second date OK ──
ta_v1 = [{"Job_Req_ID": "R1", "Client_Name": "Acme", "Status": "Open", "Country": "IN",
          "Age": 5, "Primary_Skill_1": "Python", "L3_Skills": "AWS", "Grade": "3A",
          "LOB": "Data", "Vertical": "BFS", "Job_Title": "DE", "Criticality": "High"}]
ta_v2 = [
    {"Job_Req_ID": "R1", "Client_Name": "Acme", "Customer_Name": "U.S. Bank", "Status": "Open", "Country": "IN",
     "Age": 12, "Primary_Skill_1": "Python", "L3_Skills": "AWS", "Grade": "3A",
     "LOB": "Data", "Vertical": "BFS", "Job_Title": "DE", "Criticality": "High",
     "Job_Start_Date": "2024-01-01", "Today's date": "2024-02-08",
     "Business days past start date": 4, "Daily Leakage": 999999,
     "Daily Leakage USD": 999999, "Leakage days": 999999, "Total Leakage": 999999,
     "Billing_Rate": "$375.00"},
    {"Job_Req_ID": "R2", "Client_Name": "Globex", "Customer_Name": "Globex", "Status": "Open", "Country": "US",
     "Age": 3, "Primary_Skill_1": "Java", "L3_Skills": "", "Grade": "4A",
     "LOB": "App", "Vertical": "Tech", "Job_Title": "Eng", "Criticality": ""},
]

r = client.post("/api/upload/ta",
    data={"file_date": "2024-03-01"},
    files={"file": ("ta.xlsx", make_excel(ta_v1, "Req_Upload"), "application/vnd.ms-excel")})
assert r.status_code == 200, r.text
assert r.json()["rows_inserted"] == 1
print(f"✓ TA upload v1: {r.json()['message']}")

# Same date again → 409
r = client.post("/api/upload/ta",
    data={"file_date": "2024-03-01"},
    files={"file": ("ta.xlsx", make_excel(ta_v1, "Req_Upload"), "application/vnd.ms-excel")})
assert r.status_code == 409, r.text
assert "already exists" in r.json()["detail"]
print(f"✓ Duplicate rejected: {r.json()['detail'][:60]}…")

# New date → succeeds (accumulation)
r = client.post("/api/upload/ta",
    data={"file_date": "2024-03-08"},
    files={"file": ("ta.xlsx", make_excel(ta_v2, "Req_Upload"), "application/vnd.ms-excel")})
assert r.status_code == 200
print(f"✓ TA v2 accumulated: {r.json()['message']}")

# Dashboard shows ONLY the latest snapshot
r = client.get("/api/dashboard")
dash = r.json()
assert dash["kpis"]["totalActive"] == 2, dash["kpis"]
assert dash["as_of"] == "2024-03-08"
print(f"✓ Dashboard reads latest only: as_of={dash['as_of']}, totalActive={dash['kpis']['totalActive']}")

# Verify accumulation: 1 + 2 = 3 rows in DB across 2 distinct dates
db = SessionLocal()
total = db.query(models.Requisition).count()
distinct = db.query(models.Requisition.requisition_file_date).distinct().count()
db.close()
assert total == 3 and distinct == 2
print(f"✓ Backend accumulated: {total} rows across {distinct} dates")

db = SessionLocal()
r1 = db.query(models.Requisition).filter(
    models.Requisition.requisition_file_date == pd.Timestamp("2024-03-08").date(),
    models.Requisition.job_req_id == "R1",
).one()
db.close()
assert r1.job_start_date == "2024-01-01"
assert r1.todays_date == "2024-02-08"
assert r1.billing_rate == 375
assert not hasattr(r1, "daily_leakage")
assert "donut" not in dash
assert dash["leakage"][0]["name"] == "U.S. Bank"
assert dash["leakage"][0]["dailyLeakage"] == 3000
assert dash["leakage"][0]["totalLeakage"] == 87000

r = client.get("/api/positions")
positions = r.json()
pos_r1 = next(p for p in positions if p["id"] == "R1")
assert pos_r1["jobStartDate"] == "2024-01-01"
assert pos_r1["todaysDate"] == "2024-02-08"
assert pos_r1["billingRate"] == 375
print("✓ TA upload stores raw billing fields and computes leakage")


# ── Test 2: MSD month upload + duplicate ────────────────────
msd = [
    {"Employee Id": "E1", "Name": "Alice", "Grade as per HRIS": "3A",
     "Designation as per HRIS": "DE", "Onshore/Offshore": "Offshore",
     "Skillsets": "Python, Spark", "L3 (Skill Family)": "BD", "L4 (Sub Skill)": "PySpark",
     "Bench Ageing(days)": 60, "Project Name": "Bench Pool"},
    {"Employee Id": "E2", "Name": "Bob", "Grade as per HRIS": "4A",
     "Designation as per HRIS": "DE", "Onshore/Offshore": "Onshore",
     "Skillsets": "Java", "L3 (Skill Family)": "App", "L4 (Sub Skill)": "Spring",
     "Bench Ageing(days)": 30, "Project Name": "Bench Holding"},
]
r = client.post("/api/upload/msd",
    data={"file_month": "2024-03"},
    files={"file": ("msd.xlsx", make_excel(msd), "application/vnd.ms-excel")})
assert r.status_code == 200
print(f"✓ MSD upload: {r.json()['message']}")

r = client.post("/api/upload/msd",
    data={"file_month": "2024-03"},
    files={"file": ("msd.xlsx", make_excel(msd), "application/vnd.ms-excel")})
assert r.status_code == 409
print(f"✓ Duplicate month rejected: {r.json()['detail'][:60]}…")


# ── Test 3: Bench week upload + duplicate ──────────────────
msd_v2 = [
    {"Employee Id": "E1", "Name": "Alice", "Grade as per HRIS": "4A",
     "Designation as per HRIS": "Senior DE", "Onshore/Offshore": "Offshore",
     "DOJ as per HRIS": "",
     "Customer Name": "Acme", "Project Name": "Data Platform",
     "Project Start Date": "2023-01-01",
     "Allocation Percentage": 60, "Billability": "Billable"},
    {"Employee Id": "E1", "Name": "Alice", "Grade as per HRIS": "4A",
     "Designation as per HRIS": "Senior DE", "Onshore/Offshore": "Offshore",
     "DOJ as per HRIS": "2020-01-15",
     "Customer Name": "Internal", "Project Name": "Capability Building",
     "Project Start Date": "2024-01-01",
     "Allocation Percentage": "40%", "Billability": "NonBill"},
    {"Employee Id": "E2", "Name": "Bob", "Grade as per HRIS": "4A",
     "Designation as per HRIS": "DE", "Onshore/Offshore": "Onshore",
     "Customer Name": "Globex", "Project Name": "App Modernization",
     "Allocation Percentage": "100%", "Billability": "Billable"},
]
r = client.post("/api/upload/msd",
    data={"file_month": "2024-04"},
    files={"file": ("msd.xlsx", make_excel(msd_v2), "application/vnd.ms-excel")})
assert r.status_code == 200, r.text

r = client.get("/api/employee-history/E1")
history = r.json()
assert history["as_of"] == "2024-04"
assert len(history["current_alignments"]) == 2
assert {a["allocation_percentage"] for a in history["current_alignments"]} == {"60.0", "40.0"}
assert history["employee"]["date_of_joining"] == "2020-01-15"
assert [project["project_name"] for project in history["projects"][:2]] == [
    "Capability Building",
    "Data Platform",
]
assert history["promotions"] == [{
    "from_grade": "3A",
    "to_grade": "4A",
    "effective_month": "2024-04",
    "designation": "Senior DE",
}]
print("Employee history includes current alignments, allocation, and grade changes")

bench = [{"Employee Id": "E1"}, {"Employee Id": "E2"}]
r = client.post("/api/upload/bench",
    data={"file_week": "2024-W10"},
    files={"file": ("bench.xlsx", make_excel(bench), "application/vnd.ms-excel")})
assert r.status_code == 200
print(f"✓ Bench upload: {r.json()['message']}")

r = client.post("/api/upload/bench",
    data={"file_week": "2024-W10"},
    files={"file": ("bench.xlsx", make_excel(bench), "application/vnd.ms-excel")})
assert r.status_code == 409
print(f"✓ Duplicate week rejected: {r.json()['detail'][:60]}…")


# ── Test 4: bench-resources joins latest MSD ∩ latest bench ─
r = client.get("/api/bench-resources")
resources = r.json()
assert len(resources) == 2
assert {resource["client"] for resource in resources} == {"Acme", "Globex"}
print(f"✓ /api/bench-resources merged: {len(resources)} resources")


# Dated manual inventory + source metadata + deletion
r = client.post("/api/bench-ids/manual", json={
    "employee_ids": ["E3"],
    "effective_date": "2024-03-06",
})
assert r.status_code == 200, r.text
assert r.json()["rows_inserted"] == 1
r = client.get("/api/bench-inventory?effective_date=2024-03-06")
inventory = r.json()
assert inventory["as_of"] == "2024-03-06"
assert inventory["rows"][0]["resourceSource"] == "manual"
assert inventory["rows"][0]["effectiveDate"] == "2024-03-06"
assert inventory["rows"][0]["updatedAt"]
r = client.request("DELETE", "/api/bench-ids", json={
    "employee_ids": ["E3"],
    "effective_date": "2024-03-06",
})
assert r.status_code == 200, r.text
assert r.json()["rows_deleted"] == 1
assert all(
    row["id"] != "E3"
    for row in client.get("/api/bench-inventory").json()["rows"]
)
r = client.post("/api/bench-ids/manual", json={
    "employee_ids": ["OLD"],
    "effective_date": "2024-03-01",
})
assert r.status_code == 409
print("Bench inventory supports dated manual rows, source metadata, and deletion")

# ── Test 5: data-status reports loaded periods ─────────────
r = client.get("/api/data-status")
status = r.json()
assert status["requisitions"]["latest"] == "2024-03-08"
assert sorted(status["requisitions"]["all_periods"]) == ["2024-03-01", "2024-03-08"]
assert status["msd_allocations"]["latest"] == "2024-04"
assert status["bench_employee_ids"]["latest"] == "2024-W10"
assert status["bench_employee_ids"]["last_updated_at"]
print(f"✓ /api/data-status: TA periods loaded = {status['requisitions']['all_periods']}")


# ── Test 6: matches endpoint ───────────────────────────────
r = client.get("/api/matches/R1")
assert r.status_code == 200
m = r.json()
assert m["position"]["id"] == "R1"
assert {match["resource"]["id"] for match in m["matches"]} == {"E1"}
assert all(match["resource"]["location"] == "Offshore" for match in m["matches"])
top = m["matches"][0] if m["matches"] else None
print(f"✓ /api/matches/R1: {len(m['matches'])} candidates" +
      (f", top score = {top['score']}%" if top else ""))



r = client.get("/api/matches/R2")
assert r.status_code == 200
m = r.json()
assert m["position"]["id"] == "R2"
assert {match["resource"]["id"] for match in m["matches"]} == {"E2"}
assert all(match["resource"]["location"] == "Onshore" for match in m["matches"])

# Every active consumer must switch exclusively to the newest bench snapshot.
latest_bench = [{"Employee Id": "E2"}]
r = client.post("/api/upload/bench",
    data={"file_week": "2024-W11"},
    files={"file": ("bench.xlsx", make_excel(latest_bench), "application/vnd.ms-excel")})
assert r.status_code == 200, r.text
resources = client.get("/api/bench-resources").json()
assert {resource["id"] for resource in resources} == {"E2"}
inventory = client.get("/api/bench-inventory").json()
assert inventory["week"] == "2024-W11"
assert {resource["id"] for resource in inventory["rows"]} == {"E2"}
assert client.get("/api/matches/R1").json()["matches"] == []
assert {
    match["resource"]["id"]
    for match in client.get("/api/matches/R2").json()["matches"]
} == {"E2"}
bulk_matches = client.get("/api/all-matches?min_score=0").json()
assert all(
    match["resource_id"] != "E1"
    for position in bulk_matches
    for match in position["matches"]
)
print("All active bench counts and matching endpoints use only the latest snapshot")
print(f"✓ /api/matches/R2: {len(m['matches'])} onshore candidates only")
print("\n══════════════════════════════════════════════")
print("All integration tests passed ✓")
print("══════════════════════════════════════════════")
