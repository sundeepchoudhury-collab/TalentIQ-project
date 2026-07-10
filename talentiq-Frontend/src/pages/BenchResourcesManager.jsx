import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme";
import { Card, SectionTitle } from "../components/ui";
import { addManualBenchIds, deleteBenchIds, fetchBenchInventory } from "../api";
import { formatBenchDuration } from "../dataProcessor";
import { downloadExcel } from "../utils/excel";

const COLUMN_PREFS_KEY = "talentiq.benchResources.columnPrefs.v1";
const COLUMNS = [
  { key: "_select", label: "", width: 42, fixed: true },
  { key: "id", label: "Employee ID", width: 110 },
  { key: "name", label: "Name", width: 150 },
  { key: "grade", label: "Grade", width: 80 },
  { key: "designation", label: "Designation", width: 160 },
  { key: "location", label: "Shore", width: 100 },
  { key: "workLocation", label: "Work Location", width: 130 },
  { key: "lob", label: "LOB", width: 110 },
  { key: "vertical", label: "Vertical", width: 110 },
  { key: "client", label: "Client", width: 150 },
  { key: "benchTenure", label: "Bench Tenure", width: 110 },
  { key: "skillsText", label: "Key Skills", width: 240 },
  { key: "sourceLabel", label: "Source", width: 110 },
  { key: "effectiveDate", label: "Effective Date", width: 110 },
  { key: "updatedAtLabel", label: "Last Updated", width: 150 },
  { key: "statusLabel", label: "Status", width: 150 },
  { key: "_actions", label: "Actions", width: 82, fixed: true },
];
const CHOOSABLE_COLUMNS = COLUMNS.filter((column) => !column.fixed);

function defaultColumnPrefs() {
  return CHOOSABLE_COLUMNS.map((column) => ({ key: column.key, visible: true }));
}
function loadColumnPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_PREFS_KEY) || "[]");
    const valid = new Set(CHOOSABLE_COLUMNS.map((column) => column.key));
    const seen = new Set();
    const result = [];
    for (const pref of Array.isArray(saved) ? saved : []) {
      if (pref && valid.has(pref.key) && !seen.has(pref.key)) {
        result.push({ key: pref.key, visible: pref.visible !== false });
        seen.add(pref.key);
      }
    }
    for (const column of CHOOSABLE_COLUMNS) {
      if (!seen.has(column.key)) result.push({ key: column.key, visible: true });
    }
    return result;
  } catch {
    return defaultColumnPrefs();
  }
}
function normalizeId(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}
function splitIds(value) {
  return String(value || "").split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean);
}
function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function enrich(resource) {
  const source = resource.resourceSource === "manual" ? "manual" : "file_upload";
  return {
    ...resource,
    benchTenure: resource.benchDays == null || resource.benchDays === "" ? "-" : formatBenchDuration(resource.benchDays),
    skillsText: Array.isArray(resource.skills) ? resource.skills.join(", ") : "",
    sourceLabel: source === "manual" ? "Manual" : "File Upload",
    resourceSource: source,
    updatedAtLabel: formatDateTime(resource.updatedAt),
    statusLabel: resource.foundInMsd === false ? "ID saved; MSD details not found" : "Matched in MSD",
  };
}

function controlStyle() {
  return { height: 36, borderRadius: 7, border: `1px solid ${C.slate300}`, background: C.white, color: C.slate700, padding: "7px 9px", fontFamily: "inherit", fontSize: 11 };
}

function displayDate(value) {
  if (!value) return "Choose date";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function SnapshotDatePicker({ value, latestDate, dates, onChange }) {
  const [open, setOpen] = useState(false);
  const uniqueDates = [...new Set(dates || [])].sort().reverse();
  return (
    <div style={{ position: "relative", marginTop: 5 }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          ...controlStyle(),
          minWidth: 178,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <span>{displayDate(value)}</span>
        <span aria-hidden="true">▦</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", zIndex: 45, left: 0, top: 42, width: 300,
          background: C.white, border: `1px solid ${C.slate200}`, borderRadius: 10,
          boxShadow: "0 12px 30px rgba(15,23,42,0.17)", padding: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate700, marginBottom: 8 }}>
            Bench database snapshot dates
          </div>
          <div style={{ maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {uniqueDates.length ? uniqueDates.map((date) => {
              const isLatest = date === latestDate;
              return (
                <div
                  key={date}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 9px", borderRadius: 7,
                    border: `1px solid ${isLatest ? C.teal300 : C.slate200}`,
                    background: isLatest ? C.teal50 : C.slate50,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: isLatest ? 800 : 600, color: isLatest ? C.teal700 : C.slate700 }}>
                    {displayDate(date)}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: isLatest ? C.teal700 : C.slate400, textTransform: "uppercase" }}>
                    {isLatest ? "Latest / Active" : "Historical"}
                  </span>
                </div>
              );
            }) : (
              <div style={{ padding: 10, color: C.slate400, fontSize: 11 }}>No saved snapshot dates.</div>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${C.slate200}`, marginTop: 10, paddingTop: 10 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.slate600, marginBottom: 5 }}>
              Choose latest or a newer update date
            </label>
            <input
              type="date"
              min={latestDate || undefined}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                setOpen(false);
              }}
              style={{ ...controlStyle(), width: "100%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnPicker({ prefs, onChange }) {
  const [open, setOpen] = useState(false);
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= prefs.length) return;
    const next = [...prefs];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ ...controlStyle(), fontWeight: 700, cursor: "pointer" }}>
        Columns ({prefs.filter((pref) => pref.visible).length})
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 40, right: 0, top: 41, width: 285, maxHeight: 390, overflowY: "auto", padding: 10, background: C.white, border: `1px solid ${C.slate200}`, borderRadius: 9, boxShadow: "0 10px 28px rgba(15,23,42,0.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <strong style={{ fontSize: 11 }}>Show and order columns</strong>
            <button type="button" onClick={() => onChange(defaultColumnPrefs())} style={{ border: "none", background: "transparent", color: C.teal700, cursor: "pointer", fontSize: 10 }}>Reset</button>
          </div>
          {prefs.map((pref, index) => (
            <div key={pref.key} style={{ display: "flex", gap: 7, alignItems: "center", padding: "5px 2px", borderTop: index ? `1px solid ${C.slate100}` : "none" }}>
              <input type="checkbox" checked={pref.visible} onChange={() => onChange(prefs.map((item) => item.key === pref.key ? { ...item, visible: !item.visible } : item))} />
              <span style={{ flex: 1, fontSize: 11 }}>{COLUMNS.find((column) => column.key === pref.key)?.label}</span>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} style={{ border: "none", background: "transparent" }}>↑</button>
              <button type="button" disabled={index === prefs.length - 1} onClick={() => move(index, 1)} style={{ border: "none", background: "transparent" }}>↓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BenchResourcesManager({ bench = [], onBenchChanged, manualEntryFocusToken = 0 }) {
  const [inventory, setInventory] = useState({ rows: [], as_of: null, available_dates: [], last_updated_at: null });
  const [effectiveDate, setEffectiveDate] = useState("");
  const [manualIds, setManualIds] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shoreFilter, setShoreFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortStack, setSortStack] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [columnPrefs, setColumnPrefs] = useState(loadColumnPrefs);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedFilterKeys, setSelectedFilterKeys] = useState([]);
  const [manualEntryHighlight, setManualEntryHighlight] = useState(false);
  const manualEntryRef = useRef(null);
  const manualIdsRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(columnPrefs)); } catch { /* ignore */ }
  }, [columnPrefs]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!manualEntryFocusToken) return undefined;
    setAddOpen(true);
    setManualEntryHighlight(true);
    const focusTimer = window.setTimeout(() => {
      manualEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      manualIdsRef.current?.focus();
    }, 80);
    const highlightTimer = window.setTimeout(() => setManualEntryHighlight(false), 1800);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [manualEntryFocusToken]);

  const loadLatest = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchBenchInventory();
      setInventory(result);
      if (result.as_of) setEffectiveDate(result.as_of);
      setSelected(new Set());
    } catch (err) {
      setError(err.message || "Could not load bench resources.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadLatest(); }, [bench.length]);

  const fallbackRows = bench.map((resource) => ({ ...resource, resourceSource: "file_upload", effectiveDate: effectiveDate, foundInMsd: true }));
  const rows = useMemo(
    () => (inventory.as_of ? (inventory.rows || []) : fallbackRows).map(enrich),
    [inventory.as_of, inventory.rows, fallbackRows]
  );
  const shores = useMemo(() => [...new Set(rows.map((row) => row.location).filter(Boolean))].sort(), [rows]);
  const grades = useMemo(() => [...new Set(rows.map((row) => row.grade).filter(Boolean))].sort(), [rows]);
  const clients = useMemo(() => [...new Set(rows.map((row) => row.client).filter(Boolean))].sort(), [rows]);
  const filterDefinitions = [
    {
      key: "source",
      label: "Source",
      value: sourceFilter,
      setValue: setSourceFilter,
      options: [["all", "Choose source"], ["manual", "Manual"], ["file_upload", "File Upload"]],
    },
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      setValue: setStatusFilter,
      options: [["all", "Choose status"], ["matched", "Matched in MSD"], ["id_only", "ID only"]],
    },
    {
      key: "shore",
      label: "Shore",
      value: shoreFilter,
      setValue: setShoreFilter,
      options: [["all", "Choose shore"], ...shores.map((value) => [value, value])],
    },
    {
      key: "grade",
      label: "Grade",
      value: gradeFilter,
      setValue: setGradeFilter,
      options: [["all", "Choose grade"], ...grades.map((value) => [value, value])],
    },
    {
      key: "client",
      label: "Client",
      value: clientFilter,
      setValue: setClientFilter,
      options: [["all", "Choose client"], ...clients.map((value) => [value, value])],
    },
  ];
  const selectedFilterDefinitions = selectedFilterKeys
    .map((key) => filterDefinitions.find((definition) => definition.key === key))
    .filter(Boolean);
  const availableFilterDefinitions = filterDefinitions.filter((definition) => !selectedFilterKeys.includes(definition.key));
  const activeFilters = [
    sourceFilter !== "all" ? { key: "source", label: `Source: ${sourceFilter === "manual" ? "Manual" : "File Upload"}`, clear: () => { setSourceFilter("all"); setSelectedFilterKeys((current) => current.filter((key) => key !== "source")); } } : null,
    statusFilter !== "all" ? { key: "status", label: `Status: ${statusFilter === "matched" ? "Matched in MSD" : "ID only"}`, clear: () => { setStatusFilter("all"); setSelectedFilterKeys((current) => current.filter((key) => key !== "status")); } } : null,
    shoreFilter !== "all" ? { key: "shore", label: `Shore: ${shoreFilter}`, clear: () => { setShoreFilter("all"); setSelectedFilterKeys((current) => current.filter((key) => key !== "shore")); } } : null,
    gradeFilter !== "all" ? { key: "grade", label: `Grade: ${gradeFilter}`, clear: () => { setGradeFilter("all"); setSelectedFilterKeys((current) => current.filter((key) => key !== "grade")); } } : null,
    clientFilter !== "all" ? { key: "client", label: `Client: ${clientFilter}`, clear: () => { setClientFilter("all"); setSelectedFilterKeys((current) => current.filter((key) => key !== "client")); } } : null,
  ].filter(Boolean);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceFilter !== "all" && row.resourceSource !== sourceFilter) return false;
      if (statusFilter === "matched" && row.foundInMsd === false) return false;
      if (statusFilter === "id_only" && row.foundInMsd !== false) return false;
      if (shoreFilter !== "all" && row.location !== shoreFilter) return false;
      if (gradeFilter !== "all" && row.grade !== gradeFilter) return false;
      if (clientFilter !== "all" && row.client !== clientFilter) return false;
      if (!needle) return true;
      return [row.id, row.name, row.grade, row.designation, row.location, row.workLocation, row.lob, row.vertical, row.client, row.skillsText, row.sourceLabel, row.statusLabel]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [rows, query, sourceFilter, statusFilter, shoreFilter, gradeFilter, clientFilter]);

  const sorted = useMemo(() => {
    if (!sortStack.length) return filtered;
    return [...filtered].sort((a, b) => {
      for (const item of sortStack) {
        const comparison = String(a[item.key] ?? "").localeCompare(String(b[item.key] ?? ""), undefined, { numeric: true, sensitivity: "base" });
        if (comparison) return item.dir === "asc" ? comparison : -comparison;
      }
      return 0;
    });
  }, [filtered, sortStack]);

  const visibleColumns = useMemo(() => [
    COLUMNS[0],
    ...columnPrefs.filter((pref) => pref.visible).map((pref) => COLUMNS.find((column) => column.key === pref.key)).filter(Boolean),
    COLUMNS[COLUMNS.length - 1],
  ], [columnPrefs]);
  const groupKeys = sortStack.length > 1 ? sortStack.slice(0, -1).map((item) => item.key) : [];
  const selectedVisible = sorted.length > 0 && sorted.every((row) => selected.has(normalizeId(row.id)));

  const cycleSort = (key) => {
    if (key.startsWith("_")) return;
    setSortStack((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index < 0) return [...current, { key, dir: "asc" }];
      if (current[index].dir === "asc") return current.map((item, i) => i === index ? { ...item, dir: "desc" } : item);
      return current.filter((_, i) => i !== index);
    });
  };

  const addIds = async () => {
    const ids = splitIds(manualIds);
    if (!effectiveDate) return setError("Choose an effective date.");
    if (!ids.length) return setError("Enter at least one employee ID.");
    if (inventory.as_of && effectiveDate < inventory.as_of) {
      return setError(`Update date cannot be earlier than the latest snapshot (${inventory.as_of}).`);
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await addManualBenchIds(ids, effectiveDate);
      setMessage(result.message);
      setManualIds("");
      setAddOpen(false);
      await loadLatest();
      if (onBenchChanged) await onBenchChanged();
    } catch (err) {
      setError(err.message || "Could not save employee IDs.");
    } finally { setSaving(false); }
  };

  const remove = async (ids) => {
    const latestDate = inventory.as_of;
    if (!ids.length || !latestDate) return;
    if (!window.confirm(`Delete ${ids.length} resource${ids.length === 1 ? "" : "s"} from the latest snapshot (${latestDate})?`)) return;
    setDeleting(true); setError(""); setMessage("");
    try {
      const result = await deleteBenchIds(ids, latestDate);
      setMessage(result.message);
      await loadLatest();
      if (onBenchChanged) await onBenchChanged();
    } catch (err) {
      setError(err.message || "Could not delete resources.");
    } finally { setDeleting(false); }
  };

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    const key = normalizeId(id);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setSelected((current) => {
    const next = new Set(current);
    sorted.forEach((row) => selectedVisible ? next.delete(normalizeId(row.id)) : next.add(normalizeId(row.id)));
    return next;
  });
  const clearFilters = () => {
    setSourceFilter("all"); setStatusFilter("all"); setShoreFilter("all"); setGradeFilter("all"); setClientFilter("all");
    setSelectedFilterKeys([]);
  };
  const removeFilter = (key) => {
    const definition = filterDefinitions.find((item) => item.key === key);
    if (definition) definition.setValue("all");
    setSelectedFilterKeys((current) => current.filter((item) => item !== key));
  };
  const exportExcel = () => {
    const exportColumns = visibleColumns.filter((column) => !column.key.startsWith("_"));
    downloadExcel(sorted.map((row) => exportColumns.reduce((result, column) => {
      result[column.label] = row[column.key] ?? "";
      return result;
    }, {})), `Bench_Resources_${effectiveDate || "snapshot"}.xlsx`, "Bench Resources");
  };

  const cell = (row, column) => {
    if (column.key === "_select") return <input type="checkbox" checked={selected.has(normalizeId(row.id))} onChange={() => toggle(row.id)} />;
    if (column.key === "_actions") return <button type="button" disabled={deleting} onClick={() => remove([row.id])} style={{ border: "none", background: "transparent", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>;
    if (column.key === "statusLabel") return <span style={{ borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: row.foundInMsd === false ? "#92400E" : C.teal700, background: row.foundInMsd === false ? "#FFFBEB" : C.teal50 }}>{row.statusLabel}</span>;
    return row[column.key] || "-";
  };

  return (
    <div>
      <div ref={manualEntryRef}>
      <Card style={{
        marginBottom: 12,
        overflow: "visible",
        borderColor: manualEntryHighlight ? C.teal400 : C.slate200,
        boxShadow: manualEntryHighlight ? "0 0 0 3px rgba(45, 212, 191, 0.24)" : "none",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <SectionTitle>Bench Resources</SectionTitle>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 5, fontSize: 12, color: C.slate500 }}>
              <strong style={{ color: C.slate700 }}>{displayDate(inventory.as_of)}</strong>
              <span>latest snapshot</span>
              <span aria-hidden="true">·</span>
              <strong style={{ color: C.slate700 }}>{rows.length}</strong>
              <span>active resources</span>
              <span aria-hidden="true">·</span>
              <span>Updated {formatDateTime(inventory.last_updated_at)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen((current) => !current)}
            style={{ ...controlStyle(), borderColor: C.teal600, background: addOpen ? C.teal50 : C.white, color: C.teal700, fontWeight: 800, cursor: "pointer" }}
          >
            {addOpen ? "Close add form" : "+ Add resources"}
          </button>
        </div>

        {addOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "190px minmax(260px, 1fr) auto", alignItems: "end", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.slate200}` }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.slate600 }}>
              Effective date
              <SnapshotDatePicker
                value={effectiveDate}
                latestDate={inventory.as_of}
                dates={inventory.available_dates}
                onChange={setEffectiveDate}
              />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.slate600 }}>
              Employee IDs
              <textarea
                ref={manualIdsRef}
                value={manualIds}
                onChange={(event) => setManualIds(event.target.value)}
                placeholder="Comma-separate IDs, for example: 802853, 610087"
                rows={2}
                style={{ width: "100%", minHeight: 54, marginTop: 5, borderRadius: 8, border: `1px solid ${C.slate300}`, padding: "9px 11px", fontFamily: "inherit", resize: "vertical" }}
              />
            </label>
            <button
              type="button"
              onClick={addIds}
              disabled={saving || !effectiveDate}
              style={{ height: 54, border: "none", borderRadius: 7, padding: "9px 18px", background: saving || !effectiveDate ? C.slate200 : C.teal600, color: saving || !effectiveDate ? C.slate400 : C.white, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {saving ? "Saving..." : `Add to ${displayDate(effectiveDate)}`}
            </button>
          </div>
        )}
      </Card>
      </div>

      {error && <div style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontWeight: 700, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B" }}>{error}</div>}

      <Card style={{ marginBottom: 12, overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 360px" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ID, name, designation, location, skill..."
              style={{ ...controlStyle(), width: "100%", paddingRight: query ? 34 : 9 }}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} style={{ position: "absolute", right: 7, top: 7, width: 22, height: 22, border: "none", background: "transparent", color: C.slate500, cursor: "pointer", fontSize: 16 }}>
                ×
              </button>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              style={{ ...controlStyle(), borderColor: activeFilters.length ? C.teal600 : C.slate300, background: filtersOpen || activeFilters.length ? C.teal50 : C.white, color: activeFilters.length ? C.teal700 : C.slate700, fontWeight: 800, cursor: "pointer" }}
            >
              Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
            </button>
            {filtersOpen && (
              <div style={{ position: "absolute", zIndex: 40, right: 0, top: 41, width: 410, padding: 12, background: C.white, border: `1px solid ${C.slate200}`, borderRadius: 9, boxShadow: "0 10px 28px rgba(15,23,42,0.16)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                  <strong style={{ fontSize: 11, color: C.slate700 }}>Filter criteria</strong>
                  <button type="button" onClick={clearFilters} disabled={!selectedFilterKeys.length} style={{ border: "none", background: "transparent", color: selectedFilterKeys.length ? C.teal700 : C.slate400, cursor: selectedFilterKeys.length ? "pointer" : "default", fontSize: 10, fontWeight: 700 }}>Clear all</button>
                </div>
                {selectedFilterDefinitions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 9 }}>
                    {selectedFilterDefinitions.map((definition) => (
                      <div key={definition.key} style={{ display: "grid", gridTemplateColumns: "90px minmax(180px, 1fr) 28px", gap: 7, alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.slate600 }}>{definition.label}</span>
                        <select value={definition.value} onChange={(event) => definition.setValue(event.target.value)} style={{ ...controlStyle(), width: "100%" }}>
                          {definition.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button type="button" aria-label={`Remove ${definition.label} filter`} onClick={() => removeFilter(definition.key)} style={{ width: 28, height: 28, border: `1px solid ${C.slate200}`, borderRadius: 6, background: C.white, color: C.slate500, cursor: "pointer", fontSize: 15 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {availableFilterDefinitions.length > 0 ? (
                  <select
                    value=""
                    onChange={(event) => {
                      const key = event.target.value;
                      if (key) setSelectedFilterKeys((current) => [...current, key]);
                    }}
                    style={{ ...controlStyle(), width: "100%", borderStyle: "dashed", borderColor: C.teal600, color: C.teal700, fontWeight: 700, cursor: "pointer" }}
                  >
                    <option value="">+ Add filter</option>
                    {availableFilterDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
                  </select>
                ) : (
                  <div style={{ padding: "8px 10px", borderRadius: 7, background: C.slate50, color: C.slate500, fontSize: 10 }}>All available filters have been added.</div>
                )}
                {!selectedFilterDefinitions.length && (
                  <div style={{ marginTop: 8, color: C.slate400, fontSize: 10 }}>
                    Select a filter above, then choose the value you want to apply.
                  </div>
                )}
                <button type="button" onClick={() => setFiltersOpen(false)} style={{ width: "100%", marginTop: 10, border: "none", borderRadius: 7, padding: "8px 10px", background: C.teal600, color: C.white, fontWeight: 800, cursor: "pointer" }}>Done</button>
              </div>
            )}
          </div>
          <ColumnPicker prefs={columnPrefs} onChange={setColumnPrefs} />
          <button type="button" onClick={exportExcel} disabled={!sorted.length} style={{ ...controlStyle(), borderColor: C.teal600, color: C.teal700, fontWeight: 700, cursor: sorted.length ? "pointer" : "default" }}>Download Excel ({sorted.length})</button>
        </div>
        {activeFilters.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.slate100}` }}>
            {activeFilters.map((filter) => (
              <button key={filter.key} type="button" onClick={filter.clear} title={`Remove ${filter.label}`} style={{ border: `1px solid ${C.teal200 || C.teal300}`, borderRadius: 999, background: C.teal50, color: C.teal700, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                {filter.label} ×
              </button>
            ))}
            <button type="button" onClick={clearFilters} style={{ border: "none", background: "transparent", color: C.slate500, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Clear filters</button>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 2px 8px" }}>
        <span style={{ fontSize: 12, color: C.slate600 }}>{loading ? "Loading resources..." : `Showing ${sorted.length} of ${rows.length} resources`}</span>
        {sortStack.map((item, index) => <span key={item.key} style={{ borderRadius: 999, padding: "3px 8px", background: index === sortStack.length - 1 ? C.teal50 : C.slate100, color: index === sortStack.length - 1 ? C.teal700 : C.slate600, fontSize: 10, fontWeight: 700 }}>{index === sortStack.length - 1 ? "Sort" : `Group ${index + 1}`}: {COLUMNS.find((column) => column.key === item.key)?.label} {item.dir === "asc" ? "↑" : "↓"}</span>)}
        {selected.size > 0 && <button type="button" disabled={deleting} onClick={() => remove([...selected])} style={{ marginLeft: "auto", borderRadius: 7, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", padding: "6px 10px", fontSize: 11, fontWeight: 800 }}>{deleting ? "Deleting..." : `Delete selected (${selected.size})`}</button>}
      </div>

      {message && (
        <div role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 80, maxWidth: 380, borderRadius: 9, padding: "11px 14px", border: `1px solid ${C.teal300}`, background: C.white, color: C.teal700, boxShadow: "0 12px 30px rgba(15,23,42,0.18)", fontSize: 12, fontWeight: 700 }}>
          {message}
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: 480 }}>
          <table style={{ width: "100%", minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0), tableLayout: "fixed", borderCollapse: "collapse", fontSize: 12 }}>
            <colgroup>{visibleColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
            <thead><tr>{visibleColumns.map((column) => {
              const sortIndex = sortStack.findIndex((item) => item.key === column.key);
              const sort = sortIndex >= 0 ? sortStack[sortIndex] : null;
              const active = sortIndex === sortStack.length - 1 && sortIndex >= 0;
              return <th key={column.key} onClick={() => cycleSort(column.key)} style={{ padding: "10px 11px", textAlign: "left", position: "sticky", top: 0, zIndex: 2, color: C.white, background: active ? C.teal600 : sort ? C.teal800 : C.slate700, cursor: column.fixed ? "default" : "pointer" }}>{column.key === "_select" ? <input type="checkbox" checked={selectedVisible} onChange={toggleAll} onClick={(event) => event.stopPropagation()} /> : column.label}{sort && <span style={{ marginLeft: 5 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}</th>;
            })}</tr></thead>
            <tbody>{!loading && !sorted.length ? <tr><td colSpan={visibleColumns.length} style={{ padding: 34, textAlign: "center", color: C.slate400 }}>No bench resources match the selected date and filters.</td></tr> : sorted.map((row, index) => {
              const groupBreak = index > 0 && groupKeys.some((key) => String(sorted[index - 1][key] ?? "") !== String(row[key] ?? ""));
              return <tr key={`${row.recordId || row.id}-${index}`} style={{ background: index % 2 ? C.slate50 : C.white, borderTop: groupBreak ? `2px solid ${C.teal300}` : undefined }}>{visibleColumns.map((column) => <td key={column.key} title={String(row[column.key] || "")} style={{ padding: "9px 11px", borderBottom: `1px solid ${C.slate100}`, color: C.slate700, wordBreak: "break-word", verticalAlign: "top" }}>{cell(row, column)}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
