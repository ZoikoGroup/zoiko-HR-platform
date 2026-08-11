import React, { useEffect } from "react";
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
};

const whiteCard = {
  background: WHITE, borderRadius: "16px",
  border: `1px solid ${LIGHT_GRAY}`, padding: "28px",
};

const iconBox = (bg = BLUE) => ({
  width: "44px", height: "44px", borderRadius: "12px",
  background: bg, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "20px", flexShrink: 0,
});

function IconDoc() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="white" strokeWidth="2" />
      <rect x="8" y="8" width="8" height="1.5" rx="0.75" fill="white" />
      <rect x="8" y="11.5" width="8" height="1.5" rx="0.75" fill="white" />
      <rect x="8" y="15" width="5" height="1.5" rx="0.75" fill="white" />
    </svg>
  );
}

function IconArrows() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 16L17 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 13L17 16L14 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8L7 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 5L7 8L10 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12L10 17L19 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill="white" />
    </svg>
  );
}

const capabilityCards = [
  {
    icon: IconDoc,
    iconBg: ORANGE,
    title: "Approved templates",
    desc: "Jurisdiction-aware templates curated and version-controlled.",
  },
  {
    icon: IconArrows,
    iconBg: BLUE,
    title: "Guided workflows",
    desc: "Step-by-step generation tied to your operating data.",
  },
  {
    icon: IconCheck,
    iconBg: "#6c5dd3",
    title: "Approvals & versioning",
    desc: "Routed approvals with full version history.",
  },
  {
    icon: IconLock,
    iconBg: "#3b2f8f",
    title: "Secure storage",
    desc: "Stored as evidence, linked to compliance trails.",
  },
];

const faqs = [
  {
    q: "Is Zoiko Docs Pro legal advice?",
    a: "No. Zoiko Docs Pro is a premium Documents-layer capability that generates business documents from approved templates and guided workflows. It does not provide legal advice, does not guarantee compliance, and does not replace qualified professional review where required.",
  },
  {
    q: "Does Docs Pro connect to other Zoiko products?",
    a: "Yes. Docs Pro is a cross-pillar capability. It generates documents tied to your operating data across Zoiko HR, Zoiko Comply, Zoiko Projects, Zoiko Spend and other products — with versioning, approvals and secure evidence storage.",
  },
  {
    q: "Is Docs Pro priced separately?",
    a: "Zoiko Docs Pro is a premium capability available across the Zoiko One platform. Contact sales for pricing details specific to your deployment.",
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div
      style={{
        background: WHITE, borderRadius: "12px",
        border: `1px solid ${LIGHT_GRAY}`, overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "20px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", cursor: "pointer",
          fontFamily: FF, textAlign: "left",
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: "600", color: NAVY }}>{q}</span>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="2"
          style={{
            flexShrink: 0, marginLeft: 16,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s ease",
          }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 24px 20px", fontSize: "14px", color: SUBTLE_TEXT, lineHeight: "1.7" }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function ZoikoDocsProPage() {
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
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <span style={{ background: ORANGE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Premium Capability</span>
            <span style={{ color: "#555" }}>Across all pillars &middot; not Product 10</span>
          </div>

          <h1 style={{
            fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
            color: NAVY, margin: "0 auto 20px", letterSpacing: "-0.02em",
          }}>
            Approved business documents,{" "}
            <span style={{ color: ORANGE }}>everywhere work happens.</span>
          </h1>

          <p style={{
            fontSize: "16px", lineHeight: 1.7, color: SUBTLE_TEXT,
            margin: "0 auto 28px", maxWidth: 760,
          }}>
            Zoiko Docs Pro generates jurisdiction-aware business documents from approved
            templates and guided workflows — with versioning, approvals and secure storage
            — across the Zoiko One platform.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{
              background: "linear-gradient(135deg, #FF8800, #FF5500)",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(255,85,0,0.45)",
            }}>
              Get a Demo &nbsp;&rarr;
            </button>
            <button style={{
              background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
              border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}>
              Request Docs Pro Pricing
            </button>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section style={{ ...wrap }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={eyebrow(ORANGE)}>How It Works</span>
            <h2 style={h2}>
              From approved template to audit-ready evidence.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 20,
            }}
          >
            {capabilityCards.map(({ icon: Icon, iconBg, title, desc }) => (
              <div key={title} style={whiteCard}>
                <div style={iconBox(iconBg)}>
                  <Icon />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: DARK_TEXT, marginTop: 14, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: SUBTLE_TEXT, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{
            maxWidth: "780px", margin: "40px auto 0",
            background: "#f0f0fa", borderRadius: "12px",
            padding: "20px 24px", textAlign: "left",
          }}>
            <p style={{ fontSize: "13px", color: "#444", lineHeight: "1.6" }}>
              <span style={{ fontWeight: "700", color: NAVY }}>Important.</span> Zoiko Docs Pro is a premium
              Documents-layer capability — not Product 10. It supports business document
              automation from approved templates and guided workflows. It is not legal advice,
              does not guarantee compliance, and does not replace qualified professional review
              where required.
            </p>
          </div>
        </div>
      </section>

      {/* FAQS */}
      <section style={{ ...wrap, background: OFF_WHITE }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={eyebrow(LIGHT_BLUE)}>Zoiko Docs Pro FAQs</span>
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
          background: `linear-gradient(135deg, ${BLUE} 0%, #1e40af 100%)`,
          borderRadius: "24px", padding: "64px 48px",
          textAlign: "center",
          boxShadow: "0 16px 48px rgba(26,58,140,0.35)",
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
              See Docs Pro across your workflows.
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", lineHeight: "1.7" }}>
              Generate approved, versioned, jurisdiction-aware documents<br />
              everywhere your business operates.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button style={{
                padding: "14px 28px", borderRadius: "50px", border: "none",
                background: ORANGE, color: "white", fontSize: "15px",
                fontWeight: "700", cursor: "pointer", fontFamily: FF,
                boxShadow: "0 6px 20px rgba(255,140,0,0.5)",
              }}>Get a Demo</button>
              <button style={{
                padding: "13px 24px", borderRadius: "50px",
                border: "1.5px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "white", fontSize: "14px", fontWeight: "600",
                cursor: "pointer", fontFamily: FF,
              }}>Back to Products</button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
