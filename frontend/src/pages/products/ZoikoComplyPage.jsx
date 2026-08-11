import React, { useState, useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";
import {
  ArrowRight,
  FileText,
  SquareDot,
  AlertTriangle,
  ArrowLeftRight,
  Folder,
  Sparkles,
  ChevronDown,
} from "lucide-react";

const NAVY = "#0B1C3F";
const BLUE = "#1A3A8C";
const LIGHT_BLUE = "#4A9FE4";
const ORANGE = "#D97B3F";
const WHITE = "#FFFFFF";
const OFF_WHITE = "#f8fafc";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#E5E7EB";
const DARK_TEXT = "#111827";
const SUBTLE_TEXT = "#4B5563";
const ICON_NAVY = "#1E2A6A";
const ICON_GOLD = "#C9952E";

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

const flowSteps = ["Obligation", "Control", "Workflow activity", "Evidence", "Review", "Exception", "Remediation", "Compliance insight"];

const capabilityCards = [
  {
    icon: FileText,
    iconBg: ICON_NAVY,
    title: "Obligations & controls",
    desc: "Track what's required and who owns it.",
  },
  {
    icon: SquareDot,
    iconBg: ICON_NAVY,
    title: "Evidence & attestations",
    desc: "Capture proof as work happens.",
  },
  {
    icon: AlertTriangle,
    iconBg: ORANGE,
    title: "Exceptions & remediation",
    desc: "Surface, assign and resolve issues.",
  },
  {
    icon: ArrowLeftRight,
    iconBg: ICON_NAVY,
    title: "Policy workflows",
    desc: "Route reviews and approvals consistently.",
  },
  {
    icon: Folder,
    iconBg: ICON_GOLD,
    title: "Audit-ready records",
    desc: "A clean trail for reviews and audits.",
  },
  {
    icon: Sparkles,
    iconBg: `linear-gradient(135deg, ${ORANGE}, ${ICON_NAVY})`,
    title: "AI assistance, governed",
    desc: "Summarize obligations and surface exceptions \u2014 never makes compliance determinations, gives legal advice, or closes issues without authorization.",
  },
];

const faqs = [
  {
    q: "Does Comply guarantee compliance?",
    a: "No. Zoiko Comply helps you track obligations, controls, evidence and exceptions so your organization is audit-ready, but compliance determinations remain the responsibility of your accountable teams.",
  },
  {
    q: "How does it create evidence?",
    a: "Comply captures proof as work happens \u2014 approvals, documents, attestations and workflow activity are logged automatically into a clean, audit-ready trail rather than collected after the fact.",
  },
  {
    q: "What does AI do in Comply?",
    a: "AI assistance summarizes obligations and helps surface exceptions inside each user's permission scope. It never makes compliance determinations, gives legal advice, or closes issues without authorization.",
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
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
        <ChevronDown
          size={18}
          color={GRAY}
          style={{
            flexShrink: 0,
            marginLeft: 16,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s ease",
          }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 24px 20px", fontSize: "14px", color: SUBTLE_TEXT, lineHeight: "1.7" }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function ZoikoComplyPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ background: WHITE, fontFamily: FF, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />

      {/* HERO */}
      <section id="zoiko-comply-hero" style={{
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
            <span style={{ background: "#1E2A8C", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Control</span>
            <span style={{ color: "#555" }}>Zoiko Comply</span>
          </div>

          <h1 style={{
            fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
            color: NAVY, margin: "0 auto 20px", letterSpacing: "-0.02em",
            maxWidth: 1100,
          }}>
            Compliance management software for{" "}
            <span style={{ color: LIGHT_BLUE }}>governed business operations.</span>
          </h1>

          <p style={{
            fontSize: "16px", lineHeight: 1.7, color: SUBTLE_TEXT,
            margin: "0 auto 28px", maxWidth: 900,
          }}>
            Track obligations, controls, evidence, attestations, exceptions,
            reviews, remediation, policy workflows, approvals, documents and
            audit-ready activity across Zoiko One.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{
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
              Request Comply Pricing
            </button>
            <button style={{
              background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
              border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}>
              See Control Pillar
            </button>
          </div>
        </div>
      </section>

      {/* THE COMPLIANCE WORKFLOW */}
      <section style={{ ...wrap, background: OFF_WHITE }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={eyebrow(ORANGE)}>The Compliance Workflow</span>
            <h2 style={h2}>From obligation to compliance insight.</h2>
          </div>

          <div
            style={{
              background: WHITE,
              border: `1px solid ${LIGHT_GRAY}`,
              borderRadius: 999,
              padding: "18px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 24,
            }}
          >
            {flowSteps.map((step, i) => (
              <React.Fragment key={step}>
                <span style={pillTag}>{step}</span>
                {i < flowSteps.length - 1 && (
                  <ArrowRight size={16} color={GRAY} style={{ flexShrink: 0 }} />
                )}
              </React.Fragment>
            ))}
          </div>

          <p style={{ textAlign: "center", ...bodyText, fontSize: "14px" }}>
            Built on Documents, Approvals, Zoiko Docs Pro, Zoiko Workflow,
            Zoiko Insights and audit trails.
          </p>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section style={{ ...wrap }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={eyebrow(ORANGE)}>The Problem</span>
            <h2 style={h2}>
              Compliance becomes fragile
              <br />
              when evidence is collected after the work is done.
            </h2>
            <p style={{ ...bodyText, maxWidth: 800, margin: "0 auto", fontSize: "15px" }}>
              Policies in documents, approvals in email, evidence in
              folders, exceptions in spreadsheets \u2014 that means weak
              audit readiness and poor visibility into operational risk.
              Comply turns everyday work into evidence.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {capabilityCards.map(({ icon: Icon, iconBg, title, desc }) => (
              <div key={title} style={whiteCard}>
                <div style={iconBox(iconBg)}>
                  <Icon size={19} color="#fff" strokeWidth={2.2} />
                </div>
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
          <span style={eyebrow(BLUE)}>Zoiko Comply FAQs</span>
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
              Make audit readiness continuous.
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", lineHeight: "1.7" }}>
              Turn everyday work into evidence, with governed compliance workflows.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button style={{
                padding: "14px 28px", borderRadius: "50px", border: "none",
                background: ORANGE, color: "white", fontSize: "15px",
                fontWeight: "700", cursor: "pointer", fontFamily: FF,
                boxShadow: "0 6px 20px rgba(217,123,63,0.5)",
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
              }}>See Control Pillar</button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
