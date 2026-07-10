# TalentIQ Changelog

All notable changes to this project are recorded here.
Format: `[YYYY-MM-DD] — <summary>` followed by bullet details.

---

## [2026-06-25] - Bench snapshot Details control removed

- Removed the `Details` / `Hide details` button and its expandable metadata panel
- Kept the compact latest snapshot date, active resource count, and update timestamp visible
- Effective-date and historical snapshot selection remains available when adding resources

---

## [2026-06-25] - Client added to Bench Resources

- Bench Resources now carries the client from the latest MSD allocation `customer_name`
- Added Client to the resource table, persistent Columns chooser, search, sorting/grouping, and
  filtered Excel export
- Added Client to the selectable `Add filter` criteria with a dropdown of unique clients in the
  Latest / Active bench snapshot
- Resources saved by employee ID without a matching MSD record retain a blank Client value
- Added backend coverage confirming client values are returned with active bench resources

---

## [2026-06-25] - Bench filters changed to selectable criteria

- Replaced the fixed four-filter layout with an `Add filter` dropdown
- Users can choose Source, Status, Shore, or Grade and then select the value for that criterion
- Selected criteria can be removed individually, while active values continue to appear as
  removable chips above the resource table
- `Clear all` now removes both the applied values and the selected filter controls
- Filters continue to apply only to the Latest / Active bench snapshot

---

## [2026-06-25] - Bench Resources controls compacted for easier scanning

- Replaced the two large snapshot and manual-entry cards with one compact latest-snapshot summary
- Moved snapshot metadata and effective-date history into a collapsible `Details` section
- Moved manual employee ID entry into a separate collapsible `Add resources` section
- Consolidated source, status, shore, and grade controls into one Filters popup with an active count
- Added removable active-filter chips while keeping search, columns, and Excel export always visible
- Replaced the full-width success banner with a temporary corner notification; validation errors
  remain visible inline
- Preserved latest-only database behavior, historical-date visibility, deletion, sorting/grouping,
  column preferences, filtered export, and the existing resource table

---

## [2026-06-25] - Latest / Active bench snapshot enforced across all functions

- Centralized active bench selection in the backend so the Bench Resources API, table inventory,
  single-position fuzzy matching, bulk matching, and all frontend KPIs consume only rows where
  `bench_week_date = MAX(bench_week_date)`
- Matching Resources, less-than-3-months, greater-than-or-equal-to-3-months, Confidence Overview,
  Resource Matches, AI candidate selection, and Excel mapping exports all share the same latest-only
  `bench` array loaded by the application
- The inventory API no longer accepts a historical date override; unique older dates remain metadata
  for the calendar popup only
- Direct API attempts to add resources to an older snapshot now return `409`, and deletion rejects
  any date other than the active latest snapshot
- Added integration coverage with two bench periods proving that resources from the older period are
  excluded from inventory, counts, single-position matches, and bulk matches after a newer snapshot
  is uploaded

---

## [2026-06-25] - Bench date popup lists every database snapshot

- Replaced the browser-native Bench update-date popup with a controlled snapshot-date panel
- The popup lists every unique effective date stored in `bench_employee_ids`, newest first
- The current `MAX(bench_week_date)` is marked `Latest / Active`; older dates are clearly marked
  `Historical`
- Historical dates remain visible for audit context but do not replace the active Bench Resources
  table or matching metrics
- The popup retains a date input for selecting the latest date or a newer update date

---

## [2026-06-25] - Bench table and matching metrics use latest snapshot only

- Bench Resources now always displays only the latest effective-date snapshot; historical snapshots
  remain stored in PostgreSQL but are no longer selectable into the active table
- Matching Resources, less-than-3-months, greater-than-or-equal-to-3-months, confidence counts, and
  resource matching continue to use the same backend `MAX(bench_week_date)` snapshot
- The current database contains 180 historical bench rows, while only the 97 rows dated
  June 15, 2026 are active in the latest snapshot
- Manual updates may use the current latest date or a newer date; older dates are rejected in the UI
  to prevent resources being saved into history without affecting current matching
- Adding resources with a newer effective date creates the new latest snapshot and refreshes all
  matching metrics; deletion is always scoped to the currently active latest snapshot

---

## [2026-06-25] - Bench Resources becomes a dated, manageable inventory

- Bench Resources now loads and manages PostgreSQL inventory snapshots by an exact effective date,
  while remaining compatible with existing ISO-week file uploads
- Manual employee IDs are saved against the selected effective date instead of being implicitly
  attached only to the latest week
- Added row-level and multi-select deletion; deletes are scoped to the currently selected snapshot
  date and immediately refresh matching resources
- Added persistent source tracking to `bench_employee_ids` (`file_upload` or `manual`) with a safe
  startup migration and backfill of existing rows as file uploads
- Inventory responses now include record ID, source, effective date, row update timestamp, all saved
  snapshot dates, and the selected snapshot's latest update time
- File Status in the upload modal now shows the most recent database update timestamp for TA, MSD,
  and Bench files
- Added search plus source, status, shore, and grade filters to Bench Resources
- Added Resource Search-style multi-column sorting/grouping: successive sorted columns form groups,
  active sort/group chips are displayed, and group boundaries are highlighted in the table
- Added a persistent Columns chooser with show/hide, reorder, and reset controls; Excel export follows
  the filtered, sorted rows and currently visible column set
- Added integration coverage for dated manual rows, source metadata, deletion, and update timestamps

---

## [2026-06-25] - Leakage hover tooltip shows complete currency values

- Leakage chart hover tooltips now show full comma-separated amounts such as `$20,264` instead of
  abbreviated values such as `$20k`
- Compact `k` formatting remains on chart axes and bar-end labels to preserve readability
- Full values appear in both the minimized and expanded Daily Leakage and Total Leakage charts

---

## [2026-06-25] - Leakage KPI totals corrected and added to expanded view

- Fixed leakage calculations when the TA source has no Today's Date: the backend now uses the
  uploaded requisition snapshot date instead of the computer/server's current date
- Requisitions whose start date was still in the future on the snapshot no longer inflate Sum Daily
  Leakage, and cumulative Total Leakage no longer grows after the historical snapshot date
- Rechecked the June 23, 2026 snapshot: Sum Daily Leakage changes from `$30,624` to `$30,024`, and
  Sum Total Leakage changes from `$344,400` to `$283,752`
- Replaced the misleading `Avg monthly` calculation with Projected Monthly Leakage, calculated as
  the corrected daily run rate multiplied by the actual number of Monday-Friday business days in
  the snapshot month
- Added Sum Daily Leakage, Projected Monthly Leakage, and Sum Total Leakage KPI cards to the expanded
  leakage modal so they remain visible in both Daily Leakage and Total Leakage tabs
- Added a processor regression test covering missing Today's Date and future-to-snapshot start dates

---

## [2026-06-25] - Client names restored in compact leakage chart

- The minimized Leakage on Open/Offered Reqs chart now shows the client/customer name beside each
  of its top four horizontal bars instead of hiding the category axis
- Compact labels are shortened to fit the dashboard card, while the complete name remains available
  in the chart tooltip and the SVG label hover text
- The expanded leakage view retains its wider client-name column and full multi-row chart behavior

---

## [2026-06-25] - Backend and PostgreSQL reconciliation from the shared build

- Audited the current backend against every database-affecting changelog entry and reconciled the
  live `talentiq` PostgreSQL schema without deleting or rewriting uploaded records
- Confirmed `requisitions` includes the leakage source fields `job_start_date`, `todays_date`, and
  `billing_rate`
- Confirmed `msd_allocations` includes RM, office location, customer, resource category, project
  dates, billability, date of joining, and numeric `allocation_percentage`
- Confirmed the bench employee week uniqueness constraint, employee lookup indexes, requisition
  dashboard indexes, and all employee-history/matching endpoints are present
- Documented the newer persistent AI matching cache that arrived with the backend from another
  computer: `ai_match_cache` stores normalized position/resource signatures, model names, structured
  results, creation/access timestamps, and access counts so identical requests avoid repeat API calls
- Fixed AI model selection so the backend now honors the documented `OPENAI_MODEL` value; the
  optional `OPENAI_STAGE1_MODEL` override remains supported, followed by the legacy
  `OPENAI_SIMPLE_MODEL` fallback
- Corrected the frontend AI matching documentation to describe the implemented single structured
  matching call with persistent caching instead of claiming an unused second matching stage
- Existing historical TA rows remain valid but their leakage source columns are blank until those
  dated snapshots are replaced from a TA workbook containing Job Start Date, Today's Date, and
  Billing Rate

---

## [2026-06-25] - Setup now runs on every launch with detected PostgreSQL defaults

- Fixed the launcher frontend path after the folder was renamed from `talentiq-deliver` to
  `talentiq-Frontend`, including the generated frontend launcher and setup defaults
- Removed the `DATABASE_URL` short-circuit from `start.bat`; setup now runs whenever `start.bat`
  is launched so the database connection can be reviewed before services start
- Setup reads the existing `DATABASE_URL` and displays its username, host, port, and database as
  editable defaults; pressing Enter keeps each displayed value
- PostgreSQL port detection checks active local listeners in the PostgreSQL port range, prefers
  the configured port when it is live, and otherwise prefers the standard port `5432`
- The port prompt is now labelled `Port (auto-detected)`, and the database prompt explicitly asks
  which PostgreSQL database TalentIQ should connect to
- Existing passwords are retained when the masked password prompt is left blank, avoiding the need
  to re-enter unchanged credentials on every launch
- Rebuilt a copied Python virtual environment that referenced another Windows user profile
- Corrected the local database connection from an inactive port `5433` configuration to the
  working PostgreSQL service on `localhost:5432`, and verified the backend health endpoint

---

## [2026-06-23] - Avg monthly leakage shown under Sum Daily Leakage

- The Sum Daily Leakage KPI card now carries a small light sub-line ("Avg monthly $Xk"), matching the compact sub-text style already used under New Reqs WTD
- Monthly estimate is the summed daily leakage projected over the average number of working days per month (260 business days / 12 ≈ 21.67), formatted with the existing compact USD helper

---

## [2026-06-22] - TA requisition leakage metrics and dashboard chart updates

- TA requisition upload now captures job start date, today's date, and billing rate so leakage values can be calculated from the source workbook fields
- Backend dashboard leakage now uses active Open and Offered requisitions, with Daily Leakage USD calculated from billing rate and Total Leakage USD calculated as business days times daily leakage
- Added tolerant parsing for Excel-style dates and business-day counting between Job_Start_Date and Today's date
- Dashboard live metrics now include Sum Daily Leakage and Sum Total Leakage
- Leakage KPI cards, chart labels, axis ticks, and tooltips now show rounded compact thousands, such as `$11k` and `$256k`
- Reworked the KPI row so New Reqs WTD and Avg Aging share a compact stacked column, leaving room for the leakage sum cards
- Converted the leakage visualization from a vertical column chart to a horizontal bar chart
- Compact leakage preview now shows only the top four bars without client names; expanded view shows all clients without horizontal scrolling
- Updated frontend fallback processing to match the backend leakage formula when data is processed in-browser

---

## [2026-06-18] - Bench Resources tab added to Skill Mapping

- Removed the dashboard-level Uploaded Bench Resources panel so bench inventory now lives inside the Skill Mapping workflow
- Added a new Skill Mapping tab named Bench Resources between Summary and Resource Matches
- Bench Resources shows uploaded Employee IDs enriched from the latest MSD allocation data with employee ID, name, grade, designation, shore, bench tenure, key skills, and status
- Added manual Employee ID entry so users can save one or more IDs directly into the bench list without uploading a workbook
- Added backend endpoints for bench inventory and manual bench ID save, reusing the same bench ID table used by uploaded Employee ID files
- Added Bench Resources Excel export, including ID-only rows when an employee ID is saved but not found in the latest MSD allocation data
- Refreshes Skill Mapping data after manual ID save so Matching Resources and Resource Matches use the latest bench list
- Manual Employee ID saves now return the MSD lookup result for the exact typed IDs, focus the Bench Resource List on those rows, and export the typed/manual set to Excel
- Employee ID matching now tolerates Excel-style `.0` suffixes and extra spacing when comparing manual/uploaded IDs with MSD allocation rows
- Manual Employee ID entry now falls back to direct latest-MSD lookup when the backend save route is unavailable, showing matched or ID-only rows in the Bench Resource List and keeping those typed IDs exportable
- Bench Resources summary now includes filter buttons for All saved IDs, Manual IDs, File Upload IDs, and Current Manual results, with the table and Excel export following the selected source view


---

## [2026-06-17] - Project history rows gain duration expanders

- Updated the Historical Data Project & Client History table so each project row has a compact Project duration card with a chevron toggle
- Collapsed rows now show a one-line project summary, while expanded rows reveal project, client, billability, start/end, vertical, allocation, and observed-month details inline
- Added keyboard-accessible expansion with ARIA wiring, focus movement into expanded details, and a polite screen-reader announcement
- Added duration/date-range computation, smooth expand/collapse animation, responsive stacked mobile layout, and refined billability pill colors for Billable, Partial, Internal, and NonBill states
- Removed the old Project & Client History column header strip so the new expandable row layout reads as a cleaner compact history list
- Historical Data now excludes projects already shown in Current Alignment, using both the current-row flag and a normalized project/client/date match to avoid duplicate active assignments
- Confidence Overview rollup cards now count unique bench resources by their best confidence band instead of summing every requisition-resource pairing, preventing counts from exceeding the uploaded matching resource total
- Dashboard now includes an Uploaded Bench Resources inventory table with employee ID, name, grade, designation, shore, work location, bench tenure, and key skills so uploaded bench data is visible next to the dashboard metrics
- Refined the Uploaded Bench Resources panel for large uploads with a bounded scrollable grid, sticky header, name/employee ID search, visible filtered count, and full-resource Excel export
- Added clearer internal scrolling to Uploaded Bench Resources, including a styled scrollbar and draggable right-side scroll handle for long bench lists
- Kept the modal header, Download Excel action, sorting/export behavior, and existing Project & Client History section structure intact

---

## [2026-06-16] - Fuzzy matching respects resource shore

- Fuzzy resource recommendations now require same-shore matching when a position has an Onshore/Offshore location
- Confidence Overview counts and full Excel mapping exports now use the same location-aware candidate pool as Resource Matches
- AI matching candidate selection is prefiltered by the same shore rule before sending resources to the LLM matcher
- Backend `/api/matches/{position_id}` and `/api/all-matches` now skip opposite-shore resources before scoring
- Endpoint integration tests now assert offshore requisitions only return offshore candidates and onshore requisitions only return onshore candidates

---
## [2026-06-16] - Source cleanup and safer data normalization

- Removed unreachable legacy grade-distribution code from the frontend data processor
- Reused the existing tolerant field picker for TA and bench ID parsing instead of maintaining duplicate lookup logic
- Normalized bench employee IDs consistently by trimming trailing Excel `.0` suffixes before matching MSD rows
- Consolidated duplicated frontend Excel rejection-result helpers into one shared helper
- Hardened backend upload field lookup to match headers across spacing, punctuation, and case differences
- Preserved explicit `0` allocation percentages during MSD upload instead of treating them as blank
- Tightened employee-history ID normalization to remove only a trailing Excel `.0` suffix

---

## [2026-06-16] - Start launcher runs setup check before launch

- `start.bat` now performs a first-run setup check before starting the backend and frontend
- On a PC/user combination that has not been marked as configured, the launcher asks whether
  `setup.bat` has already been run successfully on that machine
- If the user answers no, `start.bat` launches `setup.bat` first so PostgreSQL details and optional
  API keys can be collected before the app tries to start
- Successful setup or an explicit already-run confirmation writes a per-PC marker under `.launcher`
  so repeat launches on the same machine do not keep prompting
- If setup is missing or fails, startup stops with a clear setup error instead of continuing to a
  backend database failure

---


## [2026-06-16] - One-click installer for PostgreSQL credentials and API keys

Added a double-clickable installer so the project can be shared with others who then point it at
their own local PostgreSQL and API keys without editing files by hand. It collects the recipient's
settings and writes them into the right `.env` files, leaving every other line untouched.

**New installer: `setup.bat` + `setup.ps1` (top-level `TalentIQ` folder)**
- `setup.bat` is the file recipients double-click; it launches `setup.ps1` with
  `-NoProfile -ExecutionPolicy Bypass` (no system-wide setting changed) and keeps the window open
  so results/errors are readable
- Prompts for the PostgreSQL **username** (default `postgres`) and **password** (masked), plus
  **host** / **port** / **database name** with defaults (press Enter to accept)
- Finds `psql` on `PATH`, falling back to `C:\Program Files\PostgreSQL\*\bin\psql.exe`, then
  **tests the connection** and **creates the `talentiq` database** if it does not exist yet
- Writes a working `DATABASE_URL` into `talentiq-backend\.env` using the `postgresql+psycopg://`
  driver, **URL-encoding** the username/password so special characters (`@ : /` etc.) don't break
  the connection string
- Optionally stores `OPENAI_API_KEY` -> `talentiq-backend\.env` and `ANTHROPIC_API_KEY` ->
  `talentiq-deliver\.env`; pressing Enter keeps whatever is already there (and leaves the frontend
  `.env` untouched)

**Safe, repeatable `.env` rewriting**
- Only the managed lines are rewritten; CORS, model name, and comments are preserved
- Keeps a one-time `.env.bak` backup of each file before its first change
- Reads/writes UTF-8 without a BOM, so non-ASCII comments survive the round-trip (Windows
  PowerShell's `Get-Content`/`Set-Content` would read a no-BOM file as Windows-1252 and corrupt them)
- A missing `.env` is created from its `.env.example` first - the intended "shared bundle" flow:
  ship only the `.env.example` files and let the installer fill them in
- If `psql` is absent it degrades gracefully: still writes the `.env` and tells the user to create
  the database themselves
- `setup.ps1` is pure ASCII so Windows PowerShell 5.1 parses it identically on any system codepage
  (a non-ASCII character inside a string literal would otherwise be misread as a string terminator
  and break the script before it ran)
- Unattended use is supported via parameters: `-Username`, `-Password`, `-OpenAiKey`,
  `-AnthropicKey`, `-DbName`, `-DbHost`, `-DbPort`, `-BackendDir`, `-FrontendDir`, `-EnvOnly`,
  `-NonInteractive`

**Docs**
- `talentiq-backend/SETUP_GUIDE.md` gains a "Quick setup with the installer (recommended)" section
  at the top: install prerequisites -> double-click `setup.bat` -> double-click `start.bat`; the
  detailed phases remain as the manual fallback

**Files added / touched**
- `setup.bat` (new), `setup.ps1` (new), `talentiq-backend/SETUP_GUIDE.md`

---


## [2026-06-16] - Windows PC launcher and local PostgreSQL setup

- `start.bat` now detects a copied or broken backend virtual environment and rebuilds it with
  the Python installation on the current PC
- Backend dependency installation now uses `python -m pip`, avoiding stale `pip.exe` paths from
  virtual environments copied from another Windows user profile
- The launcher still starts the backend and frontend from the existing `.launcher` helper scripts,
  clears `.runlogs`, stops old listeners on ports `8000` and `5173`, and waits for both services
  before opening the app
- Updated the backend `.env` PostgreSQL connection to the working local database on
  `localhost:5432/talentiq` for `talentiq_user`
- Verified the PostgreSQL connection with a `select 1` check after updating the connection URL

---


## [2026-06-13] - Employee history sorting, joining date, and Excel export

- Current alignments are sorted by allocation percentage from highest to lowest, with missing
  allocation values shown last
- Promotion and grade history now includes a Date of Joining column beside Designation
- MSD upload now recognizes common date-of-joining headers and stores the value for employee history
- Project and client history is sorted by newest start date; matching start dates place ongoing
  assignments first, followed by the latest end date
- Added a Download Excel action that exports the sorted project and client history

---


## [2026-06-11] - Historical Data tab converted to tables

- Replaced the Historical Data project cards with a structured table for easier comparison
- Project history now has separate columns for project, client, billability, start/end dates,
  vertical, allocation percentage, and the uploaded months in which the alignment was observed
- Current project rows remain highlighted and retain the `CURRENT` indicator
- Promotion and grade changes now appear in a separate table with effective month, previous grade,
  new grade, and designation
- Tables support horizontal scrolling when the modal is viewed on a narrower screen

---


## [2026-06-11] - Fixed MSD replacement upload with allocation percentages

- Fixed the MSD upload `500 Internal Server Error` caused by the live PostgreSQL
  `allocation_percentage` column being numeric while the ORM bound uploaded values as text
- `MsdAllocation.allocation_percentage` now matches PostgreSQL `DOUBLE PRECISION`
- Upload parsing accepts numeric values, percent-marked values such as `50%`, and Excel fractional
  percentages such as `0.5` (stored as `50`)
- The backend now scans workbook sheets/header rows for Employee Id and Project Name, so raw MSD
  reports work even when the allocation table is not on the workbook's first sheet
- Failed replacement uploads remain atomic; the existing period is preserved when insertion fails

---


## [2026-06-11] - One-click Windows launcher

- `start.bat` can now be run directly by double-clicking from any working directory
- Backend and frontend dependencies are installed only when missing, making normal startup faster
- Existing listeners on ports `8000` and `5173` are stopped before launching fresh services
- Service output is written to `.runlogs`, startup waits for the frontend health check, and the
  TalentIQ page opens automatically when ready
- Small `.launcher` helpers keep the backend/frontend commands reliable on Windows paths
- Missing Python/Node installations and startup timeouts now show clear errors and keep the window
  open so the message can be read

---


## [2026-06-11] - Employee detail tabs: current alignment, allocation, and promotions

The employee-name popup in Resource Search now separates present-day staffing from historical
records, while preserving the existing project/client history.

**Current Alignment tab**
- Opens by default and lists every alignment for the employee in the latest uploaded MSD month
- Each alignment shows project, client, billability, vertical, dates, and allocation percentage
- Empty allocation percentages are shown as "Not provided" instead of being guessed

**Historical Data tab**
- Retains the existing project and client history cards, newest first
- Adds a Promotion & Grade History section derived from changes between monthly MSD snapshots
- Promotion entries show the previous grade, new grade, effective month, and designation

**Backend and upload**
- Added nullable `allocation_percentage` storage to `MsdAllocation`
- The startup migration adds the column to existing databases without deleting or rewriting data
- MSD upload recognizes common headers including "Allocation Percentage", "Allocation %",
  "Allocation Percent", "Allocation", and utilization equivalents
- `GET /api/employee-history/{employee_id}` now returns `current_alignments`, `promotions`, and
  the latest allocation month in `as_of`, while keeping the existing `projects` response
- Existing uploaded rows remain valid; allocation percentage appears after a source file containing
  that column is uploaded or re-uploaded

**Rollback**
- The pre-change source files are stored in
  `.codex-backups/employee-alignment-tabs-20260611-1730`
- Run that folder's `RESTORE.ps1` from PowerShell to restore the previous source state

**Files touched**
- `src/pages/ResourceSearchPage.jsx`
- `app/models.py`, `app/main.py`, `app/routers/upload.py`, `app/routers/mapping.py`
- `scripts/test_endpoints.py`

---


## [2026-06-11] — Resource Search: column chooser + clickable employee project history

Two enhancements to the Resource Search page, plus the backend data capture that powers the
second one. The table is now user-configurable (pick which columns to show and in what order,
remembered across sessions), and every employee name is now a link that opens a popup of that
resource's historical projects, clients, dates, and billability.

**Column chooser (show / hide / reorder, persisted)**
- New "☰ Columns (N)" button in the filter bar (next to Download Excel) opens a panel listing every column
- Each entry has a checkbox (show/hide) and ↑/↓ buttons to reorder; a "Reset" link restores the default set + order
- The "#" row-number column is pinned first and is not configurable
- Preferences are saved to `localStorage` (`talentiq.resourceSearch.columnPrefs.v1`) and reload automatically — survives refresh / revisit, per browser
- Forward-compatible: saved prefs are reconciled against the live column list on load — unknown columns are dropped, newly added columns are appended at their default visibility
- The visible/ordered column set now drives the `<colgroup>`, header, body, total table width, and the Excel export (export reflects exactly what's shown, in the shown order)

**Clickable employees → project & client history popup**
- The Name cell is now a teal link (when an Employee Id is present); clicking it opens a modal
- The modal lists the resource's project stints newest-first, each showing: project name, customer/client, vertical, billability badge, and start / end dates
- The current allocation is flagged with a "CURRENT" pill and an "End: Present" label when it has no explicit end date
- Each card also notes the month span it was seen across in the uploaded allocation snapshots
- Loading / error / empty states handled inline in the modal

**Backend: capture project dates + billability (new) and serve history**
- `MsdAllocation` model gains three columns: `project_start_date`, `project_end_date`, `billability` (`models.py`)
- `_ensure_msd_columns` forward-migration in `main.py` `ALTER TABLE`s these in for existing databases (no Alembic needed)
- `upload_msd` (`routers/upload.py`) extracts them via the existing `_pick` helper with a generous set of header aliases (e.g. "Project Start Date" / "Allocation Start Date", "Project End Date" / "Release Date" / "Roll Off Date", "Billability" / "Billable/Non-Billable" / "Billing Status"). **Extraction is plain string picks — no date parsing in the upload path — so MSD upload speed is unaffected.**
- New `GET /api/employee-history/{employee_id}` (`routers/mapping.py`) reconstructs a resource's history across **all** uploaded allocation months: it gathers every row for the employee, dedupes repeated project stints on (project, customer, start, end), merges the month span each was seen in, flags the current stint, and returns them newest-first. A best-effort date parser is used for sorting only (ISO / common formats / Excel serials) and lives on the read path, never the upload path.
- The three new fields are also surfaced on `/api/msd-all` so they can optionally be shown as table columns
- `fetchEmployeeHistory(id)` added to `src/api.js`

**Note**
- Project start/end dates and billability are blank until an MSD Allocation file containing those columns is (re-)uploaded — existing rows from older uploads have NULLs for the new fields.

**Files touched**
- `src/pages/ResourceSearchPage.jsx` — column chooser, history modal, clickable names
- `src/api.js` — `fetchEmployeeHistory`
- `app/models.py`, `app/main.py`, `app/routers/upload.py`, `app/routers/mapping.py` — capture + history endpoint

---


## [2026-06-10] — Skill Demand modal: clickable req IDs → auto-select in Resource Matches

The Skill Demand modal (Summary tab → "Expand" / "View all") lists, per skill, the
requisition IDs that demand that skill. Those IDs were inert text. They're now interactive:
clicking one jumps straight to the Resource Matches tab with that requisition pre-selected and
its matches already loaded — closing the loop between "which reqs need this skill" and "who can
fill them". The long req lists also expand inline instead of being silently truncated.

**Req ID chips are now clickable buttons**
- Each req ID in the modal's "Requisitions" column is now a `<button>` (was a static `<span>`)
- At rest it looks identical to before — same `C.slate100` background, 3px radius, 10px font, `2px 8px` padding
- On hover it fills teal (`#0d9488`) with white text to signal it's navigable (`transition: background/color 0.15s`)
- `title` and `aria-label` describe the action ("Open requisition {id} in Resource Matches")
- New `handleReqClick(reqId)` resolves the full position object from the `positions` prop (the chip data only carries `{id, role, client, location}`, so the lookup is needed to recover `skills`/`grade`/etc. used by the matcher), closes the modal, then calls `onNavigateToMatch(position)`

**"+N more" expands inline (no second modal)**
- The previously static "+N more" text is now a toggle button per skill row
- Clicking it reveals every remaining req ID inline within that row; the button switches to "Show less"
- Clicking again collapses back to the first 8 chips
- Per-skill state held in a new `expandedSkills` object (`{ [skillName]: bool }`) with a `toggleExpand(skill)` helper
- Visible-chip limit centralised in `REQ_CHIP_VISIBLE_LIMIT` (8); newly revealed chips are clickable too

**Navigation wired through SkillMappingPage (no new page / no router change)**
- Resource Matches is a *tab* inside `SkillMappingPage`, not a separate route — so navigation reuses the existing select-and-jump pattern already used by Confidence Overview row clicks
- New `handleSelectPositionFromSkillDemand(pos)` sets `selectedPos`, clears `selectedRes`, sets a `cameFromSkillDemand` flag, and switches `tab` to `"matches"`
- Setting `selectedPos` already drives the tab's existing auto-expand + scroll-into-view of the position card and auto-loads matches via the `matchesForPosition` memo — no extra fetch needed
- `SummaryTab` receives `onNavigateToMatch`; `ResourceMatchesTab` receives `navigatedFromModal` + `onConsumeNavFlag`

**Confirmation banner in Resource Matches**
- When arriving via a chip click, a dismissible teal banner appears at the top of the tab: "Showing matches for requisition **{id}** — {role}"
- Dismiss with the `×`
- The parent flag is consumed on first render, so navigating away and back (which remounts the tab) does not re-show the banner — the requisition stays selected but the one-shot nav intent is cleared

**Files touched**
- `src/pages/SummaryTab.jsx` — clickable chips, inline expand, `handleReqClick`
- `src/pages/SkillMappingPage.jsx` — skill-demand nav handler + flag, prop wiring
- `src/pages/ResourceMatchesTab.jsx` — confirmation banner + nav-flag consumption

---


## [2026-06-09] — Resource Search: drag-to-resize columns + auto-wrap cell text

Follow-up polish on the Resource Search table after the same-day overhaul (entry below).
The table cells were truncating long values with an ellipsis (because of the fixed column
widths that were introduced earlier in the day to stop columns from reshuffling during
sort). This made long values like full project names or designations unreadable. Users now
get two ways to deal with that: drag any column wider, and content that still doesn't fit
wraps onto multiple lines instead of getting clipped.

**Drag-to-resize column widths**
- Each header cell now has a 6px-wide invisible drag handle pinned to its right edge (`position: absolute; right: 0; cursor: col-resize`)
- Mousedown on the handle starts a drag; `mousemove` listeners attached to `document` update the column width live as the user drags; `mouseup` cleans up the listeners and restores the body cursor / `userSelect`
- Minimum column width clamped at 40px so a user can't accidentally collapse a column to zero
- Per-column widths held in a new `colWidths` state object (seeded from the existing `columns[].width` defaults — 44/140/110/160/90/130/140/140/130/140/130/260)
- `<colgroup>` now binds each `<col>`'s width to `colWidths[column.key]` instead of the static `column.width`, so live drag changes apply immediately
- Table `minWidth` is now derived from the sum of current `colWidths` (was hardcoded to 1614) — when a user widens columns, the horizontal scrollbar appears at the right time
- The drag handle has `onClick` `stopPropagation` so clicking the handle never triggers the column's sort cycle
- The handle also has `e.stopPropagation()` + `e.preventDefault()` on mousedown so the sort `onClick` on the surrounding `<th>` is never fired by a drag

**Reset column widths control**
- A new "Reset column widths" ghost link appears at the right side of the sort-status row above the table — but only when at least one column's width has been changed from its default
- One click restores every column to the seeded default width
- Tracked by a `widthsCustomized` `useMemo` that compares the live `colWidths` to the seed values

**Auto-wrap cell text**
- *Before*: header style had `whiteSpace: "nowrap"` + `textOverflow: "ellipsis"`; cell style had the same. Long values (e.g. "Bachelor of Science in Computer Science Engineering") rendered as "Bachelor of Sc..." with no way to see the rest.
- *Now*: both `tableHeaderStyle` and `tableCellStyle` use `whiteSpace: "normal"` + `wordBreak: "break-word"` so text flows onto multiple lines if the column is narrower than the content. Cells/rows grow vertically to fit (table layout: fixed handles this gracefully).
- `textOverflow: "ellipsis"` removed from both — no longer needed since content wraps instead of overflowing
- Removed the inline `whiteSpace: column.key === "skillsets" ? "normal" : "nowrap"` override on `<td>` — the base cell style now wraps uniformly
- `tableHeaderStyle` padding tweaked to `10px 14px 10px 12px` (extra right padding) so the column label never sits flush against the drag handle
- `tableHeaderStyle` adds `position: "relative"` so the absolute-positioned drag handle anchors to its parent `<th>`
- `SkillTags` inner flex container had `minWidth: 220` — removed (was a hack from the auto-layout era). Skill chips now wrap to whatever width the skillsets column is set to, including widths smaller than the old 220px floor.

**Net effect**
- Drag any column header's right edge to resize that column in real time
- Long names, designations, project names, etc. wrap to a second/third line if the column is narrow — no more silent ellipsis truncation
- Sort-status row now shows "Reset column widths" alongside "Clear sort" when applicable
- All previous behavior preserved: sort highlight, multi-row search, criteria filters, Excel export, fixed column widths during sort (no reshuffling), solid Clear All

**File touched**
- `src/pages/ResourceSearchPage.jsx`

---


## [2026-06-09] — Resource Search overhaul: table styling, stable sorting, multi-field search, solid Clear All

This session reworked the Resource Search page into a more powerful, visually consistent
search tool. Six independent improvements landed; collectively they bring the Resource Search
tab in line with the Confidence Overview tab's look-and-feel and add real multi-field search.

**1. Table header now matches Confidence Overview palette**
- Header background changed from `C.slate100` (light gray — left header text white & invisible) to `C.slate700` (dark slate, #334155)
- White header text is now properly visible against the dark background
- Header padding bumped to `10px 12px`, fontSize to 12, weight 500
- Removed `textTransform: "uppercase"` and `letterSpacing: 0.5` so headers render in natural case ("Name", "Employee Id", "Designation as per HRIS") — matches Confidence Overview header style

**2. Column widths locked — sorting no longer reshuffles the table visually**
- *Root cause*: the table used auto layout with `whiteSpace: nowrap` cells. Only the top 100 rows are shown. When the user sorted, a different set of rows became visible, the "widest content" per column changed, and the browser re-sized every column. Headers and content shifted horizontally on every sort click.
- *Fix*: switched the table to `tableLayout: "fixed"` and added a `<colgroup>` that applies explicit per-column widths from the `columns` config
- Each column entry in `columns[]` now carries a `width` (e.g. `name: 140`, `designation: 160`, `skillsets: 260`); total = 1614px
- Table `minWidth` increased from 1320 → 1614 to match the column width sum (table is inside `overflowX: auto`, so it scrolls horizontally on narrow viewports)
- Added `overflow: hidden` + `textOverflow: ellipsis` to both `tableHeaderStyle` and `tableCellStyle` so over-long values truncate cleanly inside their fixed cell instead of spilling
- Result: sorting only reorders rows; column widths never change

**3. Active-column sort highlight (matches Confidence Overview)**
- The sorted column header now lights up exactly like Confidence Overview:
  - **Primary sort** (innermost in the sort stack) → `C.teal600` background, `C.teal400` bottom border (2px), bold weight
  - **Grouping columns** (other sorted columns in the multi-sort stack) → `C.teal800` background, bold weight — distinguishes them as "still active sort, but secondary"
  - Default unsorted columns stay `transparent` background on the slate-700 header row
- Sort arrow (↑/↓) recolored from `C.teal600` → `C.white` so it's visible against the new teal active background
- Sort-position chip (`1`, `G1`, `G2`, ...) recolored: background `C.white`, text `C.teal700`/`C.teal800` — readable on every header state
- Multi-column sort UX preserved: clicking a new header makes it innermost (current sort) and demotes the previous innermost to a grouping column

**4. Generalized search input — pick the field you want to search**
- Replaced the hardcoded "Skill Search" with a "Search" section that includes a field-selector dropdown beside each input
- New `SEARCH_FIELDS` config supports five fields out of the box: **Skills**, **Name**, **Designation**, **Project Vertical**, **Project Name**
- Each field has its own contextual placeholder (e.g. "Search by designation — comma-separate for multiple")
- Filter logic now searches whichever field is selected: `String(row[field] || "").toLowerCase().includes(token)`
- Comma-separated multi-term matching (OR) still works for every field — type `Java, Python` to match rows where Skills contains either

**5. Multiple stacked search rows — combine search fields with AND**
- Single-search-row state (`searchField` + `searchQuery`) replaced with a `searches: [{ field, query }, ...]` array
- New "+ Add search field" button (dashed teal outline, `C.teal50` fill) below the search rows — clicking adds a new row preset to "Skills"
- Each row beyond the first gets a `×` remove button on its right edge
- Filter rules between rows are AND; within a row's comma-separated tokens it stays OR. So `Skills: "Java, Python"` AND `Project Vertical: "BFSI"` returns rows where skillsets contains Java or Python AND project_vertical contains BFSI
- Empty search rows are ignored — they don't constrain the result set
- `activeSearches` useMemo derives the parsed-and-filtered list of non-empty rows; filter loop and `hasActiveFilters` check both use it

**6. Solid "Clear All" button — reset everything in one click**
- Added a prominent solid Clear All button next to "+ Add search field", at the bottom of the search section
- Active state: `C.slate700` background, white text, bold; disabled state: `C.slate200` background, `C.slate400` text, `not-allowed` cursor
- Disabled automatically when there's nothing to clear (no active criteria, no non-empty searches)
- Clears: all search rows (resets to a single empty "Skills" row), all active criteria filters, all selected criterion values, the entire sort stack
- Removed the redundant underlined "Clear all" `GhostButton` that used to sit next to the Download Excel button in the criteria row — the new solid button is more discoverable and replaces it

**File touched**
- `src/pages/ResourceSearchPage.jsx` — all changes in this entry are contained in this single file. No theme, API, or data-processor changes were needed.

**Visual / behavioral state of Resource Search after this session**
- Dark slate header with bold mixed-case labels
- Fixed-width columns with ellipsis truncation (no horizontal reflow on sort)
- Active sort column glows teal; grouping columns glow darker teal; arrows + chips remain readable
- Multi-row search box with field selector dropdowns, +Add button, per-row remove, and a solid Clear All
- Download Excel button still respects all active filters + all search rows

---


## [2026-06-04] — Resource Search: Excel export + MSD field-population fixes

**Resource Search — Download Excel button**
- Added "⬇ Download Excel (N)" button in the filter bar, right-aligned next to "Clear all"
- Exports the currently *filtered* row set (respects skill search + all active criteria), not just the 100 visible rows
- File name pattern: `Resource_Search_<YYYY-MM-DD>.xlsx`, single sheet "Resources"
- Headers in the export match the on-screen column labels ("Designation as per HRIS", "Grade as per HRIS", etc.) — the `#` index column is omitted
- Button is disabled (greyed out) when zero rows match the filters
- Uses the existing `downloadExcel` helper in `utils/excel.js` (xlsx-based) — no new dependency

**MSD Allocation — missing fields populated end-to-end**
- *Root cause*: the Resource Search table was rendering blank cells for **RM as per HRIS**, **Office Location as per HRIS**, **Customer Name**, and **Resource Category** because:
  - The `MsdAllocation` ORM model had no columns for `rm`, `customer_name`, or `resource_category` at all — those values were never persisted, so any read came back as `""`
  - The upload extractor was looking for `"Work Location as per HRIS"`, but the actual Excel header is `"Office Location as per HRIS"` → `work_location` was being saved as empty for most rows
  - The `_all_msd_resource_row` mapper in `mapping.py` listed Excel-style aliases like `"RM as per HRIS"` first, but after SQLAlchemy serialization the row dict only contains snake_case column names — so even the snake_case fallback (`"rm"`) wouldn't have helped because the column didn't exist
- Added 4 new columns to `MsdAllocation`: `rm`, `office_location`, `customer_name`, `resource_category` (`models.py`)
- Updated `upload_msd` (`routers/upload.py`) to extract these from the Excel:
  - `RM as per HRIS` / `RM` / `Reporting Manager` / `Manager` → `rm`
  - `Office Location as per HRIS` / `Office Location` / (legacy) `Work Location as per HRIS` → `office_location` (also written to `work_location` for backwards compatibility)
  - `Customer Name` / `Customer` / `Client Name` / `Client` → `customer_name`
  - `Resource Category` / `Category` / `Resource Type` → `resource_category`
- Reordered the read-side `_pick(...)` candidates in `routers/mapping.py` to try snake_case (the SQLAlchemy column name) **first** so the actual stored values are picked up, with Excel-style aliases kept as fallbacks for any direct-from-dict callers
- Added a lightweight forward-only migration in `app/main.py` (`_ensure_msd_columns`) that runs after `Base.metadata.create_all` and `ALTER TABLE`s in any missing columns — needed because `create_all` only creates missing *tables*, not missing *columns* on existing tables, and the project doesn't yet use Alembic
- Existing rows uploaded under the old schema will have NULL for the new columns; re-upload the latest MSD file (with `replace=true`) to backfill them

---


## [2026-04-29] — Sortable table, collapsible cards, req detail popup, changelog

**Confidence Overview — sortable columns**
- All 10 column headers are now clickable to sort ascending / descending
- Active sort column highlighted; sort direction shown with ↑ / ↓ indicator
- Clicking the same column toggles direction; clicking a new column resets to descending
- Row hover now uses `teal50` to hint clickability (navigates to Resource Matches tab)

**Confidence Overview → Resource Matches navigation**
- Clicking any row selects that position and switches to the Resource Matches tab
- Selected position card is auto-scrolled into view and auto-expanded

**Resource Matches — collapsible Position cards**
- Cards are collapsed by default; click header row to expand/collapse
- Collapsed state shows: chevron indicator, role name, Grade badge, Offshore/Onshore badge
- "Selected" pill appears on the active card in collapsed state
- "Expand all / Collapse all" controls above the list
- First click on a card → selects it (loads matches on the right) and expands it
- Second click on the already-selected card → opens Req Detail popup

**Resource Matches — collapsible Resource cards**
- Same pattern as position cards
- Collapsed state shows: chevron, name, Grade badge, Offshore/Onshore badge, match score badge
- Expanded state adds: bench duration, skill coverage bar, matched skill chips
- "Best Match" pill visible in collapsed state for top result
- "Expand all / Collapse all" controls above the results list

**Req Detail Popup (double-click on selected position)**
- Full-screen modal with two-column layout
- Left panel: action buttons + required skills + confidence summary
  - "📬 Contact RMG" — expands inline message textarea with Send button
  - "🔍 Potential Candidates" — expands links to ATS / LinkedIn search
- Right panel: Job Description editor (blank textarea — placeholder for future JD data)
  - Dashed border; turns solid teal when content is added
  - "Save JD" button appears when text is present (session-only for now)
  - "Awaiting JD" badge shown until JDs are wired up

**Changelog**
- This file (`CHANGELOG.md`) added to track all future Claude Code sessions

---


## [2026-04-29] — Bug fixes: collapsible cards, sort cycle, resource panel scroll

**Fix 1 — Position card chevron collapse**
- The `›` chevron arrow now has its own `onClick` with `e.stopPropagation()` — clicking it only toggles expand/collapse, it no longer triggers selection or the popup
- Clicking the role title / badges area still handles selection (first click) and popup (second click on selected card)
- `PosCard` now receives an explicit `onToggle` prop wired to the parent's `togglePosExpand`

**Fix 2 — Confidence Overview sort: 3-state cycle + readable active column**
- Sort now cycles through 3 states on the same column: ↓ desc → ↑ asc → (reset to original order)
- Third click resets `sortCol` to `null` so the original data order is restored
- Active column background changed from `rgba(255,255,255,0.12)` (nearly invisible against slate700) to `C.teal600` — clearly visible teal highlight with white text
- Active column also gets a bottom border in `C.teal400` for extra emphasis
- SortIcon updated: shows `⇅` (neutral) when unsorted, `↑`/`↓` only when active

**Fix 3 — Resource Matches panel: scrollable layout + visible cards + name fallback**
- Both left (positions) and right (resources) columns are now `flex-column` with `maxHeight: calc(100vh - 280px)` — independently scrollable within the viewport
- Fixed filters / search inputs remain pinned above the scroll area; only the card lists scroll
- `ResCard` collapsed header now always shows something: `r.name || r.id || "Unknown"` — prevents blank collapsed cards when the `Name` column in MSD is empty
- All skill arrays guarded with `(r.skills || [])` to prevent `.map` errors on undefined
- Right panel now shows a helpful empty-state message when no position is selected
- Match count displayed next to the selected position title in the right panel sub-header

---


## [2026-04-29] — Fix: blank resource cards (name field not populating)

**Root cause**
- `processMSDData` was looking up MSD columns with rigid hardcoded keys (`r.Name`, `r["Grade as per HRIS"]`, etc.). JavaScript object access is case- and whitespace-sensitive — if the actual Excel header was `"name"`, `"Employee Name"`, `"Full Name"`, or even `"Name "` with a trailing space, the field came back `undefined` and the resource card rendered with no name visible.

**Fix in `src/dataProcessor.js`**
- Added a `pickField(row, ...candidates)` helper that:
  - First tries each candidate header exactly
  - Then falls back to a case-insensitive, whitespace-normalised scan of the row's own keys
- Re-implemented `processMSDData` to use `pickField` for every resource attribute (id, name, grade, designation, location, division, lob, vertical, skillsets, L3, L4, bench days, allocation start, project name)
- `name` now matches: `"Name"`, `"Employee Name"`, `"Full Name"`, `"Resource Name"`, `"Emp Name"`, `"Employee_Name"`, `"Resource"`
- `grade` now matches: `"Grade as per HRIS"`, `"Grade"`, `"HRIS Grade"`, `"Current Grade"`, `"Band"`
- `designation` now matches: `"Designation as per HRIS"`, `"Designation"`, `"Job Title"`, `"Title"`, `"Role"`
- `location` (Onshore/Offshore) now matches: `"Onshore/Offshore"`, `"Onshore Offshore"`, `"Shore"`, `"Location Type"` (case-insensitive)
- `parseBenchEmployeeIds` rewritten with the same robust lookup pattern
- Added one-time console logs:
  - `[MSD] Available columns in first row: [...]` — useful for diagnosing future field mismatches
  - `[MSD] Sample resource: {...}` — confirms what was extracted for the first bench resource
  - Reports how many resources are missing critical fields (name, grade)

**Fix in `src/pages/ResourceMatchesTab.jsx` (`ResCard`)**
- Collapsed header now has `minHeight: 44` — guarantees the card is visibly tall even if every field is empty
- Display name uses `r.name?.trim() || r.id || "Unnamed Resource"` — always shows something
- When name is empty, the card shows the ID in italic + a subtle `(no name in data)` hint to make the issue obvious instead of silent
- `LocationBadge` now also guarded with `{r.location && ...}` to prevent rendering an empty pill
- Expanded body shows ID prominently in teal-700 weight 600 even when name is missing
- Empty skills list now renders an italic "No skills listed" instead of just nothing

**How to verify the fix worked**
- Open browser dev tools → Console after uploading MSD
- Look for `[MSD] Available columns in first row: [...]` — this lists every header in your file
- Look for `[MSD] Sample resource: {...}` — confirms `name` was extracted (or shows it as empty if the column name is something exotic)
- If still blank, copy the column array from the log and paste it into chat — the candidate list can be extended

---


## [2026-04-29] — Defensive: ResCard always visible + DataInspector for debugging

After the previous fix users still reported blank thin cards. Two probable causes:
1. Browser/dev-server caching the old build — stale code
2. Data really has empty fields beyond just `name` (e.g. id also empty)

**Defensive improvements**
- `ResCard` outer wrapper now also has `minHeight: 52` and `flexShrink: 0` — defence-in-depth so the card is impossible to collapse below visible height even if every internal field is empty
- Inner header row bumped from `minHeight: 44` to `minHeight: 50` with larger padding (14px 16px) and font size 14
- Cards now physically cannot render below ~52px regardless of CSS context

**`DataInspector` (new, in `ResourceMatchesTab.jsx`)**
- Inline diagnostic strip rendered at the top of the algorithmic matches list
- Shows the first matched resource's `id`, `name`, `grade`, `designation`, `location`, `benchDays`, `score`, and `skills count` in monospace
- Empty/missing fields are highlighted in red, present fields in slate
- Background turns amber if 3+ fields are empty (clear visual indicator something is wrong upstream)
- Dismissible with ✕; auto-shows again when a different position is selected

**Console logging**
- Added `useEffect` that logs the first match's full object whenever matches change:
  `[Matches] 21 resources matched for Test Lead (46610). First match: {...}`
- Combined with the earlier `[MSD] Available columns in first row: [...]` log, this makes any future field-mismatch issue diagnosable in a single browser console glance

**To pick up these changes**
- Stop the dev server (Ctrl+C) and run `npm run dev` again — Vite caches the dependency graph aggressively
- Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R)

---


## [2026-04-29] — Sort fixes: Priority handles P0/P1/.., highlight clears on third click

**Priority sort now handles both data formats**
- The `priority` field can be either `"P0"`/`"P1"`/`"P2"`/`"P3"` (from `criticality` in the TA file) OR `"High"`/`"Medium"`/`"Low"` (when `criticality` is missing and the fallback in `dataProcessor.js` kicks in)
- Old accessor only mapped High/Medium/Low → returned the same fallback (`3`) for every P-format row, so sort had no effect
- New accessor: regex-matches `^P(\d+)$` and uses the numeric component (P0=0, P1=1, P2=2, ...). Falls back to High=0/Medium=1/Low=2 if neither pattern matches
- Result: Priority column now sorts P0 → P1 → P2 → P3 (descending) and reverse on second click

**Sort highlight now reliably clears on third click**
- Consolidated `sortCol` + `sortDir` into a single `sort = { col, dir }` state object → guarantees atomic updates (no transient state where col is set but dir is null)
- Tightened the active-column check to `sort.col === col.k && sort.dir != null` — defense in depth so even if state ever gets out of sync, the highlight only renders when both fields are populated
- `useMemo` dependency list updated to `[overviewData, sort.col, sort.dir]`

---


## [2026-04-29] — Sort fixes: Priority works, highlight resets cleanly

**Priority sort now functions**
- The accessor previously only knew `{ High: 0, Medium: 1, Low: 2 }` — every `P0`/`P1`/`P2`/`P3` row hit the fallback `99`, so they all sorted equal (i.e. didn't sort at all).
- Updated `COL_KEYS["Priority"]` to parse `P0..P9` numerically with regex `/^P\s*(\d+)/` (loose enough to handle `"P0"`, `"P0 - Critical"`, `"P 0"`, etc.).
- Lower number = higher priority by convention (P0 > P1 > P2).
- Both `P#` and `High/Medium/Low` formats are supported via the same accessor.

**Per-column initial sort direction**
- Added `initialDir` to column definitions (defaults to `"desc"`).
- Priority now uses `initialDir: "asc"` so the first click puts P0 (most urgent) at the top — which is what users intuitively expect for priorities.
- 3-state cycle now: `initialDir` → opposite → reset.
  - For most columns: ↓ desc → ↑ asc → reset
  - For Priority: ↑ asc → ↓ desc → reset

**Highlight reset on third click**
- Was already implemented but combined into a single atomic `useState({ col, dir })` to eliminate any chance of `col` and `dir` being out of sync mid-render. The `isActive` check is strict: `sort.col === col.k && sort.dir != null`. When click 3 sets both to `null`, the teal highlight, white text, bottom border, and bold weight all clear simultaneously.

---


## [2026-04-29] — Dashboard chart improvements

**Status by Client — stacked bars + total label + visible client names**
- Converted the side-by-side `Open` / `Offered` bars into a single stacked bar per client (`Open` at the bottom, `Offered` stacked on top), reducing visual clutter
- Added a total label above each stack (sum of `Open + Offered`) in slate-700 weight 600
- X-axis tick labels now angled at -32° with `interval={0}` and `textAnchor="end"` so every client name renders without overlap
- Chart container resized: changed grid from `1fr 1fr` to `2fr 1fr` so the (longer) Status by Client chart gets twice the width while the (smaller) Aging Pipeline chart sits compact next to it
- Increased bottom margin to 50px to leave room for the angled labels
- Removed the redundant per-bar `LabelList` for `Open`/`Offered` segments — total above is enough; stack segments still tooltip on hover

**Aging Pipeline — angled bucket labels**
- Same -25° angle treatment on the bucket labels (`Pre-appr.`, `1-30 d`, etc.) so they don't get cropped in the narrower container
- Tick font slightly reduced (10 → 9.5) to balance the smaller container width
- Added `cursor` styling to the tooltip for cleaner hover state

**Aging donut — labels inside slices in white bold**
- Labels now positioned at the radial midpoint of each slice (`(innerRadius + outerRadius) / 2`) instead of outside the ring
- Rendered in `#FFFFFF`, font size 12, weight 700 — readable on every slice color (teal, slate, amber, red)
- Slices smaller than 4% of total (`percent < 0.04`) hide their label to avoid cramping
- `labelLine={false}` removes the leader lines that previously connected outside labels back to the slice
- `pointerEvents: "none"` on the text so hover tooltips on small slices still work

---


## [2026-04-29] — Dashboard chart polish: white in-bar labels + horizontal x-axis

**Status by Client**
- Removed the -32° angle on the x-axis client labels — they're now horizontal
- X-axis tick `fontSize` reduced from 10 → 9 so all client names fit on one line without overlap
- Bottom margin reduced from 50 → 8; XAxis `height` from 56 → 28 — bars now sit much closer to the bottom of the card with no wasted whitespace
- Total label moved OUT of above-the-bar position; instead each segment shows its own count INSIDE the segment in white bold (Open count inside the teal portion, Offered count inside the orange portion)
- Per-segment labels auto-hide when the segment is too short (`height < 14`) to avoid overflow

**Aging Pipeline Distribution**
- Same treatment: removed -25° angle, horizontal labels at fontSize 9.5, bottom margin reduced
- Bar value labels moved INSIDE the bar in white bold for tall bars; tiny bars (height < 16) keep the slate label above so the number is still readable

---


## [2026-04-29] — Total label on stacked bar + Confidence Overview ↔ Matches consistency fix

**Status by Client — total label floating on top**
- Re-added the floating total label above each stacked bar in slate-700 weight 700, fontSize 11
- The in-segment counts (white bold for Open and Offered) remain — so each bar now shows: Open count inside teal + Offered count inside orange + total floating above
- Both LabelLists are attached to the topmost (Offered) `<Bar>` segment so the total is positioned correctly relative to the stack height

**Confidence Overview row click — matches now appear for ALL requisitions**
- ROOT CAUSE: `overviewData` (which drives the Confidence table counts) was scoring positions against ALL bench resources globally, but `ResourceMatchesTab` filters bench resources by the position's shore. Result: the Confidence table promised, say, "14 High matches" for a position, but clicking the row took you to Matches view where the shore filter eliminated those resources, showing "no matches"
- Fixed in `SkillMappingPage.jsx` `overviewData` useMemo: added `posShore !== resShore` skip rule so the Confidence counts now reflect what users will actually see in the Matches view
- Both views now use identical scoring + filtering logic — they will never disagree
- Hardened `filteredBench` in `ResourceMatchesTab.jsx`: if `selectedPos.location` is undefined/null, the shore filter falls back to "all" instead of crashing on `selectedPos.location.toLowerCase()` or filtering by empty string (which would match nothing). Defensive against legacy reqs missing the location field
- Improved console diagnostic: when 0 matches are found, logs `console.warn` with the position's location, skills, filtered bench size, minScore, and tenure filter — so future "why no matches" issues are diagnosable in one console line

---


## [2026-04-29] — Sort highlight stickiness fix + wrapping client labels

**Confidence Overview — sort highlight stays clean across columns**
- Removed the `transition: "background 0.15s, border-color 0.15s"` from the `<th>` style
- During the 150ms fade animation, the previously-active column appeared "stuck" with teal still partially visible — especially when clicking rapidly between columns. With the transition removed, the active highlight now snaps cleanly: only the newly-clicked column shows teal, every other column is plain
- The `isActive` check (`sort.col === col.k && sort.dir != null`) was already strict enough that exactly one column can be active per render — the visual artifact was purely due to CSS animation overlap

**Status by Client — wrapping x-axis labels (no slant)**
- Custom tick renderer for the XAxis: splits client names on whitespace and renders each word on its own line via `<text>` with separate `<tspan>`-style positioning
- "PNC Bank" → "PNC" / "Bank", "American Honda" → "American" / "Honda", "JNC Research" → "JNC" / "Research"
- Labels remain horizontal — no slant or rotation
- For names with 3+ words, the first word goes on line 1 and the remainder is joined onto line 2 (capped at 2 lines so chart height stays consistent)
- XAxis `height` increased from 28 → 42 to fit the second line
- Single-word names ("Verizon", "LPL", "Cetera", "Internal", "Genentech", "Syneos") render unchanged on a single line

---


## [2026-04-29] — Status by Client labels: split on hyphens too

- Tick renderer's split regex broadened from `/\s+/` (whitespace only) to `/[\s\-_]+/` (whitespace, hyphens, and underscores)
- "Hi-Tech_Internal" → "Hi" / "Tech Internal" instead of staying on one line and overlapping its neighbours
- Naming with mixed separators (e.g. "Walgreens-Boots Alliance", "JNC-Research") now also wraps cleanly
- Underscores included since they show up in internal/system-generated client identifiers

## [2026-04-27] — Initial modular refactor + AI matching

**Modularisation**
- Split monolithic `App.jsx` (558 lines) into 11 focused files:
  `theme.js`, `utils/excel.js`, `utils/skillUtils.js`, `utils/llmMatch.js`,
  `components/ui.jsx`, `components/UploadModal.jsx`,
  `pages/DashboardPage.jsx`, `pages/SkillMappingPage.jsx`,
  `pages/SummaryTab.jsx`, `pages/ResourceMatchesTab.jsx`,
  `pages/ConfidenceOverviewTab.jsx`

**Summary tab**
- Moved to full-width layout (was crammed into right column of a 2-pane grid)
- Skill demand table now shows top 12 skills with "View all" popout

**Resource Matches tab**
- Position search (job search) moved into this tab — no longer global/shared across tabs
- Bench resource shore filter now auto-enforces based on selected position's location

**Confidence Overview tab**
- Excel export fixed: now exports every position × every bench resource with no score floor
- Two-sheet workbook: "Full Mapping" + "Position Summary"
- Positions with zero bench resources no longer silently dropped from export

**AI Matching (`✦ Match with AI`)**
- New button in Resource Matches tab when a position is selected
- Calls `claude-sonnet-4` via Vite dev-server proxy (avoids CORS)
- API key stored in `.env` as `ANTHROPIC_API_KEY`, never shipped in browser bundle
- Returns: overall bench summary, top recommendation, per-resource reasoning, strengths, gaps
- Toggle between Algorithmic and AI result views
- Animated skeleton loading state

**CORS fixes (iterative)**
- v1: switched from `configure` callback to `headers` object in Vite proxy config
- v2: added `anthropic-dangerous-direct-browser-access: true` header required when `Origin` is forwarded

---
