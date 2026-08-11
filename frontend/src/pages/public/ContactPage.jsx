import { useState, useEffect } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

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
  .badge-pill-blue {
    background: #2536c9; color: #fff; font-size: 12px; font-weight: 700;
    padding: 3px 13px; border-radius: 999px;
  }

  .hero-inner {
    position: relative; z-index: 1; max-width: 1200px; width: 100%;
  }

  .hero h1 {
    font-family: 'Poppins', sans-serif; font-weight: 600; font-style: normal;
    font-size: 46px; line-height: 66.96px; letter-spacing: -1.55px;
    color: #0B1C3F; margin: 0 auto 20px; text-align: center;
    max-width: 760px;
  }
  .hero h1 .accent { color: #f97316; }

  .hero-sub {
    font-size: 15.5px; color: #55577a; max-width: 660px; margin: 0 auto 38px; line-height: 1.7;
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
    padding: 13px 26px; font-size: 14.5px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: background .2s;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.25); }

  /* ── CONTACT PATHWAYS ── */
  .pathways { padding: 80px 52px; background: #fff; text-align: center; }

  .eyebrow-purple {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 16px;
  }

  .section-title {
    font-size: 32px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.6px; margin-bottom: 40px; line-height: 1.2;
  }

  .pathway-grid {
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 20px; max-width: 1000px; margin: 0 auto; text-align: left;
  }
  .pathway-card {
    background: #fff; border: 1px solid #e6e6f2; border-radius: 18px; padding: 26px 24px;
  }
  .pw-icon {
    width: 42px; height: 42px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  }
  .bg-orange     { background: #f97316; }
  .bg-blue       { background: #2563eb; }
  .bg-purple     { background: #5b5bd6; }
  .bg-sky        { background: #38bdf8; }
  .bg-dark-purple{ background: #3b2d99; }
  .bg-shield     { background: #4338ca; }
  .bg-gray       { background: #9ca3af; }

  .pw-title { font-size: 16px; font-weight: 700; color: #1a1a3e; margin-bottom: 6px; }
  .pw-desc  { font-size: 13.5px; color: #777799; line-height: 1.5; margin-bottom: 14px; }
  .pw-link {
    font-size: 13.5px; font-weight: 700; color: #5b5bd6;
    text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
  }
  .pw-link:hover { text-decoration: underline; }

  /* ── COMMERCIAL INQUIRY FORM ── */
  .form-section { padding: 80px 52px; background: #f7f7fd; }
  .form-inner {
    display: grid; grid-template-columns: 1fr 1.1fr;
    gap: 50px; max-width: 1080px; margin: 0 auto; align-items: start;
  }
  .form-left { text-align: left; }
  .form-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #5b5bd6; margin-bottom: 16px;
  }
  .form-title {
    font-size: 28px; font-weight: 800; color: #1a1a3e;
    letter-spacing: -.5px; margin-bottom: 16px;
  }
  .form-desc { font-size: 14.5px; color: #555577; line-height: 1.6; margin-bottom: 24px; }

  .form-note {
    background: #ececf8; border-radius: 14px; padding: 18px 20px;
    font-size: 13px; color: #555577; line-height: 1.6;
  }

  .form-card {
    background: #fff; border-radius: 22px; padding: 36px;
    box-shadow: 0 4px 28px rgba(30,20,80,.08);
  }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
  .form-field { display: flex; flex-direction: column; gap: 7px; }
  .form-field label { font-size: 13.5px; font-weight: 700; color: #1a1a3e; }
  .form-field label .req { color: #f97316; }
  .form-field input, .form-field textarea {
    border: 1px solid #e0e0ee; border-radius: 10px; padding: 11px 14px;
    font-size: 14px; font-family: 'Inter', sans-serif; color: #1a1a3e;
    outline: none; transition: border-color .2s;
  }
  .form-field input:focus, .form-field textarea:focus { border-color: #5b5bd6; }
  .form-field input::placeholder, .form-field textarea::placeholder { color: #aaa; }
  .form-field textarea { resize: vertical; min-height: 90px; font-family: 'Inter', sans-serif; }

  .about-label { font-size: 13.5px; font-weight: 700; color: #1a1a3e; margin-bottom: 10px; display: block; }
  .about-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .chip {
    background: #f4f4fa; border: 1px solid #e0e0ee; border-radius: 999px;
    padding: 8px 18px; font-size: 13.5px; font-weight: 600; color: #1a1a3e;
    cursor: pointer; transition: all .15s; font-family: 'Inter', sans-serif;
  }
  .chip.selected { background: #5b5bd6; border-color: #5b5bd6; color: #fff; }

  .btn-submit {
    background: linear-gradient(90deg,#f97316,#fb923c);
    color: #fff; border: none; border-radius: 999px;
    padding: 16px 30px; font-size: 15px; font-weight: 700; cursor: pointer;
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    font-family: 'Inter', sans-serif; transition: opacity .2s; margin-top: 6px;
  }
  .btn-submit:hover { opacity: .92; }

  .form-disclaimer {
    font-size: 11.5px; color: #999; margin-top: 14px; line-height: 1.5; text-align: center;
  }
  .form-disclaimer a { color: #5b5bd6; text-decoration: none; }

  /* ── CTA BANNER ── */
  .cta-section { padding: 60px 52px 80px; background: #fff; }
  .cta-inner {
    background: linear-gradient(120deg, #4f1fb0 0%, #5b5bd6 45%, #3b82f6 100%);
    border-radius: 28px; padding: 52px 52px; text-align: center;
    max-width: 1100px; margin: 0 auto;
  }
  .cta-inner h2 {
    font-size: 30px; font-weight: 800; color: #fff;
    margin-bottom: 12px; letter-spacing: -.5px;
  }
  .cta-inner p { font-size: 15px; color: rgba(255,255,255,.78); margin-bottom: 28px; }
  .cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  @media (max-width: 820px) {
    .hero h1 { font-size: 26px; }
    .section-title { font-size: 22px; }
    .pathway-grid { grid-template-columns: 1fr; }
    .form-inner { grid-template-columns: 1fr; }
    .form-row { grid-template-columns: 1fr; }
    .hero, .pathways, .form-section, .cta-section { padding-left: 20px; padding-right: 20px; }
  }
`;

/* ── SVG Icons ── */
const IconPlay = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7L8 5z" fill="white"/></svg>
);
const IconDollar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" fillOpacity=".15"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="Inter,sans-serif">$</text>
  </svg>
);
const IconBriefcase = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="18" height="11" rx="2" fill="white" fillOpacity=".9"/>
    <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke="white" strokeWidth="2" fill="none"/>
  </svg>
);
const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 5h16v10H8l-4 4V5z" fill="white" fillOpacity=".9"/>
  </svg>
);
const IconPartners = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity=".9"/>
    <rect x="13" y="4" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="4" y="13" width="7" height="7" rx="1.5" fill="white" fillOpacity=".5"/>
    <rect x="13" y="13" width="7" height="7" rx="1.5" fill="white" fillOpacity=".3"/>
  </svg>
);
const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="white" fillOpacity=".9"/>
  </svg>
);
const IconImage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity=".9"/>
    <circle cx="9" cy="11" r="1.6" fill="#f97316"/>
    <path d="M3 17l5-5 4 4 4-3 5 4" stroke="#f97316" strokeWidth="1.5" fill="none"/>
  </svg>
);
const IconPeople = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="9" r="3" fill="white" fillOpacity=".9"/>
    <circle cx="16" cy="9" r="3" fill="white" fillOpacity=".5"/>
    <path d="M3 19c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
);
const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity=".9"/>
    <path d="M3 6l9 7 9-7" stroke="#6b7280" strokeWidth="1.5" fill="none"/>
  </svg>
);

const pathways = [
  { icon: <IconPlay/>,      bg: "bg-orange",      title: "Demo",        desc: "See Zoiko One tailored to your business.", link: "Get a Demo" },
  { icon: <IconDollar/>,    bg: "bg-blue",        title: "Pricing",     desc: "Find your pricing path and request a quote.", link: "Request Pricing" },
  { icon: <IconBriefcase/>, bg: "bg-purple",      title: "Sales",       desc: "Talk to sales about scope and rollout.", link: "Contact Sales" },
  { icon: <IconChat/>,      bg: "bg-sky",         title: "Support",     desc: "Sign in for account-specific help.", link: "Go to Support" },
  { icon: <IconPartners/>,  bg: "bg-dark-purple", title: "Partnerships",desc: "Explore partner and integration opportunities.", link: "Partner with us" },
  { icon: <IconShield/>,    bg: "bg-shield",      title: "Security",    desc: "Reach the security and trust team.", link: "Contact Security" },
  { icon: <IconImage/>,     bg: "bg-orange",      title: "Media",       desc: "Press and media inquiries.", link: "Media inquiry" },
  { icon: <IconPeople/>,    bg: "bg-purple",      title: "Careers",     desc: "Roles and talent community.", link: "View Careers" },
  { icon: <IconMail/>,      bg: "bg-gray",        title: "General",     desc: "Any other business inquiry.", link: "Get in touch" },
];

const aboutOptions = ["Demo", "Pricing", "Sales", "Partnerships", "General", "Media"];

export default function ZoikoContact() {
  useEffect(() => { window.scrollTo(0,0); }, []);

  const [selected, setSelected] = useState("Demo");
  const [form, setForm] = useState({ email: "", company: "", name: "", country: "", message: "" });

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Inquiry submitted (demo only — no backend connected).");
  };

  return (
    <div>
      <style>{styles}</style>
      <LandingHeader />

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-pill-blue">Company</span>
          Contact
        </div>
        <div className="hero-inner">
          <h1>
            Talk to the right team at <span className="accent">Zoiko One.</span>
          </h1>
          <p className="hero-sub">
            Reach the right team for demos, pricing, sales, support routing, partnerships,
            security, media, careers and general business inquiries.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary">Get a Demo &nbsp;→</button>
            <button className="btn-outline">Contact Sales</button>
          </div>
        </div>
      </section>

      {/* ── CONTACT PATHWAYS ── */}
      <section className="pathways">
        <p className="eyebrow-purple">CONTACT PATHWAYS</p>
        <h2 className="section-title">Pick the route that fits.</h2>
        <div className="pathway-grid">
          {pathways.map((p) => (
            <div className="pathway-card" key={p.title}>
              <div className={`pw-icon ${p.bg}`}>{p.icon}</div>
              <div className="pw-title">{p.title}</div>
              <div className="pw-desc">{p.desc}</div>
              <a className="pw-link" href="#">{p.link} →</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMMERCIAL INQUIRY FORM ── */}
      <section className="form-section">
        <div className="form-inner">
          <div className="form-left">
            <p className="form-eyebrow">COMMERCIAL INQUIRY</p>
            <h2 className="form-title">Send us a message.</h2>
            <p className="form-desc">
              For demos, pricing and sales, this reaches the right team and routes based on what
              you select.
            </p>
            <div className="form-note">
              For account-specific support, sign in to your workspace or use the approved support
              pathway. Do not submit sensitive account, payroll, employee, customer, supplier,
              payment or security secrets through public forms.
            </div>
          </div>

          <form className="form-card" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-field">
                <label>Work email <span className="req">*</span></label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={handleChange("email")}
                  required
                />
              </div>
              <div className="form-field">
                <label>Company <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="Company"
                  value={form.company}
                  onChange={handleChange("company")}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Full name <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={handleChange("name")}
                  required
                />
              </div>
              <div className="form-field">
                <label>Country / region</label>
                <input
                  type="text"
                  placeholder="Country"
                  value={form.country}
                  onChange={handleChange("country")}
                />
              </div>
            </div>

            <span className="about-label">What's this about?</span>
            <div className="about-chips">
              {aboutOptions.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  className={`chip${selected === opt ? " selected" : ""}`}
                  onClick={() => setSelected(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div className="form-field" style={{ marginBottom: 18 }}>
              <label>Message</label>
              <textarea
                placeholder="How can we help?"
                value={form.message}
                onChange={handleChange("message")}
              />
            </div>

            <button type="submit" className="btn-submit">Submit Inquiry &nbsp;→</button>
            <p className="form-disclaimer">
              By submitting, you agree Zoiko One may contact you about your request, handled per
              our <a href="#">Privacy Policy</a>.
            </p>
          </form>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2>The fastest way to see Zoiko One.</h2>
          <p>Book a tailored demo, or request pricing for your scope.</p>
          <div className="cta-btns">
            <button className="btn-primary">Get a Demo</button>
            <button className="btn-ghost">Request Pricing</button>
            <button className="btn-ghost">Sign In for Support</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
