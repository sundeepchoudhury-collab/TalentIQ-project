// src/api.js
// ──────────────────────────────────────────────────────────────
// NEW FILE — create this in your frontend at src/api.js
//
// Thin wrapper around fetch() for talking to the FastAPI backend.
// Throws Error(message) on any non-2xx response so callers can
// display the message inline.
// ──────────────────────────────────────────────────────────────

const BASE = "http://localhost:8000/api";

async function _readError(res) {
  try {
    const body = await res.json();
    return body.detail || body.message || JSON.stringify(body);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/**
 * Upload an Excel file to the backend.
 * @param {"ta"|"msd"|"bench"} kind
 * @param {File} file
 * @param {Object} period one of { file_date, file_month, file_week }
 */
export async function uploadFile(kind, file, period) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(period).forEach(([k, v]) => fd.append(k, v));

  const res = await fetch(`${BASE}/upload/${kind}`, { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error(await _readError(res));
  }
  return res.json();
}

async function _get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await _readError(res));
  return res.json();
}

export const fetchDashboard      = ()    => _get(`/dashboard`);
export const fetchPositions      = ()    => _get(`/positions`);
export const fetchBenchResources = ()    => _get(`/bench-resources`);
export const fetchMatches        = (id)  => _get(`/matches/${encodeURIComponent(id)}`);
export const fetchAllMatches     = (min) => _get(`/all-matches?min_score=${min ?? 40}`);
export const fetchDataStatus     = ()    => _get(`/data-status`);
