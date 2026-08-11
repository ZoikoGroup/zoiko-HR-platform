import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const NAVY = "#0B1C3F";
const BLUE = "#1A3A8C";
const LIGHT_BLUE = "#4A9FE4";
const ORANGE = "#E8850A";
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

const outlineBtn = {
  padding: "12px 22px", borderRadius: "50px",
  border: `1.5px solid ${LIGHT_GRAY}`, background: WHITE,
  fontSize: "13px", fontWeight: "600", color: NAVY,
  cursor: "pointer", fontFamily: FF,
};

const ghostBtnWhite = {
  padding: "13px 24px", borderRadius: "50px",
  border: "1.5px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)",
  color: "white", fontSize: "14px", fontWeight: "600",
  cursor: "pointer", fontFamily: FF,
};

/* ─────────────────────────────────────────
   SVG ICONS
───────────────────────────────────────── */
const IconBraces = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconArrowDown = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12l7 7 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconCopy = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="8" y="8" width="12" height="14" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M4 16V4a2 2 0 012-2h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconBolt = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconUsers = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="7" r="3" stroke="white" strokeWidth="2"/>
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M16 3.13a4 4 0 010 7.75M21 20c0-3.3-2.7-5.88-6-5.99" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconDollar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconCopySmall = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="8" y="8" width="12" height="14" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M4 16V4a2 2 0 012-2h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const integrationTypes = [
  { Icon: IconBraces,   bg: "#3b9ef5",  title: "APIs",               desc: "Build on documented, permission-aware endpoints." },
  { Icon: IconArrowDown,bg: "#3b2fb0",  title: "Imports & exports",  desc: "Move data in and out under controlled access." },
  { Icon: IconCopy,     bg: "#4a3fc0",  title: "Connectors",         desc: "Approved connections to common systems." },
  { Icon: IconBolt,     bg: "#f97316",  title: "Workflow triggers",   desc: "Let external events drive governed workflows." },
];

const useCases = [
  { Icon: IconUsers,      bg: "#5c4dd6", title: "Identity & directory",    desc: "Sync users and access with your identity provider via SSO." },
  { Icon: IconDollar,     bg: "#f97316", title: "Payments & finance",      desc: "Connect money movement and financial truth through ZoikoPay and ZoikoCoreX." },
  { Icon: IconCopySmall,  bg: "#22b5d4", title: "Operational systems",     desc: "Link the tools your teams already rely on to reduce re-keying." },
];

const connectTags = ["APIs", "Webhooks", "Imports", "Exports", "Connectors", "Workflow triggers", "Identity / SSO", "Data sync"];

/* ─────────────────────────────────────────
   HERO
───────────────────────────────────────── */
function Hero() {
  const navigate = useNavigate();
  return (
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
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, textAlign: "left" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <span style={{ background: BLUE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Platform</span>
          <span style={{ color: "#555" }}>Zoiko Connect</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <h1 style={{
              fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
              color: NAVY, margin: "0 0 20px", letterSpacing: "-0.02em",
            }}>
              Connect Zoiko One<br />
              with the systems you{" "}
              <span style={{ color: LIGHT_BLUE }}>already use.</span>
            </h1>

            <p style={{ fontSize: "16px", lineHeight: 1.7, color: SUBTLE_TEXT, margin: "0 0 28px" }}>
              Use integrations, APIs, secure data movement, workflow triggers,
              imports, exports and approved connections to bring Zoiko One into
              your existing operating environment.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/get-demo")} style={{
                background: "linear-gradient(135deg, #FF8800, #FF5500)",
                color: "#fff", border: "none", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 16px rgba(255,85,0,0.45)",
              }}>
                Explore API Documentation
              </button>
              <button style={{
                background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
                border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}>
                Talk to an Integration Specialist
              </button>
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(145deg,#2d1b8e 0%,#3a2fba 50%,#1e1565 100%)",
              borderRadius: 24,
              padding: "40px 36px",
              width: "100%",
              maxWidth: 460,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 28,
              boxShadow: "0 24px 60px rgba(20,25,50,0.25)",
            }}
          >
            <div
              style={{
                background: "#f97316",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 16,
                padding: "14px 24px",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              Zoiko<br />Connect
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {connectTags.map((t) => (
                <span
                  key={t}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    fontSize: 13.5,
                    fontWeight: 500,
                    borderRadius: 10,
                    padding: "9px 16px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────
   STYLES
───────────────────────────────────────── */
const sectionH2 = {
  fontSize: "clamp(26px, 4vw, 44px)", fontWeight: "800",
  color: NAVY, lineHeight: "1.15", margin: "0 0 16px 0", textAlign: "center",
};

const labelBlue = {
  fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
  textTransform: "uppercase", letterSpacing: "0.12em",
  textAlign: "center", marginBottom: 16,
};

const labelOrange = {
  fontSize: 11.5, fontWeight: 700, color: "#f97316",
  textTransform: "uppercase", letterSpacing: "0.12em",
  textAlign: "center", marginBottom: 16,
};

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function ZoikoConnectPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ fontFamily: FF, background: "#ffffff", minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <Hero />

      {/* ── 2. INTEGRATION PHILOSOPHY ── */}
      <section style={{ padding: "100px 6vw", background: WHITE, fontFamily: FF }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={labelBlue}>Integration Philosophy</div>
          <h2 style={sectionH2}>
            Integrations should strengthen<br />
            the operating model — not<br />
            fragment it.
          </h2>
          <p style={{ ...bodyText, textAlign: "center", maxWidth: 620, margin: "0 auto 52px" }}>
            Zoiko Connect is the integration fabric for Zoiko One: APIs, connectors,
            data movement and workflow triggers, governed by permissions.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
            {integrationTypes.map(({ Icon, bg, title, desc }) => (
              <div key={title} style={whiteCard}>
                <div style={{ ...iconBox(bg), width: 50, height: 50, marginBottom: 20 }}><Icon /></div>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 9 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. USE CASES ── */}
      <section style={{ padding: "100px 6vw", background: OFF_WHITE, fontFamily: FF }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={labelOrange}>Use Cases</div>
          <h2 style={{ ...sectionH2, marginBottom: 52 }}>
            Integrations that support real<br />workflows.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 32 }}>
            {useCases.map(({ Icon, bg, title, desc }) => (
              <div key={title} style={whiteCard}>
                <div style={{ ...iconBox(bg), width: 50, height: 50, marginBottom: 20 }}><Icon /></div>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 9 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "#aaa", textAlign: "center" }}>
            We don't overpromise connectors. Availability is confirmed during evaluation.
          </p>
        </div>
      </section>

      {/* ── 4. BOTTOM CTA ── */}
      <section style={{ padding: "60px 28px 80px", background: OFF_WHITE, fontFamily: FF }}>
        <div style={{
          maxWidth: 1060, margin: "0 auto",
          background: "linear-gradient(135deg,#5b2d8e 0%,#4a3fc0 35%,#3a6fd8 70%,#4ab0f5 100%)",
          borderRadius: 22, padding: "72px 48px", textAlign: "center",
        }}>
          <h2 style={{
            fontSize: "clamp(26px,4vw,40px)", fontWeight: 800,
            color: "#fff", marginBottom: 14, lineHeight: 1.2,
          }}>
            Bring Zoiko One into your stack.
          </h2>
          <p style={{
            fontSize: 15, color: "rgba(255,255,255,0.78)",
            marginBottom: 36, lineHeight: 1.55,
          }}>
            Explore the API or talk to an integration specialist about your environment.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <button style={{
              background: "#f97316", color: "#fff", border: "none",
              borderRadius: 50, padding: "15px 32px",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              API Documentation
            </button>
            <button style={ghostBtnWhite}>
              Talk to a Specialist
            </button>
            <button style={ghostBtnWhite}>
              See the Spine
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
