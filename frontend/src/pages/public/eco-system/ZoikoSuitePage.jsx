import React from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS  — all blue-toned to match screenshot
───────────────────────────────────────── */
const IconBook = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3" width="12" height="16" rx="2" fill="#f6c90e" opacity="0.9"/>
    <rect x="8" y="3" width="12" height="16" rx="2" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M11 8h5M11 12h5M11 16h3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconDoc = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M9 8h6M9 12h6M9 16h4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconLink = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconChart = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="12" width="4" height="9" rx="1" fill="white" opacity="0.7"/>
    <rect x="10" y="7" width="4" height="14" rx="1" fill="white" opacity="0.9"/>
    <rect x="17" y="3" width="4" height="18" rx="1" fill="white"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const features = [
  {
    Icon: IconBook,
    title: "Bookkeeping",
    desc: "Maintain the books and ledgers.",
  },
  {
    Icon: IconDoc,
    title: "Accounting",
    desc: "Records, reconciliation and financial reporting support.",
  },
  {
    Icon: IconLink,
    title: "Operational handoff",
    desc: "Receives operational records from Zoiko One for accounting.",
  },
  {
    Icon: IconChart,
    title: "Financial reporting",
    desc: "Reporting support on top of clean records.",
  },
];

/* ─────────────────────────────────────────
   STYLES
───────────────────────────────────────── */
const S = {
  page: {
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    background: "#ffffff",
    color: "#1a1a4e",
    margin: 0,
    padding: 0,
    width: "100%",
    overflowX: "hidden",
  },

  /* ── HERO ── */
  hero: {
    position: "relative",
    minHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "80px 24px 60px",
    overflow: "hidden",
    background: "linear-gradient(160deg,#f0f0fa 0%,#ffffff 45%,#ddeeff 100%)",
  },
  blobTL: {
    position: "absolute", top: "-70px", left: "-80px",
    width: 420, height: 420, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(200,195,252,0.42) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  blobTR: {
    position: "absolute", top: "-50px", right: "-80px",
    width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(160,200,255,0.38) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  heroInner: {
    position: "relative", zIndex: 1,
    maxWidth: 960, margin: "0 auto",
  },

  topBadge: {
    display: "inline-flex", alignItems: "center", gap: 7,
    border: "1.5px solid #d8d8e8", borderRadius: 50,
    padding: "7px 16px", marginBottom: 28,
    background: "rgba(255,255,255,0.9)",
    fontSize: 13, color: "#3b2fb0", fontWeight: 500,
  },
  badgeDiamond: { fontSize: 11, color: "#3b2fb0" },

  heroH1: {
    fontSize: "clamp(30px,4.5vw,52px)", fontWeight: 800,
    lineHeight: 1.12, color: "#1a1a4e", marginBottom: 0,
  },
  heroBlue: { color: "#3b82f6" },

  heroSub: {
    fontSize: 16, color: "#666", lineHeight: 1.65,
    maxWidth: 820, margin: "22px auto 36px",
  },

  heroActions: {
    display: "flex", justifyContent: "center",
    gap: 16, flexWrap: "wrap",
  },
  btnOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 30px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  btnOutline: {
    background: "#fff", color: "#1a1a4e",
    border: "1.5px solid #d0d0d0", borderRadius: 50,
    padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },

  /* ── WHAT IT DOES ── */
  featuresSection: {
    padding: "100px 24px 80px",
    background: "#ffffff",
  },
  featuresInner: { maxWidth: 1100, margin: "0 auto" },

  labelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionH2: {
    fontSize: "clamp(26px,4vw,40px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 52,
  },

  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 20,
  },
  featureCard: {
    border: "1.5px solid #eaeaea", borderRadius: 18,
    padding: "28px 22px", background: "#fff",
  },
  iconWrap: {
    width: 50, height: 50, borderRadius: 14,
    background: "linear-gradient(135deg,#2d4fd6 0%,#3b5bd5 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 9,
  },
  cardDesc: {
    fontSize: 13.5, color: "#888", lineHeight: 1.55,
  },

  /* ── HOW IT CONNECTS ── */
  connectsSection: {
    padding: "80px 24px 100px",
    background: "#f5f5fb",
  },
  connectsInner: { maxWidth: 860, margin: "0 auto", textAlign: "center" },

  labelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    marginBottom: 16,
  },
  connectsH2: {
    fontSize: "clamp(26px,4vw,40px)", fontWeight: 800,
    color: "#1a1a4e", lineHeight: 1.2, marginBottom: 36,
  },
  connectsBox: {
    border: "1.5px solid #e0e0ee", borderRadius: 16,
    padding: "32px 48px", background: "#fff",
  },
  connectsText: {
    fontSize: 15.5, color: "#555", lineHeight: 1.7,
    maxWidth: 700, margin: "0 auto",
  },
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoSuitePage() {
  return (
    <div style={S.page}>
      <LandingHeader />

      {/* ── 1. HERO ── */}
      <section style={S.hero}>
        <div style={S.blobTL} />
        <div style={S.blobTR} />
        <div style={S.heroInner}>

          <div style={S.topBadge}>
            <span style={S.badgeDiamond}>◇</span>
            Part of the Zoiko Business Ecosystem · sibling platform
          </div>

          <h1 style={S.heroH1}>
            Keep the books with{" "}
            <span style={S.heroBlue}>ZoikoSuite.</span>
          </h1>
          <p style={S.heroSub}>
            The accounting and bookkeeping sibling that keeps the books while Zoiko
            One runs operations. ZoikoSuite is an ecosystem sibling — never a Zoiko
            One product or pillar.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Explore ZoikoSuite &nbsp;→</button>
            <button style={S.btnOutline}>See the Money Architecture</button>
          </div>
        </div>
      </section>

      {/* ── 2. WHAT ZOIKOSUITE DOES ── */}
      <section style={S.featuresSection}>
        <div style={S.featuresInner}>
          <div style={S.labelBlue}>What ZoikoSuite Does</div>
          <h2 style={S.sectionH2}>Accounting &amp; bookkeeping.</h2>
          <div style={S.grid4}>
            {features.map(({ Icon, title, desc }) => (
              <div key={title} style={S.featureCard}>
                <div style={S.iconWrap}><Icon /></div>
                <div style={S.cardTitle}>{title}</div>
                <div style={S.cardDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT CONNECTS ── */}
      <section style={S.connectsSection}>
        <div style={S.connectsInner}>
          <div style={S.labelOrange}>How It Connects</div>
          <h2 style={S.connectsH2}>ZoikoSuite and Zoiko One.</h2>
          <div style={S.connectsBox}>
            <p style={S.connectsText}>
              Zoiko One runs operational workflows and preserves financial truth via
              ZoikoCoreX; ZoikoSuite keeps the books. The handoff moves operational
              records into accounting records — without claiming automated statutory
              reporting, guaranteed compliance, or accounting advice.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}