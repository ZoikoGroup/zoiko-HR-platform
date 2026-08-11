import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const leadership = [
  {
    initials: "CE",
    bg: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 100%)",
    role: "Chief Executive",
    tag: "Vision & strategy",
    desc: "Sets platform direction, commercial strategy and long-term company governance.",
  },
  {
    initials: "PR",
    bg: "linear-gradient(135deg,#3b9ef5 0%,#22b5d4 100%)",
    role: "Chief Product",
    tag: "Product & design",
    desc: "Owns the five-pillar product architecture, roadmap and user experience.",
  },
  {
    initials: "EN",
    bg: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 100%)",
    role: "Chief Technology",
    tag: "Engineering & platform",
    desc: "Leads platform engineering, the shared spine, reliability and scale.",
  },
  {
    initials: "SE",
    bg: "linear-gradient(135deg,#f97316 0%,#fb923c 100%)",
    role: "Chief Security",
    tag: "Security & trust",
    desc: "Owns security posture, responsible AI boundaries and trust governance.",
  },
  {
    initials: "RV",
    bg: "linear-gradient(135deg,#6c5dd3 0%,#7c6de3 100%)",
    role: "Chief Revenue",
    tag: "Commercial growth",
    desc: "Leads sales, partnerships and commercial expansion.",
  },
  {
    initials: "CS",
    bg: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 100%)",
    role: "Customer Success",
    tag: "Implementation & support",
    desc: "Owns onboarding, implementation and customer outcomes.",
  },
  {
    initials: "FN",
    bg: "linear-gradient(135deg,#3b9ef5 0%,#22b5d4 100%)",
    role: "Finance & Operations",
    tag: "Operating discipline",
    desc: "Runs finance, operations and corporate governance.",
  },
  {
    initials: "PE",
    bg: "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 100%)",
    role: "People & Culture",
    tag: "Team & culture",
    desc: "Builds the team, culture and operating accountability model.",
  },
];

const operatingModel = [
  {
    Icon: "⚙️", bg: "linear-gradient(135deg,#2d4fd6,#3b5bd5)",
    title: "Product discipline",
    desc: "Clear architecture, guardrails and a focused roadmap.",
  },
  {
    Icon: "💡", bg: "linear-gradient(135deg,#f97316,#fb923c)",
    title: "Security awareness",
    desc: "Security and responsible AI considered from the start.",
  },
  {
    Icon: "🤝", bg: "linear-gradient(135deg,#3b9ef5,#22b5d4)",
    title: "Customer outcomes",
    desc: "Implementation and support measured by real results.",
  },
  {
    Icon: "🖥️", bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)",
    title: "Governance",
    desc: "Decision accountability and long-term platform trust.",
  },
  {
    Icon: "📈", bg: "linear-gradient(135deg,#4a3fc0,#5b4fd8)",
    title: "Sustainable growth",
    desc: "Commercial expansion without compromising trust.",
  },
  {
    Icon: "👥", bg: "linear-gradient(135deg,#3b2fb0,#2d1f9e)",
    title: "Team & culture",
    desc: "An accountable, mission-driven operating culture.",
  },
];

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
  heroInner: { position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto" },

  badge: {
    display: "inline-flex", alignItems: "center", gap: 10,
    border: "1.5px solid #ddd", borderRadius: 50,
    padding: "6px 16px 6px 6px", marginBottom: 28, background: "#fff",
  },
  badgePill: {
    background: "#2d4fd6", color: "#fff",
    fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "4px 12px",
  },
  badgeText: { fontSize: 14, color: "#333" },

  heroH1: {
    fontSize: "clamp(32px,5vw,52px)", fontWeight: 800,
    lineHeight: 1.15, color: "#1a1a4e", marginBottom: 0,
  },
  heroBlue: { color: "#3b9ef5" },

  heroSub: {
    fontSize: 16, color: "#555", lineHeight: 1.65,
    maxWidth: 680, margin: "22px auto 36px",
  },

  heroActions: { display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" },
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

  leadershipSection: { padding: "100px 24px 80px", background: "#ffffff" },
  leadershipInner: { maxWidth: 1100, margin: "0 auto" },

  labelPurple: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  labelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionH2: {
    fontSize: "clamp(26px,4vw,38px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 10,
  },
  sectionSub: {
    fontSize: 14.5, color: "#999", textAlign: "center",
    marginBottom: 48,
  },

  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 },
  leaderCard: {
    border: "1.5px solid #eaeaea", borderRadius: 16,
    padding: "26px 20px", background: "#fff", textAlign: "center",
  },
  avatar: {
    width: 56, height: 56, borderRadius: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 16px",
    fontSize: 16, fontWeight: 700, color: "#fff",
  },
  leaderRole: { fontSize: 14.5, fontWeight: 700, color: "#1a1a4e", marginBottom: 4 },
  leaderTag: { fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 10 },
  leaderDesc: { fontSize: 12.5, color: "#888", lineHeight: 1.5 },

  modelSection: { padding: "80px 24px 100px", background: "#f5f5fb" },
  modelInner: { maxWidth: 1000, margin: "0 auto" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 },
  modelCard: {
    border: "1.5px solid #eaeaea", borderRadius: 16,
    padding: "24px 22px", background: "#fff",
  },
  modelIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, marginBottom: 16,
  },
  modelTitle: { fontSize: 14.5, fontWeight: 700, color: "#1a1a4e", marginBottom: 8 },
  modelDesc: { fontSize: 13, color: "#888", lineHeight: 1.5 },

  ctaSection: { padding: "40px 28px 80px", background: "#f5f5fb" },
  ctaCard: {
    maxWidth: 1060, margin: "0 auto",
    background: "linear-gradient(135deg,#5b2d8e 0%,#4a3fc0 35%,#3a6fd8 70%,#4ab0f5 100%)",
    borderRadius: 22, padding: "64px 48px", textAlign: "center",
  },
  ctaH2: {
    fontSize: "clamp(24px,4vw,38px)", fontWeight: 800,
    color: "#fff", marginBottom: 12, lineHeight: 1.2,
  },
  ctaSub: { fontSize: 15, color: "rgba(255,255,255,0.78)", marginBottom: 32, lineHeight: 1.55 },
  ctaActions: { display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  btnCtaOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 14.5, fontWeight: 700, cursor: "pointer",
  },
  btnCtaGhost: {
    background: "rgba(255,255,255,0.15)", color: "#fff",
    border: "1.5px solid rgba(255,255,255,0.28)",
    borderRadius: 50, padding: "13px 24px",
    fontSize: 14.5, fontWeight: 600, cursor: "pointer",
  },
};

export default function ZoikoLeadershipPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.replace("#", ""));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [hash]);

  return (
    <div style={S.page}>
      <LandingHeader />

      <section style={S.hero}>
        <div style={S.blobTL} />
        <div style={S.blobTR} />
        <div style={S.heroInner}>
          <div style={S.badge}>
            <span style={S.badgePill}>Company</span>
            <span style={S.badgeText}>Leadership</span>
          </div>
          <h1 style={S.heroH1}>
            Leadership behind <span style={S.heroBlue}>Zoiko One.</span>
          </h1>
          <p style={S.heroSub}>
            Meet the leadership and operating model guiding Zoiko One across product,
            engineering, security, commercial growth, customer implementation, support
            and governance.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Get a Demo &nbsp;→</button>
            <button style={S.btnOutline}>Contact Sales</button>
          </div>
        </div>
      </section>

      <section id="leadership" style={S.leadershipSection}>
        <div style={S.leadershipInner}>
          <div style={S.labelPurple}>Leadership Team</div>
          <h2 style={S.sectionH2}>Built around accountability and platform trust.</h2>
          <p style={S.sectionSub}>
            Leadership profiles are representative placeholders to be confirmed before launch.
          </p>
          <div style={S.grid4}>
            {leadership.map((l) => (
              <div key={l.role} style={S.leaderCard}>
                <div style={{ ...S.avatar, background: l.bg }}>{l.initials}</div>
                <div style={S.leaderRole}>{l.role}</div>
                <div style={S.leaderTag}>{l.tag}</div>
                <div style={S.leaderDesc}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={S.modelSection}>
        <div style={S.modelInner}>
          <div style={S.labelOrange}>Operating Model</div>
          <h2 style={{ ...S.sectionH2, marginBottom: 40 }}>Accountability across the business.</h2>
          <div style={S.grid3}>
            {operatingModel.map((m) => (
              <div key={m.title} style={S.modelCard}>
                <div style={{ ...S.modelIconWrap, background: m.bg }}>{m.Icon}</div>
                <div style={S.modelTitle}>{m.title}</div>
                <div style={S.modelDesc}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={S.ctaSection}>
        <div style={S.ctaCard}>
          <h2 style={S.ctaH2}>See what the team is building.</h2>
          <p style={S.ctaSub}>Explore the platform, or talk to our team about your business.</p>
          <div style={S.ctaActions}>
            <button style={S.btnCtaOrange}>Get a Demo</button>
            <button style={S.btnCtaGhost}>About Zoiko One</button>
            <button style={S.btnCtaGhost}>Careers</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
