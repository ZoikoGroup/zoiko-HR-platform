import { api } from "./api";

/** POST /public/pricing-requests: no sign-in needed. Resolves { reference, message, confirmation_email_sent }. */
export function requestPricing(payload) {
  return api.post("/public/pricing-requests", payload, { auth: false });
}
