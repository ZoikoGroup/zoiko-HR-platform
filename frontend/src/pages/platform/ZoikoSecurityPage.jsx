import { useState, useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ─── SVG ICONS ─── */
const IconKey = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="8" cy="12" r="4" stroke="white" strokeWidth="2"/>
    <path d="M12 12h8M18 10v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M14 12v0" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);
const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="2"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconArrows = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M7 16L17 16M14 13l3 3-3 3M17 8L7 8M10 5L7 8l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconDoc = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M9 8h6M9 12h6M9 16h4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IconCopy = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="8" y="8" width="12" height="14" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M4 16V4a2 2 0 012-2h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconStar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l7 3v6c0 5-3.5 8.5-7 10C8.5 19.5 5 16 5 11V5l7-3z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M14 2v6h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconPie = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="white" strokeWidth="2"/>
    <path d="M12 12V2M12 12l7 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M2 8l10 7 10-7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconChevron = ({ open }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
    <path d="M6 9l6 6 6-6" stroke="#4a3fc0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─── DATA ─── */
const principles = [
  { Icon: IconKey,    bg: "#3b2fb0", title: "Secure access",              desc: "Authentication and secure entry into workspaces, with enterprise SSO and MFA support." },
  { Icon: IconUser,   bg: "#3b2fb0", title: "Permission-aware experience", desc: "Role-based access so users only see and do what their role allows." },
  { Icon: IconArrows, bg: "#3b2fb0", title: "Governed workflows",          desc: "Approvals, policy checks and routing keep actions inside control." },
  { Icon: IconDoc,    bg: "#3b2fb0", title: "Auditability",                desc: "Audit-ready activity records, decision trails and document history." },
  { Icon: IconCopy,   bg: "#22b5d4", title: "Integration control",         desc: "Controlled, scoped integrations across the operating environment." },
  { Icon: IconStar,   bg: "linear-gradient(135deg,#f97316,#a16207)", title: "Responsible AI boundaries", desc: "AI stays inside permissions and policy: no restricted-data exposure, no approval bypass, no irreversible action without authorization." },
];

const enterpriseCards = [
  { Icon: IconShield, title: "Vendor review",      desc: "Start a structured vendor review." },
  { Icon: IconFile,   title: "Security overview",  desc: "Shareable security summary." },
  { Icon: IconPie,    title: "System status",      desc: "Availability and incidents." },
  { Icon: IconMail,   title: "Contact security",   desc: "Reach the security team." },
];

const faqs = [
  { q: "Can my business trust Zoiko One with sensitive workflows?",
    a: "Yes. Zoiko One is built around role-based access, governed workflows, and audit-ready records — ensuring sensitive operations remain controlled, visible, and policy-compliant at every step." },
  { q: "Does Zoiko One have certifications?",
    a: "Security certifications and compliance statements are published only when verified and approved. Visit the Trust Center for current evidence-based documentation." },
  { q: "How is AI kept safe?",
    a: "Governed AI assistance operates strictly inside user permissions and policy boundaries — no restricted-data exposure, no approval bypass, and no irreversible actions without proper authorization." },
];

/* ─── ACCORDION ITEM ─── */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...S.faqRow, ...(open ? S.faqRowOpen : {}) }} onClick={() => setOpen(!open)}>
      <div style={S.faqTop}>
        <span style={S.faqQ}>{q}</span>
        <div style={S.faqIcon}><IconChevron open={open} /></div>
      </div>
      {open && <p style={S.faqA}>{a}</p>}
    </div>
  );
}

/* ─── STYLES ─── */
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

  /* Hero */
  hero: {
    position: "relative",
    minHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "80px 24px",
    overflow: "hidden",
    backgroundColor: "#f5f4f2",
    background: "linear-gradient(120deg, rgba(255,195,130,0.45) 0%, rgba(250,248,245,0.98) 38%, rgba(250,248,245,0.98) 62%, rgba(170,205,240,0.45) 100%)",
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
    pointerEvents: "none",
  },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto" },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 10,
    border: "1.5px solid #ddd", borderRadius: 999,
    padding: "6px 16px 6px 6px", marginBottom: 32, background: "#fff",
  },
  badgePill: {
    background: "#3b5bdb", color: "#fff", fontSize: 12, fontWeight: 700,
    borderRadius: 999, padding: "4px 12px",
  },
  badgeText: { fontSize: 14, color: "#333" },
  heroH1: {
    fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
    color: "#0B1C3F", margin: "0 0 20px",
  },
  heroOrange: { color: "#f97316" },
  heroSub: {
    fontSize: 16, color: "#4B5563", lineHeight: 1.7,
    maxWidth: 660, margin: "0 auto 28px",
  },
  heroActions: { display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" },
  btnOrange: {
    background: "linear-gradient(135deg, #F97316, #EA580C)", color: "#fff", border: "none",
    borderRadius: 999, padding: "14px 32px", fontSize: 16,
    fontWeight: 600, cursor: "pointer", display: "flex",
    alignItems: "center", gap: 8,
  },
  btnOutline: {
    background: "rgba(255,255,255,0.75)", color: "#1a1a2e", border: "1.5px solid rgba(0,0,0,0.12)",
    borderRadius: 999, padding: "14px 32px", fontSize: 16,
    fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)",
  },

  /* Principles */
  principlesSection: { padding: "100px 24px", background: "#ffffff" },
  principlesInner: { maxWidth: 1100, margin: "0 auto" },
  sectionLabelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionLabelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionH2: {
    fontSize: "clamp(28px,4vw,44px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 56,
  },
  grid3: {
    display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20,
  },
  principleCard: {
    border: "1.5px solid #eaeaea", borderRadius: 18,
    padding: "28px 24px", background: "#fff",
  },
  cardIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20, flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 10 },
  cardDesc: { fontSize: 13.5, color: "#888", lineHeight: 1.55 },

  /* Enterprise */
  enterpriseSection: {
    padding: "100px 48px",
    background: "linear-gradient(135deg,#2d1b8e 0%,#3a2fba 40%,#2b5fd8 80%,#3a88e8 100%)",
    textAlign: "center",
  },
  enterpriseH2: {
    fontSize: "clamp(28px,4vw,44px)", fontWeight: 800,
    color: "#fff", lineHeight: 1.2, marginBottom: 16,
  },
  enterpriseSub: {
    fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 48, lineHeight: 1.55,
  },
  grid4: {
    display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16,
    maxWidth: 1100, margin: "0 auto 40px",
  },
  entCard: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 16, padding: "24px 20px", textAlign: "left",
  },
  entIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    background: "rgba(255,255,255,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  entTitle: { fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 },
  entDesc: { fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 },
  entFootnote: { fontSize: 12, color: "rgba(255,255,255,0.45)", maxWidth: 700, margin: "0 auto" },

  /* FAQ */
  faqSection: { padding: "100px 24px", background: "#ffffff" },
  faqInner: { maxWidth: 760, margin: "0 auto" },
  faqH2: {
    fontSize: "clamp(28px,4vw,42px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center", marginBottom: 48,
  },
  faqRow: {
    border: "1.5px solid #eaeaea", borderRadius: 14,
    padding: "20px 24px", marginBottom: 14,
    cursor: "pointer", background: "#fff",
    transition: "border-color 0.2s",
  },
  faqRowOpen: { borderColor: "#c0c0e0" },
  faqTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  faqQ: { fontSize: 15, fontWeight: 500, color: "#1a1a4e" },
  faqIcon: {
    width: 30, height: 30, borderRadius: 8,
    background: "#f0f0fa",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  faqA: { fontSize: 14, color: "#666", lineHeight: 1.65, marginTop: 14 },

  /* Bottom CTA */
  ctaSection: { padding: "60px 28px 80px", background: "#f5f5fb" },
  ctaCard: {
    maxWidth: 1060, margin: "0 auto",
    background: "linear-gradient(135deg,#5b2d8e 0%,#4a3fc0 35%,#3a6fd8 70%,#4ab0f5 100%)",
    borderRadius: 22, padding: "72px 48px", textAlign: "center",
  },
  ctaH2: {
    fontSize: "clamp(26px,4vw,40px)", fontWeight: 800,
    color: "#fff", marginBottom: 14, lineHeight: 1.2,
  },
  ctaSub: { fontSize: 15, color: "rgba(255,255,255,0.8)", marginBottom: 36, lineHeight: 1.55 },
  ctaActions: { display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" },
  btnCtaOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  btnCtaGhost: {
    background: "rgba(255,255,255,0.15)", color: "#fff",
    border: "1.5px solid rgba(255,255,255,0.3)",
    borderRadius: 50, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
};

/* ─── PAGE ─── */
export default function ZoikoSecurityPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div style={S.page}>

      <LandingHeader />

      {/* ── 1. HERO ── */}
      <section style={S.hero}>
        <div style={S.heroOverlay} />
        <div style={S.heroInner}>
          <div style={S.badge}>
            <span style={S.badgePill}>Platform</span>
            <span style={S.badgeText}>Security &amp; trust</span>
          </div>
          <h1 style={S.heroH1}>
            Security built for connected<br />
            business <span style={S.heroOrange}>operations.</span>
          </h1>
          <p style={S.heroSub}>
            Zoiko One is designed to protect business-critical workflows through secure access,
            role-based permissions, administrator controls, audit‑ ready activity records,
            integration security and responsible AI boundaries.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Visit Trust Center &nbsp;→</button>
            <button style={S.btnOutline}>Get a Demo</button>
          </div>
        </div>
      </section>

      {/* ── 2. SECURITY PRINCIPLES ── */}
      <section style={S.principlesSection}>
        <div style={S.principlesInner}>
          <div style={S.sectionLabelBlue}>Security Principles</div>
          <h2 style={S.sectionH2}>How Zoiko One protects your<br />operations.</h2>
          <div style={S.grid3}>
            {principles.map(({ Icon, bg, title, desc }) => (
              <div key={title} style={S.principleCard}>
                <div style={{ ...S.cardIconWrap, background: bg }}><Icon /></div>
                <div style={S.cardTitle}>{title}</div>
                <div style={S.cardDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. FOR ENTERPRISE REVIEWERS ── */}
      <section style={S.enterpriseSection}>
        <div style={S.sectionLabelOrange}>For Enterprise Reviewers</div>
        <h2 style={S.enterpriseH2}>
          Built for procurement, IT and<br />security teams.
        </h2>
        <p style={S.enterpriseSub}>
          Fast routes to the resources serious buyers need — without sales-only gating.
        </p>
        <div style={S.grid4}>
          {enterpriseCards.map(({ Icon, title, desc }) => (
            <div key={title} style={S.entCard}>
              <div style={S.entIconWrap}><Icon /></div>
              <div style={S.entTitle}>{title}</div>
              <div style={S.entDesc}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={S.entFootnote}>
          Security information is evidence-based. Certifications and compliance statements
          are published only when verified and approved.
        </p>
      </section>

      {/* ── 4. FAQs ── */}
      <section style={S.faqSection}>
        <div style={S.faqInner}>
          <div style={S.sectionLabelBlue}>Security FAQs</div>
          <h2 style={S.faqH2}>Common questions.</h2>
          {faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── 5. BOTTOM CTA ── */}
      <section style={S.ctaSection}>
        <div style={S.ctaCard}>
          <h2 style={S.ctaH2}>Validate trust before you buy.</h2>
          <p style={S.ctaSub}>Start a vendor review or talk to our security team.</p>
          <div style={S.ctaActions}>
            <button style={S.btnCtaOrange}>Visit Trust Center</button>
            <button style={S.btnCtaGhost}>Get a Demo</button>
            <button style={S.btnCtaGhost}>Contact Security</button>
          </div>
        </div>
      </section>

      <Footer />

    </div>
  );
}