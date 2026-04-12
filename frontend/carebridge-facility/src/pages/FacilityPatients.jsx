import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { fetchCases } from "../api/cases";

function riskLabel(score) {
    if (score === null || score === undefined) return "Unknown";
    if (score >= 0.7) return "Low";
    if (score >= 0.4) return "Moderate";
    return "High";
}

function riskStyle(risk) {
    if (risk === "High") {
        return {
            background: "var(--status-critical-bg)",
            color: "var(--status-critical-text)",
        };
    }
    if (risk === "Moderate") {
        return {
            background: "var(--status-attention-bg)",
            color: "var(--status-attention-text)",
        };
    }
    if (risk === "Low") {
        return {
            background: "var(--status-normal-bg)",
            color: "var(--status-normal-text)",
        };
    }
    return { background: "var(--bg-subtle)", color: "var(--text-muted)" };
}

function formatStatus(status) {
    return status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (diff < 60) return "Updated just now";
    if (diff < 3600) return `Updated ${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `Updated ${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? "s" : ""} ago`;
    return `Updated ${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? "s" : ""} ago`;
}

export default function FacilityPatients() {
    const navigate = useNavigate();
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchCases()
            .then((data) => setCases(data))
            .catch((err) => setError(err.message || "Failed to load patients"))
            .finally(() => setLoading(false));
    }, []);

    function openPatient(c) {
        navigate("/facility/dashboard", {
            state: {
                patientName: c.patient_name,
                caseId: c.id,
            },
        });
    }

    const filteredCases = useMemo(() => {
        const value = searchTerm.trim().toLowerCase();
        if (!value) return cases;
        return cases.filter((c) =>
            c.patient_name.toLowerCase().includes(value) ||
            c.status.toLowerCase().includes(value)
        );
    }, [searchTerm, cases]);

    return (
        <div className="page-shell">
            <div className="container">
                <Navbar />

                <div
                    style={{
                        marginBottom: "20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: "16px",
                        flexWrap: "wrap",
                    }}
                >
                    <div>
                        <h1 className="section-title">Patients</h1>
                        <p className="section-subtitle">
                            View existing care plans or upload a new discharge PDF to create one
                        </p>
                    </div>

                    <Link to="/facility/new-plan">
                        <button className="primary-btn">+ New care plan</button>
                    </Link>
                </div>

                <div
                    className="card"
                    style={{ padding: "16px", marginBottom: "16px" }}
                >
                    <label
                        style={{
                            display: "block",
                            marginBottom: "8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                        }}
                    >
                        Search existing patients
                    </label>

                    <input
                        type="text"
                        placeholder="Search by patient name or status"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "12px 14px",
                            border: "0.5px solid var(--border)",
                            borderRadius: "12px",
                            background: "var(--bg-white)",
                            color: "var(--text-primary)",
                            outline: "none",
                            fontSize: "14px",
                        }}
                    />

                    {!loading && !error && (
                        <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                            {filteredCases.length} patient{filteredCases.length !== 1 ? "s" : ""} found
                        </p>
                    )}
                </div>

                {loading && (
                    <div className="card" style={{ padding: "20px", textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>
                            Loading patients…
                        </p>
                    </div>
                )}

                {error && (
                    <div className="card" style={{ padding: "20px", textAlign: "center" }}>
                        <p style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 500, color: "var(--status-critical-text)" }}>
                            Could not load patients
                        </p>
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{error}</p>
                    </div>
                )}

                {!loading && !error && (
                    <div style={{ display: "grid", gap: "14px" }}>
                        {filteredCases.length > 0 ? (
                            filteredCases.map((c) => {
                                const risk = riskLabel(c.risk_score);
                                const badge = riskStyle(risk);

                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => openPatient(c)}
                                        className="card"
                                        style={{
                                            padding: "18px",
                                            textAlign: "left",
                                            border: "0.5px solid var(--border)",
                                            background: "var(--bg-white)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "flex-start",
                                                gap: "12px",
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div>
                                                <h2
                                                    style={{
                                                        margin: "0 0 4px",
                                                        fontSize: "17px",
                                                        fontWeight: 500,
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {c.patient_name}
                                                </h2>

                                                <p
                                                    style={{
                                                        margin: "0 0 4px",
                                                        fontSize: "13px",
                                                        color: "var(--text-body)",
                                                    }}
                                                >
                                                    {formatStatus(c.status)}
                                                </p>

                                                <p
                                                    style={{
                                                        margin: 0,
                                                        fontSize: "11px",
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {timeAgo(c.updated_at)}
                                                </p>
                                            </div>

                                            <span
                                                style={{
                                                    padding: "5px 10px",
                                                    borderRadius: "999px",
                                                    fontSize: "11px",
                                                    fontWeight: 500,
                                                    ...badge,
                                                }}
                                            >
                                                {risk} risk
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="card" style={{ padding: "20px", textAlign: "center" }}>
                                <p
                                    style={{
                                        margin: "0 0 6px",
                                        fontSize: "15px",
                                        fontWeight: 500,
                                        color: "var(--text-primary)",
                                    }}
                                >
                                    No patients found
                                </p>
                                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                                    Try searching with a different patient name or status.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}