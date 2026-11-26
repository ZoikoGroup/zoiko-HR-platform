/** Onboarding documents for every organisation: its own document fields, per-document rules and timing, the automation
 * mode, the test package, the setup score, "Create field" for unknown placeholders, and the documents panel's prepared
 * documents and typed custom inputs. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const routerMock = (t) => t.mock.module("react-router-dom", { exports: {
  Link: ({ children, to, ...p }) => React.createElement("a", { href: to, ...p }, children),
  NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
  useNavigate: () => () => {},
} });

test("field names follow the server's rule", async () => {
  const { slugForField, fieldProblems } = await import("../src/modules/zoiko-hr/onboarding/CustomFieldsSettings.jsx");
  assert.equal(slugForField("Shift Allowance"), "shift_allowance");
  assert.equal(slugForField("RelocationBonus"), "relocation_bonus");
  assert.equal(slugForField("2nd shift"), "nd_shift");
  assert.equal(slugForField("!"), "");
  const base = { key: "pension", label: "Pension", type: "choice", source: "fixed", required: true, options: [], value: "" };
  assert.deepEqual(fieldProblems(base), ["Add at least one option.", "Give the value printed for every new hire."]);
  assert.deepEqual(fieldProblems({ ...base, options: ["Yes plan"], value: "Yes plan" }), []);
});

test("the fields card adds a field, proposes its name from the label and saves the list", async (t) => {
  const saved = [];
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    getCustomFields: async () => ({ fields: [], types: [{ value: "text", label: "Text" }, { value: "money", label: "Amount of money" }],
      sources: [{ value: "hr", label: "HR enters it for each new hire" }, { value: "fixed", label: "The same for every new hire" }], max_fields: 60 }),
    saveCustomFields: async (fields) => { saved.push(fields); return { fields: fields.map((f) => ({ ...f, token: `{{custom.${f.key}}}`, in_use: false })), types: [], sources: [] }; },
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/CustomFieldsSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  assert.ok(screen.getByText(/No fields of your own yet/));
  fireEvent.click(screen.getByRole("button", { name: /Add a field/ }));
  fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Shift Allowance" } });
  assert.equal(screen.getByLabelText("Name in templates").value, "shift_allowance");
  assert.ok(screen.getByText("{{custom.shift_allowance}}"));
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "money" } });
  fireEvent.click(screen.getByRole("button", { name: "Save fields" }));
  await settle();
  assert.equal(saved.length, 1);
  assert.deepEqual({ key: saved[0][0].key, type: saved[0][0].type, source: saved[0][0].source }, { key: "shift_allowance", type: "money", source: "hr" });
  assert.ok(screen.getByText(/Fields saved/));
});

const PKG = {
  documents: [
    { category: "employment_contract", title: "Employment Contract", template_id: "HR-CON-001", mode: "SIGN", enabled: true, mandatory: true,
      mandatory_reason: "Every new hire needs an employment contract.", source: "platform", can_customise: true, sort_order: 10, signers: [],
      template_state: { label: "Using the standard template" }, conditions: [], send_when: "manual" },
    { category: "org:ORG1-DOC-001", title: "Night Shift Letter", template_id: "ORG1-DOC-001", mode: "ACKNOWLEDGE", enabled: true, mandatory: false,
      source: "org_template", sort_order: 20, signers: [], template_state: { label: "Your version v1 – released" },
      conditions: [{ field: "country", op: "is", value: "IN" }], send_when: "hire_created" },
  ],
  modes: [{ value: "SIGN", label: "E-signature" }, { value: "ACKNOWLEDGE", label: "Acknowledge" }], signer_parties: ["employer", "candidate"],
  engagement_profiles: [], addable_templates: [],
  condition_fields: [
    { value: "country", label: "Work country", kind: "country", options: [], ops: ["is", "is_not", "any_of", "none_of", "set", "not_set"] },
    { value: "custom.shift_allowance", label: "Shift allowance", kind: "number", options: [], custom: true, ops: ["is", "is_not", "gt", "lt", "set", "not_set"] },
  ],
  condition_ops: [{ value: "is", label: "is" }, { value: "gt", label: "is more than" }, { value: "set", label: "has a value" }],
  triggers: [{ value: "manual", label: "When HR sends it" }, { value: "hire_created", label: "When the new hire is created (offer accepted)" },
    { value: "days_before_start", label: "Days before the start date" }],
  automation: { mode: "review", modes: [{ value: "review", label: "Prepare the documents and wait for HR to send them" },
    { value: "auto", label: "Send the documents automatically as soon as they are ready" }] },
};

test("each document shows its rules, and the rules panel saves a trigger, a countersignature and conditions", async (t) => {
  routerMock(t);
  const saves = [];
  const modes = [];
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getPackageDocuments: async () => PKG, savePackageDocuments: async (docs) => { saves.push(docs); return PKG; },
    addPackageDocument: async () => ({}), removePackageDocument: async () => ({}), customisePackageDocument: async () => ({}),
    createOrgTemplate: async () => ({}),
  } });
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    applyStarterSet: async () => PKG, getStarterSets: async () => ({ sets: [] }),
    savePackageAutomation: async (p) => { modes.push(p.mode); return { ...PKG.automation, mode: p.mode }; },
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/PackageDocumentsSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  assert.ok(screen.getByText("Sent by HR"), "the contract is sent by HR");
  assert.ok(screen.getByText(/Prepared when the new hire is created \(offer accepted\) · only when Work country is IN/));

  fireEvent.click(screen.getByRole("radio", { name: /Send automatically/ }));
  await settle();
  assert.deepEqual(modes, ["auto"]);

  const [contractRules] = screen.getAllByRole("button", { name: /Rules & timing/ });
  fireEvent.click(contractRules);
  assert.ok(screen.getByText("Employment Contract goes to every new hire."), "the mandatory contract has no conditions");
  fireEvent.change(screen.getByLabelText("When to prepare it"), { target: { value: "days_before_start" } });
  assert.equal(screen.getByLabelText("Days before the start date").value, "7");
  fireEvent.click(screen.getByRole("checkbox", { name: /The employer countersigns after them/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save package" }));
  await settle();
  const contract = saves[0].find((d) => d.category === "employment_contract");
  assert.deepEqual({ when: contract.send_when, days: contract.send_days_before, signers: contract.signers, conditions: contract.conditions },
    { when: "days_before_start", days: 7, signers: ["candidate", "employer"], conditions: [] });
});

test("an unfinished condition blocks saving", async (t) => {
  routerMock(t);
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getPackageDocuments: async () => PKG, savePackageDocuments: async () => PKG, addPackageDocument: async () => ({}),
    removePackageDocument: async () => ({}), customisePackageDocument: async () => ({}), createOrgTemplate: async () => ({}),
  } });
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    applyStarterSet: async () => PKG, getStarterSets: async () => ({ sets: [] }), savePackageAutomation: async () => PKG.automation,
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/PackageDocumentsSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  const buttons = screen.getAllByRole("button", { name: /Rules & timing/ });
  fireEvent.click(buttons[1]);
  fireEvent.click(screen.getByRole("button", { name: /Add a condition/ }));
  assert.ok(screen.getByText("Complete or remove the unfinished conditions."));
  assert.equal(screen.getByRole("button", { name: "Save package" }).disabled, true);
});

test("the test package lists what to fix in Settings and what each hire provides", async (t) => {
  routerMock(t);
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    getTestPackage: async () => ({ engagement: "standard-employee", role: "analyst", total: 2, ready: 1, all_ready: false,
      engagement_profiles: [{ slug: "standard-employee", name: "Standard Employee" }], role_profiles: [{ slug: "analyst", name: "Analyst" }],
      documents: [
        { category: "offer_letter", title: "Offer Letter", mode_label: "E-signature", ready: true, settings_gaps: [], missing_clauses: [],
          per_hire: [{ key: "employment.base_pay", meaning: "Base pay" }] },
        { category: "nda", title: "NDA", mode_label: "E-signature", ready: false, missing_clauses: [{ key: "remedies", title: "Remedies" }],
          settings_gaps: [{ key: "employer.legal_name", meaning: "Employer's legal name", source: "Settings › Company profile",
            settings_path: "/zoiko-hr/onboarding/settings#company-profile" }], per_hire: [] },
      ] }),
    getTestPackagePreview: async () => new Blob(["%PDF"]),
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/TestPackageCard.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  assert.ok(screen.getByText("1 of 2 documents can be generated. Fix the items below in Settings."));
  const link = screen.getByRole("link", { name: "Employer's legal name" });
  assert.equal(link.getAttribute("href"), "/zoiko-hr/onboarding/settings#company-profile");
  assert.ok(screen.getByRole("link", { name: "Clause wording: Remedies" }));
  assert.ok(screen.getByText("Typed for each new hire: Base pay."));
});

test("the setup score links each step to where it is fixed", async (t) => {
  routerMock(t);
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    getSetupStatus: async () => ({ done: 2, required: 4, ready: false, percent: 50, steps: [
      { key: "company", title: "Company profile", done: true, required: true, detail: "Complete", path: "/x#company-profile" },
      { key: "wording", title: "Values & clause wording", done: false, required: true, detail: "3 of 10 document(s) need settings", path: "/x#test-package" },
      { key: "automation", title: "Automatic preparation", done: false, required: false, detail: "Off", path: "/x#package-documents" },
    ] }),
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/SetupStatusCard.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  assert.ok(screen.getByText("2 of 4 required steps done."));
  assert.equal(screen.getByRole("progressbar").getAttribute("aria-valuenow"), "50");
  assert.equal(screen.getByRole("link", { name: /Values & clause wording/ }).getAttribute("href"), "/x#test-package");
  assert.ok(screen.getByText("· optional"));
});

test("an unknown placeholder in an upload becomes a field in one click", async (t) => {
  const created = [];
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    addCustomField: async (f) => { created.push(f); return { fields: [f] }; },
  } });
  const { UnknownPlaceholders } = await import(`../src/modules/zoiko-hr/onboarding/docs-setup/MappingStep.jsx?t=${Math.random()}`);
  let reloaded = 0;
  render(React.createElement(UnknownPlaceholders, {
    items: [{ key: "Shift Allowance", custom_key: "shift_allowance", custom_label: "Shift allowance" }],
    onCreated: async () => { reloaded += 1; },
  }));
  fireEvent.change(screen.getByLabelText("Type of Shift allowance"), { target: { value: "money" } });
  fireEvent.click(screen.getByRole("button", { name: /Create field/ }));
  await settle();
  assert.deepEqual(created, [{ key: "shift_allowance", label: "Shift allowance", type: "money", source: "hr", required: true }]);
  assert.equal(reloaded, 1);
});

test("the documents panel offers the prepared documents and typed inputs for the organisation's own fields", async (t) => {
  routerMock(t);
  const sent = [];
  const savedInputs = [];
  const pkg = {
    new_hire_id: 5, candidate_name: "Nora", email: "nora@example.com", sent_at: null, inputs: {}, warnings: [], printed_values: [],
    engagement: null, role: null, role_profiles: [], ready_to_send: ["daily_kpi"],
    automation: { mode: "review", queued: ["daily_kpi"], held: [], last_run: null },
    input_fields: [
      { key: "custom.pension_choice", meaning: "Pension", custom: true, input_type: "choice", options: ["Gold", "Silver"], value: "", required: true },
      { key: "custom.night_work", meaning: "Night work", custom: true, input_type: "yes_no", options: [], value: "yes", required: false },
    ],
    documents: [{ category: "daily_kpi", title: "Daily KPIs", template_id: "HR-PRF-101", mode: "ACKNOWLEDGE", mode_label: "Acknowledge",
      doc_type: "RECORD", risk: "L1", sensitivity: "C2", orientation: "portrait", signers: "—", state: "not_sent", ready: true,
      missing_fields: [], missing_clauses: [], in_package: true }],
  };
  t.mock.module("../src/service/hrService.js", { exports: {
    getHirePackage: async () => pkg, getHirePackagePreview: async () => ({}), downloadHirePackageDocument: async () => ({}),
    downloadHirePackageZip: async () => ({}), sendOnboardingPackage: async () => ({}), sendOnboardingPortalInvite: async () => ({}),
    saveHirePackageInputs: async (_id, values) => { savedInputs.push(values); return pkg; },
    getHirePackageDocumentEdit: async () => ({}), saveHirePackageDocumentEdit: async () => pkg,
    resetHirePackageDocumentEdit: async () => pkg, previewHirePackageDocumentEdit: async () => ({ blob: new Blob() }),
  } });
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    sendPreparedDocuments: async (id) => { sent.push(id); return { issued: [{ category: "daily_kpi", title: "Daily KPIs" }], held: [],
      message: "1 prepared document sent.", package: { ...pkg, automation: { ...pkg.automation, queued: [] } } }; },
  } });
  t.mock.module("../src/modules/zoiko-hr/onboarding/OfferPackageV2Section.jsx", { exports: { default: () => null } });
  const { default: Panel } = await import(`../src/modules/zoiko-hr/onboarding/OfferPackagePanel.jsx?t=${Math.random()}`);
  render(React.createElement(Panel, { hireId: 5, footer: ({ children }) => React.createElement("div", null, children) }));
  await settle();
  assert.ok(screen.getByText(/1 document was prepared automatically and is ready to send/));
  assert.ok(screen.getByText("Prepared – ready to send"));
  const pension = screen.getByLabelText(/Pension/);
  assert.equal(pension.tagName, "SELECT");
  assert.deepEqual([...pension.querySelectorAll("option")].map((o) => o.value), ["", "Gold", "Silver"]);
  assert.equal(screen.getByLabelText(/Night work/).value, "yes");
  fireEvent.change(pension, { target: { value: "Gold" } });
  const fields = screen.getByText(/Your document fields – Nora/).closest("fieldset");
  fireEvent.click(within(fields).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(savedInputs, [{ "custom.pension_choice": "Gold" }]);
  fireEvent.click(screen.getByRole("button", { name: "Send the prepared document" }));
  await settle();
  assert.deepEqual(sent, [5]);
  assert.equal(screen.queryByText(/prepared automatically and is ready/), null);
});

const GAPS = {
  complete: false, documents_total: 5, documents_ready: 2,
  fields: [
    { key: "employer.signatory_name", meaning: "Signatory", documents: ["Offer Letter", "Employment Contract"],
      inputs: [{ target: "profile", key: "signatory_name", label: "Signatory name", kind: "text", value: "" }] },
    { key: "employment.notice_text", meaning: "Notice", documents: ["Offer Letter"],
      inputs: [{ target: "profile", key: "notice_period_value", label: "Notice period (employee)", kind: "int", value: null },
        { target: "profile", key: "notice_period_unit", label: "Notice period unit (employee)", kind: "enum", options: ["calendar_days", "weeks"], value: null }] },
    { key: "clause.speak_up_channel", meaning: "Speak-up channel", documents: ["NDA"],
      inputs: [{ target: "clause_token", key: "speak_up_channel", label: "Speak-up channel", kind: "text", value: "" }] },
  ],
  clauses: [{ key: "remedies", title: "Remedies", documents: ["NDA"], drafting_note: "What happens on a breach." }],
  hire_defaults: [{ key: "employment.work_location", meaning: "Work location", documents: ["Employment Contract"],
    inputs: [{ target: "profile", key: "default_work_location", label: "Default work location", kind: "text", value: "" }] }],
  links: [{ key: "employer.countersigner", meaning: "Someone to countersign for the employer", source: "Settings › Employer countersignature",
    settings_path: "/zoiko-hr/onboarding/settings#countersign", documents: ["Employment Contract"] }],
};

test("Missing details asks for every gap in Settings and saves them in one go", async (t) => {
  routerMock(t);
  const saved = [];
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    getSettingsGaps: async () => GAPS,
    saveSettingsGaps: async (p) => { saved.push(p); return { ...GAPS, complete: true, documents_ready: 5, fields: [], clauses: [], hire_defaults: [], links: [] }; },
  } });
  let refreshed = 0;
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/MissingDetailsCard.jsx?t=${Math.random()}`);
  render(React.createElement(Card, { onSaved: () => { refreshed += 1; } }));
  await settle();
  assert.ok(screen.getByText(/3 of 5 documents are held until these are filled/));
  assert.ok(screen.getByText("Needed by: Offer Letter, Employment Contract"));
  assert.equal(screen.getByRole("link", { name: /Someone to countersign for the employer/ }).getAttribute("href"), "/zoiko-hr/onboarding/settings#countersign");
  const save = screen.getByRole("button", { name: "Save missing details" });
  assert.equal(save.disabled, true, "nothing typed yet");
  fireEvent.change(screen.getByLabelText("Signatory name"), { target: { value: "Avery Admin" } });
  fireEvent.change(screen.getByLabelText("Notice period (employee)"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Notice period unit (employee)"), { target: { value: "calendar_days" } });
  fireEvent.change(screen.getByLabelText("Speak-up channel"), { target: { value: "ethics@acme.example" } });
  fireEvent.change(screen.getByLabelText("Default work location"), { target: { value: "Leeds office" } });
  fireEvent.change(screen.getByLabelText("Remedies"), { target: { value: "Our counsel's remedies wording." } });
  assert.equal(save.disabled, true, "clause wording needs the confirmation");
  fireEvent.click(screen.getByRole("checkbox", { name: /approved for use/ }));
  fireEvent.click(save);
  await settle();
  assert.deepEqual(saved[0], {
    profile: { signatory_name: "Avery Admin", notice_period_value: 30, notice_period_unit: "calendar_days", default_work_location: "Leeds office" },
    package: {}, clause_tokens: { speak_up_channel: "ethics@acme.example" }, clauses: { remedies: "Our counsel's remedies wording." },
  });
  assert.equal(refreshed, 1);
  assert.ok(screen.getByText("Nothing missing"));
});

test("Missing details shows the server's reason next to the field", async (t) => {
  routerMock(t);
  t.mock.module("../src/service/onboardingSetupService.js", { exports: {
    getSettingsGaps: async () => ({ ...GAPS, clauses: [] }),
    saveSettingsGaps: async () => { const e = new Error("Some company details need correcting."); e.detail = { errors: { signatory_name: "Too long." } }; throw e; },
  } });
  const { default: Card } = await import(`../src/modules/zoiko-hr/onboarding/MissingDetailsCard.jsx?t=${Math.random()}`);
  render(React.createElement(Card));
  await settle();
  fireEvent.change(screen.getByLabelText("Signatory name"), { target: { value: "x".repeat(300) } });
  fireEvent.click(screen.getByRole("button", { name: "Save missing details" }));
  await settle();
  assert.ok(screen.getByText("Too long."));
  assert.ok(screen.getByText("Some company details need correcting."));
});
