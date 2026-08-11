import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const NAVY = "#0B1C3F";
const BLUE = "#1A3A8C";
const LIGHT_BLUE = "#4A9FE4";
const ORANGE = "#f97316";
const WHITE = "#FFFFFF";
const OFF_WHITE = "#f8fafc";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#E5E7EB";
const DARK_TEXT = "#111827";
const SUBTLE_TEXT = "#4B5563";

const FF = "'Inter', system-ui, -apple-system, sans-serif";

const wrap = {
  padding: "80px 6vw",
  background: WHITE,
  fontFamily: FF,
};

const eyebrow = (color = ORANGE) => ({
  fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em",
  textTransform: "uppercase", color, margin: "0 0 14px 0",
  display: "block",
});

const h2 = {
  fontSize: "clamp(26px, 4vw, 44px)", fontWeight: "800",
  color: NAVY, lineHeight: "1.15", margin: "0 0 16px 0",
};

const bodyText = {
  fontSize: "15px", color: SUBTLE_TEXT, lineHeight: "1.7", margin: 0,
};

const pillTag = {
  display: "inline-block", padding: "3px 10px", borderRadius: "20px",
  background: "rgba(232,133,10,0.08)", color: ORANGE,
  fontSize: "11px", fontWeight: "600",
  border: "1px solid rgba(232,133,10,0.18)",
  whiteSpace: "nowrap",
};

const whiteCard = {
  background: WHITE, borderRadius: "16px",
  border: `1px solid ${LIGHT_GRAY}`, padding: "28px",
};

const iconBox = (bg = ORANGE) => ({
  width: "44px", height: "44px", borderRadius: "12px",
  background: bg, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "20px", flexShrink: 0,
});

const IconDoc = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="2" width="12" height="16" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="7" y="6" width="6" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="7" y="9" width="6" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="7" y="12" width="4" height="1.5" rx="0.75" fill="#f97316"/>
  </svg>
);

const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconPO = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="2" width="12" height="16" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="7" y="6" width="5" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="7" y="9" width="5" height="1.5" rx="0.75" fill="#f97316"/>
    <rect x="14" y="5" width="3" height="4" rx="1" fill="#f97316"/>
  </svg>
);

const IconGrid = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.9"/>
    <rect x="13" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.5"/>
    <rect x="3" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.5"/>
    <rect x="13" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.3"/>
  </svg>
);

const IconLink = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="5" fill="white" fillOpacity="0.9"/>
    <circle cx="12" cy="12" r="2" fill="#5b5bd6"/>
  </svg>
);

const IconBar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="14" width="4" height="6" rx="1" fill="white" fillOpacity="0.6"/>
    <rect x="10" y="9" width="4" height="11" rx="1" fill="white" fillOpacity="0.85"/>
    <rect x="16" y="5" width="4" height="15" rx="1" fill="white"/>
  </svg>
);

const capabilities = [
  { icon: <IconDoc/>, bg: ORANGE, title: "Purchase requests", desc: "Capture intent with policy and budget context." },
  { icon: <IconCheck/>, bg: NAVY, title: "Approvals & policy", desc: "Route by threshold, category and budget." },
  { icon: <IconPO/>, bg: ORANGE, title: "POs & supplier invoices", desc: "Match invoices to POs and receiving." },
  { icon: <IconGrid/>, bg: "#2d2b6b", title: "Vendors & AP", desc: "Manage vendors and accounts-payable workflows." },
  { icon: <IconLink/>, bg: "#5b5bd6", title: "Receiving link", desc: "Connect spend to Zoiko Inventory goods movement." },
  { icon: <IconBar/>, bg: "#2d2b6b", title: "Spend insight", desc: "Visibility into committed and actual spend." },
];

const workflowSteps = [
  "Request", "Policy check", "Approval", "Purchase order",
  "Supplier invoice", "Receiving / evidence", "Payment prep",
];

const faqs = [
  { q: "Does Spend connect to inventory?", a: "Yes — Zoiko Spend links directly to Zoiko Inventory, so every purchase order and goods receipt is matched automatically. This closes the loop between what's ordered and what's received, keeping your books accurate without manual reconciliation." },
  { q: "Can I enforce spend policies?", a: "Absolutely. You can define policies by category, supplier, threshold, and budget. Every purchase request is automatically checked against these rules before it reaches an approver, so off-policy spend never slips through." },
  { q: "Does it pay suppliers?", a: "Zoiko Spend prepares payments for approval and hands them off to your payment run — it doesn't initiate bank transfers directly. You stay in control of when and how money leaves the business." },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: WHITE, borderRadius: "12px", border: `1px solid ${LIGHT_GRAY}`, overflow: "hidden", marginBottom: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        width: "100%", padding: "20px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "none", border: "none", cursor: "pointer",
        fontFamily: FF, textAlign: "left",
      }}>
        <span style={{ fontSize: "15px", fontWeight: "600", color: NAVY }}>{q}</span>
        <ChevronDown size={18} color={GRAY} style={{
          flexShrink: 0, marginLeft: 16,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform .2s ease",
        }} />
      </button>
      {open && (
        <div style={{ padding: "0 24px 20px", fontSize: "14px", color: SUBTLE_TEXT, lineHeight: "1.7" }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function ZoikoSpendPage() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ background: WHITE, fontFamily: FF, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />

      {/* HERO */}
      <section style={{
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
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1400 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <span style={{ background: ORANGE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Money</span>
            <span style={{ color: "#555" }}>Zoiko Spend</span>
          </div>

          <h1 style={{
            fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
            color: NAVY, margin: "0 auto 20px", letterSpacing: "-0.02em",
            maxWidth: 1100,
          }}>
            Spend management software for{" "}
            <span style={{ color: ORANGE }}>controlled purchasing.</span>
          </h1>

          <p style={{
            fontSize: "16px", lineHeight: 1.7, color: SUBTLE_TEXT,
            margin: "0 auto 28px", maxWidth: 900,
          }}>
            Control purchase requests, approvals, purchase orders, supplier invoices, vendors, AP workflows, spend policies, documents and payment preparation — before money leaves the business.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/get-demo")} style={{
              background: "linear-gradient(135deg, #FF8800, #FF5500)",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(255,85,0,0.45)",
            }}>
              Get a Demo <ArrowRight size={17} />
            </button>
            <button style={{
              background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
              border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}>
              Request Spend Pricing
            </button>
            <button style={{
              background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
              border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}>
              See Money Pillar
            </button>
          </div>
        </div>
      </section>

      {/* THE SPEND WORKFLOW */}
      <section style={{ ...wrap, background: OFF_WHITE }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={eyebrow(ORANGE)}>The Spend Workflow</span>
            <h2 style={h2}>Control money out, before it leaves.</h2>
          </div>

          <div style={{
            background: WHITE, border: `1px solid ${LIGHT_GRAY}`,
            borderRadius: 999, padding: "18px 28px",
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 14, flexWrap: "wrap",
            marginBottom: 24,
          }}>
            {workflowSteps.map((step, i) => (
              <span key={step} style={pillTag}>
                {step}
                {i < workflowSteps.length - 1 && (
                  <ArrowRight size={16} color={GRAY} style={{ marginLeft: 10, verticalAlign: "middle", display: "inline" }} />
                )}
              </span>
            ))}
          </div>

          <p style={{ textAlign: "center", ...bodyText, fontSize: "14px" }}>
            From request to payment preparation, governed end to end.
          </p>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section style={{ ...wrap }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={eyebrow(ORANGE)}>Capabilities</span>
            <h2 style={h2}>Discipline across every purchase.</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {capabilities.map(({ icon, bg, title, desc }) => (
              <div key={title} style={whiteCard}>
                <div style={iconBox(bg)}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: DARK_TEXT, marginTop: 14, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: SUBTLE_TEXT, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQS */}
      <section style={{ ...wrap, background: OFF_WHITE }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={eyebrow(BLUE)}>Zoiko Spend FAQs</span>
          <h2 style={h2}>Common questions.</h2>
        </div>
        <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ ...wrap, paddingTop: "20px", paddingBottom: "80px" }}>
        <div style={{
          background: `linear-gradient(120deg, #6b21a8 0%, #5b5bd6 40%, #3b82f6 100%)`,
          borderRadius: "24px", padding: "64px 48px",
          textAlign: "center",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: "-60px", left: "-60px",
            width: "240px", height: "240px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)",
          }} />
          <div style={{
            position: "absolute", bottom: "-40px", right: "-40px",
            width: "200px", height: "200px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{
              fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: "800",
              color: "white", margin: "0 0 14px 0", letterSpacing: "-0.5px",
            }}>
              Control spend with confidence.
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", lineHeight: "1.7" }}>
              Request to payment, governed end to end.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => navigate("/get-demo")} style={{
                padding: "14px 28px", borderRadius: "50px", border: "none",
                background: ORANGE, color: "white", fontSize: "15px",
                fontWeight: "700", cursor: "pointer", fontFamily: FF,
                boxShadow: "0 6px 20px rgba(249,115,22,0.5)",
              }}>Get a Demo</button>
              <button style={{
                padding: "13px 24px", borderRadius: "50px",
                border: "1.5px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "white", fontSize: "14px", fontWeight: "600",
                cursor: "pointer", fontFamily: FF,
              }}>Request Pricing</button>
              <button style={{
                padding: "13px 24px", borderRadius: "50px",
                border: "1.5px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "white", fontSize: "14px", fontWeight: "600",
                cursor: "pointer", fontFamily: FF,
              }}>See Money Pillar</button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
