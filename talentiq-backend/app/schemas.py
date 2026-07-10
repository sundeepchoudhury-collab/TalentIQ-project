"""
app/schemas.py
─────────────────────────────────────────────────────────────
Pydantic models — these define the SHAPE of JSON responses
returned by our API. They're what the React frontend will
receive and consume.

We mirror the structures produced by the existing
dataProcessor.js so the frontend changes are minimal.
"""

from typing import List, Optional
from pydantic import BaseModel


# ── Dashboard ────────────────────────────────────────────────
class Kpis(BaseModel):
    totalActive: int
    open: int
    offered: int
    newReqs: int
    avgAging: float
    offOpen: int
    onOpen: int
    offOffered: int
    onOffered: int
    offAging: float
    onAging: float


class ClientBarRow(BaseModel):
    name: str
    Open: int
    Offered: int


class AgingBucket(BaseModel):
    bucket: str
    value: int
    color: str


class LeakageRow(BaseModel):
    name: str
    dailyLeakage: float
    totalLeakage: float


class HeatmapRow(BaseModel):
    client: str
    # Per-bucket counts: keys like preOff, preOn, preT, d30Off, d30On, d30T, ...
    # We use a flexible model_config to allow extra fields.
    model_config = {"extra": "allow"}


class OffOnBarRow(BaseModel):
    name: str
    Offshore: int
    Onshore: int


class DashboardResponse(BaseModel):
    kpis: Kpis
    clientBar: List[ClientBarRow]
    agingPipeline: List[AgingBucket]
    leakage: List[LeakageRow]
    heatmap: List[dict]      # flexible; same as JS
    heatmapTotals: dict
    offOnBar: List[OffOnBarRow]


# ── Skill Mapping ────────────────────────────────────────────
class Position(BaseModel):
    id: str
    client: str
    customer: str = ""
    role: str
    jobStartDate: Optional[str] = None
    todaysDate: Optional[str] = None
    billingRate: Optional[float] = None
    skills: List[str]
    priority: str
    aging: int
    location: str            # "Offshore" | "Onshore"
    grade: str
    vertical: str
    lob: str


class BenchResource(BaseModel):
    id: str
    name: str
    grade: str
    designation: str
    location: str
    workLocation: str
    division: str
    lob: str
    vertical: str
    skills: List[str]
    benchDays: Optional[int]
    benchProject: Optional[str]
    currentProject: str
    available: str = "Immediate"


class MatchScore(BaseModel):
    score: int               # 0–100
    matched: List[str]
    total: int


class ResourceMatch(BaseModel):
    resource: BenchResource
    score: int
    matched: List[str]
    total: int
    grade_compatible: bool


class PositionMatchesResponse(BaseModel):
    position: Position
    matches: List[ResourceMatch]


# ── Upload ───────────────────────────────────────────────────
class UploadResponse(BaseModel):
    rows_inserted: int
    message: str
    period: str          # ISO date / month / week that was tagged


# ── Data status (which periods are loaded?) ──────────────────
class DataStatus(BaseModel):
    requisitions: dict   # {"latest": "2024-03-15", "all_dates": [...], "row_count": N}
    msd_allocations: dict
    bench_employee_ids: dict
