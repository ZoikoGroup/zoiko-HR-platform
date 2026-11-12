/** Onboarding Checklists: the removed automatic "Manager onboarding" checklist never shows, and org admins see each new
 * hire's signed documents with the signature itself and a link to the signed PDF. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
// one shared log: the panel component is imported once, so it keeps the first test's mocked service
const calls = { opened: [], images: [] };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const HIRES = [{ id: 10, candidate_name: "Asha Rao", status: "in_progress" }];
const ASSIGNMENTS = [
  { id: 1, onboarding_new_hire_id: 10, name: "Manager onboarding", category: "Manager", status: "pending", items: [{ id: 5, title: "Plan week one", completed: false }] },
  { id: 2, onboarding_new_hire_id: 10, name: "Onboarding Documents & Agreements", category: "HR", status: "pending", items: [] },
];
const SIGNED = { items: [{ new_hire_id: 10, candidate_name: "Asha Rao", documents: [
  { id: 77, title: "Non-Disclosure Agreement", document_number: "HR-PRF-101-1", fully_signed: true,
    signatures: [{ id: 501, party: "Employee", name: "Asha Rao", method: "DRAWN", has_image: true, otp_verified: true, signed_at: "2026-11-12T09:41:00" }] },
  { id: 78, title: "Employment Contract", document_number: "HR-CON-001-1", fully_signed: true,
    signatures: [{ id: 502, party: "Employee", name: "Asha Rao", method: "TYPED", has_image: false, otp_verified: true, signed_at: "2026-11-12T09:45:00" }] },
] }] };

async function load(t) {
  calls.opened.length = 0;
  calls.images.length = 0;
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingChecklistTemplates: async () => [], createOnboardingChecklistTemplate: async () => ({}), updateOnboardingChecklistTemplate: async () => ({}),
    deleteOnboardingChecklistTemplate: async () => ({}), getOnboardingChecklistAssignments: async () => ASSIGNMENTS,
    createOnboardingChecklistAssignment: async () => ({}), updateOnboardingChecklistAssignment: async () => ({}), deleteOnboardingChecklistAssignment: async () => ({}),
    getOnboardingRecords: async () => HIRES, getRecruitmentInsights: async () => null,
  } });
  t.mock.module("../src/service/employee.js", { exports: { getEmployees: async () => [] } });
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: { errorMessage: (e, f) => e?.message || f, setChecklistException: async () => ({}) } });
  t.mock.module("../src/service/docTemplatesService.js", { exports: {
    getSignedOnboardingDocuments: async () => SIGNED,
    signatureImageUrl: async (id) => { calls.images.push(id); return `blob:sig-${id}`; },
    downloadGeneratedDocument: async (id) => { calls.opened.push(id); },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/checklists.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("the automatic Manager onboarding checklist is not shown", async (t) => {
  await load(t);
  const section = screen.getByRole("region", { name: "Checklists for Asha Rao" });
  assert.equal(within(section).queryByText("Manager onboarding"), null);
  assert.equal(within(section).queryByText("Plan week one"), null);
  assert.ok(within(section).getByText("Onboarding Documents & Agreements"));
});

test("signed documents show the drawn and typed signatures and open the signed PDF", async (t) => {
  await load(t);
  const panel = screen.getByTestId("signed-documents");
  assert.ok(within(panel).getByText("Non-Disclosure Agreement"));
  assert.equal(within(panel).getByAltText("Signature of Asha Rao").getAttribute("src"), "blob:sig-501");
  assert.ok(within(panel).getByLabelText("Typed signature: Asha Rao"));
  assert.deepEqual(calls.images, [501], "only drawn signatures are fetched as images");
  fireEvent.click(within(panel).getByRole("button", { name: /View signed PDF: Employment Contract/ }));
  await settle();
  assert.deepEqual(calls.opened, [78]);
});
