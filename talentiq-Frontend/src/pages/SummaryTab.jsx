// src/pages/SummaryTab.jsx
// Full-width summary view: coverage rollup, skill demand, comments.
// (Was previously crammed into the right column of a 2-pane layout.)
import { useState } from "react";
import { C } from "../theme";
import { Card, SectionTitle } from "../components/ui";
import { downloadExcel } from "../utils/excel";

// Chips show this many req IDs before the "+N more" / "Show less" toggle.
const REQ_CHIP_VISIBLE_LIMIT = 8;

export default function SummaryTab({ positions, overviewData, onNavigateToMatch }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [skillsPopoutOpen, setSkillsPopoutOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  // Per-skill expand state for the req-ID chip rows in the modal.
  // key: skill name, value: true when all reqs are revealed.
  const [expandedSkills, setExpandedSkills] = useState({});

  const toggleExpand = (skillKey) =>
    setExpandedSkills((prev) => ({ ...prev, [skillKey]: !prev[skillKey] }));

  // Req-ID chip click → look up the full position object and jump to the
  // Resource Matches tab with it auto-selected. The chip's reqId is the
  // position id, but the chip data only carries {id, role, client, location} —
  // so we resolve the full position (with skills, grade, etc.) from `positions`.
  const handleReqClick = (reqId) => {
    const position = positions.find((p) => String(p.id) === String(reqId));
    if (!position) {
      console.warn(`Requisition ${reqId} not found in positions list`);
      return;
    }
    setSkillsPopoutOpen(false);
    onNavigateToMatch?.(position);
  };

  const reqsWithHigh = overviewData.filter((p) => p.high > 0).length;
  const reqsWithMedium = overviewData.filter((p) => p.total > 0 && p.high === 0).length;
  const reqsWithAny = overviewData.filter((p) => p.total > 0).length;
  const reqsWithoutMatch = overviewData.filter((p) => p.total === 0).length;
  const totalPos = positions.length;

  // Skill → reqs map
  const skillReqMap = {};
  positions.forEach((p) => {
    p.skills.forEach((s) => {
      const key = s.trim();
      if (!key) return;
      if (!skillReqMap[key]) skillReqMap[key] = { skill: key, count: 0, reqs: [] };
      skillReqMap[key].count++;
      skillReqMap[key].reqs.push({ id: p.id, role: p.role, client: p.client, location: p.location });
    });
  });
  const skillList = Object.values(skillReqMap).sort((a, b) => b.count - a.count);

  const pctHigh = totalPos ? (reqsWithHigh / totalPos) * 100 : 0;
  const pctMed = totalPos ? (reqsWithMedium / totalPos) * 100 : 0;
  const pctNone = totalPos ? (reqsWithoutMatch / totalPos) * 100 : 0;

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments([{ text: newComment.trim(), at: new Date().toLocaleString() }, ...comments]);
    setNewComment("");
  };

  return (
    <div>
      {/* ── Coverage rollup ── */}
      <SectionTitle>Req Coverage</SectionTitle>
      <Card style={{ marginBottom: 20, padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.slate800 }}>
            Match Coverage Across {totalPos} Open Positions
          </div>
          <div style={{ fontSize: 11, color: C.slate500 }}>
            {reqsWithAny} of {totalPos} have at least one match
          </div>
        </div>
        <div style={{ height: 36, background: C.slate100, borderRadius: 8, overflow: "hidden", display: "flex", border: `1px solid ${C.slate200}` }}>
          {pctHigh > 0 && (
            <div style={{
              width: `${pctHigh}%`, background: C.green600, display: "flex", alignItems: "center",
              justifyContent: "center", color: C.white, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden",
            }}>
              {pctHigh >= 8 ? `${reqsWithHigh} High` : reqsWithHigh}
            </div>
          )}
          {pctMed > 0 && (
            <div style={{
              width: `${pctMed}%`, background: C.amber, display: "flex", alignItems: "center",
              justifyContent: "center", color: C.white, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden",
            }}>
              {pctMed >= 8 ? `${reqsWithMedium} Medium / Low` : reqsWithMedium}
            </div>
          )}
          {pctNone > 0 && (
            <div style={{
              width: `${pctNone}%`, background: C.red, display: "flex", alignItems: "center",
              justifyContent: "center", color: C.white, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden",
            }}>
              {pctNone >= 8 ? `${reqsWithoutMatch} No Match` : reqsWithoutMatch}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 14, fontSize: 11, color: C.slate600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: C.green600, borderRadius: 3 }} />
            <span><strong>{reqsWithHigh}</strong> High confidence <span style={{ color: C.slate400 }}>({pctHigh.toFixed(0)}%)</span></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: C.amber, borderRadius: 3 }} />
            <span><strong>{reqsWithMedium}</strong> Medium / Low <span style={{ color: C.slate400 }}>({pctMed.toFixed(0)}%)</span></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: C.red, borderRadius: 3 }} />
            <span><strong>{reqsWithoutMatch}</strong> No matches <span style={{ color: C.slate400 }}>({pctNone.toFixed(0)}%)</span></span>
          </span>
        </div>
      </Card>

      {/* ── Skill Demand ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Skill Demand Across Open Requisitions</SectionTitle>
        <button
          onClick={() => setSkillsPopoutOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6,
            border: `1px solid ${C.teal400}`, background: C.teal50, color: C.teal700,
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.teal600; e.currentTarget.style.color = C.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.teal50; e.currentTarget.style.color = C.teal700; }}
        >⤢ Expand</button>
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.slate700, color: C.white, position: "sticky", top: 0 }}>
                <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 500 }}>Skill</th>
                <th style={{ padding: "9px 14px", textAlign: "center", fontWeight: 500, width: 100 }}>Open Reqs</th>
                <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 500 }}>Demand</th>
              </tr>
            </thead>
            <tbody>
              {skillList.slice(0, 12).map((s, i) => {
                const maxC = skillList[0]?.count || 1;
                return (
                  <tr key={s.skill} style={{ background: i % 2 === 0 ? C.white : C.slate50 }}>
                    <td style={{ padding: "8px 14px", fontWeight: 500, color: C.slate800 }}>{s.skill}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center", fontWeight: 600, color: C.teal700 }}>{s.count}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <div style={{ height: 6, background: C.slate200, borderRadius: 3, maxWidth: 360 }}>
                        <div style={{ width: `${(s.count / maxC) * 100}%`, height: 6, background: C.teal500, borderRadius: 3 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {skillList.length > 12 && (
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.slate200}`, fontSize: 11, color: C.slate500, textAlign: "center", background: C.slate50 }}>
            Showing top 12 of {skillList.length} skills —{" "}
            <button
              onClick={() => setSkillsPopoutOpen(true)}
              style={{ background: "none", border: "none", color: C.teal600, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", textDecoration: "underline" }}
            >View all</button>
          </div>
        )}
      </Card>

      {/* ── Skills popout ── */}
      {skillsPopoutOpen && (
        <div
          onClick={() => setSkillsPopoutOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.white, borderRadius: 14, width: 780, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ padding: "22px 28px", borderBottom: `1px solid ${C.slate200}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.slate800 }}>Skill Demand — All Skills</div>
                <div style={{ fontSize: 12, color: C.slate400, marginTop: 2 }}>
                  {skillList.length} unique skills across {totalPos} open requisitions
                </div>
              </div>
              <button
                onClick={() => setSkillsPopoutOpen(false)}
                style={{ background: "none", border: "none", fontSize: 22, color: C.slate400, cursor: "pointer" }}
              >&times;</button>
            </div>

            <div style={{ padding: "14px 28px", borderBottom: `1px solid ${C.slate200}` }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.slate400, pointerEvents: "none" }}>🔍</span>
                <input
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Search a skill..."
                  style={{
                    width: "100%", padding: "10px 12px 10px 36px", borderRadius: 8,
                    border: `1px solid ${C.slate200}`, fontSize: 12, fontFamily: "inherit",
                    color: C.slate800, outline: "none", background: C.white,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = C.teal400)}
                  onBlur={(e) => (e.target.style.borderColor = C.slate200)}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 24px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.white, position: "sticky", top: 0, borderBottom: `2px solid ${C.slate200}` }}>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, color: C.slate600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Skill</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", fontWeight: 600, color: C.slate600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, width: 100 }}>Open Reqs</th>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, color: C.slate600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Requisitions</th>
                  </tr>
                </thead>
                <tbody>
                  {skillList
                    .filter((s) => !skillSearch || s.skill.toLowerCase().includes(skillSearch.toLowerCase()))
                    .map((s) => (
                      <tr key={s.skill} style={{ borderBottom: `1px solid ${C.slate100}` }}>
                        <td style={{ padding: "10px", fontWeight: 500, color: C.slate800, verticalAlign: "top" }}>{s.skill}</td>
                        <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, color: C.teal700, verticalAlign: "top" }}>{s.count}</td>
                        <td style={{ padding: "10px", color: C.slate500, fontSize: 11, verticalAlign: "top" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {(expandedSkills[s.skill] ? s.reqs : s.reqs.slice(0, REQ_CHIP_VISIBLE_LIMIT)).map((r) => (
                              <button
                                key={r.id}
                                onClick={() => handleReqClick(r.id)}
                                title={`Open requisition ${r.id} in Resource Matches — ${r.role} · ${r.client}`}
                                aria-label={`Navigate to requisition ${r.id}`}
                                style={{
                                  padding: "2px 8px", background: C.slate100, borderRadius: 3,
                                  fontSize: 10, color: C.slate600, border: "none",
                                  fontFamily: "inherit", lineHeight: 1.5, cursor: "pointer",
                                  transition: "background 0.15s, color 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#0d9488"; e.currentTarget.style.color = "#fff"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = C.slate100; e.currentTarget.style.color = C.slate600; }}
                              >
                                {r.id}
                              </button>
                            ))}
                            {s.reqs.length > REQ_CHIP_VISIBLE_LIMIT && (
                              <button
                                onClick={() => toggleExpand(s.skill)}
                                style={{
                                  background: "none", border: `1px solid ${C.slate200}`, borderRadius: 6,
                                  padding: "2px 8px", fontSize: 10, color: C.slate500, cursor: "pointer",
                                  fontFamily: "inherit", alignSelf: "center",
                                }}
                              >
                                {expandedSkills[s.skill] ? "Show less" : `+${s.reqs.length - REQ_CHIP_VISIBLE_LIMIT} more`}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {skillList.filter((s) => !skillSearch || s.skill.toLowerCase().includes(skillSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan={3} style={{ padding: "30px", textAlign: "center", color: C.slate400, fontSize: 12 }}>No skills match "{skillSearch}"</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "14px 28px", borderTop: `1px solid ${C.slate200}`, display: "flex", justifyContent: "flex-end", gap: 10, background: C.slate50 }}>
              <button
                onClick={() => {
                  const data = skillList.map((s) => ({
                    Skill: s.skill,
                    "Open Reqs": s.count,
                    "Req IDs": s.reqs.map((r) => r.id).join(", "),
                    "Roles": s.reqs.map((r) => r.role).join(", "),
                  }));
                  downloadExcel(data, `TalentIQ_Skill_Demand_${new Date().toISOString().slice(0, 10)}.xlsx`, "Skill Demand");
                }}
                style={{
                  padding: "8px 16px", borderRadius: 6,
                  border: `1px solid ${C.teal400}`, background: C.teal50, color: C.teal700,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >↓ Download Excel</button>
              <button
                onClick={() => setSkillsPopoutOpen(false)}
                style={{
                  padding: "8px 20px", borderRadius: 6, border: "none",
                  background: C.teal600, color: C.white, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Comments ── */}
      <SectionTitle style={{ marginTop: 20 }}>Notes & Comments</SectionTitle>
      <Card>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment about this week's mapping, blockers, escalations, or next steps..."
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: `1px solid ${C.slate200}`, fontSize: 12, fontFamily: "inherit",
            color: C.slate800, outline: "none", resize: "vertical", background: C.slate50,
          }}
          onFocus={(e) => (e.target.style.borderColor = C.teal400)}
          onBlur={(e) => (e.target.style.borderColor = C.slate200)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            onClick={addComment}
            disabled={!newComment.trim()}
            style={{
              padding: "7px 18px", borderRadius: 6, border: "none",
              background: newComment.trim() ? C.teal600 : C.slate200,
              color: newComment.trim() ? C.white : C.slate400,
              fontSize: 12, fontWeight: 600,
              cursor: newComment.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}
          >Add Comment</button>
        </div>
        {comments.length > 0 && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.slate200}`, paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.slate500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              History ({comments.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
              {comments.map((c, i) => (
                <div key={i} style={{ padding: "10px 14px", background: C.slate50, borderLeft: `3px solid ${C.teal400}`, borderRadius: "0 6px 6px 0" }}>
                  <div style={{ fontSize: 12, color: C.slate700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.text}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: C.slate400 }}>{c.at}</span>
                    <button
                      onClick={() => setComments(comments.filter((_, idx) => idx !== i))}
                      style={{ background: "none", border: "none", color: C.slate400, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
