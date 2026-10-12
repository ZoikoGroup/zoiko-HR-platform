import { planHighlights } from "../../config/planMatrix";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { getQuotationByToken, decideQuotation } from "../../service/quotationService";
import LandingHeader from "../../landing/LandingHeader";
import Footer from "../../landing/Footer";

const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : null;
};

/**
 * Public page behind the "Review proposal" button in the registration quotation email.
 * The token in the URL is the credential; nothing here needs a login.
 */
export default function QuotationDecisionPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [loadError, setLoadError] = useState(token ? "" : "This quotation link is incomplete. Open it again from your email.");
  const [pending, setPending] = useState(null); // "accept" | "reject"
  const [error, setError] = useState("");
  const [decision, setDecision] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    getQuotationByToken(token)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || "We could not load this quotation. Please try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function decide(choice) {
    if (pending) return;
    setPending(choice);
    setError("");
    try {
      await decideQuotation(token, choice);
      setDecision(choice);
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,.06)" };
  const btn = (bg) => ({
    flex: 1, padding: "12px 16px", borderRadius: 999, border: "none", color: "#fff", background: bg, fontSize: 15,
    fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#F9FAFB" }}>
      <LandingHeader />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          {loading ? (
            <div style={{ ...card, textAlign: "center" }} role="status">
              <Loader2 size={22} className="animate-spin" style={{ margin: "0 auto 12px" }} />
              <p style={{ margin: 0, color: "#6B7280", fontSize: 14 }}>Loading your quotation…</p>
            </div>
          ) : decision ? (
            <div style={{ ...card, textAlign: "center" }}>
              <CheckCircle2 size={36} color={decision === "accept" ? "#059669" : "#6B7280"} style={{ margin: "0 auto 12px" }} />
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>
                {decision === "accept" ? "Quotation accepted" : "Quotation declined"}
              </h1>
              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
                Your decision has been recorded. Check your email for a confirmation
                {decision === "accept" ? ", including your invoice" : ""}.
              </p>
            </div>
          ) : loadError || !quote ? (
            <div style={{ ...card, textAlign: "center" }} role="alert">
              <AlertCircle size={32} color="#DC2626" style={{ margin: "0 auto 12px" }} />
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>Quotation unavailable</h1>
              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>{loadError}</p>
            </div>
          ) : (
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <FileText size={22} color="#7C3AED" />
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Quotation {quote.quote_number}</h1>
              </div>
              {quote.organization_name ? (
                <p style={{ fontSize: 14, color: "#374151", margin: "0 0 16px" }}>Prepared for <b>{quote.organization_name}</b></p>
              ) : null}
              <dl style={{ margin: "0 0 20px", display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 24, fontSize: 14 }}>
                <dt style={{ color: "#6B7280" }}>Plan</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>{quote.plan}</dd>
                <dt style={{ color: "#6B7280" }}>Billing</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 600, textTransform: "capitalize" }}>{quote.billing_cycle}</dd>
                <dt style={{ color: "#6B7280" }}>Amount</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 800, fontSize: 18 }}>{quote.amount_display}</dd>
                {fmtDate(quote.valid_until) ? (<><dt style={{ color: "#6B7280" }}>Valid until</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>{fmtDate(quote.valid_until)}</dd></>) : null}
              </dl>
              {(() => {
                const h = planHighlights(String(quote.plan || "").toLowerCase());
                return (
                  <div data-testid="quote-plan-scope" style={{ margin: "0 0 20px", padding: "12px 14px", background: "#F8FAFC", borderRadius: 10, fontSize: 13, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>What the {quote.plan} plan includes</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#065F46" }}>{h.includes.map((f) => <li key={f}>&#10003; {f}</li>)}</ul>
                    {h.excludes.length > 0 ? (
                      <>
                        <div style={{ fontWeight: 600, color: "#6B7280", margin: "8px 0 2px" }}>Not included (available in Advanced)</div>
                        <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#9CA3AF" }}>{h.excludes.map((f) => <li key={f}>&#10005; {f}</li>)}</ul>
                      </>
                    ) : null}
                  </div>
                );
              })()}
              {error ? (
                <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" onClick={() => decide("accept")} disabled={Boolean(pending)} style={{ ...btn("#059669"), opacity: pending ? 0.6 : 1 }}>
                  {pending === "accept" ? <Loader2 size={16} className="animate-spin" /> : null} Accept quote
                </button>
                <button type="button" onClick={() => decide("reject")} disabled={Boolean(pending)} style={{ ...btn("#DC2626"), opacity: pending ? 0.6 : 1 }}>
                  {pending === "reject" ? <Loader2 size={16} className="animate-spin" /> : null} Decline quote
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
