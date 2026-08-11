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
      radial-gradient(ellipse 38% 60% at 6% 35%, rgba(255,200,160,0.35) 0%, transparent 70%),
      radial-gradient(ellipse 38% 60% at 94% 30%, rgba(160,140,255,0.30) 0%, transparent 70%),
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
  .badge-pill-orange {
    background: #f97316; color: #fff; border-radius: 999px;
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
  .hero h1 .accent { color: #f97316; }

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

  .btn-ghost {
    background: rgba(255,255,255,.15); color: #fff;
    border: 1.5px solid rgba(255,255,255,.3); border-radius: 999px;
    padding: 14px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.25); }

  /* ── WORKFLOW ── */
  .workflow { padding: 90px 52px 60px; background: #fff; text-align: center; }

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
    font-size: 38px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.8px; margin-bottom: 44px; line-height: 1.2;
  }
  .section-title-white {
    font-size: 36px; font-weight: 800; color: #fff;
    letter-spacing: -.7px; margin-bottom: 34px; line-height: 1.2;
  }

  .workflow-track {
    display: flex; align-items: center; flex-wrap: wrap; justify-content: center;
    background: #f7f7fc; border-radius: 20px; padding: 26px 32px 22px;
    max-width: 980px; margin: 0 auto; border: 1px solid #e8e8f4;
  }
  .w-row2 { display: flex; justify-content: center; align-items: center; margin-top: 14px; width: 100%; }
  .w-step { display: flex; align-items: center; }
  .step-pill {
    background: #fff; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 8px 16px; font-size: 13.5px; font-weight: 500; color: #1a1a3e; white-space: nowrap;
  }
  .step-arrow { color: #f97316; font-size: 16px; margin: 0 6px; line-height: 1; }

  /* ── MONEY PRODUCTS ── */
  .products-section { padding: 90px 52px; background: #f4f4fa; text-align: center; }

  .product-grid-2 {
    display: grid; grid-template-columns: repeat(2,1fr);
    gap: 22px; max-width: 760px; margin: 48px auto 0; text-align: left;
  }
  .product-card {
    background: #fff; border-radius: 22px; padding: 32px 28px; border: 1px solid #e6e6f2;
  }
  .prod-icon {
    width: 54px; height: 54px; border-radius: 15px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
  }
  .bg-orange { background: #f97316; }
  .bg-purple { background: #5b5bd6; }
  .bg-blue   { background: #38bdf8; }
  .bg-dark-navy { background: #1f1d5e; }

  .prod-name { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .prod-desc { font-size: 14px; color: #777799; line-height: 1.55; margin-bottom: 18px; }
  .prod-link {
    font-size: 14px; font-weight: 600; color: #f97316;
    text-decoration: none; display: inline-flex; align-items: center; gap: 5px;
  }
  .prod-link:hover { text-decoration: underline; }

  /* ── SHARED LAYERS ── */
  .shared-layers {
    padding: 60px 52px;
    background: linear-gradient(120deg, #2d1f9e 0%, #3b2db5 40%, #4f3bcc 70%, #5845d8 100%);
    text-align: center;
  }
  .layers-pills { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .layer-pill {
    background: rgba(255,255,255,.12); color: #fff;
    border: 1px solid rgba(255,255,255,.2); border-radius: 999px;
    padding: 10px 20px; font-size: 13.5px; font-weight: 500;
  }

  /* ── MONEY ARCHITECTURE ── */
  .architecture { padding: 90px 52px; background: #fff; text-align: center; }

  .arch-grid {
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 20px; max-width: 980px; margin: 48px auto 0; text-align: left;
  }
  .arch-card {
    background: #fff; border: 1px solid #e6e6f2; border-radius: 18px; padding: 28px 26px;
  }
  .arch-icon {
    width: 46px; height: 46px; border-radius: 13px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  }
  .arch-title { font-size: 15.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 7px; }
  .arch-desc  { font-size: 13.5px; color: #777799; line-height: 1.55; }

  .arch-note {
    font-size: 14px; color: #888899; margin-top: 36px; max-width: 700px;
    margin-left: auto; margin-right: auto; line-height: 1.6;
  }

  /* ── CTA BANNER ── */
  .cta-section { padding: 40px 52px 80px; background: #fff; }
  .cta-inner {
    background: linear-gradient(120deg, #4f1fb0 0%, #5b5bd6 45%, #38bdf8 100%);
    border-radius: 28px; padding: 64px 52px; text-align: center;
    max-width: 1100px; margin: 0 auto;
  }
  .cta-inner h2 {
    font-size: 38px; font-weight: 800; color: #fff;
    margin-bottom: 14px; letter-spacing: -.7px;
  }
  .cta-inner p { font-size: 16px; color: rgba(255,255,255,.78); margin-bottom: 36px; }
  .cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  @media (max-width: 820px) {
    .hero h1 { font-size: 30px; }
    .section-title { font-size: 26px; }
    .product-grid-2, .arch-grid { grid-template-columns: 1fr; }
    .hero, .workflow, .products-section, .shared-layers,
    .architecture, .cta-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconBillingDoc = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3" width="13" height="16" rx="2" fill="white" fillOpacity=".85"/>
    <rect x="7" y="7"  width="7" height="1.5" rx=".75" fill="#f97316"/>
    <rect x="7" y="10" width="7" height="1.5" rx=".75" fill="#f97316"/>
    <rect x="7" y="13" width="5" height="1.5" rx=".75" fill="#f97316"/>
  </svg>
);

const IconSwap = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <path d="M7 16l-4-4 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 12h18" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 8l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconDiamond = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 3l9 9-9 9-9-9 9-9z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
    <path d="M12 8l4 4-4 4-4-4 4-4z" fill="white" fillOpacity=".6"/>
  </svg>
);

const moneyProducts = [
  {
    icon: <IconBillingDoc/>, bg: "bg-orange",
    name: "Zoiko Billing",
    desc: "Invoices, subscriptions, usage billing, collections and revenue records — money in.",
    link: "Explore Zoiko Billing",
  },
  {
    icon: <IconSwap/>, bg: "bg-orange",
    name: "Zoiko Spend",
    desc: "Requests, approvals, POs, supplier invoices, vendors and AP — money out.",
    link: "Explore Zoiko Spend",
  },
];

const sharedLayers = ["ZoikoID", "Workflow", "Documents", "Approvals", "ZoikoPay", "ZoikoCoreX", "Zoiko Insights"];

const archCards = [
  {
    icon: <IconBillingDoc/>, bg: "bg-orange",
    title: "Operational money",
    desc: "Billing and Spend run money workflows inside Zoiko One.",
  },
  {
    icon: <IconArrowRight/>, bg: "bg-blue",
    title: "Money movement",
    desc: "ZoikoPay supports settlement and money movement.",
  },
  {
    icon: <IconDiamond/>, bg: "bg-dark-navy",
    title: "Financial truth",
    desc: "ZoikoCoreX preserves ledger-grade traceability.",
  },
];

const workflowRow1 = ["Customer / vendor record", "Billing or purchase event", "Approval", "Invoice / supplier invoice"];
const workflowRow2 = ["Payment preparation", "Evidence", "Money insight"];

export default function ZoikoMoneyPage() {
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
            <span className="badge-pill-orange">Pillar 02</span>
            Money
          </div>
          <h1>
            Money operations software for billing, spend,<br />
            and financial workflow <span className="accent">control.</span>
          </h1>
          <p className="hero-sub">
            Connect invoices, subscriptions, customer billing, purchase requests, vendors, supplier
            invoices, AP workflows, approvals, documents and financial visibility across Zoiko
            Billing and Zoiko Spend.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Explore Money Products</button>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow">
        <p className="eyebrow-orange">THE MONEY WORKFLOW</p>
        <h2 className="section-title">Money in and money out, governed.</h2>
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

      {/* ── MONEY PRODUCTS ── */}
      <section className="products-section">
        <p className="eyebrow-purple">MONEY PRODUCTS</p>
        <h2 className="section-title">Billing and Spend, connected.</h2>
        <div className="product-grid-2">
          {moneyProducts.map((p) => (
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
        <h2 className="section-title-white">Money runs on the connected spine.</h2>
        <div className="layers-pills">
          {sharedLayers.map((l) => (
            <span className="layer-pill" key={l}>{l}</span>
          ))}
        </div>
      </section>

      {/* ── MONEY ARCHITECTURE ── */}
      <section className="architecture">
        <p className="eyebrow-blue">MONEY ARCHITECTURE</p>
        <h2 className="section-title">
          Clear boundaries between operations,<br />movement, truth and books.
        </h2>
        <div className="arch-grid">
          {archCards.map((c) => (
            <div className="arch-card" key={c.title}>
              <div className={`arch-icon ${c.bg}`}>{c.icon}</div>
              <div className="arch-title">{c.title}</div>
              <div className="arch-desc">{c.desc}</div>
            </div>
          ))}
        </div>
        <p className="arch-note">
          ZoikoSuite handles accounting and bookkeeping — outside Zoiko One, as an ecosystem sibling.
        </p>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2>Control money in and money out.</h2>
          <p>Connect billing and spend into one governed money-operations workflow.</p>
          <div className="cta-btns">
            <button className="btn-primary">Get a Demo</button>
            <button className="btn-ghost">Request Money Pricing</button>
            <button className="btn-ghost">All Products</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
