// src/pages/DashboardPage.jsx
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell, ResponsiveContainer, LabelList,
} from "recharts";
import { C } from "../theme";
import {
  Card, SectionTitle, KPICard, ChartTooltip, renderBarLabel, heatColor, heatText,
} from "../components/ui";

export default function DashboardPage({ data: d }) {
  // Grade distribution comes pre-computed from processTAData (dataProcessor.js).
  // Shape: [{ label, value, pct, color }, ...] ordered Manager → Analyst.
  const gradeDistribution = d.gradeDistribution || [];
  const maxGradeCount = Math.max(1, ...gradeDistribution.map((g) => g.value));
  const hasGradeData = gradeDistribution.some((g) => g.value > 0);
  const maxClientTotal = Math.max(0, ...(d.clientBar || []).map((c) => (c.Open || 0) + (c.Offered || 0)));
  const barChartHeight = Math.max(290, Math.min(420, 220 + maxClientTotal * 5));
  const lowerChartHeight = 250;
  const [leakageExpanded, setLeakageExpanded] = useState(false);
  const [leakageMetric, setLeakageMetric] = useState("dailyLeakage");
  const leakageRows = d.leakage || [];
  const leakageMetricLabel = leakageMetric === "dailyLeakage" ? "Daily Leakage" : "Total Leakage";
  const formatUsd = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const formatCompactUsd = (value) => {
    const amount = Number(value || 0);
    if (Math.abs(amount) < 1000) return formatUsd(amount);
    return `$${Math.round(amount / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k`;
  };
  const leakageChartRows = useMemo(
    () => leakageRows.map((row) => ({ ...row, dailyLeakage: row.dailyLeakage || 0, totalLeakage: row.totalLeakage || 0 })),
    [leakageRows]
  );
  const sumDailyLeakage = leakageChartRows.reduce((total, row) => total + (row.dailyLeakage || 0), 0);
  const sumTotalLeakage = leakageChartRows.reduce((total, row) => total + (row.totalLeakage || 0), 0);
  const businessDaysInMonth = (isoDate) => {
    const parts = String(isoDate || "").match(/^(\d{4})-(\d{2})/);
    const reference = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, 1)
      : new Date();
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const cursor = new Date(year, month, 1);
    let count = 0;
    while (cursor.getMonth() === month) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  };
  const monthlyBusinessDays = businessDaysInMonth(d.as_of);
  const projectedMonthlyLeakage = sumDailyLeakage * monthlyBusinessDays;
  const getLeakageRowsForMetric = (metric, expanded = false) => {
    const sorted = [...leakageChartRows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    return expanded ? sorted : sorted.slice(0, 4);
  };
  const compactCustomerName = (value) => String(value || "")
    .replace(/\bAssociation\b/gi, "Assoc.")
    .replace(/\bAssociates\b/gi, "Assoc.")
    .replace(/\bCorporation\b/gi, "Corp.")
    .replace(/\bIncorporated\b/gi, "Inc.")
    .replace(/\bFinancial\b/gi, "Fin.")
    .replace(/\bTechnologies\b/gi, "Tech")
    .replace(/\bTechnology\b/gi, "Tech")
    .replace(/\bServices\b/gi, "Svc")
    .replace(/\bInternational\b/gi, "Intl.")
    .replace(/\bNational\b/gi, "Natl.")
    .replace(/\bCustomer\b/gi, "Cust.")
    .replace(/\s+/g, " ")
    .trim();
  const wrapAxisLabel = (value, maxLineLength = 9, maxLines = 3) => {
    const words = compactCustomerName(value).split(/[\s\-_]+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= maxLineLength) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word.length > maxLineLength ? `${word.slice(0, maxLineLength - 1)}.` : word;
      }
    });
    if (line) lines.push(line);

    if (lines.length > maxLines) {
      const trimmed = lines.slice(0, maxLines);
      trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/\.+$/, "").slice(0, maxLineLength - 1)}.`;
      return trimmed;
    }
    return lines.length ? lines : [""];
  };
  const renderCustomerTick = ({ x, y, payload }, expanded = false) => {
    if (expanded) {
      const label = compactCustomerName(payload.value);
      const shortLabel = label.length > 28 ? `${label.slice(0, 27)}.` : label;
      return (
        <g transform={`translate(${x},${y + 8}) rotate(-38)`}>
          <text
            x={0}
            y={0}
            textAnchor="end"
            fill={C.slate500}
            fontSize={10}
            fontFamily="'Outfit',sans-serif"
          >{shortLabel}</text>
        </g>
      );
    }
    const lines = wrapAxisLabel(payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        {lines.map((line, i) => (
          <text
            key={i}
            x={0}
            y={i * 11}
            dy={10}
            textAnchor="middle"
            fill={C.slate500}
            fontSize={9}
            fontFamily="'Outfit',sans-serif"
          >{line}</text>
        ))}
      </g>
    );
  };
  const renderLeakageChart = (height, metric = "dailyLeakage", expanded = false) => {
    const rows = getLeakageRowsForMetric(metric, expanded);
    const chartHeight = expanded ? Math.max(height, rows.length * 34 + 76) : height;
    const renderLeakageCustomerTick = ({ x, y, payload }) => {
      const label = compactCustomerName(payload.value);
      const maxLength = expanded ? 28 : 16;
      const shortLabel = label.length > maxLength ? `${label.slice(0, maxLength - 1)}.` : label;
      return (
        <g transform={`translate(${x},${y})`}>
          <text
            x={-7}
            y={4}
            textAnchor="end"
            fill={C.slate600}
            fontSize={expanded ? 10 : 9.5}
            fontWeight={expanded ? 500 : 600}
            fontFamily="'Outfit',sans-serif"
          >
            <title>{payload.value}</title>
            {shortLabel}
          </text>
        </g>
      );
    };
    const renderLeakageLabel = ({ x, y, width, height: barHeight, value }) => {
      if (!value) return null;
      return (
        <text
          x={x + width + 8}
          y={y + barHeight / 2 + 4}
          textAnchor="start"
          fill={C.slate600}
          fontSize={expanded ? 11 : 10}
          fontWeight={600}
          fontFamily="'Outfit',sans-serif"
          style={{ pointerEvents: "none" }}
        >
          {formatCompactUsd(value)}
        </text>
      );
    };
    return (
      <div style={{ width: "100%", overflow: "hidden" }}>
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              barCategoryGap={expanded ? "22%" : "30%"}
              margin={{ top: 10, right: expanded ? 72 : 58, left: expanded ? 8 : 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.slate200} horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: C.slate500 }}
                tickFormatter={formatCompactUsd}
                domain={[0, (dataMax) => Math.ceil((dataMax || 1) * 1.14)]}
              />
              <YAxis
                type="category"
               dataKey="name"
               axisLine={false}
               tickLine={false}
                width={expanded ? 170 : 112}
                tick={renderLeakageCustomerTick}
              />
              <Tooltip
                formatter={(value) => [
                  formatUsd(value),
                  metric === "dailyLeakage" ? "Daily Leakage USD" : "Total Leakage USD",
                ]}
                labelFormatter={(label) => label}
                labelStyle={{ color: C.slate700 }}
                contentStyle={{ borderRadius: 6, border: `1px solid ${C.slate200}`, fontSize: 11 }}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
              />
              <Bar dataKey={metric} fill={C.teal600} radius={[0, 3, 3, 0]} barSize={expanded ? 18 : 24}>
                <LabelList dataKey={metric} content={renderLeakageLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };
  const MiniMetricCard = ({ label, value, sub, borderColor = C.teal600 }) => {
    const valueText = String(value ?? "");
    const valueSize = valueText.length > 9 ? 20 : 26;
    return (
      <div style={{
        background: C.white, borderRadius: 8, padding: "12px 20px 10px",
        border: `1px solid ${C.slate200}`, borderTop: `3px solid ${borderColor}`, flex: 1,
      }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.slate500, marginBottom: 4 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: valueSize, fontWeight: 400, color: C.slate800, fontFamily: "'Outfit'", lineHeight: 1.05, whiteSpace: "nowrap" }}>{value}</span>
          {sub && <span style={{ fontSize: 10, color: C.slate400, minWidth: 0 }}>{sub}</span>}
        </div>
      </div>
    );
  };
  const renderInsideBarLabel = ({ x, y, width, height, value }) => {
    if (!value || height < 14) return null;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontSize={11}
        fontWeight={700}
        fontFamily="'Outfit',sans-serif"
        style={{ pointerEvents: "none" }}
      >{value}</text>
    );
  };

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 24px 40px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: C.slate400 }}>
          {d.activeDb
            ? <span style={{ color: C.teal600, fontWeight: 500 }}>{d.activeDb.length} active reqs loaded</span>
            : <span>Upload TA file for live metrics</span>}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KPICard
          label="Total Active Positions"
          value={d.kpis.totalActive}
          sub={`Off ${d.kpis.offOpen + d.kpis.offOffered} · On ${d.kpis.onOpen + d.kpis.onOffered}`}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 0", minWidth: 135 }}>
          <MiniMetricCard label="Open Positions" value={d.kpis.open} sub={`Off ${d.kpis.offOpen} · On ${d.kpis.onOpen}`} />
          <MiniMetricCard label="Offered Positions" value={d.kpis.offered} sub={`Off ${d.kpis.offOffered} · On ${d.kpis.onOffered}`} borderColor={C.offered} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 0", minWidth: 135 }}>
          <MiniMetricCard label="New Reqs WTD" value={d.kpis.newReqs} sub="Open, Age <= 10 days" />
          <MiniMetricCard label="Avg Aging (Days)" value={d.kpis.avgAging} sub={`Off ${d.kpis.offAging} · On ${d.kpis.onAging}`} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 0", minWidth: 175 }}>
          <MiniMetricCard
            label="Sum Daily Leakage"
            value={formatCompactUsd(sumDailyLeakage)}
            sub={`Projected monthly ${formatCompactUsd(projectedMonthlyLeakage)}`}
          />
          <MiniMetricCard label="Sum Total Leakage" value={formatCompactUsd(sumTotalLeakage)} borderColor={C.offered} />
        </div>
      </div>

      {/* Bar charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, marginTop: 22 }}>
        <Card>
          <SectionTitle>Status by Client — Open vs Offered</SectionTitle>
          <ResponsiveContainer width="100%" height={barChartHeight}>
            <BarChart
              data={d.clientBar.map((c) => ({ ...c, _total: (c.Open || 0) + (c.Offered || 0) }))}
              barCategoryGap="22%"
              margin={{ top: 30, right: 12, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.slate200} vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={{ stroke: C.slate200 }}
                tickLine={false}
                interval={0}
                height={42}
                tick={({ x, y, payload }) => {
                  const tokens = String(payload.value || "")
                    .split(/[\s\-_]+/)
                    .filter(Boolean);
                  const lines = tokens.length <= 1
                    ? [tokens[0] || ""]
                    : [tokens[0], tokens.slice(1).join(" ")];
                  return (
                    <g transform={`translate(${x},${y})`}>
                      {lines.map((line, i) => (
                        <text
                          key={i}
                          x={0}
                          y={i * 11}
                          dy={10}
                          textAnchor="middle"
                          fill={C.slate500}
                          fontSize={9.5}
                          fontFamily="'Outfit',sans-serif"
                        >{line}</text>
                      ))}
                    </g>
                  );
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: C.slate500 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, (dataMax) => Math.ceil(dataMax * 1.12)]}
                label={{ value: "Positions", angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 10, fill: C.slate400 } }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 0 }} />
              <Bar dataKey="Open" stackId="a" fill={C.teal600} radius={[0, 0, 0, 0]}>
                <LabelList dataKey="Open" content={renderInsideBarLabel} />
              </Bar>
              <Bar dataKey="Offered" stackId="a" fill={C.offered} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="Offered" content={renderInsideBarLabel} />
                <LabelList
                  dataKey="_total"
                  content={({ x, y, width, value }) => {
                    if (!value) return null;
                    return (
                      <text
                        x={x + width / 2}
                        y={Math.max(12, y - 8)}
                        textAnchor="middle"
                        fill={C.slate700}
                        fontSize={11}
                        fontWeight={700}
                        fontFamily="'Outfit',sans-serif"
                        style={{ pointerEvents: "none" }}
                      >{value}</text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>Aging Pipeline Distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={barChartHeight}>
            <BarChart data={d.agingPipeline} barCategoryGap="22%" margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.slate200} vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 9.5, fill: C.slate500 }}
                axisLine={{ stroke: C.slate200 }}
                tickLine={false}
                interval={0}
                height={28}
              />
              <YAxis tick={{ fontSize: 10, fill: C.slate500 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar dataKey="value" name="Positions" radius={[3, 3, 0, 0]}>
                {d.agingPipeline.map((e, i) => <Cell key={i} fill={e.color} />)}
                <LabelList
                  dataKey="value"
                  content={({ x, y, width, height, value }) => {
                    if (!value) return null;
                    if (height >= 16) {
                      return (
                        <text x={x + width / 2} y={y + 14} textAnchor="middle" fill="#FFFFFF" fontSize={11} fontWeight={700} fontFamily="'Outfit',sans-serif" style={{ pointerEvents: "none" }}>{value}</text>
                      );
                    }
                    return (
                      <text x={x + width / 2} y={y - 5} textAnchor="middle" fill={C.slate500} fontSize={10} fontWeight={600} fontFamily="'Outfit',sans-serif">{value}</text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Heatmap */}
      <div style={{ marginTop: 22 }}>
        <SectionTitle>Aging Heatmap — Positions by Client & Bucket</SectionTitle>
        <Card style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, fontFamily: "'Outfit',sans-serif" }}>
            <thead>
              <tr style={{ background: C.slate700, color: C.white }}>
                <th style={{
                  padding: "9px 14px", textAlign: "left", fontWeight: 500, position: "sticky",
                  left: 0, background: C.slate700, zIndex: 2, borderRight: `1px solid ${C.slate600}`,
                }} rowSpan={2}>Client</th>
                {["Pre-approved", "1–30 days", "31–60 days", "61–90 days", "91+ days"].map((h) => (
                  <th key={h} colSpan={3} style={{
                    padding: "9px 6px 4px", textAlign: "center", fontWeight: 500,
                    borderLeft: `1px solid ${C.slate600}`, fontSize: 10.5,
                  }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: C.slate600, color: C.slate300 }}>
                {[...Array(5)].flatMap((_, i) =>
                  ["Off", "On", "All"].map((s) => (
                    <th key={`${i}-${s}`} style={{
                      padding: "5px 6px", textAlign: "center", fontWeight: 400, fontSize: 9.5,
                      borderLeft: s === "Off" ? `1px solid ${C.slate500}` : "none",
                    }}>{s}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {d.heatmap.map((row, ri) => {
                const keys = ["pre", "d30", "d60", "d90", "p90"];
                return (
                  <tr key={ri}
                    style={{ background: ri % 2 === 0 ? C.white : C.slate50 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.slate100)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = ri % 2 === 0 ? C.white : C.slate50)}
                  >
                    <td style={{
                      padding: "8px 14px", fontWeight: 500, color: C.slate700, position: "sticky",
                      left: 0, background: "inherit", zIndex: 1,
                      borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap",
                    }}>{row.client}</td>
                    {keys.flatMap((k) =>
                      ["Off", "On", "T"].map((s) => {
                        const v = row[k + s] || 0;
                        return (
                          <td key={k + s} style={{
                            padding: "8px", textAlign: "center", fontWeight: s === "T" ? 600 : 400,
                            color: v === 0 ? C.slate300 : heatText(v),
                            background: s === "T" ? heatColor(v) : "transparent",
                            borderRadius: s === "T" ? 3 : 0,
                            borderLeft: s === "Off" ? `1px solid ${C.slate200}` : "none",
                          }}>{v}</td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
              <tr style={{ background: C.slate700, color: C.white, fontWeight: 600 }}>
                <td style={{ padding: "9px 14px", position: "sticky", left: 0, background: C.slate700, zIndex: 1, borderRight: `1px solid ${C.slate600}` }}>Total</td>
                {["pre", "d30", "d60", "d90", "p90"].flatMap((k) =>
                  ["Off", "On", "T"].map((s) => (
                    <td key={`t-${k}${s}`} style={{
                      padding: "9px 8px", textAlign: "center", fontWeight: s === "T" ? 700 : 500,
                      borderLeft: s === "Off" ? `1px solid ${C.slate600}` : "none",
                    }}>{d.heatmapTotals[k + s] || 0}</td>
                  ))
                )}
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 18, padding: "10px 18px", borderTop: `1px solid ${C.slate200}`, flexWrap: "wrap" }}>
            {[
              { l: "0–5 healthy", c: "#B2DFDB" },
              { l: "6–10 watch", c: "#ecf484" },
              { l: "11–15 at risk", c: C.amberLt },
              { l: "16–20 warning", c: "#FBBF24" },
              { l: "21+ critical", c: "#F87171" },
            ].map((l) => (
              <div key={l.l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.slate500 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: l.c, border: `1px solid ${C.slate300}` }} />{l.l}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Off/On + grade pyramid + leakage */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginTop: 22 }}>
        <Card>
          <SectionTitle>Offshore vs Onshore Split</SectionTitle>
          <ResponsiveContainer width="100%" height={lowerChartHeight}>
            <BarChart data={d.offOnBar} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.slate200} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.slate500 }} axisLine={{ stroke: C.slate200 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.slate500 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Offshore" fill={C.teal600} radius={[3, 3, 0, 0]}><LabelList content={renderBarLabel} /></Bar>
              <Bar dataKey="Onshore" fill={C.onshore} radius={[3, 3, 0, 0]}><LabelList content={renderBarLabel} /></Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
  <SectionTitle>Grade Distribution</SectionTitle>
  <div style={{ fontSize: 11, color: C.slate500, marginTop: -4, marginBottom: 12 }}>
    Open positions by grade level
  </div>
  {!hasGradeData ? (
    <div style={{ height: lowerChartHeight, display: "flex", alignItems: "center", justifyContent: "center", color: C.slate400, fontSize: 12 }}>
      No open positions with grade data
    </div>
  ) : (
    <div style={{ height: lowerChartHeight, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "4px 0" }}>
      {gradeDistribution.map((g) => {
        const widthPct = g.value === 0 ? 0 : Math.max(12, (g.value / maxGradeCount) * 90);
        return (
          <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 52,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: C.slate600,
                fontFamily: "'Outfit',sans-serif",
              }}
            >
              {g.label}
            </span>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              {g.value > 0 ? (
                <div
                  title={`${g.label}: ${g.value} open positions (${g.pct}%)`}
                  style={{
                    width: `${widthPct}%`,
                    height: 24,
                    background: g.color,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.10)",
                    fontFamily: "'Outfit',sans-serif",
                    transition: "width 240ms ease",
                  }}
                >
                  {g.value}
                </div>
              ) : (
                <div style={{ height: 24 }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  )}
</Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <SectionTitle>Leakage on Open/Offered Reqs</SectionTitle>
            <button
              onClick={() => setLeakageExpanded(true)}
              style={{
                padding: "5px 9px",
                borderRadius: 6,
                border: `1px solid ${C.slate200}`,
                background: C.white,
                color: C.teal700,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >Expand</button>
          </div>
          {!leakageChartRows.length ? (
            <div style={{ height: lowerChartHeight, display: "flex", alignItems: "center", justifyContent: "center", color: C.slate400, fontSize: 12, textAlign: "center", padding: "0 18px" }}>
              No leakage data - upload TA file with Billing_Rate & Job_Start_Date
            </div>
          ) : renderLeakageChart(lowerChartHeight, "dailyLeakage")}
        </Card>
      </div>

      {leakageExpanded && (
        <div
          onClick={() => setLeakageExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.48)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1040px, 94vw)",
              maxHeight: "88vh",
              overflow: "auto",
              background: C.white,
              borderRadius: 8,
              border: `1px solid ${C.slate200}`,
              boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.slate800 }}>Leakage on Open/Offered Reqs</div>
                <div style={{ fontSize: 11, color: C.slate500, marginTop: 2 }}>{leakageMetricLabel} by customer</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, background: C.slate50, border: `1px solid ${C.slate200}`, borderRadius: 7, padding: 3 }}>
                {[
                  ["dailyLeakage", "Daily Leakage"],
                  ["totalLeakage", "Total Leakage"],
                ].map(([key, label]) => {
                  const active = leakageMetric === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setLeakageMetric(key)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 5,
                        border: "none",
                        background: active ? C.teal600 : "transparent",
                        color: active ? C.white : C.slate600,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
              <button
                onClick={() => setLeakageExpanded(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.slate400,
                  cursor: "pointer",
                  fontSize: 24,
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
              >&times;</button>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
              <MiniMetricCard
                label="Sum Daily Leakage"
                value={formatUsd(sumDailyLeakage)}
                sub="Started by snapshot date"
              />
              <MiniMetricCard
                label="Projected Monthly Leakage"
                value={formatUsd(projectedMonthlyLeakage)}
                sub={`${monthlyBusinessDays} business days`}
                borderColor={C.amber}
              />
              <MiniMetricCard
                label="Sum Total Leakage"
                value={formatUsd(sumTotalLeakage)}
                sub={d.as_of ? `Through ${d.as_of}` : "Cumulative"}
                borderColor={C.offered}
              />
            </div>
            {!leakageChartRows.length ? (
              <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: C.slate400, fontSize: 13, textAlign: "center" }}>
                No leakage data - upload TA file with Billing_Rate & Job_Start_Date
              </div>
            ) : renderLeakageChart(430, leakageMetric, true)}
          </div>
        </div>
      )}
    </div>
  );
}
