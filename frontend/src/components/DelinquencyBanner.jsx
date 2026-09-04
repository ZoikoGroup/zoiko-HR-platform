/**
 * components/DelinquencyBanner.jsx
 * ---------------------------------
 * Informational billing-delinquency banner (Prompt 5, Section 10 G1-G5).
 *
 * Reads the org's delinquency status (has_open_case / stage / days_elapsed)
 * from the billing API and renders an escalating warning banner. Per the
 * backend safeguard, this banner is advisory only — entitlement enforcement
 * is backend-driven (frontend banners are not authoritative).
 *
 * Usage:
 *   <DelinquencyBanner organizationId={orgId} />
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard } from "lucide-react";

const STAGE_STYLES = {
  recovery: "bg-amber-50 border-amber-200 text-amber-900",
  day_10_restrict: "bg-amber-100 border-amber-300 text-amber-900",
  day_20_restrict: "bg-orange-50 border-orange-200 text-orange-900",
  day_45_termination: "bg-red-50 border-red-200 text-red-900",
};

const STAGE_LABELS = {
  recovery: "Payment Overdue — Recovery in Progress",
  day_10_restrict: "Payment Overdue — Expansion Restricted",
  day_20_restrict: "Payment Overdue — Services Restricted",
  day_45_termination: "Payment Overdue — Termination Imminent",
};

const STAGE_DESCRIPTIONS = {
  recovery:
    "Your subscription payment is overdue. Recovery is still in progress — update your payment method to avoid service restrictions.",
  day_10_restrict:
    "New commercial expansion is temporarily restricted. Pay the overdue balance to restore full access.",
  day_20_restrict:
    "Controlled service restrictions are active. Read, privacy and export paths remain available. Resolve the balance to restore full services.",
  day_45_termination:
    "Standard subscription is scheduled for termination. Resolve the overdue balance immediately to avoid closure.",
};

export default function DelinquencyBanner({ organizationId }) {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    async function fetchDelinquency() {
      try {
        const { billingService } = await import("../service/billingService");
        const res = await billingService.getDelinquency(organizationId);
        if (!cancelled) setState({ loading: false, data: res });
      } catch {
        if (!cancelled) setState({ loading: false, data: null });
      }
    }

    fetchDelinquency();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (state.loading || !state.data?.has_open_case) return null;

  const stage = state.data.stage || "recovery";
  const style = STAGE_STYLES[stage] || STAGE_STYLES.recovery;
  const label = STAGE_LABELS[stage] || STAGE_LABELS.recovery;
  const description = STAGE_DESCRIPTIONS[stage] || STAGE_DESCRIPTIONS.recovery;
  const Icon = stage === "recovery" ? CreditCard : AlertTriangle;

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${style} mb-4`}
      role="alert"
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-sm mt-0.5 opacity-90">{description}</p>
        <p className="text-xs mt-2 opacity-70">
          {state.data.days_elapsed ?? 0} day(s) overdue
          {state.data.retention_hold_until && (
            <> &middot; Retention hold until {new Date(state.data.retention_hold_until).toLocaleDateString()}</>
          )}
        </p>
      </div>
      {state.data.retention_hold_until && (
        <a
          href="/support"
          className="inline-flex items-center text-xs font-medium underline shrink-0 mt-0.5 opacity-80 hover:opacity-100"
        >
          Contact support
        </a>
      )}
    </div>
  );
}
