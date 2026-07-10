// src/pages/ConfidenceOverviewTab.jsx
import { useState, useMemo } from "react";
import { C } from "../theme";
import { Card, SectionTitle, GradeBadge, PriorityDot, ConfBadge } from "../components/ui";
import { getMatchScore, isSameShore } from "../dataProcessor";
import { downloadMultiSheetExcel } from "../utils/excel";

function confidenceFromScore(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  if (score >= 40) return "Low";
  return "Below Threshold";
}

function normalizeId(id) {
  return String(id || "").trim();
}

function indexLLMMatches(aiResultsByReq) {
  const out = {};
  Object.entries(aiResultsByReq || {}).forEach(([reqId, result]) => {
    out[reqId] = Object.fromEntries((result?.matches || []).map((m) => [normalizeId(m.id), m]));
  });
  return out;
}

function buildUniqueConfidenceCounts(overviewData) {
  const bestByResource = new Map();
  overviewData.forEach((position) => {
    (position.matchedResources || []).forEach((resource) => {
      const id = normalizeId(resource.id || resource.employee_id || resource.name);
      if (!id) return;
      const score = Number(resource.score || 0);
      const previous = bestByResource.get(id);
      if (previous == null || score > previous) bestByResource.set(id, score);
    });
  });

  const counts = { high: 0, medium: 0, low: 0 };
  bestByResource.forEach((score) => {
    if (score >= 80) counts.high += 1;
    else if (score >= 60) counts.medium += 1;
    else if (score >= 40) counts.low += 1;
  });
  return counts;
}

function buildExportSheets(positions, bench, overviewData, aiResultsByReq = {}) {
  const aiByReq = indexLLMMatches(aiResultsByReq);
  const fullMapping = [];
  positions.forEach((pos) => {
    const allMatches = bench
      .filter((r) => isSameShore(pos.location, r.location))
      .map((r) => {
        const { score, matched, total } = getMatchScore(pos.skills, r.skills);
        const confidence = confidenceFromScore(score);
        return { ...r, score, matched, total, confidence };
      })
      .sort((a, b) => b.score - a.score);
    const aiMatchesByResource = aiByReq[normalizeId(pos.id)] || {};
    const posBase = {
      "Req ID": pos.id, "Role": pos.role, "Client": pos.client, "Priority": pos.priority,
      "Position Grade": pos.grade || "", "Position Location": pos.location,
      "Aging (Days)": pos.aging, "Required Skills": pos.skills.join(", "),
      "Required Skill Count": pos.skills.length,
    };
    if (allMatches.length === 0) {
      fullMapping.push({ ...posBase, "Resource ID": "", "Resource Name": "(no bench resources)", "Resource Grade": "", "Resource Location": "", "Bench Days": "", "Designation": "", "Resource Skills": "", "Fuzzy Matched Skills": "", "Fuzzy Match Score (%)": "", "Fuzzy Confidence": "None", "LLM Match Score (%)": "", "LLM Confidence": "", "LLM Reasoning": "", "LLM Strengths": "", "LLM Gaps": "" });
      return;
    }
    allMatches.forEach((r) => {
      const ai = aiMatchesByResource[normalizeId(r.id)];
      fullMapping.push({
        ...posBase,
        "Resource ID": r.id,
        "Resource Name": r.name,
        "Resource Grade": r.grade || "",
        "Resource Location": r.location,
        "Bench Days": r.benchDays || "",
        "Designation": r.designation || "",
        "Resource Skills": r.skills.join(", "),
        "Fuzzy Matched Skills": r.matched.join(", "),
        "Fuzzy Match Score (%)": r.score,
        "Fuzzy Confidence": r.confidence,
        "LLM Match Score (%)": ai?.score ?? "",
        "LLM Confidence": ai?.confidence || "",
        "LLM Reasoning": ai?.reasoning || "",
        "LLM Strengths": (ai?.strengths || []).join(", "),
        "LLM Gaps": (ai?.gaps || []).join(", "),
      });
    });
  });
  const summary = overviewData.map((p) => ({
    "LLM Top Match": (aiResultsByReq[normalizeId(p.id)]?.matches || [])[0]?.id || "",
    "LLM Top Score (%)": (aiResultsByReq[normalizeId(p.id)]?.matches || [])[0]?.score ?? "",
    "LLM Top Confidence": (aiResultsByReq[normalizeId(p.id)]?.matches || [])[0]?.confidence || "",
    "Req ID": p.id, "Role": p.role, "Client": p.client, "Priority": p.priority,
    "Grade": p.grade || "", "Location": p.location, "Aging (Days)": p.aging,
    "Required Skills": p.skills.join(", "),
    "High (80%+)": p.high, "Medium (60–79%)": p.medium, "Low (40–59%)": p.low, "Total ≥40%": p.total,
    "Best Match Score (%)": p.matchedResources.length ? Math.max(...p.matchedResources.map((r) => r.score)) : 0,
  }));
  return [{ name: "Full Mapping", data: fullMapping }, { name: "Position Summary", data: summary }];
}

// ─── Sort accessor per column ───────────────────────────────
// Priority handles both formats: "P0"/"P1"/... and "High"/"Medium"/"Low"
const COL_KEYS = {
  "Req ID":   (r) => r.id,
  "Role":     (r) => r.role,
  "Client":   (r) => r.client,
  "Grade":    (r) => r.grade || "",
  "Priority": (r) => {
    const p = String(r.priority || "").toUpperCase().trim();
    // P0/P1/P2/P3 format — lower number = higher priority, sort numerically.
    // Loose regex so "P0", "P0 - Critical", "P 0", etc. all match.
    const m = p.match(/^P\s*(\d+)/);
    if (m) return Number(m[1]);
    // High/Medium/Low fallback
    if (p === "HIGH") return 0;
    if (p === "MEDIUM") return 1;
    if (p === "LOW") return 2;
    return 99; // unknown → last
  },
  "High":     (r) => r.high,
  "Med":      (r) => r.medium,
  "Low":      (r) => r.low,
  "Total":    (r) => r.total,
  "Best":     (r) => r.high > 0 ? 2 : r.medium > 0 ? 1 : r.low > 0 ? 0 : -1,
};

// 3-state sort icon: null=unsorted, desc=↓, asc=↑
function SortIcon({ active, dir }) {
  if (!active) return <span style={{ opacity: 0.35, fontSize: 9, marginLeft: 4 }}>⇅</span>;
  return <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 700 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

function ToggleSwitch({ checked, disabled, label, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, color: checked ? "#5B21B6" : C.slate500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <span style={{ width: 30, height: 17, borderRadius: 999, background: checked ? "#7C3AED" : C.slate300, position: "relative", transition: "background 0.12s" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 15 : 2, width: 13, height: 13, borderRadius: "50%", background: C.white, boxShadow: "0 1px 2px rgba(15,23,42,0.25)", transition: "left 0.12s" }} />
      </span>
      {label}
    </label>
  );
}

const COLS = [
  { k: "Req ID",   align: "left",   wide: true },
  { k: "Role",     align: "left",   wide: true },
  { k: "Client",   align: "left",   wide: true },
  { k: "Grade",    align: "center" },
  // Priority starts ascending → P0 (most urgent) appears first on the first click
  { k: "Priority", align: "center", initialDir: "asc" },
  { k: "High",     align: "center", accentColor: "#86EFAC" },
  { k: "Med",      align: "center", accentColor: "#FDE68A" },
  { k: "Low",      align: "center", accentColor: "#FECACA" },
  { k: "Total",    align: "center" },
  { k: "Best",     align: "center" },
];

export default function ConfidenceOverviewTab({ positions, bench, overviewData, onSelectPosition, aiResultsByReq = {}, aiStatus = {} }) {
  // Single state object → atomic updates, no chance of col/dir being out of sync
  const [sort, setSort] = useState({ col: null, dir: null });
  const uniqueConfidenceCounts = useMemo(
    () => buildUniqueConfidenceCounts(overviewData),
    [overviewData]
  );

  // 3-state cycle, with per-column initial direction:
  //   click 1 → initialDir (default "desc", but Priority is "asc")
  //   click 2 → opposite direction
  //   click 3 → reset (no sort, no highlight)
  const handleSort = (col, initialDir = "desc") => {
    setSort((prev) => {
      if (prev.col !== col) return { col, dir: initialDir };
      if (prev.dir === initialDir) return { col, dir: initialDir === "desc" ? "asc" : "desc" };
      return { col: null, dir: null };
    });
  };

  const sorted = useMemo(() => {
    if (!sort.col || !sort.dir || !COL_KEYS[sort.col]) return overviewData;
    const fn = COL_KEYS[sort.col];
    return [...overviewData].sort((a, b) => {
      const av = fn(a), bv = fn(b);
      if (typeof av === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [overviewData, sort.col, sort.dir]);

  const handleDownload = () => {
    if (!positions.length) { alert("No positions to export."); return; }
    const sheets = buildExportSheets(positions, bench, overviewData, aiResultsByReq);
    downloadMultiSheetExcel(sheets, `TalentIQ_Skill_Mapping_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <SectionTitle>Confidence Overview — All Positions</SectionTitle>
        <span style={{ fontSize: 11, color: aiStatus?.lastRunAt ? "#5B21B6" : C.slate400, fontWeight: 600 }}>
          {aiStatus?.loading
            ? `AI rematch running ${aiStatus.done}/${aiStatus.total}`
            : aiStatus?.lastRunAt
              ? `LLM comparison included for ${Object.keys(aiResultsByReq).length} reqs`
              : "Run Match with AI above to fill LLM comparison columns"}
        </span>
        <button
          onClick={handleDownload}
          disabled={aiStatus?.loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, border: `1px solid ${C.teal400}`, background: C.teal50, color: C.teal700, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.teal600; e.currentTarget.style.color = C.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.teal50; e.currentTarget.style.color = C.teal700; }}
        >↓ Download Excel (Full)</button>
      </div>

      {/* Rollup KPI cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {[
          { l: "High Confidence", s: "unique resources, 80%+ best match", v: uniqueConfidenceCounts.high, c: C.green600, bg: C.green100 },
          { l: "Medium Confidence", s: "unique resources, 60-79% best match", v: uniqueConfidenceCounts.medium, c: "#92400E", bg: C.amberLt },
          { l: "Low Confidence", s: "unique resources, 40-59% best match", v: uniqueConfidenceCounts.low, c: "#991B1B", bg: C.red100 },
        ].map((s) => (
          <div key={s.l} style={{ flex: 1, padding: "14px 16px", borderRadius: 8, background: s.bg, textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: s.c, marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 28, fontWeight: 400, color: s.c, fontFamily: "'Outfit'" }}>{s.v}</div>
            <div style={{ fontSize: 10, color: s.c, opacity: 0.7, marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Sortable table */}
      <Card style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Outfit',sans-serif" }}>
          <thead>
            <tr style={{ background: C.slate700, color: C.white }}>
              {COLS.map((col) => {
                // Strict: highlight ONLY when both col matches AND dir is set.
                // We compare against the live state `sort` — the strict equality
                // here means exactly ONE column can be active at any render.
                const isActive = sort.col === col.k && sort.dir != null;
                return (
                  <th
                    key={col.k}
                    onClick={() => handleSort(col.k, col.initialDir)}
                    title={`Click to sort by ${col.k} (3 clicks: ${col.initialDir === "asc" ? "↑ → ↓" : "↓ → ↑"} → reset)`}
                    style={{
                      padding: col.wide ? "10px 14px" : "10px 10px",
                      textAlign: col.align,
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      // Active column: solid teal background. No transition because
                      // an animated fade-out can leave the cell visually "highlighted"
                      // mid-transition when the user clicks rapidly between columns.
                      background: isActive ? C.teal600 : "transparent",
                      color: isActive ? C.white : (col.accentColor || C.white),
                      borderBottom: isActive ? `2px solid ${C.teal400}` : "2px solid transparent",
                    }}
                  >
                    {col.k}
                    <SortIcon active={isActive} dir={sort.dir} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => {
              const bl = row.high > 0 ? "High" : row.medium > 0 ? "Medium" : row.low > 0 ? "Low" : "None";
              return (
                <tr
                  key={row.id}
                  style={{ background: ri % 2 === 0 ? C.white : C.slate50, cursor: "pointer" }}
                  onClick={() => onSelectPosition && onSelectPosition(row)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.teal50)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = ri % 2 === 0 ? C.white : C.slate50)}
                  title="Click to view resource matches"
                >
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: C.teal700, fontSize: 11 }}>{row.id}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: C.slate800 }}>{row.role}</td>
                  <td style={{ padding: "10px 14px", color: C.slate500 }}>{row.client}</td>
                  <td style={{ padding: "10px 10px", textAlign: "center" }}><GradeBadge grade={row.grade} /></td>
                  <td style={{ padding: "10px 10px", textAlign: "center" }}><PriorityDot priority={row.priority} /></td>
                  <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 600, color: row.high > 0 ? C.green600 : C.slate300 }}>{row.high}</td>
                  <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 600, color: row.medium > 0 ? "#92400E" : C.slate300 }}>{row.medium}</td>
                  <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 600, color: row.low > 0 ? "#991B1B" : C.slate300 }}>{row.low}</td>
                  <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 600, color: C.slate700 }}>{row.total}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    {bl !== "None" ? <ConfBadge level={bl} /> : <span style={{ color: C.slate300 }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={10} style={{ padding: "32px", textAlign: "center", color: C.slate400, fontSize: 12 }}>No positions loaded — upload TA data first</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop: 10, fontSize: 10, color: C.slate400, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span>High: 80%+ · Medium: 60–79% · Low: 40–59%</span>
        <span>Click column header to sort (↓ → ↑ → reset) · Click row to view matches</span>
      </div>
    </div>
  );
}
