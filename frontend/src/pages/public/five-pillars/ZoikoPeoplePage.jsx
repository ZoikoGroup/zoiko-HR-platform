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
    background: linear-gradient(120deg, rgba(255,195,130,0.45) 0%, rgba(250,248,245,0.98) 38%, rgba(250,248,245,0.98) 62%, rgba(170,205,240,0.45) 100%);
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
    background: rgba(255,255,255,0.92); border-radius: 999px;
    padding: 6px 16px; margin-bottom: 28px;
    font-size: 14px; font-weight: 500; color: #1a1a3e;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
    position: relative; z-index: 1;
  }
  .badge-pill {
    background: #5b5bd6; color: #fff; border-radius: 999px;
    padding: 2px 10px; font-size: 12px; font-weight: 700;
  }

  .hero-inner {
    position: relative; z-index: 1; max-width: 1200px; width: 100%;
  }

  .hero h1 {
    font-family: 'Poppins', sans-serif; font-weight: 600; font-style: normal;
    font-size: 46px; line-height: 66.96px; letter-spacing: -1.55px;
    color: #0B1C3F; margin: 0 0 20px; text-align: center;
    vertical-align: middle;
  }
  .hero h1 .accent { color: #4A9FE4; }

  .hero-sub {
    font-size: 16px; line-height: 1.7; color: #4B5563;
    max-width: 760px; margin: 0 auto 28px;
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

  .btn-dark {
    background: #1f1d5e; color: #fff; border: none; border-radius: 999px;
    padding: 15px 30px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .btn-dark:hover { background: #2d2a6e; }

  .btn-ghost {
    background: rgba(255,255,255,.15); color: #fff;
    border: 1.5px solid rgba(255,255,255,.3); border-radius: 999px;
    padding: 14px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.25); }

  /* ── WORKFLOW ── */
  .workflow { padding: 90px 52px 60px; background: #fff; text-align: center; }

  .eyebrow-blue {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 18px;
  }
  .eyebrow-orange {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #f97316; margin-bottom: 18px;
  }
  .eyebrow-orange-sm {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #f97316; margin-bottom: 14px;
  }

  .section-title {
    font-size: 40px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.9px; margin-bottom: 44px; line-height: 1.15;
  }
  .section-title-white {
    font-size: 38px; font-weight: 800; color: #fff;
    letter-spacing: -.8px; margin-bottom: 36px; line-height: 1.15;
  }

  .workflow-track {
    display: flex; align-items: center; flex-wrap: wrap;
    justify-content: center; gap: 0;
    background: #f7f7fc; border-radius: 20px;
    padding: 26px 32px 22px; max-width: 980px;
    margin: 0 auto; border: 1px solid #e8e8f4;
  }
  .w-row2 { display: flex; justify-content: center; align-items: center; margin-top: 14px; width: 100%; gap: 0; }
  .w-step { display: flex; align-items: center; }
  .step-pill {
    background: #fff; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 8px 16px; font-size: 13.5px; font-weight: 500; color: #1a1a3e; white-space: nowrap;
  }
  .step-arrow { color: #f97316; font-size: 16px; margin: 0 6px; line-height: 1; }

  /* ── PEOPLE PRODUCTS ── */
  .products-section { padding: 90px 52px; background: #f4f4fa; text-align: center; }

  .product-grid {
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 22px; max-width: 1060px; margin: 48px auto 0; text-align: left;
  }
  .product-card {
    background: #fff; border-radius: 22px; padding: 34px 30px;
    border: 1px solid #e6e6f2;
  }
  .prod-icon {
    width: 56px; height: 56px; border-radius: 16px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
  }
  .bg-purple { background: #5b5bd6; }
  .bg-dark-navy { background: #1f1d5e; }

  .prod-name { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .prod-desc { font-size: 14px; color: #777799; line-height: 1.55; margin-bottom: 20px; }
  .prod-link {
    font-size: 14px; font-weight: 600; color: #5b5bd6;
    text-decoration: none; display: inline-flex; align-items: center; gap: 5px;
  }
  .prod-link:hover { text-decoration: underline; }

  /* ── SHARED LAYERS ── */
  .shared-layers {
    padding: 64px 52px;
    background: linear-gradient(120deg, #2d1f9e 0%, #3b2db5 40%, #4f3bcc 70%, #5845d8 100%);
    text-align: center;
  }
  .layers-pills {
    display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 0;
  }
  .layer-pill {
    background: rgba(255,255,255,.12); color: #fff;
    border: 1px solid rgba(255,255,255,.2); border-radius: 999px;
    padding: 10px 22px; font-size: 14px; font-weight: 500;
  }

  /* ── THE PROBLEM ── */
  .problem { padding: 90px 52px; background: #fff; }
  .problem-inner {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 52px; max-width: 1080px; margin: 0 auto; align-items: center;
  }
  .problem-left { text-align: left; }
  .problem-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 20px;
  }
  .problem-title {
    font-size: 36px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.7px; line-height: 1.2; margin-bottom: 18px;
  }
  .problem-desc { font-size: 15px; color: #555577; line-height: 1.65; margin-bottom: 32px; }

  .problem-right {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  .prob-card {
    background: #fff; border: 1px solid #e4e4f0;
    border-radius: 18px; padding: 26px 22px;
  }
  .prob-icon {
    width: 50px; height: 50px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  }
  .prob-title { font-size: 15px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .prob-desc  { font-size: 13px; color: #777799; line-height: 1.5; }

  /* ── CTA BANNER ── */
  .cta-section { padding: 40px 52px 80px; background: #fff; }
  .cta-inner {
    background: linear-gradient(120deg, #7c22c4 0%, #5b5bd6 45%, #3b82f6 100%);
    border-radius: 28px; padding: 72px 52px; text-align: center;
    max-width: 1100px; margin: 0 auto;
  }
  .cta-inner h2 {
    font-size: 44px; font-weight: 800; color: #fff;
    margin-bottom: 14px; letter-spacing: -.9px;
  }
  .cta-inner p { font-size: 16px; color: rgba(255,255,255,.78); margin-bottom: 38px; }
  .cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  @media (max-width: 820px) {
    .hero h1 { font-size: 32px; }
    .section-title { font-size: 26px; }
    .product-grid, .problem-inner, .problem-right { grid-template-columns: 1fr; }
    .hero, .workflow, .products-section, .shared-layers,
    .problem, .cta-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconPeople = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="7" r="3" fill="white" fillOpacity=".9"/>
    <circle cx="16" cy="7" r="3" fill="white" fillOpacity=".5"/>
    <path d="M2 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M16 13c2.5 0 5 1.5 5 5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" fillOpacity=".5"/>
  </svg>
);

const IconClock = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M12 7v5l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconDollar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity=".15"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Inter,sans-serif">$</text>
  </svg>
);

const IconKey = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <circle cx="8" cy="11" r="4" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M12 11h8M17 11v3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconDoc = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="11" height="14" rx="2" fill="white" fillOpacity=".85"/>
    <rect x="8" y="7"  width="5" height="1.5" rx=".75" fill="#1f1d5e"/>
    <rect x="8" y="10" width="5" height="1.5" rx=".75" fill="#1f1d5e"/>
    <rect x="8" y="13" width="3" height="1.5" rx=".75" fill="#1f1d5e"/>
  </svg>
);

const IconBar = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="3"  y="14" width="4" height="6" rx="1" fill="white" fillOpacity=".55"/>
    <rect x="10" y="9"  width="4" height="11" rx="1" fill="white" fillOpacity=".8"/>
    <rect x="17" y="4"  width="4" height="16" rx="1" fill="white"/>
  </svg>
);

const workflowRow1 = ["Employee record", "Onboarding", "Schedule / time entry", "Manager approval"];
const workflowRow2 = ["Payroll review", "Payslip workflow", "Workforce insight"];

const peopleProducts = [
  {
    icon: <IconPeople/>, bg: "bg-purple",
    name: "Zoiko HR",
    desc: "Employee records, onboarding, teams, locations, documents and lifecycle changes.",
    link: "Explore Zoiko HR",
  },
  {
    icon: <IconClock/>, bg: "bg-purple",
    name: "ZoikoTime",
    desc: "Time, attendance, schedules, approved hours and work evidence.",
    link: "Explore ZoikoTime",
  },
  {
    icon: <IconDollar/>, bg: "bg-purple",
    name: "Zoiko Payroll",
    desc: "Controlled payroll workflows with approved HR and time data.",
    link: "Explore Zoiko Payroll",
  },
];

const sharedLayers = ["ZoikoID", "Workflow", "Documents", "Approvals", "AI Assistance", "Zoiko Insights"];

const problemCards = [
  { icon: <IconKey/>,   bg: "bg-purple",    title: "Role-based access",    desc: "The right people see the right data." },
  { icon: <IconCheck/>, bg: "bg-dark-navy",  title: "Manager approvals",   desc: "Time and payroll reviewed before action." },
  { icon: <IconDoc/>,   bg: "bg-purple",    title: "Documents & evidence", desc: "Onboarding and payroll records captured." },
  { icon: <IconBar/>,   bg: "bg-dark-navy",  title: "Workforce insight",   desc: "Headcount and people-data visibility." },
];

export default function ZoikoPeoplePage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff", minHeight: "100vh", overflowX: "hidden" }}>
      <style>{styles}</style>
      <LandingHeader />

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">
            <span className="badge-pill">Pillar 01</span>
            People
          </div>
          <h1>
            People operations software for HR,<br />
            time, and <span className="accent">payroll.</span>
          </h1>
          <p className="hero-sub">
            Connect employee records, onboarding, time tracking, attendance, approved hours, payroll
            workflows, documents, approvals and workforce insights across Zoiko HR, ZoikoTime and
            Zoiko Payroll.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Explore People Products</button>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow">
        <p className="eyebrow-blue">THE PEOPLE WORKFLOW</p>
        <h2 className="section-title">From employee record to workforce insight.</h2>
        <div className="workflow-track">
          {workflowRow1.map((step, i) => (
            <div className="w-step" key={step}>
              <span className="step-pill">{step}</span>
              <span className="step-arrow">→</span>
            </div>
          ))}
          <div className="w-row2">
            {workflowRow2.map((step, i) => (
              <div className="w-step" key={step}>
                <span className="step-pill">{step}</span>
                {i < workflowRow2.length - 1 && <span className="step-arrow">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PEOPLE PRODUCTS ── */}
      <section className="products-section">
        <p className="eyebrow-orange">PEOPLE PRODUCTS</p>
        <h2 className="section-title">Three connected products, one<br />people foundation.</h2>
        <div className="product-grid">
          {peopleProducts.map((p) => (
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
        <p className="eyebrow-orange-sm">SHARED LAYERS</p>
        <h2 className="section-title-white">People runs on the same connected spine.</h2>
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
              People operations break down when HR, time and payroll are disconnected.
            </h2>
            <p className="problem-desc">
              Records in one system, time in another, payroll changes re-keyed by hand — that
              creates duplicated work, weak visibility and payroll risk. The People pillar keeps
              one approved flow from hire to pay.
            </p>
            <button className="btn-dark">See the People Workflow &nbsp;→</button>
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
          <h2>One flow from hire to pay.</h2>
          <p>Connect HR, time and payroll on one governed people foundation.</p>
          <div className="cta-btns">
            <button className="btn-primary">Get a Demo</button>
            <button className="btn-ghost">Request People Pricing</button>
            <button className="btn-ghost">All Products</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
