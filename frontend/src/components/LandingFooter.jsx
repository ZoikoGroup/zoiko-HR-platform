import { Link } from "react-router-dom";
import { Zap, Globe, Mail, MessageCircle, Send, Share2, ExternalLink } from "lucide-react";
import logo from "../assets/logo.png";

const footerColumns = [
  {
    title: "Zoiko One Products",
    links: [
      { label: "Zoiko HR", href: "/products/zoiko-hr" },
      { label: "ZoikoTime", href: "/zoikotime" },
      { label: "Zoiko Payroll", href: "/payroll" },
      { label: "Zoiko Billing", href: "/billing" },
      { label: "Zoiko Comply", href: "/products/comply" },
      { label: "Zoiko Insights", href: "/insights" },
      { label: "Zoiko Inventory", href: "/inventory" },
      { label: "Zoiko Docs Pro", href: "/zoiko-docs" },
      { label: "Zoiko Spend", href: "/products/spend" },
    ],
  },
  {
    title: "Infrastructure",
    links: [
      { label: "ZoikoPay", href: "/zoikopay" },
      { label: "ZoikoCoreX", href: "/zoikocorex" },
      { label: "API Gateway", href: "#" },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      { label: "Zoiko Sema", href: "#" },
      { label: "Zoiko Local", href: "#" },
      { label: "ZoikoVertex", href: "#" },
      { label: "Zoiko Web Services", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Trust Center", href: "/trust-center" },
      { label: "Security Center", href: "/security-center" },
      { label: "Audit Center", href: "/audit-center" },
      { label: "Compliance", href: "/compliance-center" },
      { label: "Sign In", href: "/login" },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer style={{ background: "#240C84", color: "white" }}>
      {/* CTA Banner */}
      <div style={{
        background: "linear-gradient(135deg, #FF6B00 0%, #FF8C38 50%, #FFB347 100%)",
        padding: "48px 24px", textAlign: "center"
      }}>
        <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: "700", color: "white", margin: "0 0 12px 0" }}>
          Start your Zoiko One journey today
        </h2>
        <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.85)", margin: "0 0 28px 0" }}>
          Join thousands of businesses running smarter operations with Zoiko One.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/register" style={{
            padding: "12px 28px", borderRadius: "8px", fontSize: "15px", fontWeight: "600",
            background: "white", color: "#FF6B00", textDecoration: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)", transition: "all 0.2s"
          }}>
            Get Started Free
          </Link>
          <Link to="/login" style={{
            padding: "12px 28px", borderRadius: "8px", fontSize: "15px", fontWeight: "600",
            background: "rgba(255,255,255,0.15)", color: "white", textDecoration: "none",
            border: "2px solid rgba(255,255,255,0.5)", transition: "all 0.2s"
          }}>
            Sign In
          </Link>
        </div>
      </div>

      {/* Footer Links */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "60px 24px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: "40px" }}>
          {/* Brand column */}
          <div>
            <Link to="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", marginBottom: "16px" }}>
              <img src={logo} alt="Zoiko One" style={{ height: "38px", width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            </Link>
            <p style={{ fontSize: "13px", color: "#9CA3AF", lineHeight: "1.7", maxWidth: "220px", margin: "0 0 20px 0" }}>
              The connected business operations platform — HR, Time, Payroll, Billing, Compliance, and Insights from one modular system.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              {[
                { Icon: Globe, label: "Website" },
                { Icon: Share2, label: "Social" },
                { Icon: Send, label: "Telegram" },
                { Icon: Mail, label: "Email" },
                { Icon: MessageCircle, label: "Chat" },
              ].map(({ Icon, label }) => (
                <a key={label} href="#" aria-label={label} style={{
                  width: "34px", height: "34px", borderRadius: "8px", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.1)", color: "#9CA3AF",
                  transition: "all 0.2s"
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#FF6B00"; e.currentTarget.style.color = "#FF6B00"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#9CA3AF"; }}
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {footerColumns.map((col) => (
            <div key={col.title}>
              <p style={{ fontSize: "12px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>
                {col.title}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      style={{ fontSize: "13px", color: "#D1D5DB", textDecoration: "none", transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#FF6B00"}
                      onMouseLeave={e => e.currentTarget.style.color = "#D1D5DB"}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "16px",
          borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "48px", paddingTop: "24px"
        }}>
          <p style={{ fontSize: "12px", color: "#6B7280" }}>
            © {new Date().getFullYear()} Zoiko Group. All rights reserved. Proprietary & Confidential.
          </p>
          <div style={{ display: "flex", gap: "24px" }}>
            {["Privacy Policy", "Security", "Terms of Service", "Cookie Policy"].map(label => (
              <Link key={label} to="/trust-center"
                style={{ fontSize: "12px", color: "#6B7280", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#FF6B00"}
                onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
