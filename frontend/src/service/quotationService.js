import { api } from "./api";

// Public, token-based registration quotation decision (the emailed link is the credential).
export const getQuotationByToken = (token) => api.get("/billing/quotations/by-token", { params: { token }, auth: false });
export const decideQuotation = (token, decision) => api.post("/billing/quotations/decide", { token, decision }, { auth: false });
