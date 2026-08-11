import { ShieldCheck, Globe2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const trustLogos = ["Northpeak", "Veritas Labs", "Mercato", "Brightfield", "Hexa Group", "Stratus"];

const trustBadges = ["SOC 2 Type II", "ISO 27001", "GDPR aligned", "99.9% uptime", "Visit Trust Center"];

function Badge({ label, tag = "Home" }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "rgba(255,255,255,0.92)", borderRadius: 999,
      padding: "6px 16px", marginBottom: 28, fontSize: 14, fontWeight: 500,
      boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
    }}>
      <span style={{
        background: "#3B5BDB", color: "#fff", borderRadius: 999,
        padding: "2px 10px", fontSize: 12, fontWeight: 700
      }}>{tag}</span>
      <span style={{ color: "#555" }}>{label}</span>
    </div>
  );
}

export default function Hero() {
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
      {/* center brightening + edge color pools */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 12% 55%, rgba(255,175,90,0.25) 0%, transparent 42%), radial-gradient(ellipse at 88% 45%, rgba(140,190,235,0.28) 0%, transparent 42%), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 55%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100 }}>
        <Badge label="Nine core products + Docs Pro" />
        <h1 style={{
          fontSize: "clamp(32px,5vw,56px)", fontWeight: 800, lineHeight: 1.1,
          color: "#0B1C3F", margin: "0 0 20px"
        }}>
          Run people, time, payroll, billing, projects, compliance &{" "}
          <span style={{ color: "#E8850A" }}>insights</span> — in one{" "}
          <span style={{ color: "#1A3A8C" }}>connected platform.</span>
        </h1>
        <p style={{
          fontSize: "16px", lineHeight: 1.7, color: "#4B5563",
          margin: "0 0 12px"
        }}>
          Zoiko One connects the work behind every paycheck, invoice, project, and executive
          decision. Start with one product, add more when you're ready, and run business
          operations from one connected operating layer.
        </p>
        <p style={{
          fontSize: "13px", color: "#4B5563", marginBottom: "28px", fontStyle: "italic"
        }}>
          Start with one product, activate a pillar or scale into the full platform.
        </p>
        <div style={{
          display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap"
        }}>
          <button onClick={() => navigate("/get-demo")} style={{
            background: "linear-gradient(135deg, #F97316, #EA580C)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>Get a Demo →</button>
          <button onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })} style={{
            background: "rgba(255,255,255,0.75)", color: "#1a1a2e",
            border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 999,
            padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}>Explore Products</button>
        </div>
      </div>

      {/* Trust badges */}
      <div style={{
        position: "relative", zIndex: 1, marginTop: "40px",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "24px", flexWrap: "wrap"
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#6B7280" }}>
          <ShieldCheck size={14} color="#1A3A8C" /> SOC 2 · ISO 27001 ready
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#6B7280" }}>
          <Globe2 size={14} color="#1A3A8C" /> Multi-currency · global ready
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#6B7280" }}>
          <Sparkles size={14} color="#1A3A8C" /> 99.9% uptime commitment
        </span>
      </div>

      {/* Trust strip */}
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: "1280px",
        marginTop: "48px", paddingTop: "32px",
        borderTop: "1px solid rgba(0,0,0,0.06)"
      }}>
        <p style={{
          textAlign: "center", fontSize: "12px", color: "#9CA3AF", marginBottom: "16px"
        }}>
          Built for controlled business operations from day one — trusted across regions &
          industries
        </p>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "32px", flexWrap: "wrap", fontSize: "14px", fontWeight: 600,
          color: "#A5B4FC", marginBottom: "16px"
        }}>
          {trustLogos.map((l) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#FBBF24", display: "inline-block" }} /> {l}
            </span>
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "12px", flexWrap: "wrap", fontSize: "12px"
        }}>
          {trustBadges.map((b) => (
            <span key={b} style={{
              background: "#fff", border: "1px solid #E5E7EB", borderRadius: "999px",
              padding: "6px 14px", color: "#3A3F66", display: "flex", alignItems: "center", gap: "4px"
            }}>
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
