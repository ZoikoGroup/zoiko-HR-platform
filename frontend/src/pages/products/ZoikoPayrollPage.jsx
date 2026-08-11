import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Globe,
  SquareDot,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

/**
 * Zoiko Payroll — product landing page
 *
 * Color tokens (sampled from screenshots):
 *  - Navy text/heading:   #161B33
 *  - Body gray:           #5B6373
 *  - Orange badge/CTA:    #D97B3F  ("People" badge here is orange, not blue)
 *  - Orange dark:         #C2672E
 *  - Dark navy card:      #1B2347 -> #11162E (Pay Run card gradient)
 *  - Icon navy:           #1E2A6A (Approval trails / Payslip prep / Jurisdiction / Evidence / Insights)
 *  - Icon orange:         #D97B3F / #C9802E (Exception handling warning icon)
 *  - Section border:      #E6E8EC
 *  - Section bg light:    #F7F8FA
 *  - Bottom CTA gradient: #1C2A8C -> #3F63D8 (blue gradient banner)
 *  - Card row pill bg:    #fff with border, inside light gray pill-track bg
 */

const NAVY = "#161B33";
const BODY = "#5B6373";
const ORANGE = "#FF8C00";
const ORANGE_DARK = "#E67A00";
const BORDER = "#E6E8EC";
const SECTION_BG = "#F7F8FA";
const ICON_NAVY = "#1E2A6A";

const flowSteps = [
  "Employee record",
  "Approved time",
  "Payroll preparation",
  "Exception review",
  "Approval",
  "Payslip workflow",
  "Evidence",
  "Insights",
];

const getCards = [
  {
    icon: CheckCircle2,
    iconBg: ICON_NAVY,
    title: "Approval trails",
    desc: "Every pay run reviewed and approved with a full record.",
  },
  {
    icon: AlertTriangle,
    iconBg: ORANGE,
    title: "Exception handling",
    desc: "Catch and resolve anomalies before approval.",
  },
  {
    icon: FileText,
    iconBg: ICON_NAVY,
    title: "Payslip preparation",
    desc: "Generate payslips tied to approved data.",
  },
  {
    icon: Globe,
    iconBg: ICON_NAVY,
    title: "Jurisdiction-specific",
    desc: "Configurable payroll operations across jurisdictions.",
  },
  {
    icon: SquareDot,
    iconBg: ICON_NAVY,
    title: "Payroll evidence",
    desc: "Audit-ready records for compliance and finance.",
  },
  {
    icon: BarChart3,
    iconBg: ICON_NAVY,
    title: "Payroll insights",
    desc: "Cost visibility connected to Zoiko Insights.",
  },
];

const faqs = [
  {
    q: "Does payroll use HR and time data?",
    a: "Yes. Zoiko Payroll runs on approved employee records and approved hours from Zoiko HR and Zoiko Time, so every pay run starts from data that's already been reviewed.",
  },
  {
    q: "Is Zoiko Payroll accounting software?",
    a: "No. Zoiko Payroll handles pay run preparation, approvals, exceptions and payslips, and connects to your accounting or finance systems rather than replacing them.",
  },
  {
    q: "Can it handle multiple jurisdictions?",
    a: "Yes. Payroll operations are configurable per jurisdiction, so rules, approvals and evidence can be tailored to each region you operate in.",
  },
];

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
          <span style={{ background: ORANGE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>People</span>
          <span style={{ color: "#555" }}>Zoiko Payroll</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <h1 style={{
              fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
              color: NAVY, margin: "0 0 20px", letterSpacing: "-0.02em",
            }}>
              Payroll you can{" "}
              <span style={{ color: ORANGE }}>control and trust.</span>
            </h1>

            <p style={{ fontSize: "16px", lineHeight: 1.7, color: BODY, margin: "0 0 28px" }}>
              Run controlled payroll workflows with approved HR records and
              hours, payroll reviews, exception handling, payslip
              preparation, approval trails and payroll-ready evidence.
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
                Request Payroll Pricing
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
            background: "linear-gradient(152.06deg, #1D0A5E 0%, #240C84 60%, #150844 100%)",
            borderRadius: 22,
            padding: "30px 28px 34px",
            color: "#fff",
            boxShadow: "0 24px 60px rgba(20,25,50,0.25)",
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>
              PAY RUN \u00b7 MARCH
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 20px", marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>TOTAL APPROVED</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>$184,200</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                ["Employees", "128"],
                ["Approved hours", "19,840"],
                ["Exceptions resolved", "6"],
              ].map(([label, val], i) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "14px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)", fontSize: 14.5 }}>
                  <span style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 4px 4px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 14.5 }}>
                <span style={{ color: "rgba(255,255,255,0.65)" }}>Status</span>
                <span style={{ fontWeight: 700, color: "#8FB4FF" }}>Ready for approval</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ZoikoPayrollPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: NAVY }}>
      <LandingHeader />
      <Hero />

      {/* ============ THE PAYROLL WORKFLOW ============ */}
      <section style={{ padding: "88px 24px" }}>
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
              THE PAYROLL WORKFLOW
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>
              From approved data to payroll evidence.
            </h2>
          </div>

          <div
            style={{
              background: SECTION_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 28,
              padding: "30px 36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
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
                {i < flowSteps.length - 1 && (
                  <ArrowRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ============ WHAT YOU GET ============ */}
      <section style={{ background: "#fff", padding: "0 24px 96px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: "#3B4FE0",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              WHAT YOU GET
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>
              Controlled, auditable payroll operations.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {getCards.map(({ icon: Icon, iconBg, title, desc }) => (
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

      {/* ============ FAQS ============ */}
      <section style={{ background: SECTION_BG, padding: "88px 24px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: "#3B4FE0",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              ZOIKO PAYROLL FAQS
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

      {/* ============ BOTTOM CTA BANNER ============ */}
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
            Run payroll with confidence.
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
            Approved data in, controlled pay runs out, evidence everywhere.
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
      <Footer />
    </div>
  );
}
