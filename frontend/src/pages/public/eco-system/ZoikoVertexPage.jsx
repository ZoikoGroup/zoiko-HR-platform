import React from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const features = [
  {
    emoji: "🎯",
    title: "CRM",
    desc: "Contacts, pipeline, deals and customer records.",
  },
  {
    emoji: "📣",
    title: "Marketing",
    desc: "Campaigns, automation and growth workflows.",
  },
  {
    emoji: "💼",
    title: "Sales",
    desc: "Quotes, opportunities and sales enablement.",
  },
  {
    emoji: "⭐",
    title: "Customer success",
    desc: "Onboarding, retention and expansion.",
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
    background:
      "linear-gradient(160deg,#f0f0fa 0%,#ffffff 45%,#ddeeff 100%)",
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
    fontSize: "clamp(32px,5vw,54px)", fontWeight: 800,
    lineHeight: 1.12, color: "#1a1a4e", marginBottom: 0,
  },
  heroOrange: { color: "#f97316" },

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
  emojiWrap: {
    width: 50, height: 50, borderRadius: 14,
    background: "#f97316",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, marginBottom: 20,
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
    maxWidth: 680, margin: "0 auto",
  },
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoVertexPage() {
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
            Get customers and grow revenue<br />
            with <span style={S.heroOrange}>ZoikoVertex.</span>
          </h1>
          <p style={S.heroSub}>
            CRM, sales, marketing and customer success — the growth sibling that
            helps you win and keep customers, alongside Zoiko One running operations.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Explore ZoikoVertex &nbsp;→</button>
            <button style={S.btnOutline}>See How It Connects</button>
          </div>
        </div>
      </section>

      {/* ── 2. WHAT ZOIKOVERTEX DOES ── */}
      <section style={S.featuresSection}>
        <div style={S.featuresInner}>
          <div style={S.labelBlue}>What ZoikoVertex Does</div>
          <h2 style={S.sectionH2}>CRM, sales, marketing &amp; customer success.</h2>
          <div style={S.grid4}>
            {features.map((f) => (
              <div key={f.title} style={S.featureCard}>
                <div style={S.emojiWrap}>{f.emoji}</div>
                <div style={S.cardTitle}>{f.title}</div>
                <div style={S.cardDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT CONNECTS ── */}
      <section style={S.connectsSection}>
        <div style={S.connectsInner}>
          <div style={S.labelOrange}>How It Connects</div>
          <h2 style={S.connectsH2}>ZoikoVertex and Zoiko One.</h2>
          <div style={S.connectsBox}>
            <p style={S.connectsText}>
              ZoikoVertex gets customers; Zoiko One runs the operations that deliver
              to them. Customer and revenue context can inform operational workflows
              where approved.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
