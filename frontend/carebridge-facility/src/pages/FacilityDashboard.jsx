import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import AgentPanel from "../components/AgentPanel";
import { getCase } from "../api/cases";

// ── helpers ──────────────────────────────────────────────────────────────────

function severityBadge(severity = "medium") {
    const s = severity.toLowerCase();
    if (s === "critical" || s === "high")
        return { bg: "var(--status-critical-bg)", color: "var(--status-critical-text)", label: severity };
    if (s === "medium")
        return { bg: "var(--status-attention-bg)", color: "var(--status-attention-text)", label: severity };
    return { bg: "var(--status-normal-bg)", color: "var(--status-normal-text)", label: severity };
}

function timeFrameLabel(tf) {
    if (!tf) return "Ongoing";
    const map = { first_24h: "First 24 h", "24_to_72h": "24–72 h", day_3_to_7: "Day 3–7" };
    return map[tf] || tf;
}

function confidenceColor(v) {
    if (v >= 0.7) return "var(--status-normal-text)";
    if (v >= 0.4) return "var(--status-attention-text)";
    return "var(--status-critical-text)";
}

function Pill({ children, bg, color }) {
    return (
        <span style={{
            background: bg, color, padding: "4px 10px",
            borderRadius: "999px", fontSize: "11px", fontWeight: 500,
        }}>
            {children}
        </span>
    );
}

function Divider({ index, total }) {
    return index < total - 1
        ? <div style={{ borderBottom: "0.5px solid var(--border-light)" }} />
        : null;
}

// ── section components ───────────────────────────────────────────────────────

function MedicationsList({ medications }) {
    if (!medications?.length)
        return <p style={emptyStyle}>No medications extracted.</p>;
    return (
        <div>
            {medications.map((med, i) => (
                <div key={i}>
                    <div style={{ padding: "10px 0", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                            background: med.confidence >= 0.7 ? "var(--primary)" : "var(--status-attention-text)",
                        }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                                {med.name}{med.dose ? ` ${med.dose}` : ""}
                            </p>
                            <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)" }}>
                                {[med.route, med.frequency].filter(Boolean).join(" · ")}
                            </p>
                            {med.purpose && (
                                <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>{med.purpose}</p>
                            )}
                        </div>
                        <Pill bg="var(--bg-surface)" color="var(--text-muted)">
                            {Math.round(med.confidence * 100)}%
                        </Pill>
                    </div>
                    <Divider index={i} total={medications.length} />
                </div>
            ))}
        </div>
    );
}

function FollowUpsList({ followUps }) {
    if (!followUps?.length)
        return <p style={emptyStyle}>No follow-ups extracted.</p>;
    return (
        <div>
            {followUps.map((f, i) => (
                <div key={i}>
                    <div style={{ padding: "10px 0" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                            {f.provider_name || f.specialty || "Follow-up appointment"}
                        </p>
                        {f.specialty && f.provider_name && (
                            <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)" }}>{f.specialty}</p>
                        )}
                        {(f.appointment_date || f.appointment_time) && (
                            <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)" }}>
                                {[f.appointment_date, f.appointment_time].filter(Boolean).join(" at ")}
                            </p>
                        )}
                        {f.reason && (
                            <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>{f.reason}</p>
                        )}
                    </div>
                    <Divider index={i} total={followUps.length} />
                </div>
            ))}
        </div>
    );
}

function RisksList({ risks }) {
    if (!risks?.length)
        return <p style={emptyStyle}>No risks identified.</p>;
    return (
        <div>
            {risks.map((r, i) => {
                const badge = severityBadge(r.severity);
                return (
                    <div key={i}>
                        <div style={{ padding: "10px 0", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                                        {r.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                    </p>
                                    <Pill bg={badge.bg} color={badge.color}>{badge.label}</Pill>
                                </div>
                                <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>
                                    {r.description}
                                </p>
                                {r.action_needed && (
                                    <p style={{ margin: 0, fontSize: 11, color: "var(--primary)", fontWeight: 500 }}>
                                        Action: {r.action_needed}
                                    </p>
                                )}
                            </div>
                        </div>
                        <Divider index={i} total={risks.length} />
                    </div>
                );
            })}
        </div>
    );
}

function CareTasksList({ careTasks }) {
    if (!careTasks?.length)
        return <p style={emptyStyle}>No care tasks extracted.</p>;

    const groups = careTasks.reduce((acc, t) => {
        const key = t.time_frame || "ongoing";
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
    }, {});

    return (
        <div style={{ display: "grid", gap: 12 }}>
            {Object.entries(groups).map(([tf, tasks]) => (
                <div key={tf}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {timeFrameLabel(tf)}
                    </p>
                    {tasks.map((t, i) => {
                        const badge = severityBadge(t.priority);
                        return (
                            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0" }}>
                                <div style={{
                                    width: 14, height: 14, border: "1px solid var(--text-faint)",
                                    borderRadius: 3, marginTop: 3, flexShrink: 0,
                                }} />
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>
                                        {t.task}
                                    </p>
                                    <p style={{ margin: 0, fontSize: 10, color: "var(--text-faint)" }}>
                                        {t.category}
                                    </p>
                                </div>
                                <Pill bg={badge.bg} color={badge.color}>{t.priority}</Pill>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function WarningSignsList({ warningSigns }) {
    if (!warningSigns?.length)
        return <p style={emptyStyle}>No warning signs noted.</p>;
    return (
        <div>
            {warningSigns.map((w, i) => (
                <div key={i}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
                        <span style={{ color: "var(--status-critical-text)", fontSize: 14, marginTop: 1 }}>⚠</span>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text-body)", lineHeight: 1.5 }}>{w}</p>
                    </div>
                    <Divider index={i} total={warningSigns.length} />
                </div>
            ))}
        </div>
    );
}

function MissingInfoList({ missingInfo }) {
    if (!missingInfo?.length)
        return <p style={emptyStyle}>No missing information flagged.</p>;
    return (
        <div>
            {missingInfo.map((m, i) => {
                const badge = severityBadge(m.severity);
                return (
                    <div key={i}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0" }}>
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                                    {m.field_name}
                                </p>
                                <p style={{ margin: 0, fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>
                                    {m.reason}
                                </p>
                            </div>
                            <Pill bg={badge.bg} color={badge.color}>{badge.label}</Pill>
                        </div>
                        <Divider index={i} total={missingInfo.length} />
                    </div>
                );
            })}
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function FacilityDashboard() {
    const location = useLocation();
    const caseId = location.state?.caseId;

    const [extraction, setExtraction] = useState(null);
    const [loading, setLoading] = useState(!!caseId);
    const [error, setError] = useState(null);

    // Always fetch from DB — never rely on in-memory router state
    useEffect(() => {
        if (!caseId) {
            setError("No case ID provided.");
            setLoading(false);
            return;
        }
        getCase(caseId)
            .then((data) => {
                if (data.extraction_data) {
                    setExtraction(data.extraction_data);
                } else {
                    setError("This case has not been extracted yet.");
                }
            })
            .catch((err) => setError(err.message || "Failed to load case data."))
            .finally(() => setLoading(false));
    }, [caseId]);

    const patientName = extraction?.patient_name || location.state?.patientName || "Patient";
    const initials = patientName.split(" ").map(p => p[0]).slice(0, 2).join("");
    const confidence = extraction?.overall_confidence ?? null;
    const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

    if (loading) {
        return (
            <div className="page-shell">
                <div className="container">
                    <Navbar />
                    <div className="card" style={{ padding: "40px", textAlign: "center", marginTop: 20 }}>
                        <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>Loading case data…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-shell">
                <div className="container">
                    <Navbar />
                    <div className="card" style={{ padding: "24px", marginTop: 20, background: "var(--status-critical-bg)" }}>
                        <p style={{ margin: 0, fontSize: 14, color: "var(--status-critical-text)" }}>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-shell">
            <div className="container">
                <Navbar />

                <div style={{ marginBottom: 20 }}>
                    <h1 className="section-title">Facility intake dashboard</h1>
                    <p className="section-subtitle">Command center for care coordinators receiving a new patient</p>
                </div>

                {/* Patient header + confidence score */}
                <div className="grid-2" style={{ marginBottom: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: "50%",
                                background: "var(--primary-light)", color: "var(--primary)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 500, flexShrink: 0, fontSize: 16,
                            }}>
                                {initials}
                            </div>
                            <div style={{ flex: 1 }}>
                                <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
                                    {patientName}
                                </h2>

                                {/* Allergies */}
                                {extraction?.allergies?.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                                        {extraction.allergies.map((a, i) => (
                                            <Pill key={i} bg="var(--status-critical-bg)" color="var(--status-critical-text)">
                                                Allergy: {a}
                                            </Pill>
                                        ))}
                                    </div>
                                )}

                                {/* Clinical summary preview */}
                                {extraction?.clinical_summary && (
                                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                                        {extraction.clinical_summary.length > 180
                                            ? extraction.clinical_summary.slice(0, 180) + "…"
                                            : extraction.clinical_summary}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Confidence score */}
                    <div className="card" style={{
                        padding: 16, textAlign: "center",
                        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                    }}>
                        <div style={{
                            width: 76, height: 76, borderRadius: "50%",
                            border: `5px solid ${confidencePct !== null ? confidenceColor(confidence) : "var(--border)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8,
                        }}>
                            <span style={{ fontSize: 22, fontWeight: 500, color: confidencePct !== null ? confidenceColor(confidence) : "var(--text-muted)" }}>
                                {confidencePct !== null ? `${confidencePct}%` : "—"}
                            </span>
                        </div>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-muted)" }}>Extraction confidence</p>
                        <Pill
                            bg={confidencePct === null ? "var(--bg-surface)" : confidencePct >= 70 ? "var(--status-normal-bg)" : confidencePct >= 40 ? "var(--status-attention-bg)" : "var(--status-critical-bg)"}
                            color={confidencePct === null ? "var(--text-muted)" : confidencePct >= 70 ? "var(--status-normal-text)" : confidencePct >= 40 ? "var(--status-attention-text)" : "var(--status-critical-text)"}
                        >
                            {confidencePct === null ? "Pending" : confidencePct >= 70 ? "High" : confidencePct >= 40 ? "Moderate" : "Low"}
                        </Pill>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid-4" style={{ marginBottom: 20 }}>
                    {[
                        { value: extraction?.medications?.length ?? 0, label: "Medications", color: "var(--text-primary)" },
                        { value: extraction?.risks?.length ?? 0, label: "Risks identified", color: "var(--status-critical-text)" },
                        { value: extraction?.follow_ups?.length ?? 0, label: "Follow-ups", color: "var(--status-normal-text)" },
                        { value: extraction?.missing_information?.length ?? 0, label: "Missing items", color: "var(--status-attention-text)" },
                    ].map(({ value, label, color }) => (
                        <div key={label} className="card" style={{ padding: 14, textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color }}>{value}</p>
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{label}</p>
                        </div>
                    ))}
                </div>

                {/* Collapsible sections */}
                <AgentPanel number="1" title="Clinical summary" badgeType="safe" badgeText="Summary" defaultOpen={true}>
                    {extraction?.clinical_summary
                        ? <p style={{ margin: 0, fontSize: 13, color: "var(--text-body)", lineHeight: 1.7 }}>{extraction.clinical_summary}</p>
                        : <p style={emptyStyle}>No clinical summary available.</p>
                    }
                </AgentPanel>

                <AgentPanel
                    number="2"
                    title="Medications"
                    badgeType={extraction?.medications?.length ? "attention" : "safe"}
                    badgeText={`${extraction?.medications?.length ?? 0} medications`}
                    defaultOpen={true}
                >
                    <MedicationsList medications={extraction?.medications} />
                </AgentPanel>

                <AgentPanel
                    number="3"
                    title="Follow-ups"
                    badgeType={extraction?.follow_ups?.length ? "attention" : "safe"}
                    badgeText={`${extraction?.follow_ups?.length ?? 0} scheduled`}
                >
                    <FollowUpsList followUps={extraction?.follow_ups} />
                </AgentPanel>

                <AgentPanel
                    number="4"
                    title="Risks"
                    badgeType={extraction?.risks?.some(r => ["critical","high"].includes(r.severity?.toLowerCase())) ? "critical" : extraction?.risks?.length ? "attention" : "safe"}
                    badgeText={`${extraction?.risks?.length ?? 0} identified`}
                >
                    <RisksList risks={extraction?.risks} />
                </AgentPanel>

                <AgentPanel
                    number="5"
                    title="Care tasks"
                    badgeType={extraction?.care_tasks?.length ? "attention" : "safe"}
                    badgeText={`${extraction?.care_tasks?.length ?? 0} tasks`}
                >
                    <CareTasksList careTasks={extraction?.care_tasks} />
                </AgentPanel>

                <AgentPanel
                    number="6"
                    title="Warning signs"
                    badgeType={extraction?.warning_signs?.length ? "critical" : "safe"}
                    badgeText={`${extraction?.warning_signs?.length ?? 0} signs`}
                >
                    <WarningSignsList warningSigns={extraction?.warning_signs} />
                </AgentPanel>

                <AgentPanel
                    number="7"
                    title="Missing information"
                    badgeType={extraction?.missing_information?.length ? "attention" : "safe"}
                    badgeText={`${extraction?.missing_information?.length ?? 0} gaps`}
                >
                    <MissingInfoList missingInfo={extraction?.missing_information} />
                </AgentPanel>
            </div>
        </div>
    );
}

const emptyStyle = {
    margin: 0,
    fontSize: 13,
    color: "var(--text-faint)",
    fontStyle: "italic",
};