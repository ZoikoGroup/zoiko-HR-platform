import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { billingService } from "../../service/billingService";
import {
  ArrowLeft, CreditCard, Loader2, CheckCircle2, XCircle, FileText, Building2,
} from "lucide-react";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";

const BLUE = "#3B82F6";
const EMERALD = "#10B981";
const RED = "#EF4444";
const INK = "#0A1128";
const INK_SOFT = "#475569";
const LINE = "rgba(10,17,40,0.08)";

export default function PayInvoicePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const invoiceNumber = searchParams.get("invoice");

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(() => {
    if (!invoiceNumber) {
      setError("No invoice number was provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    billingService.getQuotationInvoice(invoiceNumber)
      .then((res) => setInvoice(res))
      .catch((err) => setError(err?.message || "Unable to load this invoice."))
      .finally(() => setLoading(false));
  }, [invoiceNumber]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      notify("Payment completed successfully! Your plan is now active.", "success");
      searchParams.delete("payment");
      setSearchParams(searchParams, { replace: true });
    } else if (paymentStatus === "cancelled") {
      notify("Stripe checkout was cancelled.", "error");
      searchParams.delete("payment");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = () => {
    if (!invoice) return;
    setPaying(true);
    const origin = window.location.origin;
    const payload = {
      plan_id: invoice.plan_id,
      organization_id: invoice.organization_id,
      billing_cycle: invoice.billing_cycle,
      success_url: `${origin}/organization-admin/pay-invoice?invoice=${invoiceNumber}&payment=success`,
      cancel_url: `${origin}/organization-admin/pay-invoice?invoice=${invoiceNumber}&payment=cancelled`,
    };
    billingService.createCheckoutSession(payload)
      .then((res) => {
        if (res?.checkout_url) {
          notify("Redirecting to Stripe secure checkout...", "success");
          window.location.href = res.checkout_url;
        } else {
          load();
        }
      })
      .catch((err) => notify(err?.message || "Stripe checkout session failed.", "error"))
      .finally(() => setPaying(false));
  };

  const wrapperStyle = {
    background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)",
  };

  if (loading) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={wrapperStyle}>
        <div className="text-center py-20 text-[13px] flex items-center justify-center gap-2" style={{ color: INK_SOFT }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading invoice...
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={wrapperStyle}>
        <div className="max-w-md mx-auto mt-20 rounded-2xl border bg-white p-8 text-center" style={{ borderColor: LINE }}>
          <XCircle className="w-10 h-10 mx-auto mb-3" style={{ color: RED }} />
          <p className="text-[14px] font-semibold" style={{ color: INK }}>Unable to load invoice</p>
          <p className="text-[12.5px] mt-1" style={{ color: INK_SOFT }}>{error || "This invoice could not be found."}</p>
          <button onClick={() => navigate("/organization-admin/dashboard")} className="mt-5 text-[12.5px] font-semibold cursor-pointer" style={{ color: BLUE }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const alreadyAccepted = invoice.status === "accepted" || invoice.status === "ACCEPTED";

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={wrapperStyle}>
      {toast ? (
        <div className="fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-[12.5px] font-semibold shadow-lg transition-all"
          style={{ background: toast.type === "error" ? RED : EMERALD, color: "#fff" }}>
          {toast.message}
        </div>
      ) : null}

      <button onClick={() => navigate("/organization-admin/dashboard")} className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-4 cursor-pointer" style={{ color: BLUE }}>
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img src={zoikoIcon} className="w-10 h-10" alt="ZoikoHR" />
        </div>
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>Pay Invoice</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>
            Complete your payment securely via Stripe
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-5">
          <FileText className="w-5 h-5" style={{ color: BLUE }} />
          <span className="text-[15px] font-bold" style={{ color: INK }}>Invoice {invoice.invoice_number}</span>
        </div>

        <div className="rounded-xl p-4 mb-5" style={{ background: "#F8FAFC", border: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4" style={{ color: INK_SOFT }} />
            <span className="text-[13px] font-semibold" style={{ color: INK }}>{invoice.organization_name}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <p style={{ color: INK_SOFT }}>Plan</p>
              <p className="font-semibold" style={{ color: INK }}>{invoice.plan_name} ({invoice.billing_cycle})</p>
            </div>
            <div>
              <p style={{ color: INK_SOFT }}>Quote #</p>
              <p className="font-semibold" style={{ color: INK }}>{invoice.quote_number}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6 px-1">
          <span className="text-[13px]" style={{ color: INK_SOFT }}>Amount Due</span>
          <span className="text-2xl font-extrabold" style={{ color: INK }}>{invoice.amount_display}</span>
        </div>

        {alreadyAccepted ? (
          <button
            onClick={handlePay}
            disabled={paying}
            className="w-full py-3 px-4 rounded-xl text-[13.5px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60 bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {paying ? "Redirecting to Stripe..." : "Pay with Stripe"}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[12.5px] rounded-xl p-3" style={{ background: "#FEF3C7", color: "#92400E" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            This quotation must be accepted before payment can be made.
          </div>
        )}
      </div>
    </div>
  );
}
