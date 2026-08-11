import React from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS — sky-blue to match screenshot
───────────────────────────────────────── */
const IconMsg = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" fill="white" fillOpacity="0.9"/>
    <circle cx="9" cy="11" r="1" fill="#3b9ef5"/>
    <circle cx="12" cy="11" r="1" fill="#3b9ef5"/>
    <circle cx="15" cy="11" r="1" fill="#3b9ef5"/>
  </svg>
);
const IconVideo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="14" height="12" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M16 10l5-3v10l-5-3V10z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
const IconShare = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="18" cy="5" r="3" stroke="white" strokeWidth="2"/>
    <circle cx="6" cy="12" r="3" stroke="white" strokeWidth="2"/>
    <circle cx="18" cy="19" r="3" stroke="white" strokeWidth="2"/>
    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="white" strokeWidth="2"/>
  </svg>
);
const IconBell = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const features = [
  { Icon: IconMsg,   title: "Messaging",      desc: "Channels, direct messages and team chat." },
  { Icon: IconVideo, title: "Meetings",        desc: "Video, calls and collaboration." },
  { Icon: IconShare, title: "Sharing",         desc: "Files and collaboration around work." },
  { Icon: IconBell,  title: "Notifications",   desc: "Stay in sync across teams." },
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
    fontSize: "clamp(30px,4.5vw,54px)", fontWeight: 800,
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
    background: "linear-gradient(135deg,#3b9ef5 0%,#22b5d4 100%)",
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
export default function ZoikoSemaPage() {
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
            Communicate and collaborate with<br />
            <span style={S.heroBlue}>Zoiko Sema.</span>
          </h1>
          <p style={S.heroSub}>
            Communication and collaboration around business operations. Zoiko Sema
            supports how teams talk and work together — it does not own Zoiko One
            workflows, approvals, records or data authority.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Explore Zoiko Sema &nbsp;→</button>
            <button style={S.btnOutline}>Visit Zoiko Sema</button>
          </div>
        </div>
      </section>

      {/* ── 2. WHAT ZOIKO SEMA DOES ── */}
      <section style={S.featuresSection}>
        <div style={S.featuresInner}>
          <div style={S.labelBlue}>What Zoiko Sema Does</div>
          <h2 style={S.sectionH2}>Communication &amp; collaboration.</h2>
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
          <h2 style={S.connectsH2}>Zoiko Sema and Zoiko One.</h2>
          <div style={S.connectsBox}>
            <p style={S.connectsText}>
              Zoiko Sema supports communication and collaboration around operations.
              Workflows, approvals, records and business-data authority remain in Zoiko One.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}