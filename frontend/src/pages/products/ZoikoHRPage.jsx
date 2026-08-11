import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  FolderOpen,
  PlayCircle,
  ArrowLeftRight,
  Square,
  Sparkles,
  BarChart3,
  KeyRound,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const NAVY = "#0B1C3F";
const BLUE = "#1A3A8C";
const LIGHT_BLUE = "#4A9FE4";
const ORANGE = "#E8850A";
const WHITE = "#FFFFFF";
const OFF_WHITE = "#f8fafc";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#E5E7EB";
const DARK_TEXT = "#111827";
const SUBTLE_TEXT = "#4B5563";

const FF = "'Inter', system-ui, -apple-system, sans-serif";

const wrap = {
  padding: "80px 6vw",
  background: WHITE,
  fontFamily: FF,
};

const eyebrow = (color = ORANGE) => ({
  fontSize: "11px", fontWeight: "700", letterSpacing: "0.14em",
  textTransform: "uppercase", color, margin: "0 0 14px 0",
  display: "block",
});

const h2 = {
  fontSize: "clamp(26px, 4vw, 44px)", fontWeight: "800",
  color: NAVY, lineHeight: "1.15", margin: "0 0 16px 0",
};

const bodyText = {
  fontSize: "15px", color: SUBTLE_TEXT, lineHeight: "1.7", margin: 0,
};

const pillTag = {
  display: "inline-block", padding: "3px 10px", borderRadius: "20px",
  background: "rgba(232,133,10,0.08)", color: ORANGE,
  fontSize: "11px", fontWeight: "600",
  border: "1px solid rgba(232,133,10,0.18)",
};

const whiteCard = {
  background: WHITE, borderRadius: "16px",
  border: `1px solid ${LIGHT_GRAY}`, padding: "28px",
};

const iconBox = (bg = BLUE) => ({
  width: "44px", height: "44px", borderRadius: "12px",
  background: bg, display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: "20px", flexShrink: 0,
});

const outlineBtn = {
  padding: "12px 22px", borderRadius: "50px",
  border: `1.5px solid ${LIGHT_GRAY}`, background: WHITE,
  fontSize: "13px", fontWeight: "600", color: NAVY,
  cursor: "pointer", fontFamily: FF,
};

const ghostBtnWhite = {
  padding: "13px 24px", borderRadius: "50px",
  border: "1.5px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)",
  color: "white", fontSize: "14px", fontWeight: "600",
  cursor: "pointer", fontFamily: FF,
};

const problemItems = [
  {
    icon: FolderOpen,
    iconBg: BLUE,
    title: "Employee records",
    desc: "One source of truth for people data, teams and locations.",
  },
  {
    icon: PlayCircle,
    iconBg: BLUE,
    title: "Onboarding",
    desc: "Structured tasks, documents and approvals from day one.",
  },
  {
    icon: ArrowLeftRight,
    iconBg: BLUE,
    title: "Lifecycle changes",
    desc: "Role, pay and team changes with approval trails.",
  },
  {
    icon: Square,
    iconBg: BLUE,
    title: "Documents",
    desc: "Secure storage with versioning and evidence.",
  },
];

const flowSteps = ["HR record", "ZoikoID access", "Approved time", "Payroll", "Documents / evidence", "Insights"];

const flowCards = [
  {
    icon: KeyRound,
    iconBg: BLUE,
    title: "Permissions & accountability",
    desc: "Role-based access so the right people see the right data.",
  },
  {
    icon: Sparkles,
    iconBg: `linear-gradient(135deg, ${ORANGE}, ${NAVY})`,
    title: "AI assistance, with control",
    desc: "Summaries, drafting and onboarding prep \u2014 inside each user's permission scope. Never replaces accountable HR, payroll or legal decisions.",
  },
  {
    icon: BarChart3,
    iconBg: NAVY,
    title: "Workforce insights",
    desc: "Headcount, lifecycle and people-data visibility for leadership.",
  },
];

const faqs = [
  {
    q: "Does Zoiko HR connect to payroll?",
    a: "Yes. Approved time and lifecycle changes flow directly into Zoiko Payroll, so pay runs reflect accurate, up-to-date records without manual re-entry.",
  },
  {
    q: "Can I start with just Zoiko HR?",
    a: "Yes. Zoiko HR works as a standalone foundation for employee records, onboarding and documents, and connects to other Zoiko One products whenever you're ready.",
  },
  {
    q: "How does AI assistance work in HR?",
    a: "AI assistance helps with summaries, drafting and onboarding prep inside each user's own permission scope. It never makes accountable HR, payroll or legal decisions on its own.",
  },
];

const directory = [
  { initials: "AM", color: "#3B6FE0", name: "Aisha Malik", role: "Operations \u00b7 London", status: "Onboarded", statusBg: "rgba(255,255,255,0.14)", statusColor: "#CFE0FF" },
  { initials: "JD", color: ORANGE, name: "Jon Diaz", role: "Sales \u00b7 Remote", status: "Docs pending", statusBg: ORANGE, statusColor: "#fff" },
  { initials: "SR", color: "#3B4FE0", name: "Sara Rossi", role: "Finance \u00b7 Milan", status: "Active", statusBg: "rgba(255,255,255,0.14)", statusColor: "#CFE0FF" },
];

function Hero() {
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
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, textAlign: "left" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <span style={{ background: BLUE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>People</span>
          <span style={{ color: "#555" }}>Zoiko HR</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <h1 style={{
              fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
              color: NAVY, margin: "0 0 20px", letterSpacing: "-0.02em",
            }}>
              One clean foundation for your{" "}
              <span style={{ color: LIGHT_BLUE }}>people data.</span>
            </h1>

            <p style={{ fontSize: "16px", lineHeight: 1.7, color: SUBTLE_TEXT, margin: "0 0 28px" }}>
              Manage employee records, onboarding, teams, locations,
              lifecycle changes, documents and approvals from one connected
              Zoiko One foundation \u2014 then connect HR to time, payroll,
              compliance and insights.
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
                Request HR Pricing
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

          <div
            style={{
              background: `linear-gradient(152.22deg, #1D0A5E 0%, #240C84 60%, #150844 100%)`,
              borderRadius: 22,
              padding: "30px 28px 34px",
              color: "#fff",
              boxShadow: "0 24px 60px rgba(20,25,50,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.55)",
                marginBottom: 22,
              }}
            >
              PEOPLE DIRECTORY
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {directory.map((p) => (
                <div
                  key={p.name}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: p.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {p.initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{p.role}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      background: p.statusBg,
                      color: p.statusColor,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "6px 12px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section style={{ ...wrap }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
        <div>
          <span style={eyebrow(ORANGE)}>The Problem</span>
          <h2 style={h2}>People operations break down when employee data is scattered.</h2>
          <p style={bodyText}>
            Records in spreadsheets, documents in folders, onboarding in
            email, approvals in chat, payroll changes across disconnected
            systems \u2014 that means duplicated work, weak visibility and
            payroll risk. Zoiko HR gives the business a cleaner foundation
            for people data and HR workflows.
          </p>
          <button style={{
            padding: "14px 28px", borderRadius: "50px", border: "none",
            background: NAVY, color: WHITE, fontSize: "15px",
            fontWeight: "700", cursor: "pointer", fontFamily: FF, marginTop: "28px",
          }}>See the HR Difference →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {problemItems.map(({ icon: Icon, iconBg, title, desc }) => (
            <div key={title} style={whiteCard}>
              <div style={iconBox(iconBg)}>
                <Icon size={19} color="#fff" strokeWidth={2.2} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: DARK_TEXT, marginTop: 14, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: SUBTLE_TEXT, lineHeight: 1.55 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectedByDesign() {
  return (
    <section style={{ ...wrap, background: OFF_WHITE }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={eyebrow(ORANGE)}>Connected by Design</span>
          <h2 style={h2}>HR data flows across the platform.</h2>
        </div>

        <div
          style={{
            background: WHITE,
            border: `1px solid ${LIGHT_GRAY}`,
            borderRadius: 999,
            padding: "18px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 40,
          }}
        >
          {flowSteps.map((step, i) => (
            <React.Fragment key={step}>
              <span
                style={pillTag}
              >
                {step}
              </span>
              {i < flowSteps.length - 1 && (
                <ArrowRight size={16} color={GRAY} style={{ flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {flowCards.map(({ icon: Icon, iconBg, title, desc }) => (
            <div key={title} style={whiteCard}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon size={21} color="#fff" strokeWidth={2.2} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, color: DARK_TEXT, marginBottom: 10 }}>{title}</div>
              <div style={{ fontSize: 14, color: SUBTLE_TEXT, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HRFAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ ...wrap }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <span style={eyebrow(BLUE)}>Zoiko HR FAQs</span>
        <h2 style={h2}>Common questions.</h2>
      </div>
      <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        {faqs.map(({ q, a }, i) => (
          <div key={i} style={{
            background: WHITE, borderRadius: "12px",
            border: `1px solid ${LIGHT_GRAY}`, overflow: "hidden",
          }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", padding: "20px 24px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: FF, textAlign: "left",
              }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: NAVY }}>{q}</span>
              <ChevronDown
                size={18}
                color={GRAY}
                style={{
                  flexShrink: 0,
                  marginLeft: 16,
                  transform: open === i ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform .2s ease",
                }}
              />
            </button>
            {open === i && (
              <div style={{ padding: "0 24px 20px", fontSize: "14px", color: SUBTLE_TEXT, lineHeight: "1.7" }}>
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
    <section style={{ ...wrap, paddingTop: "20px", paddingBottom: "80px" }}>
      <div style={{
        background: `linear-gradient(135deg, ${BLUE} 0%, #1e40af 100%)`,
        borderRadius: "24px", padding: "64px 48px",
        textAlign: "center",
        boxShadow: "0 16px 48px rgba(26,58,140,0.35)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-60px", left: "-60px",
          width: "240px", height: "240px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-40px", right: "-40px",
          width: "200px", height: "200px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: "800",
            color: "white", margin: "0 0 14px 0", letterSpacing: "-0.5px",
          }}>
            Build your people foundation on Zoiko HR.
          </h2>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", lineHeight: "1.7" }}>
            Start with HR, then connect time, payroll, compliance and insights across one platform.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/get-demo")} style={{
              padding: "14px 28px", borderRadius: "50px", border: "none",
              background: ORANGE, color: "white", fontSize: "15px",
              fontWeight: "700", cursor: "pointer", fontFamily: FF,
              boxShadow: "0 6px 20px rgba(232,133,10,0.5)",
            }}>Get a Demo →</button>
            <button style={ghostBtnWhite}>Request Pricing</button>
            <button style={ghostBtnWhite}>See People Pillar</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ZoikoHRPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ background: WHITE, fontFamily: FF, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <Hero />
      <Problem />
      <ConnectedByDesign />
      <HRFAQ />
      <BottomCTA />
      <Footer />
    </div>
  );
}
