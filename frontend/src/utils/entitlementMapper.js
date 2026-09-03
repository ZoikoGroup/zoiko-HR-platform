/**
 * Entitlement state → UI treatment mapper.
 *
 * The five canonical states from the backend entitlement engine carry
 * distinct UI meaning — they must NOT all render as the same generic
 * "upgrade to unlock" banner (Section 20 requires policy blocks to be
 * distinguishable from upgrade states).
 *
 * Usage:
 *   import { getEntitlementUITreatment } from "../utils/entitlementMapper";
 *   const treatment = getEntitlementUITreatment(entitlementState);
 *   // treatment.visible, treatment.disabled, treatment.tooltip, treatment.ctaLabel
 */

const ENTITLEMENT_STATES = {
  ENTITLED_AVAILABLE: "ENTITLED_AVAILABLE",
  NOT_ENTITLED: "NOT_ENTITLED",
  ENTITLED_NOT_CONFIGURED: "ENTITLED_NOT_CONFIGURED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  ENTITLED_POLICY_BLOCKED: "ENTITLED_POLICY_BLOCKED",
};

const UI_TREATMENTS = {
  [ENTITLEMENT_STATES.ENTITLED_AVAILABLE]: {
    visible: true,
    disabled: false,
    tooltip: null,
    ctaLabel: null,
    bannerMessage: null,
    bannerVariant: null, // null = no banner
  },
  [ENTITLEMENT_STATES.NOT_ENTITLED]: {
    visible: false,
    disabled: false,
    tooltip: "This feature requires a plan upgrade.",
    ctaLabel: "Upgrade Plan",
    bannerMessage: "This feature is not included in your current plan.",
    bannerVariant: "upgrade",
  },
  [ENTITLEMENT_STATES.ENTITLED_NOT_CONFIGURED]: {
    visible: false,
    disabled: false,
    tooltip: "This feature is not yet configured for your organization.",
    ctaLabel: "Contact Support",
    bannerMessage: "This feature is available but not yet configured. Please contact support.",
    bannerVariant: "info",
  },
  [ENTITLEMENT_STATES.DEPENDENCY_UNAVAILABLE]: {
    visible: true,
    disabled: true,
    tooltip: "This feature requires additional setup. Please contact support.",
    ctaLabel: "Contact Support",
    bannerMessage: "This feature requires additional configuration before it can be used.",
    bannerVariant: "warning",
  },
  [ENTITLEMENT_STATES.ENTITLED_POLICY_BLOCKED]: {
    visible: true,
    disabled: true,
    tooltip: "This feature has been disabled by your organization administrator.",
    ctaLabel: null,
    bannerMessage: "This feature has been disabled by your administrator.",
    bannerVariant: "blocked",
  },
};

/**
 * Get the UI treatment for a given entitlement state.
 * Returns an object describing visibility, disabled state, tooltip, and CTA.
 *
 * @param {string} state - One of the five canonical entitlement states
 * @returns {object} UI treatment configuration
 */
export function getEntitlementUITreatment(state) {
  return (
    UI_TREATMENTS[state] || {
      visible: false,
      disabled: false,
      tooltip: "Entitlement status unknown.",
      ctaLabel: null,
      bannerMessage: "Unable to determine feature availability.",
      bannerVariant: "error",
    }
  );
}

/**
 * Check if a feature is fully available (visible and not disabled).
 * Convenience helper for conditional rendering.
 */
export function isFeatureAvailable(state) {
  return state === ENTITLEMENT_STATES.ENTITLED_AVAILABLE;
}

/**
 * Get a user-friendly label for an entitlement state.
 */
export function getEntitlementStateLabel(state) {
  const labels = {
    [ENTITLEMENT_STATES.ENTITLED_AVAILABLE]: "Available",
    [ENTITLEMENT_STATES.NOT_ENTITLED]: "Not Included",
    [ENTITLEMENT_STATES.ENTITLED_NOT_CONFIGURED]: "Not Configured",
    [ENTITLEMENT_STATES.DEPENDENCY_UNAVAILABLE]: "Setup Required",
    [ENTITLEMENT_STATES.ENTITLED_POLICY_BLOCKED]: "Disabled by Admin",
  };
  return labels[state] || "Unknown";
}
