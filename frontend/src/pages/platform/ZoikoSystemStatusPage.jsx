import React from "react";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const services = [
  { name: "Authentication & ZoikoID",            status: "operational" },
  { name: "People — HR, Time, Payroll",           status: "operational" },
  { name: "Money — Billing, Spend",               status: "operational" },
  { name: "Work — Projects",                      status: "operational" },
  { name: "Supply — Inventory",                   status: "operational" },
  { name: "Control — Comply, Insights",           status: "operational" },
  { name: "Documents & Docs Pro",                 status: "operational" },
  { name: "API & Webhooks",                       status: "degraded" },
  { name: "Integrations — Zoiko Connect",         status: "operational" },
  { name: "Scheduled maintenance — reporting",    status: "maintenance" },
];

const uptimeBars = Array.from({ length: 90 }, (_, i) => {
  if (i >= 80 && i <= 83) return "orange";
  return "green";
});

const STATUS_CONFIG = {
  operational:  { label: "Operational",           dot: "#22c55e", bg: "#f0fdf4", text: "#15803d" },
  degraded:     { label: "Degraded performance",  dot: "#f97316", bg: "#fff7ed", text: "#c2410c" },
  maintenance:  { label: "Maintenance Jun 22",    dot: "#3b82f6", bg: "#eff6ff", text: "#1d4ed8" },
};

const S = {
  page: {
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    background: "#f5f5fb",
    color: "#1a1a4e",
    margin: 0,
    padding: 0,
    width: "100%",
    overflowX: "hidden",
  },
  topBannerWrap: {
    background: "linear-gradient(160deg,#f0f0fa 0%,#eef5ff 100%)",
    padding: "48px 24px 0",
  },
  topBanner: {
    maxWidth: 960,
    margin: "0 auto",
    background: "linear-gradient(135deg,#1fad6a 0%,#22c55e 100%)",
    borderRadius: 18,
    padding: "22px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  bannerLeft: { display: "flex", alignItems: "center", gap: 16 },
  bannerDot: {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bannerDotInner: {
    width: 16, height: 16, borderRadius: "50%",
    background: "#fff",
  },
  bannerTitle: { fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 2 },
  bannerSub: { fontSize: 12.5, color: "rgba(255,255,255,0.78)" },
  bannerActions: { display: "flex", gap: 10, flexShrink: 0 },
  bannerBtn: {
    background: "rgba(255,255,255,0.18)",
    border: "1.5px solid rgba(255,255,255,0.35)",
    color: "#fff", borderRadius: 50,
    padding: "9px 18px", fontSize: 13.5,
    fontWeight: 600, cursor: "pointer",
  },
  healthSection: {
    padding: "80px 24px 60px",
    background: "#ffffff",
  },
  healthInner: { maxWidth: 780, margin: "0 auto" },
  labelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#4a3fc0",
    textTransform: "uppercase", letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 14,
  },
  sectionH2: {
    fontSize: "clamp(26px,4vw,38px)", fontWeight: 800,
    color: "#1a1a4e", textAlign: "center",
    lineHeight: 1.2, marginBottom: 36,
  },
  serviceList: { display: "flex", flexDirection: "column", gap: 10 },
  serviceRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 16,
    border: "1.5px solid #eaeaea", borderRadius: 12,
    padding: "16px 20px", background: "#fff",
  },
  serviceName: { fontSize: 14.5, fontWeight: 500, color: "#1a1a4e" },
  statusBadge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    borderRadius: 50, padding: "5px 12px",
    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  },
  statusDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  incidentsSection: {
    padding: "60px 24px 80px",
    background: "#f5f5fb",
  },
  incidentsInner: {
    maxWidth: 960, margin: "0 auto",
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48,
  },
  colLabel: {
    fontSize: 11.5, fontWeight: 700, color: "#f97316",
    textTransform: "uppercase", letterSpacing: "0.12em",
    marginBottom: 12,
  },
  colLabelBlue: {
    fontSize: 11.5, fontWeight: 700, color: "#3b82f6",
    textTransform: "uppercase", letterSpacing: "0.12em",
    marginBottom: 12,
  },
  colH3: { fontSize: "clamp(20px,3vw,28px)", fontWeight: 800, color: "#1a1a4e", marginBottom: 20 },
  incidentCard: {
    background: "#fff",
    border: "1.5px solid #eaeaea",
    borderLeft: "4px solid #f97316",
    borderRadius: 12,
    padding: "20px 20px",
    marginBottom: 20,
  },
  incidentTop: {
    display: "flex", alignItems: "flex-start",
    justifyContent: "space-between", gap: 12, marginBottom: 12,
  },
  incidentTitle: { fontSize: 14.5, fontWeight: 700, color: "#1a1a4e" },
  monitoringBadge: {
    background: "#fff7ed", color: "#c2410c",
    fontSize: 12, fontWeight: 700, borderRadius: 50,
    padding: "4px 10px", whiteSpace: "nowrap", flexShrink: 0,
  },
  incidentDesc: { fontSize: 13.5, color: "#555", lineHeight: 1.6, marginBottom: 12 },
  incidentMeta: { fontSize: 12, color: "#aaa" },
  viewHistory: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 14.5, fontWeight: 700, color: "#1a1a4e",
    padding: 0, textDecoration: "none",
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  maintenanceCard: {
    background: "#fff",
    border: "1.5px solid #eaeaea",
    borderRadius: 12, padding: "20px 20px", marginBottom: 24,
  },
  maintTitle: { fontSize: 14.5, fontWeight: 700, color: "#1a1a4e", marginBottom: 10 },
  maintDesc: { fontSize: 13.5, color: "#555", lineHeight: 1.6, marginBottom: 12 },
  maintDate: { fontSize: 12.5, color: "#aaa" },
  uptimeLabel: { fontSize: 12.5, color: "#888", marginBottom: 8 },
  uptimeBars: { display: "flex", gap: 2, flexWrap: "nowrap" },
  uptimeBar: { width: 5, height: 20, borderRadius: 2, flexShrink: 0 },
  ctaSection: { padding: "40px 28px 60px", background: "#f5f5fb" },
  ctaCard: {
    maxWidth: 960, margin: "0 auto",
    background: "linear-gradient(135deg,#5b2d8e 0%,#4a3fc0 35%,#3a6fd8 70%,#4ab0f5 100%)",
    borderRadius: 22, padding: "64px 48px", textAlign: "center",
  },
  ctaH2: {
    fontSize: "clamp(24px,4vw,38px)", fontWeight: 800,
    color: "#fff", marginBottom: 12, lineHeight: 1.2,
  },
  ctaSub: {
    fontSize: 15, color: "rgba(255,255,255,0.78)",
    marginBottom: 32, lineHeight: 1.55,
  },
  ctaActions: { display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  btnCtaOrange: {
    background: "#f97316", color: "#fff", border: "none",
    borderRadius: 50, padding: "14px 28px",
    fontSize: 14.5, fontWeight: 700, cursor: "pointer",
  },
  btnCtaGhost: {
    background: "rgba(255,255,255,0.15)", color: "#fff",
    border: "1.5px solid rgba(255,255,255,0.28)",
    borderRadius: 50, padding: "13px 24px",
    fontSize: 14.5, fontWeight: 600, cursor: "pointer",
  },
};

export default function ZoikoSystemStatusPage() {
  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#f5f5fb", minHeight: "100vh", overflowX: "hidden" }}>
      <LandingHeader />
      <div style={S.page}>
        <div style={S.topBannerWrap}>
          <div style={S.topBanner}>
            <div style={S.bannerLeft}>
              <div style={S.bannerDot}>
                <div style={S.bannerDotInner} />
              </div>
              <div>
                <div style={S.bannerTitle}>All systems operational</div>
                <div style={S.bannerSub}>Last updated: June 18, 2026 · 09:42 · UTC</div>
              </div>
            </div>
            <div style={S.bannerActions}>
              <button style={S.bannerBtn}>Subscribe to Updates</button>
              <button style={S.bannerBtn}>Contact Support</button>
            </div>
          </div>
        </div>

        <section style={S.healthSection}>
          <div style={S.healthInner}>
            <div style={S.labelBlue}>Service Health</div>
            <h2 style={S.sectionH2}>Status by service area.</h2>
            <div style={S.serviceList}>
              {services.map((svc) => {
                const cfg = STATUS_CONFIG[svc.status];
                return (
                  <div key={svc.name} style={S.serviceRow}>
                    <span style={S.serviceName}>{svc.name}</span>
                    <span style={{
                      ...S.statusBadge,
                      background: cfg.bg,
                      color: cfg.text,
                    }}>
                      <span style={{ ...S.statusDot, background: cfg.dot }} />
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={S.incidentsSection}>
          <div style={S.incidentsInner}>
            <div>
              <div style={S.colLabel}>Active Incidents</div>
              <h3 style={S.colH3}>Current incidents</h3>
              <div style={S.incidentCard}>
                <div style={S.incidentTop}>
                  <span style={S.incidentTitle}>API latency — investigating</span>
                  <span style={S.monitoringBadge}>Monitoring</span>
                </div>
                <p style={S.incidentDesc}>
                  We identified elevated API response times affecting some webhook
                  deliveries. A fix has been applied and we are monitoring recovery. No data
                  loss. Next update within 60 minutes.
                </p>
                <div style={S.incidentMeta}>Started 08:55 UTC · Updated 09:40 UTC</div>
              </div>
              <button style={S.viewHistory}>View Incident History →</button>
            </div>

            <div>
              <div style={S.colLabelBlue}>Scheduled Maintenance</div>
              <h3 style={S.colH3}>Planned changes</h3>
              <div style={S.maintenanceCard}>
                <div style={S.maintTitle}>Reporting service upgrade</div>
                <p style={S.maintDesc}>
                  A reporting performance upgrade is scheduled. Brief delays in
                  dashboard refresh may occur. No action required.
                </p>
                <div style={S.maintDate}>June 22, 2026 · 01:00–03:00 UTC</div>
              </div>

              <div style={S.uptimeLabel}>90-day uptime, API service</div>
              <div style={S.uptimeBars}>
                {uptimeBars.map((color, i) => (
                  <div
                    key={i}
                    style={{
                      ...S.uptimeBar,
                      background: color === "green" ? "#22c55e" : "#f97316",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section style={S.ctaSection}>
          <div style={S.ctaCard}>
            <h2 style={S.ctaH2}>Stay informed.</h2>
            <p style={S.ctaSub}>
              Subscribe for status updates, or reach support if an issue is<br />
              affecting your workflow.
            </p>
            <div style={S.ctaActions}>
              <button style={S.btnCtaOrange}>Subscribe to Updates</button>
              <button style={S.btnCtaGhost}>Contact Support</button>
              <button style={S.btnCtaGhost}>Trust Center</button>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
