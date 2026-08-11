import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

// ─── Color tokens (precisely extracted from screenshots) ──────────────────────
const BG = "#E8E9EE";           // warm silver-grey page background
const BLUE_DARK = "#192660";    // deep navy headings
const BLUE_ACCENT = "#2040CC";  // royal blue eyebrows / tags / icons
const BLUE_MID = "#2B4ACB";     // mid blue for icon boxes
const BLUE_DEEP = "#172158";    // darkest navy for enterprise card
const ORANGE = "#E07B2A";       // orange CTAs / accents
const TEXT_MID = "#3D4A6B";     // body text
const TEXT_MUTED = "#6B7280";   // muted text
const BORDER = "#D8DAE5";       // card borders

const FF = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

const wrap = {
  padding: "80px 6vw",
  background: BG,
  fontFamily: FF,
};

const eyebrow = (color = ORANGE) => ({
  fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em",
  textTransform: "uppercase", color, margin: "0 0 14px 0",
  display: "block",
});

const h2 = {
  fontSize: "clamp(28px, 4vw, 46px)", fontWeight: "800",
  color: BLUE_DARK, lineHeight: "1.12", margin: "0 0 16px 0",
  letterSpacing: "-0.5px",
};

const bodyText = {
  fontSize: "15px", color: TEXT_MID, lineHeight: "1.7", margin: 0,
};

const pillTag = {
  display: "inline-block", padding: "3px 10px", borderRadius: "20px",
  background: "rgba(32,64,204,0.08)", color: BLUE_ACCENT,
  fontSize: "11px", fontWeight: "600",
  border: "1px solid rgba(32,64,204,0.18)",
};

const whiteCard = {
  background: "white", borderRadius: "16px",
  border: `1px solid ${BORDER}`, padding: "28px",
};

const iconBox = (bg = BLUE_MID) => ({
  width: "48px", height: "48px", borderRadius: "13px",
  background: bg, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "20px", flexShrink: 0,
});

const outlineBtn = {
  padding: "12px 22px", borderRadius: "50px",
  border: `1.5px solid ${BORDER}`, background: "white",
  fontSize: "13px", fontWeight: "600", color: BLUE_DARK,
  cursor: "pointer", fontFamily: FF,
};

const ghostBtnWhite = {
  padding: "13px 24px", borderRadius: "50px",
  border: "1.5px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)",
  color: "white", fontSize: "14px", fontWeight: "600",
  cursor: "pointer", fontFamily: FF,
};

// ─── 1. HERO ──────────────────────────────────────────────────────────────────
function PricingBadge({ label, tag = "Pricing" }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <span style={{ background: "#3B5BDB", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{tag}</span>
      <span style={{ color: "#555" }}>{label}</span>
    </div>
  );
}

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
      <div style={{ position: "relative", zIndex: 1, maxWidth: 900 }}>
        <PricingBadge label="Product · Pillar · Workflow · Enterprise" />
        <h1 style={{
          fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
          color: "#0B1C3F", margin: "0 0 20px",
        }}>
          Pricing that starts where<br />
          your business needs <span style={{ color: "#E8850A" }}>control most.</span>
        </h1>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#4B5563", margin: "0 0 12px" }}>
          Zoiko One pricing is designed for flexible adoption. Start with one product,
          activate a full pillar, price a connected workflow or build a multi-pillar platform plan.
        </p>
        <p style={{ fontSize: "13px", color: "#4B5563", marginBottom: "28px", fontStyle: "italic" }}>
          Whether you need HR, time, payroll, billing, spend, projects, inventory, compliance, insights or Docs Pro — there's a pricing path that scales.
        </p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{
            background: "linear-gradient(135deg, #E07B2A, #c9651a)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>Request Pricing →</button>
          <button onClick={() => navigate("/get-demo")} style={{
            background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
            border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}>Get a Demo</button>
        </div>
      </div>
    </section>
  );
}

// ─── 2. PRICING PHILOSOPHY ────────────────────────────────────────────────────
const philPoints = [
  { bg: ORANGE, emoji: "🎯", title: "Start focused", desc: "Begin with the product or workflow that solves the most urgent problem." },
  { bg: BLUE_ACCENT, emoji: "↗", title: "Expand cleanly", desc: "Add products, users, workflows and entities without rebuilding the model." },
  { bg: "#3BADD4", emoji: "⚖", title: "Pay for fit", desc: "Pricing reflects products, users, complexity, entities and support needs." },
  { bg: BLUE_DEEP, emoji: "↗", title: "Scale with control", desc: "Support broader governance, reporting and configuration as you grow." },
];

function PricingPhilosophy() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "52px" }}>
        <span style={eyebrow(BLUE_ACCENT)}>PRICING PHILOSOPHY</span>
        <h2 style={h2}>Buy only what you need now.<br />Expand when ready.</h2>
        <p style={{ ...bodyText, maxWidth: "520px", margin: "0 auto" }}>
          Zoiko One isn't priced as a one-size-fits-all bundle. Begin focused, then expand cleanly as operational needs grow.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "20px",
      }}>
        {philPoints.map(({ bg, emoji, title, desc }) => (
          <div key={title} style={{ ...whiteCard, display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={iconBox(bg)}>
              <span style={{ fontSize: "20px", color: "white", fontWeight: "700" }}>{emoji}</span>
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{title}</h3>
            <p style={{ fontSize: "13px", color: TEXT_MID, lineHeight: "1.6", margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 3. FOUR WAYS TO START ────────────────────────────────────────────────────
const pricingPaths = [
  {
    num: "①", numBg: BLUE_ACCENT,
    title: "Product Pricing",
    sub: "Solve a focused operational problem first.",
    detail: "Any single core product — HR, Time, Payroll, Billing, Spend, Projects, Inventory, Comply or Insights.",
    cta: "Price One Product", ctaBg: "outline",
  },
  {
    num: "②", numBg: ORANGE,
    title: "Pillar Pricing",
    sub: "Activate a complete operating area from day one.",
    detail: "A full pillar: People, Money, Work, Supply or Control.",
    cta: "Price a Pillar", ctaBg: "outline",
  },
  {
    num: "③", numBg: "#3BADD4",
    title: "Workflow Pricing",
    sub: "Connect a real operating handoff across products.",
    detail: "HR→Payroll, Project→Cash, Spend→Stock, Documents→Compliance, Billing→Insights.",
    cta: "Price a Workflow", ctaBg: "outline",
  },
  {
    num: "④", numBg: BLUE_DEEP,
    title: "Enterprise Platform",
    sub: "Multi-entity, agency, regulated or high-governance.",
    detail: "Multiple pillars, advanced permissions, custom workflows, integrations, migration and support.",
    cta: "Talk to Sales", ctaBg: "dark",
  },
];

function FourWays() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <span style={eyebrow(ORANGE)}>CHOOSE YOUR PRICING PATH</span>
        <h2 style={h2}>Four ways to start.</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
        {pricingPaths.map(({ num, numBg, title, sub, detail, cta, ctaBg }) => (
          <div key={title} style={{ ...whiteCard, display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{
              width: "44px", height: "44px", borderRadius: "12px",
              background: numBg, display: "flex", alignItems: "center",
              justifyContent: "center", color: "white",
              fontSize: "18px", fontWeight: "800",
            }}>{num}</div>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{title}</h3>
            <p style={{ fontSize: "13px", color: TEXT_MID, margin: 0, lineHeight: "1.5" }}>{sub}</p>
            <div style={{
              background: "#F4F5F9", borderRadius: "10px", padding: "14px",
              fontSize: "13px", color: TEXT_MID, lineHeight: "1.6", flex: 1,
            }}>{detail}</div>
            <button style={
              ctaBg === "dark"
                ? {
                  padding: "13px 18px", borderRadius: "50px", border: "none",
                  background: BLUE_DEEP, color: "white", fontSize: "13px",
                  fontWeight: "700", cursor: "pointer", fontFamily: FF,
                }
                : outlineBtn
            }>{cta}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 4. PRICING BY PRODUCT CATEGORY ──────────────────────────────────────────
const pillars = [
  {
    bg: BLUE_ACCENT, emoji: "👥",
    title: "People — HR, Time, Payroll",
    desc: "Employees, time requirements, payroll complexity, locations, approvals, jurisdiction config.",
    link: "Request People Pricing →", dark: false,
  },
  {
    bg: ORANGE, emoji: "$",
    title: "Money — Billing, Spend",
    desc: "Billing model, invoice volume, vendor count, supplier invoice volume, approval complexity.",
    link: "Request Money Pricing →", dark: false,
  },
  {
    bg: "#3BADD4", emoji: "⊞",
    title: "Work — Projects",
    desc: "Project users, client vs internal, budget/margin tracking, resource planning, billing connection.",
    link: "Request Work Pricing →", dark: false,
  },
  {
    bg: BLUE_MID, emoji: "◉",
    title: "Supply — Inventory",
    desc: "Inventory users, locations, stock items, goods movement volume, receiving and valuation.",
    link: "Request Supply Pricing →", dark: false,
  },
  {
    bg: BLUE_DEEP, emoji: "✓",
    title: "Control — Comply, Insights",
    desc: "Users, compliance workflows, evidence, dashboards, approval rules and multi-entity visibility.",
    link: "Request Control Pricing →", dark: false,
  },
  {
    bg: BLUE_DEEP, emoji: "▣", isDark: true,
    title: "Docs Pro — Premium Capability",
    desc: "Template needs, jurisdiction-aware requirements, workflow volume, approval routing, storage.",
    link: "Request Docs Pro Pricing →", dark: true,
  },
];

function PricingByCategory() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <span style={eyebrow(BLUE_ACCENT)}>PRICING BY PRODUCT CATEGORY</span>
        <h2 style={h2}>What drives pricing in each pillar.</h2>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {pillars.map(({ bg, emoji, title, desc, link, dark }) => (
          <div key={title} style={{
            display: "flex", alignItems: "center", gap: "18px",
            padding: "20px 24px",
            background: dark ? BLUE_DEEP : "white",
            borderRadius: dark ? "14px" : "0",
            borderBottom: dark ? "none" : `1px solid ${BORDER}`,
            marginBottom: dark ? "0" : "0",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: bg, display: "flex", alignItems: "center",
              justifyContent: "center", color: "white",
              fontSize: "16px", fontWeight: "700", flexShrink: 0,
            }}>{emoji}</div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: "15px", fontWeight: "700", color: dark ? "white" : BLUE_DARK, margin: "0 0 4px 0" }}>{title}</h4>
              <p style={{ fontSize: "13px", color: dark ? "rgba(255,255,255,0.65)" : TEXT_MUTED, margin: 0, lineHeight: "1.5" }}>{desc}</p>
            </div>
            <a href="#" style={{
              fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",
              color: dark ? ORANGE : BLUE_ACCENT, textDecoration: "none",
              flexShrink: 0,
            }}>{link}</a>
          </div>
        ))}

        {/* Docs Pro guardrail note */}
        <div style={{
          background: "white", borderRadius: "0 0 14px 14px",
          border: `1px solid ${BORDER}`, borderTop: "none",
          padding: "16px 24px",
        }}>
          <p style={{ fontSize: "12px", color: TEXT_MID, margin: 0, lineHeight: "1.6" }}>
            <strong>Docs Pro guardrail.</strong> Zoiko Docs Pro is a premium Documents-layer capability, not Product 10. It supports business document automation from approved templates and guided workflows. It is not legal advice and does not replace qualified professional review where required.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 5. PLAN COMPARISON (Pricing Table) ───────────────────────────────────────
const plans = [
  {
    name: "Starter", popular: false,
    sub: "Small teams starting with one product or one urgent workflow.",
    features: ["One selected product", "Core user access", "Basic workflow setup", "Standard approvals", "Core reporting", "Upgrade path"],
    cta: "Request Starter Pricing", ctaStyle: "outline",
    cardBg: "white", textColor: BLUE_DARK,
  },
  {
    name: "Growth", popular: true,
    sub: "Growing businesses standardizing a department or pillar.",
    features: ["One pillar or bundle", "Expanded users", "Workflow configuration", "Approval routing", "Documents layer", "Reporting dashboards", "Onboarding support"],
    cta: "Request Growth Pricing", ctaStyle: "orange",
    cardBg: "white", textColor: BLUE_DARK,
  },
  {
    name: "Advanced", popular: false,
    sub: "Connecting multiple workflows across departments.",
    features: ["Multiple products", "Cross-product workflows", "Advanced approvals", "Expanded reporting", "Integration support", "Docs Pro option", "Launch support"],
    cta: "Request Advanced Pricing", ctaStyle: "outline",
    cardBg: "white", textColor: BLUE_DARK,
  },
  {
    name: "Enterprise", popular: false,
    sub: "Multi-entity, agency, regulated or high-governance environments.",
    features: ["All pillars", "Enterprise permissions", "Enterprise configuration", "Custom workflows", "Migration support", "Security review", "Enterprise support"],
    cta: "Talk to Sales", ctaStyle: "orange",
    cardBg: BLUE_DEEP, textColor: "white",
  },
];

function PlanComparison() {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <span style={eyebrow(ORANGE)}>PLAN COMPARISON FRAMEWORK</span>
        <h2 style={h2}>Structure without guesswork.</h2>
        <p style={{ ...bodyText, maxWidth: "520px", margin: "0 auto" }}>
          Commercial structure designed for flexible adoption. Final pricing is shaped to your scope — request a quote for figures.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", alignItems: "start" }}>
        {plans.map(({ name, popular, sub, features, cta, ctaStyle, cardBg, textColor }, idx) => (
          <div key={name}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
            background: cardBg, borderRadius: "16px",
            border: hoveredIdx === idx ? `2px solid ${ORANGE}` : `1px solid ${BORDER}`,
            padding: "24px", display: "flex", flexDirection: "column", gap: "14px",
            position: "relative",
            transform: hoveredIdx === idx ? "scale(1.03)" : "scale(1)",
            transition: "transform 0.2s ease, border 0.2s ease",
            boxShadow: hoveredIdx === idx ? "0 8px 24px rgba(0,0,0,0.1)" : "none",
          }}>
            {popular && (
              <div style={{
                position: "absolute", top: "-14px", left: "50%",
                transform: "translateX(-50%)",
                background: ORANGE, color: "white",
                fontSize: "11px", fontWeight: "700",
                padding: "4px 14px", borderRadius: "20px",
                letterSpacing: "0.05em",
              }}>POPULAR</div>
            )}
            <h3 style={{ fontSize: "20px", fontWeight: "800", color: textColor, margin: 0 }}>{name}</h3>
            <p style={{ fontSize: "13px", color: cardBg === BLUE_DEEP ? "rgba(255,255,255,0.7)" : TEXT_MID, margin: 0, lineHeight: "1.5" }}>{sub}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
              {features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: cardBg === BLUE_DEEP ? "rgba(255,255,255,0.6)" : ORANGE, fontSize: "13px" }}>✓</span>
                  <span style={{
                    fontSize: "13px",
                    color: cardBg === BLUE_DEEP ? "rgba(255,255,255,0.75)" : TEXT_MID,
                  }}>{f}</span>
                </div>
              ))}
            </div>
            <button style={
              ctaStyle === "orange"
                ? {
                  padding: "13px 18px", borderRadius: "50px", border: "none",
                  background: ORANGE, color: "white", fontSize: "13px",
                  fontWeight: "700", cursor: "pointer", fontFamily: FF, marginTop: "8px",
                  boxShadow: "0 4px 14px rgba(224,123,42,0.4)",
                }
                : { ...outlineBtn, marginTop: "8px", width: "100%" }
            }>{cta}</button>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", fontSize: "12px", color: TEXT_MUTED, marginTop: "20px" }}>
        Public price points are not published here; pricing is confirmed to your scope by our team.
      </p>
    </section>
  );
}

// ─── 6. QUOTE BUILDER FORM ────────────────────────────────────────────────────
const needTags = ["HR", "Time", "Payroll", "Billing", "Spend", "Projects", "Inventory", "Comply", "Insights", "Docs Pro"];
const pathTags = ["Product", "Pillar", "Workflow", "Enterprise"];

function QuoteBuilder() {
  const [selectedPath, setSelectedPath] = useState([]);
  const [selectedNeeds, setSelectedNeeds] = useState([]);

  const toggle = (arr, setArr, val) =>
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: `1.5px solid ${BORDER}`, fontSize: "14px",
    color: BLUE_DARK, outline: "none", boxSizing: "border-box",
    background: "white", fontFamily: FF,
  };

  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "40px",
        alignItems: "start",
      }}>
        {/* Left */}
        <div>
          <span style={eyebrow(BLUE_ACCENT)}>QUOTE BUILDER</span>
          <h2 style={{ ...h2, fontSize: "clamp(26px, 3vw, 38px)" }}>
            Get a pricing recommendation in minutes.
          </h2>
          <p style={{ ...bodyText, marginBottom: "28px" }}>
            Tell us a little about your business and what you need first. We'll route you to the right pricing path and prepare a relevant recommendation.
          </p>

          {/* Blue info card */}
          <div style={{
            background: BLUE_DEEP, borderRadius: "16px", padding: "28px",
            color: "white",
          }}>
            <h4 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 20px 0" }}>What shapes your quote</h4>
            {[
              { emoji: "🔵", title: "Products & pillars", sub: "What you start with and plan to add" },
              { emoji: "👥", title: "Users & entities", sub: "Team size, locations and entities" },
              { emoji: "⇄", title: "Workflow complexity", sub: "Approvals, integrations and migration" },
              { emoji: "✓", title: "Support & governance", sub: "Onboarding, security review, SLAs" },
            ].map(({ emoji, title, sub }) => (
              <div key={title} style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "15px", flexShrink: 0,
                }}>{emoji}</div>
                <div>
                  <p style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 2px 0" }}>{title}</p>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — form */}
        <div style={{
          background: "white", borderRadius: "20px",
          border: `1px solid ${BORDER}`, padding: "32px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}>
          {/* Row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "6px" }}>
                Business email <span style={{ color: "red" }}>*</span>
              </label>
              <input type="email" placeholder="you@company.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "6px" }}>
                Company name <span style={{ color: "red" }}>*</span>
              </label>
              <input type="text" placeholder="Company" style={inputStyle} />
            </div>
          </div>

          {/* Row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "6px" }}>
                Company size <span style={{ color: "red" }}>*</span>
              </label>
              <select style={{ ...inputStyle, appearance: "none" }}>
                {["1–10", "11–50", "51–200", "201–500", "500+"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "6px" }}>
                Country / region <span style={{ color: "red" }}>*</span>
              </label>
              <input type="text" placeholder="Country" style={inputStyle} />
            </div>
          </div>

          {/* Pricing path */}
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "10px" }}>
              Which pricing path fits best?
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {pathTags.map(t => (
                <button key={t} onClick={() => toggle(selectedPath, setSelectedPath, t)}
                  style={{
                    ...pillTag,
                    padding: "7px 16px", cursor: "pointer",
                    background: selectedPath.includes(t) ? BLUE_ACCENT : "rgba(32,64,204,0.06)",
                    color: selectedPath.includes(t) ? "white" : BLUE_ACCENT,
                    border: selectedPath.includes(t) ? "none" : "1px solid rgba(32,64,204,0.2)",
                    fontFamily: FF, fontSize: "13px",
                    transition: "all 0.15s",
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* What do you need */}
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "10px" }}>
              What do you need first?
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {needTags.map(t => (
                <button key={t} onClick={() => toggle(selectedNeeds, setSelectedNeeds, t)}
                  style={{
                    ...pillTag,
                    padding: "7px 16px", cursor: "pointer",
                    background: selectedNeeds.includes(t) ? BLUE_ACCENT : "rgba(32,64,204,0.06)",
                    color: selectedNeeds.includes(t) ? "white" : BLUE_ACCENT,
                    border: selectedNeeds.includes(t) ? "none" : "1px solid rgba(32,64,204,0.2)",
                    fontFamily: FF, fontSize: "13px",
                    transition: "all 0.15s",
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Anything else */}
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: TEXT_MID, display: "block", marginBottom: "6px" }}>
              Anything else we should know?
            </label>
            <textarea rows={3} placeholder="Current systems, timeline, integration or migration needs…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: "1.5" }} />
          </div>

          {/* Submit */}
          <button style={{
            padding: "15px", borderRadius: "50px", border: "none",
            background: ORANGE, color: "white", fontSize: "15px",
            fontWeight: "700", cursor: "pointer", fontFamily: FF,
            boxShadow: "0 6px 20px rgba(224,123,42,0.4)",
          }}>Request Pricing →</button>

          <p style={{ fontSize: "11px", color: TEXT_MUTED, textAlign: "center", margin: 0, lineHeight: "1.6" }}>
            By submitting, you agree Zoiko One may contact you about your request, handled per our Privacy Policy.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            {["Privacy Policy", "Trust Center", "Talk to Sales"].map(l => (
              <a key={l} href="#" style={{ fontSize: "12px", fontWeight: "600", color: BLUE_DARK, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 7. PRICING FAQs ──────────────────────────────────────────────────────────
const faqs = [
  { q: "Can I buy one product first?", a: "Yes. Product Pricing lets you activate any single core product — HR, Time, Payroll, Billing, Spend, Projects, Inventory, Comply or Insights — and expand from there." },
  { q: "Does Zoiko One offer bundle pricing?", a: "Yes. Pillar Pricing bundles a complete operating area (People, Money, Work, Supply or Control) at a structured price, and Workflow Pricing connects products across operating handoffs." },
  { q: "Is Zoiko Docs Pro priced separately?", a: "Yes. Docs Pro is a premium Documents-layer capability priced separately based on template needs, jurisdiction requirements, workflow volume and approval routing." },
  { q: "What affects pricing?", a: "Products and pillars selected, number of users and entities, workflow complexity, integration and migration needs, and support or governance requirements." },
  { q: "How do I request a quote?", a: "Use the Quote Builder above to share your business context. Our team will review your scope and return a tailored pricing recommendation." },
];

function PricingFAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <span style={eyebrow(ORANGE)}>PRICING FAQS</span>
        <h2 style={h2}>Pricing questions, answered.</h2>
      </div>
      <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        {faqs.map(({ q, a }, i) => (
          <div key={i} style={{
            background: "white", borderRadius: "12px",
            border: `1px solid ${BORDER}`, overflow: "hidden",
          }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", padding: "20px 24px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: FF, textAlign: "left",
              }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: BLUE_DARK }}>{q}</span>
              <span style={{ fontSize: "18px", color: TEXT_MUTED, flexShrink: 0, marginLeft: "16px" }}>
                {open === i ? "∧" : "∨"}
              </span>
            </button>
            {open === i && (
              <div style={{ padding: "0 24px 20px", fontSize: "14px", color: TEXT_MID, lineHeight: "1.7" }}>
                {a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 8. BOTTOM CTA BANNER ─────────────────────────────────────────────────────
function BottomCTA() {
  const navigate = useNavigate();
  return (
    <section style={{ ...wrap, paddingTop: "20px", paddingBottom: "80px" }}>
      <div style={{
        background: "linear-gradient(130deg, #2a3db5 0%, #2348d4 45%, #1a7ae0 100%)",
        borderRadius: "24px", padding: "64px 48px",
        textAlign: "center",
        boxShadow: "0 16px 48px rgba(32,64,204,0.35)",
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
            Price the path that fits your business.
          </h2>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", lineHeight: "1.7" }}>
            Start with one product, one pillar or one workflow — and scale with control.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{
              padding: "14px 28px", borderRadius: "50px", border: "none",
              background: ORANGE, color: "white", fontSize: "15px",
              fontWeight: "700", cursor: "pointer", fontFamily: FF,
              boxShadow: "0 6px 20px rgba(224,123,42,0.5)",
            }}>Request Pricing</button>
            <button onClick={() => navigate("/get-demo")} style={ghostBtnWhite}>Get a Demo</button>
            <button style={ghostBtnWhite}>Explore Products</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ background: BG, fontFamily: FF, minHeight: "100vh" }}>
      <LandingHeader />
      <Hero />
      <PricingPhilosophy />
      <FourWays />
      <PricingByCategory />
      <PlanComparison />
      <QuoteBuilder />
      <PricingFAQ />
      <BottomCTA />
      <Footer />
    </div>
  );
}
