/** Onboarding Settings is a real form backed by the API, and the Joining Report says what its average is based on. */
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
    Link: ({ children }) => React.createElement("a", null, children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
}

async function loadSettings(t, over = {}) {
  const calls = { save: [] };
  let fails = over.failTimes || 0;
  mockShell(t);
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingSettings: async () => { if (fails > 0) { fails -= 1; throw new Error("Network down"); } return SETTINGS; },
    getOnboardingChecklistTemplates: async () => [{ id: 1, name: "IT Setup", category: "it" }, { id: 2, name: "HR Basics", category: "hr" }],
    saveOnboardingSettings: async (p) => { calls.save.push(p); if (over.saveError) throw over.saveError; return p; },
    getOfferPackageSettings: async () => ({ settings: { brand_primary: "#0B3D91", brand_accent: "#00A3E0", paper: "A4", spelling: "UK",
      date_format: "DMY", response_days: 7 }, clauses: [], documents: [], mode_labels: {} }),
    saveOfferPackageSettings: async (p) => ({ settings: p, clauses: [], documents: [], mode_labels: {} }),
    getOfferPackageTemplateSet: async () => ({ blob: new Blob(["%PDF"]), filename: "set.pdf" }),
    getOfferPackageLogo: async () => ({ blob: new Blob(["png"], { type: "image/png" }), filename: "logo.png" }),
    uploadOfferPackageLogo: async () => ({ settings: { has_logo: true }, clauses: [], documents: [], mode_labels: {} }),
    deleteOfferPackageLogo: async () => ({ settings: { has_logo: false }, clauses: [], documents: [], mode_labels: {} }),
    getCompanyProfile: async () => ({ profile: { legal_name: "" }, completeness: { percent: 0, missing: [], complete: false }, fields: [] }),
    saveCompanyProfile: async (p) => ({ profile: p, completeness: { percent: 100, missing: [], complete: true }, fields: [] }),
    prefillCompanyProfile: async () => ({ proposal: {}, saved: false }),
    getOnboardingProfiles: async () => ({ engagement_profiles: [], role_profiles: [] }),
    saveEngagementProfile: async () => ({ engagement_profiles: [], role_profiles: [] }),
    deleteEngagementProfile: async () => ({ engagement_profiles: [], role_profiles: [] }),
    saveRoleProfile: async () => ({ engagement_profiles: [], role_profiles: [] }),
    deleteRoleProfile: async () => ({ engagement_profiles: [], role_profiles: [] }),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("settings load from the server and save exactly what the form shows", async (t) => {
  const calls = await loadSettings(t);
  assert.doesNotMatch(document.body.textContent, /Security Awareness|Company Overview|Facilities & Security/);
  assert.equal(screen.getByLabelText(/HR Basics/).checked, true);
  fireEvent.click(screen.getByLabelText(/IT Setup/));
  fireEvent.click(screen.getByLabelText("Bank details"));
  fireEvent.change(document.getElementById("os-reminder-days"), { target: { value: "0" } });
  assert.match(document.body.textContent, /0 means no reminders/);
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.deepEqual(calls.save[0], { ...SETTINGS, auto_template_ids: [2, 1], required_document_categories: ["id_proof", "bank_details"], reminder_days: 0 });
  assert.match(screen.getByRole("status").textContent, /saved/);
});

test("out-of-range values are refused before saving, and server refusals show under the field", async (t) => {
  const err = Object.assign(new Error("Link valid for must be 180 or less"), { validation: [{ loc: ["body", "portal_link_days"], msg: "Input should be less than or equal to 180" }] });
  const calls = await loadSettings(t, { saveError: err });
  fireEvent.change(document.getElementById("os-link-days"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.equal(calls.save.length, 0);
  assert.match(document.body.textContent, /1 to 180/);
  fireEvent.change(document.getElementById("os-link-days"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.equal(calls.save.length, 1);
  assert.ok(screen.getAllByRole("alert").some((a) => /180 or less/.test(a.textContent)));
});

test("a failed settings load shows Retry, and Retry loads the form", async (t) => {
  await loadSettings(t, { failTimes: 1 });
  assert.match(screen.getByRole("alert").textContent, /Network down/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.ok(screen.getByRole("button", { name: "Save Settings" }));
});
