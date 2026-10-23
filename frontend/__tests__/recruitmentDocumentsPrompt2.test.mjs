import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

test("recruitment document service uses the mounted router prefix and backend payload shapes", async (t) => {
  const calls = [];
  const api = Object.fromEntries(["get", "post", "put"].map((method) => [method, (...args) => {
    calls.push([method, ...args]);
    return Promise.resolve({});
  }]));
  t.mock.module("../src/service/api.js", { exports: { api } });
  const service = await import(`../src/service/recruitmentDocumentsService.js?t=${Math.random()}`);

  await service.getOfferDocument(7);
  await service.getOfferLetterPreflight(7);
  await service.approveOfferDocument(7, "Reviewed");
  await service.generateOfferLetter(7);
  await service.issueOfferLetter(7);
  await service.amendOffer(7, { salary: 120000 });
  await service.requestOfferWithdrawal(7, { category: "other", statement: "Reviewed statement", condition: null, legal_review_completed: true });
  await service.clearOfferCondition(7, 2);
  await service.getCandidateDocumentsStatus(11);
  await service.sendCandidatePrivacyNotice(11);
  await service.bulkRejectCandidates([11, 12], { "11": "Reviewed note" }, true);
  await service.submitInterviewScorecard(18, { scores: [], recommendation: "proceed" });
  await service.getRequisitionScorecards(5);
  await service.getRequisitionAuthorization(5);
  await service.getRecruitmentPrivacySettings();
  await service.updateRecruitmentPrivacySettings({ uses_cv_parsing: false });

  assert.deepEqual(calls.map(([method, path]) => [method, path]), [
    ["get", "/hr/recruitment/offers/7/document"],
    ["get", "/hr/recruitment/offers/7/letter/preflight"],
    ["post", "/hr/recruitment/offers/7/approve"],
    ["post", "/hr/recruitment/offers/7/letter"],
    ["post", "/hr/recruitment/offers/7/letter/issue"],
    ["post", "/hr/recruitment/offers/7/amend"],
    ["post", "/hr/recruitment/offers/7/withdrawal"],
    ["post", "/hr/recruitment/offers/7/conditions/2/clear"],
    ["get", "/hr/recruitment/candidates/11/documents-status"],
    ["post", "/hr/recruitment/candidates/11/privacy-notice"],
    ["post", "/hr/recruitment/candidates/bulk-reject"],
    ["post", "/hr/recruitment/interviews/18/scorecard"],
    ["get", "/hr/recruitment/requisitions/5/scorecards"],
    ["get", "/hr/recruitment/requisitions/5/authorization"],
    ["get", "/hr/recruitment/privacy-settings"],
    ["put", "/hr/recruitment/privacy-settings"],
  ]);
  assert.deepEqual(calls[2][2], { comment: "Reviewed" });
  assert.deepEqual(calls[5][2], { changes: { salary: 120000 } });
  assert.deepEqual(calls[6][2], { category: "other", statement: "Reviewed statement", condition: null, legal_review_completed: true });
  assert.deepEqual(calls[10][2], { candidate_ids: [11, 12], notes: { "11": "Reviewed note" }, preview: true });
});

test("recruitment privacy settings load and save all supported fields", async (t) => {
  const saved = [];
  t.mock.module("../src/service/recruitmentDocumentsService.js", { exports: {
    getRecruitmentPrivacySettings: async () => ({
      privacy_contact_email: "privacy@example.com",
      candidate_data_retention_months: 24,
      uses_cv_parsing: true,
      talent_pool_opt_in_url: "https://example.com/talent",
      issue_confirmation_on_clearance: false,
    }),
    updateRecruitmentPrivacySettings: async (body) => { saved.push(body); return body; },
  } });
  const { default: PrivacySettings } = await import(`../src/modules/zoiko-hr/recruitment/PrivacySettings.jsx?t=${Math.random()}`);
  render(React.createElement(PrivacySettings));
  await settle();

  assert.equal(screen.getByLabelText("Privacy contact email").value, "privacy@example.com");
  assert.equal(screen.getByLabelText("Candidate data retention (months)").value, "24");
  fireEvent.click(screen.getByLabelText("CV parsing is used to extract candidate details"));
  fireEvent.click(screen.getByLabelText("Issue a confirmation when offer conditions are cleared"));
  fireEvent.change(screen.getByLabelText("Candidate data retention (months)"), { target: { value: "18" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await settle();
  assert.deepEqual(saved[0], {
    privacy_contact_email: "privacy@example.com",
    candidate_data_retention_months: 18,
    uses_cv_parsing: false,
    talent_pool_opt_in_url: "https://example.com/talent",
    issue_confirmation_on_clearance: true,
    offer_letters_without_approval: false,
  });
  assert.ok(screen.getByRole("status").textContent.includes("saved"));
});

test("candidate privacy status loads on demand and bulk rejection requires a server preview then confirmation", async (t) => {
  const calls = { bulk: [], privacy: 0 };
  const candidate = { id: 11, name: "Ari Applicant", email: "ari@example.com", position: "Designer", status: "screening", source: "referral" };
  t.mock.module("react-router-dom", { exports: {
    NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
    useParams: () => ({}), useSearchParams: () => [new URLSearchParams()], useNavigate: () => () => {},
  } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getCandidates: async () => ({ items: [candidate] }), getCandidateById: async () => null, getRequisitions: async () => ({ items: [] }),
    createCandidate: async () => ({}), updateCandidate: async () => ({}), deleteCandidate: async () => ({}), updateCandidateStatus: async () => ({}), parseCV: async () => ({}),
  } });
  t.mock.module("../src/service/recruitmentDocumentsService.js", { exports: {
    getCandidateDocumentsStatus: async () => { calls.privacy += 1; return { privacy_notice_sent_at: "2026-10-20T10:00:00Z", documents: [] }; },
    sendCandidatePrivacyNotice: async () => ({}),
    bulkRejectCandidates: async (...args) => {
      calls.bulk.push(args);
      return args[2]
        ? { preview: true, results: [{ candidate_id: 11, name: candidate.name, stage: "screening", outcome: "ALLOW", reasons: [] }] }
        : { preview: false, results: [{ candidate_id: 11, name: candidate.name, outcome: "REJECTED" }] };
    },
  } });
  t.mock.module("../src/modules/zoiko-hr/recruitment/PrivacySettings.jsx", { exports: { default: () => null } });
  const { default: Candidates } = await import(`../src/modules/zoiko-hr/recruitment/candidates.jsx?t=${Math.random()}`);
  render(React.createElement(Candidates));
  await settle();

  fireEvent.click(screen.getByRole("button", { name: "Privacy notice status for Ari Applicant" }));
  await settle();
  assert.equal(calls.privacy, 1);
  assert.ok(screen.getByText(/Notice issued/));

  fireEvent.click(screen.getByRole("checkbox", { name: "Select Ari Applicant for bulk rejection" }));
  fireEvent.click(screen.getByRole("button", { name: /Preview bulk rejection/ }));
  await settle();
  assert.deepEqual(calls.bulk[0], [[11], {}, true]);
  assert.ok(screen.getByRole("dialog", { name: "Review bulk rejection" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await settle();
  assert.deepEqual(calls.bulk[1], [[11], {}, false]);
  assert.ok(screen.getByRole("alert").textContent.includes("1 candidate rejected"));
});

test("interview scorecard loads requisition criteria and submits the documented score payload", async (t) => {
  const calls = [];
  t.mock.module("react-router-dom", { exports: {
    NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
  } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getInterviews: async () => ({ items: [{ id: 18, candidate_id: 11, candidate_name: "Ari Applicant", position: "Designer", interview_type: "video", interview_date: "2026-11-01", status: "scheduled" }] }),
    getCandidates: async () => ({ items: [{ id: 11, name: "Ari Applicant", position: "Designer", requisition_id: 5, status: "interview" }] }),
    createInterview: async () => ({}), updateInterview: async () => ({}), updateInterviewFeedback: async () => ({}), deleteInterview: async () => ({}),
  } });
  t.mock.module("../src/service/employee.js", { exports: { getEmployees: async () => ({ items: [] }) } });
  t.mock.module("../src/service/recruitmentDocumentsService.js", { exports: {
    getRequisitionScorecards: async (id) => { calls.push(["get", id]); return { criteria: [{ key: "skills", label: "Role skills", weight: 2 }], candidates: [] }; },
    submitInterviewScorecard: async (id, body) => { calls.push(["post", id, body]); return {}; },
  } });
  const { default: Interviews } = await import(`../src/modules/zoiko-hr/recruitment/interviews.jsx?t=${Math.random()}`);
  render(React.createElement(Interviews));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "View all interviews" }));
  fireEvent.click(screen.getByRole("button", { name: "More actions for Ari Applicant" }));
  fireEvent.click(screen.getByRole("button", { name: "Scorecard" }));
  await settle();
  assert.deepEqual(calls[0], ["get", 5]);
  fireEvent.change(screen.getByLabelText("Score (1–5)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Evidence (required)"), { target: { value: "Demonstrated clear role-relevant reasoning." } });
  fireEvent.click(screen.getByRole("button", { name: "Save scorecard" }));
  await settle();
  assert.equal(calls[1][0], "post");
  assert.equal(calls[1][1], 18);
  assert.deepEqual(calls[1][2].scores, [{ criterion_key: "skills", label: "Role skills", score: 4, evidence: "Demonstrated clear role-relevant reasoning." }]);
  assert.equal(calls[1][2].recommendation, "proceed");
});

test("offer letter lifecycle uses server approval, generation, preview and send", async (t) => {
  const calls = [];
  const state = { status: "draft", letter: null, approved_at: null, issued_at: null };
  t.mock.module("react-router-dom", { exports: {
    NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
  } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/components/RemunerationFields.jsx", { exports: {
    default: () => null, CountrySelect: () => null, currencyForCountry: () => "USD", guessCountry: () => null,
    useRegions: () => ({ countries: [], organization: { currency: "USD" } }),
  } });
  t.mock.module("../src/components/BusinessLookupFields.jsx", { exports: {
    default: () => null, checkBusinessId: () => null, checkPostal: () => null, useBusinessFormats: () => ({ countries: {} }),
  } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getOffers: async () => ({ items: [{ id: 7, candidate_id: 11, candidate_name: "Ari Applicant", position: "Designer", salary: 120000, currency: "USD", status: state.status }] }),
    getCandidates: async () => ({ items: [] }), createOffer: async () => ({}), updateOffer: async () => ({}), deleteOffer: async () => ({}),
  } });
  t.mock.module("../src/service/recruitmentDocumentsService.js", { exports: {
    getOfferDocument: async (id) => { calls.push(["document", id]); return { offer_id: id, status: state.status, approved_at: state.approved_at, issued_at: state.issued_at, letter: state.letter, documents: state.letter ? [state.letter] : [] }; },
    getOfferLetterPreflight: async (id) => { calls.push(["preflight", id]); return { canonical_id: "HR-HIR-011", approved: state.status === "approved", preflight: { outcome: "ALLOW", reasons: [] } }; },
    approveOfferDocument: async (id, comment) => { calls.push(["approve", id, comment]); state.status = "approved"; state.approved_at = "2026-10-21T10:00:00Z"; return {}; },
    generateOfferLetter: async (id) => { calls.push(["generate", id]); state.letter = { id: 88, canonical_id: "HR-HIR-011", status: "HUMAN_APPROVED", title: "Offer Letter" }; return {}; },
    sendOfferLetter: async (id) => { calls.push(["send", id]); state.status = "pending"; state.letter.status = "ISSUED"; state.issued_at = "2026-10-21T11:00:00Z"; return {}; },
    resendOfferLetter: async (id) => { calls.push(["resend", id]); return {}; },
    amendOffer: async () => ({}), requestOfferWithdrawal: async () => ({}), clearOfferCondition: async () => ({}),
  } });
  t.mock.module("../src/service/docTemplatesService.js", { exports: {
    previewGeneratedDocument: async () => ({ html: "<html><body>Server-rendered</body></html>" }),
    downloadGeneratedDocument: async () => ({}),
  } });
  const { default: Offers } = await import(`../src/modules/zoiko-hr/recruitment/offers.jsx?t=${Math.random()}`);
  render(React.createElement(Offers));
  await settle();
  fireEvent.click(screen.getByTitle("Manage offer letter"));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Approve offer" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await settle();
  assert.deepEqual(calls.find((call) => call[0] === "approve"), ["approve", 7, null]);
  fireEvent.click(screen.getByRole("button", { name: "Generate server letter" }));
  await settle();
  assert.deepEqual(calls.find((call) => call[0] === "generate"), ["generate", 7]);
  assert.ok(screen.getByTitle("Offer letter for Ari Applicant").getAttribute("srcdoc").includes("Server-rendered"));
  fireEvent.click(screen.getByRole("button", { name: "Send to candidate" }));
  await settle();
  assert.deepEqual(calls.find((call) => call[0] === "send"), ["send", 7]);
  assert.ok(screen.getByText("ISSUED", { selector: "strong" }));
});
