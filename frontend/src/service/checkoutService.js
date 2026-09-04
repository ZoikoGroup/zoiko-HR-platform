import { api } from "./api";

/**
 * service/checkoutService.js
 * --------------------------
 * Stripe Checkout redirect flow — uses Stripe's hosted Checkout (not custom
 * card fields) so PCI scope stays off this codebase.
 *
 * POST /billing/checkout-session → returns { checkout_url }
 * → window.location.href = checkout_url → Stripe hosts payment UI
 * → on success: Stripe redirects to success_url (app handles return)
 * → on cancel: Stripe redirects to cancel_url (app handles return)
 *
 * Also provides helpers for reading subscription/payment status
 * and invoices for display in the billing dashboard.
 */

function generateIdempotencyKey() {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const checkoutService = {
  /**
   * Create a Stripe Checkout Session and redirect the user.
   * @param {Object} params
   * @param {number} params.organizationId
   * @param {number} params.planId
   * @param {string} params.billingCycle - "monthly" | "annual"
   * @param {string} params.successUrl - Where Stripe redirects on success
   * @param {string} params.cancelUrl - Where Stripe redirects on cancel
   * @returns {Promise<Object>} { checkout_session_id, checkout_url }
   */
  createCheckoutSession: async ({
    organizationId,
    planId,
    billingCycle,
    successUrl,
    cancelUrl,
  }) => {
    const idempotencyKey = generateIdempotencyKey();
    const response = await api.post(
      "/billing/checkout-session",
      {
        organization_id: organizationId,
        plan_id: planId,
        billing_cycle: billingCycle,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      {
        headers: { "Idempotency-Key": idempotencyKey },
      }
    );
    return response;
  },

  /**
   * Initiate a checkout redirect — creates session then navigates.
   */
  redirectToCheckout: async ({
    organizationId,
    planId,
    billingCycle,
    successUrl,
    cancelUrl,
  }) => {
    const session = await checkoutService.createCheckoutSession({
      organizationId,
      planId,
      billingCycle,
      successUrl: successUrl || `${window.location.origin}/billing/checkout/success`,
      cancelUrl: cancelUrl || `${window.location.origin}/billing/checkout/cancel`,
    });

    if (session?.checkout_url) {
      window.location.href = session.checkout_url;
    }
    return session;
  },

  // ── Subscription & Invoice helpers ────────────────────────────────────

  getSubscription: (orgId) => api.get(`/billing/subscriptions/${orgId}`),
  getInvoices: (orgId) => api.get(`/billing/invoices/${orgId}`),
  getProviderRefs: (orgId) => api.get(`/billing/provider-refs/${orgId}`),
};
