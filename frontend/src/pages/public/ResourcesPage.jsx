import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

// ─── Color tokens ─────────────────────────────────────────────────────────────
const BG          = "#E8E9EE";   // warm silver-grey page bg
const BLUE_DARK   = "#192660";   // deep navy headings
const BLUE_ACCENT = "#2040CC";   // royal blue eyebrows / links
const BLUE_MID    = "#2B4ACB";   // mid blue icon boxes
const BLUE_DEEP   = "#172158";   // darkest navy
const BLUE_CARD   = "#1E3AB8";   // resource card blue bg
const ORANGE      = "#E07B2A";   // orange CTAs / accents
const TEXT_MID    = "#3D4A6B";   // body text
const TEXT_MUTED  = "#6B7280";   // muted
const BORDER      = "#D8DAE5";   // card borders
const FF          = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

// ─── Shared helpers ───────────────────────────────────────────────────────────
const wrap = { padding: "80px 6vw", background: BG, fontFamily: FF };

function Badge({ label, tag = "Resources" }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <span style={{ background: "#3B5BDB", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{tag}</span>
      <span style={{ color: "#555" }}>{label}</span>
    </div>
  );
}

const eyebrow = (color = ORANGE) => ({
  fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em",
  textTransform: "uppercase", color, margin: "0 0 14px 0", display: "block",
});

const h2Style = {
  fontSize: "clamp(28px, 4vw, 46px)", fontWeight: "800",
  color: BLUE_DARK, lineHeight: "1.12", margin: "0 0 16px 0", letterSpacing: "-0.5px",
};

const bodyText = { fontSize: "15px", color: TEXT_MID, lineHeight: "1.7", margin: 0 };

const whiteCard = {
  background: "white", borderRadius: "14px",
  border: `1px solid ${BORDER}`, padding: "24px",
};

const iconBox = (bg = BLUE_MID, size = 44) => ({
  width: `${size}px`, height: `${size}px`, borderRadius: "12px",
  background: bg, display: "flex", alignItems: "center",
  justifyContent: "center", flexShrink: 0,
});

const ghostBtnWhite = {
  padding: "13px 24px", borderRadius: "50px",
  border: "1.5px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)",
  color: "white", fontSize: "14px", fontWeight: "600",
  cursor: "pointer", fontFamily: FF,
};

// ─── 1. HERO ──────────────────────────────────────────────────────────────────
function HeroSection() {
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
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100 }}>
        <Badge label="An enablement center, not a blog" />
        <h1 style={{
          fontSize: "clamp(32px,5vw,56px)", fontWeight: 800,
          lineHeight: 1.1, color: "#0B1C3F",
          margin: "0 auto 20px", maxWidth: "1000px",
        }}>
          Resources to help you understand,<br />
          implement, and <span style={{ color: "#E8850A" }}>scale Zoiko One.</span>
        </h1>
        <p style={{
          fontSize: "16px", lineHeight: 1.7, color: "#4B5563",
          margin: "0 auto 12px", maxWidth: "700px",
        }}>
          Explore guides, product explainers, workflow playbooks, implementation checklists,
          templates, FAQs, trust resources and developer documentation — whatever stage you're at.
        </p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", marginTop: "28px" }}>
          <button style={{
            background: "linear-gradient(135deg, #E07B2A, #c9651a)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>Explore Resources →</button>
          <button style={{
            background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
            border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}>Visit Trust Center</button>
        </div>
      </div>
    </section>
  );
}

// ─── 2. SIX WAYS TO MOVE FORWARD ─────────────────────────────────────────────
const sixWays = [
  {
    emoji: "📘", bg: BLUE_MID,
    title: "Understand Zoiko One",
    desc: "Learn the platform model, five pillars, product architecture, Docs Pro boundary and connected spine.",
    link: "Start Learning →",
  },
  {
    emoji: "🎯", bg: ORANGE,
    title: "Choose the Right Product",
    desc: "Compare products, pillars, workflows and starting paths.",
    link: "Find My Fit →",
  },
  {
    emoji: "📋", bg: BLUE_ACCENT,
    title: "Plan Implementation",
    desc: "Prepare users, roles, data, workflows, approvals, documents, integrations and training.",
    link: "Plan Rollout →",
  },
  {
    emoji: "⇄", bg: BLUE_MID,
    title: "Build Connected Workflows",
    desc: "Explore HR-to-payroll, project-to-cash, spend-to-stock and documents-to-compliance.",
    link: "View Playbooks →",
  },
  {
    emoji: "⚙", bg: BLUE_DEEP,
    title: "Technical Resources",
    desc: "Developer docs, APIs, integrations, status, release notes and technical guidance.",
    link: "View Developer Resources →",
  },
  {
    emoji: "💬", bg: "#3BADD4",
    title: "Get Help",
    desc: "Support articles, FAQs, setup guidance and user assistance.",
    link: "Visit Help Center →",
  },
];

function SixWays() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <span style={eyebrow(ORANGE)}>FIND YOUR PATH</span>
        <h2 style={h2Style}>Six ways to move forward.</h2>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px",
      }}>
        {sixWays.map(({ emoji, bg, title, desc, link }) => (
          <div key={title} style={{ ...whiteCard, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={iconBox(bg, 34)}>
                <span style={{ fontSize: "16px" }}>{emoji}</span>
              </div>
              <h3 style={{ fontSize: "15px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{title}</h3>
            </div>
            <p style={{ fontSize: "13px", color: TEXT_MID, lineHeight: "1.6", margin: 0, flex: 1 }}>{desc}</p>
            <a href="#" style={{ fontSize: "13px", fontWeight: "700", color: BLUE_DARK, textDecoration: "none" }}>{link}</a>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 3. FEATURED RESOURCES (3×2 card grid) ───────────────────────────────────
const featured = [
  {
    thumbBg: "linear-gradient(135deg, #1E3AB8 0%, #2B4ACB 100%)",
    thumbEmoji: "📕",
    tag: "GUIDE", tagColor: ORANGE,
    title: "The Zoiko One Buyer Guide",
    desc: "For founders, executives, finance, HR, operations and IT buyers.",
    link: "Read Buyer Guide →",
  },
  {
    thumbBg: `linear-gradient(135deg, ${ORANGE} 0%, #f0952e 100%)`,
    thumbEmoji: "🎯",
    tag: "INTERACTIVE TOOL", tagColor: ORANGE,
    title: "Product Fit Quiz",
    desc: "For buyers who are interested but not yet sure where to begin.",
    link: "Find My Product Fit →",
  },
  {
    thumbBg: "linear-gradient(135deg, #2B4ACB 0%, #1a7ae0 100%)",
    thumbEmoji: "✅",
    tag: "CHECKLIST", tagColor: ORANGE,
    title: "Implementation Readiness Checklist",
    desc: "For teams preparing for rollout.",
    link: "Download Checklist →",
  },
  {
    thumbBg: "linear-gradient(135deg, #1E3AB8 0%, #2B4ACB 100%)",
    thumbEmoji: "⇄",
    tag: "PLAYBOOK", tagColor: ORANGE,
    title: "Workflow Playbook: HR to Payroll",
    desc: "For HR, payroll, finance and operations teams.",
    link: "View Playbook →",
  },
  {
    thumbBg: "linear-gradient(135deg, #3BADD4 0%, #2B8ECC 100%)",
    thumbEmoji: "💰",
    tag: "PLAYBOOK", tagColor: ORANGE,
    title: "Workflow Playbook: Project to Cash",
    desc: "For agencies, service businesses, project and finance teams.",
    link: "View Playbook →",
  },
  {
    thumbBg: "linear-gradient(135deg, #172158 0%, #1E3AB8 100%)",
    thumbEmoji: "🛡",
    tag: "TRUST RESOURCE", tagColor: ORANGE,
    title: "Trust Center Overview",
    desc: "For IT, legal, procurement, compliance and enterprise buyers.",
    link: "Visit Trust Center →",
  },
];

function FeaturedResources() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <span style={eyebrow(BLUE_ACCENT)}>FEATURED RESOURCES</span>
        <h2 style={h2Style}>High-impact assets to move you forward.</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
        {featured.map(({ thumbBg, thumbEmoji, tag, tagColor, title, desc, link }) => (
          <div key={title} style={{ ...whiteCard, padding: "0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Thumbnail */}
            <div style={{
              height: "160px", background: thumbBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "48px",
            }}>{thumbEmoji}</div>
            {/* Body */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
              <span style={{
                fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em",
                textTransform: "uppercase", color: tagColor,
              }}>{tag}</span>
              <h3 style={{ fontSize: "16px", fontWeight: "800", color: BLUE_DARK, margin: 0, lineHeight: "1.3" }}>{title}</h3>
              <p style={{ fontSize: "13px", color: TEXT_MID, margin: 0, lineHeight: "1.6", flex: 1 }}>{desc}</p>
              <a href="#" style={{ fontSize: "13px", fontWeight: "700", color: BLUE_DARK, textDecoration: "none", marginTop: "4px" }}>{link}</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 4. LEARN ZOIKO ONE (operating model rows) ────────────────────────────────
const learnItems = [
  {
    bg: BLUE_MID, emoji: "◎",
    title: "What Is Zoiko One?",
    desc: "Platform, five pillars, nine core products, Docs Pro, shared spine and operating model.",
    link: "Read Overview →",
  },
  {
    bg: BLUE_MID, emoji: "●",
    title: "The Five-Pillar Model",
    desc: "How People, Money, Work, Supply and Control organize the platform.",
    link: "Explore Pillars →",
  },
  {
    bg: BLUE_MID, emoji: "⇄",
    title: "The Shared Platform Spine",
    desc: "ZoikoID, Workflow, Hub, Connect, Documents, Approvals, Expenses and AI Assistance.",
    link: "Learn the Spine →",
  },
  {
    bg: BLUE_MID, emoji: "▣",
    title: "Nine Core Products + Docs Pro",
    desc: "The product architecture and why Docs Pro is a premium capability, not Product 10.",
    link: "View Architecture →",
  },
  {
    bg: BLUE_ACCENT, emoji: "↗",
    title: "Zoiko One vs. Disconnected Tools",
    desc: "How connected workflows reduce duplication, manual reconciliation and fragmented visibility.",
    link: "Compare Models →",
  },
];

function LearnZoikoOne() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <span style={eyebrow(BLUE_ACCENT)}>LEARN ZOIKO ONE</span>
        <h2 style={h2Style}>Understand the operating model first.</h2>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {learnItems.map(({ bg, emoji, title, desc, link }, i) => (
          <div key={title} style={{
            display: "flex", alignItems: "center", gap: "18px",
            padding: "20px 24px",
            background: "white",
            borderRadius: i === 0 ? "14px 14px 0 0" : i === learnItems.length - 1 ? "0 0 14px 14px" : "0",
            borderBottom: i < learnItems.length - 1 ? `1px solid ${BORDER}` : "none",
            border: `1px solid ${BORDER}`,
            borderTop: i === 0 ? `1px solid ${BORDER}` : "none",
          }}>
            <div style={iconBox(bg, 42)}>
              <span style={{ color: "white", fontSize: "18px", fontWeight: "700" }}>{emoji}</span>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: "15px", fontWeight: "700", color: BLUE_DARK, margin: "0 0 4px 0" }}>{title}</h4>
              <p style={{ fontSize: "13px", color: TEXT_MUTED, margin: 0, lineHeight: "1.5" }}>{desc}</p>
            </div>
            <a href="#" style={{
              fontSize: "13px", fontWeight: "600", color: BLUE_ACCENT,
              textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            }}>{link}</a>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 5. PRODUCT RESOURCE LIBRARY (10 products grid) ──────────────────────────
const products = [
  { bg: BLUE_MID,   emoji: "👥", name: "Zoiko HR",       tags: "Records · onboarding · documents" },
  { bg: BLUE_MID,   emoji: "⏱",  name: "ZoikoTime",      tags: "Time · attendance · timesheets" },
  { bg: "#3BADD4",  emoji: "$",   name: "Zoiko Payroll",  tags: "Pay runs · payslips · evidence" },
  { bg: ORANGE,     emoji: "▣",  name: "Zoiko Billing",  tags: "Invoices · subscriptions · revenue" },
  { bg: ORANGE,     emoji: "—",  name: "Zoiko Spend",    tags: "POs · supplier invoices · AP" },
  { bg: "#3BADD4",  emoji: "⊞",  name: "Zoiko Projects", tags: "Budgets · margins · delivery" },
  { bg: BLUE_ACCENT,emoji: "◉",  name: "Zoiko Inventory",tags: "Stock · receiving · valuation" },
  { bg: BLUE_DEEP,  emoji: "✓",  name: "Zoiko Comply",   tags: "Controls · evidence · audits" },
  { bg: BLUE_DEEP,  emoji: "📊", name: "Zoiko Insights", tags: "Dashboards · risk · forecasts" },
  { bg: ORANGE,     emoji: "▣",  name: "Zoiko Docs Pro", tags: "Templates · approvals · storage" },
];

function ProductLibrary() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <span style={eyebrow(ORANGE)}>PRODUCT RESOURCE LIBRARY</span>
        <h2 style={h2Style}>Go deeper by product.</h2>
        <p style={{ ...bodyText, maxWidth: "520px", margin: "0 auto" }}>
          Explainers, FAQs, setup guidance, workflow examples and buyer guidance for every product.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
        {products.map(({ bg, emoji, name, tags }) => (
          <div key={name} style={{
            ...whiteCard, padding: "18px",
            display: "flex", flexDirection: "column", gap: "10px",
            cursor: "pointer",
          }}>
            <div style={iconBox(bg, 42)}>
              <span style={{ color: "white", fontSize: "18px", fontWeight: "700" }}>{emoji}</span>
            </div>
            <h4 style={{ fontSize: "14px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{name}</h4>
            <p style={{ fontSize: "12px", color: TEXT_MUTED, margin: 0, lineHeight: "1.5" }}>{tags}</p>
          </div>
        ))}
      </div>

      {/* Docs Pro guardrail */}
      <div style={{
        marginTop: "24px", background: "white", borderRadius: "12px",
        border: `1px solid ${BORDER}`, padding: "16px 24px",
        maxWidth: "700px",
      }}>
        <p style={{ fontSize: "12px", color: TEXT_MID, margin: 0, lineHeight: "1.6" }}>
          <strong>Docs Pro guardrail.</strong> Docs Pro resources do not imply legal advice, guaranteed compliance,
          legal validity in all cases, or that qualified professional review is unnecessary.
        </p>
      </div>
    </section>
  );
}

// ─── 6. BOTTOM CTA BANNER ─────────────────────────────────────────────────────
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
        {/* Decorative concentric wave lines — pure CSS */}
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: `${200 + i * 120}px`,
            height: `${200 + i * 120}px`,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.06)",
            pointerEvents: "none",
          }} />
        ))}

        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: "800",
            color: "white", margin: "0 0 16px 0", letterSpacing: "-0.5px",
          }}>
            Educate, evaluate, implement, expand.
          </h2>
          <p style={{
            fontSize: "15px", color: "rgba(255,255,255,0.8)",
            margin: "0 auto 36px", maxWidth: "480px", lineHeight: "1.7",
          }}>
            From first look to full rollout, the Resource Center gives your team a clear path forward.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/get-demo")} style={{
              padding: "14px 28px", borderRadius: "50px", border: "none",
              background: ORANGE, color: "white", fontSize: "15px",
              fontWeight: "700", cursor: "pointer", fontFamily: FF,
              boxShadow: "0 6px 20px rgba(224,123,42,0.5)",
            }}>Get a Demo</button>
            <button style={ghostBtnWhite}>Find My Product Fit</button>
            <button style={ghostBtnWhite}>Request Pricing</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function ResourcesPage() {
  return (
    <div style={{ fontFamily: FF, minHeight: "100vh" }}>
      <LandingHeader />
      <HeroSection />
      <SixWays />
      <FeaturedResources />
      <LearnZoikoOne />
      <ProductLibrary />
      <BottomCTA />
      <Footer />
    </div>
  );
}
