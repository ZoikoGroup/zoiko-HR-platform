import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  Clock,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Grid3x3,
  SquareDot,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const NAVY = "#161B33";
const BODY = "#5B6373";
const BLUE_BADGE = "#2B3FE0";
const ORANGE = "#FF7A00";
const ORANGE_DARK = "#E06800";
const CARD_NAVY_TOP = "#1B2347";
const CARD_NAVY_BOTTOM = "#10142A";
const BORDER = "#E6E8EC";
const ICON_NAVY = "#1E2A6A";
const ICON_BLUE = "#3B7BE0";

const flowSteps = ["Time & attendance", "Exceptions", "Approved hours", "Payroll", "Billing", "Projects", "Insights"];
const flowSeparators = ["arrow", "arrow", "arrow", "arrow", "arrow", "arrow"];

const capabilityCards = [
  {
    icon: Clock,
    iconBg: ICON_NAVY,
    title: "Time & attendance",
    desc: "Capture hours, clock-ins and presence accurately.",
  },
  {
    icon: CalendarDays,
    iconBg: ICON_NAVY,
    title: "Schedules & shifts",
    desc: "Plan, publish and manage schedules and breaks.",
  },
  {
    icon: AlertTriangle,
    iconBg: ORANGE,
    title: "Exceptions",
    desc: "Surface anomalies before hours are approved.",
  },
  {
    icon: CheckCircle2,
    iconBg: ICON_NAVY,
    title: "Approved hours",
    desc: "A single approved source for payroll, billing and projects.",
  },
  {
    icon: Grid3x3,
    iconBg: ICON_BLUE,
    title: "Project & billable time",
    desc: "Tie hours to projects and billable work.",
  },
  {
    icon: SquareDot,
    iconBg: ICON_NAVY,
    title: "Work evidence",
    desc: "Audit-ready records of workforce activity.",
  },
];

const faqs = [
  {
    q: "Does ZoikoTime feed payroll and billing?",
    a: "Yes. Approved hours from ZoikoTime flow directly into Zoiko Payroll and billing workflows, so pay runs and invoices are always based on reviewed, accurate data.",
  },
  {
    q: "Can I use it on its own?",
    a: "Yes. ZoikoTime works as a standalone time and attendance system, and connects to payroll, billing, projects and insights across Zoiko One whenever you're ready.",
  },
  {
    q: "Does it support schedules and shifts?",
    a: "Yes. You can plan, publish and manage schedules and shift breaks, and exceptions are surfaced automatically before hours are approved.",
  },
];

const dayHeights = [62, 58, 54, 50, 38, 14, 6];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 14,
        cursor: "pointer",
        background: "#fff",
      }}
      onClick={() => setOpen((o) => !o)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{q}</span>
        <ChevronDown
          size={20}
          color={BODY}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s ease",
            flexShrink: 0,
            marginLeft: 16,
          }}
        />
      </div>
      {open && (
        <p style={{ marginTop: 14, marginBottom: 0, color: BODY, fontSize: 14.5, lineHeight: 1.6 }}>
          {a}
        </p>
      )}
    </div>
  );
}

function Hero() {
  const navigate = useNavigate();
  const days = ["M", "T", "W", "T", "F", "S", "S"];

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
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, textAlign: "left" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <span style={{ background: BLUE_BADGE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>People</span>
          <span style={{ color: "#555" }}>ZoikoTime</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <h1 style={{
              fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
              color: NAVY, margin: "0 0 20px", letterSpacing: "-0.02em",
            }}>
              Time tracking for workforce accountability and{" "}
              <span style={{ color: BLUE_BADGE }}>approved hours.</span>
            </h1>

            <p style={{ fontSize: "16px", lineHeight: 1.7, color: BODY, margin: "0 0 28px" }}>
              Track time, attendance, schedules, breaks, exceptions and
              approved hours {'\u2014'} then connect workforce activity to
              payroll, billing, projects, compliance and insights.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/get-demo")} style={{
                background: "linear-gradient(135deg, #FF8800, #FF5500)",
                color: "#fff", border: "none", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 16px rgba(255,85,0,0.45)",
              }}>
                Get a Demo <ArrowRight size={17} />
              </button>
              <button style={{
                background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
                border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}>
                Request ZoikoTime Pricing
              </button>
              <button style={{
                background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
                border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}>
                See People Pillar
              </button>
            </div>
          </div>

          <div style={{
            background: "linear-gradient(152.22deg, #1D0A5E 0%, #240C84 60%, #150844 100%)",
            borderRadius: 22,
            padding: "30px 28px 34px",
            color: "#fff",
            boxShadow: "0 24px 60px rgba(20,25,50,0.25)",
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.55)", marginBottom: 22 }}>
              THIS WEEK {'\u00b7'} APPROVED HOURS
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, height: 100, marginBottom: 10 }}>
              {days.map((d, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{ width: "100%", height: dayHeights[i], borderRadius: 8, background: "linear-gradient(180deg, #5B8DF5 0%, #2A4FCB 100%)", opacity: dayHeights[i] < 20 ? 0.45 : 1 }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              {days.map((d, i) => (
                <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{d}</span>
              ))}
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14.5, color: "rgba(255,255,255,0.65)" }}>Approved this week</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>38.5 h</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OneInputManyOutcomes() {
  return (
    <section style={{ padding: "0 24px 88px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              color: ORANGE,
              letterSpacing: "0.08em",
              marginBottom: 16,
            }}
          >
            ONE INPUT, MANY OUTCOMES
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>
            Approved hours power the rest of the business.
          </h2>
        </div>

        <div
          style={{
            background: "#F7F8FA",
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            padding: "20px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {flowSteps.map((step, i) => (
            <React.Fragment key={step}>
              <span
                style={{
                  background: "#fff",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: NAVY,
                  whiteSpace: "nowrap",
                }}
              >
                {step}
              </span>
              {i < flowSteps.length - 1 &&
                (flowSeparators[i] === "dot" ? (
                  <span style={{ color: ORANGE, fontSize: 18, fontWeight: 800 }}>{'\u00b7'}</span>
                ) : (
                  <ArrowRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section style={{ padding: "0 24px 96px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              color: BLUE_BADGE,
              letterSpacing: "0.08em",
              marginBottom: 16,
            }}
          >
            CAPABILITIES
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>
            Everything you need to capture work accurately.
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {capabilityCards.map(({ icon: Icon, iconBg, title, desc }) => (
            <div
              key={title}
              style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: 26,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  background: iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon size={20} color="#fff" strokeWidth={2.2} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 14, color: BODY, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section style={{ background: "#F7F8FA", padding: "88px 24px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              color: BLUE_BADGE,
              letterSpacing: "0.08em",
              marginBottom: 16,
            }}
          >
            ZOIKOTIME FAQS
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>Common questions.</h2>
        </div>

        <div>
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section style={{ padding: "88px 24px 110px" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          background: "linear-gradient(115deg, #1C2A8C 0%, #3F63D8 100%)",
          borderRadius: 26,
          padding: "64px 40px",
          textAlign: "center",
          color: "#fff",
        }}
      >
        <h2 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 16px 0" }}>
          Capture work once. Use it everywhere.
        </h2>
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.85)",
            maxWidth: 560,
            margin: "0 auto 32px auto",
            lineHeight: 1.6,
          }}
        >
          Approved hours that power payroll, billing, projects and
          insights.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DARK})`,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "15px 28px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Get a Demo
          </button>
          <button
            type="button"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              padding: "15px 26px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Request Pricing
          </button>
          <button
            type="button"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              padding: "15px 26px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            See People Pillar
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ZoikoTimePage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: NAVY, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <Hero />
      <OneInputManyOutcomes />
      <Capabilities />
      <FaqSection />
      <BottomCta />
      <Footer />
    </div>
  );
}
