import { useState } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/* ════════════════════════════════════════════════════════════
   STYLES
════════════════════════════════════════════════════════════ */
const styles = `
  /* ── HERO ── */
  .hero {
    position: relative;
    min-height: 85vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 80px 24px; overflow: hidden;
    background-color: #f5f4f2;
    background: linear-gradient(120deg, rgba(255,195,130,0.45) 0%, rgba(250,248,245,0.98) 38%, rgba(250,248,245,0.98) 62%, rgba(170,205,240,0.45) 100%);
  }
  .hero-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.92); border-radius: 999px;
    padding: 6px 16px; font-size: 14px; font-weight: 500; color: #555;
    margin-bottom: 28px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
  }
  .badge-pill-navy {
    background: #3B5BDB; color: #fff; font-size: 12px; font-weight: 700;
    padding: 2px 10px; border-radius: 999px;
  }
  .hero h1 {
    font-size: clamp(32px,5vw,56px); font-weight: 800; line-height: 1.1;
    color: #0B1C3F; max-width: 1100px; margin: 0 auto 20px;
  }
  .hero h1 .accent { color: #E8850A; }
  .hero-sub {
    font-size: 16px; color: #4B5563; max-width: 680px; margin: 0 auto 26px; line-height: 1.7;
  }
  .hero-note {
    font-size: 13px; color: #4B5563; margin-bottom: 28px; font-style: italic;
  }
  .hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  /* ── BUTTONS ── */
  .btn-primary {
    background: linear-gradient(135deg, #F97316, #EA580C); color: #fff; border: none; border-radius: 999px;
    padding: 14px 32px; font-size: 16px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px;
    font-family: 'Inter', sans-serif; transition: opacity .2s; white-space: nowrap;
  }
  .btn-primary:hover { opacity: .9; }
  .btn-outline {
    background: rgba(255,255,255,0.75); color: #1a1a2e; border: 1.5px solid rgba(0,0,0,0.12);
    border-radius: 999px; padding: 14px 32px; font-size: 16px; font-weight: 600;
    cursor: pointer; backdrop-filter: blur(4px);
    font-family: 'Inter', sans-serif; transition: background .2s; white-space: nowrap;
  }
  .btn-outline:hover { background: rgba(255,255,255,0.9); }
  .btn-dark {
    background: #2d1d8e; color: #fff; border: none; border-radius: 999px;
    padding: 13px 26px; font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  }
  .btn-dark:hover { background: #3a26ad; }
  .btn-ghost {
    background: rgba(255,255,255,.15); color: #fff;
    border: 1.5px solid rgba(255,255,255,.3); border-radius: 999px;
    padding: 12px 24px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s; white-space: nowrap;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.25); }

  /* ── TICKER STRIP ── */
  .ticker { padding: 24px 52px; background: #fff; text-align: center; border-bottom: 1px solid #f0f0f6; }
  .ticker-label { font-size: 13px; color: #9999b3; margin-bottom: 16px; }
  .ticker-pills { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .ticker-pill {
    display: inline-flex; align-items: center; gap: 7px;
    background: #eef4ff; border-radius: 999px; padding: 8px 16px;
    font-size: 12.5px; font-weight: 600; color: #2545c9;
  }

  /* ── GENERIC SECTION ── */
  .section { padding: 64px 52px; background: #fff; }
  .section-alt { background: #f7f7fd; }
  .section-dark {
    background: linear-gradient(120deg, #2d1f9e 0%, #3b2db5 40%, #4f3bcc 70%, #5845d8 100%);
  }
  .eyebrow-orange {
    font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #f97316; margin-bottom: 14px; text-align: center;
  }
  .eyebrow-purple {
    font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #5b5bd6; margin-bottom: 14px; text-align: center;
  }
  .eyebrow-blue {
    font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
    color: #2563eb; margin-bottom: 14px; text-align: center;
  }
  .section-title {
    font-size: 28px; font-weight: 800; color: #1a1a3e; text-align: center;
    letter-spacing: -.5px; margin-bottom: 14px; line-height: 1.3;
  }
  .section-title-white { color: #fff; }
  .section-sub {
    font-size: 14px; color: #666688; text-align: center; max-width: 740px;
    margin: 0 auto 40px; line-height: 1.65;
  }
  .section-sub-white { color: rgba(255,255,255,.8); }
  .center-btn { display: flex; justify-content: center; }

  /* ── WHAT ZOIKO ONE IS (split) ── */
  .split-grid {
    display: grid; grid-template-columns: 1.05fr .95fr; gap: 50px;
    max-width: 1080px; margin: 0 auto; align-items: center;
  }
  .split-left { text-align: left; }
  .split-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #f97316; margin-bottom: 14px; }
  .split-title { font-size: 25px; font-weight: 800; color: #1a1a3e; line-height: 1.32; margin-bottom: 16px; letter-spacing: -.4px; }
  .split-desc { font-size: 13.5px; color: #555577; line-height: 1.65; margin-bottom: 12px; }
  .split-desc .accent { color: #f97316; font-weight: 700; }
  .split-ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }

  .stack-cards { display: flex; flex-direction: column; gap: 12px; }
  .stack-card { border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; }
  .sc-purple-light { background: #eeeeff; }
  .sc-blue-light   { background: #e8f6ff; }
  .sc-purple-mid   { background: #ece8fa; }
  .sc-orange-light { background: #fff3e8; }
  .sc-icon { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .sc-title { font-size: 14px; font-weight: 700; color: #1a1a3e; }
  .sc-desc  { font-size: 12px; color: #777799; margin-top: 2px; }

  /* ── WHY ZOIKO ONE EXISTS (problem table) ── */
  .problem-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    max-width: 980px; margin: 0 auto 36px;
  }
  .problem-cell { background: #f7f7fd; border-radius: 16px; padding: 22px 24px; display: flex; }
  .pc-half { flex: 1; }
  .pc-half + .pc-half { padding-left: 18px; border-left: 1px solid #e4e4f0; margin-left: 18px; }
  .pc-label { font-size: 10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #9999b3; margin-bottom: 8px; }
  .pc-label.zoiko { color: #f97316; }
  .pc-text { font-size: 13px; color: #2a2a4a; line-height: 1.55; }

  /* ── PRODUCTS GRID (8 products) ── */
  .products-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px;
    max-width: 1080px; margin: 0 auto;
  }
  .product-card {
    background: #fff; border: 1px solid #e6e6f2; border-radius: 18px; padding: 22px 20px;
    text-align: left; display: flex; flex-direction: column;
    transition: transform .2s, box-shadow .2s, border-color .2s;
  }
  .product-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0,0,0,.08);
    border-color: #c8c8e0;
  }
  .product-card.featured {
    background: linear-gradient(150deg, #2d1f9e 0%, #3b6fe0 100%);
    border: none; color: #fff;
  }
  .product-card.featured:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(45,31,158,.25);
  }
  .product-card.featured:hover .pcard-icon svg {
    animation: pulseCmd .6s ease-in-out infinite alternate;
  }
  @keyframes pulseCmd {
    from { transform: scale(1); opacity: 1; }
    to   { transform: scale(1.12); opacity: .8; }
  }
  .pcard-icon {
    width: 38px; height: 38px; border-radius: 11px; display: flex;
    align-items: center; justify-content: center; margin-bottom: 14px;
  }
  .pcard-name { font-size: 15px; font-weight: 700; color: #1a1a3e; margin-bottom: 8px; }
  .product-card.featured .pcard-name { color: #fff; }
  .pcard-desc { font-size: 12.5px; color: #777799; line-height: 1.5; margin-bottom: 12px; flex-grow: 1; }
  .product-card.featured .pcard-desc { color: rgba(255,255,255,.85); }
  .pcard-quote {
    font-size: 11.5px; font-style: italic; color: #8888a8; line-height: 1.45;
    border-left: 2px solid #d8d8ec; padding-left: 10px; margin-bottom: 14px;
  }
  .pcard-link { font-size: 12.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; transition: gap .2s; }
  .pcard-link:hover { gap: 8px; }
  .product-card.featured .pcard-link { color: #fff; }

  /* ── HOW CUSTOMERS BUY ── */
  .buy-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
    max-width: 980px; margin: 0 auto 30px;
  }
  .buy-card {
    background: #fff; border: 1.5px solid #e6e6f2; border-radius: 20px;
    padding: 28px 24px; text-align: left; position: relative;
  }
  .buy-card.popular { border-color: #f97316; box-shadow: 0 8px 28px rgba(249,115,22,.12); }
  .popular-badge {
    position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
    background: #f97316; color: #fff; font-size: 10.5px; font-weight: 700;
    padding: 5px 16px; border-radius: 999px; white-space: nowrap;
  }
  .buy-num {
    width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center;
    justify-content: center; font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 14px;
  }
  .bn-1 { background: #2d1d8e; }
  .bn-2 { background: #f97316; }
  .bn-3 { background: #2563eb; }
  .buy-title { font-size: 18px; font-weight: 800; color: #1a1a3e; margin-bottom: 6px; }
  .buy-sub { font-size: 12.5px; color: #888899; margin-bottom: 18px; }
  .buy-list { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 22px; }
  .buy-list li { font-size: 13px; color: #2a2a4a; display: flex; gap: 8px; align-items: flex-start; }
  .buy-check { color: #f97316; font-weight: 700; flex-shrink: 0; }
  .buy-tagline { text-align: center; font-size: 14.5px; font-weight: 700; color: #2d1d8e; }

  /* ── GLOBAL READINESS (dark) ── */
  .global-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
    max-width: 960px; margin: 0 auto 36px;
  }
  .global-card {
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
    border-radius: 16px; padding: 22px 20px; text-align: left;
  }
  .global-icon {
    width: 32px; height: 32px; border-radius: 9px; background: rgba(255,255,255,.15);
    display: flex; align-items: center; justify-content: center; margin-bottom: 14px;
  }
  .global-title { font-size: 14.5px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .global-desc { font-size: 12.5px; color: rgba(255,255,255,.7); line-height: 1.5; }

  /* ── TRUST CENTER ── */
  .trust-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
    max-width: 1000px; margin: 0 auto 30px;
  }
  .trust-card { background: #fff; border: 1px solid #e6e6f2; border-radius: 18px; padding: 22px 22px; text-align: left; }
  .trust-card.featured { background: linear-gradient(150deg, #2d1f9e 0%, #3b6fe0 100%); border: none; }
  .trust-icon {
    width: 36px; height: 36px; border-radius: 10px; background: #f0f0fa;
    display: flex; align-items: center; justify-content: center; margin-bottom: 14px;
  }
  .trust-card.featured .trust-icon { background: rgba(255,255,255,.18); }
  .trust-title { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 5px; }
  .trust-card.featured .trust-title { color: #fff; }
  .trust-quote { font-size: 12px; font-style: italic; color: #999; margin-bottom: 10px; }
  .trust-card.featured .trust-quote { color: rgba(255,255,255,.7); }
  .trust-desc { font-size: 12.5px; color: #777799; line-height: 1.5; margin-bottom: 14px; }
  .trust-card.featured .trust-desc { color: rgba(255,255,255,.85); }
  .trust-link { font-size: 12.5px; font-weight: 700; color: #5b5bd6; text-decoration: none; }
  .trust-card.featured .trust-link { color: #fff; }
  .trust-footnote { text-align: center; font-size: 12.5px; color: #9999b3; }

  /* ── BUSINESS CLOUD ── */
  .cloud-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #aaaacc; text-align: center; margin-bottom: 18px; }
  .cloud-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; max-width: 1080px; margin: 0 auto 32px; }
  .cloud-card { background: #fff; border: 1px solid #e6e6f2; border-radius: 16px; padding: 20px; text-align: left; }
  .cloud-tag { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #f97316; margin-bottom: 8px; }
  .cloud-name { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 7px; }
  .cloud-desc { font-size: 12px; color: #777799; line-height: 1.5; margin-bottom: 12px; }
  .cloud-link { font-size: 12px; font-weight: 700; color: #5b5bd6; text-decoration: none; }

  .hero-pill-banner {
    background: linear-gradient(110deg, #2d1d8e 0%, #3b6fe0 100%);
    border-radius: 18px; padding: 20px 28px; display: flex; align-items: center; gap: 18px;
    max-width: 900px; margin: 0 auto 32px;
  }
  .hpb-icon {
    width: 48px; height: 48px; border-radius: 14px; background: rgba(255,255,255,.18);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .hpb-label { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: rgba(255,255,255,.7); margin-bottom: 4px; }
  .hpb-title { font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 4px; }
  .hpb-desc { font-size: 12.5px; color: rgba(255,255,255,.85); }

  .infra-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; max-width: 700px; margin: 0 auto; }
  .infra-card { background: #f4f4fa; border-radius: 16px; padding: 18px 20px; text-align: left; }
  .infra-tag { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #5b5bd6; margin-bottom: 6px; }
  .infra-name { font-size: 14px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .infra-desc { font-size: 12px; color: #777799; line-height: 1.5; margin-bottom: 10px; }
  .infra-link { font-size: 12px; font-weight: 700; color: #5b5bd6; text-decoration: none; }

  /* ── COMPARISON TABLE ── */
  .compare-wrap { max-width: 940px; margin: 0 auto 36px; border-radius: 18px; overflow: hidden; border: 1px solid #e6e6f2; }
  .compare-head { display: grid; grid-template-columns: 1fr 1fr; }
  .ch-left { background: #f0f0f6; padding: 16px 24px; font-size: 13.5px; font-weight: 700; color: #555577; }
  .ch-right { background: linear-gradient(90deg, #2d1d8e, #3b6fe0); padding: 16px 24px; font-size: 13.5px; font-weight: 700; color: #fff; }
  .compare-row { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #f0f0f6; }
  .cr-left { padding: 16px 24px; font-size: 12.5px; color: #777799; line-height: 1.55; }
  .cr-right { padding: 16px 24px; font-size: 12.5px; color: #1a1a3e; line-height: 1.55; display: flex; gap: 8px; align-items: flex-start; }
  .cr-check { color: #f97316; font-weight: 700; flex-shrink: 0; }

  /* ── WHO IT'S FOR ── */
  .who-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; max-width: 1000px; margin: 0 auto 30px; }
  .who-card { background: #fff; border: 1px solid #e6e6f2; border-radius: 16px; padding: 22px 20px; text-align: left; }
  .who-icon { width: 34px; height: 34px; border-radius: 10px; background: #2563eb; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
  .who-title { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .who-desc { font-size: 12.5px; color: #777799; line-height: 1.5; margin-bottom: 12px; }
  .who-chip { display: inline-block; background: #eef0ff; color: #3b3bcc; font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px; }

  /* ── PHILOSOPHY ── */
  .philosophy-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; max-width: 980px; margin: 0 auto; }
  .phil-card { background: #fff; border: 1px solid #e6e6f2; border-radius: 16px; padding: 22px 20px; text-align: left; }
  .phil-num { font-size: 22px; font-weight: 800; color: #f97316; margin-bottom: 10px; }
  .phil-title { font-size: 14.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .phil-desc { font-size: 12.5px; color: #777799; line-height: 1.5; }

  /* ── FAQ ── */
  .faq-list { max-width: 760px; margin: 0 auto 36px; display: flex; flex-direction: column; gap: 12px; }
  .faq-item { border: 1.5px solid #e6e6f2; border-radius: 16px; overflow: hidden; }
  .faq-question {
    width: 100%; background: none; border: none; padding: 18px 24px;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 14.5px; font-weight: 700; color: #1a1a3e; cursor: pointer;
    text-align: left; font-family: 'Inter', sans-serif; gap: 12px;
  }
  .faq-chevron {
    width: 30px; height: 30px; border-radius: 50%; background: #ececf8;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    font-size: 13px; color: #5b5bd6; transition: transform .2s;
  }
  .faq-chevron.open { transform: rotate(180deg); }
  .faq-answer { padding: 0 24px 18px; font-size: 13.5px; color: #666688; line-height: 1.6; border-top: 1px solid #f0f0f8; padding-top: 14px; }

  /* ── CTA BANNER ── */
  .cta-section { padding: 50px 52px 80px; background: #fff; }
  .cta-inner {
    background: linear-gradient(120deg, #4f1fb0 0%, #5b5bd6 45%, #3b82f6 100%);
    border-radius: 28px; padding: 56px 52px; text-align: center; max-width: 1100px; margin: 0 auto;
  }
  .cta-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #ffb98a; margin-bottom: 14px; }
  .cta-inner h2 { font-size: 30px; font-weight: 800; color: #fff; margin-bottom: 14px; letter-spacing: -.5px; line-height: 1.3; }
  .cta-inner p { font-size: 14.5px; color: rgba(255,255,255,.78); margin-bottom: 30px; max-width: 640px; margin-left: auto; margin-right: auto; line-height: 1.6; }
  .cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 18px; }
  .cta-footnote { font-size: 12px; color: rgba(255,255,255,.6); }

  @media (max-width: 900px) {
    .hero h1 { font-size: 22px; }
    .section-title { font-size: 20px; }
    .split-grid, .problem-grid, .products-grid, .buy-grid,
    .global-grid, .trust-grid, .cloud-grid, .compare-head,
    .compare-row, .who-grid, .philosophy-grid, .infra-grid { grid-template-columns: 1fr; }
    .pc-half + .pc-half { padding-left: 0; border-left: none; margin-left: 0; margin-top: 14px; }
    .hero, .section { padding-left: 18px; padding-right: 18px; }
  }
`;
/* ════════════════════════════════════════════════════════════
   ICONS
════════════════════════════════════════════════════════════ */
const I = {
  Core: () => <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" fill="white" fillOpacity=".95"/><circle cx="12" cy="11" r="2.6" fill="#5b5bd6"/></svg>,
  Layers: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="white" strokeWidth="1.8"/><circle cx="12" cy="12" r="2.6" fill="white"/></svg>,
  Infra: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l3.5 3.5L12 10l-3.5-3.5L12 3z" fill="white" fillOpacity=".95"/><path d="M12 14l3.5 3.5L12 21l-3.5-3.5L12 14z" fill="white" fillOpacity=".6"/></svg>,
  Cloud: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0119 17H7z" fill="white" fillOpacity=".95"/></svg>,
  Check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Globe: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#2545c9" strokeWidth="1.8"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" stroke="#2545c9" strokeWidth="1.5" fill="none"/></svg>,
  Circle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#2545c9" strokeWidth="1.8"/></svg>,
  Doc: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="11" height="14" rx="2" fill="none" stroke="#2545c9" strokeWidth="1.6"/></svg>,
  Dollar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#2545c9" strokeWidth="1.6"/><text x="12" y="16" textAnchor="middle" fill="#2545c9" fontSize="10" fontWeight="bold">$</text></svg>,
  Shield: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="#2545c9" strokeWidth="1.6" fill="none"/></svg>,
  Lock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="#2545c9" strokeWidth="1.6"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#2545c9" strokeWidth="1.6" fill="none"/></svg>,
  Arrow: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#2545c9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  People: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" fill={c} fillOpacity=".9"/><circle cx="16" cy="7" r="3" fill={c} fillOpacity=".5"/><path d="M2 19c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke={c} strokeWidth="1.8" fill="none"/></svg>,
  Clock: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  DollarF: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.8" fillOpacity=".15"/><text x="12" y="16" textAnchor="middle" fill={c} fontSize="11" fontWeight="bold">$</text></svg>,
  DocF: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="11" height="14" rx="2" fill={c} fillOpacity=".9"/></svg>,
  Grid: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill={c} fillOpacity=".9"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill={c} fillOpacity=".5"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill={c} fillOpacity=".5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill={c} fillOpacity=".3"/></svg>,
  CheckF: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={c} strokeWidth="2.2" strokeLinecap="round"/></svg>,
  Bar: (c="white") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="6" rx="1" fill={c} fillOpacity=".55"/><rect x="10" y="9" width="4" height="11" rx="1" fill={c} fillOpacity=".8"/><rect x="17" y="4" width="4" height="16" rx="1" fill={c}/></svg>,
  Cmd: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 4a3 3 0 100 6h10a3 3 0 100-6 3 3 0 00-3 3v10a3 3 0 106 0 3 3 0 00-3-3H7a3 3 0 100 6 3 3 0 003-3V7a3 3 0 00-3-3z" stroke="white" strokeWidth="1.6" fill="none"/></svg>,
  Chat: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4V5z" fill="#3b82f6" fillOpacity=".9"/></svg>,
  Send: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12l7-7 11 7-11 7-7-7z" fill="#3b82f6"/></svg>,
  Mega: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 10v4l6 2V8l-6 2z" fill="#f97316"/><path d="M9 8l10-4v16L9 16V8z" fill="#f97316" fillOpacity=".7"/></svg>,
  Browser: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#f97316" strokeWidth="1.6" fill="none"/><path d="M3 8h18" stroke="#f97316" strokeWidth="1.6"/></svg>,
  Briefcase: (c="#2563eb") => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="8" width="18" height="11" rx="2" fill={c} fillOpacity=".9"/><path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke={c} strokeWidth="1.6" fill="none"/></svg>,
  Wrench: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 4a4 4 0 00-5 5l-7 7 2 2 7-7a4 4 0 005-5l-2 2-2-2 2-2z" fill="white" fillOpacity=".9"/></svg>,
  TargetIcon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="white" strokeWidth="1.8" fill="none" fillOpacity=".15"/><circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" fill="none"/><circle cx="12" cy="12" r="1.3" fill="white"/></svg>,
  Building: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="1" fill="white" fillOpacity=".9"/></svg>,
  Service: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="white" fillOpacity=".9"/></svg>,
  Gear: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill="white"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  Coin: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f97316" strokeWidth="1.8"/><path d="M12 7v10M9 9h4.5a1.5 1.5 0 110 3H10a1.5 1.5 0 100 3h4" stroke="#f97316" strokeWidth="1.5" fill="none"/></svg>,
  GlobeWhite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.7"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" stroke="white" strokeWidth="1.5" fill="none"/></svg>,
  DollarWhite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="white" strokeWidth="1.6"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">$</text></svg>,
  EntityDot: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="white" strokeWidth="1.7"/><circle cx="12" cy="12" r="3" fill="white"/></svg>,
  CheckWhite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  LockWhite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" fill="white" fillOpacity=".95"/><path d="M8 11V8a4 4 0 018 0v3" stroke="white" strokeWidth="1.7" fill="none"/></svg>,
  ArrowWhite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7v8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  BrowserWhite: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" fill="white" fillOpacity=".95"/><path d="M3 8h18" stroke="#2563eb" strokeWidth="1.6"/></svg>,
  SendWhite: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12l7-7 11 7-11 7-7-7z" fill="white"/></svg>,
  CircleWhite: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="white" strokeWidth="1.8"/></svg>,
  GlobeWhiteFull: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" stroke="white" strokeWidth="1.5" fill="none"/></svg>,
};

/* ════════════════════════════════════════════════════════════
   DATA
════════════════════════════════════════════════════════════ */
const tickerItems = [
  { icon: <I.Globe/>, label: "Global SaaS platform" },
  { icon: <I.Circle/>, label: "Jurisdiction-agnostic architecture" },
  { icon: <I.Doc/>, label: "Seven products at launch" },
  { icon: <I.Dollar/>, label: "Standalone · bundle · enterprise" },
  { icon: <I.Shield/>, label: "Trust Center before advertising" },
  { icon: <I.Lock/>, label: "Part of Zoiko Group" },
  { icon: <I.Arrow/>, label: "Visit Trust Center" },
];

const stackData = [
  { cls: "sc-purple-light", bg: "#5b5bd6", icon: <I.Core/>, title: "Core Products", desc: "Seven purchasable products" },
  { cls: "sc-blue-light", bg: "#38bdf8", icon: <I.Layers/>, title: "Shared Layers", desc: "Capabilities inside the platform" },
  { cls: "sc-purple-mid", bg: "#5b5bd6", icon: <I.Infra/>, title: "Infrastructure", desc: "ZoikoPay · ZoikoCoreX" },
  { cls: "sc-orange-light", bg: "#f97316", icon: <I.Cloud/>, title: "Business Cloud", desc: "Adjacent standalone platforms" },
];

const problemCells = [
  { left: "Disconnected HR, time, payroll, billing, project and compliance systems.", right: "Seven core products connected by shared platform layers and governed workflow design." },
  { left: "Businesses need one product now, not a forced suite.", right: "Standalone pricing for each core product — buy only what you need today." },
  { left: "Service businesses need to connect work delivery to revenue.", right: "Time, Projects, Billing and Insights connect work, utilization and invoicing." },
  { left: "Enterprises need governance, permissions, security and scale.", right: "Enterprise framework, Trust Center, APIs, audit logs and role-based controls." },
];

const products = [
  { name: "Zoiko HR", bg: "#5b5bd6", icon: I.People(), desc: "People records, onboarding, leave, documents and lifecycle.", quote: "Can I manage employees and HR records cleanly?", link: "Explore Zoiko HR", color: "#5b5bd6" },
  { name: "ZoikoTime", bg: "#5b5bd6", icon: I.Clock(), desc: "Time tracking, attendance, shifts, scheduling and approvals.", quote: "Can I capture work for payroll, projects and billing?", link: "Explore ZoikoTime", color: "#5b5bd6" },
  { name: "Zoiko Payroll", bg: "#f97316", icon: I.DollarF(), desc: "Pay runs, payslips, deductions, approvals and reporting.", quote: "Can I run payroll with control and audit confidence?", link: "Explore Zoiko Payroll", color: "#f97316" },
  { name: "Zoiko Billing", bg: "#38bdf8", icon: I.DocF(), desc: "Invoices, recurring billing, collections and revenue dashboards.", quote: "Can I invoice faster and reduce revenue leakage?", link: "Explore Zoiko Billing", color: "#38bdf8" },
  { name: "Zoiko Projects", bg: "#5b5bd6", icon: I.Grid(), desc: "Clients, projects, budgets, deliverables, utilization and billable work.", quote: "Can I connect work delivery to revenue?", link: "Explore Zoiko Projects", color: "#5b5bd6" },
  { name: "Zoiko Comply", bg: "#1f1d5e", icon: I.CheckF(), desc: "Compliance calendars, evidence packs, audit logs and readiness.", quote: "Can I stay prepared across obligations and jurisdictions?", link: "Explore Zoiko Comply", color: "#1f1d5e" },
  { name: "Zoiko Insights", bg: "#f97316", icon: I.Bar(), desc: "Dashboards, forecasting, operational intelligence and risk visibility.", quote: "Can leadership see what is happening in real time?", link: "Explore Zoiko Insights", color: "#f97316" },
];

const buyTiers = [
  { num: "1", cls: "bn-1", title: "Standalone", sub: "Customer wants one product first.",
    items: ["Any single core product", "HR, Time, Payroll, Billing", "Projects, Comply or Insights", "Core workflow & approvals"],
    btn: "View Product Pricing", btnType: "outline" },
  { num: "2", cls: "bn-2", title: "Bundles", sub: "Customer wants connected workflows.",
    items: ["Outcome bundles", "People · Revenue · Projects", "Control · Business", "Cross-product visibility", "Best value per product"],
    btn: "Compare Bundles", btnType: "primary", popular: true },
  { num: "3", cls: "bn-3", title: "Enterprise", sub: "Customer needs scale, governance and support.",
    items: ["Multi-entity setup", "Enterprise permissions", "Advanced integration", "Due diligence & SLAs", "Onboarding & implementation"],
    btn: "Contact Sales", btnType: "dark" },
];

const globalCards = [
  { icon: <I.GlobeWhite/>, title: "Locale", desc: "Locale-aware content, language and regional formats as markets expand." },
  { icon: <I.DollarWhite/>, title: "Currency", desc: "Multi-currency display and reporting across financial surfaces." },
  { icon: <I.EntityDot/>, title: "Entity", desc: "Multi-entity structures for groups, subsidiaries and regions." },
  { icon: <I.CheckWhite/>, title: "Compliance", desc: "Configurable compliance environments and obligation tracking." },
  { icon: <I.LockWhite/>, title: "Data", desc: "Data handling, retention, residency approach and customer controls." },
  { icon: <I.ArrowWhite/>, title: "Sales routing", desc: "Demo routing by country, size, product interest and timeline." },
];

const trustCards = [
  { icon: <I.Lock/>, title: "Security Overview", quote: "How is the platform secured?", desc: "Access control, encryption, administrative controls, monitoring and secure development.", link: "Visit Trust Center" },
  { icon: <I.Globe/>, title: "Privacy & Data", quote: "How is sensitive data handled?", desc: "Privacy policy, DPA, retention, data processing, subprocessors and protection controls.", link: "Read Privacy Overview" },
  { icon: <I.Browser/>, title: "Compliance & Governance", quote: "How does it support audit readiness?", desc: "Audit trails, approval history, evidence packs, policy documents and governance.", link: "View Compliance Resources" },
  { icon: <I.Circle/>, title: "System Status", quote: "Is the platform reliable?", desc: "Service availability, incidents, maintenance and update communication.", link: "View Status" },
  { icon: <I.Doc/>, title: "Enterprise Due Diligence", quote: "Can our team evaluate this properly?", desc: "Security overview, legal documents, procurement resources and implementation overview.", link: null, featured: true, cta: "Contact Sales" },
  { icon: <I.Arrow/>, title: "Security Overview PDF", quote: null, desc: "A shareable summary for your security and procurement teams.", link: "Download Security Overview" },
];

const cloudAdjacent = [
  { tag: "Communication", name: "Zoiko Sema", desc: "Messaging, meetings, video, channels and team collaboration.", link: "Explore Sema", icon: <I.Chat/> },
  { tag: "Global Comms", name: "Zoiko Local", desc: "Standalone global communication platform for reachability and presence.", link: "Explore Local", icon: <I.Send/> },
  { tag: "Growth", name: "ZoikoVertex", desc: "Campaigns, marketing workflows, sales enablement and growth automation.", link: "Explore Vertex", icon: <I.Mega/> },
  { tag: "Digitization", name: "Zoiko Web Services", desc: "Website, app, cloud, integration and managed digital transformation.", link: "Explore Web Services", icon: <I.Browser/> },
];

const infraCards = [
  { tag: "Settlement", name: "ZoikoPay", desc: "Settlement, disbursement, FX, payment links, reconciliation and money movement that power payroll and billing.", link: "Learn about ZoikoPay" },
  { tag: "Financial Truth", name: "ZoikoCoreX", desc: "Ledger-grade traceability and governed financial truth across operating and financial workflows.", link: "Learn about ZoikoCoreX" },
];

const compareRows = [
  { left: "Separate tools for HR, time, payroll, projects, billing, reporting and compliance.", right: "Connected platform with seven core products and shared operating layers." },
  { left: "Forced suite purchase or disconnected point tools.", right: "Standalone, bundle and enterprise pricing framework." },
  { left: "Manual exports, re-keying and reconciliation.", right: "Connected workflows that reduce duplication and handoff friction." },
  { left: "Projects disconnected from time, utilization and billing.", right: "Zoiko Projects connects work delivery to time, invoices and insights." },
  { left: "Compliance treated as an afterthought.", right: "Zoiko Comply is a core product and governance layer." },
  { left: "Reports built after work is already done.", right: "Zoiko Insights gives leadership visibility across operating data." },
  { left: "Local-first tools that struggle across markets.", right: "Global SaaS reach and jurisdiction-agnostic architecture." },
  { left: "Unclear ecosystem boundaries.", right: "Clear separation of core products, layers, infrastructure and Business Cloud." },
];

const whoFor = [
  { icon: <I.BrowserWhite/>, title: "Small business", desc: "Replace admin friction with one or two core products.", chip: "Start: Standalone HR, Time, Billing or Payroll" },
  { icon: <I.SendWhite/>, title: "Growing business", desc: "Connect people, time, payroll, billing, projects and compliance.", chip: "Start: Bundle pricing" },
  { icon: <I.CircleWhite/>, title: "Mid-market", desc: "Add controls, permissions, reporting and integration.", chip: "Start: Zoiko One Business bundle" },
  { icon: <I.GlobeWhite/>, title: "Enterprise / multi-entity", desc: "Global operations, governance, security and procurement readiness.", chip: "Start: Enterprise framework" },
  { icon: I.Briefcase("white"), title: "Agencies & services", desc: "Track billable work and convert it into client invoices.", chip: "Start: Time + Projects + Billing + Insights" },
  { icon: <I.Gear/>, title: "Operations-heavy teams", desc: "Coordinate people, shifts, projects, approvals and reporting.", chip: "Start: HR + Time + Projects + Insights" },
];

const philosophy = [
  { num: "01", title: "Modularity", desc: "Customers can start with one product and expand when ready." },
  { num: "02", title: "Connection", desc: "Workflows move across products without unnecessary re-entry." },
  { num: "03", title: "Control", desc: "Governance, approvals, permissions and evidence in every core workflow." },
  { num: "04", title: "Global readiness", desc: "Designed for international reach and jurisdictional flexibility." },
  { num: "05", title: "Commercial clarity", desc: "Pricing supports standalone, bundle and enterprise adoption." },
  { num: "06", title: "Trust before scale", desc: "The Trust Center is ready before major advertising campaigns." },
];

const faqs = [
  { q: "What is Zoiko One?", a: "Zoiko One is a modular, global business operations platform that connects people, time, payroll, billing, projects, compliance and insights into one operating layer — rather than forcing you to stitch together disconnected point tools." },
  { q: "What are the seven main products?", a: "Zoiko HR, ZoikoTime, Zoiko Payroll, Zoiko Billing, Zoiko Projects, Zoiko Comply and Zoiko Insights. Each is independently purchasable and becomes stronger when connected to the wider platform." },
  { q: "Can I buy only one product?", a: "Yes. Every core product is sold standalone. You can start with the single product that solves your immediate problem, then expand into bundles or the full platform when your workflows naturally connect." },
  { q: "Is Zoiko Projects a main Zoiko One product?", a: "Yes — Zoiko Projects is one of the seven core products. It connects work delivery to time, billing and insights, making it central for service businesses and project-based teams." },
  { q: "Is Zoiko One global?", a: "Zoiko One is built as a global SaaS platform with jurisdiction-agnostic architecture, supporting multiple locales, currencies, entities and compliance environments as your business expands across markets." },
  { q: "What is the Trust Center?", a: "The Trust Center gives buyers a clear path to security, privacy, compliance, system status, legal and procurement resources — published before major advertising campaigns so every public claim is substantiated." },
  { q: "How do ZoikoPay and ZoikoCoreX relate to Zoiko One?", a: "ZoikoPay and ZoikoCoreX are infrastructure layers beneath Zoiko One. ZoikoPay handles settlement and money movement that power payroll and billing, while ZoikoCoreX preserves ledger-grade financial traceability across the platform." },
  { q: "Are Sema, Local, Vertex and Web Services part of Zoiko One?", a: "No — these are adjacent standalone platforms within the wider Zoiko Business Cloud. Zoiko One remains the hero operations platform, while Sema, Local, Vertex and Web Services add communication, growth and digitization context around it." },
];

/* ════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════ */
export default function AboutPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="font-sans bg-white text-[#111827] min-h-screen">
      <style>{styles}</style>
      <LandingHeader />

      {/* 1 — HERO */}
      <section id="about-zoiko-one" className="hero">
        <div className="hero-badge">
          <span className="badge-pill-navy">About Zoiko One</span>
          Part of the Zoiko Business Cloud
        </div>
        <h1>
          The connected business operations platform for people, time, payroll,
          billing, projects, compliance &amp; <span className="accent">insights.</span>
        </h1>
        <p className="hero-sub">
          Zoiko One helps small, medium and large organizations run essential business
          operations from one modular platform. Start with a single product, connect
          related workflows, or scale through an enterprise framework — without
          rebuilding your operating stack.
        </p>
        <div className="hero-note">
          Standalone when you need focus · Connected when you need scale ·
          Enterprise-ready when your business demands more.
        </div>
        <div className="hero-ctas">
          <button className="btn-primary">Get a Demo &nbsp;→</button>
          <button className="btn-outline">Explore Products</button>
        </div>
      </section>

      {/* 2 — TICKER */}
      <section className="ticker">
        <p className="ticker-label">Built for modern business operations from day one</p>
        <div className="ticker-pills">
          {tickerItems.map((t) => (
            <span className="ticker-pill" key={t.label}>{t.icon}{t.label}</span>
          ))}
        </div>
      </section>

      {/* 3 — WHAT ZOIKO ONE IS */}
      <section className="section">
        <div className="split-grid">
          <div className="split-left">
            <p className="split-eyebrow">WHAT ZOIKO ONE IS</p>
            <h2 className="split-title">
              A modular, global business operations platform not just&nbsp;another point tool.
            </h2>
            <p className="split-desc">
              It brings together the systems organizations use to manage people, time,
              payroll, billing, projects, compliance and{" "}
              <span className="accent">operational intelligence.</span>
            </p>
            <p className="split-desc">
              It is not only an HR tool, a time-tracking tool, a payroll system, a billing
              platform, a project tool, a compliance tracker or an analytics dashboard.
              It is the connected operating layer where those workflows can work
              independently, work together and scale globally.
            </p>
            <div className="split-ctas">
              <button className="btn-dark">See the Platform Overview &nbsp;→</button>
              <button className="btn-outline">Explore Products</button>
            </div>
          </div>
          <div className="stack-cards">
            {stackData.map((s) => (
              <div className={`stack-card ${s.cls}`} key={s.title}>
                <div className="sc-icon" style={{ background: s.bg }}>{s.icon}</div>
                <div>
                  <div className="sc-title">{s.title}</div>
                  <div className="sc-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — WHY ZOIKO ONE EXISTS */}
      <section className="section">
        <p className="eyebrow-orange">WHY ZOIKO ONE EXISTS</p>
        <h2 className="section-title">
          Modern businesses run across<br />more systems than ever&nbsp; yet none of them talk.
        </h2>
        <p className="section-sub">
          HR in one tool, time in another, projects in spreadsheets, payroll through
          manual exports, billing in finance software, compliance in folders, and
          leadership reporting after the fact. Zoiko One was built for the new operating reality.
        </p>
        <div className="problem-grid">
          {problemCells.map((c, i) => (
            <div className="problem-cell" key={i}>
              <div className="pc-half">
                <div className="pc-label">BUYER PROBLEM</div>
                <div className="pc-text">{c.left}</div>
              </div>
              <div className="pc-half">
                <div className="pc-label zoiko">ZOIKO ONE</div>
                <div className="pc-text">{c.right}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="center-btn">
          <button className="btn-dark">See How Zoiko One Works &nbsp;→</button>
        </div>
      </section>

      {/* 5 — PRODUCTS GRID */}
      <section className="section section-alt">
        <p className="eyebrow-purple">SEVEN PRODUCTS. ONE CONNECTED OPERATING LAYER.</p>
        <h2 className="section-title">One platform, eight core products.</h2>
        <p className="section-sub">
          Each can stand alone commercially, and each becomes stronger when connected
          to the wider platform.
        </p>
        <div className="products-grid">
          {products.map((p) => (
            <div className="product-card" key={p.name}>
              <div className="pcard-icon" style={{ background: p.bg }}>{p.icon}</div>
              <div className="pcard-name">{p.name}</div>
              <div className="pcard-desc">{p.desc}</div>
              <div className="pcard-quote">"{p.quote}"</div>
              <a className="pcard-link" href="#" style={{ color: p.color }}>{p.link} →</a>
            </div>
          ))}
          <div className="product-card featured">
            <div className="pcard-icon" style={{ background: "rgba(255,255,255,.22)" }}>
              <I.Cmd/>
            </div>
            <div className="pcard-name">Zoiko Spend</div>
            <div className="pcard-desc">Compare products side by side and see how they connect into one platform.</div>
            <div style={{ flexGrow: 1 }} />
            <a className="pcard-link" href="#">Explore Zoiko Spend →</a>
          </div>
        </div>
      </section>

      {/* 6 — HOW CUSTOMERS BUY */}
      <section className="section">
        <p className="eyebrow-orange">START WITH ONE PRODUCT. ADD CONNECTED WORKFLOWS WHEN YOU'RE READY.</p>
        <h2 className="section-title">How customers buy and grow.</h2>
        <p className="section-sub">
          Customers do not need to buy the full platform on day one. Begin with the
          product that solves the immediate problem, then expand when workflows
          naturally connect.
        </p>
        <div className="buy-grid">
          {buyTiers.map((t) => (
            <div className={`buy-card${t.popular ? " popular" : ""}`} key={t.title}>
              {t.popular && <span className="popular-badge">MOST POPULAR</span>}
              <div className={`buy-num ${t.cls}`}>{t.num}</div>
              <div className="buy-title">{t.title}</div>
              <div className="buy-sub">{t.sub}</div>
              <ul className="buy-list">
                {t.items.map((it) => (
                  <li key={it}><span className="buy-check">✓</span>{it}</li>
                ))}
              </ul>
              {t.btnType === "outline" && <button className="btn-outline" style={{ width: "100%", justifyContent: "center" }}>{t.btn}</button>}
              {t.btnType === "primary" && <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }}>{t.btn}</button>}
              {t.btnType === "dark" && <button className="btn-dark" style={{ width: "100%", justifyContent: "center" }}>{t.btn}</button>}
            </div>
          ))}
        </div>
        <p className="buy-tagline">Start with one. Connect more. Scale to enterprise.</p>
      </section>

      {/* 7 — GLOBAL READINESS (dark) */}
      <section className="section section-dark">
        <p className="eyebrow-orange">BUILT FOR GLOBAL OPERATIONS</p>
        <h2 className="section-title section-title-white">A global SaaS offering with jurisdiction-agnostic architecture.</h2>
        <p className="section-sub section-sub-white">
          Designed to support organizations across markets, entities, teams, currencies,
          project models and compliance environments — without being locked into one
          country's operating assumptions.
        </p>
        <div className="global-grid">
          {globalCards.map((g) => (
            <div className="global-card" key={g.title}>
              <div className="global-icon">{g.icon}</div>
              <div className="global-title">{g.title}</div>
              <div className="global-desc">{g.desc}</div>
            </div>
          ))}
        </div>
        <div className="cta-btns">
          <button className="btn-primary">Explore Global Readiness &nbsp;→</button>
          <button className="btn-ghost">Contact Sales</button>
        </div>
      </section>

      {/* 8 — TRUST CENTER */}
      <section className="section">
        <p className="eyebrow-blue">TRUST MUST BE VISIBLE BEFORE THE BUYER ASKS FOR IT</p>
        <h2 className="section-title">Trust, security and governance.</h2>
        <p className="section-sub">
          Zoiko One handles sensitive workflows across HR, time, payroll, billing,
          projects, compliance and intelligence. The Trust Center gives buyers a clear
          path to security, privacy, compliance, status, legal and procurement resources.
        </p>
        <div className="trust-grid">
          {trustCards.map((t) => (
            <div className={`trust-card${t.featured ? " featured" : ""}`} key={t.title}>
              <div className="trust-icon">{t.icon}</div>
              <div className="trust-title">{t.title}</div>
              {t.quote && <div className="trust-quote">"{t.quote}"</div>}
              <div className="trust-desc">{t.desc}</div>
              {t.featured ? (
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }}>{t.cta}</button>
              ) : (
                <a className="trust-link" href="#">{t.link} →</a>
              )}
            </div>
          ))}
        </div>
        <p className="trust-footnote">Trust Center is published before advertising campaigns — every public claim is substantiated.</p>
      </section>

      {/* 9 — BUSINESS CLOUD */}
      <section className="section section-alt">
        <p className="cloud-label">ZOIKO ONE RUNS BUSINESS OPERATIONS. THE ZOIKO BUSINESS CLOUD EXTENDS THE OPERATING ENVIRONMENT.</p>
        <h2 className="section-title">Part of the Zoiko Business Cloud.</h2>
        <p className="section-sub">
          A connected family of platforms that help organizations communicate, grow,
          digitize, get paid and maintain financial truth. Zoiko One stays the hero;
          adjacent and infrastructure platforms add context.
        </p>
        <p className="cloud-label">ADJACENT STANDALONE PLATFORMS</p>
        <div className="cloud-grid">
          {cloudAdjacent.map((c) => (
            <div className="cloud-card" key={c.name}>
              <div className="cloud-tag">{c.tag}</div>
              <div className="cloud-name">{c.name}</div>
              <div className="cloud-desc">{c.desc}</div>
              <a className="cloud-link" href="#">{c.link} →</a>
            </div>
          ))}
        </div>

        <p className="cloud-label">THE OPERATIONS PLATFORM</p>
        <div className="hero-pill-banner">
          <div className="hpb-icon"><I.Cmd/></div>
          <div>
            <div className="hpb-label">BUSINESS OPERATIONS · THE HERO</div>
            <div className="hpb-title">Zoiko One</div>
            <div className="hpb-desc">The connected platform for people, time, payroll, billing, projects, compliance and insights.</div>
          </div>
        </div>

        <p className="cloud-label">INFRASTRUCTURE BENEATH ZOIKO ONE</p>
        <div className="infra-grid" style={{ marginBottom: 32 }}>
          {infraCards.map((c) => (
            <div className="infra-card" key={c.name}>
              <div className="infra-tag">{c.tag}</div>
              <div className="infra-name">{c.name}</div>
              <div className="infra-desc">{c.desc}</div>
              <a className="infra-link" href="#">{c.link} →</a>
            </div>
          ))}
        </div>
        <div className="center-btn">
          <button className="btn-outline">Explore the Zoiko Business Cloud</button>
        </div>
      </section>

      {/* 10 — COMPARISON TABLE */}
      <section className="section">
        <p className="eyebrow-orange">THE DIFFERENCE IS CONNECTED EXECUTION WITHOUT FORCED COMPLEXITY</p>
        <h2 className="section-title">What makes Zoiko One different.</h2>
        <p className="section-sub">
          Traditional stacks force a choice between disconnected point tools and heavy
          suites. Zoiko One is built around modular adoption, shared layers, connected
          workflows, trust infrastructure and global readiness.
        </p>
        <div className="compare-wrap">
          <div className="compare-head">
            <div className="ch-left">Traditional stack</div>
            <div className="ch-right">Zoiko One</div>
          </div>
          {compareRows.map((r, i) => (
            <div className="compare-row" key={i}>
              <div className="cr-left">{r.left}</div>
              <div className="cr-right"><span className="cr-check">✓</span>{r.right}</div>
            </div>
          ))}
        </div>
        <div className="cta-btns" style={{ marginTop: 30 }}>
          <button className="btn-outline">Compare Products</button>
          <button className="btn-primary">Get a Demo &nbsp;→</button>
        </div>
      </section>

      {/* 11 — WHO IT'S FOR */}
      <section className="section section-alt">
        <p className="eyebrow-blue">BUILT FOR THE TEAMS THAT RUN THE BUSINESS</p>
        <h2 className="section-title">Who Zoiko One is for.</h2>
        <div className="who-grid">
          {whoFor.map((w) => (
            <div className="who-card" key={w.title}>
              <div className="who-icon">{w.icon}</div>
              <div className="who-title">{w.title}</div>
              <div className="who-desc">{w.desc}</div>
              <span className="who-chip">{w.chip}</span>
            </div>
          ))}
        </div>
        <div className="cta-btns">
          <button className="btn-outline">Find Your Solution</button>
          <button className="btn-dark">Get a Demo</button>
        </div>
      </section>

      {/* 12 — PHILOSOPHY */}
      <section className="section">
        <p className="eyebrow-orange">MODULAR ENOUGH TO START. CONNECTED ENOUGH TO MATTER. GOVERNED ENOUGH TO TRUST.</p>
        <h2 className="section-title">Our operating philosophy.</h2>
        <p className="section-sub">
          Essential business workflows should be easy to adopt, connected where work
          naturally moves, and governed wherever money, people, clients, obligations or
          executive decisions are involved.
        </p>
        <div className="philosophy-grid">
          {philosophy.map((p) => (
            <div className="phil-card" key={p.num}>
              <div className="phil-num">{p.num}</div>
              <div className="phil-title">{p.title}</div>
              <div className="phil-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 13 — FAQ */}
      <section className="section section-alt">
        <p className="eyebrow-purple">QUESTIONS BUYERS ASK BEFORE THEY TRUST ZOIKO ONE</p>
        <h2 className="section-title">Frequently asked questions.</h2>
        <div className="faq-list" style={{ marginTop: 36 }}>
          {faqs.map((f, i) => (
            <div className="faq-item" key={f.q}>
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <span className={`faq-chevron${openFaq === i ? " open" : ""}`}>&#8964;</span>
              </button>
              {openFaq === i && <div className="faq-answer">{f.a}</div>}
            </div>
          ))}
        </div>
        <div className="cta-btns">
          <button className="btn-primary">Get a Demo &nbsp;→</button>
          <button className="btn-outline">Visit Trust Center</button>
        </div>
      </section>

      {/* 14 — FINAL CTA */}
      <section className="cta-section">
        <div className="cta-inner">
          <p className="cta-eyebrow">READY TO SEE ZOIKO ONE IN ACTION?</p>
          <h2>Start with one product. Connect the business. Scale with Zoiko One.</h2>
          <p>
            Start with one product, connect the workflows that matter, or build a
            complete enterprise platform — with global reach and the confidence to scale.
          </p>
          <div className="cta-btns">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-ghost">Explore Products</button>
            <button className="btn-ghost">View Pricing</button>
          </div>
          <p className="cta-footnote">No pressure, no lock-in. See Zoiko One mapped to your operations.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
