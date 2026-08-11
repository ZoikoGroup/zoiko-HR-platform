import React, { useState, useRef } from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const siblings = [
  {
    letter: "V",
    bg: "#f97316",
    name: "ZoikoVertex",
    desc: "CRM, sales, marketing and customer success — gets customers.",
    link: "Explore ZoikoVertex →",
    featured: false,
  },
  {
    letter: "S",
    bg: "linear-gradient(135deg,#3b5bd5,#2d4fd6)",
    name: "ZoikoSuite",
    desc: "Accounting and bookkeeping — keeps the books while Zoiko One runs operations.",
    link: "Explore ZoikoSuite →",
    featured: false,
  },
  {
    letter: "Se",
    bg: "linear-gradient(135deg,#22b5d4,#0ea5e9)",
    name: "Zoiko Sema",
    desc: "Communication and collaboration around operations.",
    link: "Explore Zoiko Sema →",
    featured: false,
  },
  {
    letter: "L",
    bg: "linear-gradient(135deg,#6c5dd3,#7c6de3)",
    name: "Zoiko Local",
    desc: "Telephony and business calling.",
    link: "Explore Zoiko Local →",
    featured: false,
  },
  {
    letter: "D",
    bg: "#f97316",
    name: "Zoiko Digital",
    desc: "Web, app, cloud and managed digital services.",
    link: "Explore Zoiko Digital →",
    featured: false,
  },
  {
    letter: "logo",
    bg: "linear-gradient(135deg,#f97316 0%,#3b82f6 100%)",
    name: "Zoiko One",
    desc: "The connected business-operations platform — this is the hero.",
    link: "Explore Zoiko One →",
    featured: false,
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
    minHeight: "72vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 24px 50px",
    overflow: "hidden",
    background:
      "linear-gradient(135deg,#fff5ef 0%,#f8f8ff 35%,#eeeeff 65%,#e8eeff 100%)",
  },
  blobL: {
    position: "absolute", top: "-60px", left: "-80px",
    width: 420, height: 420, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(255,200,160,0.55) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  blobR: {
    position: "absolute", top: "-40px", right: "-80px",
    width: 480, height: 480, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(185,180,252,0.45) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto" },

  topBadge: {
    display: "inline-flex", alignItems: "center", gap: 8,
    border: "1.5px solid #d8d8e8", borderRadius: 50,
    padding: "8px 18px", marginBottom: 28,
    background: "rgba(255,255,255,0.85)",
    fontSize: 13.5, color: "#3b2fb0", fontWeight: 500,
  },
  badgeDiamond: { fontSize: 12, color: "#3b2fb0" },

  heroH1: {
    fontSize: "clamp(32px,5vw,58px)", fontWeight: 800,
    lineHeight: 1.1, color: "#1a1a4e", marginBottom: 0,
  },
  heroOrange: { color: "#f97316" },

  heroSub: {
    fontSize: 16, color: "#666", lineHeight: 1.65,
    maxWidth: 740, margin: "20px auto 36px",
  },

  heroActions: {
    display: "flex", justifyContent: "center",
    gap: 16, flexWrap: "wrap",
  },
  btnOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 32px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  btnOutline: {
    background: "#fff", color: "#1a1a4e",
    border: "1.5px solid #d0d0d0", borderRadius: 50,
    padding: "14px 30px", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },

  /* ── ECOSYSTEM GRID ── */
  ecoSection: { padding: "60px 24px", background: "#ffffff" },
  ecoInner: { maxWidth: 1160, margin: "0 auto" },

  labelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionH2: {
    fontSize: "clamp(28px,4vw,44px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 14,
  },
  sectionSub: {
    fontSize: 15.5, color: "#888", textAlign: "center",
    lineHeight: 1.6, maxWidth: 640, margin: "0 auto 32px",
  },

  grid3x2: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 14,
  },

  /* regular card */
  ecoCard: {
    border: "1.5px solid #eaeaea", borderRadius: 16,
    padding: "20px 20px", background: "#fff",
    display: "flex", flexDirection: "column",
  },
  /* featured Zoiko One card */
  ecoCardFeatured: {
    background: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 40%,#3a6fd8 100%)",
    border: "none", borderRadius: 16,
    padding: "20px 20px",
    display: "flex", flexDirection: "column",
  },

  letterAvatar: {
    width: 40, height: 40, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: 700, color: "#fff",
    marginBottom: 14, flexShrink: 0,
  },
  /* featured avatar: lighter overlay */
  letterAvatarFeatured: {
    width: 40, height: 40, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, color: "#fff",
    marginBottom: 14, flexShrink: 0,
    background: "rgba(255,255,255,0.18)",
    border: "1.5px solid rgba(255,255,255,0.28)",
  },

  cardName: { fontSize: 14, fontWeight: 700, color: "#1a1a4e", marginBottom: 6 },
  cardNameFeatured: { fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 },

  cardDesc: { fontSize: 12.5, color: "#888", lineHeight: 1.5, flex: 1, marginBottom: 16 },
  cardDescFeatured: { fontSize: 12.5, color: "rgba(255,255,255,0.72)", lineHeight: 1.5, flex: 1, marginBottom: 16 },

  cardLink: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13.5, fontWeight: 600, color: "#3b2fb0",
    padding: 0, textAlign: "left",
  },
  cardLinkFeatured: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13.5, fontWeight: 600, color: "#fff",
    padding: 0, textAlign: "left",
  },

  /* ── ARCHITECTURE NOTE ── */
  archSection: { padding: "50px 24px 70px", background: "#f5f5fb" },
  archInner: { maxWidth: 960, margin: "0 auto", textAlign: "center" },

  labelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    marginBottom: 16,
  },
  archH2: {
    fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 800,
    color: "#1a1a4e", lineHeight: 1.2, marginBottom: 32,
  },
  archBox: {
    border: "1.5px solid #e0e0ee", borderRadius: 16,
    padding: "36px 48px", background: "#fff",
    textAlign: "center",
  },
  archText: {
    fontSize: 15.5, color: "#444", lineHeight: 1.7,
    maxWidth: 860, margin: "0 auto",
  },
};

/* ─────────────────────────────────────────
   ECO CARD with hover
───────────────────────────────────────── */
function EcoCard({ s, onClick }) {
  const [hovered, setHovered] = useState(false);
  const featured = s.featured;

  // On hover every card (including featured) flips to the blue gradient
  const cardStyle = hovered || featured
    ? {
        background: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 40%,#3a6fd8 100%)",
        border: "none",
        borderRadius: 16,
        padding: "20px 20px",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "background 0.25s, box-shadow 0.25s",
        boxShadow: hovered ? "0 6px 24px rgba(58,47,176,0.2)" : "none",
      }
    : {
        border: "1.5px solid #eaeaea",
        borderRadius: 16,
        padding: "20px 20px",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "background 0.25s, box-shadow 0.25s",
        boxShadow: "none",
      };

  const isBlue = hovered || featured;

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Avatar */}
      <div style={{
        ...S.letterAvatar,
        background: isBlue ? "rgba(255,255,255,0.18)" : s.letter === "logo" ? "linear-gradient(135deg,#eef2ff 0%,#f5f0ff 100%)" : s.bg,
        border: isBlue ? "1.5px solid rgba(255,255,255,0.28)" : s.letter === "logo" ? "1.5px solid #e0e0ee" : "none",
        transition: "background 0.25s",
      }}>
        {s.letter === "logo" ? (
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <path d="M9 23L21 5" stroke={isBlue ? "white" : "#f97316"} strokeWidth="3.5" strokeLinecap="round"/>
            <path d="M9 5L9 23" stroke={isBlue ? "white" : "#2d4fd6"} strokeWidth="3.5" strokeLinecap="round"/>
          </svg>
        ) : (
          s.letter
        )}
      </div>

      <div style={isBlue ? S.cardNameFeatured : S.cardName}>{s.name}</div>
      <div style={isBlue ? S.cardDescFeatured : S.cardDesc}>{s.desc}</div>
      <div style={{ marginTop: "auto" }}>
        <button style={isBlue ? S.cardLinkFeatured : S.cardLink}>
          {s.link}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoEcosystemPage() {
  const heroRef = useRef(null);

  const scrollToHero = () => {
    heroRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={S.page}>
      <LandingHeader />

      {/* ── 1. HERO ── */}
      <section ref={heroRef} style={S.hero}>
        <div style={S.blobL} />
        <div style={S.blobR} />
        <div style={S.heroInner}>

          {/* top badge */}
          <div style={S.topBadge}>
            <span style={S.badgeDiamond}>◆</span>
            The operations platform · the ecosystem hero
          </div>

          <h1 style={S.heroH1}>
            Zoiko One runs the{" "}
            <span style={S.heroOrange}>business operations</span>
          </h1>
          <p style={S.heroSub}>
            Run people, money, work, supply, compliance, insights, documents, approvals
            and workflows through one connected business-operations platform — at the
            center of the Zoiko Business Ecosystem.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Explore Zoiko One &nbsp;→</button>
            <button style={S.btnOutline}>Get a Demo</button>
          </div>
        </div>
      </section>

      {/* ── 2. ECOSYSTEM ORIENTATION ── */}
      <section style={S.ecoSection}>
        <div style={S.ecoInner}>
          <div style={S.labelBlue}>Ecosystem Orientation</div>
          <h2 style={S.sectionH2}>One hero. A family of siblings.</h2>
          <p style={S.sectionSub}>
            Zoiko One is the operations platform. The siblings below are separate Zoiko
            Group platforms — not Zoiko One products or pillars.
          </p>

          <div style={S.grid3x2}>
            {siblings.map((s) => (
              <EcoCard
                key={s.name}
                s={s}
                onClick={s.name === "Zoiko One" ? scrollToHero : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. ARCHITECTURE NOTE ── */}
      <section style={S.archSection}>
        <div style={S.archInner}>
          <div style={S.labelOrange}>Why The Boundaries Matter</div>
          <h2 style={S.archH2}>Clear architecture prevents confusion.</h2>
          <div style={S.archBox}>
            <p style={S.archText}>
              Zoiko One has nine core products plus Zoiko Docs Pro, a premium
              Documents-layer capability. ZoikoVertex, ZoikoSuite, Zoiko Sema, Zoiko
              Local and Zoiko Digital are ecosystem siblings — they connect with or
              complement Zoiko One but are not Zoiko One products. ZoikoPay moves money
              and ZoikoCoreX preserves financial truth; ZoikoSuite keeps the books
              outside Zoiko One.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}