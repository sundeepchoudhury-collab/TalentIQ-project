// src/pages/SkillMappingPage.jsx
// Container for the Skill Mapping section.
// Owns: active tab + cross-cutting selection (selectedPos / selectedRes).
// Each tab is now full-width by default. The position list (with its search)
// has been moved INTO the Resource Matches tab so it's native to that view —
// Summary and Confidence Overview no longer share screen real-estate with it.
import { useEffect, useMemo, useState } from "react";
import { C } from "../theme";
import { KPICard, TabBtn } from "../components/ui";
import { getMatchScore, isSameShore, monthsOnBench } from "../dataProcessor";
import SummaryTab from "./SummaryTab";
import BenchResourcesTab from "./BenchResourcesManager";
import ResourceMatchesTab from "./ResourceMatchesTab";
import ConfidenceOverviewTab from "./ConfidenceOverviewTab";
import { fetchLLMMatches } from "../utils/llmMatch";

function normalizeId(id) {
  return String(id || "").trim();
}

const LLM_BATCH_SIZE = 25;
const AI_MODEL_LABEL = "gpt-5-mini";
const LLM_CANDIDATE_CAP = 35;
const AI_MAX_OUTPUT_TOKENS = 1600;
const MODEL_PRICING = {
  [AI_MODEL_LABEL]: { inputPerMillion: 0.25, outputPerMillion: 2.00 },
};

function formatUsd(value) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function estimateTokensFromText(value) {
  return Math.ceil(String(value || "").length / 4);
}

function estimateResourceTokens(resource) {
  const parts = [resource.id, resource.grade, ...(resource.skills || []).slice(0, 16)];
  return 18 + estimateTokensFromText(parts.join(" | "));
}

function estimatePositionTokens(position) {
  const parts = [position.id, position.role || position.jobTitle, position.grade, ...(position.skills || [])];
  return 90 + estimateTokensFromText(parts.join(" | "));
}

function estimateStageCost(inputTokens, outputTokens, model) {
  const pricing = MODEL_PRICING[model];
  return ((inputTokens * pricing.inputPerMillion) + (outputTokens * pricing.outputPerMillion)) / 1000000;
}

function getScopedBenchForPosition(pos, bench) {
  return bench.filter((r) => isSameShore(pos.location, r.location));
}

function hasUsableSkills(pos) {
  return (pos.skills || []).some((skill) => String(skill || "").trim());
}

function estimateAIMatchCost(positions, bench) {
  let inputTokens = 0;
  let eligible = 0;

  positions.forEach((pos) => {
    if (!hasUsableSkills(pos)) return;
    eligible += 1;

    const scopedBench = getScopedBenchForPosition(pos, bench)
      .map((r) => {
        const { score } = getMatchScore(pos.skills, r.skills);
        return { ...r, _algoScore: score };
      })
      .sort((a, b) => b._algoScore - a._algoScore)
      .slice(0, LLM_CANDIDATE_CAP);
    const posTokens = estimatePositionTokens(pos);

    inputTokens += posTokens + 190 + scopedBench.reduce((sum, resource) => sum + estimateResourceTokens(resource), 0);
  });

  const outputTokens = eligible * AI_MAX_OUTPUT_TOKENS;
  const totalCost = estimateStageCost(inputTokens, outputTokens, AI_MODEL_LABEL);

  return {
    inputTokens,
    outputTokens,
    totalCost,
  };
}

function AIMatchConfirmDialog({ estimate, onCancel, onConfirm }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "100%",
          background: C.white,
          borderRadius: 10,
          border: `1px solid ${C.slate200}`,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.22)",
          padding: 22,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: C.slate800, marginBottom: 6 }}>
          Confirm AI matching run
        </div>
        <div style={{ fontSize: 12, color: C.slate500, lineHeight: 1.6, marginBottom: 16 }}>
          This will run the gpt-5-mini matcher for requisitions that have skills. Cached matches are reused by the backend when the same position and candidate set is requested again.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            ["Eligible reqs", estimate.eligible],
            ["Skipped reqs", estimate.skipped],
            ["Max LLM calls", estimate.maxCalls],
            ["Est. max cost", formatUsd(estimate.cost.totalCost)],
          ].map(([label, value]) => (
            <div key={label} style={{ border: `1px solid ${C.slate200}`, borderRadius: 8, padding: "10px 12px", background: C.slate50 }}>
              <div style={{ fontSize: 10, color: C.slate500, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
              <div style={{ fontSize: 18, color: C.slate800, fontWeight: 800, marginTop: 3 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${C.slate200}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ display: "flex", padding: "9px 11px", background: C.slate50, borderBottom: `1px solid ${C.slate200}` }}>
            <span style={{ flex: 1, fontSize: 11, color: C.slate500, fontWeight: 700 }}>Stage</span>
            <span style={{ width: 92, fontSize: 11, color: C.slate500, fontWeight: 700 }}>Model</span>
            <span style={{ width: 54, textAlign: "right", fontSize: 11, color: C.slate500, fontWeight: 700 }}>Calls</span>
            <span style={{ width: 82, textAlign: "right", fontSize: 11, color: C.slate500, fontWeight: 700 }}>Est. cost</span>
          </div>
          {[
            ["Populate resource matches", AI_MODEL_LABEL, estimate.aiCalls, estimate.cost.totalCost],
          ].map(([stage, model, calls, cost]) => (
            <div key={stage} style={{ display: "flex", padding: "9px 11px", borderTop: `1px solid ${C.slate100}` }}>
              <span style={{ flex: 1, fontSize: 12, color: C.slate700 }}>{stage}</span>
              <span style={{ width: 92, fontSize: 11, color: C.slate500 }}>{model}</span>
              <span style={{ width: 54, textAlign: "right", fontSize: 12, color: C.slate800, fontWeight: 700 }}>{calls}</span>
              <span style={{ width: 82, textAlign: "right", fontSize: 12, color: C.slate800, fontWeight: 700 }}>{formatUsd(cost)}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.slate500, background: C.slate50, border: `1px solid ${C.slate200}`, borderRadius: 7, padding: "8px 10px", marginBottom: 14, lineHeight: 1.5 }}>
          Estimate uses up to {estimate.candidateCap} candidates per requisition, max output caps, and standard uncached gpt-5-mini token pricing. Backend cache hits can reduce actual spend.
        </div>

        {estimate.skipped > 0 && (
          <div style={{ fontSize: 11, color: "#92400E", background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 7, padding: "8px 10px", marginBottom: 14 }}>
            {estimate.skipped} requisition{estimate.skipped === 1 ? "" : "s"} will be skipped because no skills are available.
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 7, border: `1px solid ${C.slate300}`, background: C.white, color: C.slate600, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!estimate.eligible} style={{ flex: 1.5, padding: "10px 0", borderRadius: 7, border: "none", background: estimate.eligible ? "#7C3AED" : C.slate200, color: estimate.eligible ? C.white : C.slate400, fontSize: 12, fontWeight: 800, cursor: estimate.eligible ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            Start AI Match
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SkillMappingPage({ positions, bench, onBenchChanged, manualEntryFocusToken = 0 }) {
  const [tab, setTab] = useState("summary");

  // Cross-tab selection — Confidence Overview row click sets these and jumps to Matches.
  const [selectedPos, setSelectedPos] = useState(null);
  const [selectedRes, setSelectedRes] = useState(null);
  // True when the current Matches selection came from clicking a req ID chip
  // in the Skill Demand modal — drives the confirmation banner in the tab.
  const [cameFromSkillDemand, setCameFromSkillDemand] = useState(false);
  const [aiResultsByReq, setAiResultsByReq] = useState({});
  const [aiStatus, setAiStatus] = useState({ loading: false, done: 0, total: 0, error: null, lastRunAt: null });
  const [showAIConfirm, setShowAIConfirm] = useState(false);

  useEffect(() => {
    if (manualEntryFocusToken) setTab("bench");
  }, [manualEntryFocusToken]);

  // Confidence overview — computed once, shared by Summary + Overview tabs.
  // IMPORTANT: shore filtering must match ResourceMatchesTab's logic exactly,
  // otherwise the Confidence table would show counts (e.g. "14 High") that
  // disappear when the user clicks the row and lands in Matches view (because
  // Matches filters bench resources to the position's shore).
  const overviewData = useMemo(() => positions.map((pos) => {
    let high = 0, medium = 0, low = 0;
    const matchedResources = [];
    bench.forEach((r) => {
      // Enforce same-shore matching consistent with ResourceMatchesTab.
      if (!isSameShore(pos.location, r.location)) return;
      const { score, matched } = getMatchScore(pos.skills, r.skills);
      if (score >= 80) { high++; matchedResources.push({ ...r, score, matched, confidence: "High" }); }
      else if (score >= 60) { medium++; matchedResources.push({ ...r, score, matched, confidence: "Medium" }); }
      else if (score >= 40) { low++; matchedResources.push({ ...r, score, matched, confidence: "Low" }); }
    });
    return { ...pos, high, medium, low, total: high + medium + low, matchedResources };
  }), [positions, bench]);

  const lt3 = bench.filter((r) => monthsOnBench(r.benchDays) < 3).length;
  const gt3 = bench.filter((r) => monthsOnBench(r.benchDays) >= 3).length;
  const aiEstimate = useMemo(() => {
    const eligible = positions.filter(hasUsableSkills).length;
    const cost = estimateAIMatchCost(positions, bench);
    return {
      eligible,
      skipped: positions.length - eligible,
      aiCalls: eligible,
      maxCalls: eligible,
      candidateCap: LLM_CANDIDATE_CAP,
      cost,
    };
  }, [positions, bench]);

  // Confidence Overview row click → preselect position and jump to Matches tab.
  const handleSelectPositionFromOverview = (pos) => {
    setSelectedPos(pos);
    setSelectedRes(null);
    setCameFromSkillDemand(false);
    setTab("matches");
  };

  // Skill Demand modal req-ID chip click → preselect position, jump to Matches,
  // and flag it so the tab shows a "navigated from Skill Demand" banner.
  const handleSelectPositionFromSkillDemand = (pos) => {
    setSelectedPos(pos);
    setSelectedRes(null);
    setCameFromSkillDemand(true);
    setTab("matches");
  };

  const runGlobalAIMatch = async () => {
    if (!positions.length || !bench.length || aiStatus.loading) return;
    setShowAIConfirm(false);
    const eligiblePositions = positions.filter(hasUsableSkills);
    const next = {};
    const failures = [];
    let completed = 0;
    setAiResultsByReq({});
    setAiStatus({ loading: true, done: 0, total: eligiblePositions.length, error: null, lastRunAt: null });

    for (let i = 0; i < eligiblePositions.length; i += LLM_BATCH_SIZE) {
      const batch = eligiblePositions.slice(i, i + LLM_BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(async (pos) => ({
          pos,
          result: await fetchLLMMatches(pos, getScopedBenchForPosition(pos, bench)),
        }))
      );

      settled.forEach((item, idx) => {
        completed += 1;
        if (item.status === "fulfilled") {
          next[normalizeId(item.value.pos.id)] = item.value.result;
        } else {
          failures.push({
            id: batch[idx]?.id || "Unknown",
            error: item.reason?.message || "Unknown AI matching error",
          });
        }
      });

      setAiResultsByReq({ ...next });
      setAiStatus({
        loading: true,
        done: completed,
        total: eligiblePositions.length,
        error: failures.length ? `${failures.length} requisition${failures.length === 1 ? "" : "s"} failed so far` : null,
        lastRunAt: null,
      });
    }

    setAiStatus({
      loading: false,
      done: completed,
      total: eligiblePositions.length,
      error: failures.length ? `${failures.length} requisition${failures.length === 1 ? "" : "s"} failed during AI matching` : null,
      lastRunAt: new Date().toISOString(),
    });
  };

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 24px 40px" }}>
      {/* KPI strip — visible on all tabs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <KPICard label="Open Positions" value={positions.length} />
        <KPICard label="Matching Resources" value={bench.length} />
        <KPICard label="< 3 Months Bench" value={lt3} />
        <KPICard label="> 3 Months Bench" value={gt3} />
      </div>

      {/* Tab bar — full width */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16, padding: "12px 14px", background: C.white, border: `1px solid ${C.slate200}`, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#5B21B6", textTransform: "uppercase", letterSpacing: 0.8 }}>LLM Skill Mapping</div>
          <div style={{ fontSize: 11, color: aiStatus.error ? "#991B1B" : C.slate500, marginTop: 3 }}>
            {aiStatus.loading
              ? `Matching requisitions ${aiStatus.done}/${aiStatus.total}`
              : aiStatus.error
                ? `AI match failed after ${aiStatus.done}/${aiStatus.total}: ${aiStatus.error}`
                : aiStatus.lastRunAt
                  ? `LLM rematch ready for ${aiStatus.done} requisitions`
                  : "Run once to compare LLM scores with fuzzy skill matching across the workbook."}
          </div>
        </div>
        <button
          onClick={() => setShowAIConfirm(true)}
          disabled={!positions.length || !bench.length || aiStatus.loading}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #A78BFA", background: aiStatus.loading ? "#F5F3FF" : "#EDE9FE", color: "#5B21B6", fontSize: 12, fontWeight: 700, cursor: aiStatus.loading ? "wait" : "pointer", fontFamily: "inherit", opacity: (!positions.length || !bench.length) ? 0.55 : 1 }}
        >
          {aiStatus.loading ? "Analysing..." : aiStatus.lastRunAt ? "Rematch with AI" : "Match with AI"}
        </button>
      </div>

      {showAIConfirm && (
        <AIMatchConfirmDialog
          estimate={aiEstimate}
          onCancel={() => setShowAIConfirm(false)}
          onConfirm={runGlobalAIMatch}
        />
      )}

      <div style={{ display: "flex", borderBottom: `1px solid ${C.slate200}`, marginBottom: 16 }}>
        <TabBtn label="Summary" active={tab === "summary"} onClick={() => setTab("summary")} />
        <TabBtn label="Bench Resources" active={tab === "bench"} onClick={() => setTab("bench")} />
        <TabBtn label="Resource Matches" active={tab === "matches"} onClick={() => setTab("matches")} />
        <TabBtn label="Confidence Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
      </div>

      {/* Tab content — full width */}
      {tab === "summary" && (
        <SummaryTab
          positions={positions}
          overviewData={overviewData}
          onNavigateToMatch={handleSelectPositionFromSkillDemand}
        />
      )}

      {tab === "bench" && (
        <BenchResourcesTab
          bench={bench}
          onBenchChanged={onBenchChanged}
          manualEntryFocusToken={manualEntryFocusToken}
        />
      )}

      {tab === "matches" && (
        <ResourceMatchesTab
          positions={positions}
          bench={bench}
          selectedPos={selectedPos}
          setSelectedPos={setSelectedPos}
          selectedRes={selectedRes}
          setSelectedRes={setSelectedRes}
          benchTotals={{ lt3, gt3 }}
          aiResultsByReq={aiResultsByReq}
          aiStatus={aiStatus}
          navigatedFromModal={cameFromSkillDemand}
          onConsumeNavFlag={() => setCameFromSkillDemand(false)}
        />
      )}

      {tab === "overview" && (
        <ConfidenceOverviewTab
          positions={positions}
          bench={bench}
          overviewData={overviewData}
          onSelectPosition={handleSelectPositionFromOverview}
          aiResultsByReq={aiResultsByReq}
          aiStatus={aiStatus}
        />
      )}
    </div>
  );
}
