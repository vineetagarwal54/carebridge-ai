import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { createCase, uploadDocument, extractCase } from "../api/cases";

export default function NewCarePlan() {
    const navigate = useNavigate();

    const [patientName, setPatientName] = useState("");
    const [patientEmail, setPatientEmail] = useState("");
    const [age, setAge] = useState("");
    const [sourceHospital, setSourceHospital] = useState("");
    const [dischargeDate, setDischargeDate] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(""); // "creating" | "uploading" | "extracting"
    const [error, setError] = useState(null);

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (file) setSelectedFile(file);
    }

    async function handleGenerate() {
        if (!patientName.trim()) return setError("Please enter patient name.");
        if (!age || isNaN(Number(age))) return setError("Please enter a valid age.");
        if (!sourceHospital.trim()) return setError("Please enter the source hospital.");
        if (!dischargeDate) return setError("Please enter the discharge date.");
        if (!selectedFile) return setError("Please upload a discharge PDF.");

        setError(null);
        setLoading(true);

        try {
            // Step 1: Create the case
            setStep("creating");
            const newCase = await createCase({
                patient_name: patientName.trim(),
                patient_email: patientEmail.trim() || null,
                age: Number(age),
                source_hospital: sourceHospital.trim(),
                discharge_date: dischargeDate,
            });

            // Step 2: Upload the document
            setStep("uploading");
            await uploadDocument(newCase.id, selectedFile);

            // Step 3: Trigger AI extraction
            setStep("extracting");
            await extractCase(newCase.id);

            // Navigate to dashboard — dashboard will fetch from DB
            navigate("/facility/dashboard", {
                state: {
                    patientName: newCase.patient_name,
                    caseId: newCase.id,
                },
            });
        } catch (err) {
            const message =
                err?.response?.data?.detail || err.message || "Something went wrong.";
            setError(message);
        } finally {
            setLoading(false);
            setStep("");
        }
    }

    const stepLabel = {
        creating: "Creating case…",
        uploading: "Uploading document…",
        extracting: "Generating care plan…",
    };

    return (
        <div className="page-shell">
            <div className="container">
                <Navbar />

                <div style={{ marginBottom: "20px" }}>
                    <h1 className="section-title">Create new care plan</h1>
                    <p className="section-subtitle">
                        Upload a discharge summary for a patient to generate a new intake dashboard,
                        care plan, and coordinator chat
                    </p>
                </div>

                {/* Patient details */}
                <div className="card" style={{ padding: "20px", marginBottom: "16px" }}>
                    <h2 style={sectionHeadingStyle}>Patient details</h2>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        <div>
                            <label style={labelStyle}>Patient name</label>
                            <input
                                type="text"
                                value={patientName}
                                onChange={(e) => setPatientName(e.target.value)}
                                placeholder="Enter patient full name"
                                style={inputStyle}
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>Age</label>
                            <input
                                type="number"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder="e.g. 72"
                                min="0"
                                max="150"
                                style={inputStyle}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                        <label style={labelStyle}>
                            Patient email <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional — lets the patient log in and view their plan)</span>
                        </label>
                        <input
                            type="email"
                            value={patientEmail}
                            onChange={(e) => setPatientEmail(e.target.value)}
                            placeholder="patient@example.com"
                            style={inputStyle}
                            disabled={loading}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={labelStyle}>Source hospital</label>
                            <input
                                type="text"
                                value={sourceHospital}
                                onChange={(e) => setSourceHospital(e.target.value)}
                                placeholder="e.g. St. Mary's Medical Center"
                                style={inputStyle}
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>Discharge date</label>
                            <input
                                type="date"
                                value={dischargeDate}
                                onChange={(e) => setDischargeDate(e.target.value)}
                                style={inputStyle}
                                disabled={loading}
                            />
                        </div>
                    </div>
                </div>

                {/* File upload */}
                <div className="card" style={{ padding: "20px", marginBottom: "16px" }}>
                    <h2 style={sectionHeadingStyle}>Upload discharge summary</h2>

                    <div
                        style={{
                            border: "1.5px dashed #C4B9A0",
                            borderRadius: "16px",
                            padding: "32px 20px",
                            textAlign: "center",
                            background: "#FFFDF8",
                        }}
                    >
                        <p style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 500, color: "var(--text-primary)" }}>
                            Upload PDF for this patient
                        </p>
                        <p style={{ margin: "0 0 14px", fontSize: "12px", color: "var(--text-muted)" }}>
                            PDF, JPG, PNG up to 20 MB
                        </p>

                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                            disabled={loading}
                        />

                        {selectedFile && (
                            <p style={{ marginTop: "12px", fontSize: "12px", color: "var(--primary)", fontWeight: 500 }}>
                                Selected: {selectedFile.name}
                            </p>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div
                        className="card"
                        style={{
                            padding: "14px 16px",
                            marginBottom: "16px",
                            background: "var(--status-critical-bg)",
                            border: "0.5px solid var(--status-critical-text)",
                        }}
                    >
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--status-critical-text)" }}>
                            {error}
                        </p>
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px" }}>
                    {loading && step && (
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                            {stepLabel[step]}
                        </p>
                    )}
                    <button className="primary-btn" onClick={handleGenerate} disabled={loading}>
                        {loading ? "Processing…" : "Generate care plan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const sectionHeadingStyle = {
    margin: "0 0 14px",
    fontSize: "16px",
    fontWeight: 500,
    color: "var(--text-primary)",
};

const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-primary)",
};

const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "0.5px solid var(--border)",
    borderRadius: "12px",
    background: "var(--bg-white)",
    color: "var(--text-primary)",
    outline: "none",
    fontSize: "14px",
    boxSizing: "border-box",
};