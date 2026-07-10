// src/api.js
// ──────────────────────────────────────────────────────────────
// Thin wrapper around fetch() for the FastAPI backend.
//
// uploadFile() takes any extra form fields as the `period` arg —
// unchanged in this revision since it already passes through any
// keys you give it (file_date, file_month, file_week, replace, lobs).
// ──────────────────────────────────────────────────────────────

export const API_BASE = "/api";

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
 * @param {Object} fields any of { file_date, file_month, file_week, replace, lobs }
 */
export async function uploadFile(kind, file, fields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));

  let res;
  try {
    res = await fetch(`${API_BASE}/upload/${kind}`, { method: "POST", body: fd });
  } catch (err) {
    throw new Error(
      `Could not reach backend upload API. Restart with start.bat and confirm the backend is running on http://localhost:8000. ${err.message || ""}`.trim()
    );
  }
  if (!res.ok) throw new Error(await _readError(res));
  return res.json();
}

async function _get(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch (err) {
    throw new Error(
      `Could not reach backend API. Restart with start.bat and confirm the backend is running on http://localhost:8000. ${err.message || ""}`.trim()
    );
  }
  if (!res.ok) throw new Error(await _readError(res));
  return res.json();
}

async function _postJson(path, payload) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  } catch (err) {
    throw new Error(
      `Could not reach backend API. Restart with start.bat and confirm the backend is running on http://localhost:8000. ${err.message || ""}`.trim()
    );
  }
  if (!res.ok) throw new Error(await _readError(res));
  return res.json();
}

async function _deleteJson(path, payload) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  } catch (err) {
    throw new Error(
      `Could not reach backend API. Restart with start.bat and confirm the backend is running on http://localhost:8000. ${err.message || ""}`.trim()
    );
  }
  if (!res.ok) throw new Error(await _readError(res));
  return res.json();
}

export const fetchDashboard      = ()    => _get(`/dashboard`);
export const fetchPositions      = ()    => _get(`/positions`);
export const fetchBenchResources = ()    => _get(`/bench-resources`);
export const fetchBenchInventory = ()    => _get(`/bench-inventory`);
export const addManualBenchIds   = (employeeIds, effectiveDate) => _postJson(`/bench-ids/manual`, { employee_ids: employeeIds, effective_date: effectiveDate || null });
export const deleteBenchIds      = (employeeIds, effectiveDate) => _deleteJson(`/bench-ids`, { employee_ids: employeeIds, effective_date: effectiveDate || null });
export const fetchAllMSDResources = ()   => _get(`/msd-all`);
export const fetchMatches        = (id)  => _get(`/matches/${encodeURIComponent(id)}`);
export const fetchEmployeeHistory = (id) => _get(`/employee-history/${encodeURIComponent(id)}`);
export const fetchAllMatches     = (min) => _get(`/all-matches?min_score=${min ?? 40}`);
export const fetchDataStatus     = ()    => _get(`/data-status`);
