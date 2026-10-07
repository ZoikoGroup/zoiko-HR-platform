import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { billingService } from "../service/billingService";
import { feature_label_fallback } from "../config/planMatrix";

// One short-lived copy of "what does my plan include" shared by every gate on the page.
let cached = null;
let cachedAt = 0;
function loadStates() {
  if (cached && Date.now() - cachedAt < 30000) return cached;
  cachedAt = Date.now();
  cached = billingService.getMyEntitlements().then((res) => res?.states || {}).catch(() => {
    cached = null;
    return null;
  });
  return cached;
}
export function resetPlanGateCache() { cached = null; }

/**
 * Shows its children when the organization's plan includes the feature, otherwise an upgrade notice instead of a
 * page that would only fail with errors. The server enforces the same rule, so if the plan cannot be read the page
 * is shown and the server decides.
 */
export default function PlanGate({ featureKey, title, children }) {
  const [state, setState] = useState("loading");
  useEffect(() => {
    let live = true;
    loadStates().then((states) => {
      if (!live) return;
      setState(states ? states[featureKey] || "UNKNOWN" : "UNKNOWN");
    });
    return () => { live = false; };
  }, [featureKey]);

  if (state === "loading") {
    return <div role="status" className="flex justify-center py-24 text-sm text-gray-400">Loading...</div>;
  }
  if (state !== "NOT_ENTITLED") return children;
  return (
    <div role="alert" data-testid="plan-gate" className="mx-auto mt-16 max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50"><Lock className="h-6 w-6 text-blue-600" aria-hidden="true" /></div>
      <h1 className="text-xl font-bold text-gray-900">{title || feature_label_fallback(featureKey)} is part of the Advanced plan</h1>
      <p className="mt-2 text-sm text-gray-600">Your current plan does not include it. Upgrade to Advanced to start using it. Your existing data is not affected.</p>
      <Link to="/organization-admin/billing-and-plan" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">See plans and upgrade</Link>
    </div>
  );
}
