import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  FileText,
  RotateCw,
  PenSquare,
  CheckCircle2,
  Clock,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const NAVY = "#161B33";
const BODY = "#5B6373";
const ORANGE = "#FF7A00";
const ORANGE_DARK = "#E06800";
const BLUE_EYEBROW = "#2B3FE0";
const BORDER = "#E6E8EC";
const SECTION_BG = "#F7F8FA";
const ICON_NAVY = "#1E2A6A";

const flowRow1 = ["Customer record", "Billing event", "Invoice / subscription / usage", "Approval"];
const flowRow2 = ["Payment reference", "Collections", "Revenue insight"];

const capabilityCards = [
  { icon: FileText, iconBg: ORANGE, title: "Invoices", desc: "Create, send and track invoices tied to real work." },
  { icon: RotateCw, iconBg: ORANGE, title: "Subscriptions", desc: "Recurring billing with renewals and changes." },
  { icon: PenSquare, iconBg: ORANGE, title: "Usage billing", desc: "Charge based on measured usage and metering." },
  { icon: CheckCircle2, iconBg: ICON_NAVY, title: "Billing approvals", desc: "Route approvals before revenue is recognized." },
  { icon: Clock, iconBg: ORANGE, title: "Collections", desc: "Track overdue invoices and collection workflows." },
  { icon: BarChart3, iconBg: ICON_NAVY, title: "Revenue insight", desc: "Connected revenue visibility through Zoiko Insights." },
];

const faqs = [
  { q: "Does Billing connect to projects and time?", a: "Yes. Zoiko Billing ties invoices and usage charges to approved hours from ZoikoTime and delivered work from Zoiko Projects, so billing always reflects real work." },
  { q: "Is Zoiko Billing accounting software?", a: "No. Zoiko Billing handles invoicing, subscriptions, usage billing, approvals and collections, and connects to your accounting systems rather than replacing them." },
  { q: "Does it support subscriptions and usage?", a: "Yes. You can run recurring subscription billing with renewals and changes, and charge based on measured usage and metering, all from one connected workflow." },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 22px", marginBottom: 14, cursor: "pointer", background: "#fff" }}
      onClick={() => setOpen((o) => !o)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{q}</span>
        <ChevronDown size={20} color={BODY} style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease", flexShrink: 0, marginLeft: 16 }} />
      </div>
      {open && <p style={{ marginTop: 14, marginBottom: 0, color: BODY, fontSize: 14.5, lineHeight: 1.6 }}>{a}</p>}
    </div>
  );
}

function Pill({ children }) {
  return (
    <span style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "10px 18px", fontSize: 14, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>
      {children}
    </span>
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
          <span style={{ background: ORANGE, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Money</span>
          <span style={{ color: "#555" }}>Zoiko Billing</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <h1 style={{
              fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
              color: NAVY, margin: "0 0 20px", letterSpacing: "-0.02em",
            }}>
              Billing software for connected{" "}
              <span style={{ color: ORANGE }}>revenue operations.</span>
            </h1>

            <p style={{ fontSize: "16px", lineHeight: 1.7, color: BODY, margin: "0 0 28px" }}>
              Create invoices, manage subscriptions, support usage billing,
              route billing approvals, track customer billing records and
              connect revenue workflows to projects, payments, documents and
              insights.
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
                Request Billing Pricing
              </button>
              <button style={{
                background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
                border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}>
                See Money Pillar
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
              INVOICE \u00b7 INV-2026-0842
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 20px", marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>TOTAL DUE</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>$24,800</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                ["Client", "Brightline Agency"],
                ["Projects", "3"],
                ["Hours billed", "126"],
                ["Due date", "Jul 15, 2026"],
              ].map(([label, val], i) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "14px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)", fontSize: 14.5 }}>
                  <span style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 4px 4px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 14.5 }}>
                <span style={{ color: "rgba(255,255,255,0.65)" }}>Status</span>
                <span style={{ fontWeight: 700, color: "#8FB4FF" }}>Pending approval</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevenueWorkflow() {
  return (
    <section style={{ padding: "0 24px 96px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: ORANGE, letterSpacing: "0.08em", marginBottom: 16 }}>THE REVENUE WORKFLOW</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>From customer record to revenue insight.</h2>
        </div>
        <div style={{ background: SECTION_BG, border: `1px solid ${BORDER}`, borderRadius: 28, padding: "30px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            {flowRow1.map((step, i) => (
              <React.Fragment key={step}>
                <Pill>{step}</Pill>
                {i < flowRow1.length - 1 && <ArrowRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            {flowRow2.map((step, i) => (
              <React.Fragment key={step}>
                <Pill>{step}</Pill>
                {i < flowRow2.length - 1 && <ArrowRight size={16} color={ORANGE} style={{ flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
        </div>
        <p style={{ textAlign: "center", color: BODY, fontSize: 14.5, marginTop: 28 }}>
          Connected to Zoiko Projects, ZoikoTime, ZoikoPay, ZoikoCoreX, Documents, Approvals and Zoiko Insights.
        </p>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section style={{ padding: "0 24px 96px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: BLUE_EYEBROW, letterSpacing: "0.08em", marginBottom: 16 }}>CAPABILITIES</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>Bill accurately. Get paid faster.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {capabilityCards.map(({ icon: Icon, iconBg, title, desc }) => (
            <div key={title} style={{ border: `1px solid ${BORDER}`, borderRadius: 16, padding: 26 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
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
    <section style={{ background: SECTION_BG, padding: "88px 24px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: BLUE_EYEBROW, letterSpacing: "0.08em", marginBottom: 16 }}>ZOIKO BILLING FAQS</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>Common questions.</h2>
        </div>
        <div>{faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}</div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section style={{ padding: "88px 24px 110px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", background: "linear-gradient(115deg, #1C2A8C 0%, #3F63D8 100%)", borderRadius: 26, padding: "64px 40px", textAlign: "center", color: "#fff" }}>
        <h2 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 16px 0" }}>Turn delivered work into revenue.</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", maxWidth: 560, margin: "0 auto 32px auto", lineHeight: 1.6 }}>
          Connect billing to projects, time, payments and insights.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DARK})`, color: "#fff", border: "none", borderRadius: 999, padding: "15px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Get a Demo
          </button>
          <button type="button" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, padding: "15px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Request Pricing
          </button>
          <button type="button" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, padding: "15px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            See Money Pillar
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ZoikoBillingPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: NAVY, minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <Hero />
      <RevenueWorkflow />
      <Capabilities />
      <FaqSection />
      <BottomCta />
      <Footer />
    </div>
  );
}
