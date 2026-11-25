/** "Set up docs for your organisation": route and role guard, the wizard stepper (saves and resumes; conflicts block step 3),
 * the package card (mandatory documents stay on) and the portal form editor (core fields cannot be hidden). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { routeSource } from "./support/route-source.mjs";
import { ROLE_ALLOWED_PREFIXES, ROLE_DISALLOWED_PREFIXES, ROLES } from "../src/config/roles.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const PATH = "/zoiko-hr/onboarding/settings/docs-setup";

function allowedRoles(path) {
  return Object.keys(ROLE_ALLOWED_PREFIXES).filter((role) => {
    const under = (p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`);
    if ((ROLE_DISALLOWED_PREFIXES[role] || []).some(under)) return false;
    return (ROLE_ALLOWED_PREFIXES[role] || []).some((p) => p !== "/" && under(p));
  });
}

test("the wizard route exists and has the same roles as Onboarding Settings", () => {
  assert.ok(routeSource.includes(`"${PATH}":`), "route registered");
  assert.deepEqual(allowedRoles(PATH).sort(), allowedRoles("/zoiko-hr/onboarding/settings").sort());
  assert.ok(!allowedRoles(PATH).includes(ROLES.MANAGER) && !allowedRoles(PATH).includes(ROLES.EMPLOYEE));
});

const routerMock = (t) => t.mock.module("react-router-dom", { exports: {
  Link: ({ children, to, ...p }) => React.createElement("a", { href: to, ...p }, children),
  NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
  useNavigate: () => () => {},
} });
const layoutMock = (t) => t.mock.module("../src/modules/zoiko-hr/onboarding/OnboardingLayout.jsx", { exports: {
  default: ({ children, actions }) => React.createElement("div", null, actions, children),
} });

test("the stepper resumes on the saved step, saves each move, and step 3 cannot finish with a conflict", async (t) => {
  const steps = [];
  const session = { id: 7, status: "review", step: 3, files: [{ id: 1, filename: "contract.pdf", warnings: [] }], unresolved_conflicts: [],
    ai: { on: false }, progress: {}, limits: { files: 20, file_mb: 20, total_mb: 100 } };
  routerMock(t);
  layoutMock(t);
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getDocsSetupStatus: async () => ({ enabled: true }),
    openDocsSetupSession: async () => session,
    setDocsSetupStep: async (_id, n) => { steps.push(n); return session; },
    cancelDocsSetup: async () => ({}),
    getDocsSetupProposals: async () => ({ items: [{ id: 3, target: "company_profile", target_key: "employee_notice", label: "Notice period",
      area: "Legal & policy defaults", proposed_value: { value: 30, unit: "calendar_days" }, current_value: null, confidence: 0.8,
      sources: [{ file_id: 1, filename: "contract.pdf", page: 1, quote: "30 days' written notice" }], conflict_group: "company_profile:employee_notice",
      decision: "pending" }], unresolved_conflicts: ["company_profile:employee_notice"] }),
    decideDocsSetupProposal: async () => ({}), bulkDocsSetupProposals: async () => ({}), openDocsSetupSource: async () => {},
    analyseDocsSetup: async () => session, getDocsSetupSession: async () => session, uploadDocsSetupFile: async () => session,
    deleteDocsSetupFile: async () => session, setDocsSetupFileLabel: async () => session, getDocsSetupMapping: async () => ({}), setDocsSetupMapping: async () => ({}),
    getDocsSetupMappingOptions: async () => ({}),
    getDocsSetupPreviewPdf: async () => new Blob(), getPackageDocuments: async () => ({ documents: [] }), addDocsSetupChange: async () => ({}),
    getDocsSetupSummary: async () => ({}), applyDocsSetup: async () => session, undoDocsSetup: async () => ({}),
    approveReleaseDocsSetup: async () => ({}), setDocsSetupOptions: async () => ({}),
  } });
  const { default: Wizard } = await import(`../src/modules/zoiko-hr/onboarding/docs-setup/DocsSetupWizard.jsx?t=${Math.random()}`);
  render(React.createElement(Wizard));
  await settle();
  assert.ok(screen.getByText("Step 3 of 6: Review settings"), "resumed on the saved step");
  await settle();
  assert.ok(screen.getByText(/Choose a value for every conflict first/), "the blocker is said in words");
  assert.equal(screen.getByRole("button", { name: /^Next/ }).disabled, true, "a conflict blocks step 3");
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  await settle();
  assert.deepEqual(steps, [2], "moving saves the step on the server");
  assert.ok(screen.getByText("Step 2 of 6: Analyse"));
});

test("the package card never lets mandatory documents be switched off", async (t) => {
  routerMock(t);
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getPackageDocuments: async () => ({
      documents: [
        { category: "offer_letter", title: "Offer Letter", template_id: "HR-HIR-011", mode: "SIGN", enabled: true, mandatory: true,
          mandatory_reason: "Every new hire needs an offer letter.", source: "platform", can_customise: true, sort_order: 10,
          template_state: { label: "Using the standard template" } },
        { category: "velocity_report", title: "Project Velocity Report", template_id: "HR-PRF-102", mode: "INFO", enabled: true,
          mandatory: false, source: "platform", can_customise: true, sort_order: 20, template_state: { label: "Using the standard template" } },
      ],
      modes: [{ value: "SIGN", label: "E-signature" }, { value: "INFO", label: "For information" }], signer_parties: [],
      engagement_profiles: [], addable_templates: [],
    }),
    savePackageDocuments: async () => ({}), addPackageDocument: async () => ({}), removePackageDocument: async () => ({}),
    customisePackageDocument: async () => ({}), createOrgTemplate: async () => ({}),
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/PackageDocumentsSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  const offer = screen.getByRole("checkbox", { name: "Send Offer Letter" });
  assert.equal(offer.disabled, true);
  assert.ok(screen.getByText(/Always sent: Every new hire needs an offer letter/));
  const velocity = screen.getByRole("checkbox", { name: "Send Project Velocity Report" });
  assert.equal(velocity.disabled, false);
  assert.ok(screen.getAllByText("Using the standard template").length === 2);
});

test("the form editor shows core fields as always asked and lets optional ones be hidden", async (t) => {
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getPortalFormSettings: async () => ({ canonical_id: "HR-ONB-001", version: 0, types: ["text", "select"], rules: ["phone"],
      classifications: ["PERSONAL_BASIC"], max_custom_fields: 20, added_fields: [], field_order: [],
      fields: [
        { key: "legal_first_name", label: "Legal first name", locked: true, locked_reason: "Core field – always collected", hidden: false },
        { key: "preferred_name", label: "Preferred name", locked: false, hidden: false },
      ] }),
    savePortalFormSettings: async () => ({}),
  } });
  const { default: Forms } = await import(`../src/modules/zoiko-hr/onboarding/PortalFormsSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Forms));
  await settle();
  assert.equal(screen.queryByRole("checkbox", { name: "Ask Legal first name" }), null, "core fields have no switch");
  assert.ok(screen.getByText("Always asked"));
  const pref = screen.getByRole("checkbox", { name: "Ask Preferred name" });
  fireEvent.click(pref);
  assert.ok(screen.getByText("Hidden"));
});

test("after Apply one admin approves and releases the templates, and contracts ask for counsel details", async (t) => {
  routerMock(t);
  const calls = [];
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    approveReleaseDocsSetup: async (id, body) => {
      calls.push(body);
      return calls.length === 1
        ? { released: 1, total: 2, results: [
          { variant_id: 11, title: "Offer Letter", ok: true, status: "ACTIVE" },
          { variant_id: 12, title: "Employment Contract", ok: false, status: "LEGAL_REVIEW", code: "COUNSEL_DETAILS_REQUIRED",
            message: "L3 templates need the name, firm, qualification and review date of your legal counsel." }] }
        : { released: 2, total: 2, results: [
          { variant_id: 11, title: "Offer Letter", ok: true, status: "ACTIVE" },
          { variant_id: 12, title: "Employment Contract", ok: true, status: "ACTIVE" }] };
    },
  } });
  const { default: Panel } = await import(`../src/modules/zoiko-hr/onboarding/docs-setup/ReleasePanel.jsx?t=${Math.random()}`);
  render(React.createElement(Panel, { sessionId: 5, variantIds: [11, 12] }));
  const button = screen.getByRole("button", { name: /Approve and release/ });
  assert.equal(button.disabled, true, "needs the attestation");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await settle();
  assert.deepEqual(calls[0], { attestation_accepted: true });
  assert.ok(screen.getByText(/1 of 2 released/));
  assert.ok(screen.getByText(/need the details of the legal counsel/));
  fireEvent.change(screen.getByLabelText("Counsel name"), { target: { value: "R. Rao" } });
  fireEvent.click(screen.getByRole("button", { name: /Approve and release/ }));
  await settle();
  assert.equal(calls[1].counsel_name, "R. Rao");
  assert.ok(screen.getByText(/All templates are live/));
  assert.equal(screen.queryByRole("button", { name: /Approve and release/ }), null);
});
