import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, getUser } from "../utils/authStorage";
import logo from "../assets/icon.png";

// ─── Patient Data (demo) ──────────────────────────────────────────────────────
const carePlans = [
  {
    id: "hf", status: "active", condition: "Heart failure",
    hospital: "Mercy General Hospital", department: "Cardiology",
    doctor: "Dr. Anita Patel, MD", admitted: "March 14, 2024",
    discharged: "March 19, 2024", duration: "5 nights",
    care_facility: "Sunrise Gardens Senior Living",
    follow_up_dots: ["missing", "missing", "pending"],
    medications: [
      { name: "Furosemide (Lasix)", purpose: "Removes excess fluid from your body", dose: "40mg", frequency: "Once daily in the morning", tag: "new" },
      { name: "Spironolactone", purpose: "Helps heart and balances fluid", dose: "25mg", frequency: "Once daily", tag: "new" },
      { name: "Metoprolol succinate", purpose: "Slows and steadies your heartbeat", dose: "50mg", frequency: "Once daily", tag: "changed", note: "Dose increased from 25mg" },
      { name: "Lisinopril", purpose: "Relaxes blood vessels, eases heart workload", dose: "10mg", frequency: "Once daily", tag: "continuing" },
      { name: "Atorvastatin", purpose: "Lowers your cholesterol", dose: "40mg", frequency: "Every night", tag: "continuing" },
      { name: "Metformin", purpose: "Controls your blood sugar", dose: "500mg", frequency: "Twice daily with meals", tag: "continuing" },
      { name: "Aspirin", purpose: "Protects your heart", dose: "81mg", frequency: "Once daily", tag: "continuing" },
    ],
    followups: [
      { type: "Cardiology appointment (Dr. Patel)", source: "Heart failure · Mercy General", timeframe: "Must be seen within 7 days (due Mar 26)", status: "missing", action: "Call to book" },
      { type: "Potassium blood test", source: "Heart failure · No lab order at discharge", timeframe: "Within 5–7 days — needed due to new medications", status: "missing", action: "Ask care team" },
      { type: "Urine culture result", source: "Heart failure · Collected March 18", timeframe: "Expected from Mercy General lab", status: "pending", action: "Check result" },
    ],
  },
  {
    id: "dm", status: "active", condition: "Type 2 diabetes",
    hospital: "Riverside Medical Clinic", department: "Endocrinology",
    doctor: "Dr. Susan Chen, MD", admitted: "January 2023 (ongoing)",
    discharged: null, duration: "Ongoing management", care_facility: null,
    follow_up_dots: ["done", "pending"],
    medications: [
      { name: "Metformin", purpose: "Controls your blood sugar", dose: "500mg", frequency: "Twice daily with meals", tag: "continuing" },
      { name: "Atorvastatin", purpose: "Lowers your cholesterol", dose: "40mg", frequency: "Every night", tag: "continuing" },
      { name: "Aspirin", purpose: "Protects your heart", dose: "81mg", frequency: "Once daily", tag: "continuing" },
    ],
    followups: [
      { type: "HbA1c blood test", source: "Type 2 diabetes · Riverside Clinic", timeframe: "Completed Feb 12, 2024", status: "done" },
      { type: "Endocrinology 3-month review", source: "Type 2 diabetes · Dr. Susan Chen", timeframe: "Scheduled: May 2024", status: "pending" },
    ],
  },
  {
    id: "hip", status: "meds_continue", condition: "Hip fracture (right)",
    hospital: "St. Augustine Orthopedic Center", department: "Orthopedic Surgery",
    doctor: "Dr. James Okafor, MD", admitted: "November 10, 2023",
    discharged: "November 16, 2023", duration: "6 nights",
    care_facility: "Cedar Brook Manor SNF",
    follow_up_dots: ["done", "done", "done"],
    medications: [
      { name: "Calcium + Vitamin D3", purpose: "Strengthens your bones", dose: "600mg/400IU", frequency: "Twice daily with meals", tag: "still_active" },
      { name: "Enoxaparin", purpose: "Prevented blood clots after surgery", dose: "40mg", frequency: "Course completed November 2023", tag: "stopped" },
    ],
    followups: [
      { type: "Surgical wound check", source: "Hip fracture · Dr. Okafor", timeframe: "Completed November 30, 2023", status: "done" },
      { type: "Orthopedic X-ray review", source: "Hip fracture", timeframe: "Completed December 15, 2023", status: "done" },
      { type: "Physical therapy sign-off", source: "Hip fracture · Gait and mobility clearance", timeframe: "Completed January 10, 2024", status: "done" },
    ],
  },
  {
    id: "uti", status: "inactive", condition: "Urinary tract infection",
    hospital: "Oakwood Medical Center", department: "Geriatric Medicine",
    doctor: "Dr. Patricia Huang, MD", admitted: "March 13, 2023",
    discharged: "March 18, 2023", duration: "5 nights", care_facility: null,
    follow_up_dots: ["done", "done"],
    medications: [
      { name: "TMP-SMX DS (Bactrim)", purpose: "Antibiotic that treated the UTI", dose: "1 tablet", frequency: "Course fully completed March 2023", tag: "stopped" },
    ],
    followups: [
      { type: "Urine culture repeat", source: "UTI · Confirmed infection cleared", timeframe: "Completed March 30, 2023", status: "done" },
      { type: "PCP post-discharge check-in", source: "UTI · General recovery review", timeframe: "Completed April 2, 2023", status: "done" },
    ],
  },
];

const activePlans = carePlans.filter(p => p.status === "active");
const pastPlans = carePlans.filter(p => p.status !== "active");
const missingFollowUpCount = activePlans
  .flatMap(p => p.followups)
  .filter(f => f.status === "missing").length;

// ─── Shared Styles ────────────────────────────────────────────────────────────
const card = {
  background: "#fff", border: "0.5px solid #E0D5C0",
  borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const TAG_STYLES = {
  new:        { background: "#DCFCE7", color: "#14532D" },
  changed:    { background: "#FEF3C7", color: "#92400E" },
  continuing: { background: "#F1F5F9", color: "#475569" },
  still_active:{ background: "#DBEAFE", color: "#1E40AF" },
  stopped:    { background: "#FEE2E2", color: "#991B1B" },
};

const STATUS_BADGE = {
  active:        { label: "Active",          bg: "#DCFCE7", color: "#14532D" },
  meds_continue: { label: "Meds continuing", bg: "#DBEAFE", color: "#1E40AF" },
  inactive:      { label: "Completed",       bg: "#F1F5F9", color: "#475569" },
};

const DOT_COLORS = { done: "#86EFAC", pending: "#FDE68A", missing: "#FCA5A5" };

const FOLLOW_COLORS = {
  missing: { bg: "#FEE2E2", icon: "#991B1B", text: "#991B1B" },
  pending: { bg: "#FEF3C7", icon: "#92400E", text: "#92400E" },
  done:    { bg: "#DBEAFE", icon: "#1E40AF", text: "#14532D" },
};

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ user, onSignOut }) {
  const displayName = user?.full_name || user?.name || "Patient";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "#fff", borderBottom: "1px solid #E0D5C0",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src={logo} alt="CareBridge" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
        <span style={{ fontWeight: 600, fontSize: 16, color: "#1B5E3B" }}>CareBridge</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>{displayName}</span>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#E8F0E4", color: "#1B5E3B",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 12,
        }}>{initials}</div>
        <button
          onClick={onSignOut}
          style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            border: "0.5px solid #E0D5C0", color: "#5C4A2E", background: "transparent",
          }}
        >Sign out</button>
      </div>
    </nav>
  );
}

// ─── MainTabs ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "careplans",  label: "My care plans" },
  { id: "medications",label: "My medications" },
  { id: "followup",   label: "Follow-up plan", badge: missingFollowUpCount },
  { id: "chat",       label: "Ask CareBridge" },
];

function MainTabs({ activeTab, onTabChange }) {
  return (
    <div style={{
      background: "#fff", position: "sticky", top: 57, zIndex: 40,
      borderBottom: "1px solid #E0D5C0", display: "flex", overflowX: "auto",
    }}>
      {TABS.map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "12px 20px", fontWeight: 500, whiteSpace: "nowrap",
          fontSize: 13, cursor: "pointer", background: "transparent",
          border: "none",
          color: activeTab === tab.id ? "#1B5E3B" : "#7A6B52",
          borderBottom: activeTab === tab.id ? "2.5px solid #1B5E3B" : "2.5px solid transparent",
        }}>
          {tab.label}
          {tab.badge ? (
            <span style={{
              background: "#991B1B", color: "#fff", borderRadius: 999,
              fontSize: 10, fontWeight: 600, minWidth: 16, height: 16,
              display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
            }}>{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ─── CarePlansTab ─────────────────────────────────────────────────────────────
function CarePlansTab() {
  const [selectedId, setSelectedId] = useState(null);
  const selected = carePlans.find(p => p.id === selectedId);
  const missingCount = activePlans.flatMap(p => p.followups).filter(f => f.status === "missing").length;

  function PlanCard({ plan, dim }) {
    const isSelected = selectedId === plan.id;
    const badge = STATUS_BADGE[plan.status] || STATUS_BADGE.inactive;
    return (
      <div
        onClick={() => setSelectedId(isSelected ? null : plan.id)}
        style={{
          ...card,
          border: isSelected ? "1.5px solid #1B5E3B" : "0.5px solid #E0D5C0",
          cursor: "pointer", overflow: "hidden", opacity: dim ? 0.72 : 1,
          marginBottom: 10,
        }}
      >
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>{plan.condition}</span>
            <span style={{ background: badge.bg, color: badge.color, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
              {badge.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#7A6B52" }}>{plan.hospital}</div>
          <div style={{ fontSize: 11, color: "#7A6B52" }}>{plan.doctor}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {plan.follow_up_dots.map((d, i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: DOT_COLORS[d] || "#E0D5C0", display: "inline-block" }} />
            ))}
          </div>
        </div>
        <div style={{ background: "#F0E8D8", borderTop: "0.5px solid #E0D5C0", padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#A39880" }}>
            {plan.admitted}{plan.discharged ? ` → ${plan.discharged}` : ""}
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="#A39880" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", marginTop: 0, marginBottom: 4 }}>Your care history</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", marginTop: 0, marginBottom: 20 }}>All hospital stays and ongoing care on record</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { n: activePlans.length, label: "Active care plans", color: "#1B5E3B" },
          { n: pastPlans.length,   label: "Past care plans",   color: "#1B5E3B" },
          { n: missingCount,       label: "Follow-ups pending", color: "#991B1B" },
        ].map(s => (
          <div key={s.label} style={{ ...card, flex: 1, padding: "12px 16px" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: s.color }}>{s.n}</div>
            <div style={{ fontSize: 12, color: "#7A6B52", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: selected ? "grid" : "block", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7A6B52", letterSpacing: "0.5px" }}>ACTIVE</span>
            <span style={{ fontSize: 10, fontWeight: 500, background: "#E8F0E4", color: "#1B5E3B", padding: "2px 8px", borderRadius: 999 }}>{activePlans.length} ongoing</span>
          </div>
          {activePlans.map(p => <PlanCard key={p.id} plan={p} />)}

          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7A6B52", letterSpacing: "0.5px" }}>PAST RECORDS</span>
            <span style={{ fontSize: 10, fontWeight: 500, background: "#F1EFE8", color: "#5F5E5A", padding: "2px 8px", borderRadius: 999 }}>{pastPlans.length} completed</span>
          </div>
          {pastPlans.map(p => <PlanCard key={p.id} plan={p} dim />)}

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {[["#86EFAC","Done"],["#FDE68A","Pending"],["#FCA5A5","Missing"]].map(([color, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#A39880" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div style={{ ...card, padding: 16, alignSelf: "start", position: "sticky", top: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1E293B" }}>{selected.condition}</div>
                <div style={{ fontSize: 11, color: "#7A6B52", marginTop: 2 }}>{selected.hospital}</div>
              </div>
              <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A39880", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              {[
                ["Doctor", selected.doctor],
                ["Admitted", selected.admitted],
                selected.discharged && ["Discharged", selected.discharged],
                selected.care_facility && ["Care facility", selected.care_facility],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid #F0E8D8", fontSize: 12 }}>
                  <span style={{ color: "#7A6B52" }}>{label}</span>
                  <span style={{ color: "#1E293B", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: "#7A6B52", letterSpacing: "0.5px", marginBottom: 8 }}>FOLLOW-UPS</div>
            {selected.followups.map((f, i) => {
              const c = FOLLOW_COLORS[f.status] || FOLLOW_COLORS.pending;
              return (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: i < selected.followups.length - 1 ? "0.5px solid #F0E8D8" : "none" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: c.icon }}>{f.status === "done" ? "✓" : f.status === "missing" ? "!" : "◷"}</span>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <div style={{ fontWeight: 600, color: "#1E293B" }}>{f.type}</div>
                    <div style={{ color: c.text, marginTop: 2 }}>{f.timeframe}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MedicationsTab ───────────────────────────────────────────────────────────
function MedicationsTab() {
  const STATUS_BADGE_MED = {
    active:        { label: "Active",          bg: "#DCFCE7", color: "#14532D" },
    meds_continue: { label: "Meds continuing", bg: "#DBEAFE", color: "#1E40AF" },
    inactive:      { label: "Completed",       bg: "#F1F5F9", color: "#475569" },
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", marginTop: 0, marginBottom: 4 }}>All medications</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", marginTop: 0, marginBottom: 20 }}>Current and historical medications across all care plans</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {carePlans.map(plan => {
          const b = STATUS_BADGE_MED[plan.status] || STATUS_BADGE_MED.inactive;
          return (
            <div key={plan.id}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#FDF6EC", border: "0.5px solid #E0D5C0",
                borderRadius: "12px 12px 0 0", padding: "10px 14px",
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>{plan.condition}</div>
                  <div style={{ fontSize: 11, color: "#7A6B52" }}>{plan.hospital} · {plan.doctor}</div>
                </div>
                <span style={{ background: b.bg, color: b.color, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                  {b.label}
                </span>
              </div>
              <div style={{ background: "#fff", border: "0.5px solid #E0D5C0", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
                {plan.medications.map((med, i) => {
                  const tagStyle = TAG_STYLES[med.tag] || TAG_STYLES.continuing;
                  return (
                    <div key={med.name} style={{
                      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: i < plan.medications.length - 1 ? "0.5px solid #F0E8D8" : "none",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>{med.name}</span>
                          <span style={{ ...tagStyle, padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 500 }}>
                            {med.tag?.replace("_", " ")}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#7A6B52" }}>{med.purpose}</div>
                        {med.note && <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>{med.note}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>{med.dose}</div>
                        <div style={{ fontSize: 11, color: "#7A6B52" }}>{med.frequency}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FollowUpTab ──────────────────────────────────────────────────────────────
function FollowUpTab() {
  const allFollowups = carePlans.flatMap(p => p.followups.map(f => ({ ...f, planCondition: p.condition })));
  const notScheduled = allFollowups.filter(f => f.status === "missing");
  const upcoming     = allFollowups.filter(f => f.status === "pending");
  const completed    = allFollowups.filter(f => f.status === "done");

  function FollowUpItem({ item }) {
    const c = FOLLOW_COLORS[item.status] || FOLLOW_COLORS.pending;
    return (
      <div style={{ ...card, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            <span style={{ fontSize: 13, color: c.icon }}>
              {item.status === "done" ? "✓" : item.status === "missing" ? "!" : "◷"}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#1E293B" }}>{item.type}</div>
            <div style={{ fontSize: 11, color: "#7A6B52" }}>{item.source}</div>
            <div style={{ fontSize: 11, color: c.text, marginTop: 2 }}>{item.timeframe}</div>
          </div>
        </div>
        {item.action && (
          <button style={{ background: "#1B5E3B", color: "#fff", border: "none", borderRadius: 999, fontSize: 11, fontWeight: 500, padding: "4px 12px", cursor: "pointer", flexShrink: 0 }}>
            {item.action}
          </button>
        )}
      </div>
    );
  }

  function Section({ title, items, color }) {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: color + "25", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color }}>●</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: "0.5px" }}>{title}</span>
        </div>
        {items.map((item, i) => <FollowUpItem key={i} item={item} />)}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", marginTop: 0, marginBottom: 4 }}>Your follow-up plan</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", marginTop: 0, marginBottom: 20 }}>All appointments and actions across every care plan</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { count: notScheduled.length, label: "Not scheduled", bg: "#FEE2E2", color: "#991B1B" },
          { count: upcoming.length,     label: "Upcoming",      bg: "#FEF3C7", color: "#92400E" },
          { count: completed.length,    label: "Completed",     bg: "#DCFCE7", color: "#14532D" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: s.color, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <Section title="ACTION NEEDED — NOT SCHEDULED" items={notScheduled} color="#991B1B" />
      <Section title="UPCOMING" items={upcoming} color="#92400E" />
      <Section title="COMPLETED" items={completed} color="#14532D" />
    </div>
  );
}

// ─── ChatTab ──────────────────────────────────────────────────────────────────
const SUGGESTED = [
  "What follow-ups are still missing?",
  "How many meds am I on?",
  "Heart failure warning signs?",
  "Are my meds safe together?",
];

const aiContext = `Patient has 4 care plans: (1) Heart failure — Mercy General, Dr. Patel, discharged March 19 2024. Missing: cardiology appointment and potassium lab. (2) Type 2 diabetes — Riverside Clinic, Dr. Chen, ongoing. (3) Hip fracture Nov 2023 — fully resolved. (4) UTI March 2023 — fully completed. 9 active medications. 2 missing follow-ups.`;

const SYSTEM_PROMPT = `You are CareBridge AI, a warm and compassionate health assistant. Speak in simple, plain language — like a knowledgeable friend, not a doctor. Keep answers to 2–3 short paragraphs. Never diagnose conditions, never prescribe treatments. Always encourage the patient to check with their care team for anything serious. Patient context: ${aiContext}`;

function ChatTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const msg = text?.trim() || input.trim();
    if (!msg || loading) return;
    const userMsg = { role: "user", content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setHasSent(true);
    setLoading(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY not set");
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
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 500 },
          }),
        }
      );
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I encountered an error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, input]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ padding: 20, maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 160px)" }}>
      <h1 style={{ fontWeight: 600, fontSize: 20, color: "#1E293B", marginTop: 0, marginBottom: 4 }}>Ask CareBridge</h1>
      <p style={{ fontSize: 13, color: "#7A6B52", marginTop: 0, marginBottom: 16 }}>Ask anything about your care plans, medications, or follow-ups</p>

      <div style={{ ...card, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13, color: "#1E293B" }}>Asking across all 4 care plans</div>
          <div style={{ fontSize: 11, color: "#7A6B52", marginTop: 2 }}>Heart failure, Type 2 diabetes, Hip fracture, UTI</div>
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
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1B5E3B", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 12 }}>AI</span>
            </div>
            <div style={{ ...card, padding: "8px 14px", display: "flex", gap: 4 }}>
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
            onKeyDown={handleKey} disabled={loading}
            placeholder="Type your question..."
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
              background: "#1B5E3B", cursor: "pointer",
              opacity: loading || !input.trim() ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
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

// ─── Tab Map ──────────────────────────────────────────────────────────────────
const TAB_COMPONENTS = {
  careplans:   CarePlansTab,
  medications: MedicationsTab,
  followup:    FollowUpTab,
  chat:        ChatTab,
};

// ─── PatientHome ──────────────────────────────────────────────────────────────
export default function PatientHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("careplans");

  useEffect(() => {
    const stored = getUser();
    if (!stored) {
      navigate("/auth?role=patient");
      return;
    }
    setUser(stored);
  }, [navigate]);

  const handleSignOut = () => {
    clearAuth();
    navigate("/");
  };

  if (!user) return null;

  const ActiveTab = TAB_COMPONENTS[activeTab] || CarePlansTab;

  return (
    <div style={{ minHeight: "100vh", background: "#FDF6EC" }}>
      <NavBar user={user} onSignOut={handleSignOut} />
      <MainTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <ActiveTab />
    </div>
  );
}
