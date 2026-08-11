import { useEffect } from "react";
import LandingHeader from "../../../landing/LandingHeader";
import Footer from "../../../landing/Footer";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Poppins:wght@600&display=swap');

  /* ── HERO ── */
  .hero {
    position: relative;
    min-height: 85vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 80px 24px;
    overflow: hidden;
    background:
      linear-gradient(90deg, rgba(36, 12, 132, 0.043) 2.17%, rgba(36, 12, 132, 0) 2.17%),
      linear-gradient(180deg, rgba(36, 12, 132, 0.043) 2.17%, rgba(36, 12, 132, 0) 2.17%),
      radial-gradient(ellipse 42% 65% at 92% 18%, rgba(170,150,255,0.30) 0%, transparent 70%),
      radial-gradient(ellipse 42% 55% at 92% 80%, rgba(120,190,255,0.32) 0%, transparent 70%),
      #f6f6fc;
  }
  .hero::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%),
                radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%),
                radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%);
    pointer-events: none;
  }

  .hero-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #fff; border: 1px solid #ddd; border-radius: 999px;
    padding: 6px 18px 6px 6px; font-size: 14px; font-weight: 500; color: #1a1a3e;
    margin-bottom: 30px; box-shadow: 0 1px 6px rgba(0,0,0,.06);
    position: relative; z-index: 1;
  }
  .badge-pill-navy {
    background: #2d1d8e; color: #fff; font-size: 12px; font-weight: 700;
    padding: 3px 13px; border-radius: 999px;
  }

  .hero-inner {
    position: relative; z-index: 1; max-width: 1600px; width: 100%;
  }

  .hero h1 {
    font-family: 'Poppins', sans-serif; font-weight: 600; font-style: normal;
    font-size: 46px; line-height: 66.96px; letter-spacing: -1.55px;
    color: #0B1C3F; margin: 0 auto 20px; text-align: center;
    max-width: 1200px;
  }
  .hero h1 .accent { color: #2563eb; }

  .hero-sub {
    font-size: 15.5px; color: #55577a; max-width: 760px; margin: 0 auto 38px; line-height: 1.7;
  }
  .hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  /* ── BUTTONS ── */
  .btn-primary {
    background: #f97316; color: #fff; border: none; border-radius: 999px;
    padding: 15px 30px; font-size: 15px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'Inter', sans-serif; transition: background .2s;
  }
  .btn-primary:hover { background: #ea6a0a; }

  .btn-outline {
    background: #fff; color: #1a1a3e; border: 1.5px solid #d0d0e0;
    border-radius: 999px; padding: 15px 30px; font-size: 15px; font-weight: 600;
    cursor: pointer; font-family: 'Inter', sans-serif; transition: border-color .2s;
  }
  .btn-outline:hover { border-color: #1a1a3e; }

  .btn-ghost {
    background: rgba(255,255,255,.15); color: #fff;
    border: 1.5px solid rgba(255,255,255,.3); border-radius: 999px;
    padding: 14px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.25); }

  /* ── WORKFLOW ── */
  .workflow { padding: 80px 52px 70px; background: #fff; text-align: center; }

  .eyebrow-orange {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #f97316; margin-bottom: 18px;
  }
  .eyebrow-purple {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 16px;
  }

  .section-title {
    font-size: 34px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.6px; margin-bottom: 36px; line-height: 1.2;
  }
  .section-title-white {
    font-size: 32px; font-weight: 800; color: #fff;
    letter-spacing: -.5px; margin-bottom: 30px; line-height: 1.2;
  }

  .workflow-track {
    display: flex; align-items: center; flex-wrap: wrap; justify-content: center;
    background: #f7f7fc; border-radius: 20px; padding: 20px 26px;
    max-width: 980px; margin: 0 auto; border: 1px solid #e8e8f4;
  }
  .w-step { display: flex; align-items: center; }
  .step-pill {
    background: #fff; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 8px 16px; font-size: 13.5px; font-weight: 600; color: #1a1a3e; white-space: nowrap;
  }
  .step-arrow { color: #f97316; font-size: 16px; margin: 0 8px; line-height: 1; }

  /* ── CONTROL PRODUCTS ── */
  .products-section { padding: 80px 52px; background: #f7f7fd; text-align: center; }

  .product-grid-2 {
    display: grid; grid-template-columns: repeat(2,1fr);
    gap: 22px; max-width: 760px; margin: 44px auto 0; text-align: left;
  }
  .product-card {
    background: #fff; border-radius: 22px; padding: 30px 26px; border: 1px solid #e6e6f2;
  }
  .prod-icon {
    width: 52px; height: 52px; border-radius: 15px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  }
  .bg-dark-navy { background: #1f1d5e; }
  .bg-orange { background: #f97316; }
  .bg-purple { background: #5b5bd6; }

  .prod-name { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .prod-desc { font-size: 14px; color: #777799; line-height: 1.55; margin-bottom: 16px; }
  .prod-link {
    font-size: 14px; font-weight: 600; color: #5b5bd6;
    text-decoration: none; display: inline-flex; align-items: center; gap: 5px;
  }
  .prod-link:hover { text-decoration: underline; }

  /* ── SHARED LAYERS ── */
  .shared-layers {
    padding: 64px 52px 120px;
    background: linear-gradient(123.9deg, #1D0A5E 0%, #240C84 60%, #150844 100%);
    text-align: center;
  }
  .layers-pills { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .layer-pill {
    background: rgba(255,255,255,.12); color: #fff;
    border: 1px solid rgba(255,255,255,.2); border-radius: 999px;
    padding: 10px 18px; font-size: 13px; font-weight: 500;
  }

  /* ── THE PROBLEM ── */
  .problem { padding: 80px 52px; background: #fff; }
  .problem-inner {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 50px; max-width: 1080px; margin: 0 auto; align-items: center;
  }
  .problem-left { text-align: left; }
  .problem-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 16px;
  }
  .problem-title {
    font-size: 28px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.5px; line-height: 1.25; margin-bottom: 18px;
  }
  .problem-desc { font-size: 14.5px; color: #555577; line-height: 1.65; }

  .problem-right {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  .prob-card {
    background: #fff; border: 1px solid #e4e4f0;
    border-radius: 18px; padding: 24px 20px;
  }
  .prob-icon {
    width: 44px; height: 44px; border-radius: 13px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  }
  .bg-amber { background: linear-gradient(135deg,#f97316,#fb923c); }
  .bg-grad-blue { background: linear-gradient(135deg,#f97316,#38bdf8); }

  .prob-title { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .prob-desc  { font-size: 13px; color: #777799; line-height: 1.5; }

  /* ── CTA BANNER ── */
  .cta-section { padding: 40px 52px 80px; background: #fff; }
  .cta-inner {
    background: linear-gradient(120deg, #4f1fb0 0%, #5b5bd6 45%, #3b82f6 100%);
    border-radius: 28px; padding: 60px 52px; text-align: center;
    max-width: 1100px; margin: 0 auto;
  }
  .cta-inner h2 {
    font-size: 36px; font-weight: 800; color: #fff;
    margin-bottom: 14px; letter-spacing: -.6px;
  }
  .cta-inner p { font-size: 16px; color: rgba(255,255,255,.78); margin-bottom: 34px; }
  .cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  @media (max-width: 820px) {
    .hero h1 { font-size: 26px; }
    .section-title { font-size: 22px; }
    .product-grid-2, .problem-inner, .problem-right { grid-template-columns: 1fr; }
    .hero, .workflow, .products-section, .shared-layers,
    .problem, .cta-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconCheck = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconBar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3"  y="14" width="4" height="6" rx="1" fill="white" fillOpacity=".55"/>
    <rect x="10" y="9"  width="4" height="11" rx="1" fill="white" fillOpacity=".8"/>
    <rect x="17" y="4"  width="4" height="16" rx="1" fill="white"/>
  </svg>
);
const IconDoc = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="11" height="14" rx="2" fill="white" fillOpacity=".9"/>
    <rect x="9" y="7"  width="3" height="3" rx=".5" fill="#1f1d5e"/>
  </svg>
);
const IconWarning = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 4l9 16H3L12 4z" fill="white" fillOpacity=".95"/>
    <rect x="11" y="10" width="2" height="5" rx="1" fill="#f97316"/>
    <circle cx="12" cy="17" r="1.2" fill="#f97316"/>
  </svg>
);
const IconPerson = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" fill="white" fillOpacity=".9"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
);
const IconSparkle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="white"/>
  </svg>
);

const workflowSteps = ["Workflow activity", "Evidence", "Control review", "Exception", "Remediation", "Dashboard", "Decision"];

const controlProducts = [
  {
    icon: <IconCheck/>, bg: "bg-dark-navy",
    name: "Zoiko Comply",
    desc: "Obligations, controls, evidence, exceptions, remediation and audit-ready records.",
    link: "Explore Zoiko Comply",
  },
  {
    icon: <IconBar/>, bg: "bg-dark-navy",
    name: "Zoiko Insights",
    desc: "Dashboards, trends, risk signals and business health across the platform.",
    link: "Explore Zoiko Insights",
  },
];

const sharedLayers = ["ZoikoID", "Workflow", "Documents", "Approvals", "AI Assistance", "Zoiko Insights"];

const problemCards = [
  { icon: <IconDoc/>,     bg: "bg-dark-navy",   title: "Continuous evidence", desc: "Captured as work happens, not after." },
  { icon: <IconWarning/>, bg: "bg-amber",       title: "Exception visibility", desc: "Surface risk and overdue items early." },
  { icon: <IconPerson/>,  bg: "bg-purple",      title: "Permission-aware",    desc: "Dashboards respect roles and boundaries." },
  { icon: <IconSparkle/>, bg: "bg-grad-blue",   title: "Governed AI",         desc: "Summaries and signals — never determinations." },
];

export default function ZoikoControl() {
  useEffect(() => { window.scrollTo(0,0); }, []);

  return (
    <div>
      <style>{styles}</style>
      <LandingHeader />

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-pill-navy">Pillar 05</span>
          Control
        </div>
        <div className="hero-inner">
          <h1>
            Governance and business intelligence software for<br />
            connected <span className="accent">operations.</span>
          </h1>
          <p className="hero-sub">
            Track obligations, controls, evidence, exceptions, remediation, approvals, dashboards,
            trends, risk signals and business health through Zoiko Comply and Zoiko Insights.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Explore Control Products</button>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow">
        <p className="eyebrow-orange">THE CONTROL WORKFLOW</p>
        <h2 className="section-title">From workflow activity to confident decisions.</h2>
        <div className="workflow-track">
          {workflowSteps.map((step, i) => (
            <div className="w-step" key={step}>
              <span className="step-pill">{step}</span>
              {i < workflowSteps.length - 1 && <span className="step-arrow">→</span>}
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTROL PRODUCTS ── */}
      <section className="products-section">
        <p className="eyebrow-purple">CONTROL PRODUCTS</p>
        <h2 className="section-title">Govern risk and see the business clearly.</h2>
        <div className="product-grid-2">
          {controlProducts.map((p) => (
            <div className="product-card" key={p.name}>
              <div className={`prod-icon ${p.bg}`}>{p.icon}</div>
              <div className="prod-name">{p.name}</div>
              <div className="prod-desc">{p.desc}</div>
              <a className="prod-link" href="#">{p.link} →</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── SHARED LAYERS ── */}
      <section className="shared-layers">
        <p className="eyebrow-orange">SHARED LAYERS</p>
        <h2 className="section-title-white">Control runs on the connected spine.</h2>
        <div className="layers-pills">
          {sharedLayers.map((l) => (
            <span className="layer-pill" key={l}>{l}</span>
          ))}
        </div>
      </section>

      {/* ── THE PROBLEM ── */}
      <section className="problem">
        <div className="problem-inner">
          <div className="problem-left">
            <p className="problem-eyebrow">THE PROBLEM</p>
            <h2 className="problem-title">
              Control is fragile when evidence and visibility come after the fact.
            </h2>
            <p className="problem-desc">
              When policies live in documents, evidence in folders and reports are reconciled by
              hand, leaders lose audit readiness and clear sight of risk. The Control pillar turns
              everyday work into evidence and live visibility.
            </p>
          </div>
          <div className="problem-right">
            {problemCards.map((c) => (
              <div className="prob-card" key={c.title}>
                <div className={`prob-icon ${c.bg}`}>{c.icon}</div>
                <div className="prob-title">{c.title}</div>
                <div className="prob-desc">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2>Govern as you grow.</h2>
          <p>Turn everyday work into evidence and clear, permission-aware visibility.</p>
          <div className="cta-btns">
            <button className="btn-primary">Get a Demo</button>
            <button className="btn-ghost">Request Control Pricing</button>
            <button className="btn-ghost">All Products</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
