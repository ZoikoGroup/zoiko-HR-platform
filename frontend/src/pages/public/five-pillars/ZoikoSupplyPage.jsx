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
      radial-gradient(ellipse 40% 65% at 96% 25%, rgba(170,150,255,0.30) 0%, transparent 70%),
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
  .badge-pill-purple {
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
  .hero h1 .accent { color: #2563eb; }

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
    background: #2d1d8e; color: #fff; border: none; border-radius: 999px;
    padding: 15px 30px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .btn-dark:hover { background: #3a26ad; }

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
  .eyebrow-blue {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #38bdf8; margin-bottom: 18px;
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
    background: #f7f7fc; border-radius: 20px; padding: 22px 28px 18px;
    max-width: 940px; margin: 0 auto; border: 1px solid #e8e8f4;
  }
  .w-row2 { display: flex; justify-content: center; align-items: center; margin-top: 12px; width: 100%; }
  .w-step { display: flex; align-items: center; }
  .step-pill {
    background: #fff; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 8px 16px; font-size: 13.5px; font-weight: 600; color: #1a1a3e; white-space: nowrap;
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
    font-size: 28px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.5px; line-height: 1.25; margin-bottom: 18px;
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
  .bg-blue   { background: #38bdf8; }
  .bg-dark-navy { background: #1f1d5e; }

  .connect-title { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .connect-desc  { font-size: 14px; color: #777799; line-height: 1.55; }

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

  @media (max-width: 820px) {
    .hero h1 { font-size: 26px; }
    .section-title { font-size: 22px; }
    .problem-inner, .problem-right, .connect-grid { grid-template-columns: 1fr; }
    .hero, .workflow, .problem, .shared-layers,
    .connected-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconHexagon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" fill="white" fillOpacity=".9"/>
    <circle cx="12" cy="11" r="3" fill="#5b5bd6"/>
  </svg>
);
const IconArrowDown = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M7 7l10 10M17 7v10H7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M4 12a8 8 0 018-8 8 8 0 016.93 4H16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 12a8 8 0 01-8 8 8 8 0 01-6.93-4H8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M16 4l3 3-3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 14l-3 3 3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconDollar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity=".15"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="Inter,sans-serif">$</text>
  </svg>
);
const IconSwap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M7 16l-4-4 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 12h18" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 8l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconGrid = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" fillOpacity=".9"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" fillOpacity=".3"/>
  </svg>
);
const IconCheck = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const workflowRow1 = ["Stock item", "Purchase request", "Purchase order", "Receiving"];
const workflowRow2 = ["Goods movement", "Reorder signal", "Valuation", "Supply insight"];

const problemCards = [
  { icon: <IconHexagon/>,   bg: "bg-purple", title: "Stock & locations",    desc: "Items across bins, stores and warehouses." },
  { icon: <IconArrowDown/>, bg: "bg-purple", title: "Receiving & movement", desc: "Goods in, out and transfers with evidence." },
  { icon: <IconRefresh/>,   bg: "bg-orange", title: "Reorder points",       desc: "Signals before you run out." },
  { icon: <IconDollar/>,    bg: "bg-orange", title: "Valuation",            desc: "Understand money tied up in goods." },
];

const connectedCards = [
  { icon: <IconSwap/>, bg: "bg-orange",    title: "Money",   desc: "Spend-to-stock, supplier invoices, AP and money tied to goods." },
  { icon: <IconGrid/>, bg: "bg-blue",      title: "Work",    desc: "Project-linked materials, goods, basic assets and movement." },
  { icon: <IconCheck/>, bg: "bg-dark-navy", title: "Control", desc: "Evidence, exceptions, approvals and supply governance." },
];

const sharedLayers = ["ZoikoID", "Workflow", "Hub", "Connect", "Documents", "Approvals", "AI Assistance", "Zoiko Insights"];

export default function ZoikoSupplyPage() {
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
            <span className="badge-pill-purple">Pillar 04</span>
            Supply
          </div>
          <h1>
            Supply operations software for inventory,<br />
            receiving, and stock <span className="accent">control.</span>
          </h1>
          <p className="hero-sub">
            Manage stock, locations, receiving, goods movement, reorder points, basic assets,
            valuation, supplier-linked activity, documents, approvals and supply visibility
            through Zoiko Inventory.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Explore Zoiko Inventory</button>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow">
        <p className="eyebrow-orange">THE SUPPLY WORKFLOW</p>
        <h2 className="section-title">From stock item to supply insight.</h2>
        <div className="workflow-track">
          {workflowRow1.map((step) => (
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

      {/* ── THE PROBLEM ── */}
      <section className="problem">
        <div className="problem-inner">
          <div className="problem-left">
            <p className="problem-eyebrow">THE PROBLEM</p>
            <h2 className="problem-title">
              Supply gets risky when stock, purchasing and receiving live apart.
            </h2>
            <p className="problem-desc">
              When inventory sits in spreadsheets, receiving is informal and purchasing is
              disconnected, businesses lose stock accuracy, tie up cash and lose visibility.
              The Supply pillar keeps one connected flow from purchase to valuation.
            </p>
            <button className="btn-dark">Explore Zoiko Inventory &nbsp;→</button>
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

      {/* ── CONNECTED TO THE BUSINESS ── */}
      <section className="connected-section">
        <p className="eyebrow-blue">CONNECTED TO THE BUSINESS</p>
        <h2 className="section-title">Supply links across the pillars.</h2>
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

      {/* ── SHARED LAYERS ── */}
      <section className="shared-layers">
        <p className="eyebrow-orange">SHARED LAYERS</p>
        <h2 className="section-title-white">Supply runs on the connected spine.</h2>
        <div className="layers-pills">
          {sharedLayers.map((l) => (
            <span className="layer-pill" key={l}>{l}</span>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
