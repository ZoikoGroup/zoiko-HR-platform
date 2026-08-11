export default function TrustCenter() {
  const cards = [
    {
      icon: "🔒",
      title: "Access control",
      desc: "RBAC, MFA, SSO, and least-privilege permissions across every product.",
    },
    {
      icon: "🔐",
      title: "Encryption",
      desc: "Encryption in transit and at rest, with secure development practices.",
    },
    {
      icon: "📋",
      title: "Audit trails",
      desc: "Action logs and evidence packs that stand up to audit and review.",
    },
    {
      icon: "🌐",
      title: "Data residency",
      desc: "Clear data handling, retention, subprocessors, and residency approach.",
    },
  ];

  return (
    <section style={styles.section}>
      <div style={styles.inner}>
        {/* Left */}
        <div style={styles.left}>
          <p style={styles.eyebrow}>SECURITY, COMPLIANCE & TRUST</p>
          <h2 style={styles.heading}>
            Built for security, control, and audit readiness.
          </h2>
          <p style={styles.desc}>
            Controls are designed in from day one — not bolted on for the
            enterprise sale. Every public claim is substantiated in our Trust
            Center.
          </p>
          <div style={styles.btnRow}>
            <a href="#" style={styles.btnPrimary}>
              Visit Trust Center →
            </a>
            <a href="#" style={styles.btnSecondary}>
              Download Security Overview
            </a>
          </div>
        </div>

        {/* Right — 2x2 grid */}
        <div style={styles.grid}>
          {cards.map((card) => (
            <div key={card.title} style={styles.card}>
              <div style={styles.cardIcon}>{card.icon}</div>
              <h4 style={styles.cardTitle}>{card.title}</h4>
              <p style={styles.cardDesc}>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    backgroundColor: "#1A2560",
    padding: "96px 24px",
    fontFamily: "'Inter', sans-serif",
  },
  inner: {
    maxWidth: "1280px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "64px",
    alignItems: "center",
  },
  left: {},
  eyebrow: {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "#F97316",
    textTransform: "uppercase",
    marginBottom: "16px",
  },
  heading: {
    fontSize: "clamp(28px, 3.5vw, 42px)",
    fontWeight: 700,
    color: "#FFFFFF",
    lineHeight: 1.2,
    marginBottom: "20px",
  },
  desc: {
    fontSize: "15px",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 1.7,
    marginBottom: "36px",
  },
  btnRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  btnPrimary: {
    display: "inline-block",
    padding: "12px 24px",
    backgroundColor: "#F97316",
    color: "#fff",
    borderRadius: "999px",
    fontWeight: 600,
    fontSize: "14px",
    textDecoration: "none",
  },
  btnSecondary: {
    display: "inline-block",
    padding: "12px 24px",
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "#fff",
    borderRadius: "999px",
    fontWeight: 600,
    fontSize: "14px",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.2)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    padding: "24px",
  },
  cardIcon: {
    fontSize: "20px",
    marginBottom: "12px",
  },
  cardTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#FFFFFF",
    marginBottom: "8px",
  },
  cardDesc: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 1.6,
    margin: 0,
  },
};