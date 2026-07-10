// src/components/UploadModal.jsx
// ──────────────────────────────────────────────────────────────
// REPLACES the existing UploadModal.jsx.
//
// New in this version:
//   1. Each slot fetches loaded periods from /api/data-status and
//      shows them as clickable "Already loaded" chips. Clicking a
//      chip both fills the picker AND auto-checks "Replace existing".
//   2. When the picker value matches an existing period, the slot
//      turns amber and a "Replace existing data" checkbox appears.
//      Without it ticked, the upload would 409 — so we surface this
//      visually before the user clicks Apply.
//   3. After picking a TA file, we parse it in the browser, extract
//      LOBs from rows whose Status is Open or Offered, and show
//      them as checkboxes. Only selected LOBs are uploaded.
// ──────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { C } from "../theme";
import { uploadFile, fetchDataStatus } from "../api";
import { prepareBenchEmployeeIdFile, prepareMSDAllocationFile } from "../utils/excel";


// ── helpers ───────────────────────────────────────────────
function thisISOWeek() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

async function extractLOBsFromTAFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find(n => /req/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  const counts = new Map();
  for (const r of rows) {
    const status = String(r.Status || "").trim();
    if (status !== "Open" && status !== "Offered") continue;
    const lob = String(r.LOB || "").trim();
    if (!lob) continue;
    counts.set(lob, (counts.get(lob) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])              // most-frequent first
    .map(([name, count]) => ({ name, count }));
}


// ── shared period-chip strip ──────────────────────────────
function PeriodChips({ periods, currentValue, onClick }) {
  if (!periods || periods.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: C.slate500, alignSelf: "center", marginRight: 4 }}>
        Already loaded:
      </span>
      {periods.map(p => {
        const active = p === currentValue;
        return (
          <button
            key={p}
            onClick={(e) => { e.preventDefault(); onClick(p); }}
            style={{
              padding: "3px 8px", borderRadius: 11, fontSize: 10,
              fontFamily: "inherit", cursor: "pointer",
              background: active ? "#FEF3C7" : C.white,
              border: `1px solid ${active ? "#F59E0B" : C.slate300}`,
              color: active ? "#92400E" : C.slate600,
              fontWeight: active ? 600 : 400,
            }}
            title={active ? "Currently selected — will be replaced on Apply" : "Click to select this period"}
          >
            {p}{active ? " ✓" : ""}
          </button>
        );
      })}
    </div>
  );
}


// ── single upload slot ────────────────────────────────────
function UploadSlot({
  icon, title, description,
  file, onFile,
  periodLabel, periodType, periodValue, onPeriodChange,
  loadedPeriods, replace, onReplaceChange,
  lastUpdatedAt,
  errorMsg,
  fileStatus,
  children,
}) {
  const ref = useRef();
  const [dr, setDr] = useState(false);
  const hasPeriod = !!periodLabel;
  const isDuplicate = hasPeriod && loadedPeriods?.includes(periodValue);

  const borderColor =
    errorMsg ? C.red :
    isDuplicate ? "#F59E0B" :
    file ? C.teal400 :
    dr ? C.teal500 : C.slate300;

  const bgColor =
    errorMsg ? "#FEF2F2" :
    isDuplicate ? "#FFFBEB" :
    file ? C.teal50 : C.slate50;

  return (
    <div style={{
      border: `1.5px dashed ${borderColor}`,
      borderRadius: 10, padding: "16px", background: bgColor,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.slate800, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11, color: C.slate500, lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>

      {hasPeriod && (
        <PeriodChips periods={loadedPeriods} currentValue={periodValue}
          onClick={(p) => { onPeriodChange(p); onReplaceChange(true); }} />
      )}
      {lastUpdatedAt && (
        <div style={{ fontSize: 10, color: C.slate500, margin: "-3px 0 8px 2px" }}>
          File status updated: {new Date(lastUpdatedAt).toLocaleString()}
        </div>
      )}

      {hasPeriod && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.slate600, minWidth: 100 }}>
            {periodLabel}
          </label>
          <input
            type={periodType}
            value={periodValue}
            onChange={(e) => onPeriodChange(e.target.value)}
            style={{
              flex: 1, padding: "6px 10px", fontSize: 12,
              border: `1px solid ${isDuplicate ? "#F59E0B" : C.slate300}`,
              borderRadius: 6, fontFamily: "inherit",
              background: isDuplicate ? "#FFFBEB" : C.white,
            }}
          />
        </div>
      )}

      {isDuplicate && (
        <div style={{
          background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 6,
          padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "#92400E",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            ⚠ This period is already in the database
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={replace}
              onChange={(e) => onReplaceChange(e.target.checked)} />
            <span>Delete existing rows for this period and replace with this upload</span>
          </label>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDr(true); }}
        onDragLeave={() => setDr(false)}
        onDrop={(e) => { e.preventDefault(); setDr(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => ref.current?.click()}
        style={{
          padding: "10px 12px", borderRadius: 6, cursor: "pointer",
          background: C.white, border: `1px dashed ${C.slate300}`, fontSize: 11,
        }}
      >
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); }} />
        {!file && <span style={{ color: C.teal600, fontWeight: 500 }}>Click or drag file here</span>}
        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
            <span style={{ fontWeight: 500, color: C.slate800 }}>{file.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onFile(null); }}
              style={{ marginLeft: "auto", background: "none", border: "none",
                color: C.slate400, cursor: "pointer", fontSize: 14 }}>&times;</button>
          </div>
        )}
      </div>

      {children}

      {fileStatus && (
        <div style={{
          marginTop: 8,
          padding: "8px 10px",
          background: fileStatus.kind === "success" ? "#ECFDF5" : fileStatus.kind === "loading" ? C.slate50 : "#FEE2E2",
          border: `1px solid ${fileStatus.kind === "success" ? "#10B981" : fileStatus.kind === "loading" ? C.slate300 : C.red}`,
          borderRadius: 6,
          color: fileStatus.kind === "success" ? "#065F46" : fileStatus.kind === "loading" ? C.slate600 : "#991B1B",
          fontSize: 11,
          fontWeight: 500,
        }}>
          {fileStatus.text}
        </div>
      )}

      {errorMsg && (
        <div style={{
          marginTop: 8, padding: "8px 10px", background: "#FEE2E2",
          border: `1px solid ${C.red}`, borderRadius: 6, color: "#991B1B",
          fontSize: 11, fontWeight: 500,
        }}>⚠ {errorMsg}</div>
      )}
    </div>
  );
}


// ── LOB picker (TA only) ──────────────────────────────────
function LOBPicker({ lobs, selected, onChange, loading }) {
  if (loading) {
    return <div style={{ marginTop: 10, padding: 10, fontSize: 11, color: C.slate500,
      fontStyle: "italic" }}>Reading file to extract LOBs…</div>;
  }
  if (!lobs || lobs.length === 0) return null;
  const allOn = selected.size === lobs.length;
  const noneOn = selected.size === 0;

  return (
    <div style={{
      marginTop: 10, padding: 10,
      background: C.white, border: `1px solid ${C.slate300}`, borderRadius: 6,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.slate700,
        display: "flex", alignItems: "center", marginBottom: 8,
      }}>
        <span>Choose LOBs to upload (Open/Offered only)</span>
        <button
          onClick={(e) => {
            e.preventDefault();
            onChange(allOn ? new Set() : new Set(lobs.map(l => l.name)));
          }}
          style={{
            marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
            background: C.teal50, border: `1px solid ${C.teal400}`, color: C.teal700,
            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
          }}
        >{allOn ? "Deselect all" : "Select all"}</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {lobs.map(({ name, count }) => {
          const on = selected.has(name);
          return (
            <label key={name}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 8px", borderRadius: 14, fontSize: 11,
                cursor: "pointer", userSelect: "none",
                background: on ? C.teal50 : C.slate50,
                border: `1px solid ${on ? C.teal400 : C.slate300}`,
                color: on ? C.teal800 : C.slate600,
                fontWeight: on ? 600 : 400,
              }}>
              <input type="checkbox" checked={on}
                onChange={() => {
                  const next = new Set(selected);
                  if (on) next.delete(name); else next.add(name);
                  onChange(next);
                }}
                style={{ width: 12, height: 12, cursor: "pointer" }} />
              {name} <span style={{ opacity: 0.7, fontSize: 10 }}>({count})</span>
            </label>
          );
        })}
      </div>
      {noneOn && (
        <div style={{ marginTop: 6, fontSize: 10, color: C.red, fontWeight: 500 }}>
          Pick at least one LOB to upload.
        </div>
      )}
    </div>
  );
}


// ── modal ─────────────────────────────────────────────────
export default function UploadModal({ onClose, onUploaded, onManualBenchEntry }) {
  // files
  const [taFile, setTaFile] = useState(null);
  const [msdFile, setMsdFile] = useState(null);
  const [benchFile, setBenchFile] = useState(null);

  // periods
  const today = new Date().toISOString().slice(0, 10);
  const [taDate, setTaDate] = useState(today);
  const [msdMonth, setMsdMonth] = useState(today.slice(0, 7));
  const [benchWeek, setBenchWeek] = useState(thisISOWeek());

  // replace flags
  const [taReplace, setTaReplace] = useState(false);
  const [msdReplace, setMsdReplace] = useState(false);
  const [benchReplace, setBenchReplace] = useState(false);

  // server-known loaded periods
  const [loadedStatus, setLoadedStatus] = useState({
    requisitions: { periods: [], lastUpdatedAt: null },
    msd_allocations: { periods: [], lastUpdatedAt: null },
    bench_employee_ids: { periods: [], lastUpdatedAt: null },
  });
  useEffect(() => {
    fetchDataStatus()
      .then(s => setLoadedStatus({
        requisitions: { periods: s.requisitions?.all_periods || [], lastUpdatedAt: s.requisitions?.last_updated_at || null },
        msd_allocations: { periods: s.msd_allocations?.all_periods || [], lastUpdatedAt: s.msd_allocations?.last_updated_at || null },
        bench_employee_ids: { periods: s.bench_employee_ids?.all_periods || [], lastUpdatedAt: s.bench_employee_ids?.last_updated_at || null },
      }))
      .catch(() => {/* server not reachable — show empty chips */});
  }, []);

  // LOB picker state
  const [taLobs, setTaLobs] = useState([]);
  const [taLobSelected, setTaLobSelected] = useState(new Set());
  const [taLobsLoading, setTaLobsLoading] = useState(false);

  useEffect(() => {
    if (!taFile) { setTaLobs([]); setTaLobSelected(new Set()); return; }
    setTaLobsLoading(true);
    extractLOBsFromTAFile(taFile)
      .then(lobs => {
        setTaLobs(lobs);
        setTaLobSelected(new Set(lobs.map(l => l.name)));   // all selected by default
      })
      .catch(err => { console.warn("LOB extraction failed:", err); setTaLobs([]); })
      .finally(() => setTaLobsLoading(false));
  }, [taFile]);

  // MSD allocation safety check. The sample report contains a pivot sheet before
  // the real allocation sheet, so we detect and normalize the allocation table.
  const [msdCheck, setMsdCheck] = useState(null);
  const [msdCheckLoading, setMsdCheckLoading] = useState(false);
  const [msdUploadFile, setMsdUploadFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!msdFile) {
      setMsdCheck(null);
      setMsdUploadFile(null);
      setMsdCheckLoading(false);
      return;
    }

    setMsdCheck(null);
    setMsdUploadFile(null);
    setMsdCheckLoading(true);
    prepareMSDAllocationFile(msdFile)
      .then((result) => {
        if (cancelled) return;
        setMsdCheck(result);
        setMsdUploadFile(result.accepted ? result.uploadFile : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setMsdCheck({
          accepted: false,
          message: `Not accepted. Could not read this workbook: ${err.message || err}`,
        });
        setMsdUploadFile(null);
      })
      .finally(() => {
        if (!cancelled) setMsdCheckLoading(false);
      });

    return () => { cancelled = true; };
  }, [msdFile]);

  const [benchCheck, setBenchCheck] = useState(null);
  const [benchCheckLoading, setBenchCheckLoading] = useState(false);
  const [benchUploadFile, setBenchUploadFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!benchFile) {
      setBenchCheck(null);
      setBenchUploadFile(null);
      setBenchCheckLoading(false);
      return;
    }

    setBenchCheck(null);
    setBenchUploadFile(null);
    setBenchCheckLoading(true);
    prepareBenchEmployeeIdFile(benchFile)
      .then((result) => {
        if (cancelled) return;
        setBenchCheck(result);
        setBenchUploadFile(result.accepted ? result.uploadFile : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setBenchCheck({
          accepted: false,
          message: `Not accepted. Could not read this workbook: ${err.message || err}`,
        });
        setBenchUploadFile(null);
      })
      .finally(() => {
        if (!cancelled) setBenchCheckLoading(false);
      });

    return () => { cancelled = true; };
  }, [benchFile]);

  // per-slot errors
  const [taErr, setTaErr] = useState(null);
  const [msdErr, setMsdErr] = useState(null);
  const [benchErr, setBenchErr] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const hasFile = taFile || msdFile || benchFile;
  const taLobsValid = !taFile || (taLobs.length === 0) || taLobSelected.size > 0;
  const msdValid = !msdFile || (!!msdCheck?.accepted && !!msdUploadFile);
  const benchValid = !benchFile || (!!benchCheck?.accepted && !!benchUploadFile);
  const canSubmit = hasFile && !submitting && taLobsValid && !msdCheckLoading && !benchCheckLoading && msdValid && benchValid;

  const handleSubmit = async () => {
    setSubmitting(true);
    setTaErr(null); setMsdErr(null); setBenchErr(null);
    let anyError = false;

    try {
      if (taFile) {
        try {
          await uploadFile("ta", taFile, {
            file_date: taDate,
            replace: taReplace ? "true" : "false",
            lobs: Array.from(taLobSelected).join(","),
          });
        } catch (e) { setTaErr(e.message); anyError = true; }
      }
      if (benchFile) {
        try {
          await uploadFile("bench", benchUploadFile || benchFile, {
            file_week: benchWeek,
            replace: benchReplace ? "true" : "false",
          });
        } catch (e) { setBenchErr(e.message); anyError = true; }
      }
      if (msdFile) {
        try {
          await uploadFile("msd", msdUploadFile || msdFile, {
            file_month: msdMonth,
            replace: msdReplace ? "true" : "false",
          });
        } catch (e) { setMsdErr(e.message); anyError = true; }
      }
    } finally { setSubmitting(false); }

    if (!anyError) { onUploaded?.(); onClose(); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.white, borderRadius: 14, width: 680,
        maxHeight: "92vh", overflow: "auto", padding: 28,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.slate800 }}>Upload Weekly Data</div>
            <div style={{ fontSize: 12, color: C.slate400, marginTop: 2 }}>
              Already-loaded periods are shown as chips. Click one to replace it.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 22, color: C.slate400, cursor: "pointer",
          }}>&times;</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "20px 0" }}>
          <UploadSlot
            icon="📊" title="Talent Acquisition Data"
            description="Filtered to Status = Open / Offered. Pick which LOBs to upload below."
            file={taFile} onFile={(f) => { setTaFile(f); setTaErr(null); }}
            periodLabel="File date" periodType="date"
            periodValue={taDate} onPeriodChange={setTaDate}
             loadedPeriods={loadedStatus.requisitions.periods}
             lastUpdatedAt={loadedStatus.requisitions.lastUpdatedAt}
            replace={taReplace} onReplaceChange={setTaReplace}
            errorMsg={taErr}
          >
            <LOBPicker
              lobs={taLobs} selected={taLobSelected}
              onChange={setTaLobSelected} loading={taLobsLoading}
            />
          </UploadSlot>

          <UploadSlot
            icon="📋" title="MSD Allocation List"
            description="Allocations per month — Skillsets, Grade, Bench Ageing, Onshore/Offshore"
            file={msdFile} onFile={(f) => { setMsdFile(f); setMsdErr(null); }}
            periodLabel="Allocation month" periodType="month"
            periodValue={msdMonth} onPeriodChange={setMsdMonth}
             loadedPeriods={loadedStatus.msd_allocations.periods}
             lastUpdatedAt={loadedStatus.msd_allocations.lastUpdatedAt}
            replace={msdReplace} onReplaceChange={setMsdReplace}
            errorMsg={msdErr}
            fileStatus={
              msdFile
                ? msdCheckLoading
                  ? { kind: "loading", text: "Checking allocation workbook..." }
                  : msdCheck?.accepted
                    ? { kind: "success", text: msdCheck.message }
                    : { kind: "error", text: msdCheck?.message || "Not accepted. Select a valid MSD allocation workbook." }
                : null
            }
          />

          <UploadSlot
            icon="👥" title="Employee IDs for Matching"
            description="Employee IDs to include for skill matching, regardless of current MSD project"
            file={benchFile} onFile={(f) => { setBenchFile(f); setBenchErr(null); }}
            periodLabel="Bench week" periodType="week"
            periodValue={benchWeek} onPeriodChange={setBenchWeek}
             loadedPeriods={loadedStatus.bench_employee_ids.periods}
             lastUpdatedAt={loadedStatus.bench_employee_ids.lastUpdatedAt}
            replace={benchReplace} onReplaceChange={setBenchReplace}
            errorMsg={benchErr}
            fileStatus={
              benchFile
                ? benchCheckLoading
                  ? { kind: "loading", text: "Checking bench ID workbook..." }
                  : benchCheck?.accepted
                    ? { kind: "success", text: benchCheck.message }
                    : { kind: "error", text: benchCheck?.message || "Not accepted. Select a valid Employee ID list." }
                : null
            }
          >
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onManualBenchEntry}
                style={{
                  border: `1px solid ${C.teal400}`,
                  background: C.teal50,
                  color: C.teal700,
                  borderRadius: 7,
                  padding: "7px 11px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Enter employee IDs manually
              </button>
            </div>
          </UploadSlot>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1, padding: "12px 0", borderRadius: 8,
            border: `1px solid ${C.slate300}`, background: C.white, color: C.slate600,
            fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit} style={{
            flex: 2, padding: "12px 0", borderRadius: 8, border: "none",
            background: canSubmit ? C.teal600 : C.slate200,
            color: canSubmit ? C.white : C.slate400,
            fontSize: 13, fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{submitting ? "Uploading…" : "Apply Data"}</button>
        </div>
      </div>
    </div>
  );
}
