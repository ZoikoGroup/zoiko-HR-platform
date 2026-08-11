import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

// ─── Color tokens ─────────────────────────────────────────────────────────────
const NAVY = "#0B1C3F";
const BLUE = "#1A3A8C";
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

// ─── 1. HERO ──────────────────────────────────────────────────────────────────
function PlatformBadge({ label, tag = "Platform" }) {
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
        <PlatformBadge label="Nine core products + Docs Pro" />
        <h1 style={{
          fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
          color: "#0B1C3F", margin: "0 0 20px",
        }}>
          One platform to run people, money, work, supply and{" "}
          <span style={{ color: "#E8850A" }}>control.</span>
        </h1>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#4B5563", margin: "0 0 12px" }}>
          Zoiko One connects the core operations of a modern business through one governed business-operations platform — HR, time, payroll, billing, spend, projects, inventory, compliance, documents, approvals, workflows, insights and AI assistance in one shared operating system.
        </p>
        <p style={{ fontSize: "13px", color: "#4B5563", marginBottom: "28px", fontStyle: "italic" }}>
          Start with one product, activate a pillar or scale into the full platform.
        </p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/get-demo")} style={{
            background: "linear-gradient(135deg, #E07B2A, #c9651a)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>Get a Demo →</button>
          <button style={{
            background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
            border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}>Explore Products</button>
        </div>
      </div>
    </section>
  );
}

// ─── 2. THE PLATFORM PROBLEM ──────────────────────────────────────────────────
function Problem() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
        <div>
          <span style={eyebrow(ORANGE)}>The Platform Problem</span>
          <h2 style={h2}>Disconnected tools slow down growing businesses.</h2>
          <p style={bodyText}>
            Most businesses don't suffer from too little software — they suffer from too many disconnected systems. Zoiko One fixes the operating gap between departments by connecting data, approvals, documents, workflows and evidence.
          </p>
          <button style={{
            padding: "14px 28px", borderRadius: "50px", border: "none",
            background: NAVY, color: WHITE, fontSize: "15px",
            fontWeight: "700", cursor: "pointer", fontFamily: FF, marginTop: "28px",
          }}>See the Platform Difference →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ ...whiteCard }}>
            <p style={{ fontWeight: 700, marginBottom: "12px", color: DARK_TEXT }}>Disconnected stack</p>
            {["Manual exports between tools", "Approvals lost in email", "Re-keyed data & errors", "Reporting after the fact", "No shared evidence trail"].map(t => (
              <div key={t} style={{ display: "flex", gap: "8px", marginBottom: "8px", fontSize: "13px", color: SUBTLE_TEXT }}>
                <span style={{ color: "#EF4444", fontWeight: 700 }}>✕</span> {t}
              </div>
            ))}
          </div>
          <div style={{ ...whiteCard, background: BLUE, border: "none" }}>
            <p style={{ fontWeight: 700, marginBottom: "12px", color: "#fff" }}>Zoiko One</p>
            {["One shared data spine", "Structured approval routing", "Clean cross-product handoffs", "Live operating visibility", "Audit-ready evidence"].map(t => (
              <div key={t} style={{ display: "flex", gap: "8px", marginBottom: "8px", fontSize: "13px", color: "#CBD5E1" }}>
                <span style={{ color: "#4ADE80", fontWeight: 700 }}>✓</span> {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 3. FIVE-PILLAR OPERATING MODEL ───────────────────────────────────────────
const pillars = [
  { bg: BLUE, icon: "👥", label: "PEOPLE", title: "People", desc: "Manage, track and pay the people who run the business.", tags: ["HR", "Time", "Payroll"] },
  { bg: ORANGE, icon: "$", label: "MONEY", title: "Money", desc: "Control money in, money out, billing and vendor spend.", tags: ["Billing", "Spend"] },
  { bg: "#3B82F6", icon: "⊞", label: "WORK", title: "Work", desc: "Plan, deliver and monitor projects, budgets, margins and milestones.", tags: ["Projects"] },
  { bg: "#6366F1", icon: "◈", label: "SUPPLY", title: "Supply", desc: "Manage stock, locations, goods movement, receiving and valuation.", tags: ["Inventory"] },
  { bg: NAVY, icon: "✓", label: "CONTROL", title: "Control", desc: "Govern compliance, evidence, risk, dashboards and intelligence.", tags: ["Comply", "Insights"] },
];

function Pillars() {
  return (
    <section style={{ ...wrap, background: OFF_WHITE, textAlign: "center" }}>
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <span style={eyebrow(BLUE)}>Five-Pillar Operating Model</span>
        <h2 style={h2}>Built around how businesses actually operate.</h2>
        <p style={{ ...bodyText, maxWidth: "520px", margin: "0 auto" }}>Every product belongs to a pillar and shares the same platform spine.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", maxWidth: "1100px", margin: "0 auto 36px" }}>
        {pillars.map(p => (
          <div key={p.title} style={{ ...whiteCard, textAlign: "left", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={iconBox(p.bg)}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "18px" }}>{p.icon}</span>
            </div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: p.bg, letterSpacing: "0.1em" }}>{p.label}</div>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: NAVY, margin: 0 }}>{p.title}</h3>
            <p style={{ fontSize: "13px", color: SUBTLE_TEXT, margin: 0, lineHeight: "1.6" }}>{p.desc}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {p.tags.map(t => <span key={t} style={pillTag}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>
      <button style={outlineBtn}>Explore the Five Pillars</button>
    </section>
  );
}

// ─── 4. THE CONNECTED SPINE ───────────────────────────────────────────────────
const spineItems = [
  { icon: "🪪", title: "ZoikoID", sub: "Identity, roles, permissions, entities" },
  { icon: "⇄", title: "Zoiko Workflow", sub: "Routing, approvals, escalations, policy" },
  { icon: "◎", title: "Zoiko Hub", sub: "Tasks, alerts, approvals, daily priorities" },
  { icon: "⊡", title: "Zoiko Connect", sub: "APIs, connectors, imports & exports" },
  { icon: "📄", title: "Documents + Docs Pro", sub: "Governance plus premium automation" },
  { icon: "✦", title: "AI Assistance", sub: "Governed, inside policy & approvals" },
];

function Spine() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
        <div>
          <span style={eyebrow(ORANGE)}>The Connected Spine</span>
          <h2 style={h2}>One connected spine beneath every product.</h2>
          <p style={bodyText}>
            ZoikoID, Workflow, Hub, Connect, Documents, Approvals, Expenses and AI Assistance create the common operating foundation across the platform. These are shared layers — not separate pillar products.
          </p>
          <button style={{
            padding: "14px 28px", borderRadius: "50px", border: "none",
            background: NAVY, color: WHITE, fontSize: "15px",
            fontWeight: "700", cursor: "pointer", fontFamily: FF, marginTop: "28px",
          }}>See Connected Workflows →</button>
        </div>
        <div style={{ background: BLUE, borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {spineItems.map(item => (
            <div key={item.title} style={{ background: "rgba(255,255,255,0.1)", borderRadius: "12px", padding: "14px 18px", display: "flex", gap: "14px", alignItems: "center" }}>
              <span style={{ fontSize: "20px" }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>{item.title}</div>
                <div style={{ fontSize: "12px", color: "#CBD5E1" }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 5. HOW ZOIKO ONE WORKS ───────────────────────────────────────────────────
const workflows = [
  {
    n: 1, title: "New employee to payroll",
    steps: ["HR record", "ZoikoID access", "Approved time", "Payroll workflow", "Approval", "Documents / evidence", "Insights"],
  },
  {
    n: 2, title: "Project to billing",
    steps: ["Project setup", "Resources & milestones", "Approved billable time", "Billing event", "Approval", "Revenue & margin"],
  },
  {
    n: 3, title: "Spend to inventory",
    steps: ["Purchase request", "Policy check", "Approval", "PO", "Goods received", "Inventory movement", "Supplier invoice evidence"],
  },
  {
    n: 4, title: "Documents to compliance",
    steps: ["Approved template", "Guided workflow", "Review", "Approval", "Secure storage", "Evidence", "Compliance trail"],
  },
];

function Workflows() {
  return (
    <section style={{ ...wrap, background: OFF_WHITE }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <span style={eyebrow(BLUE)}>How Zoiko One Works</span>
          <h2 style={h2}>From business event to approved action.</h2>
          <p style={{ ...bodyText, maxWidth: "560px", margin: "0 auto" }}>
            Business events trigger structured workflows, approvals, record updates and evidence capture across the relevant products and platform layers.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {workflows.map(w => (
            <div key={w.n} style={{ ...whiteCard }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ background: ORANGE, color: "#fff", borderRadius: "8px", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px" }}>{w.n}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{w.title}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                {w.steps.map((s, i) => (
                  <span key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={pillTag}>{s}</span>
                    {i < w.steps.length - 1 && <span style={{ color: GRAY, fontSize: "12px" }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 6. GOVERNANCE & AI ────────────────────────────────────────────────────────
const govCards = [
  { icon: "🪪", title: "Identity & permissions", desc: "Role boundaries across teams, departments and entities." },
  { icon: "✓", title: "Approval routing", desc: "Structured, standardized approvals across products." },
  { icon: "📄", title: "Evidence & audit", desc: "Decision trails, document history and activity records." },
  { icon: "✦", title: "Governed AI", desc: "Summaries, drafting, routing and exception analysis — in-bounds." },
];

function Governance() {
  return (
    <section style={{ ...wrap, background: NAVY, textAlign: "center" }}>
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <span style={eyebrow(ORANGE)}>Governance & AI</span>
        <h2 style={{ ...h2, color: "#fff" }}>Control is built into the platform, not added at the end.</h2>
        <p style={{ ...bodyText, color: "#94A3B8", maxWidth: "600px", margin: "0 auto" }}>
          Governance is embedded through identity, permissions, approvals, evidence trails and document controls. AI assistance helps users act faster — inside permission, policy and approval boundaries.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", maxWidth: "1000px", margin: "0 auto 36px" }}>
        {govCards.map(c => (
          <div key={c.title} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px", textAlign: "left" }}>
            <span style={{ fontSize: "22px", marginBottom: "10px", display: "block" }}>{c.icon}</span>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: "6px" }}>{c.title}</div>
            <div style={{ fontSize: "13px", color: "#94A3B8" }}>{c.desc}</div>
          </div>
        ))}
      </div>
      <button style={{
        padding: "14px 28px", borderRadius: "50px", border: "none",
        background: ORANGE, color: WHITE, fontSize: "15px",
        fontWeight: "700", cursor: "pointer", fontFamily: FF,
      }}>See AI Assistance in Action →</button>
    </section>
  );
}

// ─── 7. MONEY ARCHITECTURE ────────────────────────────────────────────────────
const moneyItems = [
  { icon: "⊟", title: "Billing → money in", desc: "Invoices, subscriptions and revenue records.", bg: ORANGE },
  { icon: "$", title: "Payroll → money to people", desc: "Approved pay runs from HR and time data.", bg: "#3B82F6" },
  { icon: "⇄", title: "Spend → money to vendors", desc: "Requests, POs, supplier invoices and AP.", bg: ORANGE },
  { icon: "◈", title: "Inventory → money in goods", desc: "Stock value, receiving and movement.", bg: BLUE },
  { icon: "→", title: "ZoikoPay → moves money", desc: "Settlement and money movement support.", bg: "#3B82F6" },
  { icon: "◆", title: "ZoikoCoreX → financial truth", desc: "Ledger-grade governed traceability.", bg: BLUE },
];

function MoneyArchitecture() {
  return (
    <section style={{ ...wrap, paddingTop: "20px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <span style={eyebrow(ORANGE)}>Money Architecture</span>
          <h2 style={h2}>Money flows through the platform with clear boundaries.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "48px" }}>
          {moneyItems.map(m => (
            <div key={m.title} style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "20px", borderRadius: "14px", border: `1px solid ${LIGHT_GRAY}` }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "16px", flexShrink: 0 }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, marginBottom: "4px" }}>{m.title}</div>
                <div style={{ fontSize: "13px", color: SUBTLE_TEXT }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: "13px", color: SUBTLE_TEXT, marginBottom: "48px" }}>ZoikoSuite keeps the books — outside Zoiko One, as an ecosystem sibling.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ ...whiteCard }}>
            <div style={iconBox(BLUE)}><span style={{ color: "#fff", fontWeight: 800 }}>⊡</span></div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: NAVY, margin: "12px 0 8px" }}>Connect what you already use.</h3>
            <p style={{ fontSize: "14px", color: SUBTLE_TEXT, marginBottom: "12px" }}>Zoiko Connect supports APIs, connectors, data imports, exports, workflow triggers and secure third-party links.</p>
            <a href="#" style={{ color: BLUE, fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>Explore Zoiko Connect →</a>
          </div>
          <div style={{ ...whiteCard }}>
            <div style={iconBox(ORANGE)}><span style={{ color: "#fff", fontWeight: 800 }}>⤢</span></div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: NAVY, margin: "12px 0 8px" }}>Start small. Expand with control.</h3>
            <p style={{ fontSize: "14px", color: SUBTLE_TEXT, marginBottom: "12px" }}>Begin with one product, one pillar or one urgent workflow, then activate more products on the same shared spine.</p>
            <a href="#" style={{ color: BLUE, fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>Plan Your Rollout →</a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 8. PLATFORM FAQS ─────────────────────────────────────────────────────────
const faqs = [
  { q: "How many products does Zoiko One have?", a: "Zoiko One covers nine core operational products across five pillars — HR, Time, Payroll, Billing, Spend, Projects, Inventory, Comply and Insights — plus the Docs Pro premium layer, all connected by the platform spine." },
  { q: "What is the platform spine?", a: "The platform spine consists of shared layers — ZoikoID, Workflow, Hub, Connect, Documents, Approvals, Expenses and AI Assistance — that run beneath every product and provide identity, routing, tasks, integrations and governance across the platform." },
  { q: "Is Docs Pro legal advice?", a: "No. Zoiko Docs Pro is a premium document automation capability that works from approved templates and guided workflows. It is not legal advice and does not replace qualified professional review." },
  { q: "Can I start with one product?", a: "Yes. You can activate any single core product first — HR, Time, Payroll, Billing, Spend, Projects, Inventory, Comply or Insights — and expand into a pillar workflow or full platform as your needs grow." },
  { q: "How does Zoiko One handle accounting?", a: "Zoiko One manages operational transactions and money movement through ZoikoPay and ZoikoCoreX. ZoikoSuite — an ecosystem sibling — keeps the formal books outside the platform." },
];

function PlatformFAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ ...wrap, background: OFF_WHITE }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <span style={eyebrow(BLUE)}>Platform FAQs</span>
        <h2 style={h2}>Questions about the platform.</h2>
      </div>
      <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        {faqs.map(({ q, a }, i) => (
          <div key={i} style={{
            background: WHITE, borderRadius: "12px",
            border: `1px solid ${LIGHT_GRAY}`, overflow: "hidden",
          }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", padding: "20px 24px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: FF, textAlign: "left",
              }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: NAVY }}>{q}</span>
              <span style={{ fontSize: "18px", color: GRAY, flexShrink: 0, marginLeft: "16px" }}>
                {open === i ? "∧" : "∨"}
              </span>
            </button>
            {open === i && (
              <div style={{ padding: "0 24px 20px", fontSize: "14px", color: SUBTLE_TEXT, lineHeight: "1.7" }}>
                {a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
export default function PlatformPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ background: WHITE, fontFamily: FF, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <Hero />
      <Problem />
      <Pillars />
      <Spine />
      <Workflows />
      <Governance />
      <MoneyArchitecture />
      <PlatformFAQ />
      <Footer />
    </div>
  );
}
