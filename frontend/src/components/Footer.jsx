import { useState } from "react";
import { Link } from "react-router-dom";

const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect x="2" y="9" width="4" height="12"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.84L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
  </svg>
);

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const ZoikoLogo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <div style={{
      width: "36px", height: "36px", borderRadius: "8px",
      background: "linear-gradient(135deg, #f5a623 0%, #f76b1c 50%, #3b82f6 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden"
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 17L12 5l8 12H4z" fill="white" opacity="0.9"/>
        <path d="M7 17l5-8 5 8" fill="none" stroke="white" strokeWidth="1.5"/>
      </svg>
    </div>
    <span style={{ color: "white", fontWeight: "700", fontSize: "18px", letterSpacing: "-0.3px" }}>
      ZoikoOne<sup style={{ fontSize: "8px", fontWeight: "400", verticalAlign: "super" }}>™</sup>
    </span>
  </div>
);

const navData = {
  PLATFORM: ["Overview", { label: "How Zoiko One Works", href: "/how-it-works" }, { label: "Security", href: "/security" }, { label: "Trust Center", href: "/trust-center" }, { label: "Integrations", href: "/integrations" }, { label: "API Documentation", href: "/api-documentation" }, { label: "System Status", href: "/system-status" }],
  PRODUCTS: [
    { label: "Zoiko HR", href: "/products/zoiko-hr" },
    { label: "ZoikoTime", href: "/products/zoikotime" },
    { label: "Zoiko Payroll", href: "/products/payroll" },
    { label: "Zoiko Billing", href: "/products/billing" },
    { label: "Zoiko Spend", href: "/products/spend" },
    { label: "Zoiko Projects", href: "/projects" },
    { label: "Zoiko Inventory", href: "/inventory" },
    { label: "Zoiko Comply", href: "/products/comply" },
    { label: "Zoiko Insights", href: "/insights" },
    { label: "Zoiko Docs Pro", href: "/zoiko-docs" },
  ],
  SOLUTIONS: ["Services Businesses", "Agencies", "Retail Businesses", "Trades Businesses", "Hospitality", "E-Commerce", "Product Businesses", "Multi-Entity"],
  "FIVE PILLARS": ["People — HR, Time, Payroll", "Money — Billing, Spend", "Work — Projects", "Supply — Inventory", "Control — Comply, Insights"],
  RESOURCES: [{ label: "Resource Center", href: "/resources" }, { label: "Trust Center", href: "/trust-center" }, { label: "Security", href: "/security" }, { label: "Integrations", href: "/integrations" }, { label: "API Documentation", href: "/api-documentation" }, { label: "System Status", href: "/system-status" }, { label: "Pricing", href: "/pricing" }, "Contact"],
  COMPANY: [{ label: "About Zoiko One", href: "/about" }, { label: "Leadership", href: "/leadership" }, { label: "Careers", href: "/careers" }, "Contact", "Pricing", { label: "Trust Center", href: "/trust-center" }, "Solutions"],
};

const ecosystemItems = [
  { name: "Zoiko One", desc: "Business operations — this platform", active: true },
  { name: "ZoikoVertex", desc: "CRM, sales, marketing & growth", active: false },
  { name: "ZoikoSuite", desc: "Accounting & bookkeeping", active: false },
  { name: "Zoiko Sema", desc: "Communication & collaboration", active: false },
  { name: "Zoiko Local", desc: "Telephony & business calling", active: false },
  { name: "Zoiko Digital", desc: "Web, app, cloud & digital services", active: false },
];

const legalLinks = [
  "Privacy Policy", "Terms of Service", "Cookie Policy", "Accessibility Statement",
  "Acceptable Use", { label: "Trust Center", href: "/trust-center" }, { label: "Security", href: "/security" }, { label: "System Status", href: "/system-status" }, "Contact"
];

const styles = {
  wrapper: {
    background: "#240C84",
    color: "white",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    minHeight: "100vh",
    width: "100%",
  },
  ctaBanner: {
    margin: "0 auto",
    maxWidth: "1200px",
    padding: "40px 40px 0",
  },
  ctaBox: {
    background: "linear-gradient(135deg, #2d1fa3 0%, #3b4fd8 40%, #4a6ef5 70%, #5b85ff 100%)",
    borderRadius: "20px",
    padding: "40px 48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "32px",
    flexWrap: "wrap",
  },
  ctaTitle: {
    fontSize: "28px",
    fontWeight: "800",
    color: "white",
    margin: "0 0 10px",
    lineHeight: "1.2",
    maxWidth: "400px",
  },
  ctaSubtitle: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.85)",
    margin: "0 0 8px",
    maxWidth: "420px",
    lineHeight: "1.5",
  },
  ctaNote: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.6)",
    margin: 0,
  },
  ctaButtons: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  btnOrange: {
    background: "#f5a623",
    color: "white",
    border: "none",
    borderRadius: "50px",
    padding: "14px 28px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 20px rgba(245,166,35,0.4)",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.15)",
    color: "white",
    border: "1.5px solid rgba(255,255,255,0.3)",
    borderRadius: "50px",
    padding: "13px 28px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
    backdropFilter: "blur(8px)",
  },
  btnLink: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    textDecoration: "underline",
    whiteSpace: "nowrap",
  },
  mainFooter: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "48px 40px 32px",
  },
  footerGrid: {
    display: "grid",
    gridTemplateColumns: "200px repeat(6, 1fr)",
    gap: "32px",
    alignItems: "start",
  },
  logoCol: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  tagline: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.55)",
    lineHeight: "1.6",
    margin: 0,
  },
  socialRow: {
    display: "flex",
    gap: "10px",
    marginTop: "4px",
  },
  socialBtn: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  navCol: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  navColTitle: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#f5a623",
    letterSpacing: "1px",
    textTransform: "uppercase",
    marginBottom: "4px",
  },
  navLink: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    lineHeight: "1.4",
    transition: "color 0.2s",
    textDecoration: "none",
    display: "block",
  },
  divider: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    maxWidth: "1200px",
    margin: "0 auto 0",
  },
  getStartedSection: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "40px 40px 20px",
    textAlign: "center",
  },
  getStartedLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#f5a623",
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginBottom: "20px",
  },
  getStartedLinks: {
    display: "flex",
    justifyContent: "center",
    gap: "48px",
    flexWrap: "wrap",
  },
  getStartedLink: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "color 0.2s",
  },
  ecosystemSection: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px 40px 40px",
    textAlign: "center",
  },
  ecoLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#f5a623",
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginBottom: "14px",
  },
  ecoSubtext: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.55)",
    marginBottom: "28px",
    lineHeight: "1.5",
  },
  ecoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "12px",
  },
  ecoCard: (active) => ({
    background: active ? "#f5a623" : "rgba(255,255,255,0.05)",
    border: active ? "none" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "16px 14px",
    textAlign: "left",
    cursor: "pointer",
  }),
  ecoCardName: (active) => ({
    fontSize: "14px",
    fontWeight: "700",
    color: active ? "white" : "rgba(255,255,255,0.85)",
    marginBottom: "6px",
  }),
  ecoCardDesc: (active) => ({
    fontSize: "12px",
    color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
    lineHeight: "1.4",
  }),
  legalSection: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "24px 40px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  legalLinks: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "8px 24px",
  },
  legalLink: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  legalBottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  copyright: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    flex: 1,
  },
  langPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    padding: "4px 10px",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "20px",
    whiteSpace: "nowrap",
  },
};

export default function ZoikoFooter() {
  const [hoveredLink, setHoveredLink] = useState(null);

  return (
    <div style={styles.wrapper}>
      {/* CTA Banner */}
      <div style={styles.ctaBanner}>
        <div style={styles.ctaBox}>
          <div>
            <h2 style={styles.ctaTitle}>Everything your business runs on — connected in one.</h2>
            <p style={styles.ctaSubtitle}>
              Run people, money, work, supply, compliance, business intelligence and document workflows through one connected business-operations platform.
            </p>
            <p style={styles.ctaNote}>Start with one product, one pillar or the full Zoiko One platform.</p>
          </div>
          <div style={styles.ctaButtons}>
            <button style={styles.btnOrange}>
              Get a Demo &nbsp;→
            </button>
            <button style={styles.btnGhost}>
              Explore Products
            </button>
            <button style={styles.btnLink}>Pricing</button>
          </div>
        </div>
      </div>

      {/* Main Footer Nav */}
      <div style={styles.mainFooter}>
        <div style={styles.footerGrid}>
          {/* Logo + tagline + social */}
          <div style={styles.logoCol}>
            <ZoikoLogo />
            <p style={styles.tagline}>
              The connected business-operations platform for people, money, work, supply and control.
            </p>
            <div style={styles.socialRow}>
              {[
                { icon: <LinkedInIcon />, label: "LinkedIn" },
                { icon: <XIcon />, label: "X" },
                { icon: <GitHubIcon />, label: "GitHub" },
              ].map(({ icon, label }) => (
                <div key={label} style={styles.socialBtn} title={label}>
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {Object.entries(navData).map(([section, links]) => (
            <div key={section} style={styles.navCol}>
              <div style={styles.navColTitle}>{section}</div>
              {links.map((link) => {
                const label = typeof link === "string" ? link : link.label;
                const key = `${section}-${label}`;
                return typeof link === "string" ? (
                  <a
                    key={key}
                    style={{
                      ...styles.navLink,
                      color: hoveredLink === key ? "white" : "rgba(255,255,255,0.65)",
                    }}
                    onMouseEnter={() => setHoveredLink(key)}
                    onMouseLeave={() => setHoveredLink(null)}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                  >
                    {label}
                  </a>
                ) : (
                  <Link
                    key={key}
                    to={link.href}
                    style={{
                      ...styles.navLink,
                      color: hoveredLink === key ? "white" : "rgba(255,255,255,0.65)",
                    }}
                    onMouseEnter={() => setHoveredLink(key)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.divider} />

      {/* GET STARTED */}
      <div style={styles.getStartedSection}>
        <div style={styles.getStartedLabel}>GET STARTED</div>
        <div style={styles.getStartedLinks}>
          {[
            { label: "Get a Demo", href: "/get-demo" },
            { label: "Request Pricing", href: "/pricing" },
            { label: "Explore Products", href: "/products" },
            { label: "Contact Sales", href: "/contact" },
            { label: "Sign In", href: "/login" },
          ].map((lnk) => (
            <Link
              key={lnk.label}
              to={lnk.href}
              style={{
                ...styles.getStartedLink,
                color: hoveredLink === `gs-${lnk.label}` ? "white" : "rgba(255,255,255,0.75)",
              }}
              onMouseEnter={() => setHoveredLink(`gs-${lnk.label}`)}
              onMouseLeave={() => setHoveredLink(null)}
            >
              {lnk.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Ecosystem */}
      <div style={styles.ecosystemSection}>
        <div style={styles.ecoLabel}>THE ZOIKO BUSINESS ECOSYSTEM</div>
        <p style={styles.ecoSubtext}>
          Zoiko One runs business operations. The platforms below are ecosystem siblings they are not Zoiko One products.
        </p>
        <div style={styles.ecoGrid}>
          {ecosystemItems.map((item) => (
            <div key={item.name} style={styles.ecoCard(item.active)}>
              <div style={styles.ecoCardName(item.active)}>{item.name}</div>
              <div style={styles.ecoCardDesc(item.active)}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ ...styles.legalSection, border: "none", paddingTop: "28px" }}>
          <div style={styles.legalLinks}>
            {legalLinks.map((lnk) => {
              const label = typeof lnk === "string" ? lnk : lnk.label;
              const href = typeof lnk === "string" ? "#" : lnk.href;
              return typeof lnk === "string" ? (
                <a
                  key={label}
                  href="#"
                  style={{
                    ...styles.legalLink,
                    color: hoveredLink === `legal-${label}` ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)",
                  }}
                  onMouseEnter={() => setHoveredLink(`legal-${label}`)}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={(e) => e.preventDefault()}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  to={href}
                  style={{
                    ...styles.legalLink,
                    color: hoveredLink === `legal-${label}` ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)",
                  }}
                  onMouseEnter={() => setHoveredLink(`legal-${label}`)}
                  onMouseLeave={() => setHoveredLink(null)}
                >
                  {label}
                </Link>
              );
            })}
            <div style={styles.langPill}>
              <GlobeIcon />
              EN · Global
            </div>
          </div>
          <div style={styles.copyright}>
            © 2026 Zoiko Group. All rights reserved. · ZoikoOne™ · Nine core products plus Zoiko Docs Pro (Premium Capability).
          </div>
        </div>
      </div>
    </div>
  );
}
