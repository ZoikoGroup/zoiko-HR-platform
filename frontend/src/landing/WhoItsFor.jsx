import { useState } from "react";

const tabs = [
  {
    id: "finance",
    label: "Finance / CFO",
    headline: "Project-to-cash discipline, with less reconciliation.",
    description:
      "Connect billable work to revenue and pay, cut manual reconciliation, and report with numbers you trust.",
    bullets: [
      "Revenue connected to delivered work",
      "Controlled, auditable pay runs",
      "Live margin and forecasting",
      "One source of financial truth",
    ],
    tags: ["Billing", "Payroll", "Projects", "Insights"],
    metrics: [
      { label: "Reconciliation time", value: "-61%", color: "#F97316" },
      { label: "Days sales outstanding", value: "-9 days", color: "#2B4EFF" },
      { label: "Forecast confidence", value: "High", color: "#1A1A2E" },
    ],
  },
  {
    id: "hr",
    label: "HR / CHRO",
    headline: "One people platform, from hire to pay.",
    description:
      "Manage contracts, time, leave, and payroll without switching tools or chasing data across systems.",
    bullets: [
      "Unified employee records",
      "Automated leave and attendance",
      "Compliant payroll every cycle",
      "Real-time headcount reporting",
    ],
    tags: ["People", "Payroll", "Time", "Compliance"],
    metrics: [
      { label: "Admin time saved", value: "-40%", color: "#F97316" },
      { label: "Payroll errors", value: "~Zero", color: "#2B4EFF" },
      { label: "Compliance risk", value: "Low", color: "#1A1A2E" },
    ],
  },
  {
    id: "agencies",
    label: "Agencies",
    headline: "Run client work without the spreadsheet sprawl.",
    description:
      "Track time, bill accurately, and keep projects profitable from kickoff to invoice.",
    bullets: [
      "Time tracked against projects",
      "Accurate client invoicing",
      "Live project margins",
      "Integrated team payroll",
    ],
    tags: ["Projects", "Billing", "Time", "Insights"],
    metrics: [
      { label: "Invoicing time", value: "-55%", color: "#F97316" },
      { label: "Revenue leakage", value: "Eliminated", color: "#2B4EFF" },
      { label: "Margin visibility", value: "Live", color: "#1A1A2E" },
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    headline: "Control and visibility across every entity.",
    description:
      "Multi-entity payroll, consolidated reporting, and audit-ready compliance — all in one place.",
    bullets: [
      "Multi-entity payroll runs",
      "Consolidated financial reporting",
      "Role-based access controls",
      "Audit trail on every action",
    ],
    tags: ["Payroll", "Compliance", "Insights", "Billing"],
    metrics: [
      { label: "Reporting time", value: "-70%", color: "#F97316" },
      { label: "Audit readiness", value: "Always", color: "#2B4EFF" },
      { label: "Entity coverage", value: "Full", color: "#1A1A2E" },
    ],
  },
];

export default function WhoItsFor() {
  const [activeTab, setActiveTab] = useState("finance");
  const active = tabs.find((t) => t.id === activeTab);

  return (
    <section style={styles.section}>
      {/* Eyebrow */}
      <p style={styles.eyebrow}>SOLUTIONS BY BUYER</p>

      {/* Heading */}
      <h2 style={styles.heading}>
        Built for the teams that run the business.
      </h2>

      {/* Subheading */}
      <p style={styles.subheading}>
        Every role sees the products and outcomes that matter to them — and the
        next logical step.
      </p>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : styles.tabInactive),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panel */}
      <div style={styles.panel}>
        {/* Left */}
        <div style={styles.left}>
          <h3 style={styles.panelHeading}>{active.headline}</h3>
          <p style={styles.panelDesc}>{active.description}</p>

          <ul style={styles.bulletList}>
            {active.bullets.map((b) => (
              <li key={b} style={styles.bulletItem}>
                <span style={styles.checkIcon}>✓</span>
                {b}
              </li>
            ))}
          </ul>

          <div style={styles.tagRow}>
            {active.tags.map((tag) => (
              <span key={tag} style={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right — Metrics Card */}
        <div style={styles.right}>
          {active.metrics.map((m, i) => (
            <div
              key={m.label}
              style={{
                ...styles.metricRow,
                borderBottom:
                  i < active.metrics.length - 1
                    ? "1px solid #E8E8EE"
                    : "none",
              }}
            >
              <span style={styles.metricLabel}>{m.label}</span>
              <span style={{ ...styles.metricValue, color: m.color }}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    backgroundColor: "#F7F7F9",
    padding: "96px 24px",
    textAlign: "center",
    fontFamily: "'Inter', sans-serif",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "#F97316",
    textTransform: "uppercase",
    marginBottom: "16px",
  },
  heading: {
    fontSize: "clamp(28px, 4vw, 44px)",
    fontWeight: 700,
    color: "#0F0F1A",
    lineHeight: 1.2,
    maxWidth: "640px",
    margin: "0 auto 16px",
  },
  subheading: {
    fontSize: "16px",
    color: "#5A5A72",
    maxWidth: "520px",
    margin: "0 auto 48px",
    lineHeight: 1.6,
  },
  tabRow: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "48px",
  },
  tab: {
    padding: "10px 22px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s ease",
  },
  tabActive: {
    backgroundColor: "#1A2560",
    color: "#FFFFFF",
  },
  tabInactive: {
    backgroundColor: "transparent",
    color: "#3D3D55",
  },
  panel: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "48px",
    maxWidth: "1200px",
    margin: "0 auto",
    textAlign: "left",
    alignItems: "start",
  },
  left: {},
  panelHeading: {
    fontSize: "clamp(20px, 2.5vw, 28px)",
    fontWeight: 700,
    color: "#0F0F1A",
    marginBottom: "14px",
    lineHeight: 1.3,
  },
  panelDesc: {
    fontSize: "15px",
    color: "#5A5A72",
    lineHeight: 1.65,
    marginBottom: "24px",
  },
  bulletList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 28px 0",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  bulletItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "14px",
    color: "#3D3D55",
    fontWeight: 500,
  },
  checkIcon: {
    color: "#F97316",
    fontWeight: 700,
    fontSize: "13px",
  },
  tagRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  tag: {
    padding: "4px 12px",
    backgroundColor: "#EBEBF5",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#3D3D55",
  },
  right: {
    backgroundColor: "#FFFFFF",
    borderRadius: "16px",
    boxShadow: "0 2px 20px rgba(0,0,0,0.06)",
    padding: "8px 0",
    overflow: "hidden",
  },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 28px",
  },
  metricLabel: {
    fontSize: "14px",
    color: "#8888A4",
    fontWeight: 400,
  },
  metricValue: {
    fontSize: "20px",
    fontWeight: 700,
  },
};