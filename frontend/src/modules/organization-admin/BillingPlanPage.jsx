import React, { useState, useEffect, useCallback } from "react";
import { BillingSkeleton } from "../../components/OrgAdminSkeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { billingService } from "../../service/billingService";
import {
  ArrowLeft, CreditCard, ShieldCheck, ShieldX, Package, Users,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, RotateCcw,
  BadgeCheck, Ban, Info, Zap, ExternalLink, Check,
} from "lucide-react";
import zoikoIcon from "../../assets/zoikohr-icon-svg.svg";

const BLUE = "#3B82F6";
const EMERALD = "#10B981";
const AMBER = "#F59E0B";
const RED = "#EF4444";
const INK = "#0A1128";
const INK_SOFT = "#475569";
const BLUE_100 = "#DBEAFE";
const EMERALD_100 = "#D1FAE5";
const AMBER_100 = "#FEF3C7";
const RED_100 = "#FEE2E2";
const LINE = "rgba(10,17,40,0.08)";

// Backend role values (match _get_billing_role / _me_billing_actor).
const OWNER_ROLES = ["super_admin", "admin", "hr_admin", "billing_admin"];
const ACTOR_ROLES = ["super_admin", "admin", "hr_admin", "billing_admin"];

const STATE_META = {
  ENTITLED_AVAILABLE: { label: "Enabled", color: EMERALD, bg: EMERALD_100, Icon: CheckCircle2 },
  NOT_ENTITLED: { label: "Not in plan", color: AMBER, bg: AMBER_100, Icon: XCircle },
  ENTITLED_NOT_CONFIGURED: { label: "Not configured", color: "#64748B", bg: "#F1F5F9", Icon: Info },
  ENTITLED_POLICY_BLOCKED: { label: "Policy blocked", color: RED, bg: RED_100, Icon: ShieldX },
};

function fmtPlanLabel(planCode) {
  if (!planCode) return "—";
  return String(planCode).replace(/_/g, " ").toUpperCase();
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatTile({ icon: Icon, color, bg, label, value, sub }) {
  return (
    <div className="rounded-[14px] border bg-white p-4 shadow-[0_1px_2px_rgba(10,17,40,0.04),0_8px_24px_-12px_rgba(10,17,40,0.10)]" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-[32px] h-[32px] rounded-[9px] flex items-center justify-center" style={{ background: bg || BLUE_100 }}>
          <Icon className="w-4 h-4" strokeWidth={2.5} style={{ color: color || BLUE }} />
        </div>
        <span className="text-[11.5px] font-semibold" style={{ color: INK_SOFT }}>{label}</span>
      </div>
      <p className="text-[20px] font-bold tracking-[-0.01em] capitalize" style={{ color: INK }}>{value}</p>
      {sub ? <p className="text-[11px] mt-0.5" style={{ color: INK_SOFT }}>{sub}</p> : null}
    </div>
  );
}

function ActionButton({ Icon, label, color, bg, onClick, disabled, busy, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-[11px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
      style={{ color, background: bg }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} /> : <Icon className="w-4 h-4" strokeWidth={2.5} />}
      {label}
    </button>
  );
}

export default function OrgAdminBillingPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sub, setSub] = useState(null);
  const [ent, setEnt] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [impact, setImpact] = useState(null);
  const [toast, setToast] = useState(null);

  const role = user?.role;
  const isOwner = OWNER_ROLES.includes(role);
  const canAct = ACTOR_ROLES.includes(role);

  const notify = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      billingService.getMySubscription(),
      billingService.getMyEntitlements(),
      billingService.getPlans().catch(() => ({ list: [] })),
    ])
      .then(([subRes, entRes, plansRes]) => {
        setSub(subRes);
        setEnt(entRes);
        setPlans(plansRes?.list || []);
      })
      .catch((err) => setError(err?.message || "Failed to load billing details."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle URL payment status query params (e.g. ?payment=success)
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      notify("Stripe payment completed successfully! Your plan is updated.", "success");
      searchParams.delete("payment");
      setSearchParams(searchParams, { replace: true });
    } else if (paymentStatus === "cancelled") {
      notify("Stripe payment checkout was cancelled.", "error");
      searchParams.delete("payment");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const runAction = (key, fn, successMsg) => {
    setBusy(key);
    fn()
      .then(() => {
        notify(successMsg);
        load();
      })
      .catch((err) => notify(err?.message || "Action failed.", "error"))
      .finally(() => setBusy(null));
  };

  const handleCancel = () => {
    if (!window.confirm("Cancel your subscription at the end of the current period? Your data will be retained.")) return;
    runAction("cancel", () => billingService.cancelMySubscription({ reason: "cancel_at_period_end" }), "Cancellation scheduled for end of period.");
  };

  const handleReactivate = () => {
    runAction("reactivate", () => billingService.reactivateMySubscription({ reason: "reactivated-self-serve" }), "Subscription reactivated.");
  };

  const handleDowngrade = () => {
    setBusy("impact");
    billingService.myDowngradeImpact({ target_plan_code: "core" })
      .then((res) => setImpact(res))
      .catch((err) => notify(err?.message || "Downgrade check failed.", "error"))
      .finally(() => setBusy(null));
  };

  const handleStripeCheckout = (plan) => {
    if (!canAct) {
      notify("Payment changes require an organization billing authority.", "error");
      return;
    }
    const targetOrgId = sub?.organization_id || user?.organization_id;
    if (!targetOrgId) {
      notify("Organization context is missing for checkout.", "error");
      return;
    }

    setBusy(`checkout-${plan.id}`);
    const origin = window.location.origin;
    const payload = {
      plan_id: plan.id,
      organization_id: targetOrgId,
      billing_cycle: billingCycle,
      success_url: `${origin}/organization-admin/billing-and-plan?payment=success`,
      cancel_url: `${origin}/organization-admin/billing-and-plan?payment=cancelled`,
    };

    billingService.createCheckoutSession(payload)
      .then((res) => {
        if (res?.checkout_url) {
          notify("Redirecting to Stripe secure checkout...", "success");
          window.location.href = res.checkout_url;
        } else {
          notify("Checkout session created successfully.", "success");
          load();
        }
      })
      .catch((err) => {
        const msg = err?.message || "Stripe checkout session failed.";
        notify(msg, "error");
      })
      .finally(() => setBusy(null));
  };

  if (loading) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
        <div className="text-center py-20 text-[13px] flex items-center justify-center gap-2" style={{ color: INK_SOFT }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading billing details...
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
        <div className="text-center py-20 text-[13px]" style={{ color: INK_SOFT }}>
          {error || "Unable to load billing details."}
        </div>
      </div>
    );
  }

  const status = sub.status || "—";
  const planCode = sub.plan_code;
  const planName = sub.plan_name || fmtPlanLabel(planCode);
  const states = ent?.states || {};
  const stateList = Object.entries(states).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" style={{ background: "#F0F4F8", color: INK, minHeight: "calc(100vh - 4rem)" }}>
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

      <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img src={zoikoIcon} className="w-10 h-10" alt="ZoikoHR" />
        </div>
        <div>
          <p className="font-['Sora',system-ui,sans-serif] text-lg font-bold" style={{ color: INK }}>Billing &amp; Plan</p>
          <p className="text-[12px] font-medium" style={{ color: INK_SOFT }}>
            Manage your organization&apos;s plan, entitlements, and Stripe payments
          </p>
        </div>
        {!isOwner ? (
          <span className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: AMBER_100, color: AMBER }}>
            View-only for your role
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile icon={CreditCard} color={BLUE} bg={BLUE_100} label="Status" value={status.split("_").join(" ")} />
        <StatTile icon={Package} color={EMERALD} bg={EMERALD_100} label="Current Plan" value={planName} sub={planCode ? `code: ${planCode}` : undefined} />
        <StatTile icon={Users} color={AMBER} bg={AMBER_100} label="Active Quantity" value={sub.quantity ?? "—"} sub="seats" />
        <StatTile icon={Clock} color={BLUE} bg={BLUE_100} label="Renewal Anchor" value={fmtDate(sub.renewal_anchor_date)} sub="renewal date" />
      </div>

      {/* ── Stripe Plan Selector & Payment Section ───────────────────────────── */}
      <div className="mt-[18px] rounded-[16px] border bg-white p-5 shadow-[0_1px_2px_rgba(10,17,40,0.04)]" style={{ borderColor: LINE }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" fill="#F59E0B" />
            <div>
              <h3 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Choose a Plan &amp; Pay via Stripe</h3>
              <p className="text-[11.5px]" style={{ color: INK_SOFT }}>Select your plan tier and payment cycle to initiate secure checkout</p>
            </div>
          </div>

          {/* Billing cycle selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-3 py-1.5 text-[11.5px] font-bold rounded-lg transition-all cursor-pointer ${
                billingCycle === "monthly" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-3 py-1.5 text-[11.5px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                billingCycle === "annual" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Annual Billing
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">Save ~15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = String(p.code).toLowerCase() === String(planCode).toLowerCase();
            const price = billingCycle === "annual" ? p.annual_price : p.monthly_price;
            const priceLabel = p.is_contract_priced
              ? "Custom Pricing"
              : price !== null && price !== undefined
              ? `$${price} / ${billingCycle === "annual" ? "year" : "mo"}`
              : "Contact Sales";

            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  isCurrent ? "border-blue-500 bg-blue-50/20 shadow-md ring-2 ring-blue-400/30" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-['Sora',system-ui,sans-serif] text-base font-bold capitalize" style={{ color: INK }}>
                      {p.name}
                    </span>
                    {isCurrent ? (
                      <span className="bg-blue-100 text-blue-700 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active Plan
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12px] min-h-[36px] mb-4" style={{ color: INK_SOFT }}>
                    {p.description || "Comprehensive HR capabilities for your organization."}
                  </p>
                  <div className="mb-4 pb-4 border-b border-slate-100">
                    <span className="text-2xl font-extrabold tracking-tight" style={{ color: INK }}>
                      {priceLabel}
                    </span>
                  </div>
                </div>

                <div>
                  {!p.is_contract_priced ? (
                    <button
                      onClick={() => handleStripeCheckout(p)}
                      disabled={!canAct || busy === `checkout-${p.id}`}
                      className={`w-full py-2.5 px-4 rounded-xl text-[12.5px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        !canAct
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                          : isCurrent
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow"
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow"
                      }`}
                    >
                      {busy === `checkout-${p.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      {isCurrent ? "Pay & Renew Active Plan" : "Pay & Upgrade via Stripe"}
                    </button>
                  ) : (
                    <button
                      onClick={() => notify("Enterprise plans require sales contract activation. Please contact sales.", "info")}
                      className="w-full py-2.5 px-4 rounded-xl text-[12.5px] font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" /> Contact Sales
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-[18px] rounded-[16px] border bg-white p-5 shadow-[0_1px_2px_rgba(10,17,40,0.04)]" style={{ borderColor: LINE }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: INK }}>Subscription actions</span>
          {canAct && status === "active" ? (
            <ActionButton Icon={Ban} label="Cancel at period end" color={RED} bg={RED_100} onClick={handleCancel} busy={busy === "cancel"} disabled={busy} />
          ) : null}
          {canAct && status === "cancel_at_period_end" ? (
            <ActionButton Icon={RotateCcw} label="Reactivate" color={EMERALD} bg={EMERALD_100} onClick={handleReactivate} busy={busy === "reactivate"} disabled={busy} />
          ) : null}
          {canAct ? (
            <ActionButton Icon={AlertTriangle} label="Check downgrade impact" color={AMBER} bg={AMBER_100} onClick={handleDowngrade} busy={busy === "impact"} disabled={busy} />
          ) : null}
          {!canAct ? (
            <span className="text-[12px] flex items-center gap-1.5" style={{ color: INK_SOFT }}>
              <ShieldCheck className="w-4 h-4" /> Changes require an organization billing authority.
            </span>
          ) : null}
        </div>
        {impact ? (
          <div className="mt-4 rounded-[12px] border p-4" style={{ borderColor: LINE, background: impact.eligible ? EMERALD_100 : RED_100 }}>
            <p className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: impact.eligible ? EMERALD : RED }}>
              {impact.eligible ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {impact.eligible ? "Downgrade to Core is eligible" : "Downgrade to Core is not eligible"}
            </p>
            <p className="text-[12px] mt-1" style={{ color: INK }}>
              Current plan: <b>{String(impact.current_plan_code || "—").toUpperCase()}</b> → Target: <b>{String(impact.target_plan_code || "—").toUpperCase()}</b>
            </p>
            {(impact.blockers || []).length > 0 ? (
              <ul className="mt-2 space-y-1">
                {(impact.blockers || []).map((b, i) => (
                  <li key={i} className="text-[12px] flex items-start gap-1.5" style={{ color: INK }}>
                    <BadgeCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="capitalize">{b.category}: {b.reason || "feature would be lost"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-[18px] rounded-[16px] border bg-white p-5 shadow-[0_1px_2px_rgba(10,17,40,0.04)]" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-[18px] h-[18px]" strokeWidth={2.5} style={{ color: BLUE }} />
          <div>
            <h3 className="font-['Sora',system-ui,sans-serif] text-[14.5px] font-bold" style={{ color: INK }}>Plan entitlements</h3>
            <p className="text-[11.5px] mt-0.5" style={{ color: INK_SOFT }}>Features enabled for your organization&apos;s plan</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {stateList.length > 0 ? stateList.map(([key, state]) => {
            const meta = STATE_META[state] || { label: state, color: INK_SOFT, bg: "#F1F5F9", Icon: Info };
            const Icon = meta.Icon;
            return (
              <div key={key} className="rounded-[11px] border p-3 flex items-center gap-2" style={{ borderColor: LINE, background: "#F8FAFC" }}>
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: meta.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold truncate" style={{ color: INK }}>{key}</p>
                  <p className="text-[10.5px]" style={{ color: meta.color }}>{meta.label}</p>
                </div>
              </div>
            );
          }) : (
            <p className="text-[13px]" style={{ color: INK_SOFT }}>No entitlement data returned.</p>
          )}
        </div>
      </div>
    </div>
  );
}
