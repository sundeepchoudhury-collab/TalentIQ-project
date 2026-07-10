// src/utils/skillUtils.js
// Helpers for highlighting skill chips when a position/resource is selected.

export function skillMatches(skillA, skillB) {
  const a = String(skillA).toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = String(skillB).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function isSkillInList(skill, skillList) {
  return skillList.some((s) => skillMatches(skill, s));
}
