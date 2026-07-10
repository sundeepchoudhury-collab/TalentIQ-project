import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllMSDResources, fetchEmployeeHistory } from "../api";
import { C } from "../theme";
import { Card, SectionTitle } from "../components/ui";
import { downloadExcel } from "../utils/excel";

const MAX_VISIBLE_ROWS = 100;

const CRITERIA_FIELDS = [
  { key: "lob", label: "LOB" },
  { key: "grade", label: "Grade" },
  { key: "office_location", label: "Office Location" },
  { key: "project_vertical", label: "Project Vertical" },
  { key: "customer_name", label: "Customer Name" },
  { key: "resource_category", label: "Resource Category" },
  { key: "project_name", label: "Project Name" },
];

const SEARCH_FIELDS = [
  { key: "skillsets", label: "Skills", placeholder: "Search skills — comma-separate for multiple, matches any (e.g. Java, AWS)" },
  { key: "name", label: "Name", placeholder: "Search by name — comma-separate for multiple" },
  { key: "designation", label: "Designation", placeholder: "Search by designation — comma-separate for multiple" },
  { key: "project_vertical", label: "Project Vertical", placeholder: "Search by project vertical — comma-separate for multiple" },
  { key: "project_name", label: "Project Name", placeholder: "Search by project name — comma-separate for multiple" },
];

const columns = [
  { key: "_index", label: "#", width: 44 },
  { key: "name", label: "Name", width: 140 },
  { key: "employee_id", label: "Employee Id", width: 110 },
  { key: "designation", label: "Designation as per HRIS", width: 160 },
  { key: "grade", label: "Grade as per HRIS", width: 90 },
  { key: "rm", label: "RM as per HRIS", width: 130 },
  { key: "office_location", label: "Office Location as per HRIS", width: 140 },
  { key: "project_name", label: "Project Name", width: 140 },
  { key: "project_vertical", label: "Project Vertical", width: 130 },
  { key: "customer_name", label: "Customer Name", width: 140 },
  { key: "resource_category", label: "Resource Category", width: 130 },
  { key: "skillsets", label: "Skillsets", width: 260 },
  { key: "billability", label: "Billability", width: 110 },
  { key: "project_start_date", label: "Project Start", width: 110 },
  { key: "project_end_date", label: "Project End", width: 110 },
];

// The "#" row-number column is always shown first and is not user-configurable.
const PINNED_COLUMN = "_index";
// New columns ship hidden by default so the existing layout is unchanged until
// the user opts in via the Columns chooser.
const DEFAULT_HIDDEN_COLUMNS = new Set(["billability", "project_start_date", "project_end_date"]);
const CHOOSABLE_COLUMNS = columns.filter((c) => c.key !== PINNED_COLUMN);
const COLUMN_PREFS_STORAGE_KEY = "talentiq.resourceSearch.columnPrefs.v1";

function defaultColumnPrefs() {
  return CHOOSABLE_COLUMNS.map((c) => ({ key: c.key, visible: !DEFAULT_HIDDEN_COLUMNS.has(c.key) }));
}

// Reconcile saved prefs with the current column set: keep saved order, drop
// columns that no longer exist, and append any new columns at their default
// visibility. Keeps the feature forward-compatible as columns are added.
function reconcileColumnPrefs(saved) {
  const valid = new Set(CHOOSABLE_COLUMNS.map((c) => c.key));
  const seen = new Set();
  const out = [];
  for (const pref of Array.isArray(saved) ? saved : []) {
    if (pref && valid.has(pref.key) && !seen.has(pref.key)) {
      seen.add(pref.key);
      out.push({ key: pref.key, visible: pref.visible !== false });
    }
  }
  for (const c of CHOOSABLE_COLUMNS) {
    if (!seen.has(c.key)) out.push({ key: c.key, visible: !DEFAULT_HIDDEN_COLUMNS.has(c.key) });
  }
  return out;
}

function loadColumnPrefs() {
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_STORAGE_KEY);
    if (!raw) return defaultColumnPrefs();
    return reconcileColumnPrefs(JSON.parse(raw));
  } catch {
    return defaultColumnPrefs();
  }
}

// Best-effort cleanup of a date string for display (handles ISO datetimes and
// bare Excel serial numbers); falls back to the raw value otherwise.
function formatHistoryDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4,6}(\.0)?$/.test(text)) {
    const serial = parseInt(text, 10);
    if (serial > 1 && serial < 100000) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  if (text.includes("T") || text.includes(" ")) return text.split("T")[0].split(" ")[0];
  return text;
}

const MERGE_FIELDS = new Set([
  "lob",
  "project_name",
  "project_vertical",
  "customer_name",
  "resource_category",
  "skillsets",
]);

const baseInputStyle = {
  width: "100%",
  borderRadius: 6,
  border: `1px solid ${C.slate200}`,
  fontSize: 12,
  fontFamily: "inherit",
  color: C.slate800,
  outline: "none",
  background: C.white,
  boxSizing: "border-box",
};
const tableHeaderStyle = {
  padding: "10px 14px 10px 12px",
  fontSize: 12,
  fontWeight: 500,
  color: C.white,
  textAlign: "left",
  borderBottom: "2px solid transparent",
  borderRight: `1px solid ${C.white}`,
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflow: "hidden",
  position: "relative",
};
const tableCellStyle = {
  padding: "8px 12px",
  fontSize: 12,
  color: C.slate700,
  verticalAlign: "top",
  borderBottom: `1px solid ${C.slate100}`,
  borderRight: `1px solid ${C.white}`,
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflow: "hidden",
};
const pickerPanelStyle = {
  position: "absolute",
  zIndex: 30,
  top: "calc(100% + 4px)",
  left: 0,
  background: C.white,
  border: `1px solid ${C.slate200}`,
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
};

function GhostButton({ children, color = C.teal600, style = {}, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: "transparent",
        border: "none",
        color,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function PickerPanel({ children, style = {} }) {
  return <div style={{ ...pickerPanelStyle, ...style }}>{children}</div>;
}

function CheckboxRow({ checked, onChange, children }) {
  return (
    <label
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", borderRadius: 5, fontSize: 12, color: C.slate700 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.slate50)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: C.teal600 }} />
      {children}
    </label>
  );
}

function splitSkillTags(value) {
  return String(value || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function splitMergedValues(value) {
  return String(value || "")
    .split(/\s+\|\s+|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = String(value || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function normalizeResourceKey(row) {
  const id = String(row.employee_id || "").trim().toLowerCase().replace(/\.0$/, "");
  if (id) return `id:${id}`;
  return `name:${String(row.name || "").trim().toLowerCase()}`;
}

function mergeResourceRows(rows) {
  const byResource = new Map();

  rows.forEach((row) => {
    const key = normalizeResourceKey(row);
    if (!key || key === "name:") return;

    if (!byResource.has(key)) {
      byResource.set(key, { ...row, _source_count: 1 });
      return;
    }

    const merged = byResource.get(key);
    merged._source_count += 1;
    columns.forEach(({ key: field }) => {
      if (field === "_index") return;
      if (MERGE_FIELDS.has(field)) {
        const parts = field === "skillsets"
          ? splitSkillTags(`${merged[field] || ""},${row[field] || ""}`)
          : [...splitMergedValues(merged[field]), ...splitMergedValues(row[field])];
        merged[field] = uniqueValues(parts).join(field === "skillsets" ? ", " : " | ");
      } else if (!String(merged[field] || "").trim() && String(row[field] || "").trim()) {
        merged[field] = row[field];
      }
    });
  });

  return [...byResource.values()];
}

function SkillTags({ value }) {
  const skills = splitSkillTags(value);
  if (!skills.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {skills.map((skill, index) => (
        <span
          key={`${skill}-${index}`}
          style={{
            display: "inline-block",
            background: C.teal50,
            color: C.teal700,
            borderRadius: 10,
            fontSize: 10,
            padding: "2px 7px",
            border: `1px solid ${C.teal100}`,
          }}
        >
          {skill}
        </span>
      ))}
    </div>
  );
}

function useClickOutside(active, onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [active, onOutside]);
  return ref;
}

function CriteriaPicker({ activeCriteria, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "7px 14px",
          borderRadius: 7,
          border: `1px solid ${C.teal600}`,
          background: C.teal600,
          color: C.white,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        + Add Criteria{activeCriteria.size > 0 ? ` (${activeCriteria.size})` : ""} ▾
      </button>
      {open && (
        <PickerPanel style={{ minWidth: 220, padding: 6 }}>
          {CRITERIA_FIELDS.map((field) => (
            <CheckboxRow
              key={field.key}
              checked={activeCriteria.has(field.key)}
              onChange={() => onToggle(field.key)}
            >
              {field.label}
            </CheckboxRow>
          ))}
        </PickerPanel>
      )}
    </div>
  );
}

function ValuePicker({ field, allRows, selected, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useClickOutside(open, () => setOpen(false));

  const options = useMemo(() => {
    const set = new Set();
    for (const row of allRows) {
      splitMergedValues(row[field.key]).forEach((v) => set.add(v));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allRows, field.key]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, search]);

  const count = selected.size;
  const accent = count > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "stretch",
          borderRadius: 7,
          border: `1px solid ${accent ? C.teal600 : C.slate300}`,
          background: accent ? C.teal50 : C.white,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: "6px 12px",
            border: "none",
            background: "transparent",
            color: accent ? C.teal700 : C.slate600,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {field.label}{count > 0 ? ` · ${count}` : ""} ▾
        </button>
        <button
          onClick={onRemove}
          title="Remove criterion"
          style={{
            padding: "0 9px",
            border: "none",
            borderLeft: `1px solid ${accent ? C.teal100 : C.slate200}`,
            background: "transparent",
            color: accent ? C.teal700 : C.slate500,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      </div>
      {open && (
        <PickerPanel style={{ width: 280, padding: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${field.label.toLowerCase()}…`}
            style={{ ...baseInputStyle, padding: "7px 10px", marginBottom: 6 }}
            onFocus={(e) => (e.target.style.borderColor = C.teal400)}
            onBlur={(e) => (e.target.style.borderColor = C.slate200)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 6px" }}>
            <GhostButton onClick={() => onChange(new Set(filteredOptions))}>
              Select all
            </GhostButton>
            <GhostButton color={C.slate500} onClick={() => onChange(new Set())}>
              Clear
            </GhostButton>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 12, color: C.slate400 }}>No matches.</div>
            ) : filteredOptions.map((opt) => {
              const checked = selected.has(opt);
              return (
                <CheckboxRow
                  key={opt}
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(opt)) next.delete(opt);
                    else next.add(opt);
                    onChange(next);
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
                </CheckboxRow>
              );
            })}
          </div>
        </PickerPanel>
      )}
    </div>
  );
}

function ColumnPicker({ prefs, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const ref = useClickOutside(open, () => setOpen(false));
  const labelFor = (key) => columns.find((c) => c.key === key)?.label || key;
  const visibleCount = prefs.filter((p) => p.visible).length;

  const toggle = (key) =>
    onChange(prefs.map((p) => (p.key === key ? { ...p, visible: !p.visible } : p)));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= prefs.length) return;
    const next = [...prefs];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  // Move an item from `from` to `to` (any distance) — used by drag-and-drop.
  const reorder = (from, to) => {
    if (from == null || to == null || from === to) return;
    const next = [...prefs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const endDrag = () => { setDragIndex(null); setOverIndex(null); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Choose which columns to show and their order"
        style={{
          padding: "7px 14px",
          borderRadius: 7,
          border: `1px solid ${C.slate300}`,
          background: C.white,
          color: C.slate700,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ☰ Columns ({visibleCount}) ▾
      </button>
      {open && (
        <PickerPanel style={{ right: 0, left: "auto", width: 280, padding: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Show & reorder
            </span>
            <GhostButton color={C.slate500} onClick={onReset} style={{ textDecoration: "underline" }}>
              Reset
            </GhostButton>
          </div>
          <div style={{ fontSize: 10, color: C.slate400, padding: "0 4px 6px" }}>
            Drag the ⠿ handle to reorder — drop anywhere in the list.
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }} onDragEnd={endDrag}>
            {prefs.map((pref, index) => {
              const isDragging = dragIndex === index;
              const isDropTarget = overIndex === index && dragIndex !== null && dragIndex !== index;
              return (
              <div
                key={pref.key}
                draggable
                onDragStart={(e) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIndex !== index) setOverIndex(index); }}
                onDrop={(e) => { e.preventDefault(); reorder(dragIndex, index); endDrag(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderRadius: 5,
                  opacity: isDragging ? 0.4 : 1,
                  borderTop: isDropTarget && dragIndex > index ? `2px solid ${C.teal500}` : "2px solid transparent",
                  borderBottom: isDropTarget && dragIndex < index ? `2px solid ${C.teal500}` : "2px solid transparent",
                  background: isDropTarget ? C.teal50 : "transparent",
                }}
                onMouseEnter={(e) => { if (!isDropTarget) e.currentTarget.style.background = C.slate50; }}
                onMouseLeave={(e) => { if (!isDropTarget) e.currentTarget.style.background = "transparent"; }}
              >
                <span
                  title="Drag to reorder"
                  style={{ flexShrink: 0, cursor: "grab", color: C.slate400, fontSize: 13, lineHeight: 1, padding: "0 2px", userSelect: "none" }}
                >
                  ⠿
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer", fontSize: 12, color: C.slate700 }}>
                  <input type="checkbox" checked={pref.visible} onChange={() => toggle(pref.key)} style={{ accentColor: C.teal600 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelFor(pref.key)}</span>
                </label>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    style={{ border: "none", background: "transparent", cursor: index === 0 ? "default" : "pointer", color: index === 0 ? C.slate300 : C.slate500, fontSize: 13, padding: "0 4px", fontFamily: "inherit" }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === prefs.length - 1}
                    title="Move down"
                    style={{ border: "none", background: "transparent", cursor: index === prefs.length - 1 ? "default" : "pointer", color: index === prefs.length - 1 ? C.slate300 : C.slate500, fontSize: 13, padding: "0 4px", fontFamily: "inherit" }}
                  >
                    ↓
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </PickerPanel>
      )}
    </div>
  );
}

function BillabilityBadge({ value }) {
  const text = String(value || "").trim();
  if (!text) return <span style={{ color: C.slate400 }}>—</span>;
  const lower = text.toLowerCase();
  const palette = lower.includes("non") || lower.includes("not")
    ? { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" }
    : lower.includes("partial")
      ? { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" }
      : lower.includes("internal")
        ? { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" }
        : lower.includes("bill")
          ? { bg: "#F0FDF4", color: "#166534", border: "#BBF7D0" }
          : { bg: C.slate100, color: C.slate600, border: C.slate200 };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}>
      {text}
    </span>
  );
}

function formatAllocationPercentage(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Not provided";
  if (text.endsWith("%")) return text;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  if (numeric > 0 && numeric <= 1) return `${Math.round(numeric * 10000) / 100}%`;
  return `${numeric}%`;
}

function allocationSortValue(value) {
  const numeric = Number(String(value ?? "").replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
}

function hasHistoryValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function historyDateSortValue(value, fallback = Number.NEGATIVE_INFINITY) {
  const formatted = formatHistoryDate(value);
  if (!formatted) return fallback;
  const timestamp = Date.parse(formatted);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function parseHistoryDate(value) {
  const formatted = formatHistoryDate(value);
  if (!formatted) return null;
  const date = new Date(formatted);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthYear(value) {
  const date = parseHistoryDate(value);
  if (!date) return formatHistoryDate(value) || "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function computeDurationMonths(startValue, endValue) {
  const start = parseHistoryDate(startValue);
  const end = parseHistoryDate(endValue) || new Date();
  if (!start || end < start) return null;
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
}

function formatDurationLabel(project) {
  if (project.durationLabel) return project.durationLabel;
  const months = project.durationMonths ?? computeDurationMonths(project.start_date ?? project.start, project.end_date ?? project.end);
  if (!Number.isFinite(months)) return "-";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}

function formatDateRangeLabel(project) {
  if (project.dateRangeLabel) return project.dateRangeLabel;
  const start = formatMonthYear(project.start_date ?? project.start);
  const end = project.is_current && !formatHistoryDate(project.end_date ?? project.end)
    ? "Present"
    : formatMonthYear(project.end_date ?? project.end);
  if (!start && !end) return "Dates not provided";
  if (!end) return `${start} - Present`;
  if (!start) return end;
  return `${start} - ${end}`;
}

function historyRowId(project, index) {
  return String(project.id || `history-row-${project.project_name || "project"}-${project.start_date || index}-${index}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function historyProjectIdentity(row) {
  return [
    row?.project_name,
    row?.customer_name,
    formatHistoryDate(row?.start_date),
    formatHistoryDate(row?.end_date),
  ].map((part) => String(part || "").trim().toLowerCase()).join("|");
}

function DurationToggle({ id, durationLabel, dateRangeLabel, expanded, onToggle, labelledBy }) {
  return (
    <button
      type="button"
      className={`duration-card${expanded ? " is-expanded" : ""}`}
      aria-expanded={expanded}
      aria-controls={`details-row-${id}`}
      aria-labelledby={labelledBy}
      onClick={onToggle}
    >
      <span className="duration-copy">
        <span className="duration-total">{durationLabel}</span>
        <span className="duration-range">{dateRangeLabel}</span>
      </span>
      <span className="duration-caret" aria-hidden="true">v</span>
    </button>
  );
}

function HistoryProjectRow({ project, index, expanded, onToggle, detailRef }) {
  const id = historyRowId(project, index);
  const rowLabelId = `row-label-${id}`;
  const detailId = `details-row-${id}`;
  const rowBg = project.is_current ? C.teal50 : (index % 2 === 0 ? C.white : C.slate50);
  const endLabel = project.is_current && !formatHistoryDate(project.end_date)
    ? "Present"
    : (formatHistoryDate(project.end_date) || "-");
  const observedLabel = `${project.first_seen_month || "-"}${project.last_seen_month && project.last_seen_month !== project.first_seen_month ? ` to ${project.last_seen_month}` : ""}`;
  const details = [
    ["Project", project.project_name || "Unnamed project"],
    ["Client", project.customer_name || "-"],
    ["Billability", <BillabilityBadge value={project.billability} />],
    ["Start", formatHistoryDate(project.start_date) || "-"],
    ["End", endLabel],
    ["Vertical", project.project_vertical || "-"],
    ["Allocation", hasHistoryValue(project.allocation_percentage) ? formatAllocationPercentage(project.allocation_percentage) : "-"],
    ["Observed In", observedLabel],
  ];

  return (
    <tr className={`history-row${expanded ? " row-expanded" : ""}`} style={{ background: rowBg }}>
      <td className="duration-cell">
        <DurationToggle
          id={id}
          durationLabel={formatDurationLabel(project)}
          dateRangeLabel={formatDateRangeLabel(project)}
          expanded={expanded}
          onToggle={() => onToggle(id)}
          labelledBy={rowLabelId}
        />
      </td>
      <td className="history-summary-cell" colSpan={7}>
        <div id={rowLabelId} className="history-summary-line">
          <span className="history-project-name">
            {project.project_name || <span style={{ color: C.slate400 }}>Unnamed project</span>}
          </span>
          {project.is_current && <span className="current-pill">CURRENT</span>}
          <span className="history-summary-muted">{project.customer_name || "Client not provided"}</span>
          <BillabilityBadge value={project.billability} />
        </div>
        <div
          id={detailId}
          ref={detailRef}
          role="region"
          aria-labelledby={rowLabelId}
          tabIndex={-1}
          className={`details-panel${expanded ? " is-open" : ""}`}
        >
          <div className="details-grid">
            {details.map(([label, value]) => (
              <div className="details-item" key={label}>
                <span className="details-label">{label}</span>
                <span className="details-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}

function EmployeeHistoryModal({ row, data, loading, error, onClose, singleExpand = false }) {
  const [activeTab, setActiveTab] = useState("current");
  const [expandedHistoryRows, setExpandedHistoryRows] = useState({});
  const [historyAnnouncement, setHistoryAnnouncement] = useState("");
  const detailRefs = useRef({});
  const employee = data?.employee;
  const currentAlignments = data?.current_alignments || [];
  const projects = data?.projects || [];
  const promotions = data?.promotions || [];
  const sortedCurrentAlignments = useMemo(
    () => [...currentAlignments].sort(
      (a, b) => allocationSortValue(b.allocation_percentage) - allocationSortValue(a.allocation_percentage)
    ),
    [currentAlignments]
  );
  const currentAlignmentKeys = useMemo(
    () => new Set(currentAlignments.map(historyProjectIdentity).filter((key) => key !== "|||")),
    [currentAlignments]
  );
  const historicalProjects = useMemo(
    () => projects.filter((project) => !project.is_current && !currentAlignmentKeys.has(historyProjectIdentity(project))),
    [projects, currentAlignmentKeys]
  );
  const sortedProjects = useMemo(
    () => [...historicalProjects].sort((a, b) => {
      const startDifference = historyDateSortValue(b.start_date) - historyDateSortValue(a.start_date);
      if (startDifference) return startDifference;
      const aOngoing = Boolean(a.is_current || !formatHistoryDate(a.end_date));
      const bOngoing = Boolean(b.is_current || !formatHistoryDate(b.end_date));
      if (aOngoing !== bOngoing) return bOngoing - aOngoing;
      const endDifference = historyDateSortValue(b.end_date, Number.POSITIVE_INFINITY)
        - historyDateSortValue(a.end_date, Number.POSITIVE_INFINITY);
      if (endDifference) return endDifference;
      return String(b.last_seen_month || "").localeCompare(String(a.last_seen_month || ""));
    }),
    [historicalProjects]
  );
  const dateOfJoining = employee?.date_of_joining || "";
  const headerName = employee?.name || row?.name || row?.employee_id || "Resource";
  const headerId = employee?.employee_id || row?.employee_id || "";
  const headerDesignation = employee?.designation || row?.designation || "";
  const headerGrade = employee?.grade || row?.grade || "";
  const headerLoc = employee?.office_location || row?.office_location || "";

  useEffect(() => {
    setActiveTab("current");
    setExpandedHistoryRows({});
    setHistoryAnnouncement("");
    detailRefs.current = {};
  }, [row?.employee_id]);

  const toggleHistoryRow = useCallback((id) => {
    let shouldFocus = false;
    setExpandedHistoryRows((current) => {
      const nextExpanded = !current[id];
      shouldFocus = nextExpanded;
      setHistoryAnnouncement(nextExpanded ? "Project details expanded." : "Project details collapsed.");
      if (singleExpand) return nextExpanded ? { [id]: true } : {};
      return { ...current, [id]: nextExpanded };
    });
    window.setTimeout(() => {
      if (shouldFocus) detailRefs.current[id]?.focus();
    }, 220);
  }, [singleExpand]);

  const tabStyle = (tab) => ({
    border: "none",
    borderBottom: `3px solid ${activeTab === tab ? C.teal600 : "transparent"}`,
    background: activeTab === tab ? C.teal50 : C.white,
    color: activeTab === tab ? C.teal700 : C.slate500,
    padding: "12px 18px 10px",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 14, width: "min(820px, 96vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.22)" }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.slate200}`, background: C.slate700, color: C.white, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{headerName}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 5, flexWrap: "wrap", fontSize: 12, color: C.slate300 }}>
              {headerId && <span>{headerId}</span>}
              {headerDesignation && <><span style={{ width: 3, height: 3, borderRadius: "50%", background: C.slate500, display: "inline-block" }} /><span>{headerDesignation}</span></>}
              {headerGrade && <><span style={{ width: 3, height: 3, borderRadius: "50%", background: C.slate500, display: "inline-block" }} /><span>{headerGrade}</span></>}
              {headerLoc && <><span style={{ width: 3, height: 3, borderRadius: "50%", background: C.slate500, display: "inline-block" }} /><span>{headerLoc}</span></>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.slate300, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", borderBottom: `1px solid ${C.slate200}`, padding: "0 24px", background: C.white }}>
          <button onClick={() => setActiveTab("current")} style={tabStyle("current")}>
            Current Alignment ({currentAlignments.length})
          </button>
          <button onClick={() => setActiveTab("history")} style={tabStyle("history")}>
            Historical Data
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 24px", overflowY: "auto" }}>
          {!loading && !error && activeTab === "current" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                Current Alignment {data?.as_of ? `as of ${data.as_of}` : ""}
              </div>
              {currentAlignments.length === 0 ? (
                <div style={{ color: C.slate500, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  No current alignment found in the latest uploaded allocation month.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedCurrentAlignments.map((alignment, i) => (
                    <div key={`${alignment.project_name}-${alignment.customer_name}-${i}`} style={{ border: `1px solid ${C.teal100}`, borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${C.teal500}`, background: C.teal50 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.slate800 }}>
                            {alignment.project_name || "Unnamed project"}
                          </div>
                          <div style={{ fontSize: 12, color: C.slate600, marginTop: 3 }}>
                            Client: <strong style={{ color: C.slate700 }}>{alignment.customer_name || "Not provided"}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: C.slate500, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.4 }}>Allocation</div>
                          <div style={{ fontSize: 18, color: C.teal700, fontWeight: 700, marginTop: 2 }}>
                            {formatAllocationPercentage(alignment.allocation_percentage)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: C.slate500, alignItems: "center" }}>
                        <BillabilityBadge value={alignment.billability} />
                        {alignment.project_vertical && <span><strong style={{ color: C.slate700 }}>Vertical:</strong> {alignment.project_vertical}</span>}
                        {alignment.start_date && <span><strong style={{ color: C.slate700 }}>Start:</strong> {formatHistoryDate(alignment.start_date)}</span>}
                        {alignment.end_date && <span><strong style={{ color: C.slate700 }}>End:</strong> {formatHistoryDate(alignment.end_date)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && !error && activeTab === "history" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                Promotion & Grade History
              </div>
              {promotions.length === 0 ? (
                <div style={{ color: C.slate500, fontSize: 12, background: C.slate50, border: `1px solid ${C.slate200}`, borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
                  No grade change found across the uploaded monthly snapshots.
                </div>
              ) : (
                <div style={{ overflowX: "auto", border: `1px solid ${C.green100}`, borderRadius: 9, marginBottom: 20 }}>
                  <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse", fontFamily: "inherit" }}>
                    <thead>
                      <tr style={{ background: "#F0FDF4" }}>
                        {["Effective Month", "Previous Grade", "New Grade", "Designation", "Date of Joining"].map((label) => (
                          <th key={label} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: C.slate600, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.green100}`, whiteSpace: "nowrap" }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...promotions].reverse().map((promotion, i) => (
                        <tr key={`${promotion.effective_month}-${i}`} style={{ background: i % 2 === 0 ? C.white : "#F8FFF9" }}>
                          <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.green600, borderBottom: `1px solid ${C.green100}`, whiteSpace: "nowrap" }}>{promotion.effective_month}</td>
                          <td style={{ padding: "10px 12px", fontSize: 12, color: C.slate700, borderBottom: `1px solid ${C.green100}`, whiteSpace: "nowrap" }}>{promotion.from_grade || "-"}</td>
                          <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.green600, borderBottom: `1px solid ${C.green100}`, whiteSpace: "nowrap" }}>{promotion.to_grade || "-"}</td>
                          <td style={{ padding: "10px 12px", fontSize: 12, color: C.slate700, borderBottom: `1px solid ${C.green100}` }}>{promotion.designation || "-"}</td>
                          <td style={{ padding: "10px 12px", fontSize: 12, color: C.slate700, borderBottom: `1px solid ${C.green100}`, whiteSpace: "nowrap" }}>{formatHistoryDate(dateOfJoining) || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Project & Client History
                </div>
                {sortedProjects.length > 0 && (
                  <button
                    onClick={() => {
                      const exportRows = sortedProjects.map((project) => ({
                        Project: project.project_name || "",
                        Client: project.customer_name || "",
                        Billability: project.billability || "",
                        "Start Date": formatHistoryDate(project.start_date),
                        "End Date": project.is_current && !formatHistoryDate(project.end_date)
                          ? "Present"
                          : formatHistoryDate(project.end_date),
                        Vertical: project.project_vertical || "",
                        "Allocation Percentage": hasHistoryValue(project.allocation_percentage)
                          ? formatAllocationPercentage(project.allocation_percentage)
                          : "",
                        "First Observed Month": project.first_seen_month || "",
                        "Last Observed Month": project.last_seen_month || "",
                        Current: project.is_current ? "Yes" : "No",
                      }));
                      const safeEmployeeId = String(headerId || "Employee").replace(/[^\w-]+/g, "_");
                      const stamp = new Date().toISOString().slice(0, 10);
                      downloadExcel(exportRows, `Project_Client_History_${safeEmployeeId}_${stamp}.xlsx`, "Project Client History");
                    }}
                    style={{ padding: "6px 11px", borderRadius: 7, border: `1px solid ${C.teal600}`, background: C.white, color: C.teal700, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  >
                    Download Excel
                  </button>
                )}
              </div>
            </>
          )}

          {loading && <div style={{ color: C.slate500, fontSize: 13, padding: "20px 0" }}>Loading history…</div>}

          {!loading && error && (
            <div style={{ color: "#991B1B", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 14px", fontSize: 12 }}>
              {error}
            </div>
          )}

          {!loading && !error && activeTab === "history" && sortedProjects.length === 0 && (
            <div style={{ color: C.slate500, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No past project history found outside the current alignments.
            </div>
          )}

          {!loading && !error && activeTab === "history" && sortedProjects.length > 0 && (
            <div>
              <style>{`
                .history-table-wrap {
                  overflow-x: auto;
                  border: 1px solid ${C.slate200};
                  border-radius: 8px;
                }
                .history-table {
                  width: 100%;
                  min-width: 920px;
                  border-collapse: collapse;
                  font-family: inherit;
                }
                .history-row {
                  transition: background 180ms ease-out;
                }
                .history-row:hover {
                  background: #F8FAFC !important;
                }
                .duration-cell,
                .history-summary-cell {
                  border-bottom: 1px solid ${C.slate200};
                  vertical-align: top;
                }
                .duration-cell {
                  width: 178px;
                  padding: 8px 10px 8px 12px;
                }
                .history-summary-cell {
                  padding: 11px 12px;
                }
                .duration-card {
                  width: 100%;
                  min-height: 44px;
                  border: 1px solid ${C.slate200};
                  border-radius: 6px;
                  background: ${C.slate50};
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 10px;
                  padding: 8px 7px 8px 10px;
                  font-family: inherit;
                  text-align: left;
                  cursor: pointer;
                  transition: background 180ms ease-out, border-color 180ms ease-out, box-shadow 180ms ease-out;
                }
                .duration-card:hover {
                  background: #F8FAFC;
                  border-color: ${C.slate300};
                }
                .duration-card:focus-visible,
                .details-panel:focus-visible {
                  outline: 2px solid ${C.teal500};
                  outline-offset: 2px;
                }
                .duration-card.is-expanded {
                  background: ${C.white};
                  border-color: ${C.teal300};
                  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.10);
                }
                .duration-copy {
                  min-width: 0;
                  display: flex;
                  flex-direction: column;
                  gap: 2px;
                }
                .duration-total {
                  color: ${C.slate800};
                  font-size: 16px;
                  font-weight: 700;
                  line-height: 1.1;
                }
                .duration-range {
                  color: ${C.slate600};
                  font-size: 11px;
                  line-height: 1.25;
                  white-space: nowrap;
                }
                .duration-caret {
                  width: 22px;
                  height: 22px;
                  flex: 0 0 22px;
                  border-radius: 999px;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  color: ${C.slate500};
                  background: ${C.white};
                  border: 1px solid ${C.slate200};
                  font-size: 15px;
                  line-height: 1;
                  transition: transform 180ms ease-out, background 180ms ease-out, color 180ms ease-out;
                }
                .duration-card.is-expanded .duration-caret {
                  transform: rotate(180deg);
                  background: ${C.teal50};
                  color: ${C.teal700};
                  border-color: ${C.teal100};
                }
                .history-summary-line {
                  min-height: 28px;
                  display: flex;
                  align-items: center;
                  gap: 9px;
                  flex-wrap: wrap;
                  font-size: 12px;
                  color: ${C.slate700};
                }
                .history-project-name {
                  font-size: 12px;
                  font-weight: 700;
                  color: ${C.slate800};
                }
                .history-summary-muted {
                  color: ${C.slate500};
                }
                .current-pill {
                  display: inline-block;
                  font-size: 8px;
                  font-weight: 700;
                  background: ${C.teal600};
                  color: ${C.white};
                  padding: 2px 6px;
                  border-radius: 9px;
                  letter-spacing: 0.3px;
                }
                .details-panel {
                  max-height: 0;
                  overflow: hidden;
                  opacity: 0;
                  transition: max-height 210ms ease-out, opacity 160ms ease-out, margin-top 210ms ease-out;
                }
                .details-panel.is-open {
                  max-height: 260px;
                  opacity: 1;
                  margin-top: 10px;
                }
                .details-grid {
                  display: grid;
                  grid-template-columns: repeat(4, minmax(120px, 1fr));
                  gap: 8px 12px;
                  padding: 12px;
                  border-radius: 6px;
                  background: rgba(255, 255, 255, 0.72);
                  border: 1px solid ${C.slate200};
                }
                .details-item {
                  display: flex;
                  flex-direction: column;
                  gap: 3px;
                  min-width: 0;
                }
                .details-label {
                  font-size: 9px;
                  font-weight: 700;
                  color: ${C.slate500};
                  text-transform: uppercase;
                  letter-spacing: 0.35px;
                }
                .details-value {
                  font-size: 12px;
                  color: ${C.slate700};
                  font-weight: 600;
                  min-width: 0;
                  overflow-wrap: anywhere;
                }
                @media (max-width: 720px) {
                  .history-table-wrap {
                    overflow-x: visible;
                    border: none;
                  }
                  .history-table {
                    min-width: 0;
                    display: block;
                  }
                  .history-table tbody,
                  .history-row,
                  .duration-cell,
                  .history-summary-cell {
                    display: block;
                    width: 100%;
                    box-sizing: border-box;
                  }
                  .history-row {
                    border: 1px solid ${C.slate200};
                    border-radius: 8px;
                    overflow: hidden;
                    margin-bottom: 10px;
                  }
                  .duration-cell {
                    padding: 10px 10px 0;
                    border-bottom: none;
                  }
                  .history-summary-cell {
                    padding: 10px;
                  }
                  .details-panel.is-open {
                    max-height: 520px;
                  }
                  .details-grid {
                    grid-template-columns: 1fr;
                  }
                }
              `}</style>
              <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
                {historyAnnouncement}
              </div>
              <div className="history-table-wrap">
                <table className="history-table">
                  <tbody>
                    {sortedProjects.map((p, i) => {
                      const id = historyRowId(p, i);
                      return (
                        <HistoryProjectRow
                          key={id}
                          project={p}
                          index={i}
                          expanded={Boolean(expandedHistoryRows[id])}
                          onToggle={toggleHistoryRow}
                          detailRef={(node) => {
                            if (node) detailRefs.current[id] = node;
                            else delete detailRefs.current[id];
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResourceSearchPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCriteria, setActiveCriteria] = useState(new Set());
  const [selectedValues, setSelectedValues] = useState({});
  const [searches, setSearches] = useState([{ field: "skillsets", query: "" }]);

  const addSearch = () => setSearches((arr) => [...arr, { field: "skillsets", query: "" }]);
  const removeSearch = (idx) => setSearches((arr) =>
    arr.length > 1 ? arr.filter((_, i) => i !== idx) : [{ field: "skillsets", query: "" }]
  );
  const updateSearch = (idx, patch) => setSearches((arr) =>
    arr.map((s, i) => (i === idx ? { ...s, ...patch } : s))
  );
  const [hoveredRow, setHoveredRow] = useState(null);
  const [sortStack, setSortStack] = useState([]);
  const [colWidths, setColWidths] = useState(() =>
    columns.reduce((acc, c) => { acc[c.key] = c.width; return acc; }, {})
  );
  const resizingRef = useRef(null);

  // ── Column show/hide + order (persisted to localStorage) ──
  const [columnPrefs, setColumnPrefs] = useState(loadColumnPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_PREFS_STORAGE_KEY, JSON.stringify(columnPrefs));
    } catch { /* storage unavailable — keep working in-memory */ }
  }, [columnPrefs]);

  const visibleColumns = useMemo(() => {
    const pinned = columns.find((c) => c.key === PINNED_COLUMN);
    const ordered = columnPrefs
      .filter((p) => p.visible)
      .map((p) => columns.find((c) => c.key === p.key))
      .filter(Boolean);
    return pinned ? [pinned, ...ordered] : ordered;
  }, [columnPrefs]);

  // ── Employee project-history popup ──
  const [historyRow, setHistoryRow] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const openHistory = useCallback(async (row) => {
    const id = String(row.employee_id || "").trim();
    if (!id) return;
    setHistoryRow(row);
    setHistoryData(null);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const data = await fetchEmployeeHistory(id);
      setHistoryData(data);
    } catch (err) {
      setHistoryError(err.message || "Could not load project history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleResizeMove = useCallback((e) => {
    const r = resizingRef.current;
    if (!r) return;
    const newW = Math.max(40, r.startWidth + (e.clientX - r.startX));
    setColWidths((prev) => (prev[r.key] === newW ? prev : { ...prev, [r.key]: newW }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [handleResizeMove]);

  const startResize = (e, key) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const resetColWidths = () => {
    setColWidths(columns.reduce((acc, c) => { acc[c.key] = c.width; return acc; }, {}));
  };

  const totalWidth = useMemo(
    () => visibleColumns.reduce((sum, c) => sum + (colWidths[c.key] || c.width), 0),
    [colWidths, visibleColumns]
  );

  const widthsCustomized = useMemo(
    () => columns.some((c) => colWidths[c.key] !== c.width),
    [colWidths]
  );

  const cycleSort = (key) => {
    setSortStack((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return [...prev, { key, dir: "asc" }];
      const current = prev[idx];
      if (current.dir === "asc") {
        const next = [...prev];
        next[idx] = { key, dir: "desc" };
        return next;
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => {
    let active = true;

    async function loadRows() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchAllMSDResources();
        if (active) setRows(Array.isArray(result?.rows) ? result.rows : []);
      } catch (err) {
        if (active) {
          setRows([]);
          setError(err.message || "Could not load resources.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRows();
    return () => { active = false; };
  }, []);

  const toggleCriterion = (key) => {
    setActiveCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setSelectedValues((sv) => {
          if (!(key in sv)) return sv;
          const copy = { ...sv };
          delete copy[key];
          return copy;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const setValuesFor = (key, valuesSet) => {
    setSelectedValues((sv) => ({ ...sv, [key]: valuesSet }));
  };

  const removeCriterion = (key) => {
    setActiveCriteria((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setSelectedValues((sv) => {
      if (!(key in sv)) return sv;
      const copy = { ...sv };
      delete copy[key];
      return copy;
    });
  };

  const clearAll = () => {
    setActiveCriteria(new Set());
    setSelectedValues({});
    setSearches([{ field: "skillsets", query: "" }]);
    setSortStack([]);
  };

  const activeSearches = useMemo(() => {
    return searches
      .map((s) => ({
        field: s.field,
        tokens: s.query.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      }))
      .filter((s) => s.tokens.length > 0);
  }, [searches]);

  const resourceRows = useMemo(() => mergeResourceRows(rows), [rows]);

  const filteredRows = useMemo(() => {
    return resourceRows.filter((row) => {
      for (const key of activeCriteria) {
        const sel = selectedValues[key];
        if (!sel || sel.size === 0) continue;
        const rowValues = splitMergedValues(row[key]);
        if (!rowValues.some((value) => sel.has(value))) return false;
      }
      for (const { field, tokens } of activeSearches) {
        const haystack = String(row[field] || "").toLowerCase();
        if (!tokens.some((token) => haystack.includes(token))) return false;
      }
      return true;
    });
  }, [resourceRows, activeCriteria, selectedValues, activeSearches]);

  const sortedRows = useMemo(() => {
    if (sortStack.length === 0) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      for (const { key, dir } of sortStack) {
        const av = String(a[key] ?? "").trim();
        const bv = String(b[key] ?? "").trim();
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, sortStack]);

  const visibleRows = sortedRows.slice(0, MAX_VISIBLE_ROWS);
  const groupKeys = sortStack.length > 1 ? sortStack.slice(0, -1).map((s) => s.key) : [];
  const hasRows = resourceRows.length > 0;
  const hasActiveFilters = activeCriteria.size > 0 || activeSearches.length > 0;

  const exportToExcel = () => {
    const exportColumns = visibleColumns.filter((column) => column.key !== PINNED_COLUMN);
    const data = sortedRows.map((row) =>
      exportColumns.reduce((acc, column) => {
        acc[column.label] = row[column.key] ?? "";
        return acc;
      }, {})
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadExcel(data, `Resource_Search_${stamp}.xlsx`, "Resources");
  };

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 24px 40px" }}>
      {historyRow && (
        <EmployeeHistoryModal
          row={historyRow}
          data={historyData}
          loading={historyLoading}
          error={historyError}
          onClose={() => setHistoryRow(null)}
        />
      )}
      <Card style={{ marginBottom: 16, padding: "18px 20px", overflow: "visible" }}>
        <SectionTitle style={{ marginBottom: 8 }}>Search</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {searches.map((s, idx) => {
            const meta = SEARCH_FIELDS.find((f) => f.key === s.field) || SEARCH_FIELDS[0];
            const showRemove = searches.length > 1;
            return (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <select
                  value={s.field}
                  onChange={(e) => updateSearch(idx, { field: e.target.value })}
                  title="Choose which field to search"
                  style={{
                    padding: "9px 10px",
                    borderRadius: 7,
                    border: `1px solid ${C.slate200}`,
                    background: C.white,
                    color: C.slate700,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                >
                  {SEARCH_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    value={s.query}
                    onChange={(e) => updateSearch(idx, { query: e.target.value })}
                    placeholder={meta.placeholder}
                    style={{ ...baseInputStyle, padding: s.query ? "9px 70px 9px 12px" : "9px 12px", borderRadius: 7 }}
                    onFocus={(e) => (e.target.style.borderColor = C.teal400)}
                    onBlur={(e) => (e.target.style.borderColor = C.slate200)}
                  />
                  {s.query && (
                    <button
                      onClick={() => updateSearch(idx, { query: "" })}
                      style={{
                        position: "absolute",
                        right: 9,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        color: C.teal600,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      × Clear
                    </button>
                  )}
                </div>
                {showRemove && (
                  <button
                    onClick={() => removeSearch(idx)}
                    title="Remove this search field"
                    style={{
                      padding: "0 12px",
                      borderRadius: 7,
                      border: `1px solid ${C.slate200}`,
                      background: C.white,
                      color: C.slate500,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
            <button
              onClick={addSearch}
              style={{
                padding: "7px 14px",
                borderRadius: 7,
                border: `1px dashed ${C.teal600}`,
                background: C.teal50,
                color: C.teal700,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Add search field
            </button>
            <button
              onClick={clearAll}
              disabled={!hasActiveFilters}
              title={hasActiveFilters ? "Clear all search fields, criteria, and sorting" : "Nothing to clear"}
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                border: "1px solid transparent",
                background: hasActiveFilters ? C.slate700 : C.slate200,
                color: hasActiveFilters ? C.white : C.slate400,
                fontSize: 12,
                fontWeight: 700,
                cursor: hasActiveFilters ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Clear All
            </button>
          </div>
        </div>

        <SectionTitle style={{ marginBottom: 10 }}>Filter Criteria</SectionTitle>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <CriteriaPicker
            activeCriteria={activeCriteria}
            onToggle={toggleCriterion}
          />
          {[...activeCriteria].map((key) => {
            const field = CRITERIA_FIELDS.find((f) => f.key === key);
            if (!field) return null;
            return (
              <ValuePicker
                key={key}
                field={field}
                allRows={resourceRows}
                selected={selectedValues[key] || new Set()}
                onChange={(set) => setValuesFor(key, set)}
                onRemove={() => removeCriterion(key)}
              />
            );
          })}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <ColumnPicker
              prefs={columnPrefs}
              onChange={setColumnPrefs}
              onReset={() => setColumnPrefs(defaultColumnPrefs())}
            />
            <button
              onClick={exportToExcel}
              disabled={filteredRows.length === 0}
              title={filteredRows.length === 0 ? "No rows to export" : "Download filtered rows as Excel"}
              style={{
                padding: "7px 14px",
                borderRadius: 7,
                border: `1px solid ${C.teal600}`,
                background: filteredRows.length === 0 ? C.slate100 : C.white,
                color: filteredRows.length === 0 ? C.slate400 : C.teal700,
                fontSize: 12,
                fontWeight: 600,
                cursor: filteredRows.length === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              ⬇ Download Excel{filteredRows.length > 0 ? ` (${filteredRows.length})` : ""}
            </button>
          </div>
        </div>
      </Card>

      {loading && (
        <Card style={{ color: C.slate500, fontSize: 12, padding: "18px 20px" }}>
          Loading resources…
        </Card>
      )}

      {!loading && error && (
        <Card style={{ color: "#991B1B", background: "#FEF2F2", borderColor: "#FECACA", fontSize: 12 }}>
          {error}
        </Card>
      )}

      {!loading && !error && !hasRows && (
        <Card style={{ textAlign: "center", color: C.slate500, fontSize: 13, padding: "34px 22px" }}>
          No MSD Allocation data found. Upload an MSD file to get started.
        </Card>
      )}

      {!loading && !error && hasRows && (
        <>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "0 0 8px 2px" }}>
            <div style={{ fontSize: 12, color: C.slate600 }}>
              Showing {filteredRows.length} of {resourceRows.length} resources
            </div>
            {sortStack.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginLeft: 8 }}>
                {sortStack.map((s, i) => {
                  const col = columns.find((c) => c.key === s.key);
                  const isInnermost = i === sortStack.length - 1;
                  return (
                    <span
                      key={s.key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: isInnermost ? C.teal50 : C.slate100,
                        color: isInnermost ? C.teal700 : C.slate700,
                        border: `1px solid ${isInnermost ? C.teal100 : C.slate200}`,
                        borderRadius: 12,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {isInnermost ? "Sort:" : `Group ${i + 1}:`} {col?.label} {s.dir === "asc" ? "↑" : "↓"}
                    </span>
                  );
                })}
                <GhostButton
                  onClick={() => setSortStack([])}
                  color={C.slate500}
                  style={{ textDecoration: "underline" }}
                >
                  Clear sort
                </GhostButton>
              </div>
            )}
            {widthsCustomized && (
              <GhostButton
                onClick={resetColWidths}
                color={C.slate500}
                style={{ marginLeft: "auto", textDecoration: "underline" }}
                title="Reset all column widths to defaults"
              >
                Reset column widths
              </GhostButton>
            )}
          </div>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: totalWidth, borderCollapse: "collapse", tableLayout: "fixed", fontFamily: "'Outfit',sans-serif" }}>
                <colgroup>
                  {visibleColumns.map((column) => (
                    <col key={column.key} style={{ width: colWidths[column.key] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ background: C.slate700 }}>
                    {visibleColumns.map((column) => {
                      const sortable = column.key !== PINNED_COLUMN;
                      const sortIdx = sortStack.findIndex((s) => s.key === column.key);
                      const sortInfo = sortIdx >= 0 ? sortStack[sortIdx] : null;
                      const isInnermost = sortIdx >= 0 && sortIdx === sortStack.length - 1;
                      const isSorted = sortInfo != null;
                      return (
                        <th
                          key={column.key}
                          onClick={sortable ? () => cycleSort(column.key) : undefined}
                          title={sortable ? "Click to sort (asc → desc → unsort). Sorting a new column groups the previous one." : undefined}
                          style={{
                            ...tableHeaderStyle,
                            cursor: sortable ? "pointer" : "default",
                            userSelect: "none",
                            background: isInnermost ? C.teal600 : isSorted ? C.teal800 : "transparent",
                            fontWeight: isSorted ? 700 : 500,
                            borderBottom: isInnermost ? `2px solid ${C.teal400}` : "2px solid transparent",
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span>{column.label}</span>
                            {sortInfo && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                {sortStack.length > 1 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      background: C.white,
                                      color: isInnermost ? C.teal700 : C.teal800,
                                      padding: "1px 5px",
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      letterSpacing: 0,
                                    }}
                                  >
                                    {isInnermost ? sortIdx + 1 : `G${sortIdx + 1}`}
                                  </span>
                                )}
                                <span style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>
                                  {sortInfo.dir === "asc" ? "↑" : "↓"}
                                </span>
                              </span>
                            )}
                          </span>
                          <span
                            onMouseDown={(e) => startResize(e, column.key)}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to resize column"
                            style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              width: 6,
                              height: "100%",
                              cursor: "col-resize",
                              userSelect: "none",
                              zIndex: 1,
                            }}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length} style={{ padding: "36px 12px", textAlign: "center", color: C.slate400, fontSize: 12 }}>
                        No resources match the current filters.
                      </td>
                    </tr>
                  ) : visibleRows.map((row, index) => {
                    const isGroupBreak =
                      groupKeys.length > 0 &&
                      index > 0 &&
                      groupKeys.some((k) => String(visibleRows[index - 1][k] ?? "") !== String(row[k] ?? ""));
                    return (
                    <tr
                      key={`${row.employee_id || "resource"}-${index}`}
                      onMouseEnter={() => setHoveredRow(index)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        background: hoveredRow === index ? "#F0FDFA" : index % 2 === 0 ? C.white : C.slate50,
                        borderTop: isGroupBreak ? `2px solid ${C.teal300}` : undefined,
                      }}
                    >
                      {visibleColumns.map((column) => {
                        let content;
                        if (column.key === PINNED_COLUMN) {
                          content = index + 1;
                        } else if (column.key === "skillsets") {
                          content = <SkillTags value={row.skillsets} />;
                        } else if (column.key === "billability") {
                          content = <BillabilityBadge value={row.billability} />;
                        } else if (column.key === "project_start_date" || column.key === "project_end_date") {
                          content = formatHistoryDate(row[column.key]);
                        } else if (column.key === "name") {
                          const hasId = !!String(row.employee_id || "").trim();
                          const display = row.name || row.employee_id || "—";
                          content = hasId ? (
                            <button
                              onClick={() => openHistory(row)}
                              title={`View ${row.name || "this resource"}'s project & client history`}
                              style={{
                                background: "transparent", border: "none", padding: 0,
                                fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                                color: C.teal700, cursor: "pointer", textAlign: "left",
                                textDecoration: "underline", textDecorationColor: C.teal100,
                                textUnderlineOffset: 2,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = C.teal600)}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = C.teal100)}
                            >
                              {display}
                            </button>
                          ) : (display);
                        } else {
                          content = row[column.key] || "";
                        }
                        return (
                          <td key={column.key} style={tableCellStyle}>
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {filteredRows.length > MAX_VISIBLE_ROWS && (
            <div style={{ fontSize: 11, color: C.slate500, marginTop: 8 }}>
              Showing first 100 results. Refine your filters to narrow down.
            </div>
          )}
        </>
      )}
    </div>
  );
}
