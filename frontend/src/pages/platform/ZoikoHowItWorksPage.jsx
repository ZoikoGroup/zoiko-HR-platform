import React, { useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ─────────────────────────────────────────
   INLINE SVG ICONS
───────────────────────────────────────── */
const CircleNum = ({ n, bg }) => (
  <div style={{
    width: 48, height: 48, borderRadius: 14,
    background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  }}>
    <span style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}>{n}</span>
  </div>
);

const CircleNumOutline = ({ n, bg }) => (
  <div style={{
    width: 52, height: 52, borderRadius: 14,
    background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  }}>
    <div style={{
      width: 34, height: 34, borderRadius: 10,
      border: "2px solid rgba(255,255,255,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>{n}</span>
    </div>
  </div>
);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const mechanics = [
  {
    n: 1,
    title: "Identity & access",
    desc: "ZoikoID establishes who can see and do what, across teams, departments and entities.",
  },
  {
    n: 2,
    title: "A business event happens",
    desc: "A new hire, a timesheet, a purchase request, a project milestone or an invoice.",
  },
  {
    n: 3,
    title: "Workflow & approvals route it",
    desc: "Zoiko Workflow applies policy checks and routes the right approvals to the right people.",
  },
  {
    n: 4,
    title: "Records, documents & evidence update",
    desc: "Connected products update together; documents and evidence are captured automatically.",
  },
  {
    n: 5,
    title: "Insights & AI assistance",
    desc: "Zoiko Insights surfaces the outcome; governed AI assists — inside permission and policy boundaries.",
  },
];

const workflows = [
  {
    label: "New employee → payroll",
    steps: ["HR record", "ZoikoID access", "Approved time", "Payroll", "Evidence", "Insights"],
  },
  {
    label: "Project → billing",
    steps: ["Project setup", "Billable time", "Billing event", "Approval", "Revenue & margin"],
  },
  {
    label: "Spend → inventory",
    steps: ["Purchase request", "Policy check", "Approval", "PO", "Goods received", "Inventory"],
  },
];

const scaleCards = [
  {
    n: "①",
    bg: "linear-gradient(135deg,#f97316 0%,#fb923c 100%)",
    title: "Start with one",
    desc: "One product or one urgent workflow.",
  },
  {
    n: "②",
    bg: "linear-gradient(135deg,#3b5bd5 0%,#4a6fd8 100%)",
    title: "Add a pillar",
    desc: "Activate a complete operating area.",
  },
  {
    n: "③",
    bg: "linear-gradient(135deg,#6c5dd3 0%,#7b6de0 100%)",
    title: "Scale the platform",
    desc: "Connect all five pillars with governance.",
  },
];

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
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
    pointerEvents: "none",
  },
  heroInner: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1100,
    margin: "0 auto",
  },
  platformBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: "1.5px solid #ddd",
    borderRadius: 999,
    padding: "6px 16px 6px 6px",
    marginBottom: 32,
    background: "#fff",
  },
  platformPill: {
    background: "#3b5bdb",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 999,
    padding: "4px 12px",
  },
  platformText: {
    fontSize: 14,
    color: "#333",
    fontWeight: 500,
  },
  heroH1: {
    fontSize: "clamp(32px,5vw,56px)",
    fontWeight: 800,
    lineHeight: 1.1,
    color: "#0B1C3F",
    margin: "0 0 20px",
  },
  heroOrange: { color: "#f97316" },
  heroSub: {
    fontSize: 16,
    color: "#4B5563",
    lineHeight: 1.7,
    maxWidth: 660,
    margin: "0 auto 28px",
  },
  heroActions: {
    display: "flex",
    justifyContent: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  btnOrange: {
    background: "linear-gradient(135deg, #F97316, #EA580C)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "14px 32px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  btnOutline: {
    background: "rgba(255,255,255,0.75)",
    color: "#1a1a2e",
    border: "1.5px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "14px 32px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
  },

  /* ── Mechanics ── */
  mechanicsSection: {
    padding: "100px 24px",
    background: "#ffffff",
    maxWidth: 780,
    margin: "0 auto",
  },
  sectionLabelOrange: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "#f97316",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    textAlign: "center",
    marginBottom: 16,
  },
  sectionLabelPurple: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "#4a3fc0",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    textAlign: "center",
    marginBottom: 16,
  },
  mechH2: {
    fontSize: "clamp(28px,4vw,44px)",
    fontWeight: 800,
    color: "#1a1a4e",
    lineHeight: 1.2,
    textAlign: "center",
    marginBottom: 14,
  },
  mechSub: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 1.55,
  },
  mechanicsRows: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  mechRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 20,
    border: "1.5px solid #eaeaea",
    borderRadius: 16,
    padding: "22px 28px",
    background: "#fff",
  },
  mechContent: { flex: 1 },
  mechTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 6 },
  mechDesc: { fontSize: 13.5, color: "#888", lineHeight: 1.55 },

  /* ── Connected Workflows ── */
  workflowsSection: {
    padding: "100px 24px",
    background: "#f5f5fb",
  },
  workflowsInner: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  workflowH2: {
    fontSize: "clamp(28px,4vw,44px)",
    fontWeight: 800,
    color: "#1a1a4e",
    textAlign: "center",
    marginBottom: 56,
  },
  wfGroup: {
    marginBottom: 32,
  },
  wfLabel: {
    fontSize: 14,
    color: "#aaa",
    fontWeight: 400,
    marginBottom: 12,
    paddingLeft: 4,
  },
  wfCard: {
    background: "#fff",
    borderRadius: 16,
    padding: "22px 32px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 0,
    border: "1px solid #eaeaea",
  },
  wfStep: {
    display: "flex",
    alignItems: "center",
    gap: 0,
  },
  stepPill: {
    background: "#f0f0fa",
    color: "#1a1a4e",
    fontSize: 13.5,
    fontWeight: 500,
    borderRadius: 50,
    padding: "9px 18px",
    whiteSpace: "nowrap",
  },
  stepArrow: {
    color: "#f97316",
    fontSize: 16,
    fontWeight: 700,
    padding: "0 10px",
  },

  /* ── Scale ── */
  scaleSection: {
    padding: "100px 24px",
    background: "#ffffff",
  },
  scaleInner: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  scaleH2: {
    fontSize: "clamp(28px,4vw,44px)",
    fontWeight: 800,
    color: "#1a1a4e",
    textAlign: "center",
    lineHeight: 1.2,
    marginBottom: 56,
  },
  scaleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 24,
  },
  scaleCard: {
    border: "1.5px solid #eaeaea",
    borderRadius: 20,
    padding: "32px 28px",
    background: "#fff",
  },
  scaleTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a4e", marginBottom: 8 },
  scaleDesc: { fontSize: 13.5, color: "#888", lineHeight: 1.55 },
};

/* ─────────────────────────────────────────
   COMPONENT
───────────────────────────────────────── */
export default function ZoikoHowItWorksPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={S.page}>
      <LandingHeader />

      {/* ── SECTION 1: Hero ── */}
      <section style={S.hero}>
        <div style={S.heroOverlay} />
        <div style={S.heroInner}>
          <div style={S.platformBadge}>
            <span style={S.platformPill}>Platform</span>
            <span style={S.platformText}>Operating mechanics</span>
          </div>
          <h1 style={S.heroH1}>
            How Zoiko One connects<br />
            work across the <span style={S.heroOrange}>business.</span>
          </h1>
          <p style={S.heroSub}>
            See how people, money, work, supply and control move through shared
            identity, workflows, approvals, documents, integrations, expenses,
            insights and governed AI assistance.
          </p>
          <div style={S.heroActions}>
            <button style={S.btnOrange}>Get a Demo &nbsp;→</button>
            <button style={S.btnOutline}>Explore Platform</button>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: The Mechanics ── */}
      <section style={{ padding: "100px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          <div style={S.sectionLabelOrange}>The Mechanics</div>
          <h2 style={S.mechH2}>
            From business event to<br />approved action.
          </h2>
          <p style={S.mechSub}>
            Every operating event moves through the same governed sequence.
          </p>
          <div style={S.mechanicsRows}>
            {mechanics.map((m) => {
              const bgs = [
                "linear-gradient(135deg,#4a3fc0 0%,#5b4fd8 100%)",
                "linear-gradient(135deg,#3b5bd5 0%,#4a6fd8 100%)",
                "linear-gradient(135deg,#5040c8 0%,#6050d8 100%)",
                "linear-gradient(135deg,#4535b8 0%,#5545cc 100%)",
                "linear-gradient(135deg,#3b2fb0 0%,#4a3fc0 100%)",
              ];
              return (
                <div key={m.n} style={S.mechRow}>
                  <CircleNum n={m.n} bg={bgs[m.n - 1]} />
                  <div style={S.mechContent}>
                    <div style={S.mechTitle}>{m.title}</div>
                    <div style={S.mechDesc}>{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: Connected Workflows ── */}
      <section style={S.workflowsSection}>
        <div style={S.workflowsInner}>
          <div style={S.sectionLabelOrange}>Connected Workflows</div>
          <h2 style={S.workflowH2}>Real handoffs across products.</h2>
          {workflows.map((wf) => (
            <div key={wf.label} style={S.wfGroup}>
              <div style={S.wfLabel}>{wf.label}</div>
              <div style={S.wfCard}>
                {wf.steps.map((step, i) => (
                  <div key={step} style={S.wfStep}>
                    <span style={S.stepPill}>{step}</span>
                    {i < wf.steps.length - 1 && (
                      <span style={S.stepArrow}>→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 4: Where It Goes Next ── */}
      <section style={S.scaleSection}>
        <div style={S.scaleInner}>
          <div style={S.sectionLabelPurple}>Where It Goes Next</div>
          <h2 style={S.scaleH2}>
            Start small, expand on the same<br />spine.
          </h2>
          <div style={S.scaleGrid}>
            {scaleCards.map((c) => (
              <div key={c.title} style={S.scaleCard}>
                <CircleNumOutline n={c.n} bg={c.bg} />
                <div style={S.scaleTitle}>{c.title}</div>
                <div style={S.scaleDesc}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
