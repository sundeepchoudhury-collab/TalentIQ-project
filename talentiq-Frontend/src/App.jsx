import { useState, useEffect, useCallback } from "react";
import "./index.css";
import { C } from "./theme";
import {
  fetchDashboard, fetchPositions, fetchBenchResources,
} from "./api";
import UploadModal from "./components/UploadModal";
import DashboardPage from "./pages/DashboardPage";
import SkillMappingPage from "./pages/SkillMappingPage";
import ResourceSearchPage from "./pages/ResourceSearchPage";

const NAV_ITEMS = [
  { k: "dashboard", l: "Dashboard" },
  { k: "mapping", l: "Skill Mapping" },
  { k: "search", l: "Resource Search" },
];

const emptyDash = {
  kpis: { totalActive: 0, open: 0, offered: 0, newReqs: 0, avgAging: 0,
    offOpen: 0, onOpen: 0, offOffered: 0, onOffered: 0, offAging: 0, onAging: 0 },
  clientBar: [],
  agingPipeline: [
    { bucket: "Pre-appr.", value: 0, color: "#5EEAD4" },
    { bucket: "1-30 d", value: 0, color: "#0D9488" },
    { bucket: "31-60 d", value: 0, color: "#64748B" },
    { bucket: "61-90 d", value: 0, color: "#D97706" },
    { bucket: "91+ d", value: 0, color: "#DC2626" },
  ],
  leakage: [], heatmap: [], heatmapTotals: {},
  offOnBar: [{ name: "Open", Offshore: 0, Onshore: 0 }, { name: "Offered", Offshore: 0, Onshore: 0 }],
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [showUpload, setShowUpload] = useState(false);
  const [dashData, setDashData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [bench, setBench] = useState([]);
  const [asOf, setAsOf] = useState(null);
  const [skillMappingManualEntryToken, setSkillMappingManualEntryToken] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [d, p, b] = await Promise.all([
        fetchDashboard(), fetchPositions(), fetchBenchResources(),
      ]);
      setDashData(d);
      setPositions(p);
      setBench(b);
      setAsOf(d.as_of || null);
    } catch (err) {
      console.warn("Could not load data from backend:", err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const pageContent =
    page === "dashboard"
      ? <DashboardPage data={dashData || emptyDash} bench={bench} />
      : page === "search"
        ? <ResourceSearchPage />
        : (
          <SkillMappingPage
            positions={positions}
            bench={bench}
            onBenchChanged={refresh}
            manualEntryFocusToken={skillMappingManualEntryToken}
          />
        );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Outfit','DM Sans',sans-serif", color: C.slate800 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${C.slate300};border-radius:6px}
        input::placeholder{color:${C.slate400}}
      `}</style>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={refresh}
          onManualBenchEntry={() => {
            setShowUpload(false);
            setPage("mapping");
            setSkillMappingManualEntryToken((current) => current + 1);
          }}
        />
      )}

      <div style={{
        background: C.white, borderBottom: `1px solid ${C.slate200}`, padding: "0 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ padding: "16px 0" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.slate800 }}>
              Talent<span style={{ color: C.teal600 }}>IQ</span>
            </span>
            <span style={{ color: C.slate400, fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
              {"\u00b7"} Recruitment Intelligence
            </span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {NAV_ITEMS.map((n) => (
              <button key={n.k} onClick={() => setPage(n.k)}
                style={{
                  padding: "18px 20px", fontSize: 13, fontWeight: page === n.k ? 600 : 400,
                  cursor: "pointer", color: page === n.k ? C.teal700 : C.slate500,
                  background: "transparent", border: "none",
                  borderBottom: page === n.k ? `2px solid ${C.teal600}` : "2px solid transparent",
                  fontFamily: "inherit",
                }}>{n.l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {asOf && <span style={{ fontSize: 11, color: C.teal600, fontWeight: 500 }}>
            Data as of {asOf}
          </span>}
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6,
              border: `1px solid ${C.teal400}`, background: C.teal50, color: C.teal700,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >Upload Data</button>
        </div>
      </div>

      {pageContent}

      <div style={{ textAlign: "center", padding: "12px 0 28px", color: C.slate400, fontSize: 10.5 }}>
        TalentIQ {"\u00b7"} Recruitment Intelligence Platform
      </div>
    </div>
  );
}
