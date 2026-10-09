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
import PlanComparison from "../../components/PlanComparison";
import { formatDate } from "../../utils/dateTime";

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
    : formatDate(d);
}

function StatTile({ icon: Icon, color, bg, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

// For now the organization admin is offered three plans only, always in this order.
const OFFERED_PLAN_CODES = ["core", "advanced", "enterprise"];
export function offeredPlans(list) {
  const byCode = new Map();
  (Array.isArray(list) ? list : []).forEach((p) => { const c = String(p?.code || "").toLowerCase(); if (!byCode.has(c)) byCode.set(c, p); });
  return OFFERED_PLAN_CODES.map((c) => byCode.get(c)).filter(Boolean);
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
  const [downgradeTarget, setDowngradeTarget] = useState(null); // the lower plan the customer is considering
  const [pending, setPending] = useState(null); // a downgrade already scheduled for the end of the period
  const [toast, setToast] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(null); // a paid Stripe session we could not confirm yet: the id, so it can be retried
  const confirmingRef = React.useRef(null);
  const loadSeq = React.useRef(0);        // only the newest load may write to the page
  const hasPlan = React.useRef(false);
  // Coming back from Stripe the page must settle the payment BEFORE it reads the plan; reading both at once let the
  // older (pre-payment) answer arrive last and put the old plan back on screen.
  const returningFromStripe = React.useRef(!!searchParams.get("session_id") && !!user?.organization_id);

  const role = user?.role;
  const isOwner = OWNER_ROLES.includes(role);
  const canAct = ACTOR_ROLES.includes(role);

  const notify = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    if (!hasPlan.current) setLoading(true);      // the first read shows the spinner; later refreshes keep the page on screen
    setError(null);
    return Promise.all([
      billingService.getMySubscription(),
      billingService.getMyEntitlements(),
      billingService.getPlans().catch(() => ({ list: [] })),
    ])
      .then(([subRes, entRes, plansRes]) => {
        if (seq !== loadSeq.current) return;
        hasPlan.current = true;
        setSub(subRes);
        setEnt(entRes);
        setPlans(offeredPlans(plansRes?.list));
      })
      .catch((err) => { if (seq === loadSeq.current) setError(err?.message || "Failed to load billing details."); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, []);

  useEffect(() => {
    if (returningFromStripe.current) return;     // the confirmation below reads the plan once the payment is settled
    load();
  }, [load]);

  // Confirm a Stripe Checkout Session handed back on the redirect.
  //
  // Stripe cannot deliver webhooks to a localhost dev server (or to any host
  // without an ingress), so the redirect is the only channel guaranteed to
  // reach us. The endpoint is idempotent, so a webhook that also arrives is a
  // no-op — this just makes the UI correct even when the webhook never does.
  const confirmSession = useCallback(
    (sessionId, attempt) => {
      const targetOrgId = sub?.organization_id || user?.organization_id;
      if (!targetOrgId) {
        // Subscription/identity still loading. Leave the ref unset so this
        // effect runs again once they arrive — dropping it here would abandon
        // a payment the customer already made.
        confirmingRef.current = null;
        setConfirming(false);
        return;
      }
      billingService
        .confirmCheckoutSession({
          organization_id: targetOrgId,
          checkout_session_id: sessionId,
        })
        .then((res) => {
          if (res?.status === "confirmed") {
            setConfirming(false);
            setUnconfirmed(null);
            returningFromStripe.current = false;
            notify(res?.message || "Payment confirmed. Your plan has been updated.", "success");
            load();
          } else if (res?.status === "pending" && attempt < 8) {
            // Session is complete on Stripe but the state transition has not
            // landed yet — retry a few times before giving up.
            setTimeout(() => confirmSession(sessionId, attempt + 1), 1500);
          } else if (res?.status === "pending") {
            setConfirming(false);
            setUnconfirmed(sessionId);
            returningFromStripe.current = false;
            notify(res?.message || "Payment is still being processed. Use \"Check payment again\" in a moment.", "info");
            load();
          } else {
            setConfirming(false);
            setUnconfirmed(res?.status === "failed" && /refunded/i.test(res?.message || "") ? null : sessionId);
            returningFromStripe.current = false;
            notify(res?.message || "Payment could not be confirmed.", "error");
            load();
          }
        })
        .catch((err) => {
          setConfirming(false);
          setUnconfirmed(sessionId);
          returningFromStripe.current = false;
          notify(err?.message || "Payment confirmation failed.", "error");
          load();
        });
    },
    [sub, user, load]
  );

  // Handle URL payment status query params (e.g. ?payment=success)
  const paymentShownRef = React.useRef(false);
  const searchKey = searchParams.toString();
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const sessionId = searchParams.get("session_id");
    let changed = false;

    if (paymentStatus && !paymentShownRef.current) {
      paymentShownRef.current = true;
      notify(
        paymentStatus === "success"
          ? "Stripe payment completed successfully!"
          : "Stripe payment checkout was cancelled.",
        paymentStatus === "success" ? "success" : "error"
      );
      searchParams.delete("payment");
      changed = true;
    }

    if (sessionId && confirmingRef.current !== sessionId) {
      const targetOrgId = sub?.organization_id || user?.organization_id;
      if (targetOrgId) {
        // Only consume the session id once it can actually be confirmed.
        // Stripping it while the subscription is still loading would abandon
        // a payment the customer has already made.
        confirmingRef.current = sessionId;
        searchParams.delete("session_id");
        setConfirming(true);
        confirmSession(sessionId, 0);
        changed = true;
      }
    }

    if (changed) setSearchParams(searchParams, { replace: true });
    // searchKey (not the object) — react-router hands back a fresh object on
    // every render, which would otherwise re-run this effect per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, confirmSession, sub, user]);

  const loadPending = useCallback(() => {
    billingService.getMyPendingPlanChange()
      .then((res) => setPending(res?.pending || null))
      .catch(() => setPending(null));
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

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

  // Picking a lower plan first shows exactly what changes; nothing happens until the customer confirms.
  const openDowngrade = (plan) => {
    setDowngradeTarget(plan);
    setImpact(null);
    setBusy("impact");
    billingService.myDowngradeImpact({ target_plan_code: String(plan.code).toLowerCase() })
      .then((res) => setImpact(res))
      .catch((err) => { setDowngradeTarget(null); notify(err?.message || "Downgrade check failed.", "error"); })
      .finally(() => setBusy(null));
  };

  const confirmDowngrade = () => {
    if (!downgradeTarget) return;
    setBusy("downgrade");
    billingService.scheduleMyDowngrade({ target_plan_code: String(downgradeTarget.code).toLowerCase() })
      .then((res) => {
        notify(`Your plan will change to ${downgradeTarget.name} on ${fmtDate(res?.effective_at)}. Until then nothing changes.`, "success");
        setDowngradeTarget(null);
        setImpact(null);
        loadPending();
      })
      .catch((err) => notify(err?.message || "The downgrade could not be scheduled.", "error"))
      .finally(() => setBusy(null));
  };

  const keepCurrentPlan = () => {
    setBusy("keep");
    billingService.cancelMyPendingPlanChange()
      .then(() => { notify("Your downgrade was cancelled. You stay on your current plan.", "success"); setPending(null); })
      .catch((err) => notify(err?.message || "Could not cancel the downgrade.", "error"))
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
        } else if (res?.unchanged) {
          notify(res?.message || "You are already on this plan.", "info");
          load();
        } else if (res?.updated) {
          notify(res?.message || "Plan updated. A confirmation email is on its way.", "success");
          load();
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

  const shellStyle = { background: "#F1F5F9", color: INK, minHeight: "calc(100vh - 4rem)" };
  const shellClass = "font-['Inter',system-ui,sans-serif] -m-4 sm:-m-6 lg:-m-8";

  if (loading) {
    return (
      <div className={`${shellClass} p-4 sm:p-6 lg:p-8`} style={shellStyle}>
        <div role="status" className="text-center py-20 text-[13px] flex items-center justify-center gap-2" style={{ color: INK_SOFT }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading billing details...
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className={`${shellClass} p-4 sm:p-6 lg:p-8`} style={shellStyle}>
        <div role="alert" className="max-w-md mx-auto mt-16 rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-sm">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
          <p className="mt-3 text-[14px] font-semibold" style={{ color: INK }}>{error || "Unable to load billing details."}</p>
          <button type="button" onClick={load} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }

  const status = sub.status || "—";
  const planCode = sub.plan_code;
  const onEvaluation = String(sub.status || "").toLowerCase() === "evaluation";
  const planName = sub.plan_name || (onEvaluation ? "Free evaluation" : fmtPlanLabel(planCode));
  const states = ent?.states || {};
  const stateList = Object.entries(states).sort(([a], [b]) => a.localeCompare(b));
  const statusKey = String(status).toLowerCase();
  const STATUS_TONE = {
    active: "bg-emerald-400/20 text-emerald-200 border-emerald-300/30",
    evaluation: "bg-blue-400/20 text-blue-100 border-blue-300/30",
    past_due: "bg-amber-400/20 text-amber-100 border-amber-300/30",
    cancel_at_period_end: "bg-amber-400/20 text-amber-100 border-amber-300/30",
    suspended: "bg-red-400/20 text-red-100 border-red-300/30",
    restricted: "bg-red-400/20 text-red-100 border-red-300/30",
  };
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";

  return (
    <div className={shellClass} style={shellStyle}>
      {toast ? (
        <div role="status" className="fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-[12.5px] font-semibold shadow-lg transition-all"
          style={{ background: toast.type === "error" ? RED : toast.type === "info" ? BLUE : EMERALD, color: "#fff" }}>
          {toast.message}
        </div>
      ) : null}

      {confirming ? (
        <div role="status" className="fixed top-4 left-4 z-50 rounded-xl px-4 py-3 text-[12.5px] font-semibold shadow-lg flex items-center gap-2"
          style={{ background: BLUE, color: "#fff" }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Confirming payment with Stripe...
        </div>
      ) : null}

      {/* Header banner */}
      <header className="relative overflow-hidden bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white">
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-7">
          <button onClick={() => navigate("/organization-admin/dashboard")} className="flex items-center gap-1.5 text-[12px] font-semibold mb-4 cursor-pointer text-blue-200 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} /> Back to Dashboard
          </button>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                <img src={zoikoIcon} className="w-8 h-8" alt="ZoikoHR" />
              </div>
              <div className="min-w-0">
                <h1 className="font-['Sora',system-ui,sans-serif] text-2xl font-bold tracking-tight">Billing &amp; Plan</h1>
                <p className="text-[13px] text-slate-300 mt-0.5">Your plan, payments and subscription in one place.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-white/10 border border-white/20 capitalize">{planName}</span>
              <span className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border capitalize ${STATUS_TONE[statusKey] || "bg-white/10 border-white/20"}`}>{String(status).split("_").join(" ")}</span>
              {!isOwner ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-100 border border-amber-300/30">View-only for your role</span> : null}
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-48 h-48 rounded-full bg-indigo-500/10 blur-xl pointer-events-none" />
      </header>

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {unconfirmed ? (
          <div role="alert" className="rounded-xl px-4 py-3 text-[12.5px] font-semibold flex flex-wrap items-center gap-3 border border-amber-200" style={{ background: AMBER_100, color: "#92400E" }}>
            <span>Your payment went through at Stripe, but we have not been able to confirm it on your plan yet.</span>
            <button
              type="button"
              onClick={() => { const id = unconfirmed; setUnconfirmed(null); setConfirming(true); confirmingRef.current = id; confirmSession(id, 0); }}
              className="underline cursor-pointer"
            >
              Check payment again
            </button>
          </div>
        ) : null}

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile icon={CreditCard} color={BLUE} bg={BLUE_100} label="Status" value={status.split("_").join(" ")} />
          <StatTile icon={Package} color={EMERALD} bg={EMERALD_100} label="Current Plan" value={planName} sub={onEvaluation ? "14 days, no card needed. Pick a plan below to continue." : undefined} />
          <StatTile icon={Users} color={AMBER} bg={AMBER_100} label="Seats" value={sub.quantity ?? "—"} sub="active people on your plan" />
          <StatTile icon={Clock} color={BLUE} bg={BLUE_100} label="Renews on" value={fmtDate(sub.renewal_anchor_date)} sub="next renewal date" />
        </div>

        {/* Plans */}
        <section className={`${card} p-6`} aria-labelledby="plans-heading">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600"><Zap className="w-5 h-5" /></div>
              <div>
                <h2 id="plans-heading" className="font-['Sora',system-ui,sans-serif] text-[17px] font-bold" style={{ color: INK }}>Choose your plan</h2>
                <p className="text-[12px]" style={{ color: INK_SOFT }}>Pick a plan and billing cycle. Payment is taken on the secure Stripe checkout.</p>
              </div>
            </div>
            <div role="group" aria-label="Billing cycle" className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[["monthly", "Monthly"], ["annual", "Annual"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={billingCycle === key}
                  onClick={() => setBillingCycle(key)}
                  className={`px-4 py-1.5 text-[12px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${billingCycle === key ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {label}
                  {key === "annual" ? <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">Save ~15%</span> : null}
                </button>
              ))}
            </div>
          </div>

          {plans.length === 0 ? (
            <p className="py-10 text-center text-[13px]" style={{ color: INK_SOFT }}>No plans are available right now. Please contact support.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              {plans.map((p) => {
                const code = String(p.code).toLowerCase();
                const isCurrent = code === String(planCode).toLowerCase();
                const LIVE = ["active", "past_due", "cancel_at_period_end", "suspended", "restricted"];
                // A live subscription already owns this plan: the backend will
                // refuse to re-charge it, so don't offer a pay button at all.
                const currentIsLive = isCurrent && LIVE.includes(statusKey);
                const RANK = { core: 1, advanced: 2, enterprise: 3 };
                const hasLivePlan = LIVE.includes(statusKey) && !!planCode;
                const rel = !hasLivePlan ? "subscribe"
                  : isCurrent ? "current"
                  : (RANK[code] || 0) < (RANK[String(planCode).toLowerCase()] || 0) ? "downgrade" : "upgrade";
                const scheduledHere = !!pending && String(pending.to_plan_code).toLowerCase() === code;
                const price = billingCycle === "annual" ? p.annual_price : p.monthly_price;
                const hasPrice = !p.is_contract_priced && price !== null && price !== undefined;
                const popular = code === "advanced";
                const checkoutBusy = busy === `checkout-${p.id}`;

                return (
                  <div
                    key={p.id}
                    className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                      isCurrent ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-400/30 shadow-md"
                      : popular ? "border-indigo-300 bg-white shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                    }`}
                  >
                    {popular && !isCurrent ? (
                      <span className="absolute -top-3 left-6 bg-indigo-600 text-white text-[10.5px] font-extrabold px-3 py-1 rounded-full tracking-wide">MOST POPULAR</span>
                    ) : null}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-['Sora',system-ui,sans-serif] text-lg font-bold capitalize" style={{ color: INK }}>{p.name}</h3>
                      {isCurrent ? (
                        <span className="bg-blue-100 text-blue-700 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Your plan
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[12.5px] min-h-[40px]" style={{ color: INK_SOFT }}>
                      {p.description || "Comprehensive HR capabilities for your organization."}
                    </p>
                    <div className="my-5 pb-5 border-b border-slate-100">
                      {p.is_contract_priced ? (
                        <span className="text-[26px] font-extrabold tracking-tight" style={{ color: INK }}>Custom pricing</span>
                      ) : hasPrice ? (
                        <>
                          <span className="text-[32px] font-extrabold tracking-tight" style={{ color: INK }}>${Number(price).toLocaleString()}</span>
                          <span className="text-[13px] font-medium ml-1" style={{ color: INK_SOFT }}>/ {billingCycle === "annual" ? "year" : "month"}</span>
                          <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>billed {billingCycle === "annual" ? "yearly" : "monthly"}</p>
                        </>
                      ) : (
                        <span className="text-[26px] font-extrabold tracking-tight" style={{ color: INK }}>Contact sales</span>
                      )}
                    </div>

                    <div className="mt-auto">
                      {!p.is_contract_priced ? (
                        <button
                          onClick={() => (rel === "downgrade" ? openDowngrade(p) : handleStripeCheckout(p))}
                          disabled={!canAct || currentIsLive || scheduledHere || confirming || checkoutBusy || busy === "impact"}
                          title={currentIsLive ? "Your subscription already includes this plan." : undefined}
                          className={`w-full py-3 px-4 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${
                            !canAct || currentIsLive || scheduledHere
                              ? "bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-200"
                              : rel === "downgrade"
                              ? "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 cursor-pointer"
                              : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow cursor-pointer"
                          }`}
                        >
                          {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : currentIsLive ? <Check className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                          {currentIsLive
                            ? "Currently Subscribed"
                            : scheduledHere
                            ? `Switching on ${fmtDate(pending.effective_at)}`
                            : rel === "downgrade"
                            ? `Downgrade to ${p.name}`
                            : rel === "upgrade"
                            ? `Upgrade to ${p.name} via Stripe`
                            : isCurrent
                            ? "Pay & Renew Active Plan"
                            : `Subscribe to ${p.name} via Stripe`}
                        </button>
                      ) : (
                        <button
                          onClick={() => notify("Enterprise plans require sales contract activation. Please contact sales.", "info")}
                          className="w-full py-3 px-4 rounded-xl text-[13px] font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" /> Contact sales
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-5 text-[11.5px] flex items-center gap-1.5" style={{ color: INK_SOFT }}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Payments are processed by Stripe. Card details never reach our servers.
          </p>
        </section>

        {/* Manage subscription */}
        <section className={`${card} p-6`} aria-labelledby="manage-heading">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="manage-heading" className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>Manage subscription</h2>
            {canAct && status === "active" ? (
              <ActionButton Icon={Ban} label="Cancel at period end" color={RED} bg={RED_100} onClick={handleCancel} busy={busy === "cancel"} disabled={busy} />
            ) : null}
            {canAct && status === "cancel_at_period_end" ? (
              <ActionButton Icon={RotateCcw} label="Reactivate" color={EMERALD} bg={EMERALD_100} onClick={handleReactivate} busy={busy === "reactivate"} disabled={busy} />
            ) : null}
            {!canAct ? (
              <span className="text-[12px] flex items-center gap-1.5" style={{ color: INK_SOFT }}>
                <ShieldCheck className="w-4 h-4" /> Changes require an organization billing authority.
              </span>
            ) : null}
            {canAct && status !== "active" && status !== "cancel_at_period_end" ? (
              <span className="text-[12px]" style={{ color: INK_SOFT }}>Nothing to manage until you have an active subscription.</span>
            ) : null}
          </div>
          {pending ? (
            <div className="mt-4 rounded-xl border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3" style={{ background: AMBER_100 }}>
              <p className="text-[13px]" style={{ color: INK }}>
                <b>Downgrade scheduled.</b> Your plan changes from {String(pending.from_plan_code || "").toUpperCase()} to {String(pending.to_plan_code || "").toUpperCase()} on <b>{fmtDate(pending.effective_at)}</b>. Until then everything stays as it is.
              </p>
              {canAct ? <ActionButton Icon={RotateCcw} label="Keep my current plan" color={EMERALD} bg={EMERALD_100} onClick={keepCurrentPlan} busy={busy === "keep"} disabled={busy} /> : null}
            </div>
          ) : null}
          {downgradeTarget ? (
            <div role="dialog" aria-label="Confirm downgrade" className="mt-4 rounded-xl border border-slate-200 p-4" style={{ background: impact && !impact.eligible ? RED_100 : "#F8FAFC" }}>
              <p className="text-[13.5px] font-bold" style={{ color: INK }}>Downgrade to {downgradeTarget.name}</p>
              {busy === "impact" || !impact ? (
                <p className="text-[12px] mt-1" style={{ color: INK_SOFT }}>Checking what would change...</p>
              ) : (
                <>
                  <p className="text-[12px] mt-1" style={{ color: INK }}>
                    {impact.eligible
                      ? "It takes effect at the end of your current billing period. You keep everything you have until then, and your data is kept."
                      : "This downgrade is blocked until the items below are resolved."}
                  </p>
                  {(impact.blockers || []).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(impact.blockers || []).map((b, i) => (
                        <li key={i} className="text-[12px] flex items-start gap-1.5" style={{ color: INK }}>
                          <BadgeCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{b.message || b.reason || "A feature would be lost."}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <ActionButton Icon={AlertTriangle} label={`Confirm downgrade to ${downgradeTarget.name}`} color={AMBER} bg={AMBER_100} onClick={confirmDowngrade} busy={busy === "downgrade"} disabled={busy || !impact.eligible} />
                    <ActionButton Icon={XCircle} label="Cancel" color={INK_SOFT} bg="#F1F5F9" onClick={() => { setDowngradeTarget(null); setImpact(null); }} disabled={busy} />
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>

        {/* Comparison */}
        <section className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600"><Package className="w-5 h-5" /></div>
            <div>
              <h2 className="font-['Sora',system-ui,sans-serif] text-[15px] font-bold" style={{ color: INK }}>What each plan includes</h2>
              <p className="text-[12px] mt-0.5" style={{ color: INK_SOFT }}>Your plan: {planName}. Features marked &ldquo;Not included&rdquo; need the Advanced plan.</p>
            </div>
          </div>
          <PlanComparison highlight={planCode === "advanced" ? "advanced" : planCode === "core" ? "core" : null} />
        </section>

        <details className={`${card} p-5`}>
          <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: INK_SOFT }}>Technical entitlement status (for support)</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-4">
            {stateList.length > 0 ? stateList.map(([key, state]) => {
              const meta = STATE_META[state] || { label: state, color: INK_SOFT, bg: "#F1F5F9", Icon: Info };
              const Icon = meta.Icon;
              return (
                <div key={key} className="rounded-xl border border-slate-200 p-3 flex items-center gap-2 bg-slate-50">
                  <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
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
        </details>
      </div>
    </div>
  );
}
