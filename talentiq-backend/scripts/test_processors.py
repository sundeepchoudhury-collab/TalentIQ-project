"""Validates processors.py logic against synthetic data."""
import os
os.environ["DATABASE_URL"] = "postgresql://x:y@localhost:5432/x"
from datetime import date

# Import without triggering create_all
from app import processors as P

# parse_skills
assert P.parse_skills("Python, Java; Spark+SQL") == ["Python", "Java", "Spark", "SQL"]
assert P.parse_skills("NA, -, x, ") == []  # noise filtered
print("✓ parse_skills")

# get_match_score
r = P.get_match_score(["Python", "Spark", "AWS"], ["python", "PySpark", "Azure"])
assert r["score"] == 67, r           # Python exact, Spark via PySpark substring
assert sorted(r["matched"]) == ["Python", "Spark"]
print("✓ get_match_score")

# grade
assert P.grade_rank("3A") == 4
assert P.is_grade_match("3A", "4A") is True
assert P.is_grade_match("3A", "6B") is False
print("✓ grade logic")

# shore
assert P.is_offshore("IN") and not P.is_onshore("IN")
assert P.is_onshore("US") and not P.is_offshore("US")
assert P.get_shore_from_label("Onshore-NA") == "Onshore"
print("✓ shore logic")

# aging buckets
assert P.aging_bucket(5, "") == "1–30 d"
assert P.aging_bucket(95, "") == "91+ d"
assert P.aging_bucket(50, "Pre-Approved") == "Pre-appr."
print("✓ aging buckets")

assert P._business_days_between(date(2024, 1, 1), date(2024, 2, 8)) == 29
assert 375 * 8 == 3000
assert P._business_days_between(date(2024, 1, 1), date(2024, 2, 8)) * (375 * 8) == 87000
print("leakage math ok")

# Full dashboard pipeline
fake_reqs = [
    {"job_req_id": "R1", "client_name": "Acme",  "status": "Open",    "country": "IN", "age": 5,
     "requisition_status": "", "job_title": "DE", "primary_skill_1": "Python, Spark",
     "l3_skills": "AWS", "grade": "3A", "lob": "Data", "vertical": "BFS", "criticality": "High",
     "customer_name": "U.S. Bank", "billing_rate": 340, "job_start_date": "2024-01-01", "todays_date": "2024-02-08"},
    {"job_req_id": "R2", "client_name": "Acme",  "status": "Offered", "country": "US", "age": 45,
     "requisition_status": "", "job_title": "DE", "primary_skill_1": "Java",
     "l3_skills": "", "grade": "4A", "lob": "Data", "vertical": "BFS", "criticality": "",
     "customer_name": "U.S. Bank", "billing_rate": 35, "job_start_date": "2024-01-01", "todays_date": "2024-02-08"},
    {"job_req_id": "R3", "client_name": "Globex", "status": "Open",   "country": "IN", "age": 95,
     "requisition_status": "", "job_title": "DS", "primary_skill_1": "ML",
     "l3_skills": "", "grade": "5A", "lob": "AI",   "vertical": "Health", "criticality": "",
     "customer_name": "Genentech", "billing_rate": 100, "job_start_date": "2024-01-01", "todays_date": "2024-02-08"},
]
d = P.process_dashboard(fake_reqs)
assert d["kpis"]["totalActive"] == 3
assert d["kpis"]["open"] == 2
assert d["kpis"]["offered"] == 1
assert d["kpis"]["newReqs"] == 1
assert d["kpis"]["offOpen"] == 2 and d["kpis"]["onOpen"] == 0
assert len(d["clientBar"]) == 2
assert d["agingPipeline"][0]["bucket"] == "Pre-appr."
assert "donut" not in d
assert d["leakage"][0]["name"] == "U.S. Bank"
assert d["leakage"][0]["dailyLeakage"] == 3000
assert d["leakage"][0]["totalLeakage"] == 87000
print("✓ process_dashboard:", d["kpis"])

# Missing Today's Date must fall back to the uploaded snapshot date, not the
# computer's current date. Future-to-snapshot requisitions contribute nothing.
snapshot_leakage = P.process_dashboard([
    {
        "status": "Open", "customer_name": "Snapshot Client",
        "billing_rate": 100, "job_start_date": "2024-02-08",
        "todays_date": "", "requisition_file_date": "2024-02-08",
    },
    {
        "status": "Open", "customer_name": "Future Client",
        "billing_rate": 200, "job_start_date": "2024-02-09",
        "todays_date": "", "requisition_file_date": "2024-02-08",
    },
])
by_customer = {row["name"]: row for row in snapshot_leakage["leakage"]}
assert by_customer["Snapshot Client"]["dailyLeakage"] == 800
assert by_customer["Snapshot Client"]["totalLeakage"] == 800
assert by_customer["Future Client"]["dailyLeakage"] == 0
assert by_customer["Future Client"]["totalLeakage"] == 0
print("leakage calculations are anchored to the TA snapshot date")

# extract_positions
positions = P.extract_positions(fake_reqs)
assert len(positions) == 2  # only Open
assert "Python" in positions[0]["skills"]
print("✓ extract_positions →", len(positions), "open positions")

# bench resources
fake_msd = [
    {"employee_id": "E1", "name": "Alice", "grade": "3A",
     "designation": "DE", "onshore_offshore_label": "Offshore", "work_location": "Mumbai",
     "division": "Data", "lob": "Data", "vertical": "BFS",
     "skillsets": "Python, Spark", "l3_skill_family": "Big Data", "l4_sub_skill": "PySpark",
     "bench_ageing_days": 60, "project_name": "Bench Pool", "allocation_start_date": None},
    {"employee_id": "E2", "name": "Bob", "grade": "4A",
     "designation": "DE", "onshore_offshore_label": "Onshore", "work_location": "NYC",
     "division": "Data", "lob": "Data", "vertical": "BFS",
     "skillsets": "Java, AWS", "l3_skill_family": "Cloud", "l4_sub_skill": "EC2",
     "bench_ageing_days": 30, "project_name": "Bench Holding", "allocation_start_date": None},
    {"employee_id": "E3", "name": "Eve", "grade": "5A",
     "designation": "ML", "onshore_offshore_label": "Offshore", "work_location": "BLR",
     "division": "AI", "lob": "AI", "vertical": "Health",
     "skillsets": "Python, ML", "l3_skill_family": "AI", "l4_sub_skill": "TensorFlow",
     "bench_ageing_days": 10, "project_name": "Active", "allocation_start_date": None},
]
bench_ids = ["E1", "E2"]   # E3 is allocated, should be skipped
resources = P.build_bench_resources(fake_msd, bench_ids)
assert len(resources) == 2
assert resources[0]["benchDays"] == 60
print("✓ build_bench_resources →", len(resources), "bench resources")

# match scoring
ms = P.get_match_score(positions[0]["skills"], resources[0]["skills"])
print(f"✓ Position {positions[0]['id']} vs {resources[0]['name']}: {ms['score']}% ({ms['matched']})")

print("\nAll processor tests passed ✓")
