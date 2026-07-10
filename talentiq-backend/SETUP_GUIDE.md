# TalentIQ Backend — Setup Guide (v2 with date-based snapshots)

> **What's new in v2:** every upload is now tagged with the period it covers — TA gets an exact **date**, MSD gets a **month**, Bench gets an ISO **week**. The backend **accumulates** all uploads (full history is preserved). The frontend **only shows the latest snapshot** of each. Re-uploading the same period is rejected with an error.

---

## Quick setup with the installer (recommended)

If you received this project to run it locally, you don't have to follow every phase
below by hand. Two scripts in the **top-level `TalentIQ` folder** (the one that contains
both `talentiq-backend` and `talentiq-deliver`) do the setup for you:

1. **Install the prerequisites once** — Python 3.11+, PostgreSQL 16, and Node.js LTS.
   See **Phase 1** below for download links. During the PostgreSQL install, **write down
   the password you set for the `postgres` user** — the installer will ask for it.
2. **Double-click `setup.bat`.** It asks for your PostgreSQL username and password, tests
   the connection, creates the `talentiq` database if it doesn't exist yet, and writes a
   working `DATABASE_URL` into `talentiq-backend\.env`. It then (optionally) stores your
   `OPENAI_API_KEY` (backend) and `ANTHROPIC_API_KEY` (frontend) — just press **Enter** to
   skip either one and keep whatever is already there.
3. **Double-click `start.bat`.** It builds the Python virtual environment, installs the
   backend + frontend dependencies the first time, and opens the app at
   http://localhost:5173.

That's the whole setup. The detailed phases below are the manual walkthrough — use them if
you'd rather configure things yourself, or if the installer reports a problem you need to
dig into.

> **Re-running `setup.bat` is safe.** It keeps a one-time `.env.bak` backup of each file and
> only rewrites the specific lines it manages; every other line (CORS, model name, comments)
> is left untouched. If `psql` isn't on your machine, it still writes the `.env` and tells
> you to create the `talentiq` database yourself.

---

## What this gives you

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  React frontend             │         │  FastAPI backend             │
│  (talentiq-deliver)         │  HTTP   │  (talentiq-backend)          │
│  localhost:5173             │ ──────► │  localhost:8000              │
│                             │         │                              │
│  • Upload modal w/          │         │  POST /api/upload/ta         │
│    date / month / week      │         │  POST /api/upload/msd        │
│    pickers                  │ ◄────── │  POST /api/upload/bench      │
│  • Dashboard always shows   │  JSON   │  GET  /api/dashboard         │
│    LATEST snapshot only     │         │  GET  /api/positions         │
└─────────────────────────────┘         │  GET  /api/bench-resources   │
                                        │  GET  /api/matches/{id}      │
                                        │  GET  /api/data-status       │
                                        └──────────────┬───────────────┘
                                                       │
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │  PostgreSQL                  │
                                        │                              │
                                        │  requisitions                │
                                        │   ▸ requisition_file_date    │
                                        │  msd_allocations             │
                                        │   ▸ allocation_month         │
                                        │  bench_employee_ids          │
                                        │   ▸ bench_week_date          │
                                        │                              │
                                        │  All historical snapshots    │
                                        │  accumulate. Reads filter to │
                                        │  MAX(date) per table.        │
                                        └──────────────────────────────┘
```

---

## What's in the starter pack

```
talentiq-backend/
├── app/
│   ├── main.py             ← FastAPI app + CORS + routers
│   ├── database.py         ← PostgreSQL connection
│   ├── models.py           ← Tables WITH date columns (new in v2)
│   ├── schemas.py          ← Response shapes
│   ├── processors.py       ← Python port of dataProcessor.js
│   └── routers/
│       ├── upload.py       ← Date-validated, accumulating uploads (new in v2)
│       ├── dashboard.py    ← Filters to MAX(requisition_file_date) (new in v2)
│       └── mapping.py      ← Filters to MAX of each period (new in v2)
├── frontend-updates/       ← Drop-in replacements for your React app
│   ├── UploadModal.jsx     ← Date/month/week pickers + error UI
│   ├── api.js              ← NEW file you'll add to src/
│   └── App.jsx             ← Loads from API, refreshes after upload
├── scripts/
│   ├── test_processors.py  ← Pure-logic tests (no DB)
│   ├── test_endpoints.py   ← End-to-end tests w/ in-memory SQLite
│   └── smoke_test.py       ← Hits live endpoints
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## Phase 1 — Install prerequisites (skip if you've done this)

You need **Python 3.11+**, **PostgreSQL 16**, and **VS Code** with the **Python** + **PostgreSQL** extensions.

### Python

Check first:
```bash
python --version
```

**Windows:** download from https://www.python.org/downloads/ — during install, **check "Add Python to PATH"**.

**Mac:**
```bash
brew install python@3.12
```

### PostgreSQL 16

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Install. **Write down the postgres superuser password.**
3. Components: PostgreSQL Server, pgAdmin 4, Command Line Tools.
4. Port: 5432.

**Mac:**
```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### VS Code extensions

In VS Code's Extensions panel (`Ctrl+Shift+X`):

- **Python** (Microsoft)
- **PostgreSQL** (Chris Kolkman) — query DB inside VS Code

---

## Phase 2 — Lay out the project folder

```bash
# Windows
mkdir C:\Users\YOU\projects\talentiq
cd C:\Users\YOU\projects\talentiq

# Mac/Linux
mkdir -p ~/projects/talentiq && cd ~/projects/talentiq
```

Drop your existing `talentiq-deliver` folder here, and unzip this `talentiq-backend.zip` next to it. End state:

```
talentiq/
├── talentiq-deliver/   ← your existing React frontend
└── talentiq-backend/   ← unzipped from this pack
```

Open the backend in VS Code:
```bash
cd talentiq-backend
code .
```

---

## Phase 3 — Python virtual environment

In VS Code's terminal (`` Ctrl+` ``):

```bash
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

# Windows cmd
.venv\Scripts\activate.bat

# Mac/Linux
source .venv/bin/activate
```

Your prompt should now start with `(.venv)`.

> **Windows PowerShell error** "running scripts is disabled"? Run once:
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

Install dependencies:
```bash
pip install -r requirements.txt
```

---

## Phase 4 — Set up PostgreSQL

### 4.1 Open psql

**Windows:** Start menu → "SQL Shell (psql)" → press Enter for Server/Database/Port/Username defaults → enter the postgres superuser password you set during install.

**Mac/Linux:**
```bash
psql postgres
```

### 4.2 Create the database & user

In the psql prompt, paste these one at a time:

```sql
CREATE DATABASE talentiq;
CREATE USER talentiq_user WITH PASSWORD 'pick_a_strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE talentiq TO talentiq_user;
ALTER DATABASE talentiq OWNER TO talentiq_user;
```

**Replace** `pick_a_strong_password_here` with a real password and write it down. Type `\q` to exit.

> **If you set up the previous v1 starter and want to clean up old tables**, connect with `psql -U talentiq_user -d talentiq -h localhost` and run:
> ```sql
> DROP TABLE IF EXISTS requisitions, msd_allocations, bench_employee_ids CASCADE;
> ```
> Uvicorn will recreate them with the new date columns on next start.

### 4.3 Create the `.env` file

In VS Code, copy `.env.example` to `.env`. Open `.env` and replace `CHANGE_ME` with the password from step 4.2:

```env
DATABASE_URL=postgresql://talentiq_user:YOUR_REAL_PASSWORD@localhost:5432/talentiq
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

---

## Phase 5 — Run the backend

```bash
uvicorn app.main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

The first run **automatically creates** the three tables. Open the auto-generated docs:

**http://localhost:8000/docs**

---

## Phase 6 — Test the API yourself before touching the frontend

This is the most important step. Get the backend solid first.

### 6.1 Run the built-in tests

In a second terminal (with venv active):

```bash
python -m scripts.test_processors    # tests the data-transformation logic
python -m scripts.test_endpoints     # full upload→duplicate→read flow
```

Both should end with "All ... tests passed ✓". If they fail, your install has an issue — fix that before continuing.

### 6.2 Upload your real Excel files via the docs UI

On http://localhost:8000/docs:

1. Expand **`POST /api/upload/ta`** → **Try it out**
2. Set `file_date` to e.g. `2024-03-15` (the date the file represents)
3. Pick your `TA_Upload_Data_-_Active.xlsx`
4. Execute → you should get `{"rows_inserted": ..., "period": "2024-03-15"}`

5. Expand **`POST /api/upload/bench`** → set `file_week` to e.g. `2024-W11`, pick `Employee_List.xlsx`, execute.

6. Expand **`POST /api/upload/msd`** → set `file_month` to e.g. `2024-03`, pick `MSD_Allocation_Dummy.xlsx`, execute.

### 6.3 Try the duplicate-detection guardrail

Re-upload the same TA file with `file_date=2024-03-15` again. You should get **HTTP 409**:
```json
{"detail": "A requisition file dated 2024-03-15 already exists. Each date can only be uploaded once."}
```

Pick a different date and it'll succeed — and the backend will now hold **both** snapshots.

### 6.4 Confirm the dashboard reads only the latest

`GET /api/dashboard` returns the latest snapshot, with an `as_of` field telling you which date it's reading from. Try `GET /api/data-status` to see all the periods that are loaded.

---

## Phase 7 — Wire the React frontend to the backend

Now that the backend is solid, we point the frontend at it.

### 7.1 Copy the three new/updated files

From `talentiq-backend/frontend-updates/` into your React app:

| Source                                          | Destination                                          |
|-------------------------------------------------|------------------------------------------------------|
| `frontend-updates/api.js`                       | `talentiq-deliver/src/api.js` *(new file)*           |
| `frontend-updates/UploadModal.jsx`              | `talentiq-deliver/src/components/UploadModal.jsx` *(replaces)* |
| `frontend-updates/App.jsx`                      | `talentiq-deliver/src/App.jsx` *(replaces)*          |

The `dataProcessor.js`, `pages/`, and other files stay as they are — only the upload + data-loading layer moves to the API.

### 7.2 Run both apps

**Terminal 1 — backend** (in `talentiq-backend/`):
```bash
.venv\Scripts\Activate.ps1   # Windows; or: source .venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 2 — frontend** (in `talentiq-deliver/`):
```bash
npm install        # only the first time
npm run dev
```

Open **http://localhost:5173** in your browser.

### 7.3 What you'll see

- The dashboard loads automatically from the backend on page load — if you uploaded data in step 6.2, you'll already see it.
- Click **↑ Upload Data**. Each of the three slots now has its own period picker:
  - **TA** → exact-date picker
  - **MSD** → month picker
  - **Bench** → week picker (ISO weeks, e.g. "2024-W11")
- Upload a file with a period that's already in the DB → red error appears inline on that slot, the modal stays open, you can correct the period and retry.
- Upload with a new period → backend accumulates, frontend refreshes to show the latest.

The header shows **"Data as of YYYY-MM-DD"** — the date of the latest TA snapshot.

---

## Phase 8 — How accumulation actually works (so you can debug)

When you call `GET /api/dashboard`, the backend runs effectively:
```sql
SELECT * FROM requisitions
 WHERE requisition_file_date = (SELECT MAX(requisition_file_date) FROM requisitions);
```

You can verify accumulation directly in psql:
```sql
-- How many TA snapshots have been uploaded?
SELECT requisition_file_date, COUNT(*) AS rows
FROM requisitions
GROUP BY requisition_file_date
ORDER BY requisition_file_date DESC;

-- Same for MSD by month:
SELECT allocation_month, COUNT(*) AS rows
FROM msd_allocations
GROUP BY allocation_month
ORDER BY allocation_month DESC;

-- Same for bench by week:
SELECT bench_week_date, COUNT(*) AS rows
FROM bench_employee_ids
GROUP BY bench_week_date
ORDER BY bench_week_date DESC;
```

---

## Phase 9 — Daily workflow cheat sheet

```bash
# Backend, in talentiq-backend:
.venv\Scripts\Activate.ps1     # Windows; or: source .venv/bin/activate
uvicorn app.main:app --reload

# Frontend, in talentiq-deliver:
npm run dev
```

Upload weekly: each Monday, open the Upload modal and:
- TA → pick today's date
- MSD → only when you have a fresh month's data, pick the month
- Bench → pick this week (ISO week)

The dashboard always shows the freshest snapshot of each. Old data stays in Postgres for analytics.

---

## Troubleshooting

| Error you see | What it means | Fix |
|---|---|---|
| `uvicorn: command not found` | Venv not active | Run the activate command for your shell |
| `psycopg2.OperationalError: connection refused` | Postgres isn't running | Windows Services → start `postgresql-x64-16`. Mac: `brew services start postgresql@16` |
| `password authentication failed for user "talentiq_user"` | `.env` password ≠ what you set in psql | Re-run the `ALTER USER talentiq_user PASSWORD '...';` SQL, update `.env`, restart uvicorn |
| `409 already exists` in browser | You picked a period that's already loaded | Pick a different date/month/week, or drop that snapshot in psql first |
| CORS error in browser console | Frontend URL isn't in `CORS_ORIGINS` | Add it to `.env` exactly (`http://localhost:5173`), restart uvicorn |
| Dashboard is empty after upload | Look at uvicorn logs — check `period` in the response | `GET /api/data-status` will tell you what's loaded |
| `relation "requisitions" does not exist` | Tables weren't created | Quit uvicorn and restart it. If still failing, run `python -c "from app.database import engine, Base; from app import models; Base.metadata.create_all(bind=engine)"` |
| Want to delete a bad snapshot | psql one-liner | `DELETE FROM requisitions WHERE requisition_file_date = '2024-03-15';` (and similar for `allocation_month` / `bench_week_date`) |

---

## API reference

### Upload (multipart/form-data)

| Endpoint | Form fields | Success | Error |
|---|---|---|---|
| `POST /api/upload/ta` | `file`, `file_date=YYYY-MM-DD` | 200 + `{rows_inserted, period}` | 409 if date exists |
| `POST /api/upload/msd` | `file`, `file_month=YYYY-MM` | 200 + `{rows_inserted, period}` | 409 if month exists |
| `POST /api/upload/bench` | `file`, `file_week=YYYY-Www` | 200 + `{rows_inserted, period}` | 409 if week exists |

### Read (always returns latest snapshot only)

| Endpoint | Returns |
|---|---|
| `GET /api/dashboard` | KPIs, charts, heatmap from latest TA snapshot. Includes `as_of` field |
| `GET /api/positions` | Open positions from latest TA snapshot |
| `GET /api/bench-resources` | Bench employees: latest MSD month ∩ latest bench week |
| `GET /api/matches/{position_id}` | Ranked matches for one position |
| `GET /api/all-matches?min_score=40` | Bulk: all positions with their candidates |
| `GET /api/data-status` | Which periods are loaded in each table |

You're all set. The backend accumulates history, the frontend stays focused on the now.
