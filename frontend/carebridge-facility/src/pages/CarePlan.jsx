import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import { generateCarePlan, fetchCarePlan } from "../api/cases";

const PRIORITY_COLOR = { critical: "#DC2626", high: "#DC2626", medium: "#D97706", low: "#2563EB" };
const PRIORITY_BG    = { critical: "#FEE2E2", high: "#FEE2E2", medium: "#FEF3C7", low: "#DBEAFE" };

function priorityColor(p = "low") { return PRIORITY_COLOR[p.toLowerCase()] || "#2563EB"; }
function priorityBg(p = "low")    { return PRIORITY_BG[p.toLowerCase()]    || "#DBEAFE"; }

function SectionTitle({ children }) {
    return (
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            {children}
        </h2>
    );
}

function TaskCard({ task }) {
    const [checked, setChecked] = useState(false);
    const [note, setNote] = useState(task.details || "");
    const color = priorityColor(task.priority);
    const bg    = priorityBg(task.priority);

    return (
        <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden", opacity: checked ? 0.6 : 1 }}>
            <div style={{ display: "flex" }}>
                <div style={{ width: 5, background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <button
                        onClick={() => setChecked(c => !c)}
                        style={{
                            width: 18, height: 18, borderRadius: 4, marginTop: 2, flexShrink: 0,
                            border: checked ? `1.5px solid var(--primary)` : "1.5px solid #C4B9A0",
                            background: checked ? "var(--primary)" : "white",
                            color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                        }}
                    >{checked ? "✓" : ""}</button>

                    <div style={{ flex: 1 }}>
                        <p style={{
                            margin: "0 0 6px", fontSize: 13, lineHeight: 1.5,
                            color: checked ? "var(--text-faint)" : "var(--text-primary)",
                            textDecoration: checked ? "line-through" : "none",
                        }}>{task.task}</p>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: note ? 8 : 0 }}>
                            <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 500, background: bg, color }}>
                                {task.priority}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{task.category}</span>
                        </div>

                        {task.details && (
                            <div style={{ marginTop: 6, background: "var(--bg-surface)", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                                📝 {task.details}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MedCard({ med }) {
    return (
        <div className="card" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{med.name}</p>
                    <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)" }}>
                        {[med.route, med.frequency].filter(Boolean).join(" · ")}
                    </p>
                    {med.special_instructions && (
                        <p style={{ margin: 0, fontSize: 11, color: "var(--status-attention-text)", fontWeight: 500 }}>
                            ⚠ {med.special_instructions}
                        </p>
                    )}
                </div>
                <span style={{ background: "var(--primary-light)", color: "var(--primary)", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {med.dose}
                </span>
            </div>
        </div>
    );
}

function FollowUpCard({ f }) {
    return (
        <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{
                width: 36, height: 36, borderRadius: 10, background: "var(--status-normal-bg)",
                color: "var(--status-normal-text)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
            }}>📅</div>
            <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {f.provider_name || "Follow-up appointment"}
                </p>
                {f.specialty && <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)" }}>{f.specialty}</p>}
                {(f.date || f.time) && (
                    <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--primary)", fontWeight: 500 }}>
                        {[f.date, f.time].filter(Boolean).join(" at ")}
                    </p>
                )}
                {f.reason && <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>{f.reason}</p>}
            </div>
        </div>
    );
}

export default function CarePlan() {
    const location = useLocation();
    const caseId = location.state?.caseId;

    const [carePlan, setCarePlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => {
        if (!caseId) { setError("No case ID provided."); setLoading(false); return; }

        // Try to fetch existing, generate if not yet done
        fetchCarePlan(caseId)
            .then(setCarePlan)
            .catch(() => generateCarePlan(caseId).then(setCarePlan))
            .catch(err => setError(err?.response?.data?.detail || "Failed to generate care plan."))
            .finally(() => setLoading(false));
    }, [caseId]);

    const totalTasks = carePlan
        ? (carePlan.timeline?.flatMap(b => b.tasks).length || 0) + (carePlan.monitoring_tasks?.length || 0)
        : 0;
    const [checkedCount] = useState(0);
    const progressPct = totalTasks === 0 ? 0 : Math.round((checkedCount / totalTasks) * 100);

    const tabs = carePlan?.timeline?.map(b => b.label) || [];
    const allTabs = [...tabs, ...(carePlan?.monitoring_tasks?.length ? ["Monitoring"] : [])];

    function handleExport() { window.print(); }

    if (loading) {
        return (
            <div className="page-shell"><div className="container"><Navbar />
                <div className="card" style={{ padding: 48, textAlign: "center", marginTop: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>⚙️</div>
                    <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>
                        Generating care plan…
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                        Our AI is building a personalised intake checklist. This takes a few seconds.
                    </p>
                </div>
            </div></div>
        );
    }

    if (error) {
        return (
            <div className="page-shell"><div className="container"><Navbar />
                <div className="card" style={{ padding: 24, marginTop: 20, background: "var(--status-critical-bg)" }}>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--status-critical-text)" }}>{error}</p>
                </div>
            </div></div>
        );
    }

    const currentBucket = activeTab < tabs.length
        ? carePlan.timeline[activeTab]
        : null;
    const currentTasks = currentBucket
        ? currentBucket.tasks
        : carePlan?.monitoring_tasks || [];

    const tasksByPriority = (tasks) => ({
        critical: tasks.filter(t => ["critical", "high"].includes(t.priority?.toLowerCase())),
        medium:   tasks.filter(t => t.priority?.toLowerCase() === "medium"),
        low:      tasks.filter(t => !["critical", "high", "medium"].includes(t.priority?.toLowerCase())),
    });

    const groups = tasksByPriority(currentTasks);

    function TaskGroup({ label, tasks, color }) {
        if (!tasks.length) return null;
        return (
            <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid var(--border-light)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>{label}</p>
                </div>
                {tasks.map((t, i) => <TaskCard key={i} task={t} />)}
            </div>
        );
    }

    return (
        <div className="page-shell">
            <div className="container">
                <Navbar />

                {/* Header */}
                <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h1 className="section-title">Intake care plan</h1>
                        <p className="section-subtitle">AI-generated checklist for facility staff — {totalTasks} tasks across {allTabs.length} phases</p>
                    </div>
                    <div style={{ minWidth: 220 }}>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-muted)" }}>
                            {checkedCount} of {totalTasks} tasks done
                        </p>
                        <div style={{ height: 8, background: "var(--border-light)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ width: `${progressPct}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s" }} />
                        </div>
                    </div>
                </div>

                {/* Summary stats */}
                <div className="grid-4" style={{ marginBottom: 20 }}>
                    {[
                        { n: carePlan?.timeline?.flatMap(b => b.tasks).length || 0, label: "Care tasks", color: "var(--text-primary)" },
                        { n: carePlan?.medications_schedule?.length || 0, label: "Medications", color: "var(--status-normal-text)" },
                        { n: carePlan?.follow_up_reminders?.length || 0, label: "Follow-ups", color: "var(--primary)" },
                        { n: carePlan?.warning_signs?.length || 0, label: "Warning signs", color: "var(--status-critical-text)" },
                    ].map(s => (
                        <div key={s.label} className="card" style={{ padding: 14, textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: s.color }}>{s.n}</p>
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Timeline tabs */}
                {allTabs.length > 0 && (
                    <div className="card" style={{ padding: 16, marginBottom: 18 }}>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${allTabs.length}, minmax(0, 1fr))`, gap: 8 }}>
                            {allTabs.map((label, i) => {
                                const active = activeTab === i;
                                const bucket = i < tabs.length ? carePlan.timeline[i] : null;
                                const count = bucket ? bucket.tasks.length : (carePlan?.monitoring_tasks?.length || 0);
                                return (
                                    <button key={i} onClick={() => setActiveTab(i)} style={{
                                        border: active ? "0.5px solid var(--primary)" : "0.5px solid var(--border)",
                                        background: active ? "#F6FAF6" : "var(--bg-white)",
                                        borderRadius: 12, padding: "12px 10px", textAlign: "center", cursor: "pointer",
                                    }}>
                                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{label}</p>
                                        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: active ? "var(--status-attention-text)" : "var(--text-muted)" }}>
                                            {count} task{count !== 1 ? "s" : ""}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Tasks */}
                <div style={{ marginBottom: 24 }}>
                    <TaskGroup label="Critical — do first" tasks={groups.critical} color="#DC2626" />
                    <TaskGroup label="Medium priority" tasks={groups.medium}   color="#D97706" />
                    <TaskGroup label="Routine"          tasks={groups.low}     color="#2563EB" />
                    {currentTasks.length === 0 && (
                        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>No tasks for this phase.</p>
                    )}
                </div>

                {/* Medications schedule */}
                {carePlan?.medications_schedule?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <SectionTitle>Medication schedule</SectionTitle>
                        <div style={{ display: "grid", gap: 10 }}>
                            {carePlan.medications_schedule.map((med, i) => <MedCard key={i} med={med} />)}
                        </div>
                    </div>
                )}

                {/* Follow-up reminders */}
                {carePlan?.follow_up_reminders?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <SectionTitle>Follow-up reminders</SectionTitle>
                        <div style={{ display: "grid", gap: 10 }}>
                            {carePlan.follow_up_reminders.map((f, i) => <FollowUpCard key={i} f={f} />)}
                        </div>
                    </div>
                )}

                {/* Warning signs */}
                {carePlan?.warning_signs?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <SectionTitle>Warning signs to watch</SectionTitle>
                        <div className="card" style={{ padding: "4px 16px" }}>
                            {carePlan.warning_signs.map((w, i) => (
                                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: i < carePlan.warning_signs.length - 1 ? "0.5px solid var(--border-light)" : "none" }}>
                                    <span style={{ color: "var(--status-critical-text)", fontSize: 14, marginTop: 1, flexShrink: 0 }}>⚠</span>
                                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-body)", lineHeight: 1.5 }}>{w}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Export */}
                <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
                    <button className="primary-btn" onClick={handleExport} style={{ padding: "12px 32px", fontSize: 14 }}>
                        Export care plan
                    </button>
                </div>
            </div>
        </div>
    );
}
