import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const PILLARS = [
  {
    id: "people",
    label: "People",
    number: "01",
    color: "#3B5BDB",
    icon: "👥",
    products: [
      {
        name: "Zoiko HR",
        icon: "👥",
        color: "#3B5BDB",
        desc: "Worker records, onboarding, hiring, teams, locations, documents and lifecycle changes from one people-data foundation.",
        cta: "Start with Zoiko HR",
      },
      {
        name: "ZoikoTime",
        icon: "🕐",
        color: "#3B5BDB",
        desc: "Time, attendance, schedules, approved hours and work evidence for payroll, billing, projects and accountability.",
        cta: "Start with ZoikoTime",
      },
      {
        name: "Zoiko Payroll",
        icon: "💵",
        color: "#3B5BDB",
        desc: "Controlled payroll workflows with approved HR and time data, payslips, approvals and jurisdiction-specific operations.",
        cta: "Start with Zoiko Payroll",
      },
    ],
    aside: null,
  },
  {
    id: "money",
    label: "Money",
    number: "02",
    color: "#E07B2A",
    icon: "💰",
    products: [
      {
        name: "Zoiko Billing",
        icon: "🧾",
        color: "#E07B2A",
        desc: "Invoices, subscriptions, usage billing, collections workflows and revenue records connected to projects and payments.",
        cta: "Start with Zoiko Billing",
      },
      {
        name: "Zoiko Spend",
        icon: "🔄",
        color: "#E07B2A",
        desc: "Control spending from request to payment with vendors, purchase approvals, POs, supplier invoices, AP workflows and policies.",
        cta: "Start with Zoiko Spend",
      },
    ],
    aside: {
      title: "Money, connected",
      desc: "Billing controls money in; Spend controls money out. Both feed Insights and ZoikoCorex for financial truth.",
      link: "Money architecture →",
    },
  },
  {
    id: "work",
    label: "Work",
    number: "03",
    color: "#3B5BDB",
    icon: "🔲",
    products: [
      {
        name: "Zoiko Projects",
        icon: "🔲",
        color: "#4A7CDB",
        desc: "Plan delivery, resources, capacity, budgets, costs, margins, milestones and billable work across client and internal projects.",
        cta: "Start with Zoiko Projects",
      },
    ],
    aside: null,
  },
  {
    id: "supply",
    label: "Supply",
    number: "04",
    color: "#3B5BDB",
    icon: "📦",
    products: [
      {
        name: "Zoiko Inventory",
        icon: "📦",
        color: "#3B5BDB",
        desc: "Manage stock, locations, receiving, goods in and out, reorder points, basic assets, valuation and inventory movements.",
        cta: "Start with Zoiko Inventory",
      },
    ],
    aside: null,
  },
  {
    id: "control",
    label: "Control",
    number: "05",
    color: "#1E3A8A",
    icon: "✓",
    products: [
      {
        name: "Zoiko Comply",
        icon: "✓",
        color: "#1E3A8A",
        desc: "Track obligations, controls, evidence, attestations, exceptions, audits and remediation through governed compliance workflows.",
        cta: "Start with Zoiko Comply",
      },
      {
        name: "Zoiko Insights",
        icon: "📊",
        color: "#1E3A8A",
        desc: "See performance, risk, revenue, payroll, spend, inventory, utilization, margin and business health across the platform.",
        cta: "Start with Zoiko Insights",
      },
    ],
    aside: {
      title: "Govern as you grow",
      desc: "Comply turns work into evidence; Insights turns operating data into decisions — across every pillar.",
      link: null,
    },
  },
];

const NEEDS = [
  {
    quote: '"I need to pay people correctly."',
    desc: "Clean records, accurate hours and controlled pay runs.",
    tags: ["HR", "Time", "Payroll"],
    cta: "Start with People →",
  },
  {
    quote: '"I need to control money."',
    desc: "Invoice faster and govern vendor spend end to end.",
    tags: ["Billing", "Spend"],
    cta: "Start with Money →",
  },
  {
    quote: '"I deliver client work."',
    desc: "Connect delivery to billable time and revenue.",
    tags: ["Projects", "Time", "Billing"],
    cta: "Start with Work →",
  },
  {
    quote: '"I manage stock."',
    desc: "Track goods, receiving, reorder and valuation.",
    tags: ["Inventory", "Spend"],
    cta: "Start with Supply →",
  },
  {
    quote: '"I need control & evidence."',
    desc: "Compliance workflows and live operating visibility.",
    tags: ["Comply", "Insights"],
    cta: "Start with Control →",
  },
  {
    quote: '"I\'m not sure yet."',
    desc: "Answer a few questions and we'll map your path.",
    tags: ["Guided Solution Builder"],
    cta: "Build my path →",
    highlight: true,
  },
];

const WORKFLOWS = [
  {
    label: "HR → Payroll",
    steps: ["HR record", "Approved time", "Payroll run"],
  },
  {
    label: "Project → Cash",
    steps: ["Project", "Billable time", "Invoice", "Margin"],
  },
  {
    label: "Spend → Stock",
    steps: ["Request", "PO", "Goods in", "Inventory"],
  },
  {
    label: "Documents → Compliance",
    steps: ["Template", "Approval", "Evidence", "Audit trail"],
  },
];

const FAQS = [
  "How many products are there?",
  "Is Docs Pro a tenth product?",
  "Does Zoiko One include accounting?",
  "Can I buy just one product?",
];

export default function ZoikoProductsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("people");
  const [openFaq, setOpenFaq] = useState(null);

  const scrollToPillars = () => {
    document.getElementById("pillars-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: "#1a1a2e", background: "#fff", minHeight: "100vh" }}>
      <LandingHeader />

      {/* HERO */}
      <section id="hero" style={{
        position: "relative",
        minHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px 60px",
        overflow: "hidden",
        backgroundColor: "#f5f4f2",
        background: "linear-gradient(120deg, rgba(255,195,130,0.45) 0%, rgba(250,248,245,0.98) 38%, rgba(250,248,245,0.98) 62%, rgba(170,205,240,0.45) 100%)",
      }}>
        {/* center brightening + edge color pools */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 900 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.92)", borderRadius: 999,
            padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}>
            <span style={{ background: "#3B5BDB", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>Products</span>
            <span style={{ color: "#555" }}>Nine core products + Docs Pro</span>
          </div>

          <h1 style={{ fontSize: "clamp(32px, 6vw, 60px)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 20px", color: "#0f172a" }}>
            A connected product system across <span style={{ color: "#E07B2A" }}>five pillars.</span>
          </h1>

          <p style={{ fontSize: 17, color: "#475569", lineHeight: 1.65, margin: "0 0 36px" }}>
            Zoiko One isn't a loose collection of apps. It's nine core products plus Zoiko Docs Pro, grouped by operating pillar and connected by one shared spine. Choose the product you need today, then expand.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/get-demo")} style={{
              background: "linear-gradient(135deg, #E07B2A, #c9651a)",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            }}>Get a Demo →</button>
            <button
              onClick={scrollToPillars}
              style={{
                background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
                border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
                padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}>Explore by Pillar</button>
          </div>
        </div>
      </section>

      {/* PILLARS NAV */}
      <section id="pillars-section" style={{ background: "rgba(248,250,252,0.9)", position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 0 }}>
          {[...PILLARS, { id: "docspro", label: "Docs Pro" }].map((p) => (
            <button
              key={p.id}
              onClick={() => { setActiveTab(p.id); document.getElementById(`pillar-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              style={{
                background: "none", border: "none",
                padding: "16px 22px", fontSize: 15, fontWeight: activeTab === p.id ? 700 : 500,
                color: activeTab === p.id ? "#3B5BDB" : "#64748b",
                borderBottom: activeTab === p.id ? "2px solid #3B5BDB" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{p.label}</button>
          ))}
        </div>
      </section>

      {/* PILLARS CONTENT */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        {PILLARS.map((pillar) => (
          <div key={pillar.id} id={`pillar-${pillar.id}`} style={{ marginBottom: 80 }}>
            {/* pillar header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginBottom: 40 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: pillar.color, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, color: "#fff",
              }}>{pillar.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase" }}>PILLAR {pillar.number}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a" }}>{pillar.label}</div>
              </div>
            </div>

            {/* products grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              {pillar.products.map((prod) => (
                <div key={prod.name} style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                  padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: prod.color, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "#fff", marginBottom: 14,
                  }}>{prod.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: "#0f172a" }}>{prod.name}</div>
                  <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 16 }}>{prod.desc}</div>
                  <a href="#" style={{ fontSize: 14, fontWeight: 600, color: "#3B5BDB", textDecoration: "none" }}>{prod.cta} →</a>
                </div>
              ))}

              {pillar.aside && (
                <div style={{
                  background: "rgba(248,250,252,0.8)", border: "1px solid #e2e8f0",
                  borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", justifyContent: "center",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: "#0f172a" }}>{pillar.aside.title}</div>
                  <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 14 }}>{pillar.aside.desc}</div>
                  {pillar.aside.link && (
                    <a href="#" style={{ fontSize: 14, fontWeight: 600, color: "#E07B2A", textDecoration: "none" }}>{pillar.aside.link}</a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* DOCS PRO */}
        <div id="pillar-docspro" style={{
          background: "linear-gradient(135deg, #1E3A8A, #3B5BDB)",
          borderRadius: 20, padding: "32px 36px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 20, marginBottom: 80,
        }}>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flex: 1, minWidth: 280 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: "#E07B2A",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
            }}>📄</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#93c5fd", textTransform: "uppercase", marginBottom: 4 }}>PREMIUM CAPABILITY · ACROSS ALL PILLARS</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Zoiko Docs Pro</div>
              <div style={{ fontSize: 14, color: "#bfdbfe", lineHeight: 1.6 }}>Create approved, versioned, jurisdiction-aware business documents across the platform — from approved templates and guided workflows, with secure storage. A premium Documents-layer capability, not Product 10.</div>
            </div>
          </div>
          <button style={{
            background: "#E07B2A", color: "#fff", border: "none",
            borderRadius: 999, padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}>Explore Docs Pro</button>
        </div>
      </section>

      {/* MATCH BY NEED */}
      <section style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#E07B2A", textTransform: "uppercase", marginBottom: 12 }}>FIND THE RIGHT PRODUCT</div>
            <h2 style={{ fontSize: "clamp(28px,5vw,44px)", fontWeight: 800, color: "#0f172a", margin: 0 }}>Not sure where to start? Match<br />by business need.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {NEEDS.map((need) => (
              <div key={need.quote} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 26px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>{need.quote}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.55 }}>{need.desc}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {need.tags.map((t, i) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{
                        background: need.highlight ? "#f0f4ff" : "#f1f5f9", color: "#334155",
                        borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600,
                        border: "1px solid #e2e8f0",
                      }}>{t}</span>
                      {i < need.tags.length - 1 && <span style={{ color: "#E07B2A", fontWeight: 700, fontSize: 14 }}>+</span>}
                    </span>
                  ))}
                </div>
                <a href="#" style={{ fontSize: 13, fontWeight: 600, color: "#3B5BDB", textDecoration: "none" }}>{need.cta}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONNECTED WORKFLOWS */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#E07B2A", textTransform: "uppercase", marginBottom: 14 }}>CONNECTED WORKFLOWS</div>
          <h2 style={{ fontSize: "clamp(26px,5vw,42px)", fontWeight: 800, margin: "0 0 12px", color: "#0f172a" }}>Start with one product. Expand<br />when ready.</h2>
          <p style={{ color: "#64748b", fontSize: 16, margin: "0 0 48px" }}>The platform advantage shows up in the handoffs across products.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, textAlign: "left" }}>
            {WORKFLOWS.map((wf) => (
              <div key={wf.label} style={{
                border: "1px solid #e2e8f0", borderRadius: 14, padding: "22px 24px",
                background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 14 }}>{wf.label}</div>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  {wf.steps.map((step, i) => (
                    <span key={step} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        background: "#f1f5f9", border: "1px solid #e2e8f0",
                        borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 500, color: "#334155",
                      }}>{step}</span>
                      {i < wf.steps.length - 1 && <span style={{ color: "#94a3b8", fontSize: 16 }}>→</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40 }}>
            <button style={{
              background: "#1E3A8A", color: "#fff", border: "none",
              borderRadius: 999, padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}>See Connected Workflows →</button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#3B5BDB", textTransform: "uppercase", marginBottom: 12 }}>PRODUCT FAQS</div>
            <h2 style={{ fontSize: "clamp(26px,5vw,40px)", fontWeight: 800, color: "#0f172a", margin: 0 }}>Common product questions.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQS.map((q, i) => (
              <div key={q} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", background: "none", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 22px", fontSize: 15, fontWeight: 600, color: "#0f172a",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  {q}
                  <span style={{
                    fontSize: 18, color: "#94a3b8", transform: openFaq === i ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s", display: "inline-block",
                  }}>⌄</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 22px 18px", fontSize: 14, color: "#64748b", lineHeight: 1.65 }}>
                    {i === 0 && "There are nine core products organized across five pillars: People (HR, Time, Payroll), Money (Billing, Spend), Work (Projects), Supply (Inventory), and Control (Comply, Insights)."}
                    {i === 1 && "No. Docs Pro is a premium capability layer that runs across all pillars. It is not a standalone product and is not counted as Product 10."}
                    {i === 2 && "Zoiko One does not include a traditional general ledger. Instead, ZoikoCorex serves as the financial truth layer, connected to Billing and Spend for real-time financial visibility."}
                    {i === 3 && "Yes. You can start with a single product and expand into connected workflows across pillars when your business is ready."}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 36 }}>
            <button onClick={() => navigate("/get-demo")} style={{
              background: "linear-gradient(135deg, #E07B2A, #c9651a)",
              color: "#fff", border: "none", borderRadius: 999,
              padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}>Get a Demo →</button>
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{
            background: "linear-gradient(135deg, #1E3A8A 0%, #3B5BDB 100%)",
            borderRadius: 24, padding: "48px 40px", textAlign: "center",
            boxShadow: "0 8px 32px rgba(30,58,138,0.2)",
          }}>
            <h2 style={{ fontSize: "clamp(24px,5vw,36px)", fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>
              Start with one product. Scale into one platform.
            </h2>
            <p style={{ fontSize: 15, color: "#bfdbfe", margin: "0 0 32px", lineHeight: 1.6 }}>
              Choose the product your business needs today, then expand into connected workflows across all five pillars.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => navigate("/get-demo")} style={{
                background: "#E07B2A", color: "#fff", border: "none",
                borderRadius: 999, padding: "12px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>Get a Demo</button>
              <button style={{
                background: "transparent", color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.4)",
                borderRadius: 999, padding: "12px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>Request Pricing</button>
              <button style={{
                background: "transparent", color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.4)",
                borderRadius: 999, padding: "12px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>Find Your Product Fit</button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}