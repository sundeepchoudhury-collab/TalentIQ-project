from __future__ import annotations

import datetime as dt
import html
import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "presentations"
OUT_FILE = OUT_DIR / "TalentIQ_Dashboard_Company_Showcase.pptx"

SLIDE_W = 12192000
SLIDE_H = 6858000


def emu(inches: float) -> int:
    return int(inches * 914400)


COLORS = {
    "white": "FFFFFF",
    "bg": "F8FAFC",
    "slate900": "0F172A",
    "slate800": "1E293B",
    "slate700": "334155",
    "slate600": "475569",
    "slate500": "64748B",
    "slate300": "CBD5E1",
    "slate200": "E2E8F0",
    "slate100": "F1F5F9",
    "teal800": "115E59",
    "teal700": "0F766E",
    "teal600": "0D9488",
    "teal400": "2DD4BF",
    "teal200": "99F6E4",
    "teal100": "CCFBF1",
    "teal50": "F0FDFA",
    "amber": "D97706",
    "amber100": "FEF3C7",
    "red": "DC2626",
    "red100": "FEE2E2",
    "green": "16A34A",
    "green100": "DCFCE7",
    "blue": "2563EB",
    "blue100": "DBEAFE",
    "purple": "7C3AED",
    "purple100": "EDE9FE",
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=False)


def load_metrics() -> dict:
    fallback = {
        "as_of": "2026-06-23",
        "msd_month": "2026-05-01",
        "bench_week": "2026-06-15",
        "stored_reqs": 3595,
        "stored_msd": 15269,
        "stored_bench": 180,
        "kpis": {
            "totalActive": 101,
            "open": 81,
            "offered": 20,
            "newReqs": 11,
            "avgAging": 51.1,
            "offOpen": 37,
            "onOpen": 44,
            "offOffered": 8,
            "onOffered": 12,
            "offAging": 51.2,
            "onAging": 51.0,
        },
        "positions": 81,
        "bench_resources": 97,
        "client_top3": [
            {"name": "PNC Bank", "Open": 14, "Offered": 6},
            {"name": "LPL", "Open": 9, "Offered": 4},
            {"name": "Genentech", "Open": 9, "Offered": 3},
        ],
        "aging": [
            {"bucket": "Pre-appr.", "value": 2, "color": "#5EEAD4"},
            {"bucket": "1-30 d", "value": 47, "color": "#0D9488"},
            {"bucket": "31-60 d", "value": 23, "color": "#64748B"},
            {"bucket": "61-90 d", "value": 9, "color": "#D97706"},
            {"bucket": "91+ d", "value": 20, "color": "#DC2626"},
        ],
    }

    backend = ROOT / "talentiq-backend"
    sys.path.insert(0, str(backend))
    try:
        from sqlalchemy import func
        from app.database import SessionLocal
        from app.models import BenchEmployeeId, MsdAllocation, Requisition
        from app.processors import build_bench_resources, extract_positions, process_dashboard

        db = SessionLocal()
        try:
            latest_req = db.query(func.max(Requisition.requisition_file_date)).scalar()
            latest_msd = db.query(func.max(MsdAllocation.allocation_month)).scalar()
            latest_bench = db.query(func.max(BenchEmployeeId.bench_week_date)).scalar()
            if not latest_req:
                return fallback

            reqs = db.query(Requisition).filter(Requisition.requisition_file_date == latest_req).all()
            msd = db.query(MsdAllocation).filter(MsdAllocation.allocation_month == latest_msd).all() if latest_msd else []
            bench_records = (
                db.query(BenchEmployeeId).filter(BenchEmployeeId.bench_week_date == latest_bench).all()
                if latest_bench
                else []
            )
            dash = process_dashboard(reqs)
            positions = extract_positions(reqs)
            bench_resources = build_bench_resources(msd, [r.employee_id for r in bench_records])
            return {
                **fallback,
                "as_of": latest_req.isoformat(),
                "msd_month": latest_msd.isoformat() if latest_msd else None,
                "bench_week": latest_bench.isoformat() if latest_bench else None,
                "stored_reqs": db.query(Requisition).count(),
                "stored_msd": db.query(MsdAllocation).count(),
                "stored_bench": db.query(BenchEmployeeId).count(),
                "kpis": dash["kpis"],
                "positions": len(positions),
                "bench_resources": len(bench_resources),
                "client_top3": dash["clientBar"][:3],
                "aging": [
                    {**row, "bucket": str(row["bucket"]).replace("\u2013", "-")}
                    for row in dash["agingPipeline"]
                ],
            }
        finally:
            db.close()
    except Exception:
        return fallback


class Slide:
    def __init__(self, title: str = ""):
        self.title = title
        self.items: list[str] = []
        self.shape_id = 2

    def next_id(self) -> int:
        current = self.shape_id
        self.shape_id += 1
        return current

    def rect(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        fill: str = "FFFFFF",
        line: str | None = None,
        radius: bool = False,
        line_width: int = 9525,
    ):
        sid = self.next_id()
        geom = "roundRect" if radius else "rect"
        fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
        if line:
            line_xml = (
                f'<a:ln w="{line_width}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
            )
        else:
            line_xml = '<a:ln><a:noFill/></a:ln>'
        self.items.append(
            f"""
<p:sp>
  <p:nvSpPr><p:cNvPr id="{sid}" name="Shape {sid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
    <a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>
    {fill_xml}
    {line_xml}
  </p:spPr>
</p:sp>"""
        )

    def text(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        paragraphs: list[str] | str,
        size: int = 18,
        color: str = "1E293B",
        bold: bool = False,
        fill: str | None = None,
        line: str | None = None,
        radius: bool = False,
        align: str = "l",
        anchor: str = "t",
        margin: int = 80000,
        name: str = "Text",
    ):
        if isinstance(paragraphs, str):
            paragraphs = [paragraphs]
        sid = self.next_id()
        geom = "roundRect" if radius else "rect"
        fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
        line_xml = (
            f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
            if line
            else '<a:ln><a:noFill/></a:ln>'
        )
        bold_attr = ' b="1"' if bold else ""
        p_xml = []
        for p in paragraphs:
            p_xml.append(
                f"""
    <a:p>
      <a:pPr algn="{align}"/>
      <a:r>
        <a:rPr lang="en-US" sz="{size * 100}"{bold_attr}>
          <a:solidFill><a:srgbClr val="{color}"/></a:solidFill>
          <a:latin typeface="Aptos"/>
        </a:rPr>
        <a:t>{esc(p)}</a:t>
      </a:r>
    </a:p>"""
            )
        self.items.append(
            f"""
<p:sp>
  <p:nvSpPr><p:cNvPr id="{sid}" name="{esc(name)} {sid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
    <a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>
    {fill_xml}
    {line_xml}
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" anchor="{anchor}" lIns="{margin}" tIns="{margin}" rIns="{margin}" bIns="{margin}">
      <a:normAutofit/>
    </a:bodyPr>
    <a:lstStyle/>
    {''.join(p_xml)}
  </p:txBody>
</p:sp>"""
        )

    def line(self, x: float, y: float, w: float, h: float, color: str = "CBD5E1"):
        self.rect(x, y, w, h, color, None)

    def xml(self) -> str:
        return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="{COLORS['bg']}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {''.join(self.items)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""


def add_footer(slide: Slide, n: int):
    slide.line(0.55, 7.08, 12.25, 0.01, COLORS["slate200"])
    slide.text(0.55, 7.12, 3.4, 0.22, "TalentIQ dashboard showcase", 8, COLORS["slate500"])
    slide.text(11.8, 7.12, 0.9, 0.22, str(n), 8, COLORS["slate500"], align="r")


def add_header(slide: Slide, eyebrow: str, title: str, subtitle: str | None = None):
    slide.text(0.6, 0.32, 2.8, 0.28, eyebrow.upper(), 9, COLORS["teal700"], True)
    slide.text(0.6, 0.62, 8.4, 0.48, title, 25, COLORS["slate900"], True)
    if subtitle:
        slide.text(0.62, 1.11, 8.8, 0.36, subtitle, 11, COLORS["slate500"])
    slide.text(10.8, 0.45, 1.9, 0.36, "TalentIQ", 17, COLORS["teal700"], True, align="r")


def add_card(slide: Slide, x, y, w, h, label, value, color="teal600", sub=None):
    slide.text(x, y, w, h, "", fill=COLORS["white"], line=COLORS["slate200"], radius=True)
    slide.line(x, y, w, 0.04, COLORS[color])
    slide.text(x + 0.12, y + 0.15, w - 0.24, 0.26, label.upper(), 8, COLORS["slate500"], True)
    slide.text(x + 0.12, y + 0.48, w - 0.24, 0.42, value, 25, COLORS["slate900"], True)
    if sub:
        slide.text(x + 0.12, y + 0.95, w - 0.24, 0.28, sub, 9, COLORS["slate500"])


def add_bullets(slide: Slide, x, y, w, h, bullets, size=13, title=None, fill=None):
    if fill:
        slide.text(x, y, w, h, "", fill=fill, line=COLORS["slate200"], radius=True)
        x += 0.12
        y += 0.1
        w -= 0.24
        h -= 0.2
    paragraphs = []
    if title:
        paragraphs.append(title)
    paragraphs += [f"- {b}" for b in bullets]
    slide.text(x, y, w, h, paragraphs, size, COLORS["slate700"], bold=False)


def add_flow(slide: Slide, x, y, steps, colors):
    box_w = 2.05
    gap = 0.32
    for i, step in enumerate(steps):
        bx = x + i * (box_w + gap)
        slide.text(bx, y, box_w, 0.86, step, 12, COLORS["slate800"], True, fill=COLORS[colors[i]], line=COLORS["slate200"], radius=True, align="ctr", anchor="mid")
        if i < len(steps) - 1:
            slide.line(bx + box_w + 0.05, y + 0.42, gap - 0.1, 0.03, COLORS["teal600"])
            slide.text(bx + box_w + gap - 0.18, y + 0.29, 0.22, 0.24, ">", 13, COLORS["teal700"], True, align="ctr")


def add_bar_chart(slide: Slide, x, y, w, h, data, max_value=None):
    max_value = max_value or max([d["value"] for d in data] + [1])
    bar_h = h / len(data) - 0.09
    for i, row in enumerate(data):
        by = y + i * (bar_h + 0.11)
        slide.text(x, by, 1.35, bar_h, row["label"], 9, COLORS["slate700"], True, anchor="mid")
        slide.rect(x + 1.45, by + 0.09, w - 2.0, bar_h - 0.18, COLORS["slate100"], None, radius=True)
        fill_w = (w - 2.0) * (row["value"] / max_value)
        slide.rect(x + 1.45, by + 0.09, max(fill_w, 0.06), bar_h - 0.18, row.get("color", COLORS["teal600"]), None, radius=True)
        slide.text(x + w - 0.42, by, 0.38, bar_h, str(row["value"]), 9, COLORS["slate700"], True, align="r", anchor="mid")


def add_pipeline(slide: Slide, x, y, w, data):
    total = sum(row["value"] for row in data) or 1
    cur = x
    for row in data:
        seg_w = w * row["value"] / total
        if seg_w < 0.22:
            seg_w = 0.22
        color = row.get("color", "#0D9488").replace("#", "")
        slide.rect(cur, y, seg_w, 0.38, color, None)
        slide.text(cur, y + 0.45, max(seg_w, 0.9), 0.44, [row["bucket"], str(row["value"])], 8, COLORS["slate600"], align="ctr")
        cur += seg_w


def slide_cover(metrics):
    s = Slide("Cover")
    s.rect(0, 0, 13.333, 7.5, COLORS["slate900"])
    s.rect(0, 0, 4.2, 7.5, COLORS["teal800"])
    s.rect(4.2, 0, 0.08, 7.5, COLORS["teal400"])
    s.text(0.75, 0.82, 3.15, 0.28, "INTERNAL PRODUCT SHOWCASE", 9, COLORS["teal100"], True)
    s.text(0.73, 1.35, 5.8, 0.92, "TalentIQ", 45, COLORS["white"], True)
    s.text(0.78, 2.25, 5.3, 0.56, "Recruitment intelligence and bench-to-demand matching for delivery teams", 20, COLORS["teal100"], True)
    s.text(5.05, 1.0, 6.9, 0.95, "One dashboard for staffing demand, bench supply, skill fit, and operational follow-through.", 27, COLORS["white"], True)
    s.text(5.1, 2.25, 6.1, 0.62, "Built for company leaders, Talent Acquisition, Delivery, Resource Management, and account teams who need a shared source of truth.", 15, "CBD5E1")
    pills = ["Dashboard", "Skill Mapping", "Bench Resources", "AI Matching", "Resource Search"]
    for i, pill in enumerate(pills):
        s.text(5.08 + (i % 3) * 2.15, 3.2 + (i // 3) * 0.55, 1.9, 0.32, pill, 10, COLORS["teal100"], True, fill="123D3A", line="2DD4BF", radius=True, align="ctr", anchor="mid")
    add_card(s, 5.05, 4.55, 1.75, 1.05, "Open", str(metrics["kpis"]["open"]), "teal400", "positions")
    add_card(s, 7.0, 4.55, 1.75, 1.05, "Bench", str(metrics["bench_resources"]), "green", "matched resources")
    add_card(s, 8.95, 4.55, 1.75, 1.05, "Active", str(metrics["kpis"]["totalActive"]), "amber", "requisitions")
    s.text(5.05, 6.1, 6.2, 0.3, f"Latest TA snapshot: {metrics['as_of']} | MSD month: {metrics['msd_month']} | Bench week: {metrics['bench_week']}", 10, "CBD5E1")
    return s


def slide_problem():
    s = Slide("Problem")
    add_header(s, "Why TalentIQ exists", "The company problem: demand and supply move faster than spreadsheets", "TalentIQ turns weekly operational data into a shared staffing cockpit.")
    cards = [
        ("Fragmented inputs", ["TA requisitions, MSD allocations, and bench IDs live in separate files.", "Leaders spend time reconciling rather than deciding."]),
        ("Hidden demand risk", ["Aging openings, onshore/offshore split, and client concentration are hard to read quickly.", "Leakage and delayed starts need earlier visibility."]),
        ("Slow resource matching", ["Skill, grade, shore, tenure, and project history are matched manually.", "Good internal candidates can be missed while new hiring continues."]),
    ]
    for i, (title, bullets) in enumerate(cards):
        x = 0.7 + i * 4.1
        s.text(x, 1.85, 3.55, 2.0, "", fill=COLORS["white"], line=COLORS["slate200"], radius=True)
        s.text(x + 0.22, 2.1, 3.1, 0.34, title, 16, COLORS["slate900"], True)
        add_bullets(s, x + 0.22, 2.65, 3.1, 0.9, bullets, 11)
    s.text(1.0, 5.15, 11.1, 0.72, "TalentIQ provides the operating layer between recruiting demand and available delivery capacity.", 23, COLORS["teal700"], True, align="ctr")
    add_footer(s, 2)
    return s


def slide_dashboard(metrics):
    k = metrics["kpis"]
    s = Slide("Executive Dashboard")
    add_header(s, "Dashboard", "Executive view of recruiting health", "Latest snapshot turns raw TA data into KPIs, aging signals, client demand, and shore split.")
    card_data = [
        ("Active", k["totalActive"], "reqs"),
        ("Open", k["open"], "positions"),
        ("Offered", k["offered"], "in offer"),
        ("New", k["newReqs"], "<= 10 days"),
        ("Avg age", f"{k['avgAging']}d", "active reqs"),
    ]
    for i, (label, value, sub) in enumerate(card_data):
        add_card(s, 0.6 + i * 2.48, 1.55, 2.15, 1.08, label, str(value), ["teal600", "teal600", "green", "blue", "amber"][i], sub)
    client_data = [
        {"label": row["name"], "value": row["Open"] + row["Offered"], "color": COLORS["teal600"]}
        for row in metrics["client_top3"]
    ]
    s.text(0.72, 3.05, 4.9, 0.34, "Top client demand", 15, COLORS["slate900"], True)
    add_bar_chart(s, 0.7, 3.45, 5.15, 1.85, client_data)
    s.text(6.3, 3.05, 5.6, 0.34, "Aging pipeline", 15, COLORS["slate900"], True)
    add_pipeline(s, 6.3, 3.55, 5.95, metrics["aging"])
    s.text(6.3, 4.8, 5.8, 0.58, f"Open split: Offshore {k['offOpen']} / Onshore {k['onOpen']} | Offered split: Offshore {k['offOffered']} / Onshore {k['onOffered']}", 12, COLORS["slate700"], True, fill=COLORS["white"], line=COLORS["slate200"], radius=True, anchor="mid")
    add_footer(s, 3)
    return s


def slide_data_intake(metrics):
    s = Slide("Data Intake")
    add_header(s, "Data governance", "Controlled weekly intake keeps the dashboard credible", "Uploads are period-tagged and the backend keeps history while the UI reads the latest snapshot.")
    steps = ["TA data\nexact date", "MSD allocation\nmonth", "Bench IDs\nISO week", "PostgreSQL\nsnapshots"]
    add_flow(s, 0.75, 1.75, steps, ["blue100", "teal100", "green100", "amber100"])
    add_bullets(s, 0.8, 3.05, 5.3, 2.1, [
        "Duplicate-period guardrails prevent accidental overwrite.",
        "Replace flow is explicit when a period already exists.",
        "Upload modal shows already-loaded periods before submission.",
        "All historical snapshots are retained for audit and trend analysis.",
    ], 13, fill=COLORS["white"])
    add_bullets(s, 6.55, 3.05, 5.5, 2.1, [
        f"Stored requisition rows: {metrics['stored_reqs']}",
        f"Stored MSD allocation rows: {metrics['stored_msd']}",
        f"Stored bench ID rows: {metrics['stored_bench']}",
        "Installer creates database tables and installs dependencies for local transfer.",
    ], 13, fill=COLORS["white"])
    add_footer(s, 4)
    return s


def slide_pipeline():
    s = Slide("Pipeline Analytics")
    add_header(s, "Recruitment analytics", "What the dashboard solves for Talent Acquisition and leadership", "The dashboard converts requisition records into operational signals for follow-up.")
    items = [
        ("Open and Offered tracking", "Measures active demand and offer-stage conversion by latest TA snapshot."),
        ("Aging management", "Buckets requisitions into pre-approved, 1-30, 31-60, 61-90, and 91+ day risk bands."),
        ("Client concentration", "Shows which client accounts are driving demand and require staffing focus."),
        ("Onshore/offshore split", "Separates demand by location model so matching uses the right delivery pool."),
        ("Leakage visibility", "Estimates daily and cumulative revenue exposure from delayed fulfillment."),
        ("Grade distribution", "Surfaces level mix for open positions to align hiring and bench redeployment."),
    ]
    for i, (title, body) in enumerate(items):
        x = 0.7 + (i % 2) * 6.05
        y = 1.6 + (i // 2) * 1.28
        s.text(x, y, 5.55, 0.95, "", fill=COLORS["white"], line=COLORS["slate200"], radius=True)
        s.text(x + 0.18, y + 0.13, 5.1, 0.24, title, 13, COLORS["teal700"], True)
        s.text(x + 0.18, y + 0.44, 5.1, 0.34, body, 10, COLORS["slate600"])
    add_footer(s, 5)
    return s


def slide_positions(metrics):
    s = Slide("Skill Demand")
    add_header(s, "Skill demand", "Open positions become match-ready demand records", "TalentIQ extracts role, client, priority, grade, skills, age, location, and LOB/vertical from TA data.")
    add_card(s, 0.75, 1.55, 2.25, 1.15, "Match-ready", str(metrics["positions"]), "teal600", "open positions")
    add_card(s, 3.25, 1.55, 2.25, 1.15, "Skills", "Parsed", "blue", "Primary + L3")
    add_card(s, 5.75, 1.55, 2.25, 1.15, "Priority", "Aging", "amber", "risk signal")
    add_card(s, 8.25, 1.55, 2.25, 1.15, "Grade", "+/- 2", "green", "compatibility")
    add_bullets(s, 0.85, 3.25, 5.3, 2.0, [
        "Only Open requisitions enter the skill mapping workflow.",
        "Skills are normalized from primary skill and L3 skill fields.",
        "Country data becomes onshore/offshore demand context.",
        "Priority can use criticality or aging-based fallback.",
    ], 13, fill=COLORS["white"])
    add_bullets(s, 6.55, 3.25, 5.2, 2.0, [
        "Company context: demand is no longer just a row in a workbook.",
        "Each position becomes a staffing object that can be matched, filtered, exported, and explained.",
    ], 14, fill=COLORS["teal50"])
    add_footer(s, 6)
    return s


def slide_bench(metrics):
    s = Slide("Bench Resources")
    add_header(s, "Bench resources", "A governed inventory of internal supply", "Combines bench employee IDs with latest MSD allocation data and manual corrections.")
    add_card(s, 0.72, 1.55, 2.25, 1.15, "Matched", str(metrics["bench_resources"]), "green", "bench resources")
    add_card(s, 3.25, 1.55, 2.25, 1.15, "Sources", "Upload + manual", "teal600", "tracked")
    add_card(s, 5.78, 1.55, 2.25, 1.15, "Snapshot", "Effective date", "blue", "controlled updates")
    add_card(s, 8.3, 1.55, 2.25, 1.15, "Export", "Excel", "amber", "operational handoff")
    add_bullets(s, 0.82, 3.05, 5.25, 2.3, [
        "Manual ID entry supports resources that should be included even when a file is incomplete.",
        "Inventory marks source as Manual or File Upload.",
        "Effective-date logic prevents editing old snapshots by mistake.",
        "Columns, filters, search, delete, and export support daily operational use.",
    ], 12, fill=COLORS["white"])
    s.text(6.65, 3.08, 5.0, 0.42, "Manual entry redirect", 16, COLORS["slate900"], True)
    s.text(6.65, 3.58, 5.0, 1.1, "The upload flow now includes a button that takes users directly to Skill Mapping > Bench Resources and opens the manual employee ID section.", 15, COLORS["teal700"], True, fill=COLORS["teal50"], line=COLORS["teal200"], radius=True)
    add_footer(s, 7)
    return s


def slide_matching():
    s = Slide("Match Engine")
    add_header(s, "Skill mapping", "How TalentIQ ranks internal candidates for open positions", "The match engine combines skill fit, shore alignment, grade compatibility, and bench context.")
    add_flow(s, 0.72, 1.65, ["Position\nrequirements", "Same-shore\nresource pool", "Skill + grade\nscoring", "Ranked\ncandidates", "Excel / AI\nfollow-up"], ["blue100", "teal100", "green100", "amber100", "purple100"])
    add_bullets(s, 0.85, 3.05, 5.4, 2.35, [
        "Fuzzy skill comparison handles exact and partial matches.",
        "Confidence bands: High >= 80, Medium 60-79, Low 40-59.",
        "Grade compatibility allows nearby levels and avoids over-filtering unknown grades.",
        "Resource Matches and Confidence Overview support both individual and portfolio review.",
    ], 12, fill=COLORS["white"])
    add_bullets(s, 6.55, 3.05, 5.4, 2.35, [
        "Company value: redeploy bench resources sooner.",
        "Reduce dependency on manual spreadsheet matching.",
        "Focus recruiters and delivery leaders on the highest-confidence staffing options.",
    ], 14, fill=COLORS["teal50"])
    add_footer(s, 8)
    return s


def slide_ai():
    s = Slide("AI Matching")
    add_header(s, "AI assistance", "LLM matching adds reasoning on top of structured scoring", "TalentIQ can call OpenAI for explainable recommendations when an API key is configured.")
    s.text(0.85, 1.65, 3.25, 3.2, "Structured AI output", 17, COLORS["slate900"], True, fill=COLORS["white"], line=COLORS["slate200"], radius=True)
    add_bullets(s, 1.02, 2.18, 2.8, 1.8, [
        "Summary",
        "Recommendation",
        "Top matches",
        "Resource-level rationale",
    ], 13)
    s.text(4.95, 1.65, 3.25, 3.2, "Governed calls", 17, COLORS["slate900"], True, fill=COLORS["white"], line=COLORS["slate200"], radius=True)
    add_bullets(s, 5.12, 2.18, 2.8, 1.8, [
        "Uses candidate caps",
        "Skips no-skill positions",
        "Estimates call volume and cost",
        "Returns JSON only",
    ], 13)
    s.text(9.05, 1.65, 3.25, 3.2, "Cached results", 17, COLORS["slate900"], True, fill=COLORS["white"], line=COLORS["slate200"], radius=True)
    add_bullets(s, 9.22, 2.18, 2.8, 1.8, [
        "Cache key by position and resources",
        "Avoids repeated spend",
        "Preserves repeatable output",
        "Supports rematch when inputs change",
    ], 13)
    s.text(1.05, 5.35, 11.2, 0.54, "Business use: use deterministic scoring for scale, then AI for nuanced shortlists and decision support.", 19, COLORS["teal700"], True, align="ctr")
    add_footer(s, 9)
    return s


def slide_search_history():
    s = Slide("Resource Search")
    add_header(s, "Resource search and history", "A faster way to answer staffing follow-up questions", "TalentIQ exposes a searchable resource view and employee project history across uploaded MSD months.")
    add_bullets(s, 0.85, 1.65, 5.2, 2.2, [
        "Search all MSD resources by employee, skill, designation, client, or project.",
        "Reconstruct one employee's project history across uploaded months.",
        "See current allocation details, skills, grade, LOB, vertical, and location.",
    ], 13, fill=COLORS["white"])
    add_bullets(s, 6.55, 1.65, 5.2, 2.2, [
        "For account teams: confirm whether a resource has relevant client or domain experience.",
        "For resource managers: validate availability and recent project movement.",
        "For leaders: reduce one-off data pulls from operations teams.",
    ], 13, fill=COLORS["teal50"])
    s.text(1.2, 4.75, 10.8, 0.55, "The result is a practical workflow: search, inspect history, shortlist, match, export.", 21, COLORS["slate900"], True, align="ctr")
    add_footer(s, 10)
    return s


def slide_architecture():
    s = Slide("Architecture")
    add_header(s, "Architecture and portability", "Designed as a local company application with a reliable setup path", "The start and setup scripts make the project transferable to another Windows machine with prerequisites installed.")
    add_flow(s, 1.0, 1.6, ["React UI\nlocalhost:5173", "FastAPI\nlocalhost:8000", "PostgreSQL\ntalentiq DB", "Excel exports\nPower users"], ["blue100", "teal100", "green100", "amber100"])
    add_bullets(s, 0.95, 3.1, 5.2, 2.15, [
        "setup.bat configures DATABASE_URL and initializes tables.",
        "start.bat creates the Python venv, installs backend dependencies, installs npm packages, and launches services.",
        "Tables: requisitions, msd_allocations, bench_employee_ids, ai_match_cache.",
    ], 12, fill=COLORS["white"])
    add_bullets(s, 6.55, 3.1, 5.2, 2.15, [
        "Company benefit: low-friction local rollout.",
        "Data remains in PostgreSQL with explicit snapshot dates.",
        "API boundary allows future hosting, authentication, or enterprise integration.",
    ], 13, fill=COLORS["teal50"])
    add_footer(s, 11)
    return s


def slide_impact():
    s = Slide("Impact")
    add_header(s, "Business impact", "What TalentIQ changes for the company", "A shared operating rhythm for demand, supply, matching, and follow-through.")
    impacts = [
        ("Leadership", "Portfolio visibility into open demand, aging, client concentration, and staffing risk."),
        ("Talent Acquisition", "Cleaner upload governance, faster pipeline review, and LOB-filtered requisition intake."),
        ("Delivery", "Better internal candidate discovery before escalating external hiring."),
        ("Resource Management", "Managed bench inventory, manual corrections, exports, and effective-date controls."),
    ]
    for i, (team, value) in enumerate(impacts):
        x = 0.85 + (i % 2) * 5.85
        y = 1.58 + (i // 2) * 1.45
        s.text(x, y, 5.2, 1.05, "", fill=COLORS["white"], line=COLORS["slate200"], radius=True)
        s.text(x + 0.18, y + 0.14, 1.7, 0.32, team, 15, COLORS["teal700"], True)
        s.text(x + 1.72, y + 0.13, 3.2, 0.55, value, 11, COLORS["slate600"])
    s.text(1.0, 5.05, 11.25, 0.55, "Recommended demo storyline: Upload data -> review dashboard -> inspect bench resources -> run skill mapping -> use AI shortlist -> export actions.", 18, COLORS["slate900"], True, align="ctr", fill=COLORS["teal50"], line=COLORS["teal200"], radius=True)
    add_footer(s, 12)
    return s


def slide_close():
    s = Slide("Close")
    s.rect(0, 0, 13.333, 7.5, COLORS["slate900"])
    s.text(0.85, 0.88, 2.4, 0.28, "CLOSING MESSAGE", 9, COLORS["teal200"], True)
    s.text(0.82, 1.42, 9.4, 0.75, "TalentIQ is a staffing decision system, not just a dashboard.", 31, COLORS["white"], True)
    s.text(0.86, 2.45, 7.9, 0.76, "It connects company demand, available internal supply, skill evidence, and governed operations into one repeatable workflow.", 18, "CBD5E1")
    add_bullets(s, 1.0, 3.8, 5.2, 1.5, [
        "Reduce manual reconciliation.",
        "Prioritize aging and high-value demand.",
        "Redeploy internal talent faster.",
        "Create a defensible weekly staffing rhythm.",
    ], 15)
    s.text(8.0, 4.05, 3.2, 1.05, "Next step:\nDemo with live data and confirm rollout owners.", 18, COLORS["teal100"], True, fill="123D3A", line=COLORS["teal400"], radius=True, align="ctr", anchor="mid")
    return s


def slide_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"""


def content_types(num_slides: int) -> str:
    slide_overrides = "\n".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, num_slides + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  {slide_overrides}
</Types>"""


def presentation_xml(num_slides: int) -> str:
    sld_ids = "\n".join(
        f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, num_slides + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>{sld_ids}</p:sldIdLst>
  <p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle>
    <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>
    <a:lvl1pPr marL="0" indent="0"><a:defRPr sz="1800" kern="1200"><a:latin typeface="Aptos"/></a:defRPr></a:lvl1pPr>
  </p:defaultTextStyle>
</p:presentation>"""


def presentation_rels(num_slides: int) -> str:
    rels = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    ]
    for i in range(1, num_slides + 1):
        rels.append(
            f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {' '.join(rels)}
</Relationships>"""


def package_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def slide_master() -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"><a:latin typeface="Aptos Display"/></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="Aptos"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="Aptos"/></a:defRPr></a:lvl1pPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>"""


def slide_master_rels() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"""


def slide_layout() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"""


def theme() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TalentIQ Theme">
  <a:themeElements>
    <a:clrScheme name="TalentIQ">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="334155"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="0D9488"/></a:accent1><a:accent2><a:srgbClr val="2563EB"/></a:accent2>
      <a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4>
      <a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="7C3AED"/></a:accent6>
      <a:hlink><a:srgbClr val="0D9488"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="TalentIQ Fonts">
      <a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="TalentIQ Format">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>"""


def core_props() -> str:
    now = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>TalentIQ Dashboard Company Showcase</dc:title>
  <dc:subject>Editable PowerPoint deck for TalentIQ</dc:subject>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>"""


def app_props(num_slides: int) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft PowerPoint</Application>
  <PresentationFormat>On-screen Show (16:9)</PresentationFormat>
  <Slides>{num_slides}</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <Company>TalentIQ</Company>
</Properties>"""


def misc_part(name: str) -> str:
    if name == "presProps":
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>"""
    if name == "viewProps":
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr></p:viewPr>"""
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>"""


def build_deck():
    metrics = load_metrics()
    slides = [
        slide_cover(metrics),
        slide_problem(),
        slide_dashboard(metrics),
        slide_data_intake(metrics),
        slide_pipeline(),
        slide_positions(metrics),
        slide_bench(metrics),
        slide_matching(),
        slide_ai(),
        slide_search_history(),
        slide_architecture(),
        slide_impact(),
        slide_close(),
    ]

    OUT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT_FILE, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types(len(slides)))
        z.writestr("_rels/.rels", package_rels())
        z.writestr("docProps/core.xml", core_props())
        z.writestr("docProps/app.xml", app_props(len(slides)))
        z.writestr("ppt/presentation.xml", presentation_xml(len(slides)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels(len(slides)))
        z.writestr("ppt/presProps.xml", misc_part("presProps"))
        z.writestr("ppt/viewProps.xml", misc_part("viewProps"))
        z.writestr("ppt/tableStyles.xml", misc_part("tableStyles"))
        z.writestr("ppt/theme/theme1.xml", theme())
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master())
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", slide_master_rels())
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout())
        for i, slide in enumerate(slides, start=1):
            z.writestr(f"ppt/slides/slide{i}.xml", slide.xml())
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", slide_rels())

    print(json.dumps({"output": str(OUT_FILE), "slides": len(slides), "metrics": metrics}, indent=2))


if __name__ == "__main__":
    build_deck()
