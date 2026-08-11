import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const BG = "#EDEEF2";
const BLUE_DARK = "#192660";
const BLUE_ACCENT = "#2040CC";
const ORANGE = "#E87E2B";
const TEXT_MID = "#374151";
const TEXT_MUTED = "#6B7280";

const eyebrowStyle = {
  fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em",
  textTransform: "uppercase", color: BLUE_ACCENT, margin: "0 0 14px 0",
};
const h2Style = {
  fontSize: "clamp(28px, 4vw, 44px)", fontWeight: "800",
  color: BLUE_DARK, lineHeight: "1.15", margin: "0 0 16px 0", letterSpacing: "-0.5px",
};
const sectionWrap = {
  padding: "80px 5vw", background: BG, fontFamily: "'Inter', -apple-system, sans-serif",
};
const pillTag = (color = BLUE_ACCENT) => ({
  display: "inline-block", padding: "3px 10px", borderRadius: "20px",
  background: "rgba(32,64,204,0.08)", color: color,
  fontSize: "11px", fontWeight: "600", border: `1px solid rgba(32,64,204,0.2)`,
});
const card = {
  background: "white", borderRadius: "16px", border: "1px solid #E5E7EB",
  padding: "24px", display: "flex", flexDirection: "column", gap: "12px",
};

function Badge({ label, tag = "Solutions" }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <span style={{ background: "#3B5BDB", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{tag}</span>
      <span style={{ color: "#555" }}>{label}</span>
    </div>
  );
}

function HeroSection() {
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
        <Badge label="Find your fit by business, team or challenge" />
        <h1 style={{
          fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
          color: "#0B1C3F", margin: "0 0 20px",
        }}>
          Find the Zoiko One setup<br />
          that fits <span style={{ color: "#E8850A" }}>your business.</span>
        </h1>
        <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#4B5563", margin: "0 0 12px" }}>
          Route by business type, team, challenge or growth stage — then start with one product, one workflow, one pillar or the full platform.
        </p>
        <p style={{ fontSize: "13px", color: "#4B5563", marginBottom: "28px", fontStyle: "italic" }}>
          Start with one product, activate a pillar or scale into the full platform.
        </p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{
            background: "linear-gradient(135deg, #E07B2A, #c9651a)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>Find Your Solution →</button>
          <button onClick={() => navigate("/get-demo")} style={{
            background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
            border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}>Get a Demo</button>
        </div>
      </div>
    </section>
  );
}

const bizTypes = [
  {
    emoji: "🧩", color: "#3B5BDB",
    title: "Services Businesses",
    tags: ["People", "Money", "Work", "Control"],
    desc: "Run service delivery, people, time, projects, billing, documents and reporting through one connected platform.",
  },
  {
    emoji: "🎯", color: "#E87E2B",
    title: "Agencies",
    tags: ["Time", "Projects", "Billing", "Docs Pro"],
    desc: "Connect client work, resources, time, budgets, approvals, billing, documents and margins.",
  },
  {
    emoji: "🛍️", color: "#7C3AED",
    title: "Retail Businesses",
    tags: ["HR", "Time", "Spend", "Inventory"],
    desc: "Manage staff, schedules, stock, purchases, vendors, documents and reporting across locations.",
  },
  {
    emoji: "🔧", color: "#2563EB",
    title: "Trades & Field Services",
    tags: ["Time", "Projects", "Inventory", "Billing"],
    desc: "Track teams, jobs, time, materials, inventory, spend, billing and operational evidence.",
  },
];

function ByBusinessType() {
  return (
    <section style={{ ...sectionWrap, paddingTop: "60px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={eyebrowStyle}>BY BUSINESS TYPE</p>
        <h2 style={h2Style}>Workflows built for how you operate.</h2>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px",
      }}>
        {bizTypes.map(({ emoji, color, title, tags, desc }) => (
          <div key={title} style={card}>
            <div style={{
              width: "52px", height: "52px", borderRadius: "14px",
              background: color, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "24px",
            }}>{emoji}</div>
            <h3 style={{ fontSize: "17px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {tags.map(t => <span key={t} style={pillTag()}>{t}</span>)}
            </div>
            <p style={{ fontSize: "13px", color: TEXT_MID, lineHeight: "1.6", margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const byTeam = [
  {
    title: "Founders & CEOs",
    desc: "Business-wide visibility across workforce, billing, spend, projects, inventory and performance.",
    link: "Explore Executive Visibility →",
  },
  {
    title: "Finance Teams",
    desc: "Control revenue, spend, payroll inputs, approvals, expenses and payment preparation.",
    link: "Explore Finance Operations →",
  },
  {
    title: "HR & People Teams",
    desc: "Clean employee data, onboarding, time, attendance and payroll-ready information.",
    link: "Explore People Operations →",
  },
  {
    title: "Operations Teams",
    desc: "Execute work across teams, projects, stock, suppliers, approvals and documents.",
    link: "Explore Operations Workflows →",
  },
];

const byChallenge = [
  {
    title: "Disconnected tools",
    desc: "Unify scattered HR, payroll, billing, spend, project, inventory and document workflows.",
    link: "Solve Tool Fragmentation →",
  },
  {
    title: "Slow approvals",
    desc: "Replace email and spreadsheet approvals with structured routing and decision trails.",
    link: "Speed Up Approvals →",
  },
  {
    title: "Weak visibility",
    desc: "Show what is pending, overdue, blocked, out of policy or at risk.",
    link: "Improve Visibility →",
  },
  {
    title: "Spend & vendor control",
    desc: "Control requests, POs, supplier invoices, approvals and vendor evidence.",
    link: "Control Spend →",
  },
];

function ByTeamChallenge() {
  return (
    <section style={{ ...sectionWrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={{ ...eyebrowStyle, color: ORANGE }}>BY TEAM &amp; BY CHALLENGE</p>
        <h2 style={h2Style}>Route to the outcome you need.</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: BLUE_ACCENT, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "16px",
            }}>👥</div>
            <span style={{ fontSize: "18px", fontWeight: "800", color: BLUE_DARK }}>By Team</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {byTeam.map(({ title, desc, link }) => (
              <div key={title} style={{
                background: "white", borderRadius: "12px",
                border: "1px solid #E5E7EB", padding: "20px",
              }}>
                <h4 style={{ fontSize: "15px", fontWeight: "700", color: BLUE_DARK, margin: "0 0 6px 0" }}>{title}</h4>
                <p style={{ fontSize: "13px", color: TEXT_MID, margin: "0 0 10px 0", lineHeight: "1.6" }}>{desc}</p>
                <a href="#" style={{ fontSize: "13px", fontWeight: "600", color: BLUE_ACCENT, textDecoration: "none" }}>{link}</a>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: ORANGE, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "16px",
            }}>▶</div>
            <span style={{ fontSize: "18px", fontWeight: "800", color: BLUE_DARK }}>By Challenge</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {byChallenge.map(({ title, desc, link }) => (
              <div key={title} style={{
                background: "white", borderRadius: "12px",
                border: "1px solid #E5E7EB", padding: "20px",
              }}>
                <h4 style={{ fontSize: "15px", fontWeight: "700", color: BLUE_DARK, margin: "0 0 6px 0" }}>{title}</h4>
                <p style={{ fontSize: "13px", color: TEXT_MID, margin: "0 0 10px 0", lineHeight: "1.6" }}>{desc}</p>
                <a href="#" style={{ fontSize: "13px", fontWeight: "600", color: BLUE_ACCENT, textDecoration: "none" }}>{link}</a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const builderSteps = [
  {
    question: "What type of business do you run?",
    options: ["Services / Consulting", "Agency / Client work", "Retail / Hospitality", "E-commerce / Product"],
  },
  {
    question: "What's your biggest operational pain?",
    options: ["Disconnected tools", "Slow approvals", "No visibility", "Spend control"],
  },
  {
    question: "How many people are in your team?",
    options: ["1–10", "11–50", "51–200", "200+"],
  },
];

function GuidedBuilder() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);

  const current = builderSteps[step];
  const progress = ((step) / builderSteps.length) * 100;

  function pick(option) {
    const next = [...answers];
    next[step] = option;
    setAnswers(next);
    if (step < builderSteps.length - 1) setStep(step + 1);
  }

  return (
    <section style={{ ...sectionWrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={eyebrowStyle}>GUIDED SOLUTION BUILDER</p>
        <h2 style={h2Style}>Build your Zoiko One path in<br />under a minute.</h2>
        <p style={{ fontSize: "15px", color: TEXT_MID, maxWidth: "480px", margin: "0 auto", lineHeight: "1.7" }}>
          Answer a few questions and we'll recommend your best starting product, pillar and connected workflow.
        </p>
      </div>

      <div style={{
        maxWidth: "680px", margin: "0 auto",
        background: "white", borderRadius: "20px",
        border: "1px solid #E5E7EB", padding: "32px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ height: "4px", background: "#E5E7EB", borderRadius: "4px", marginBottom: "28px" }}>
          <div style={{
            height: "4px", borderRadius: "4px",
            background: ORANGE, width: `${progress}%`,
            transition: "width 0.4s ease",
          }} />
        </div>

        {step < builderSteps.length ? (
          <>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: BLUE_DARK, margin: "0 0 20px 0" }}>
              {current.question}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {current.options.map(opt => (
                <button key={opt} onClick={() => pick(opt)}
                  style={{
                    padding: "16px 18px", borderRadius: "10px", textAlign: "left",
                    border: answers[step] === opt
                      ? `2px solid ${BLUE_ACCENT}` : "1.5px solid #E5E7EB",
                    background: answers[step] === opt ? "rgba(32,64,204,0.05)" : "white",
                    fontSize: "14px", fontWeight: "600", color: BLUE_DARK,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}>
                  {opt}
                </button>
              ))}
            </div>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}
                style={{
                  marginTop: "20px", background: "none", border: "none",
                  color: TEXT_MUTED, fontSize: "13px", cursor: "pointer",
                  fontFamily: "inherit",
                }}>← Back</button>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>✅</div>
            <h3 style={{ fontSize: "20px", fontWeight: "700", color: BLUE_DARK, margin: "0 0 8px 0" }}>
              Your path is ready!
            </h3>
            <p style={{ color: TEXT_MID, fontSize: "14px", marginBottom: "24px" }}>
              Based on your answers, we recommend starting with <strong>People Operations + Finance Control.</strong>
            </p>
            <button onClick={() => { setStep(0); setAnswers([]); }}
              style={{
                padding: "12px 24px", borderRadius: "50px", border: "none",
                background: ORANGE, color: "white", fontSize: "14px",
                fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
              }}>Start Over</button>
          </div>
        )}
      </div>
    </section>
  );
}

const bundles = [
  {
    eyebrow: "PEOPLE", title: "People Operations",
    tags: ["HR", "Time", "Payroll"],
    desc: "Workforce data, time, attendance, payroll readiness and people-operations control.",
    cta: "Explore People Ops",
  },
  {
    eyebrow: "MONEY", title: "Finance Control",
    tags: ["Billing", "Spend", "Payroll", "Insights"],
    desc: "Billing, spend, payroll workflows, approvals and financial visibility.",
    cta: "Explore Finance Control",
  },
  {
    eyebrow: "WORK", title: "Project-to-Cash",
    tags: ["Projects", "Time", "Billing", "Insights"],
    desc: "Client work, billable time, delivery, invoicing, margin and revenue ops.",
    cta: "Explore Project-to-Cash",
  },
  {
    eyebrow: "SUPPLY", title: "Spend-to-Stock",
    tags: ["Spend", "Inventory", "Comply", "Insights"],
    desc: "Purchase requests, POs, receiving, inventory movement and spend governance.",
    cta: "Explore Spend-to-Stock",
  },
  {
    eyebrow: "CONTROL", title: "Governance",
    tags: ["Comply", "Docs Pro", "Insights", "Approvals"],
    desc: "Compliance evidence, document workflows, approvals, audit trails and reporting.",
    cta: "Explore Governance",
  },
];

function OutcomeBundles() {
  return (
    <section style={{ ...sectionWrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={{ ...eyebrowStyle, color: ORANGE }}>OUTCOME BUNDLES</p>
        <h2 style={h2Style}>Commercial bundles built<br />around outcomes.</h2>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "20px",
      }}>
        {bundles.map(({ eyebrow, title, tags, desc, cta }) => (
          <div key={title} style={card}>
            <p style={{ ...eyebrowStyle, color: ORANGE, margin: 0 }}>{eyebrow}</p>
            <h3 style={{ fontSize: "20px", fontWeight: "800", color: BLUE_DARK, margin: 0 }}>{title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {tags.map(t => <span key={t} style={pillTag()}>{t}</span>)}
            </div>
            <p style={{ fontSize: "13px", color: TEXT_MID, lineHeight: "1.6", margin: 0, flex: 1 }}>{desc}</p>
            <button style={{
              marginTop: "4px", padding: "11px 18px", borderRadius: "50px",
              border: "1.5px solid #CBD5E1", background: "white",
              fontSize: "13px", fontWeight: "600", color: BLUE_DARK,
              cursor: "pointer", fontFamily: "inherit", textAlign: "center",
            }}>{cta}</button>
          </div>
        ))}

        <div style={{
          ...card,
          background: "linear-gradient(140deg, #2040CC 0%, #3B5BDB 60%, #1a85f5 100%)",
          border: "none",
        }}>
          <p style={{ ...eyebrowStyle, color: "rgba(255,255,255,0.7)", margin: 0 }}>FULL PLATFORM</p>
          <h3 style={{ fontSize: "22px", fontWeight: "800", color: "white", margin: 0 }}>The Connected Platform</h3>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", lineHeight: "1.6", margin: 0, flex: 1 }}>
            All five pillars on one governed spine, with enterprise governance and rollout support.
          </p>
          <button style={{
            marginTop: "8px", padding: "13px 24px", borderRadius: "50px",
            border: "none", background: ORANGE,
            fontSize: "14px", fontWeight: "700", color: "white",
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 4px 16px rgba(232,126,43,0.45)",
          }}>Talk to Sales</button>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  { q: "What businesses use Zoiko One?", a: "Zoiko One serves service businesses, agencies, retail operations, and trades & field services — any business that needs to connect people, money, work, supply and control in one platform." },
  { q: "Which product should I start with?", a: "Use the Guided Solution Builder above to get a personalised recommendation based on your business type, team, and biggest challenge." },
  { q: "Is it suitable for agencies and multi-entity businesses?", a: "Yes. Zoiko One supports multi-entity, multi-workspace setups with centralised governance and per-entity workflows." },
];

function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ ...sectionWrap, paddingTop: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={eyebrowStyle}>SOLUTIONS FAQS</p>
        <h2 style={h2Style}>Is Zoiko One right for my<br />business?</h2>
      </div>
      <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "12px" }}>
        {faqs.map(({ q, a }, i) => (
          <div key={i} style={{
            background: "white", borderRadius: "12px",
            border: "1px solid #E5E7EB", overflow: "hidden",
          }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", padding: "20px 24px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left",
              }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: BLUE_DARK }}>{q}</span>
              {open === i ? <ChevronUp size={18} color={TEXT_MUTED} /> : <ChevronDown size={18} color={TEXT_MUTED} />}
            </button>
            {open === i && (
              <div style={{ padding: "0 24px 20px", fontSize: "14px", color: TEXT_MID, lineHeight: "1.7" }}>
                {a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function BottomCTA() {
  const navigate = useNavigate();
  return (
    <section style={{ ...sectionWrap, paddingTop: "20px", paddingBottom: "80px" }}>
      <div style={{
        background: "linear-gradient(130deg, #2C3E9E 0%, #2040CC 40%, #1a6fd4 100%)",
        borderRadius: "24px", padding: "60px 48px",
        textAlign: "center",
        boxShadow: "0 12px 40px rgba(32,64,204,0.3)",
      }}>
        <h2 style={{
          fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: "800",
          color: "white", margin: "0 0 12px 0", letterSpacing: "-0.5px",
        }}>
          Find the setup that fits your business.
        </h2>
        <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 32px 0", lineHeight: "1.7" }}>
          Start with one product, one workflow, one department, one pillar<br />— or the full platform.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{
            padding: "14px 28px", borderRadius: "50px", border: "none",
            background: ORANGE, color: "white", fontSize: "15px",
            fontWeight: "700", cursor: "pointer",
            boxShadow: "0 6px 20px rgba(232,126,43,0.5)",
          }}>Find Your Solution</button>
          <button onClick={() => navigate("/get-demo")} style={{
            padding: "14px 28px", borderRadius: "50px",
            border: "1.5px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.1)",
            color: "white", fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>Get a Demo</button>
          <button style={{
            padding: "14px 28px", borderRadius: "50px",
            border: "1.5px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.1)",
            color: "white", fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>Request Pricing</button>
        </div>
      </div>
    </section>
  );
}

export default function SolutionsPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{
      background: BG,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      minHeight: "100vh",
    }}>
      <LandingHeader />
      <HeroSection />
      <ByBusinessType />
      <ByTeamChallenge />
      <GuidedBuilder />
      <OutcomeBundles />
      <FAQ />
      <BottomCTA />
      <Footer />
    </div>
  );
}
