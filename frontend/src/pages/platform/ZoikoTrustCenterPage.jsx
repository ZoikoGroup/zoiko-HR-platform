import { useState, useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ─────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────── */
const IconLock = ({ size = 22, color = "white" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="2" />
    <path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1.5" fill={color} />
  </svg>
);
const IconGlobe = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
    <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9M3 12h18" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconUser = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="2" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconDoc = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="white" strokeWidth="2" />
    <path d="M9 8h6M9 12h6M9 16h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const IconStar = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2" fill="white" opacity="0.6" />
  </svg>
);
const IconPie = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="white" strokeWidth="2" />
    <path d="M12 12V2M12 12l8 4" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconFileBlue = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    <path d="M14 2v6h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconScale = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 3v18M3 7l9-4 9 4M5 10l-2 6h4l-2-6zM19 10l-2 6h4l-2-6z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconGrid = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="2" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="2" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth="2" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth="2" />
  </svg>
);
const IconPieSmall = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
    <path d="M12 12V3M12 12l7.5 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconChevron = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.22s" }}>
    <path d="M6 9l6 6 6-6" stroke="#4a3fc0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const trustCards = [
  {
    Icon: IconLock, bg: "#3b2fb0",
    title: "Security",
    desc: "Secure access, permissions, workflow control, auditability and integration security.",
    link: "View Security →",
  },
  {
    Icon: IconGlobe, bg: "#3b2fb0",
    title: "Privacy",
    desc: "How sensitive data is handled, processed and protected.",
    link: "View Privacy →",
  },
  {
    Icon: IconUser, bg: "#4a3fc0",
    title: "Access control",
    desc: "Roles, permissions, entities and administrator oversight.",
    link: "View Access Control →",
  },
  {
    Icon: IconDoc, bg: "#3b2fb0",
    title: "Audit & evidence",
    desc: "Decision trails, approval history and activity records.",
    link: "View Audit & Evidence →",
  },
  {
    Icon: IconStar, bg: "linear-gradient(135deg,#f97316,#a16207)",
    title: "Responsible AI",
    desc: "AI inside permission, policy and approval boundaries.",
    link: "View Responsible AI →",
  },
  {
    Icon: IconPie, bg: "#22b5d4",
    title: "Reliability & status",
    desc: "Availability, incidents and maintenance communication.",
    link: "View Status →",
  },
];

const vendorMiniCards = [
  { Icon: IconFileBlue, bg: "rgba(255,255,255,0.12)", title: "Security overview",  desc: "Shareable summary for review teams." },
  { Icon: IconScale,    bg: "rgba(255,255,255,0.12)", title: "Legal & policies",   desc: "Privacy, terms and data processing resources." },
  { Icon: IconGrid,     bg: "rgba(255,255,255,0.12)", title: "Procurement pack",   desc: "Materials for evaluation and approval." },
  { Icon: IconPieSmall, bg: "rgba(255,255,255,0.12)", title: "Reliability",        desc: "Status, uptime and incident history." },
];

const faqs = [
  { q: "Who should use the Trust Center?",
    a: "Procurement, IT, legal and security teams evaluating Zoiko One, as well as any business wanting to understand how the platform handles security, privacy, access, auditability and responsible AI." },
  { q: "Does the Trust Center include legal policies?",
    a: "Yes. Privacy Policy, Terms of Service, Cookie Policy, Data Processing Agreements and Acceptable Use Policy are all available directly — without requiring a sales conversation." },
  { q: "How is reliability communicated?",
    a: "Through live system status, incident history and uptime data — all published on the reliability page and updated in real-time during any service events." },
];

/* ─────────────────────────────────────────
   FAQ ITEM
───────────────────────────────────────── */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        border: "1.5px solid #e8e8f0",
        borderRadius: 14,
        padding: "20px 24px",
        marginBottom: 14,
        cursor: "pointer",
        background: "#fff",
        transition: "border-color 0.2s",
        ...(open ? { borderColor: "#c0c0e0" } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: "#1a1a4e" }}>{q}</span>
        <div style={{
          width: 30, height: 30, borderRadius: 8, background: "#f0f0fa",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <IconChevron open={open} />
        </div>
      </div>
      {open && <p style={{ fontSize: 14, color: "#666", lineHeight: 1.65, marginTop: 14, marginBottom: 0 }}>{a}</p>}
    </div>
  );
}

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

  /* ── Hero ── */
  hero: {
    position: "relative",
    minHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "80px 24px 60px",
    overflow: "hidden",
    background: "linear-gradient(160deg,#f0f0fa 0%,#ffffff 42%,#ddeeff 100%)",
  },
  blobTL: {
    position: "absolute", top: "-70px", left: "-80px",
    width: 430, height: 430, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(200,195,252,0.48) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  blobTR: {
    position: "absolute", top: "-60px", right: "-90px",
    width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(160,200,255,0.42) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto" },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 10,
    border: "1.5px solid #ddd", borderRadius: 50,
    padding: "6px 16px 6px 6px", marginBottom: 32, background: "#fff",
  },
  badgePill: {
    background: "#2d4fd6", color: "#fff",
    fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "4px 12px",
  },
  badgeText: { fontSize: 14, color: "#333" },
  heroH1: {
    fontSize: "clamp(34px,5vw,58px)", fontWeight: 800,
    lineHeight: 1.15, color: "#1a1a4e", marginBottom: 0,
  },
  heroBlue: { color: "#3b82f6" },
  heroSub: {
    fontSize: 16, color: "#555", lineHeight: 1.65,
    maxWidth: 800, margin: "22px auto 36px",
  },
  heroActions: { display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" },
  btnOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 30px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  btnOutline: {
    background: "#fff", color: "#1a1a4e",
    border: "1.5px solid #d0d0d0", borderRadius: 50,
    padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },

  /* ── Trust Hub ── */
  hubSection: { padding: "100px 24px", background: "#ffffff" },
  hubInner: { maxWidth: 1100, margin: "0 auto" },
  labelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 16,
  },
  sectionH2: {
    fontSize: "clamp(28px,4vw,44px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 56,
  },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 },
  trustCard: {
    border: "1.5px solid #eaeaea", borderRadius: 18,
    padding: "28px 24px", background: "#fff",
    display: "flex", flexDirection: "column",
  },
  cardIconWrap: {
    width: 50, height: 50, borderRadius: 13,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20, flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 10 },
  cardDesc: { fontSize: 13.5, color: "#888", lineHeight: 1.55, flex: 1, marginBottom: 18 },
  cardLink: {
    fontSize: 13.5, fontWeight: 600, color: "#3b2fb0",
    background: "none", border: "none", cursor: "pointer",
    padding: 0, textAlign: "left",
  },

  /* ── Vendor Review ── */
  vendorSection: {
    padding: "80px 60px",
    background: "linear-gradient(135deg,#2d1b8e 0%,#3a2fba 40%,#2b5fd8 80%,#3a80e0 100%)",
    display: "flex", alignItems: "center", gap: 80,
  },
  vendorLeft: { flex: 1, maxWidth: 440 },
  labelOrange: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    marginBottom: 18, display: "block",
  },
  vendorH2: {
    fontSize: "clamp(28px,4vw,42px)", fontWeight: 800,
    color: "#fff", lineHeight: 1.2, marginBottom: 20,
  },
  vendorDesc: { fontSize: 15, color: "rgba(255,255,255,0.78)", lineHeight: 1.65, marginBottom: 36 },
  btnVendor: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  vendorRight: {
    flex: 1, display: "grid",
    gridTemplateColumns: "1fr 1fr", gap: 14,
  },
  miniCard: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 14, padding: "20px 18px",
  },
  miniIconWrap: {
    width: 36, height: 36, borderRadius: 9,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  miniTitle: { fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 },
  miniDesc: { fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.45 },

  /* ── FAQ ── */
  faqSection: { padding: "100px 24px", background: "#ffffff" },
  faqInner: { maxWidth: 760, margin: "0 auto" },
  faqH2: {
    fontSize: "clamp(28px,4vw,42px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center", marginBottom: 48,
  },

  /* ── Bottom CTA ── */
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
  ctaSub: { fontSize: 15, color: "rgba(255,255,255,0.78)", marginBottom: 36, lineHeight: 1.55 },
  ctaActions: { display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" },
  btnCtaOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "15px 32px",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  btnCtaGhost: {
    background: "rgba(255,255,255,0.15)", color: "#fff",
    border: "1.5px solid rgba(255,255,255,0.28)",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoTrustCenterPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#ffffff", minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />

      {/* ── 1. HERO ── */}
      <section style={S.hero}>
        <div style={S.blobTL} />
        <div style={S.blobTR} />
        <div style={S.heroInner}>
          <div style={S.badge}>
            <span style={S.badgePill}>Trust Center</span>
            <span style={S.badgeText}>Governance &amp; assurance</span>
          </div>
          <h1 style={S.heroH1}>
            Everything enterprise<br />
            buyers need to <span style={S.heroBlue}>validate trust.</span>
          </h1>
          <p style={S.heroSub}>
            Review how Zoiko One approaches security, privacy, access control,
            auditability, reliability, governance, responsible AI and vendor evaluation
            for business-critical workflows.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Start Vendor Review &nbsp;→</button>
            <button style={S.btnOutline}>View Security Overview</button>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST RESOURCE HUB ── */}
      <section style={S.hubSection}>
        <div style={S.hubInner}>
          <div style={S.labelBlue}>Trust Resource Hub</div>
          <h2 style={S.sectionH2}>Approved trust resources, one<br />click away.</h2>
          <div style={S.grid3}>
            {trustCards.map(({ Icon, bg, title, desc, link }) => (
              <div key={title} style={S.trustCard}>
                <div style={{ ...S.cardIconWrap, background: bg }}>
                  <Icon size={22} />
                </div>
                <div style={S.cardTitle}>{title}</div>
                <div style={S.cardDesc}>{desc}</div>
                <button style={S.cardLink}>{link}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. VENDOR REVIEW ── */}
      <section style={S.vendorSection}>
        <div style={S.vendorLeft}>
          <span style={S.labelOrange}>For Procurement, IT &amp; Legal</span>
          <h2 style={S.vendorH2}>Run a structured vendor review.</h2>
          <p style={S.vendorDesc}>
            Procurement, IT, legal and security teams can use the vendor-review
            route to evaluate Zoiko One against their requirements — without being
            forced into a sales-only path.
          </p>
          <button style={S.btnVendor}>Start Vendor Review &nbsp;→</button>
        </div>
        <div style={S.vendorRight}>
          {vendorMiniCards.map(({ Icon, bg, title, desc }) => (
            <div key={title} style={S.miniCard}>
              <div style={{ ...S.miniIconWrap, background: bg }}>
                <Icon size={20} />
              </div>
              <div style={S.miniTitle}>{title}</div>
              <div style={S.miniDesc}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. FAQs ── */}
      <section style={S.faqSection}>
        <div style={S.faqInner}>
          <div style={S.labelBlue}>Trust Center FAQs</div>
          <h2 style={S.faqH2}>Common questions.</h2>
          {faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── 5. BOTTOM CTA ── */}
      <section style={S.ctaSection}>
        <div style={S.ctaCard}>
          <h2 style={S.ctaH2}>Validate Zoiko One with confidence.</h2>
          <p style={S.ctaSub}>
            Start a vendor review, view the security overview, or check live status.
          </p>
          <div style={S.ctaActions}>
            <button style={S.btnCtaOrange}>Start Vendor Review</button>
            <button style={S.btnCtaGhost}>Get a Demo</button>
            <button style={S.btnCtaGhost}>Check System Status</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
