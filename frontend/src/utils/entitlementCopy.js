/**
 * Pure helpers for denial copy and 403-decision classification (Phase 7).
 * Kept dependency-free so plain `node --test` can exercise them.
 *
 * reason_code -> denial intent per Section 15.1 / Section 20:
 *   - paywall-ish: PLAN_REQUIRED, TRIAL_RESTRICTED
 *   - ops/billing: PAYMENT_RESTRICTED, SUBSCRIPTION_INACTIVE
 *   - policy/config: CONFIG_REQUIRED, DEPENDENCY_REQUIRED, POLICY_BLOCKED
 *   - transition: DOWNGRADE_PENDING_READ_ONLY, LIMIT_REACHED
 *   - reserved/unknown codes -> generic copy
 */

export const DEFAULT_UPGRADE_HREF = "/organization-admin/billing-and-plan";

export const PAID_REASONS = new Set([
  "PLAN_REQUIRED",
  "TRIAL_RESTRICTED",
  "LIMIT_REACHED",
]);

export const BLOCKED_REASONS = new Set([
  "PAYMENT_RESTRICTED",
  "SUBSCRIPTION_INACTIVE",
  "CONFIG_REQUIRED",
  "DEPENDENCY_REQUIRED",
  "POLICY_BLOCKED",
  "ROLE_DENIED",
  "TENANT_SCOPE_DENIED",
  "JURISDICTION_BLOCKED",
  "INCIDENT_DISABLED",
]);

export const READONLY_REASONS = new Set(["DOWNGRADE_PENDING_READ_ONLY"]);

const DENIAL_COPY = {
  PLAN_REQUIRED: {
    icon: "🔒",
    title: "Upgrade required",
    message: "This feature is not included in your current plan. Upgrade to unlock it.",
    ctaLabel: "View Plans & Upgrade",
    cta: "#2563EB",
    border: "#BFDBFE",
    background: "#EFF6FF",
  },
  TRIAL_RESTRICTED: {
    icon: "⏳",
    title: "Not available in trial",
    message: "This integration or advanced feature is sandboxed during your evaluation.",
    ctaLabel: "View Plans & Upgrade",
    cta: "#2563EB",
    border: "#BFDBFE",
    background: "#EFF6FF",
  },
  LIMIT_REACHED: {
    icon: "📊",
    title: "Limit reached",
    message: "Your current plan limit for this feature has been reached.",
    ctaLabel: "View Plans & Upgrade",
    cta: "#2563EB",
    border: "#BFDBFE",
    background: "#EFF6FF",
  },
  PAYMENT_RESTRICTED: {
    icon: "💳",
    title: "Action needed on payment",
    message: "Your organization's subscription payments are past due. Settle the balance to restore access.",
    ctaLabel: "Review Billing",
    cta: "#D97706",
    border: "#FDE68A",
    background: "#FEFCE8",
  },
  SUBSCRIPTION_INACTIVE: {
    icon: "⛔",
    title: "Subscription inactive",
    message: "This organization's subscription is not active. Contact your billing administrator.",
    ctaLabel: null,
    cta: "#9CA3AF",
    border: "#FCA5A5",
    background: "#FEF2F2",
  },
  CONFIG_REQUIRED: {
    icon: "🛠️",
    title: "Setup required",
    message: "This feature is entitled but needs configuration. Contact support to enable it.",
    ctaLabel: "Contact Support",
    cta: "#374151",
    border: "#E5E7EB",
    background: "#F9FAFB",
  },
  DEPENDENCY_REQUIRED: {
    icon: "🧩",
    title: "Prerequisite missing",
    message: "This feature depends on a capability that is not yet enabled for your organization.",
    ctaLabel: "Contact Support",
    cta: "#374151",
    border: "#E5E7EB",
    background: "#F9FAFB",
  },
  POLICY_BLOCKED: {
    icon: "🚫",
    title: "Disabled by your administrator",
    message: "Your organization has disabled this feature.",
    ctaLabel: null,
    cta: "#9CA3AF",
    border: "#FCA5A5",
    background: "#FEF2F2",
  },
  DOWNGRADE_PENDING_READ_ONLY: {
    icon: "🕓",
    title: "Read-only while plan changes",
    message: "This feature is read-only while your plan downgrade is applied.",
    ctaLabel: null,
    cta: "#9CA3AF",
    border: "#E5E7EB",
    background: "#F9FAFB",
  },
};

const GENERIC_COPY = {
  icon: "🔒",
  title: "Feature unavailable",
  message: "This feature is not available for your organization.",
  ctaLabel: "Contact Support",
  cta: "#374151",
  border: "#E5E7EB",
  background: "#F9FAFB",
};

export function getEntitlementDenialCopy(reasonCode, state) {
  if (state === "ENTITLED_NOT_CONFIGURED") return DENIAL_COPY.CONFIG_REQUIRED;
  return DENIAL_COPY[reasonCode] || GENERIC_COPY;
}

/** Classify a decision/403 for UI: "paid" | "blocked" | "readonly" | "unknown". */
export function classifyDenialReason(reasonCode, state) {
  if (READONLY_REASONS.has(reasonCode) || state === "READ_ONLY") return "readonly";
  if (PAID_REASONS.has(reasonCode)) return "paid";
  if (BLOCKED_REASONS.has(reasonCode)) return "blocked";
  return "unknown";
}