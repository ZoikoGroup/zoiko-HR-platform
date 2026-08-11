import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────── */
const IconBuild = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M3 10h18" stroke="white" strokeWidth="2"/>
  </svg>
);
const IconDesign = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 19l7-7 3 3-7 7-3-3z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 2l7.586 7.586" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconMic = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="2" width="6" height="12" rx="3" stroke="white" strokeWidth="2"/>
    <path d="M5 10v2a7 7 0 0014 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 19v3M8 22h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconSell = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 11l18-8-8 18-2-8-8-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconSupport = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
const IconImplement = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
    <path d="M12 7v5l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconOperate = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="2"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="white" strokeWidth="1.6"/>
  </svg>
);
const IconSparkle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

const IconAccountable = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
    <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="2"/>
  </svg>
);
const IconCustomer = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 11l18-8-8 18-2-8-8-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconTrust = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const roleFamilies = [
  { Icon: IconBuild,      bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)", title: "Build",   desc: "Engineering across the platform, products and shared spine.", link: "View Build roles →" },
  { Icon: IconDesign,     bg: "linear-gradient(135deg,#3b9ef5,#22b5d4)", title: "Design",  desc: "Product design, UX and the Zoiko One design system.", link: "View Design roles →" },
  { Icon: IconMic,        bg: "linear-gradient(135deg,#f97316,#fb923c)", title: "Secure",  desc: "Security, trust, responsible AI and platform governance.", link: "View Security roles →" },
  { Icon: IconSell,       bg: "linear-gradient(135deg,#6c5dd3,#7c6de3)", title: "Sell",    desc: "Sales, partnerships and commercial growth.", link: "View Sales roles →" },
  { Icon: IconSupport,    bg: "linear-gradient(135deg,#3b9ef5,#22b5d4)", title: "Support", desc: "Customer support, success and enablement.", link: "View Support roles →" },
  { Icon: IconImplement,  bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)", title: "Implement", desc: "Onboarding, implementation and migration.", link: "View Implementation roles →" },
  { Icon: IconOperate,    bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)", title: "Operate", desc: "Finance, people, operations and corporate functions.", link: "View Operations roles →" },
  { Icon: IconSparkle,    bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)", title: "Don't see a fit?", desc: "Join the talent community and we'll reach out.", link: "Join Talent Community →" },
];

const culture = [
  { Icon: IconAccountable, bg: "linear-gradient(135deg,#2d4fd6,#3b5bd5)", title: "Accountable",      desc: "Clear ownership and outcomes over activity." },
  { Icon: IconCustomer,    bg: "linear-gradient(135deg,#f97316,#fb923c)", title: "Customer-driven",  desc: "We build for real operating problems." },
  { Icon: IconTrust,       bg: "linear-gradient(135deg,#3b2fb0,#4a3fc0)", title: "Trust-first",      desc: "Security and responsible AI are built in." },
];

const openRoles = [
  { title: "Senior Platform Engineer", meta: "Build · Remote / Hybrid" },
  { title: "Product Designer",         meta: "Design · Remote" },
  { title: "Security Engineer",        meta: "Secure · Remote / Hybrid" },
  { title: "Account Executive",        meta: "Sell · Field / Remote" },
  { title: "Implementation Consultant",meta: "Implement · Remote" },
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

  hero: {
    position: "relative",
    minHeight: "78vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "80px 24px 60px",
    overflow: "hidden",
    background: "linear-gradient(135deg,#fff5ef 0%,#f8f8ff 35%,#eeeeff 65%,#e8eeff 100%)",
  },
  blobL: {
    position: "absolute", top: "-60px", left: "-80px",
    width: 420, height: 420, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(255,200,160,0.5) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  blobR: {
    position: "absolute", top: "-40px", right: "-80px",
    width: 480, height: 480, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(185,180,252,0.42) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto" },

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
    fontSize: "clamp(28px,4.2vw,44px)", fontWeight: 800,
    lineHeight: 1.2, color: "#1a1a4e", marginBottom: 0,
  },
  heroOrange: { color: "#f97316" },

  heroSub: {
    fontSize: 15, color: "#666", lineHeight: 1.6,
    maxWidth: 760, margin: "20px auto 32px",
  },

  heroActions: { display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 },
  btnOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  btnOutline: {
    background: "#fff", color: "#1a1a4e",
    border: "1.5px solid #d0d0d0", borderRadius: 50,
    padding: "13px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  footNote: {
    display: "inline-block",
    border: "1.5px solid #e0e0ee", borderRadius: 50,
    padding: "8px 20px", fontSize: 13, color: "#5b4fc0",
    background: "rgba(255,255,255,0.7)",
  },

  rolesSection: { padding: "100px 24px 80px", background: "#ffffff" },
  rolesInner: { maxWidth: 1100, margin: "0 auto" },

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
    lineHeight: 1.2, marginBottom: 52,
  },

  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 },
  roleCard: {
    border: "1.5px solid #eaeaea", borderRadius: 16,
    padding: "24px 20px", background: "#fff",
  },
  roleIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  roleTitle: { fontSize: 14.5, fontWeight: 700, color: "#1a1a4e", marginBottom: 8 },
  roleDesc: { fontSize: 12.5, color: "#888", lineHeight: 1.5, marginBottom: 14 },
  roleLink: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 12.5, fontWeight: 600, color: "#3b2fb0", padding: 0,
  },

  cultureSection: { padding: "80px 24px 100px", background: "#f5f5fb" },
  cultureInner: { maxWidth: 1000, margin: "0 auto" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 },
  cultureCard: {
    border: "1.5px solid #eaeaea", borderRadius: 16,
    padding: "26px 22px", background: "#fff",
  },
  cultureIconWrap: {
    width: 46, height: 46, borderRadius: 13,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  cultureTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 8 },
  cultureDesc: { fontSize: 13, color: "#888", lineHeight: 1.5 },

  openRolesSection: { padding: "80px 24px 100px", background: "#ffffff" },
  openRolesInner: { maxWidth: 800, margin: "0 auto" },
  rolesList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 },
  roleRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    border: "1.5px solid #eaeaea", borderRadius: 14,
    padding: "18px 24px", gap: 16,
  },
  roleRowTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 4 },
  roleRowMeta: { fontSize: 13, color: "#999" },
  expressBtn: {
    background: "#fff", border: "1.5px solid #d8d8e8",
    borderRadius: 50, padding: "9px 18px",
    fontSize: 13.5, fontWeight: 700, color: "#1a1a4e", cursor: "pointer",
    whiteSpace: "nowrap",
  },
  privacyLink: {
    display: "block", textAlign: "center",
    fontSize: 13.5, fontWeight: 600, color: "#3b2fb0",
    textDecoration: "none", background: "none", border: "none", cursor: "pointer",
    margin: "0 auto",
  },

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

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoCareersPage() {
  return (
    <div style={S.page}>
      <LandingHeader />

      <section style={S.hero}>
        <div style={S.blobL} />
        <div style={S.blobR} />
        <div style={S.heroInner}>
          <div style={S.badge}>
            <span style={S.badgePill}>Company</span>
            <span style={S.badgeText}>Careers</span>
          </div>
          <h1 style={S.heroH1}>
            Build the business- operations platform<br />
            modern companies will <span style={S.heroOrange}>run on.</span>
          </h1>
          <p style={S.heroSub}>
            Join Zoiko One to help build, design, sell, support, secure and scale a
            connected platform for people, money, work, supply, control, documents,
            approvals, integrations and AI-assisted business operations.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>View Open Roles &nbsp;→</button>
            <button style={S.btnOutline}>Join Talent Community</button>
          </div>
          <div style={S.footNote}>Opportunities vary by location, role and hiring need.</div>
        </div>
      </section>

      <section style={S.rolesSection}>
        <div style={S.rolesInner}>
          <div style={S.labelPurple}>Role Families</div>
          <h2 style={S.sectionH2}>Where you could make an impact.</h2>
          <div style={S.grid4}>
            {roleFamilies.map(({ Icon, bg, title, desc, link }) => (
              <div key={title} style={S.roleCard}>
                <div style={{ ...S.roleIconWrap, background: bg }}><Icon /></div>
                <div style={S.roleTitle}>{title}</div>
                <div style={S.roleDesc}>{desc}</div>
                <button style={S.roleLink}>{link}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={S.cultureSection}>
        <div style={S.cultureInner}>
          <div style={S.labelOrange}>Our Culture</div>
          <h2 style={{ ...S.sectionH2, marginBottom: 40 }}>How we work.</h2>
          <div style={S.grid3}>
            {culture.map(({ Icon, bg, title, desc }) => (
              <div key={title} style={S.cultureCard}>
                <div style={{ ...S.cultureIconWrap, background: bg }}><Icon /></div>
                <div style={S.cultureTitle}>{title}</div>
                <div style={S.cultureDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={S.openRolesSection}>
        <div style={S.openRolesInner}>
          <div style={S.labelPurple}>Open Roles</div>
          <h2 style={{ ...S.sectionH2, marginBottom: 8 }}>Current opportunities.</h2>
          <p style={{ textAlign: "center", fontSize: 14, color: "#999", marginBottom: 40 }}>
            Role listings are illustrative placeholders pending an integrated ATS.
          </p>
          <div style={S.rolesList}>
            {openRoles.map((r) => (
              <div key={r.title} style={S.roleRow}>
                <div>
                  <div style={S.roleRowTitle}>{r.title}</div>
                  <div style={S.roleRowMeta}>{r.meta}</div>
                </div>
                <button style={S.expressBtn}>Express interest</button>
              </div>
            ))}
          </div>
          <button style={S.privacyLink}>Read Candidate Privacy Notice</button>
        </div>
      </section>

      <section style={S.ctaSection}>
        <div style={S.ctaCard}>
          <h2 style={S.ctaH2}>Help build what businesses run on.</h2>
          <p style={S.ctaSub}>
            Explore roles or join the talent community — we'll reach out when<br />
            there's a fit.
          </p>
          <div style={S.ctaActions}>
            <button style={S.btnCtaOrange}>View Open Roles</button>
            <button style={S.btnCtaGhost}>Join Talent Community</button>
            <button style={S.btnCtaGhost}>About Zoiko One</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
