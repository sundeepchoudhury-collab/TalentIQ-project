// src/components/ui.jsx
// Reusable presentational primitives.
import { C } from "../theme";
import { monthsOnBench, formatBenchDuration, gradeLabel } from "../dataProcessor";

// ── Containers ──
export function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.white, borderRadius: 10, padding: 22, border: `1px solid ${C.slate200}`, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
      color: C.slate600, marginBottom: 14, marginTop: 2, ...style,
    }}>
      {children}
    </div>
  );
}

// ── Buttons ──
export function SmallBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer",
      fontFamily: "inherit",
      border: active ? `1px solid ${C.teal600}` : `1px solid ${C.slate300}`,
      background: active ? C.teal600 : "transparent",
      color: active ? C.white : C.slate500,
      transition: "all 0.12s",
    }}>{label}</button>
  );
}

export function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 20px", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer",
      color: active ? C.teal700 : C.slate500, background: "transparent", border: "none",
      borderBottom: active ? `2px solid ${C.teal600}` : "2px solid transparent",
      fontFamily: "inherit",
    }}>{label}</button>
  );
}

// ── KPI ──
export function KPICard({ label, value, sub, style = {} }) {
  return (
    <div style={{
      background: C.white, borderRadius: 8, padding: "18px 20px 14px",
      flex: "1 1 0", minWidth: 135, border: `1px solid ${C.slate200}`,
      borderTop: `3px solid ${C.teal600}`, ...style,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.slate500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 400, color: C.slate800, lineHeight: 1, fontFamily: "'Outfit'" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.slate400, marginTop: 8, fontWeight: 400 }}>{sub}</div>}
    </div>
  );
}

// ── Chart helpers ──
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload) return null;
  return (
    <div style={{ background: C.slate800, color: C.white, padding: "8px 12px", borderRadius: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: 1, background: p.color, display: "inline-block" }} />
          <span>{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
}

export const renderBarLabel = (props) => {
  const { x, y, width, value } = props;
  if (!value || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle" fill={C.slate500} fontSize={9} fontWeight={500} fontFamily="'Outfit',sans-serif">
      {value}
    </text>
  );
};

// ── Heatmap palette ──
export function heatColor(v) {
  if (v === 0) return "transparent";
  if (v <= 5) return "#B2DFDB";
  if (v <= 10) return "#ecf484";
  if (v <= 15) return C.amberLt;
  if (v <= 20) return "#FBBF24";
  return "#F87171";
}
export function heatText(v) { return v <= 15 ? C.slate800 : C.white; }

// ── Badges & tags ──
export function SkillTag({ skill, matched }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
      marginRight: 5, marginBottom: 4,
      background: matched ? C.teal100 : C.slate100,
      color: matched ? C.teal800 : C.slate500,
      border: `1px solid ${matched ? C.teal300 : C.slate200}`,
    }}>{skill}</span>
  );
}

export function MatchBadge({ score }) {
  const bg = score >= 80 ? C.green100 : score >= 60 ? C.amberLt : C.red100;
  const color = score >= 80 ? "#166534" : score >= 60 ? "#92400E" : "#991B1B";
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>
      {score}%
    </span>
  );
}

export function PriorityDot({ priority }) {
  const color = priority === "High" ? C.red : priority === "Medium" ? C.amber : C.teal500;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.slate600 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {priority}
    </span>
  );
}

export function ConfBadge({ level }) {
  const cfg = {
    High: { bg: C.green100, c: "#166534", b: "#BBF7D0" },
    Medium: { bg: C.amberLt, c: "#92400E", b: "#FDE68A" },
    Low: { bg: C.red100, c: "#991B1B", b: "#FECACA" },
  };
  const x = cfg[level] || cfg.Low;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: x.bg, color: x.c, border: `1px solid ${x.b}`,
    }}>{level}</span>
  );
}

export function BenchBadge({ benchDays }) {
  const m = monthsOnBench(benchDays);
  const isLong = m >= 3;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 3,
      fontSize: 10, fontWeight: 500,
      background: isLong ? "#FEF2F2" : "#F0FDF4",
      color: isLong ? "#991B1B" : "#166534",
      border: `1px solid ${isLong ? "#FECACA" : "#BBF7D0"}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: isLong ? C.red : C.green600, display: "inline-block" }} />
      {formatBenchDuration(benchDays)} on bench
    </span>
  );
}

export function GradeBadge({ grade }) {
  if (!grade) return null;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 500,
      background: C.slate100, color: C.slate600, border: `1px solid ${C.slate200}`,
    }}>{gradeLabel(grade)}</span>
  );
}
