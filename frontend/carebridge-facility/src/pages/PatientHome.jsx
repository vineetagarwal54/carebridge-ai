import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, getUser } from "../utils/authStorage";
import { fetchCases, fetchCarePlan } from "../api/cases";
import logo from "../assets/icon.png";

// ─── Shared helpers ───────────────────────────────────────────────────────────
const card = {
  background: "#fff", border: "0.5px solid #E0D5C0",
  borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const PRIORITY_COLOR = { critical: "#991B1B", high: "#991B1B", medium: "#92400E", low: "#1E40AF" };
const PRIORITY_BG    = { critical: "#FEE2E2", high: "#FEE2E2", medium: "#FEF3C7", low: "#DBEAFE" };
const pColor = (p = "low") => PRIORITY_COLOR[p?.toLowerCase()] || "#1E40AF";
const pBg    = (p = "low") => PRIORITY_BG[p?.toLowerCase()]    || "#DBEAFE";

function LoadingState() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
      <p style={{ fontSize: 14, color: "#7A6B52", margin: 0 }}>Loading your care plan…</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <p style={{ fontSize: 14, color: "#7A6B52", margin: 0 }}>{message || "No data available yet."}</p>
    </div>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ user, onSignOut }) {
  const displayName = user?.full_name || user?.name || "Patient";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50, background: "#fff",
      borderBottom: "1px solid #E0D5C0", display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "12px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src={logo} alt="CareBridge" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
        <span style={{ fontWeight: 600, fontSize: 16, color: "#1B5E3B" }}>CareBridge</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>{displayName}</span>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: "#E8F0E4",
          color: "#1B5E3B", display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 600, fontSize: 12,
        }}>{initials}</div>
        <button onClick={onSignOut} style={{
          fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
          border: "0.5px solid #E0D5C0", color: "#5C4A2E", background: "transparent",
        }}>Sign out</button>
      </div>
    </nav>
  );
}

// ─── MainTabs ─────────────────────────────────────────────────────────────────
function MainTabs({ activeTab, onTabChange, missingFollowUps }) {
  const TABS = [
    { id: "careplan",    label: "My care plan" },
    { id: "medications", label: "My medications" },
    { id: "followup",    label: "Follow-up plan", badge: missingFollowUps },
    { id: "chat",        label: "Ask CareBridge" },
  ];
  return (
    <div style={{
      background: "#fff", position: "sticky", top: 57, zIndex: 40,
      borderBottom: "1px solid #E0D5C0", display: "flex", overflowX: "auto",
    }}>
      {TABS.map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "12px 20px",
          fontWeight: 500, whiteSpace: "nowrap", fontSize: 13, cursor: "pointer",
          background: "transparent", border: "none",
          color: activeTab === tab.id ? "#1B5E3B" : "#7A6B52",
          borderBottom: activeTab === tab.id ? "2.5px solid #1B5E3B" : "2.5px solid transparent",
        }}>
          {tab.label}
          {tab.badge > 0 && (
            <span style={{
              background: "#991B1B", color: "#fff", borderRadius: 999,
              fontSize: 10, fontWeight: 600, minWidth: 16, height: 16,
              display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
            }}>{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── CarePlanTab ──────────────────────────────────────────────────────────────
function CarePlanTab({ carePlan, loading }) {
  const [activePhase, setActivePhase] = useState(0);
  const [checked, setChecked] = useState({});

  if (loading) return <LoadingState />;
  if (!carePlan) return <EmptyState message="Your care plan hasn't been generated yet. Please check back soon." />;

  const phases = carePlan.timeline || [];
  const currentPhase = phases[activePhase];
  const tasks = currentPhase?.tasks || [];
  const totalTasks = phases.flatMap(p => p.tasks).length;
  const doneCount = Object.values(checked).filter(Boolean).length;

  const toggle = (key) => setChecked(p => ({ ...p, [key]: !p[key] }));

  const groups = {
    critical: tasks.filter(t => ["critical","high"].includes(t.priority?.toLowerCase())),
    medium:   tasks.filter(t => t.priority?.toLowerCase() === "medium"),
    low:      tasks.filter(t => !["critical","high","medium"].includes(t.priority?.toLowerCase())),
  };

  return (
    <div style={{ padding: 20, maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", margin: "0 0 4px" }}>Your care plan</h1>
        <p style={{ fontSize: 13, color: "#7A6B52", margin: 0 }}>
          Step-by-step tasks from your care team — {doneCount} of {totalTasks} completed
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ ...card, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#7A6B52" }}>Overall progress</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1B5E3B" }}>
            {totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 8, background: "#F0E8D8", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${totalTasks ? (doneCount / totalTasks) * 100 : 0}%`,
            height: "100%", background: "#1B5E3B", transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Phase tabs */}
      {phases.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto" }}>
          {phases.map((phase, i) => (
            <button key={i} onClick={() => setActivePhase(i)} style={{
              flexShrink: 0, padding: "10px 16px", borderRadius: 10, cursor: "pointer",
              border: activePhase === i ? "1.5px solid #1B5E3B" : "0.5px solid #E0D5C0",
              background: activePhase === i ? "#E8F0E4" : "#fff",
              color: activePhase === i ? "#1B5E3B" : "#7A6B52",
              fontSize: 13, fontWeight: 500,
            }}>
              {phase.label}
              <span style={{ display: "block", fontSize: 10, color: activePhase === i ? "#1B5E3B" : "#A39880", marginTop: 2 }}>
                {phase.tasks.length} task{phase.tasks.length !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tasks */}
      {[
        { label: "Do first", items: groups.critical, color: "#991B1B" },
        { label: "Important", items: groups.medium, color: "#92400E" },
        { label: "Routine", items: groups.low, color: "#1E40AF" },
      ].map(({ label, items, color }) => items.length === 0 ? null : (
        <div key={label} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7A6B52", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
          </div>
          {items.map((task, i) => {
            const key = `${activePhase}-${label}-${i}`;
            const done = checked[key];
            return (
              <div key={i} style={{ ...card, marginBottom: 8, padding: 0, overflow: "hidden", opacity: done ? 0.6 : 1 }}>
                <div style={{ display: "flex" }}>
                  <div style={{ width: 5, background: pColor(task.priority), flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <button onClick={() => toggle(key)} style={{
                      width: 20, height: 20, borderRadius: 5, marginTop: 1, flexShrink: 0, cursor: "pointer",
                      border: done ? "1.5px solid #1B5E3B" : "1.5px solid #C4B9A0",
                      background: done ? "#1B5E3B" : "#fff", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    }}>{done ? "✓" : ""}</button>
                    <div style={{ flex: 1 }}>
                      <p style={{
                        margin: "0 0 6px", fontSize: 13, lineHeight: 1.5,
                        color: done ? "#A39880" : "#1E293B",
                        textDecoration: done ? "line-through" : "none",
                      }}>{task.task}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ background: pBg(task.priority), color: pColor(task.priority), padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 500 }}>
                          {task.priority}
                        </span>
                        <span style={{ fontSize: 10, color: "#A39880" }}>{task.category}</span>
                      </div>
                      {task.details && (
                        <div style={{ marginTop: 8, background: "#FDF6EC", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#7A6B52", lineHeight: 1.5 }}>
                          📝 {task.details}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {tasks.length === 0 && <EmptyState message="No tasks for this phase." />}
    </div>
  );
}

// ─── MedicationsTab ───────────────────────────────────────────────────────────
function MedicationsTab({ carePlan, loading }) {
  if (loading) return <LoadingState />;
  if (!carePlan) return <EmptyState message="Medication information not available yet." />;

  const meds = carePlan.medications_schedule || [];

  if (!meds.length) return <EmptyState message="No medications listed in your care plan." />;

  return (
    <div style={{ padding: 20, maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", margin: "0 0 4px" }}>My medications</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", margin: "0 0 20px" }}>
        {meds.length} medication{meds.length !== 1 ? "s" : ""} from your care plan
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {meds.map((med, i) => (
          <div key={i} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#1B5E3B", flexShrink: 0,
                  }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1E293B" }}>{med.name}</p>
                </div>
                <p style={{ margin: "0 0 4px 18px", fontSize: 12, color: "#7A6B52" }}>
                  {[med.route, med.frequency].filter(Boolean).join(" · ")}
                </p>
                {med.special_instructions && (
                  <p style={{ margin: "4px 0 0 18px", fontSize: 12, color: "#92400E", fontWeight: 500 }}>
                    ⚠ {med.special_instructions}
                  </p>
                )}
              </div>
              <div style={{
                background: "#E8F0E4", color: "#1B5E3B", padding: "6px 14px",
                borderRadius: 999, fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {med.dose}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "#A39880", textAlign: "center", marginTop: 20 }}>
        Always take medications as prescribed. Contact your care team with any concerns.
      </p>
    </div>
  );
}

// ─── FollowUpTab ──────────────────────────────────────────────────────────────
function FollowUpTab({ carePlan, loading }) {
  if (loading) return <LoadingState />;
  if (!carePlan) return <EmptyState message="Follow-up information not available yet." />;

  const followUps = carePlan.follow_up_reminders || [];
  const warnings  = carePlan.warning_signs || [];

  const withDate    = followUps.filter(f => f.date);
  const withoutDate = followUps.filter(f => !f.date);

  function FollowUpCard({ f }) {
    return (
      <div style={{ ...card, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: "#E8F0E4",
          color: "#1B5E3B", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 18, flexShrink: 0,
        }}>📅</div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
            {f.provider_name || "Appointment"}
          </p>
          {f.specialty && (
            <p style={{ margin: "0 0 2px", fontSize: 11, color: "#7A6B52" }}>{f.specialty}</p>
          )}
          {f.date && (
            <p style={{ margin: "0 0 2px", fontSize: 12, color: "#1B5E3B", fontWeight: 500 }}>
              {[f.date, f.time].filter(Boolean).join(" at ")}
            </p>
          )}
          {f.reason && (
            <p style={{ margin: 0, fontSize: 11, color: "#A39880" }}>{f.reason}</p>
          )}
        </div>
        {!f.date && (
          <span style={{ background: "#FEE2E2", color: "#991B1B", padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
            Book now
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", margin: "0 0 4px" }}>Your follow-up plan</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", margin: "0 0 20px" }}>
        Appointments and actions from your care team
      </p>

      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { n: withoutDate.length, label: "Need booking", bg: "#FEE2E2", color: "#991B1B" },
          { n: withDate.length,    label: "Scheduled",    bg: "#FEF3C7", color: "#92400E" },
          { n: warnings.length,    label: "Warning signs", bg: "#DCFCE7", color: "#14532D" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.n}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: s.color, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Need booking */}
      {withoutDate.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
            Action needed — not yet scheduled
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {withoutDate.map((f, i) => <FollowUpCard key={i} f={f} />)}
          </div>
        </div>
      )}

      {/* Scheduled */}
      {withDate.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
            Scheduled
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {withDate.map((f, i) => <FollowUpCard key={i} f={f} />)}
          </div>
        </div>
      )}

      {/* Warning signs */}
      {warnings.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#1E293B", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
            Warning signs — call your doctor if you notice
          </p>
          <div style={{ ...card, padding: "4px 16px" }}>
            {warnings.map((w, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 0",
                borderBottom: i < warnings.length - 1 ? "0.5px solid #F0E8D8" : "none",
              }}>
                <span style={{ color: "#991B1B", fontSize: 14, flexShrink: 0 }}>⚠</span>
                <p style={{ margin: 0, fontSize: 13, color: "#1E293B", lineHeight: 1.5 }}>{w}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {followUps.length === 0 && warnings.length === 0 && (
        <EmptyState message="No follow-ups listed yet." />
      )}
    </div>
  );
}

// ─── ChatTab ──────────────────────────────────────────────────────────────────
const SUGGESTED = [
  "What do I need to do today?",
  "What medications am I on?",
  "When is my next appointment?",
  "What warning signs should I watch for?",
];

function buildAiContext(carePlan) {
  if (!carePlan) return "Patient care plan is being loaded.";
  const meds = (carePlan.medications_schedule || []).map(m => m.name).join(", ");
  const followUps = (carePlan.follow_up_reminders || []).map(f => f.provider_name).join(", ");
  const phases = (carePlan.timeline || []).map(p => `${p.label}: ${p.tasks.length} tasks`).join("; ");
  const warnings = (carePlan.warning_signs || []).slice(0, 3).join("; ");
  return `Patient care plan context: Medications: ${meds || "none listed"}. Follow-up appointments: ${followUps || "none listed"}. Care timeline: ${phases || "not available"}. Warning signs to watch: ${warnings || "none listed"}.`;
}

function ChatTab({ carePlan }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    const userMsg = { role: "user", content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setHasSent(true);
    setLoading(true);

    const aiContext = buildAiContext(carePlan);
    const systemPrompt = `You are CareBridge AI, a warm and compassionate health assistant helping a patient understand their care plan. Speak in simple, plain language. Keep answers to 2–3 short paragraphs. Never diagnose conditions or prescribe treatments. Always encourage the patient to check with their care team for anything serious. ${aiContext}`;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY not configured");
      const contents = updated.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { maxOutputTokens: 500 },
          }),
        }
      );
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, something went wrong: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, input, carePlan]);

  return (
    <div style={{ padding: 20, maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 160px)" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", margin: "0 0 4px" }}>Ask CareBridge</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", margin: "0 0 16px" }}>Ask anything about your care plan, medications, or follow-ups</p>

      <div style={{ ...card, padding: "10px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>Asking about your personal care plan</div>
        <div style={{ fontSize: 11, color: "#7A6B52", marginTop: 2 }}>
          {carePlan
            ? `${carePlan.medications_schedule?.length || 0} medications · ${carePlan.follow_up_reminders?.length || 0} follow-ups`
            : "Loading your care plan…"}
        </div>
      </div>

      {!hasSent && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {SUGGESTED.map(q => (
            <button key={q} onClick={() => sendMessage(q)} style={{
              background: "#E8F0E4", color: "#1B5E3B", border: "0.5px solid #C4B9A0",
              borderRadius: 999, fontSize: 12, fontWeight: 500, padding: "6px 12px", cursor: "pointer",
            }}>{q}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", marginBottom: 16, minHeight: 200 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{
              maxWidth: "70%", padding: "10px 14px", fontSize: 13, lineHeight: 1.5,
              borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
              background: msg.role === "user" ? "#1B5E3B" : "#fff",
              color: msg.role === "user" ? "#fff" : "#1E293B",
              border: msg.role === "user" ? "none" : "0.5px solid #E0D5C0",
              whiteSpace: "pre-wrap",
            }}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1B5E3B", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>AI</span>
            </div>
            <div style={{ ...card, padding: "8px 14px", display: "flex", gap: 5 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#C4B9A0", display: "inline-block" }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
            disabled={loading}
            placeholder="Type your question…"
            style={{
              flex: 1, padding: "10px 14px", background: "#FDF6EC",
              border: "0.5px solid #E0D5C0", borderRadius: 10, fontSize: 13,
              color: "#1E293B", outline: "none",
            }}
          />
          <button
            onClick={() => sendMessage()} disabled={loading || !input.trim()}
            style={{
              width: 40, height: 40, borderRadius: 10, border: "none",
              background: "#1B5E3B", cursor: "pointer", flexShrink: 0,
              opacity: loading || !input.trim() ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12M10 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <p style={{ fontSize: 10, color: "#A39880", textAlign: "center", marginTop: 8 }}>
          CareBridge provides information only — always follow your doctor's advice.
        </p>
      </div>
    </div>
  );
}

// ─── PatientHome ──────────────────────────────────────────────────────────────
export default function PatientHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("careplan");
  const [carePlan, setCarePlan] = useState(null);
  const [carePlanLoading, setCarePlanLoading] = useState(true);
  const [carePlanError, setCarePlanError] = useState(null);

  // Auth check
  useEffect(() => {
    const stored = getUser();
    if (!stored) { navigate("/auth?role=patient"); return; }
    setUser(stored);
  }, [navigate]);

  // Fetch care plan once user is loaded
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const cases = await fetchCases();
        const withPlan = cases.filter(c => c.status === "care_plan_generated");

        if (withPlan.length === 0) {
          setCarePlanError("Your care plan hasn't been generated yet. Please check back soon.");
          return;
        }

        // Match by patient email (exact match against logged-in user's email)
        const userEmail = (user.email || "").toLowerCase();
        const matched = userEmail
          ? withPlan.find(c => c.patient_email?.toLowerCase() === userEmail)
          : null;

        if (!matched) {
          setCarePlanError("No care plan found for your account. Please contact your care facility.");
          return;
        }

        const target = matched;

        const plan = await fetchCarePlan(target.id);
        setCarePlan(plan);
      } catch (err) {
        setCarePlanError("Failed to load your care plan. Please try again later.");
      } finally {
        setCarePlanLoading(false);
      }
    };

    load();
  }, [user]);

  const handleSignOut = () => { clearAuth(); navigate("/"); };

  if (!user) return null;

  const missingFollowUps = carePlan
    ? (carePlan.follow_up_reminders || []).filter(f => !f.date).length
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#FDF6EC" }}>
      <NavBar user={user} onSignOut={handleSignOut} />
      <MainTabs activeTab={activeTab} onTabChange={setActiveTab} missingFollowUps={missingFollowUps} />

      {carePlanError && activeTab !== "chat" && (
        <div style={{ maxWidth: 860, margin: "20px auto", padding: "0 20px" }}>
          <div style={{ background: "#FEF3C7", color: "#92400E", padding: "12px 16px", borderRadius: 10, fontSize: 13 }}>
            {carePlanError}
          </div>
        </div>
      )}

      {activeTab === "careplan"    && <CarePlanTab    carePlan={carePlan} loading={carePlanLoading} />}
      {activeTab === "medications" && <MedicationsTab carePlan={carePlan} loading={carePlanLoading} />}
      {activeTab === "followup"    && <FollowUpTab    carePlan={carePlan} loading={carePlanLoading} />}
      {activeTab === "chat"        && <ChatTab carePlan={carePlan} />}
    </div>
  );
}
