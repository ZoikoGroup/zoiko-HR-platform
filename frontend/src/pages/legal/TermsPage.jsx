import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";
import { TERMS_SECTIONS, TERMS_LAST_UPDATED, TERMS_CONTACT_EMAIL, TERMS_CONTACT_URL } from "./termsContent";

const css = `
  .terms-wrap { max-width: 1080px; margin: 0 auto; padding: 48px 24px 72px; display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 48px; }
  .terms-toc { position: sticky; top: 24px; align-self: start; font-size: 13px; }
  .terms-toc h2 { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B7280; margin: 0 0 10px; font-weight: 700; }
  .terms-toc ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .terms-toc a { display: block; padding: 6px 10px; border-radius: 8px; color: #374151; text-decoration: none; line-height: 1.35; }
  .terms-toc a:hover, .terms-toc a:focus-visible { background: #EFF6FF; color: #1D4ED8; outline: none; }
  .terms-article h1 { font-size: 32px; letter-spacing: -0.5px; color: #0F172A; margin: 0 0 8px; font-weight: 800; }
  .terms-meta { font-size: 13px; color: #6B7280; margin: 0 0 24px; }
  .terms-intro { background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px 18px; font-size: 14px; line-height: 1.65; color: #374151; margin-bottom: 32px; }
  .terms-section { scroll-margin-top: 24px; margin-bottom: 30px; }
  .terms-section h2 { font-size: 19px; color: #0F172A; margin: 0 0 10px; font-weight: 700; }
  .terms-section p { font-size: 15px; line-height: 1.75; color: #374151; margin: 0 0 12px; }
  .terms-section ul { margin: 0 0 12px; padding-left: 22px; color: #374151; font-size: 15px; line-height: 1.75; }
  .terms-section li { margin-bottom: 6px; }
  .terms-contact { border-top: 1px solid #E5E7EB; padding-top: 22px; font-size: 14px; color: #374151; line-height: 1.7; }
  .terms-contact a { color: #2563EB; font-weight: 600; text-decoration: none; }
  .terms-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }
  .terms-btn { display: inline-block; padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; border: 1.5px solid #2563EB; }
  .terms-btn.primary { background: #2563EB; color: #fff; }
  .terms-btn.ghost { background: #fff; color: #2563EB; }
  @media (max-width: 860px) {
    .terms-wrap { grid-template-columns: minmax(0, 1fr); gap: 24px; padding: 28px 16px 56px; }
    .terms-toc { position: static; }
    .terms-toc ol { flex-direction: row; flex-wrap: wrap; gap: 4px 6px; }
    .terms-toc a { padding: 5px 9px; background: #F3F4F6; }
  }
  @media print {
    .terms-toc, .terms-actions, header, footer { display: none !important; }
    .terms-wrap { display: block; padding: 0; }
  }
`;

/**
 * Terms & Conditions of Zoiko HR. Public (no sign-in needed): it is opened from the registration page, in a new tab so
 * the half-filled form is not lost.
 */
export default function TermsPage() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = "Terms & Conditions | Zoiko HR";
  }, []);

  // a link such as /terms#liability scrolls to that section (the router does not do this on its own)
  useEffect(() => {
    if (!hash) { window.scrollTo?.(0, 0); return; }
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el?.scrollIntoView) el.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#ffffff" }}>
      <style>{css}</style>
      <LandingHeader />
      <main style={{ flex: 1 }}>
        <div className="terms-wrap">
          <nav className="terms-toc" aria-label="Contents">
            <h2>Contents</h2>
            <ol>
              {TERMS_SECTIONS.map((s) => (
                <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
              ))}
            </ol>
          </nav>

          <article className="terms-article">
            <h1>Terms &amp; Conditions</h1>
            <p className="terms-meta">Zoiko HR &middot; Last updated {TERMS_LAST_UPDATED}</p>
            <div className="terms-intro">
              Please read these Terms carefully. They explain what you can expect from Zoiko HR and what we expect from you. By registering an
              organization or using the Service you agree to them.
            </div>

            {TERMS_SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="terms-section" aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.title}</h2>
                {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                {s.bullets && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              </section>
            ))}

            <div className="terms-contact">
              Questions about these Terms? Write to <a href={`mailto:${TERMS_CONTACT_EMAIL}`}>{TERMS_CONTACT_EMAIL}</a> or use our{" "}
              <a href={TERMS_CONTACT_URL} target="_blank" rel="noopener noreferrer">contact page</a>.
            </div>

            <div className="terms-actions">
              <Link to="/register" className="terms-btn primary">Back to registration</Link>
              <Link to="/login" className="terms-btn ghost">Sign in</Link>
              <button type="button" onClick={() => window.print()} className="terms-btn ghost" style={{ cursor: "pointer" }}>Print</button>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
