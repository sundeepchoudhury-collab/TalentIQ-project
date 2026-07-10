# TalentIQ Backend (v0.2 — date-based snapshots)

FastAPI + PostgreSQL backend for the TalentIQ recruitment intelligence platform.

**👉 Start with [SETUP_GUIDE.md](./SETUP_GUIDE.md).** It walks you through everything.

## What's new in v0.2

- Each upload is tagged with a date / month / week
- Backend **accumulates** — every snapshot is preserved
- Frontend reads only the **latest** snapshot of each
- Re-uploading the same period → 409 error
- New `GET /api/data-status` for visibility into loaded periods

## Quick reference

```bash
# activate venv & run
.venv\Scripts\Activate.ps1     # Windows
source .venv/bin/activate      # Mac/Linux
uvicorn app.main:app --reload

# tests
python -m scripts.test_processors  # logic only, no DB needed
python -m scripts.test_endpoints   # full upload→read with in-memory DB
python -m scripts.smoke_test       # hits LIVE endpoints
```

API docs at **http://localhost:8000/docs**

## Frontend integration

After running the backend, copy three files from `frontend-updates/` into your React app:

| Source | Destination |
|---|---|
| `frontend-updates/api.js` | `talentiq-deliver/src/api.js` (new) |
| `frontend-updates/UploadModal.jsx` | `talentiq-deliver/src/components/UploadModal.jsx` |
| `frontend-updates/App.jsx` | `talentiq-deliver/src/App.jsx` |

Run frontend with `npm run dev` in the `talentiq-deliver` folder.
