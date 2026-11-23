/** Onboarding Settings: the employee notice period rules table and the header's page-wide Save. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const SETTINGS = {
  auto_template_ids: [2], required_document_categories: ["id_proof"], auto_send_portal_invite: true,
  portal_link_days: 30, reminder_days: 3, require_checklists_complete: true, require_documents_approved: false, welcome_message: "Hi",
};

function mockShell(t) {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
    Link: ({ children }) => React.createElement("a", null, children), useNavigate: () => () => {} } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getDocsSetupStatus: async () => ({ enabled: false }),
    getRequestCategories: async () => ({ categories: [
      { id: 1, key: "id_proof", label: "ID proof", active: true, accepted_types: ["pdf"], max_size_mb: 10, sort_order: 10 },
      { id: 2, key: "education_certificates", label: "Education certificates", active: true, accepted_types: ["pdf"], max_size_mb: 10, sort_order: 20 },
      { id: 3, key: "experience_letters", label: "Experience letters", active: true, accepted_types: ["pdf"], max_size_mb: 10, sort_order: 30 },
      { id: 4, key: "bank_details", label: "Bank details", active: true, accepted_types: ["pdf"], max_size_mb: 10, sort_order: 40 },
      { id: 5, key: "other", label: "Other", active: true, accepted_types: ["pdf"], max_size_mb: 10, sort_order: 50 }],
      file_types: ["pdf"], max_size_mb: 20 }),
    addRequestCategory: async () => ({ categories: [] }), updateRequestCategory: async () => ({ categories: [] }),
    deleteRequestCategory: async () => ({ categories: [] }),
    getPackageDocuments: async () => ({ documents: [], modes: [], signer_parties: [], engagement_profiles: [], addable_templates: [] }),
    savePackageDocuments: async () => ({}), addPackageDocument: async () => ({}), removePackageDocument: async () => ({}),
    customisePackageDocument: async () => ({}), createOrgTemplate: async () => ({}), decidePendingClause: async () => ({}),
    getPortalFormSettings: async () => ({ canonical_id: "HR-ONB-001", version: 0, fields: [], added_fields: [], field_order: [],
      types: ["text"], rules: [], classifications: ["PERSONAL_BASIC"], max_custom_fields: 20 }),
    savePortalFormSettings: async () => ({}),
  } });
}

test("notice rules: add a rule for an employee type and the header Save sends it with the company profile", async (t) => {
  const saved = [];
  mockShell(t);
  const fields = [
    { key: "notice_rules", group: "legal", label: "Employee notice period rules", kind: "notice_rules", required: false, options: null },
    { key: "pay_frequency", group: "legal", label: "Pay frequency", kind: "choice", required: false, options: ["monthly", "weekly"] },
  ];
  const rules = [{ employee_type: "all", applies_when: "any", value: 30, unit: "calendar_days", active: true }];
  t.mock.module("../src/service/hrService.js", { exports: {
    previewWelcomeMessage: async () => ({ subject: "Offer accepted", email_html: "<p>preview</p>", blocks: [], signature: "" }),
    sendTestWelcomeMessage: async () => ({ sent: true, to: "hr@acme.test" }),
    getOnboardingSettings: async () => SETTINGS,
    getOnboardingChecklistTemplates: async () => [],
    saveOnboardingSettings: async (p) => p,
    getOfferPackageSettings: async () => ({ settings: { brand_primary: "#0B3D91", brand_accent: "#00A3E0", paper: "A4", spelling: "UK",
      date_format: "DMY", response_days: 7 }, clauses: [], documents: [], mode_labels: {} }),
    saveOfferPackageSettings: async (p) => ({ settings: p, clauses: [], documents: [], mode_labels: {} }),
    getOfferPackageTemplateSet: async () => ({ blob: new Blob(["%PDF"]), filename: "set.pdf" }),
    getOfferPackageLogo: async () => ({ blob: new Blob(["png"], { type: "image/png" }), filename: "logo.png" }),
    uploadOfferPackageLogo: async () => ({ settings: { has_logo: true }, clauses: [], documents: [], mode_labels: {} }),
    deleteOfferPackageLogo: async () => ({ settings: { has_logo: false }, clauses: [], documents: [], mode_labels: {} }),
    getOfferPackageSignature: async () => ({ blob: new Blob(["png"], { type: "image/png" }), filename: "signature.png" }),
    uploadOfferPackageSignature: async () => ({ settings: { has_signature: true }, clauses: [], documents: [], mode_labels: {} }),
    deleteOfferPackageSignature: async () => ({ settings: { has_signature: false }, clauses: [], documents: [], mode_labels: {} }),
    getCompanyProfile: async () => ({ profile: { notice_rules: rules, pay_frequency: "" }, completeness: { percent: 100, missing: [], complete: true }, fields }),
    saveCompanyProfile: async (p) => { saved.push(p); return { profile: { ...p }, completeness: { percent: 100, missing: [], complete: true }, fields }; },
    prefillCompanyProfile: async () => ({ proposal: {} }),
    getOnboardingProfiles: async () => ({ engagement_profiles: [{ slug: "ascend", name: "Ascend Associates" }], role_profiles: [] }),
    saveEngagementProfile: async () => ({}), deleteEngagementProfile: async () => ({}), saveRoleProfile: async () => ({}), deleteRoleProfile: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(document.body.textContent, /Employee Notice Period Rules/);
  assert.equal(screen.getAllByRole("button", { name: "Save changes" })[0].disabled, true);
  fireEvent.click(screen.getByRole("button", { name: /Add notice rule/ }));
  fireEvent.change(screen.getByLabelText("Rule 2: employee type"), { target: { value: "ascend" } });
  fireEvent.change(screen.getByLabelText("Rule 2: notice period"), { target: { value: "15" } });
  fireEvent.change(screen.getByLabelText("Rule 2: unit"), { target: { value: "business_days" } });
  fireEvent.change(screen.getByLabelText("Pay frequency"), { target: { value: "weekly" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
  await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].pay_frequency, "weekly");
  assert.deepEqual(saved[0].notice_rules[1], { employee_type: "ascend", applies_when: "probation", value: "15", unit: "business_days", active: true });
  assert.match(screen.getByRole("status").textContent, /saved/i);
});
