import { useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────── */
const IconBraces = ({ color = "white", size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconKey = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="8" cy="12" r="4" stroke="white" strokeWidth="2"/>
    <path d="M12 12h8M18 10v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M14 12v0" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);
const IconBolt = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconGrid = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="2"/>
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="2"/>
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth="2"/>
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth="2"/>
  </svg>
);
const IconCopy = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="8" y="8" width="12" height="14" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M4 16V4a2 2 0 012-2h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconPie = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
    <path d="M12 12V3M12 12l8 4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconLock = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M8 11V7a4 4 0 018 0v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="16" r="1.5" fill="white"/>
  </svg>
);
const IconArrows = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M7 16L17 16M14 13l3 3-3 3M17 8L7 8M10 5L7 8l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconDoc = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M9 8h6M9 12h6M9 16h4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const docCards = [
  {
    Icon: IconBraces, bg: "#22b5d4",
    title: "API Reference",
    desc: "Endpoints, methods, request and response formats, parameters, pagination, errors and examples.",
    link: "Open API Reference →",
  },
  {
    Icon: IconKey, bg: "#3b2fb0",
    title: "Authentication",
    desc: "Tokens, scopes and how integrations stay within approved permission boundaries.",
    link: "Auth Guide →",
  },
  {
    Icon: IconBolt, bg: "#f97316",
    title: "Webhooks & Events",
    desc: "Secure, verified, rate-aware event delivery governed by workspace configuration.",
    link: "Webhooks →",
  },
  {
    Icon: IconGrid, bg: "#4a3fc0",
    title: "Sandbox",
    desc: "Test against a safe environment before going live.",
    link: "Access Sandbox →",
  },
  {
    Icon: IconCopy, bg: "#3b5bd5",
    title: "SDKs & Connectors",
    desc: "Libraries and approved connectors for common stacks.",
    link: "View SDKs →",
  },
  {
    Icon: IconPie, bg: "#4a3fc0",
    title: "API Status",
    desc: "Live API availability and incident communication.",
    link: "View Status →",
  },
];

const principles = [
  {
    Icon: IconKey, bg: "#3b2fb0",
    title: "Permission-aware",
    desc: "Every call respects roles, scopes and workspace settings.",
  },
  {
    Icon: IconLock, bg: "#22b5d4",
    title: "Secure by default",
    desc: "Token-based auth with scoped access and safe handling.",
  },
  {
    Icon: IconArrows, bg: "#6c5dd3",
    title: "Workflow-respecting",
    desc: "API actions honor approvals and policy — no bypass.",
  },
  {
    Icon: IconDoc, bg: "#3b2fb0",
    title: "Architecture-aligned",
    desc: "Organized around pillars, products and the shared spine.",
  },
];

/* ─────────────────────────────────────────
   CODE BLOCK CONTENT
───────────────────────────────────────── */
const codeLines = [
  { text: "# Authenticated request — scoped to your workspace", color: "#6b7db3" },
  { text: "curl https://api.zoiko.one/v1/people \\", color: "#e2e8ff", bold: true, parts: [
    { t: "curl ", c: "#e2e8ff" },
    { t: "https://api.zoiko.one/v1/people", c: "#e2e8ff" },
    { t: " \\", c: "#6b7db3" },
  ]},
  { text: '  -H "Authorization: Bearer $ZOIKO_TOKEN" \\', parts: [
    { t: "  -H ", c: "#e2e8ff" },
    { t: '"Authorization: Bearer $ZOIKO_TOKEN"', c: "#f6c90e" },
    { t: " \\", c: "#6b7db3" },
  ]},
  { text: '  -H "Zoiko-Workspace: ws_8f2a"', parts: [
    { t: "  -H ", c: "#e2e8ff" },
    { t: '"Zoiko-Workspace: ws_8f2a"', c: "#f6c90e" },
  ]},
  { text: "", color: "#transparent" },
  { text: "# 200 OK", color: "#6b7db3" },
  { text: '{ "data": [ { "id": "emp_1029",', parts: [
    { t: '{ ', c: "#e2e8ff" },
    { t: '"data"', c: "#64b5f6" },
    { t: ': [ { ', c: "#e2e8ff" },
    { t: '"id"', c: "#64b5f6" },
    { t: ': ', c: "#e2e8ff" },
    { t: '"emp_1029"', c: "#a5d6a7" },
    { t: ',', c: "#e2e8ff" },
  ]},
  { text: '    "name": "Aisha Malik",', parts: [
    { t: '    ', c: "#e2e8ff" },
    { t: '"name"', c: "#64b5f6" },
    { t: ': ', c: "#e2e8ff" },
    { t: '"Aisha Malik"', c: "#a5d6a7" },
    { t: ',', c: "#e2e8ff" },
  ]},
  { text: '    "status": "active" } ],', parts: [
    { t: '    ', c: "#e2e8ff" },
    { t: '"status"', c: "#64b5f6" },
    { t: ': ', c: "#e2e8ff" },
    { t: '"active"', c: "#a5d6a7" },
    { t: ' } ],', c: "#e2e8ff" },
  ]},
  { text: '  "next_cursor": "c_2" }', parts: [
    { t: '  ', c: "#e2e8ff" },
    { t: '"next_cursor"', c: "#64b5f6" },
    { t: ': ', c: "#e2e8ff" },
    { t: '"c_2"', c: "#a5d6a7" },
    { t: ' }', c: "#e2e8ff" },
  ]},
];

/* ─────────────────────────────────────────
   STYLES
───────────────────────────────────────── */
const S = {
  page: {
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace",
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
    minHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 24px",
    overflow: "hidden",
    backgroundColor: "#f5f4f2",
    background: "linear-gradient(120deg, rgba(255,195,130,0.45) 0%, rgba(250,248,245,0.98) 38%, rgba(250,248,245,0.98) 62%, rgba(170,205,240,0.45) 100%)",
  },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 1200, textAlign: "left" },
  heroGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" },
  blobTR: {
    position: "absolute", inset: 0,
    background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
    pointerEvents: "none",
  },
  heroLeft: { position: "relative", zIndex: 1, maxWidth: 480 },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.92)",
    borderRadius: 999, padding: "6px 16px",
    marginBottom: 28, fontSize: 14, fontWeight: 500,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  badgePill: {
    background: "#1A3A8C", color: "#fff",
    borderRadius: 999, padding: "2px 10px",
    fontSize: 12, fontWeight: 700,
  },
  badgePath: {
    color: "#555",
  },
  heroH1: {
    fontSize: "clamp(36px,4.5vw,56px)", fontWeight: 800,
    lineHeight: 1.1, color: "#1a1a4e", marginBottom: 0,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  heroBlue: { color: "#3b82f6" },
  heroSub: {
    fontSize: 15.5, color: "#666", lineHeight: 1.65,
    maxWidth: 420, margin: "20px 0 32px",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  heroActions: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" },
  btnOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  btnOutline: {
    background: "#fff", color: "#1a1a4e",
    border: "1.5px solid #d0d0d0", borderRadius: 50,
    padding: "13px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  heroRight: { position: "relative", zIndex: 1, display: "flex", justifyContent: "center" },

  /* Code card */
  codeCard: {
    background: "#171a3a",
    borderRadius: 20, padding: "28px 32px",
    width: "100%", maxWidth: 500,
    boxShadow: "0 20px 60px rgba(30,20,100,0.25)",
  },
  codeLine: {
    fontFamily: "'Fira Code','Courier New',monospace",
    fontSize: 13.5, lineHeight: "1.8",
    whiteSpace: "pre",
  },

  /* ── DOC HUB ── */
  docHubSection: { padding: "100px 24px", background: "#ffffff" },
  docHubInner: { maxWidth: 1100, margin: "0 auto" },
  labelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  labelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  sectionH2: {
    fontSize: "clamp(26px,3.5vw,42px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 52,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  grid3x2: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 },
  docCard: {
    border: "1.5px solid #eaeaea", borderRadius: 18,
    padding: "28px 24px", background: "#fff",
    display: "flex", flexDirection: "column",
  },
  cardIconWrap: {
    width: 50, height: 50, borderRadius: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 10,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  cardDesc: {
    fontSize: 13.5, color: "#888", lineHeight: 1.55, flex: 1, marginBottom: 20,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  cardLink: {
    fontSize: 13.5, fontWeight: 600, color: "#3b2fb0",
    background: "none", border: "none", cursor: "pointer",
    padding: 0, textAlign: "left",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },

  /* ── PRINCIPLES ── */
  principlesSection: { padding: "80px 24px 100px", background: "#f5f5fb" },
  principlesInner: { maxWidth: 1100, margin: "0 auto" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 },
  principleCard: {
    border: "1.5px solid #eaeaea", borderRadius: 18,
    padding: "28px 22px", background: "#fff",
  },

  /* ── BOTTOM CTA ── */
  ctaSection: { padding: "60px 28px 80px", background: "#f5f5fb" },
  ctaCard: {
    maxWidth: 1060, margin: "0 auto",
    background: "linear-gradient(135deg,#5b2d8e 0%,#4a3fc0 35%,#3a6fd8 70%,#4ab0f5 100%)",
    borderRadius: 22, padding: "72px 48px", textAlign: "center",
  },
  ctaH2: {
    fontSize: "clamp(26px,4vw,40px)", fontWeight: 800,
    color: "#fff", marginBottom: 14, lineHeight: 1.2,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  ctaSub: {
    fontSize: 15, color: "rgba(255,255,255,0.78)",
    marginBottom: 36, lineHeight: 1.55,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  ctaActions: { display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" },
  btnCtaOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 32px",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  btnCtaGhost: {
    background: "rgba(255,255,255,0.15)", color: "#fff",
    border: "1.5px solid rgba(255,255,255,0.28)",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoApiDocsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace", background: "#ffffff", minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />

      {/* ── 1. HERO ── */}
      <section style={S.hero}>
        <div style={S.blobTR} />

        <div style={S.heroInner}>
          {/* Badge */}
          <div style={S.badge}>
            <span style={S.badgePill}>Developers</span>
            <span style={S.badgePath}>/developers/api</span>
          </div>

          <div style={S.heroGrid}>
            {/* Left */}
            <div style={S.heroLeft}>
              <h1 style={S.heroH1}>
                Build on the Zoiko<br />
                One <span style={S.heroBlue}>API.</span>
              </h1>
              <p style={S.heroSub}>
                Connect business operations programmatically — with a
                permission-aware, governed API that protects security,
                privacy, workflows and platform integrity.
              </p>
              <div style={S.heroActions}>
                <button style={S.btnOrange}>View API Reference &nbsp;→</button>
                <button style={S.btnOutline}>Access Sandbox</button>
              </div>
            </div>

            {/* Right — Code card */}
            <div style={S.heroRight}>
              <div style={S.codeCard}>
                {codeLines.map((line, i) => (
                  <div key={i} style={S.codeLine}>
                    {line.parts ? (
                      line.parts.map((p, j) => (
                        <span key={j} style={{ color: p.c }}>{p.t}</span>
                      ))
                    ) : (
                      <span style={{ color: line.color || "#e2e8ff" }}>{line.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. DEVELOPER DOC HUB ── */}
      <section style={S.docHubSection}>
        <div style={S.docHubInner}>
          <div style={S.labelBlue}>Developer Documentation Hub</div>
          <h2 style={S.sectionH2}>Clear technical entry points.</h2>
          <div style={S.grid3x2}>
            {docCards.map(({ Icon, bg, title, desc, link }) => (
              <div key={title} style={S.docCard}>
                <div style={{ ...S.cardIconWrap, background: bg }}><Icon /></div>
                <div style={S.cardTitle}>{title}</div>
                <div style={S.cardDesc}>{desc}</div>
                <button style={S.cardLink}>{link}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. API PRINCIPLES ── */}
      <section style={S.principlesSection}>
        <div style={S.principlesInner}>
          <div style={S.labelOrange}>API Principles</div>
          <h2 style={{ ...S.sectionH2, marginBottom: 52 }}>
            Power without weakening<br />governance.
          </h2>
          <div style={S.grid4}>
            {principles.map(({ Icon, bg, title, desc }) => (
              <div key={title} style={S.principleCard}>
                <div style={{ ...S.cardIconWrap, background: bg }}><Icon /></div>
                <div style={S.cardTitle}>{title}</div>
                <div style={{ ...S.cardDesc, marginBottom: 0 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. BOTTOM CTA ── */}
      <section style={S.ctaSection}>
        <div style={S.ctaCard}>
          <h2 style={S.ctaH2}>Start building with Zoiko One.</h2>
          <p style={S.ctaSub}>
            Explore the reference, grab a sandbox key, and connect your systems.
          </p>
          <div style={S.ctaActions}>
            <button style={S.btnCtaOrange}>View API Reference</button>
            <button style={S.btnCtaGhost}>Explore Integrations</button>
            <button style={S.btnCtaGhost}>Talk to a Specialist</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
