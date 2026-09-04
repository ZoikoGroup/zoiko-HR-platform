/**
 * components/PaymentStatusBanner.jsx
 * -----------------------------------
 * Stripe payment status banner — shows past-due or restricted subscription
 * warnings. Reads subscription status from the billing API and renders a
 * non-dismissible warning when payment requires attention.
 *
 * Usage:
 *   <PaymentStatusBanner organizationId={orgId} />
 *
 * States rendered:
 *   - past_due: amber banner with retry guidance
 *   - restricted: red banner with account-restricted messaging
 *   - null/active: renders nothing
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, ExternalLink } from "lucide-react";

const BANNER_STYLES = {
  past_due: {
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-900",
    icon: AlertTriangle,
    label: "Payment Past Due",
    description:
      "Your subscription payment is past due. Please update your payment method to avoid service interruption.",
  },
  restricted: {
    bg: "bg-red-50 border-red-200",
    text: "text-red-900",
    icon: CreditCard,
    label: "Account Restricted",
    description:
      "Your account has been restricted due to a billing issue. Please contact support or update your payment method.",
  },
};

export default function PaymentStatusBanner({ organizationId }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    async function fetchSubscription() {
      try {
        const { billingService } = await import("../service/billingService");
        const res = await billingService.getSubscription(organizationId);
        if (!cancelled) setSubscription(res);
      } catch {
        if (!cancelled) setSubscription(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSubscription();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (loading || !subscription) return null;

  const status = subscription.status;
  const config = BANNER_STYLES[status];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${config.bg} ${config.text} mb-4`}
      role="alert"
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{config.label}</p>
        <p className="text-sm mt-0.5 opacity-90">{config.description}</p>
        {subscription.plan_code && (
          <p className="text-xs mt-2 opacity-70">
            Current plan: {subscription.plan_code} &middot; Status: {status}
          </p>
        )}
      </div>
      <a
        href="/billing/settings"
        className="inline-flex items-center gap-1 text-xs font-medium underline shrink-0 mt-0.5 opacity-80 hover:opacity-100"
      >
        Manage billing <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
