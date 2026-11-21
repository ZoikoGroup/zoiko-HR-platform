/** QA report #17 (onboarding portal): the structured forms check every field with the shared rules, use lists for country,
 * region and language, show the server's field errors, the phone box stays usable, and the portal only celebrates a
 * submission the server accepted. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const STARTER = {
  canonical_id: "HR-ONB-001", title: "New starter information", status: "DRAFT", work_country: "IN", masked_keys: [], errors: {},
  values: {}, declaration: "I confirm these details are correct.",
  fields: [
    { key: "legal_first_name", label: "Legal first name", required: true, rule: "person_name" },
    { key: "personal_email", label: "Personal email", required: true, rule: "email", input: "email" },
    { key: "mobile_phone", label: "Mobile phone", required: true, rule: "phone", input: "phone" },
    { key: "region", label: "Region / state", rule: "state", input: "region" },
    { key: "postal_code", label: "Postal code", required: true, rule: "postal_code" },
    { key: "country", label: "Country", required: true, rule: "country", input: "country" },
    { key: "preferred_language", label: "Preferred language for communications", rule: "language", input: "language" },
  ],
};
const BANK = {
  canonical_id: "HR-ONB-017", title: "Bank and payroll details", status: "DRAFT", work_country: "IN", masked_keys: [], errors: {},
  values: {}, declaration: "I confirm.",
  fields: [
    { key: "bank_name", label: "Bank name", required: true, rule: "bank_name", classification: "FINANCIAL" },
    { key: "routing_code", label: "IFSC code", required: true, rule: "bank_routing", classification: "FINANCIAL" },
  ],
};

async function loadForms(t, items, over = {}) {
  const calls = [];
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    getPortalForms: async () => ({ items }),
    savePortalForm: async (...args) => { calls.push(["save", ...args]); if (over.saveError) throw over.saveError; return { status: "DRAFT", values: args[2] }; },
    submitPortalForm: async (...args) => { calls.push(["submit", ...args]); return { status: "SUBMITTED", values: args[2] }; },
    errorMessage: (e, fallback) => e?.message || fallback,
  } });
  const changed = [];
  const { default: Forms } = await import(`../src/modules/zoiko-hr/onboarding/PortalStructuredForms.jsx?t=${Math.random()}`);
  render(React.createElement(Forms, { token: "tok", onChanged: () => changed.push(1) }));
  await settle();
  return { calls, changed };
}

const byId = (id) => document.getElementById(id);

test("junk values show their rule's message under the field and nothing is sent (BUG-1…10)", async (t) => {
  const { calls } = await loadForms(t, [STARTER]);
  fireEvent.change(byId("portal-HR-ONB-001-legal_first_name"), { target: { value: "##%^%^346" } });
  fireEvent.blur(byId("portal-HR-ONB-001-legal_first_name"));
  assert.match(byId("portal-HR-ONB-001-legal_first_name-error").textContent, /Use letters only/);
  assert.equal(byId("portal-HR-ONB-001-legal_first_name").getAttribute("aria-invalid"), "true");
  fireEvent.change(byId("portal-HR-ONB-001-personal_email"), { target: { value: "yash.pagidipalli95gmail.com" } });
  fireEvent.change(byId("portal-HR-ONB-001-postal_code"), { target: { value: "sfgfgh#$%" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await settle();
  assert.equal(calls.length, 0, "a draft with invalid values is not saved");
  assert.match(byId("portal-HR-ONB-001-personal_email-error").textContent, /valid email/);
  assert.match(byId("portal-HR-ONB-001-postal_code-error").textContent, /postal code for India/);
  assert.equal(document.activeElement, byId("portal-HR-ONB-001-legal_first_name"), "the first invalid field is focused");
});

test("country, region and language are lists; the region list follows the country", async (t) => {
  await loadForms(t, [STARTER]);
  assert.equal(byId("portal-HR-ONB-001-country").tagName, "SELECT");
  assert.equal(byId("portal-HR-ONB-001-preferred_language").tagName, "SELECT");
  assert.ok([...byId("portal-HR-ONB-001-preferred_language").options].some((o) => o.value === "hi" && o.textContent === "Hindi"));
  fireEvent.change(byId("portal-HR-ONB-001-country"), { target: { value: "India" } });
  assert.equal(byId("portal-HR-ONB-001-region").tagName, "SELECT");
  assert.ok([...byId("portal-HR-ONB-001-region").options].some((o) => o.value === "Telangana"));
  fireEvent.change(byId("portal-HR-ONB-001-country"), { target: { value: "Kenya" } });
  assert.equal(byId("portal-HR-ONB-001-region").tagName, "INPUT", "free text where the country has no region list");
});

test("valid values are saved; the portal is told so its checklist follows", async (t) => {
  const { calls, changed } = await loadForms(t, [BANK]);
  fireEvent.change(byId("portal-HR-ONB-017-bank_name"), { target: { value: "State Bank of India" } });
  fireEvent.change(byId("portal-HR-ONB-017-routing_code"), { target: { value: "sbin0001234" } });
  assert.equal(byId("portal-HR-ONB-017-routing_code").value, "SBIN0001234", "upper-cased while typing");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await settle();
  assert.deepEqual(calls[0], ["save", "tok", "HR-ONB-017", { bank_name: "State Bank of India", routing_code: "SBIN0001234" }]);
  assert.equal(changed.length, 1);
});

test("the server's 422 errors appear under their fields (BUG-12, 14)", async (t) => {
  const saveError = Object.assign(new Error("Fix the highlighted fields."), {
    status: 422, detail: { code: "INVALID_FIELDS", message: "Fix the highlighted fields.", errors: { bank_name: "Enter your bank's name, for example State Bank of India." } },
  });
  await loadForms(t, [BANK], { saveError });
  fireEvent.change(byId("portal-HR-ONB-017-bank_name"), { target: { value: "Some Bank" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await settle();
  assert.match(byId("portal-HR-ONB-017-bank_name-error").textContent, /State Bank of India/);
});

test("values saved before the rules show their problems on load", async (t) => {
  await loadForms(t, [{ ...STARTER, values: { legal_first_name: "##%^%^346" },
    errors: { legal_first_name: "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed." } }]);
  assert.match(byId("portal-HR-ONB-001-legal_first_name-error").textContent, /Use letters only/);
});

test("the phone number box keeps a usable width whatever classes the page passes (BUG-15)", async () => {
  const { default: PhoneField } = await import(`../src/components/PhoneField.jsx?t=${Math.random()}`);
  render(React.createElement(PhoneField, { id: "ph", value: "", onChange: () => {}, country: "India",
    className: "w-full flex-1 min-w-0 rounded-xl border px-3", selectClassName: "w-full rounded-xl" }));
  const input = byId("ph");
  const select = screen.getByLabelText("Phone country code");
  assert.match(select.className, /\bw-28\b/);
  assert.doesNotMatch(select.className, /\bw-full\b|\bflex-1\b/);
  assert.match(input.parentElement.className, /min-w-\[9rem\]/);
  assert.match(input.className, /\bw-full\b/);
  assert.doesNotMatch(input.className, /\bmin-w-0\b|\bflex-1\b/);
});

test("the portal never shows the success page when the server refuses the submission (BUG-16)", async (t) => {
  const view = {
    candidate_name: "Anil Kumar", organization_name: "Acme", position: "Analyst", details: {}, documents: [],
    package: { needs: [] }, orientation: [],
    submission: { submitted_at: null, can_submit: true, outstanding: [], steps: [{ title: "Your contact and address details", done: false }] },
  };
  const refused = Object.assign(new Error("Finish these first: complete Your contact and address details"), { status: 409 });
  t.mock.module("react-router-dom", { exports: { useParams: () => ({ token: "tok" }), Link: ({ children }) => children, NavLink: ({ children }) => children } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getPortal: async () => view, getPortalDocumentFile: async () => ({}), savePortalDetails: async () => view, uploadPortalDocument: async () => ({}),
    acknowledgePortalDocument: async () => view, savePortalOutsideActivities: async () => view, portalPackageFileUrl: () => "",
    submitSignedPackage: async () => { throw refused; }, getPortalPackageForm: async () => ({}), savePortalPackageForm: async () => ({}),
    submitPortalPackageForm: async () => ({}),
    getPortalMyDocuments: async () => [], getPortalMyDocumentFile: async () => ({}), getPortalMyDocumentsZip: async () => ({}),
  } });
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    getPortalForms: async () => ({ items: [] }), savePortalForm: async () => ({}), submitPortalForm: async () => ({}),
    errorMessage: (e, f) => e?.message || f, getPortalStructuredForms: async () => ({ items: [] }),
  } });
  const { default: Page } = await import(`../src/pages/OnboardingPortalPage.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(document.body.textContent, /0 of 1 items completed/, "the contact details count in the progress");
  fireEvent.click(screen.getByRole("button", { name: /Submit onboarding documents/ }));
  await settle();
  assert.doesNotMatch(document.body.textContent, /Submission successful|Onboarding complete/);
  assert.match(document.body.textContent, /Finish these first/);
});
