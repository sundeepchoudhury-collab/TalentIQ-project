import { useEffect, useMemo, useState } from "react";
import { C } from "../theme";
import { Card, SectionTitle } from "../components/ui";
import { addManualBenchIds, fetchAllMSDResources, fetchBenchInventory } from "../api";
import { formatBenchDuration } from "../dataProcessor";
import { downloadExcel } from "../utils/excel";

const LOCAL_MANUAL_IDS_KEY = "talentiq_manual_bench_employee_ids";

function normalizeEmployeeId(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function skillText(resource) {
  const skills = Array.isArray(resource.skills) ? resource.skills : [];
  if (skills.length) return skills.slice(0, 5).join(", ") + (skills.length > 5 ? ` +${skills.length - 5}` : "");
  return "-";
}

function benchTenureText(resource) {
  return resource.benchDays == null || resource.benchDays === "" ? "-" : formatBenchDuration(resource.benchDays);
}

function splitEmployeeIds(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function readLocalManualIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_MANUAL_IDS_KEY) || "[]");
    return Array.isArray(raw) ? raw.map((id) => String(id || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveLocalManualIds(ids) {
  const byKey = new Map(readLocalManualIds().map((id) => [normalizeEmployeeId(id), id]));
  ids.forEach((id) => {
    const clean = String(id || "").trim();
    if (clean) byKey.set(normalizeEmployeeId(clean), clean);
  });
  localStorage.setItem(LOCAL_MANUAL_IDS_KEY, JSON.stringify([...byKey.values()]));
}

function msdRowToBenchResource(row, requestedId) {
  const skills = String(row.skillsets || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  return {
    id: row.employee_id || requestedId,
    name: row.name || "",
    grade: row.grade || "",
    designation: row.designation || "",
    location: row.onshore_offshore || "",
    workLocation: row.office_location || "",
    division: "",
    lob: row.lob || "",
    vertical: row.project_vertical || "",
    skills,
    benchDays: row.bench_ageing_days ?? null,
    benchProject: "",
    currentProject: row.project_name || "",
    available: "Manual Employee ID",
    resourceSource: "manual_employee_id",
    foundInMsd: true,
  };
}

async function lookupManualIdsFromMsd(ids) {
  const data = await fetchAllMSDResources();
  const msdRows = Array.isArray(data?.rows) ? data.rows : [];
  const byId = new Map();
  msdRows.forEach((row) => {
    const key = normalizeEmployeeId(row.employee_id);
    if (key && !byId.has(key)) byId.set(key, row);
  });
  return ids.map((id) => {
    const row = byId.get(normalizeEmployeeId(id));
    if (row) return msdRowToBenchResource(row, id);
    return {
      id,
      name: "",
      grade: "",
      designation: "",
      location: "",
      workLocation: "",
      skills: [],
      benchDays: null,
      available: "Manual ID not found in MSD",
      resourceSource: "manual_employee_id",
      foundInMsd: false,
    };
  });
}

function exportRows(rows, manualKeys = new Set()) {
  return rows.map((resource) => ({
    "Employee ID": resource.id || "",
    Name: resource.name || "",
    Grade: resource.grade || "",
    Designation: resource.designation || "",
    Shore: resource.location || "",
    "Work Location": resource.workLocation || "",
    "Bench Tenure": benchTenureText(resource),
    "Key Skills": skillText(resource),
    Source: manualKeys.has(normalizeEmployeeId(resource.id)) ? "Manual" : "File Upload",
    Status: resource.foundInMsd === false ? "ID saved, MSD details not found" : "Matched in MSD",
  }));
}

export default function BenchResourcesTab({ bench = [], onBenchChanged }) {
  const [inventory, setInventory] = useState({ rows: [], week: null, as_of: null });
  const [localManualIds, setLocalManualIds] = useState(() => readLocalManualIds());
  const [localRows, setLocalRows] = useState([]);
  const [manualResultRows, setManualResultRows] = useState([]);
  const [viewMode, setViewMode] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualIds, setManualIds] = useState("");
  const [query, setQuery] = useState("");

  const loadInventory = async () => {
    setLoading(true);
    setError("");
    try {
      setInventory(await fetchBenchInventory());
    } catch (err) {
      if (!String(err.message || "").toLowerCase().includes("not found")) {
        setError(err.message || "Could not load bench resources.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [bench.length]);

  useEffect(() => {
    if (!localManualIds.length) {
      setLocalRows([]);
      return;
    }
    lookupManualIdsFromMsd(localManualIds)
      .then(setLocalRows)
      .catch(() => setLocalRows(localManualIds.map((id) => ({
        id,
        name: "",
        grade: "",
        designation: "",
        location: "",
        workLocation: "",
        skills: [],
        benchDays: null,
        foundInMsd: false,
      }))));
  }, [localManualIds]);

  const savedRows = inventory.rows?.length ? inventory.rows : bench.map((resource) => ({ ...resource, foundInMsd: true }));
  const rows = useMemo(() => {
    const byId = new Map();
    [...savedRows, ...localRows].forEach((resource) => {
      const key = normalizeEmployeeId(resource.id);
      if (key) byId.set(key, resource);
    });
    return [...byId.values()];
  }, [savedRows, localRows]);
  const typedRows = splitEmployeeIds(manualIds).map((id) => ({
    id,
    name: "",
    grade: "",
    designation: "",
    location: "",
    workLocation: "",
    skills: [],
    benchDays: null,
    foundInMsd: false,
  }));
  const manualKeys = new Set(localManualIds.map(normalizeEmployeeId));
  manualResultRows.forEach((resource) => manualKeys.add(normalizeEmployeeId(resource.id)));
  const manualRows = rows.filter((resource) => manualKeys.has(normalizeEmployeeId(resource.id)));
  const fileUploadRows = rows.filter((resource) => !manualKeys.has(normalizeEmployeeId(resource.id)));
  const selectedRows = viewMode === "manual"
    ? manualRows
    : viewMode === "file"
      ? fileUploadRows
      : viewMode === "current" && manualResultRows.length
        ? manualResultRows
        : rows;
  const tableRows = selectedRows;
  const exportSourceRows = typedRows.length ? typedRows : tableRows;
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tableRows;
    return tableRows.filter((resource) =>
      String(resource.id || "").toLowerCase().includes(q) ||
      String(resource.name || "").toLowerCase().includes(q) ||
      String(resource.designation || "").toLowerCase().includes(q) ||
      skillText(resource).toLowerCase().includes(q)
    );
  }, [tableRows, query]);

  const addIds = async () => {
    const ids = splitEmployeeIds(manualIds);
    if (!ids.length) {
      setError("Enter at least one employee ID.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let result;
      try {
        result = await addManualBenchIds(ids, inventory.week);
      } catch (saveErr) {
        if (!String(saveErr.message || "").toLowerCase().includes("not found")) throw saveErr;
        const fallbackRows = await lookupManualIdsFromMsd(ids);
        result = {
          rows: fallbackRows,
          matched_count: fallbackRows.filter((row) => row.foundInMsd).length,
          message: "Manual IDs checked from MSD and kept in this browser. Restart TalentIQ to enable backend save.",
        };
      }
      const resultRows = result.rows || [];
      setManualResultRows(resultRows);
      setViewMode("current");
      saveLocalManualIds(ids);
      setLocalManualIds(readLocalManualIds());
      setMessage(`${result.message || "Employee ID saved."}${typeof result.matched_count === "number" ? ` - ${result.matched_count} found in MSD` : ""}`);
      setManualIds("");
      setQuery("");
      await loadInventory();
      if (onBenchChanged) await onBenchChanged();
    } catch (err) {
      setError(err.message || "Could not save employee ID.");
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const filePrefix = typedRows.length || viewMode === "manual" || viewMode === "current"
      ? "Manual_Bench_Employee_IDs"
      : viewMode === "file"
        ? "Uploaded_Bench_Employee_IDs"
        : "Bench_Resources";
    const fileName = `${filePrefix}_${stamp}.xlsx`;
    downloadExcel(exportRows(exportSourceRows, manualKeys), fileName, "Bench Resources");
  };

  const completeRows = rows.filter((resource) => resource.foundInMsd !== false).length;
  const pendingRows = rows.length - completeRows;
  const viewLabel = viewMode === "manual"
    ? "Manual IDs"
    : viewMode === "file"
      ? "File upload IDs"
      : viewMode === "current" && manualResultRows.length
        ? "Current manual entry"
        : "All saved IDs";
  const statusText = (resource) => {
    if (resource.foundInMsd === false) return "ID saved";
    return manualKeys.has(normalizeEmployeeId(resource.id)) ? "Manual" : "File Upload";
  };
  const statusColors = (resource) => {
    if (resource.foundInMsd === false) return { color: "#92400E", background: "#FFFBEB" };
    if (manualKeys.has(normalizeEmployeeId(resource.id))) return { color: C.teal700, background: C.teal50 };
    return { color: C.slate600, background: C.slate100 };
  };
  const filterButtonStyle = (active) => ({
    border: `1px solid ${active ? C.teal400 : C.slate200}`,
    background: active ? C.teal50 : C.white,
    color: active ? C.teal700 : C.slate600,
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle>Bench Resources</SectionTitle>
          <div style={{ fontSize: 12, color: C.slate500, marginTop: 4 }}>
            Employee IDs from upload and manual entry, enriched from latest MSD allocation data.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
            <button type="button" onClick={() => setViewMode("all")} style={filterButtonStyle(viewMode === "all")}>
              All saved IDs ({rows.length})
            </button>
            <button type="button" onClick={() => setViewMode("manual")} style={filterButtonStyle(viewMode === "manual")}>
              Manual ({manualRows.length})
            </button>
            <button type="button" onClick={() => setViewMode("file")} style={filterButtonStyle(viewMode === "file")}>
              File Upload ({fileUploadRows.length})
            </button>
            {manualResultRows.length > 0 && (
              <button type="button" onClick={() => setViewMode("current")} style={filterButtonStyle(viewMode === "current")}>
                Current Manual ({manualResultRows.length})
              </button>
            )}
            <span style={{ background: C.slate50, color: C.slate600, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 700 }}>
              {completeRows} matched in MSD
            </span>
            {pendingRows > 0 && (
              <span style={{ background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 700 }}>
                {pendingRows} ID-only
              </span>
            )}
            {inventory.week && (
              <span style={{ background: C.white, color: C.slate500, border: `1px solid ${C.slate200}`, borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 700 }}>
                {inventory.week}
              </span>
            )}
            {manualResultRows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setManualResultRows([]);
                  setViewMode("all");
                }}
                style={{ border: "none", background: "transparent", color: C.teal700, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
              >
                Show all saved IDs
              </button>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>Manual Employee ID</SectionTitle>
          <div style={{ fontSize: 12, color: C.slate500, marginTop: 4, marginBottom: 10 }}>
            Add one or more IDs separated by comma, space, or new line.
          </div>
          <textarea
            value={manualIds}
            onChange={(e) => {
              setManualIds(e.target.value);
              if (manualResultRows.length) {
                setManualResultRows([]);
                setViewMode("manual");
              }
            }}
            placeholder="Example: 802853, 610087"
            rows={3}
            style={{ width: "100%", resize: "vertical", minHeight: 66, borderRadius: 8, border: `1px solid ${C.slate300}`, padding: "9px 11px", color: C.slate800, fontSize: 12, fontFamily: "inherit", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={addIds}
              disabled={saving}
              style={{ flex: 1, border: "none", borderRadius: 7, background: saving ? C.slate200 : C.teal600, color: saving ? C.slate400 : C.white, padding: "9px 12px", fontSize: 12, fontWeight: 800, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}
            >
              {saving ? "Saving..." : "Add to Bench"}
            </button>
            <button
              onClick={download}
              disabled={!exportSourceRows.length}
              style={{ borderRadius: 7, border: `1px solid ${exportSourceRows.length ? C.slate300 : C.slate200}`, background: exportSourceRows.length ? C.white : C.slate100, color: exportSourceRows.length ? C.slate700 : C.slate400, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: exportSourceRows.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}
            >
              Download Excel
            </button>
          </div>
        </Card>
      </div>

      {(error || message) && (
        <div style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${error ? "#FCA5A5" : C.teal100}`, background: error ? "#FEF2F2" : C.teal50, color: error ? "#991B1B" : C.teal700, padding: "10px 12px", fontSize: 12, fontWeight: 700 }}>
          {error || message}
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.slate200}` }}>
          <div>
            <SectionTitle style={{ marginBottom: 3 }}>Bench Resource List</SectionTitle>
            <div style={{ fontSize: 11, color: C.slate500 }}>
              {loading ? "Loading resources..." : `${viewLabel}: showing ${filteredRows.length} of ${tableRows.length}`}
            </div>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID, name, designation, skill..."
            style={{ width: 310, maxWidth: "100%", height: 36, borderRadius: 8, border: `1px solid ${C.slate300}`, padding: "8px 11px", fontSize: 12, color: C.slate800, fontFamily: "inherit", outline: "none", background: C.white }}
          />
        </div>

        <div style={{ overflow: "auto", maxHeight: 430 }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12, fontFamily: "'Outfit',sans-serif" }}>
            <thead>
              <tr style={{ background: C.slate700, color: C.white }}>
                {["Employee ID", "Name", "Grade", "Designation", "Shore", "Bench Tenure", "Key Skills", "Status"].map((label) => (
                  <th key={label} style={{ padding: "11px 12px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: C.slate700, zIndex: 1 }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "34px 12px", textAlign: "center", color: C.slate400 }}>
                    No bench resources found.
                  </td>
                </tr>
              ) : filteredRows.map((resource, index) => (
                <tr key={`${resource.id || "bench"}-${index}`} style={{ background: index % 2 === 0 ? C.white : C.slate50 }}>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, fontWeight: 800, color: C.teal700 }}>{resource.id || "-"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, fontWeight: 700, color: C.slate800 }}>{resource.name || "-"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, color: C.slate700 }}>{resource.grade || "-"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, color: C.slate700 }}>{resource.designation || "-"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, color: C.slate700 }}>{resource.location || "-"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, color: C.slate800, fontWeight: 700 }}>{benchTenureText(resource)}</td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}`, color: C.slate700, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={skillText(resource)}>
                    {skillText(resource)}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.slate100}` }}>
                    <span style={{ display: "inline-flex", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800, ...statusColors(resource) }}>
                      {statusText(resource)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
