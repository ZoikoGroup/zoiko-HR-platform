import React from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS — all orange to match screenshot
───────────────────────────────────────── */
const IconGlobe = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
    <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9M3 12h18" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconCloud = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconTools = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconRocket = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const features = [
  { Icon: IconGlobe,  title: "Web & app",          desc: "Design, build and modernize digital properties." },
  { Icon: IconCloud,  title: "Cloud",               desc: "Migrate, secure and operate cloud services." },
  { Icon: IconTools,  title: "Managed delivery",    desc: "Managed services and implementation support." },
  { Icon: IconRocket, title: "Modernization",       desc: "Digitize and transform technology services." },
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
  heroOrange: { color: "#f97316", display: "block" },

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
    background: "linear-gradient(135deg,#f97316 0%,#fb923c 100%)",
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
    padding: "28px 48px", background: "#fff",
  },
  connectsText: {
    fontSize: 15.5, color: "#555", lineHeight: 1.7,
    maxWidth: 700, margin: "0 auto",
  },
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoDigitalPage() {
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
            Build and modernize with
            <span style={S.heroOrange}>Zoiko Digital.</span>
          </h1>
          <p style={S.heroSub}>
            Digital transformation, web, app, cloud, managed delivery and implementation
            support — the digital-services sibling and Zoiko Tech- delivery arm that sits
            alongside Zoiko One.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Explore Zoiko Digital &nbsp;→</button>
            <button style={S.btnOutline}>Request Digital Services Briefing</button>
          </div>
        </div>
      </section>

      {/* ── 2. WHAT ZOIKO DIGITAL DOES ── */}
      <section style={S.featuresSection}>
        <div style={S.featuresInner}>
          <div style={S.labelBlue}>What Zoiko Digital Does</div>
          <h2 style={S.sectionH2}>Web, app, cloud &amp; digital services.</h2>
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
          <h2 style={S.connectsH2}>Zoiko Digital and Zoiko One.</h2>
          <div style={S.connectsBox}>
            <p style={S.connectsText}>
              Zoiko Digital helps you design, build, modernize, migrate, secure and
              operate digital properties and services that may sit alongside Zoiko One —
              including implementation support around the ecosystem.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}