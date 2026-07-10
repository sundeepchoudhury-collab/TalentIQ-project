# TalentIQ — Recruitment Intelligence Platform

## Quick Start

```bash
cd talentiq
npm install
npm run dev
```

Opens at `http://localhost:5173`. Upload your 3 Excel files via the "Upload Data" button.

## Sample Data Included

- `TA_Upload_Data_-_Active.xlsx` — 2,668 requisitions (132 Open, 25 Offered)
- `MSD_Allocation_Dummy.xlsx` — 5,029 employee allocation rows
- `Employee_List.xlsx` — 101 bench employee IDs

## Architecture

```
src/
├── dataProcessor.js    ← All data transformation (TA, MSD, Bench)
├── App.jsx             ← Dashboard + Skill Mapping UI
├── main.jsx            ← React entry
└── index.css
```

### dataProcessor.js — Key Functions

| Function | Input | Output |
|---|---|---|
| `processTAData(rows)` | TA Excel rows | Dashboard KPIs, charts, heatmap, activeDb/historicalDb |
| `extractPositionsForMapping(activeDb)` | Active DB | Open positions with parsed skills for mapping |
| `processMSDData(rows, benchIds)` | MSD rows + ID list | Bench resources with combined skills, grade, bench tenure |
| `parseBenchEmployeeIds(rows)` | Employee ID sheet | Array of employee ID strings |
| `getMatchScore(posSkills, resSkills)` | Two skill arrays | { score, matched, total } — fuzzy match included |

### Column Mappings

**TA Data (Req_Upload sheet)**
- `Status` → "Open"/"Offered" = active, rest = historical
- `Country` → IN = Offshore, US/CA/MX = Onshore
- `Age` → Aging metrics; Age ≤ 10 = New Reqs WTD
- `Requisition_Status` → "Pre-Approved" = Pre-appr. bucket
- `Primary_Skill_1` + `L3_Skills` → Position required skills
- `Grade` → Position grade level
- `Criticality` → Priority (fallback: age-based)

**MSD Allocation (Sheet1)**
- `Employee Id` → Resource identifier (matched against bench list)
- `Skillsets` + `L3 (Skill Family)` + `L4 (Sub Skill)` → Combined skill pool
- `Grade as per HRIS` → Resource grade (A → 2A → 3A → 3B → 4A → ...)
- `Onshore/Offshore` → Shore classification
- `Bench Ageing(days)` → Bench tenure in days
- `Designation as per HRIS` → Role title
- `Project Name` → Bench projects contain "Bench" keyword

**Employee List**
- `Employee Id` → Single column, filters MSD to bench-only resources

### Skill Matching Logic

1. Skills are parsed from comma/semicolon/plus-separated strings
2. Position skills = `Primary_Skill_1` + `L3_Skills` (from TA data)
3. Resource skills = `Skillsets` + `L4 (Sub Skill)` + `L3 (Skill Family)` (from MSD)
4. Matching uses normalized comparison (case-insensitive) with partial match support
5. Confidence: High ≥80%, Medium 60-79%, Low 40-59%

### Grade Hierarchy
```
A < 1A < 2A < 2B < 3A < 3B < 4A < 4B < 5A < 5B < 6A < 6B < 6C < 7A < 7B < 8A
```

## Extending with Claude Code

```bash
# Open in VS Code
code talentiq/

# Then use Claude Code to:
"Add a chart showing positions grouped by Vertical"
"Make the offshore/onshore filter buttons filter all dashboard data"
"Add grade-based matching penalty to the skill score calculation"
"Create a new page for historical requisition analytics"
"Add the exact bench project program names for tenure calculation"
```

## Data Flow

```
Upload Modal
  ├─ TA Data → processTAData() → Dashboard + extractPositionsForMapping() → Positions
  ├─ Bench IDs → parseBenchEmployeeIds() → ID set
  └─ MSD Data → processMSDData(rows, benchIds) → Bench Resources
                                                        ↓
                                              getMatchScore(pos.skills, res.skills)
                                                        ↓
                                              Skill Mapping Page
                                              ├─ Resource Matches tab
                                              └─ Confidence Overview tab → Excel export
```
