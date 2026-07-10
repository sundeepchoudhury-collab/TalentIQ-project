// src/utils/llmMatch.js
// Sends position + bench resources to the FastAPI OpenAI endpoint.
import { getMatchScore, isSameShore } from "../dataProcessor";
import { API_BASE } from "../api";

function normalizeResourceId(id) {
  const raw = String(id ?? "").trim().toLowerCase();
  return raw.replace(/\.0$/, "").replace(/\s+/g, "");
}

/**
 * Run OpenAI-powered skill matching for an open position against bench resources.
 *
 * Strategy:
 *  1. Pre-sort benchResources by fuzzy score so OpenAI focuses on plausible fits.
 *  2. Cap candidates and send only the fields needed for skill/grade matching.
 *  3. Ask the backend to run structured OpenAI matching and reuse cached results.
 *
 * Returns: { summary, recommendation, matches: [{ id, score, confidence, reasoning, strengths, gaps }] }
 */
export async function fetchLLMMatches(position, benchResources) {
  const MAX_CANDIDATES = 35;
  if (!(position.skills || []).some((skill) => String(skill || "").trim())) {
    return {
      summary: "",
      recommendation: "",
      matches: [],
      skipped: true,
      skipReason: "Position has no skills.",
    };
  }

  const ranked = benchResources
    .filter((r) => isSameShore(position.location, r.location))
    .map((r) => {
      const { score } = getMatchScore(position.skills, r.skills);
      return { ...r, _algoScore: score };
    })
    .sort((a, b) => b._algoScore - a._algoScore)
    .slice(0, MAX_CANDIDATES);

  const response = await fetch(`${API_BASE}/ai/resource-matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      position: {
        id: position.id,
        jobTitle: position.role || position.jobTitle || "",
        grade: position.grade,
        skills: position.skills || [],
      },
      resources: ranked.map((r) => ({
        id: r.id,
        grade: r.grade,
        skills: r.skills || [],
      })),
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}${errBody ? ": " + errBody : ""}`);
  }

  const parsed = await response.json();

  // Enrich each match with the original resource data so the UI can render it.
  const resourceById = Object.fromEntries(
    benchResources.flatMap((r) => [
      [String(r.id), r],
      [normalizeResourceId(r.id), r],
    ])
  );
  const enriched = (parsed.matches || []).map((m) => ({
    ...m,
    resource: resourceById[String(m.id)] || resourceById[normalizeResourceId(m.id)] || null,
  }));

  return {
    summary: parsed.summary || "",
    recommendation: parsed.recommendation || "",
    matches: enriched,
    cached: !!parsed.cached,
    cacheSource: parsed.cache_source || null,
    stage1Model: parsed.stage1_model || "",
    stage2Model: parsed.stage2_model || "",
    llmCallCount: parsed.llm_call_count ?? null,
  };
}
