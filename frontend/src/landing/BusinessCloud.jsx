export default function BusinessCloud() {
  const integrations = [
    { label: "Accounting", color: "#1A2560", letter: "A" },
    { label: "CRM", color: "#F97316", letter: "C" },
    { label: "Identity / SSO", color: "#2B6CB0", letter: "ID" },
    { label: "Payments", color: "#2E7D32", letter: "S" },
    { label: "ERP", color: "#1B5E20", letter: "E" },
    { label: "Tax", color: "#BF360C", letter: "T" },
    { label: "Productivity", color: "#4A148C", letter: "⊞" },
    { label: "REST API", color: "#1A2560", letter: "{}" },
    { label: "Webhooks", color: "#EA580C", letter: "⬡" },
    { label: "Imports / Exports", color: "#0D47A1", letter: "↕" },
  ];

  const row1 = integrations.slice(0, 6);
  const row2 = integrations.slice(6);

  return (
    <section style={styles.section}>
      <p style={styles.eyebrow}>INTEGRATIONS</p>
      <h2 style={styles.heading}>
        Connect Zoiko One to the tools your business already uses.
      </h2>
      <p style={styles.subheading}>
        Accounting, CRM, identity, payments, ERP, tax, and more — through Zoiko
        Connect, APIs, and webhooks.
      </p>

      {/* Row 1 */}
      <div style={styles.row}>
        {row1.map((item) => (
          <Chip key={item.label} item={item} />
        ))}
      </div>

      {/* Row 2 */}
      <div style={{ ...styles.row, justifyContent: "center" }}>
        {row2.map((item) => (
          <Chip key={item.label} item={item} />
        ))}
      </div>

      {/* CTA */}
      <div style={styles.ctaWrap}>
        <a href="#" style={styles.cta}>
          Explore Integrations
        </a>
      </div>
    </section>
  );
}

function Chip({ item }) {
  return (
    <div style={styles.chip}>
      <div
        style={{
          ...styles.chipIcon,
          backgroundColor: item.color,
        }}
      >
        <span style={styles.chipLetter}>{item.letter}</span>
      </div>
      <span style={styles.chipLabel}>{item.label}</span>
    </div>
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
    color: "#2B4EFF",
    textTransform: "uppercase",
    marginBottom: "16px",
  },
  heading: {
    fontSize: "clamp(26px, 3.5vw, 42px)",
    fontWeight: 700,
    color: "#0F0F1A",
    lineHeight: 1.2,
    maxWidth: "620px",
    margin: "0 auto 16px",
  },
  subheading: {
    fontSize: "15px",
    color: "#5A5A72",
    maxWidth: "500px",
    margin: "0 auto 48px",
    lineHeight: 1.65,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    justifyContent: "center",
    marginBottom: "16px",
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E2EE",
    borderRadius: "999px",
    padding: "8px 16px 8px 8px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  chipIcon: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipLetter: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  chipLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#0F0F1A",
  },
  ctaWrap: {
    marginTop: "40px",
  },
  cta: {
    display: "inline-block",
    padding: "12px 28px",
    border: "1.5px solid #1A2560",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#1A2560",
    textDecoration: "none",
    backgroundColor: "transparent",
  },
};