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
      radial-gradient(ellipse 40% 65% at 94% 20%, rgba(170,150,255,0.30) 0%, transparent 70%),
      radial-gradient(ellipse 42% 60% at 96% 85%, rgba(120,190,255,0.35) 0%, transparent 70%),
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
    background: rgba(255,255,255,0.92); border-radius: 999px;
    padding: 6px 16px; margin-bottom: 28px;
    font-size: 14px; font-weight: 500; color: #1a1a3e;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
    position: relative; z-index: 1;
  }
  .badge-pill-blue {
    background: #38bdf8; color: #fff; border-radius: 999px;
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
  .hero h1 .accent { color: #38bdf8; }

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

  .btn-dark-full {
    background: #2d1d8e; color: #fff; border: none; border-radius: 999px;
    padding: 16px 32px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
    display: block; width: 100%; text-align: center;
  }
  .btn-dark-full:hover { background: #3a26ad; }

  /* ── WORKFLOW ── */
  .workflow { padding: 80px 52px 70px; background: #fff; text-align: center; }

  .eyebrow-orange {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #f97316; margin-bottom: 18px;
  }
  .eyebrow-purple {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 18px;
  }
  .eyebrow-blue {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #38bdf8; margin-bottom: 18px;
  }

  .section-title {
    font-size: 36px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.7px; margin-bottom: 40px; line-height: 1.2;
  }
  .section-title-white {
    font-size: 34px; font-weight: 800; color: #fff;
    letter-spacing: -.6px; margin-bottom: 32px; line-height: 1.2;
  }

  .workflow-track {
    display: flex; align-items: center; flex-wrap: wrap; justify-content: center;
    background: #f7f7fc; border-radius: 20px; padding: 22px 28px;
    max-width: 1080px; margin: 0 auto; border: 1px solid #e8e8f4;
  }
  .w-step { display: flex; align-items: center; }
  .step-pill {
    background: #fff; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 9px 18px; font-size: 13.5px; font-weight: 700; color: #1a1a3e; white-space: nowrap;
  }
  .step-arrow { color: #f97316; font-size: 16px; margin: 0 8px; line-height: 1; }

  /* ── THE PROBLEM ── */
  .problem { padding: 80px 52px; background: #f7f7fd; }
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
    font-size: 30px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.6px; line-height: 1.25; margin-bottom: 18px;
  }
  .problem-desc { font-size: 14.5px; color: #555577; line-height: 1.65; margin-bottom: 28px; }

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
  .prob-title { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .prob-desc  { font-size: 13px; color: #777799; line-height: 1.5; }

  /* ── SHARED LAYERS ── */
  .shared-layers {
    padding: 64px 52px;
    background: linear-gradient(120deg, #2d1f9e 0%, #3b2db5 40%, #4f3bcc 70%, #5845d8 100%);
    text-align: center;
  }
  .layers-pills { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .layer-pill {
    background: rgba(255,255,255,.12); color: #fff;
    border: 1px solid rgba(255,255,255,.2); border-radius: 999px;
    padding: 10px 18px; font-size: 13px; font-weight: 500;
  }

  /* ── CONNECTED TO BUSINESS ── */
  .connected-section { padding: 80px 52px; background: #fff; text-align: center; }

  .connect-grid {
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 20px; max-width: 1080px; margin: 44px auto 0; text-align: left;
  }
  .connect-card {
    background: #fff; border: 1px solid #e6e6f2; border-radius: 18px; padding: 30px 26px;
  }
  .connect-icon {
    width: 50px; height: 50px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  }
  .bg-purple { background: #5b5bd6; }
  .bg-orange { background: #f97316; }
  .bg-dark-navy { background: #1f1d5e; }

  .connect-title { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .connect-desc  { font-size: 14px; color: #777799; line-height: 1.55; }

  @media (max-width: 820px) {
    .hero h1 { font-size: 28px; }
    .section-title { font-size: 24px; }
    .problem-inner, .problem-right, .connect-grid { grid-template-columns: 1fr; }
    .hero, .workflow, .problem, .shared-layers,
    .connected-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconGrid = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" fillOpacity=".9"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" fillOpacity=".3"/>
  </svg>
);
const IconTarget = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity=".15"/>
    <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="12" cy="12" r="1.3" fill="white"/>
  </svg>
);
const IconClock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none"/>
    <path d="M12 7v5l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconBar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3"  y="14" width="4" height="6" rx="1" fill="white" fillOpacity=".55"/>
    <rect x="10" y="9"  width="4" height="11" rx="1" fill="white" fillOpacity=".8"/>
    <rect x="17" y="4"  width="4" height="16" rx="1" fill="white"/>
  </svg>
);
const IconPeople = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="7" r="3" fill="white" fillOpacity=".9"/>
    <circle cx="16" cy="7" r="3" fill="white" fillOpacity=".5"/>
    <path d="M2 19c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M16 13c2.5 0 5 1.5 5 5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" fillOpacity=".5"/>
  </svg>
);
const IconDollar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity=".15"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Inter,sans-serif">$</text>
  </svg>
);
const IconCheck = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const workflowSteps = [
  "Project setup", "Resources", "Tasks & milestones", "Billable time", "Costs", "Billing readiness", "Margin insight",
];

const problemCards = [
  { icon: <IconGrid/>,   bg: "bg-purple",    title: "Plan & assign",      desc: "Projects, tasks, owners, resources and capacity." },
  { icon: <IconTarget/>, bg: "bg-orange",    title: "Budgets & milestones", desc: "Track budgets, costs and milestone progress." },
  { icon: <IconClock/>,  bg: "bg-purple",    title: "Billable time",      desc: "Approved hours from ZoikoTime flow into billing." },
  { icon: <IconBar/>,    bg: "bg-dark-navy", title: "Margin insight",     desc: "Profitability across projects and clients." },
];

const sharedLayers = ["ZoikoID", "Workflow", "Hub", "Connect", "Documents", "Approvals", "AI Assistance", "Zoiko Insights"];

const connectedCards = [
  { icon: <IconPeople/>, bg: "bg-purple",    title: "People",  desc: "Approved time and resources from HR and ZoikoTime." },
  { icon: <IconDollar/>, bg: "bg-orange",    title: "Money",   desc: "Project-to-cash: billable work into billing and revenue." },
  { icon: <IconCheck/>,  bg: "bg-dark-navy", title: "Control", desc: "Approvals, evidence and project governance." },
];

export default function ZoikoWorkPage() {
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
            <span className="badge-pill-blue">Pillar 03</span>
            Work
          </div>
          <h1>
            Work operations software for<br />
            projects, delivery, and margin <span className="accent">control.</span>
          </h1>
          <p className="hero-sub">
            Plan projects, assign resources, track budgets, milestones, billable time, costs and
            margin through Zoiko Projects — connected to people, money, supply and control across
            one platform.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Request Work Pricing</button>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow">
        <p className="eyebrow-orange">THE WORK WORKFLOW</p>
        <h2 className="section-title">From project setup to margin insight.</h2>
        <div className="workflow-track">
          {workflowSteps.map((step, i) => (
            <div className="w-step" key={step}>
              <span className="step-pill">{step}</span>
              {i < workflowSteps.length - 1 && <span className="step-arrow">→</span>}
            </div>
          ))}
        </div>
      </section>

      {/* ── THE PROBLEM ── */}
      <section className="problem">
        <div className="problem-inner">
          <div className="problem-left">
            <p className="problem-eyebrow">THE PROBLEM</p>
            <h2 className="problem-title">
              Work loses margin when delivery, time, cost and billing are disconnected.
            </h2>
            <p className="problem-desc">
              Tasks in one tool, time in another, costs in spreadsheets and billing after the
              fact means missed billable work, budget overruns and weak profitability visibility.
              The Work pillar keeps one connected flow from delivery to margin.
            </p>
            <button className="btn-dark-full">Explore Zoiko Projects</button>
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

      {/* ── SHARED LAYERS ── */}
      <section className="shared-layers">
        <p className="eyebrow-orange">SHARED LAYERS</p>
        <h2 className="section-title-white">Work runs on the connected spine.</h2>
        <div className="layers-pills">
          {sharedLayers.map((l) => (
            <span className="layer-pill" key={l}>{l}</span>
          ))}
        </div>
      </section>

      {/* ── CONNECTED TO THE BUSINESS ── */}
      <section className="connected-section">
        <p className="eyebrow-blue">CONNECTED TO THE BUSINESS</p>
        <h2 className="section-title">Work links across the pillars.</h2>
        <div className="connect-grid">
          {connectedCards.map((c) => (
            <div className="connect-card" key={c.title}>
              <div className={`connect-icon ${c.bg}`}>{c.icon}</div>
              <div className="connect-title">{c.title}</div>
              <div className="connect-desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
