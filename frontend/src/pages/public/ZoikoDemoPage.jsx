import React, { useState, useRef } from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";
import {
  Crown,
  DollarSign,
  Users,
  Settings,
  ShieldAlert,
  Grid3x3,
  ArrowLeftRight,
  CheckCircle2,
  BarChart3,
  Sparkles,
  Circle,
  Puzzle,
  ArrowUpRight,
} from "lucide-react";

const NAVY = "#1E2A4A";
const NAVY_DEEP = "#16213D";
const ORANGE = "#E8850A";
const ORANGE_DARK = "#D8760A";
const BLUE = "#2F4DC4";
const BODY = "#5B6373";
const BORDER = "#E6E8EC";
const SECTION_BG = "#F7F8FA";

const roleCards = [
  {
    icon: Crown,
    iconBg: BLUE,
    title: "Founder / CEO",
    desc: "Business-wide visibility, control, revenue, spend, risk and growth readiness.",
    cta: "Request Executive Demo",
  },
  {
    icon: DollarSign,
    iconBg: BLUE,
    title: "Finance",
    desc: "Billing, spend, payroll workflows, expenses, vendor approvals and controls.",
    cta: "Request Finance Demo",
  },
  {
    icon: Users,
    iconBg: BLUE,
    title: "HR / People",
    desc: "Employee records, onboarding, time, payroll readiness and documents.",
    cta: "Request People Demo",
  },
  {
    icon: Settings,
    iconBg: BLUE,
    title: "Operations",
    desc: "Projects, inventory, purchasing, supplier workflows and approvals.",
    cta: "Request Operations Demo",
  },
  {
    icon: ShieldAlert,
    iconBg: BLUE,
    title: "Enterprise / IT",
    desc: "SSO, permissions, integrations, APIs, migration and rollout planning.",
    cta: "Request Enterprise Demo",
  },
];

const startingPointCards = [
  {
    num: 1,
    title: "Product Demo",
    desc: "Evaluating one product such as HR, Payroll, Billing, Spend, Projects or Inventory.",
    cta: "Request Product Demo",
  },
  {
    num: 2,
    title: "Pillar Demo",
    desc: "Evaluating a complete operating area across People, Money, Work, Supply or Control.",
    cta: "Request Pillar Demo",
  },
  {
    num: 3,
    title: "Workflow Demo",
    desc: "Connecting a broken or manual handoff across multiple products.",
    cta: "Request Workflow Demo",
  },
  {
    num: 4,
    title: "Platform Demo",
    desc: "Evaluating Zoiko One as the broader connected business-operations platform.",
    cta: "Request Platform Demo",
  },
];

const coverageCards = [
  {
    icon: Circle,
    iconBg: `linear-gradient(135deg, #3450C9, ${NAVY})`,
    title: "Platform Overview",
    desc: "How Zoiko One connects People, Money, Work, Supply and Control through one shared operating system.",
  },
  {
    icon: Grid3x3,
    iconBg: BLUE,
    title: "Product Walkthrough",
    desc: "Relevant products: HR, Time, Payroll, Billing, Spend, Projects, Inventory, Comply, Insights and Docs Pro.",
  },
  {
    icon: ArrowLeftRight,
    iconBg: ORANGE,
    title: "Workflow Demonstration",
    desc: "Connected handoffs: HR-to-payroll, project-to-cash, spend-to-stock, documents-to-compliance, billing-to-insights.",
  },
  {
    icon: CheckCircle2,
    iconBg: NAVY,
    title: "Governance & Controls",
    desc: "Permissions, approvals, audit trails, documents, evidence, organization structure and role-based access.",
  },
  {
    icon: BarChart3,
    iconBg: "#3F8CD9",
    title: "Reporting & Insights",
    desc: "How Zoiko Insights surfaces visibility across payroll, spend, billing, projects, inventory, risk and performance.",
  },
  {
    icon: Sparkles,
    iconBg: `linear-gradient(135deg, ${ORANGE}, ${NAVY})`,
    title: "AI Assistance",
    desc: "Governed AI support for summaries, drafting, workflow guidance, exception analysis and operational insights.",
  },
];

const demoFitItems = [
  {
    icon: Puzzle,
    title: "Product fit",
    desc: "The products that match your operating priorities",
  },
  {
    icon: ArrowLeftRight,
    title: "Workflow fit",
    desc: "HR-to-payroll, project-to-cash, time-to-billing, spend-to-stock",
  },
  {
    icon: CheckCircle2,
    title: "Governance fit",
    desc: "Approvals, permissions, documents, evidence, audit, AI boundaries",
  },
  {
    icon: ArrowUpRight,
    title: "Rollout fit",
    desc: "Start with one product, one pillar, one workflow or the platform",
  },
  {
    icon: DollarSign,
    title: "Commercial fit",
    desc: "Guidance on scope, pricing path, rollout and next steps",
  },
];

function Field({ label, required, placeholder, type = "text", colSpan }) {
  return (
    <div style={{ gridColumn: colSpan ? "1 / -1" : "auto" }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 700,
          color: NAVY,
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: ORANGE }}> *</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 14,
          color: "#1B2436",
          outline: "none",
          background: "#fff",
        }}
        onFocus={(e) => (e.target.style.borderColor = ORANGE)}
        onBlur={(e) => (e.target.style.borderColor = BORDER)}
      />
    </div>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? ORANGE : BORDER}`,
        background: active ? "#FBEEE3" : "#fff",
        color: active ? ORANGE_DARK : NAVY,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all .15s ease",
      }}
    >
      {children}
    </button>
  );
}

export default function ZoikoDemoPage() {
  const [selected, setSelected] = useState("Platform overview");
  const formRef = useRef(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCtaClick = (e) => {
    e.preventDefault();
    scrollToForm();
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: NAVY }}>
      <LandingHeader />
      {/* ============ HERO + FORM ============ */}
      <section style={{ padding: "72px 24px", maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.05fr 1fr",
            gap: 56,
            alignItems: "start",
          }}
        >
          {/* Left column */}
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 22 }}>
              <span
                onClick={scrollToForm}
                style={{
                  background: NAVY,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "5px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                Get a Demo
              </span>
              <span style={{ fontSize: 13, color: BODY, fontWeight: 600 }}>
                Tailored to your business
              </span>
            </div>

            <h1
              style={{
                fontSize: 52,
                lineHeight: 1.08,
                fontWeight: 800,
                margin: "0 0 22px 0",
                letterSpacing: "-0.02em",
              }}
            >
              See Zoiko One in{" "}
              <span style={{ color: ORANGE }}>action.</span>
            </h1>

            <p style={{ fontSize: 17, lineHeight: 1.6, color: BODY, maxWidth: 520, margin: "0 0 24px 0" }}>
              Book a guided demo and see how your business can connect people,
              money, work, supply, control, workflows, approvals, documents,
              insights and AI assistance in one governed operating platform.
            </p>

            <p
              style={{
                fontSize: 15,
                color: BLUE,
                fontWeight: 600,
                lineHeight: 1.6,
                margin: "0 0 28px 0",
                maxWidth: 520,
              }}
            >
              Choose one product, one pillar, one workflow or the full
              platform — we'll tailor the demo to your priorities.
            </p>

            {/* Dark info panel */}
            <div
              style={{
                background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
                borderRadius: 20,
                padding: "32px 32px 36px",
                color: "#fff",
                maxWidth: 560,
              }}
            >
              <h3 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 22px 0" }}>
                Your demo will be built around your business.
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {demoFitItems.map(({ icon: Icon, title, desc }) => (
                  <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: "rgba(255,255,255,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={17} strokeWidth={2.2} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{title}</div>
                      <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                        {desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column — form */}
          <div
            ref={formRef}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 20,
              padding: 32,
              boxShadow: "0 12px 40px rgba(20,30,60,0.06)",
            }}
          >
            <h3 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px 0" }}>
              Request my demo
            </h3>
            <p style={{ fontSize: 13.5, color: BODY, margin: "0 0 24px 0" }}>
              Takes about 2 minutes. The more we know, the more relevant your
              demo.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 18,
              }}
            >
              <Field label="Work email" required placeholder="you@company.com" type="email" />
              <Field label="Company" required placeholder="Company" />
              <Field label="First name" required placeholder="First" />
              <Field label="Last name" required placeholder="Last" />
              <Field label="Job title" required placeholder="Your role" />
              <Field label="Company size" required placeholder="1–10" />
              <Field label="Business type" required placeholder="Services" />
              <Field label="Country / region" required placeholder="Country" />
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>
                What would you like to see?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {["Platform overview", "A product", "A workflow", "Governance", "Insights"].map(
                  (opt) => (
                    <Pill key={opt} active={selected === opt} onClick={() => setSelected(opt)}>
                      {opt}
                    </Pill>
                  )
                )}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: NAVY,
                  marginBottom: 6,
                }}
              >
                Primary business challenge
              </label>
              <input
                placeholder="What problem should the demo focus on?"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = ORANGE)}
                onBlur={(e) => (e.target.style.borderColor = BORDER)}
              />
            </div>

            <button
              type="button"
              style={{
                width: "100%",
                background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DARK})`,
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "14px 0",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              Request My Demo <span style={{ fontSize: 16 }}>→</span>
            </button>

            <button
              type="button"
              style={{
                width: "100%",
                background: "#fff",
                color: NAVY,
                border: `1px solid ${BORDER}`,
                borderRadius: 999,
                padding: "13px 0",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 18,
              }}
            >
              View Pricing Options
            </button>

            <p style={{ fontSize: 11.5, color: "#9298A4", lineHeight: 1.5, margin: "0 0 14px 0" }}>
              By submitting this form, you agree that Zoiko One may contact
              you about your request. Your information will be handled
              according to our Privacy Policy.
            </p>

            <div style={{ display: "flex", gap: 18, fontSize: 12.5, fontWeight: 700, color: NAVY }}>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Privacy Policy
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Trust Center
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ DEMO PATHS ============ */}
      <section style={{ background: SECTION_BG, padding: "80px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: ORANGE,
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              CHOOSE YOUR FOCUS
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, margin: 0 }}>
              Demo paths by role and starting point.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
            {/* By buyer role */}
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 18px 0" }}>
                By buyer role
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {roleCards.map(({ icon: Icon, iconBg, title, desc, cta }) => (
                  <div
                    key={title}
                    style={{
                      background: "#fff",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 16,
                      padding: 20,
                      display: "flex",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: iconBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} color="#fff" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontSize: 13.5, color: BODY, lineHeight: 1.5, marginBottom: 8 }}>
                        {desc}
                      </div>
                      <a
                        href="#"
                        onClick={handleCtaClick}
                        style={{
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: NAVY,
                          textDecoration: "none",
                        }}
                      >
                        {cta} →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By starting point */}
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 18px 0" }}>
                By starting point
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {startingPointCards.map(({ num, title, desc, cta }) => (
                  <div
                    key={title}
                    style={{
                      background: "#fff",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 16,
                      padding: 20,
                      display: "flex",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: ORANGE,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      {num}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontSize: 13.5, color: BODY, lineHeight: 1.5, marginBottom: 8 }}>
                        {desc}
                      </div>
                      <a
                        href="#"
                        onClick={handleCtaClick}
                        style={{
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: NAVY,
                          textDecoration: "none",
                        }}
                      >
                        {cta} →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WHAT THE DEMO CAN COVER ============ */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: BLUE,
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              WHAT THE DEMO CAN COVER
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, margin: 0 }}>
              Tailored to what matters to you.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {coverageCards.map(({ icon: Icon, iconBg, title, desc }) => (
              <div
                key={title}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: 28,
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
                <h4 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 8px 0" }}>{title}</h4>
                <p style={{ fontSize: 13.5, color: BODY, lineHeight: 1.55, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
