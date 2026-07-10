"""
scripts/smoke_test.py
─────────────────────────────────────────────────────────────
Quick sanity-check after you upload data via the /docs UI.
Run with:  python -m scripts.smoke_test

Hits all read endpoints and prints a one-line summary of each.
"""

import urllib.request
import json

BASE = "http://localhost:8000"

def hit(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.loads(r.read())

print("→ /health           ", hit("/health"))
d = hit("/api/dashboard")
print(f"→ /api/dashboard     kpis={d['kpis']}")
print(f"                     {len(d['clientBar'])} clients in bar chart")
p = hit("/api/positions")
print(f"→ /api/positions     {len(p)} open positions")
b = hit("/api/bench-resources")
print(f"→ /api/bench         {len(b)} bench resources")
if p:
    pid = p[0]["id"]
    m = hit(f"/api/matches/{pid}")
    top = m["matches"][:3]
    print(f"→ /api/matches/{pid}  top scores: {[t['score'] for t in top]}")
