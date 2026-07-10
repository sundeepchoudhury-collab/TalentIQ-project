// src/components/UploadModal.jsx
// ──────────────────────────────────────────────────────────────
// REPLACES the original UploadModal.jsx in your frontend.
//
// Key changes from the original:
//   1. Each upload slot now has a DATE / MONTH / WEEK picker
//   2. The "Apply" button POSTs File + period to the backend
//   3. If the backend returns 409 (duplicate period), we show
//      the error inline on the offending slot
// ──────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { C } from "../theme";
import { uploadFile } from "../api";

function UploadSlot({
  icon, title, description,
  file, onFile, status,
  periodLabel, periodType, periodValue, onPeriodChange,
  errorMsg,
}) {
  const ref = useRef();
  const [dr, setDr] = useState(false);
  return (
    <div
      style={{
        border: `1.5px dashed ${errorMsg ? C.red : file ? C.teal400 : dr ? C.teal500 : C.slate300}`,
        borderRadius: 10, padding: "16px",
        background: errorMsg ? "#FEF2F2" : file ? C.teal50 : C.slate50,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.slate800, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11, color: C.slate500, lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>

      {/* Period picker */}
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
            border: `1px solid ${C.slate300}`, borderRadius: 6,
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* File drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDr(true); }}
        onDragLeave={() => setDr(false)}
        onDrop={(e) => { e.preventDefault(); setDr(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => ref.current?.click()}
        style={{
          padding: "10px 12px", borderRadius: 6, cursor: "pointer",
          background: C.white, border: `1px dashed ${C.slate300}`,
          fontSize: 11,
        }}
      >
        <input
          ref={ref} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); }}
        />
        {!file && <span style={{ color: C.teal600, fontWeight: 500 }}>Click or drag file here</span>}
        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: status === "error" ? C.red : "#22C55E", display: "inline-block",
            }} />
            <span style={{ fontWeight: 500, color: C.slate800 }}>{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
              style={{ marginLeft: "auto", background: "none", border: "none",
                color: C.slate400, cursor: "pointer", fontSize: 14 }}
            >&times;</button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#FEE2E2",
          border: `1px solid ${C.red}`, borderRadius: 6, color: "#991B1B",
          fontSize: 11, fontWeight: 500 }}>
          ⚠ {errorMsg}
        </div>
      )}
    </div>
  );
}


export default function UploadModal({ onClose, onUploaded }) {
  // ── files ──
  const [taFile, setTaFile] = useState(null);
  const [msdFile, setMsdFile] = useState(null);
  const [benchFile, setBenchFile] = useState(null);

  // ── periods ──
  const today = new Date().toISOString().slice(0, 10);                 // "YYYY-MM-DD"
  const thisMonth = today.slice(0, 7);                                  // "YYYY-MM"
  const thisWeek = (() => {                                             // "YYYY-Www"
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  })();

  const [taDate, setTaDate] = useState(today);
  const [msdMonth, setMsdMonth] = useState(thisMonth);
  const [benchWeek, setBenchWeek] = useState(thisWeek);

  // ── per-slot error messages (from backend 409s) ──
  const [taErr, setTaErr] = useState(null);
  const [msdErr, setMsdErr] = useState(null);
  const [benchErr, setBenchErr] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!taFile && !msdFile && !benchFile) return;
    setSubmitting(true);
    setTaErr(null); setMsdErr(null); setBenchErr(null);

    let anyError = false;

    try {
      if (taFile) {
        try {
          await uploadFile("ta", taFile, { file_date: taDate });
        } catch (e) {
          setTaErr(e.message); anyError = true;
        }
      }
      // Bench BEFORE MSD so bench-resources query has both pieces ready
      if (benchFile) {
        try {
          await uploadFile("bench", benchFile, { file_week: benchWeek });
        } catch (e) {
          setBenchErr(e.message); anyError = true;
        }
      }
      if (msdFile) {
        try {
          await uploadFile("msd", msdFile, { file_month: msdMonth });
        } catch (e) {
          setMsdErr(e.message); anyError = true;
        }
      }
    } finally {
      setSubmitting(false);
    }

    if (!anyError) {
      onUploaded?.();
      onClose();
    }
  };

  const canSubmit = (taFile || msdFile || benchFile) && !submitting;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.white, borderRadius: 14, width: 640,
        maxHeight: "92vh", overflow: "auto", padding: 28,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.slate800 }}>Upload Weekly Data</div>
            <div style={{ fontSize: 12, color: C.slate400, marginTop: 2 }}>
              Each period (date / month / week) can be uploaded only once.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 22, color: C.slate400, cursor: "pointer",
          }}>&times;</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "20px 0" }}>
          <UploadSlot
            icon="📊" title="Talent Acquisition Data"
            description="Req_Upload sheet — Status, Country, Age, Client_Name, Primary_Skill_1, L3_Skills, Grade"
            file={taFile} status={taFile ? "success" : null}
            onFile={(f) => { setTaFile(f); setTaErr(null); }}
            periodLabel="File date"
            periodType="date"
            periodValue={taDate}
            onPeriodChange={setTaDate}
            errorMsg={taErr}
          />
          <UploadSlot
            icon="📋" title="MSD Allocation List"
            description="Employee allocations — Skillsets, L3/L4 Skills, Grade, Bench Ageing, Onshore/Offshore"
            file={msdFile} status={msdFile ? "success" : null}
            onFile={(f) => { setMsdFile(f); setMsdErr(null); }}
            periodLabel="Allocation month"
            periodType="month"
            periodValue={msdMonth}
            onPeriodChange={setMsdMonth}
            errorMsg={msdErr}
          />
          <UploadSlot
            icon="👥" title="Bench Resource IDs"
            description="Employee Id column — filters MSD to identify bench resources for skill mapping"
            file={benchFile} status={benchFile ? "success" : null}
            onFile={(f) => { setBenchFile(f); setBenchErr(null); }}
            periodLabel="Bench week"
            periodType="week"
            periodValue={benchWeek}
            onPeriodChange={setBenchWeek}
            errorMsg={benchErr}
          />
        </div>

        <div style={{
          background: C.teal50, border: `1px solid ${C.teal200}`,
          borderRadius: 8, padding: 12, marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: C.teal800, marginBottom: 6,
            textTransform: "uppercase", letterSpacing: 0.8,
          }}>How accumulation works</div>
          <div style={{ fontSize: 11, color: C.teal700, lineHeight: 1.7 }}>
            • Each upload is tagged with its date / month / week and stored alongside older snapshots.<br/>
            • The Dashboard always shows ONLY the most recent snapshot of each type.<br/>
            • Re-uploading the same period is blocked — pick a new period to add a new snapshot.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1, padding: "12px 0", borderRadius: 8,
            border: `1px solid ${C.slate300}`, background: C.white, color: C.slate600,
            fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 2, padding: "12px 0", borderRadius: 8, border: "none",
              background: canSubmit ? C.teal600 : C.slate200,
              color: canSubmit ? C.white : C.slate400,
              fontSize: 13, fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}
          >{submitting ? "Uploading…" : "Apply Data"}</button>
        </div>
      </div>
    </div>
  );
}
