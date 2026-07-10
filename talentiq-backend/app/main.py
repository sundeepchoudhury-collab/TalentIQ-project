"""
app/main.py
─────────────────────────────────────────────────────────────
FastAPI application entrypoint.

Run from the project root with:
    uvicorn app.main:app --reload

Then open:
    http://localhost:8000/docs   ← interactive API docs
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db_init import initialize_database
from app.routers import upload, dashboard, mapping, ai_matching

# Create tables on startup. Safe to re-run; only creates missing ones.
# (For production, switch to Alembic migrations.)
initialize_database()

app = FastAPI(title="TalentIQ API", version="0.2.0")

# CORS — allow the React dev server to call us
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(dashboard.router)
app.include_router(mapping.router)
app.include_router(ai_matching.router)


@app.get("/")
def root():
    return {
        "service": "TalentIQ API",
        "version": "0.2.0",
        "docs": "/docs",
        "endpoints": [
            "POST /api/upload/ta         (form: file, file_date=YYYY-MM-DD)",
            "POST /api/upload/msd        (form: file, file_month=YYYY-MM)",
            "POST /api/upload/bench      (form: file, file_week=YYYY-Www)",
            "GET  /api/data-status       (which periods are loaded)",
            "GET  /api/dashboard         (latest TA snapshot)",
            "GET  /api/positions         (latest open positions)",
            "GET  /api/bench-resources   (latest MSD ∩ bench week)",
            "GET  /api/matches/{position_id}",
            "GET  /api/all-matches?min_score=40",
            "POST /api/ai/resource-matches",
        ],
    }


@app.get("/health")
def health():
    return {"status": "ok"}
