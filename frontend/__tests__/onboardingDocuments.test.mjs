/** ZHR-69: the Upload Document form recognises the title, category and file that were entered. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateUploadForm, serverUploadErrors, extensionOf, fileSizeText } from "../src/utils/onboardingDocForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const file = (name, size = 100) => ({ name, size });

test("the root cause: a header set to undefined is not sent, so the browser can add the multipart boundary", async () => {
  const seen = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { seen.headers = opts.headers; seen.body = opts.body; return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const { apiRequest } = await import("../src/service/api.js");
    const fd = new FormData();
    fd.append("title", "Offer");
    await apiRequest("/hr/onboarding/documents", { method: "POST", body: fd, headers: { "Content-Type": undefined } });
    assert.ok(!("Content-Type" in seen.headers), JSON.stringify(seen.headers));
    assert.ok(seen.body instanceof FormData);
    await apiRequest("/x", { method: "POST", body: { a: 1 } });
    assert.equal(seen.headers["Content-Type"], "application/json", "ordinary JSON calls keep their header");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a filled form validates, and each problem is named", () => {
  assert.deepEqual(validateUploadForm({ title: "Offer", category: "offer_letter", file: file("a.pdf") }), {});
  assert.deepEqual(validateUploadForm({ title: " ", category: "", file: null }),
    { title: "Title is required.", category: "Category is required.", file: "Choose a file to upload." });
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("run.exe") }).file, /\.exe file type is not allowed/);
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("a.pdf", 0) }).file, /empty/);
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("a.pdf", 11 * 1024 * 1024) }).file, /maximum size is 10 MB/);
  assert.match(validateUploadForm({ title: "x".repeat(201), category: "nda", file: file("a.pdf") }).title, /200/);
  assert.equal(extensionOf("Report.FINAL.PDF"), ".pdf");
  assert.equal(fileSizeText(1536), "2 KB");
});

test("the server's refusals become field messages, never a bare 'Field required'", () => {
  const out = serverUploadErrors([
    { loc: ["body", "title"], msg: "Value error, Title is required." },
    { loc: ["body", "file"], msg: "Field required" },
  ]);
  assert.equal(out.title, "Title is required.");
  assert.equal(out.file, "File is required.");
});

const PKG_DOC = (category, title, mode, extra = {}) => ({ category, title, mode, mode_label: mode, template_id: "HR-X", doc_type: "FORM",
  risk: "L1", sensitivity: "C2", orientation: "portrait", signers: "Employee", state: "not_sent", ready: false, missing_fields: [],
  missing_clauses: [], ...extra });
const PACKAGE = (id) => ({
  new_hire_id: id, candidate_name: "Ann Lee", documents: [
    PKG_DOC("offer_letter", "Offer Letter", "SIGN", { missing_clauses: [{ key: "probation", title: "Probation" }],
      missing_fields: [{ key: "employment.base_pay", meaning: "Base pay amount and currency", source: "Payroll", editable: true }] }),
    PKG_DOC("nda", "Non-Disclosure Agreement", "SIGN", { missing_fields: [{ key: "worker.postal_address", meaning: "Postal address",
      source: "Zoiko HR", editable: true, candidate_provides: true, hr_may_enter: true }] }),
    PKG_DOC("daily_kpi", "Daily Key Performance Indicators", "ACKNOWLEDGE", { ready: true }),
    PKG_DOC("daily_work_report", "Daily Work Report (DWR)", "INFO", { ready: true, state: "available" }),
  ], ready_to_send: ["daily_kpi"], inputs: {}, input_fields: [],
});

// OfferPackagePanel is imported statically by documents.jsx, so the module cache keeps the first test's service mock;
// the package mocks therefore report to whichever test is running now.
const CURRENT = { calls: null, over: {} };

async function load(t, over = {}) {
  const calls = { create: [], update: [], request: [], sendPackage: [] };
  CURRENT.calls = calls;
  CURRENT.over = over;
  const svc = {
    getOnboardingDocuments: async () => over.docs ?? [{ id: 1, title: "NDA copy", category: "nda", status: "pending", onboarding_new_hire_id: 7, file_url: "/hr/onboarding/documents/1/file", created_at: "2026-10-01T10:00:00Z" }],
    getOnboardingRecords: async () => [{ id: 7, candidate_name: "Ann Lee", status: "pre_joining" }, { id: 8, candidate_name: "Old Hire", status: "completed" }],
    createOnboardingDocument: async (fd) => { calls.create.push(Object.fromEntries(fd.entries())); if (over.createError) throw over.createError; return {}; },
    updateOnboardingDocument: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw over.updateError; return {}; },
    requestOnboardingDocuments: async (id, cats) => { calls.request.push([id, cats]); return cats.map((c, i) => ({ id: 100 + i, category: c, status: "requested" })); },
    deleteOnboardingDocument: async () => ({}),
    getOnboardingDocumentFile: async () => ({ blob: new Blob(["x"]), filename: "NDA copy.pdf" }),
    sendOnboardingPackage: async (id, categories) => { CURRENT.calls.sendPackage.push(id); CURRENT.calls.sendCategories = categories; if (CURRENT.over.sendError) throw CURRENT.over.sendError; return CURRENT.over.sendResult ?? { success: true, message: "1 document(s) sent to Ann Lee.", issued: [{ category: "daily_kpi", title: "Daily Key Performance Indicators", mode: "ACKNOWLEDGE" }], held: [], email_sent: true }; },
    getHirePackage: async (id) => CURRENT.over.pkg ?? PACKAGE(id),
    saveHirePackageInputs: async (id, values) => { CURRENT.calls.inputs = values; if (CURRENT.over.saveError) throw CURRENT.over.saveError; return CURRENT.over.pkg ?? PACKAGE(id); },
    getHirePackagePreview: async () => ({ blob: new Blob(["%PDF"]), filename: "preview.pdf" }),
    getHirePackageDocumentEdit: async (id, cat) => CURRENT.over.edit ?? {
      category: cat, title: "Offer Letter", template_id: "HR-HIR-011", state: "not_sent", editable: true, edited: false,
      content: [{ type: "paragraph", text: "A standard paragraph about {{worker.full_name}}." }],
      standard_content: [{ type: "paragraph", text: "A standard paragraph about {{worker.full_name}}." }],
      missing_fields: [{ key: "employment.base_pay", meaning: "Base pay amount and currency", editable: true }],
      missing_clauses: [], values: {},
      placeholders: { fields: [{ key: "worker.full_name", label: "Full name" }], clauses: [], list_sources: [] },
    },
    previewHirePackageDocumentEdit: async (id, cat, content, values) => {
      (CURRENT.calls.preview ??= []).push({ id, cat, content, values });
      return { blob: new Blob(["%PDF"], { type: "application/pdf" }), filename: "edit-preview.pdf" };
    },
    saveHirePackageDocumentEdit: async (id, cat, content, values) => {
      CURRENT.calls.edit = { id, cat, content, values };
      return CURRENT.over.pkg ?? PACKAGE(id);
    },
    resetHirePackageDocumentEdit: async (id, cat) => { CURRENT.calls.reset = [id, cat]; return CURRENT.over.pkg ?? PACKAGE(id); },
    sendOnboardingPortalInvite: async () => ({ email_sent: true }),
    getOfferPackageTemplateSet: async () => ({ blob: new Blob(["%PDF"]), filename: "set.pdf" }),
    saveCompanySectors: async () => ({}), addEngagementCategories: async () => ({}), addSuggestedRoles: async () => ({}),
    getOnboardingProfiles: async () => CURRENT.over.profiles ?? ({ engagement_profiles: [{ slug: "standard-employee", name: "Standard Employee", default: true, builtin: true }],
      role_profiles: [] }),
    downloadHirePackageDocument: async (id, cat, fmt) => ({ blob: new Blob(["x"]), filename: `${cat}.${fmt}` }),
    downloadHirePackageZip: async () => ({ blob: new Blob(["x"]), filename: "package.zip" }),
    startBulkPackageGeneration: async (ids) => ({ job_id: "j1", status: "completed", done: ids.length, total: ids.length, failed: [] }),
    getBulkPackageJob: async () => ({ job_id: "j1", status: "completed", done: 1, total: 1, failed: [] }),
    downloadBulkPackageZip: async () => ({ blob: new Blob(["x"]), filename: "packages.zip" }),
    getOnboardingSubmissions: async () => CURRENT.over.submissions ?? [],
    getOnboardingDocumentDetail: async () => ({ document: {}, answers: null, evidence: null, history: [], can_reveal: false }),
    downloadOnboardingDocumentFile: async () => ({ blob: new Blob(["x"]), filename: "x.pdf" }),
    reviewOnboardingDocument: async () => ({}),
    downloadHireDocumentsZip: async () => ({ blob: new Blob(["x"]), filename: "docs.zip" }),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
    Link: ({ children }) => React.createElement("a", null, children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  // the organisation's package: the 10 standard documents, all on
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getPackageDocuments: async () => ({ documents: Array.from({ length: 10 }, (_, i) => ({ category: `d${i}`, enabled: true, source: "platform" })) }),
    getRequestCategories: async () => { throw new Error("not needed"); },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/documents.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const openEmployee = async (name = "Ann Lee") => {
  fireEvent.click(screen.getByRole("button", { name: `View documents of ${name}` }));
  await settle();
};
const docRow = (re) => [...document.querySelectorAll('[data-testid="doc-row"]')].find((r) => re.test(r.textContent));
const open = async () => { fireEvent.click(screen.getByRole("button", { name: /Upload Document/ })); await settle(); };
const choose = (f) => fireEvent.change(document.getElementById("od-file"), { target: { files: [f] } });

test("with the title, category and file filled in, the upload is sent with all three", async (t) => {
  const calls = await load(t);
  await open();
  fireEvent.change(document.getElementById("od-title"), { target: { value: "  Signed   offer " } });
  fireEvent.change(document.getElementById("od-category"), { target: { value: "offer_letter" } });
  fireEvent.change(document.getElementById("od-record"), { target: { value: "7" } });
  choose(new File(["%PDF"], "offer.pdf", { type: "application/pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].title, "Signed offer");
  assert.equal(calls.create[0].category, "offer_letter");
  assert.equal(calls.create[0].onboarding_record_id, "7");
  assert.equal(calls.create[0].file.name, "offer.pdf");
  assert.equal(document.querySelector(".fixed"), null, "the dialog closes");
});

test("an empty form names each missing field and sends nothing; typing clears the message", async (t) => {
  const calls = await load(t);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /Title is required\./);
  assert.match(text, /Category is required\./);
  assert.match(text, /Choose a file to upload\./);
  assert.equal(calls.create.length, 0);
  fireEvent.change(document.getElementById("od-title"), { target: { value: "Offer" } });
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Title is required/);
  choose(new File(["x"], "virus.exe"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /\.exe file type is not allowed/);
});

test("a server refusal is shown under its field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "file"], msg: "Value error, File too large. Maximum size is 10MB." }] });
  await load(t, { createError: err });
  await open();
  fireEvent.change(document.getElementById("od-title"), { target: { value: "Offer" } });
  fireEvent.change(document.getElementById("od-category"), { target: { value: "nda" } });
  choose(new File(["x"], "big.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /File too large/);
});

test("the page lists employees; their documents open on click, and Reject needs a reason", async (t) => {
  const calls = await load(t);
  const rows = [...document.querySelectorAll('[data-testid="employee-row"]')];
  assert.equal(rows.length, 1, "one row per employee, not per document");
  assert.match(rows[0].textContent, /Ann Lee/);
  assert.equal(document.querySelector('[data-testid="doc-row"]'), null, "documents are not listed until an employee is opened");
  await openEmployee();
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" }).at(-1));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Enter a reason/);
  assert.equal(calls.update.length, 0);
  fireEvent.change(document.querySelector('[aria-label="Reject Document"] textarea'), { target: { value: "Blurry scan" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" }).at(-1));
  await settle();
  assert.deepEqual(calls.update, [[1, { status: "rejected", rejection_reason: "Blurry scan" }]]);
});

test("only pending documents can be approved; requested ones show 'Not uploaded' and no View/Download", async (t) => {
  await load(t, { docs: [
    { id: 1, title: "NDA copy", category: "nda", status: "pending", onboarding_new_hire_id: 7, file_url: "/f/1" },
    { id: 2, title: "ID proof", category: "id_proof", status: "requested", onboarding_new_hire_id: 7, file_url: null },
    { id: 3, title: "Offer", category: "offer_letter", status: "approved", onboarding_new_hire_id: 7, file_url: "/f/3" },
  ] });
  assert.match(document.querySelector('[data-testid="employee-row"]').textContent, /1 to review/);
  await openEmployee();
  const nda = docRow(/NDA copy/), id = docRow(/ID proof/), offer = docRow(/^Offer/);
  assert.match(nda.textContent, /Needs review/);
  assert.match(nda.textContent, /Approve/);
  assert.match(id.textContent, /Not uploaded/);
  assert.doesNotMatch(id.textContent, /View|Download|Approve(?!d)|Reject/);
  assert.doesNotMatch(offer.textContent, /Approve(?!d)/);
  assert.match(offer.textContent, /Reject/);
  assert.match(document.body.textContent, /2 of 10 sent/);
  assert.match(document.querySelector('[data-testid="count-requested"]').textContent, /1/);
});

test("an approve error is shown in a banner and the list stays", async (t) => {
  await load(t, { updateError: new Error("This document has no file yet.") });
  await openEmployee();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await settle();
  assert.match(document.body.textContent, /This document has no file yet\./);
  assert.ok(document.querySelector('[data-testid="employee-row"]'), "the list is still there");
});

test("requesting documents from a new hire sends the categories and reports who was emailed", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Request documents from a new hire" }));
  await settle();
  const hireSelect = document.getElementById("req-hire");
  assert.doesNotMatch(hireSelect.textContent, /Old Hire/, "completed hires are not offered");
  fireEvent.change(hireSelect, { target: { value: "7" } });
  fireEvent.click(screen.getByLabelText("ID proof"));
  fireEvent.click(screen.getByLabelText("Bank details"));
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await settle();
  assert.deepEqual(calls.request, [[7, ["id_proof", "bank_details"]]]);
  assert.match(screen.getByRole("status").textContent, /Requested 2 document\(s\); Ann Lee was emailed/);
});

test("uploads outside pdf/jpg/png/doc/docx are refused before sending", async (t) => {
  const calls = await load(t);
  await open();
  fireEvent.change(document.getElementById("od-title"), { target: { value: "Sheet" } });
  fireEvent.change(document.getElementById("od-category"), { target: { value: "other" } });
  choose(new File(["x"], "data.xlsx"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /\.xlsx file type is not allowed/);
  assert.equal(calls.create.length, 0);
});

test("the offer package panel shows readiness, takes missing data, and sends only ready documents", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
  const panel = document.querySelector(".fixed").textContent;
  assert.match(panel, /Counsel wording needed/);
  assert.match(panel, /Counsel wording: Probation/);
  assert.match(panel, /sent automatically once the new hire enters it in their portal/);
  assert.match(panel, /Ready to send/);
  assert.ok(document.getElementById("pkg-in-worker.postal_address"), "HR may type the address when they have it");
  fireEvent.change(document.getElementById("pkg-in-employment.base_pay"), { target: { value: "GBP 40,000 per year" } });
  fireEvent.click(screen.getByRole("button", { name: "Save details" }));
  await settle();
  assert.deepEqual(calls.inputs, { "employment.base_pay": "GBP 40,000 per year" });
  // every document that can go is ticked; HR can leave any of them out
  const boxes = [...document.querySelectorAll('input[type="checkbox"][id^="pkg-pick-"]')];
  assert.ok(boxes.length >= 1 && boxes.every((b) => b.checked));
  const ticked = boxes.map((b) => b.id.replace("pkg-pick-", ""));
  // the ready KPI document and the NDA waiting for the new hire's address are both ticked, and both count
  fireEvent.click(screen.getByRole("button", { name: /Send 2 selected documents/ }));
  await settle();
  assert.deepEqual(calls.sendPackage, [7]);
  assert.deepEqual(calls.sendCategories, ticked);
  assert.match(document.body.textContent, /Sent: Daily Key Performance Indicators/);
  const toasts = [...document.querySelectorAll('[data-testid="toast"]')].map((n) => n.textContent);
  assert.ok(toasts.some((x) => /1 document\(s\) sent to Ann Lee/.test(x)), "a toast confirms the send");
});

test("Edit / Fill missing gaps opens the whole-document editor and saves wording and gaps together", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Edit \/ Fill missing gaps for Offer Letter/ }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Edit Offer Letter" });
  assert.match(dialog.textContent, /Document wording/);
  assert.match(dialog.textContent, /A standard paragraph about/);
  assert.ok(document.getElementById("pkg-edit-gap-employment.base_pay"), "the missing value is editable here too");
  fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
  await settle();
  const textarea = [...dialog.querySelectorAll("textarea")].find((n) => n.value.includes("standard paragraph"));
  assert.ok(textarea, "the block's text can be changed");
  fireEvent.change(textarea, { target: { value: "A revised paragraph about {{worker.full_name}}." } });
  fireEvent.change(document.getElementById("pkg-edit-gap-employment.base_pay"), { target: { value: "GBP 45,000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await settle();
  assert.equal(calls.edit.id, 7);
  assert.equal(calls.edit.cat, "offer_letter");
  assert.match(calls.edit.content[0].text, /A revised paragraph/);
  assert.deepEqual(calls.edit.values, { "employment.base_pay": "GBP 45,000" });
});

test("the live preview in the editor uses unsaved wording and gap values", async (t) => {
  const calls = await load(t);
  const created = URL.createObjectURL, revoked = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
  try {
    fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /Edit \/ Fill missing gaps for Offer Letter/ }));
    await settle();
    fireEvent.change(document.getElementById("pkg-edit-gap-employment.base_pay"), { target: { value: "GBP 47,000" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    assert.ok(calls.preview?.length, "the editor asked for a preview");
    assert.equal(calls.preview.at(-1).values["employment.base_pay"], "GBP 47,000", "without saving first");
  } finally {
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
  }
});

test("a sent document opens in the editor read-only", async (t) => {
  await load(t, { edit: { category: "daily_work_report", title: "Daily Work Report (DWR)", template_id: "HR-DWR",
    state: "available", editable: false, edited: false, content: [{ type: "paragraph", text: "Sent wording." }],
    standard_content: [], missing_fields: [], missing_clauses: [], values: {},
    placeholders: { fields: [], clauses: [], list_sources: [] } } });
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Edit \/ Fill missing gaps for Daily Work Report/ }));
  await settle();
  assert.match(screen.getByRole("dialog", { name: "Edit Daily Work Report (DWR)" }).textContent, /already been sent/);
  assert.equal(screen.queryByRole("button", { name: "Save changes" }), null);
});

test("the org admin chooses how many of the documents to send", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
  const box = document.getElementById("pkg-pick-daily_kpi");
  assert.ok(box && box.checked, "a ready document starts ticked");
  fireEvent.click(box);
  assert.equal(box.checked, false);
  // QA R1-11: a ticked document waiting only for the new hire's details can be sent (it is released once they enter them)
  assert.equal(screen.getByRole("button", { name: /Send 1 selected document/ }).disabled, false);
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  assert.equal(document.getElementById("pkg-pick-daily_kpi").checked, true);
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  assert.ok([...document.querySelectorAll('input[id^="pkg-pick-"]')].every((b) => !b.checked));
  assert.ok(screen.getByRole("button", { name: /Send\s+selected documents/ }).disabled, "nothing ticked: nothing to send");
  fireEvent.click(document.getElementById("pkg-pick-daily_kpi"));
  fireEvent.click(screen.getByRole("button", { name: /Send 1 selected document/ }));
  await settle();
  assert.deepEqual(calls.sendCategories, ["daily_kpi"]);
});

test("the upload request lists only upload categories, never package documents", async (t) => {
  await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Request documents from a new hire" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /ID proof/);
  assert.doesNotMatch(text, /Non-Disclosure Agreement|Employment Contract/);
});

test("signed package agreements offer no Approve or Reject; HR reviews only uploads", async (t) => {
  await load(t, { docs: [
    { id: 1, title: "Employment Contract", category: "employment_contract", status: "approved", package_mode: "SIGN", requires_signature: true,
      signing_status: "EXECUTED", onboarding_new_hire_id: 7, file_url: "/f/1", created_at: "2026-10-01T10:00:00Z" },
    { id: 2, title: "ID proof", category: "id_proof", status: "pending", onboarding_new_hire_id: 7, file_url: "/f/2", created_at: "2026-10-01T10:00:00Z" },
  ] });
  await openEmployee();
  const contract = docRow(/Employment Contract/), idRow = docRow(/ID proof/);
  assert.doesNotMatch(contract.textContent, /Approve|Reject/);
  assert.match(contract.textContent, /E-Signed/);
  assert.match(idRow.textContent, /Approve/);
});

test("an employee's panel shows all 10 package documents in order, including ones not sent yet", async (t) => {
  await load(t, { docs: [
    { id: 5, title: "Job Description", category: "job_description", status: "requested", package_mode: "ACKNOWLEDGE", onboarding_new_hire_id: 7, file_url: "/f/5" },
  ] });
  await openEmployee();
  const panel = document.querySelector('[role="dialog"]').textContent;
  assert.match(panel, /Onboarding package \(1 of 10 sent\)/);
  assert.equal((panel.match(/Not sent yet/g) || []).length, 9);
  assert.match(docRow(/Job Description/).textContent, /Awaiting acknowledgement/);
  assert.ok([...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent.includes("Send 10 Onboarding Docs")),
    "the employee's panel offers the package");
});

test("when nothing can be sent the panel says why, and offers to re-send the portal link", async (t) => {
  const pkg = { new_hire_id: 7, candidate_name: "Ann Lee", email: "ann@x.com", inputs: {}, input_fields: [], ready_to_send: [], documents: [
    PKG_DOC("offer_letter", "Offer Letter", "SIGN", { state: "completed" }),
    PKG_DOC("job_description", "Job Description", "ACKNOWLEDGE", { state: "awaiting_acknowledgement" }),
    PKG_DOC("nda", "Non-Disclosure Agreement", "SIGN", { missing_fields: [{ key: "worker.postal_address", meaning: "Postal address",
      source: "Zoiko HR", editable: true, candidate_provides: true }] }),
  ] };
  await load(t, { pkg });
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
  const text = document.querySelector("[role=dialog]").textContent;
  assert.match(text, /Nothing new to send for Ann Lee right now/);
  assert.match(text, /2 of 3 documents are already sent/);
  assert.match(text, /Non-Disclosure Agreement is waiting for Ann Lee to enter their postal address/);
  assert.ok(screen.getByRole("button", { name: /Re-send the portal link to Ann Lee/ }));
});

test("the All submissions view lists every submission with the hire's name, Needs review first", async (t) => {
  await load(t, { submissions: [
    { id: 1, title: "ID proof", status: "approved", onboarding_new_hire_id: 7, hire_name: "Ann Lee", kind: "upload" },
    { id: 2, title: "Bank details", status: "pending", onboarding_new_hire_id: 7, hire_name: "Ann Lee", kind: "form" },
  ] });
  fireEvent.click(screen.getByRole("tab", { name: "All submissions" }));
  await settle();
  const rows = [...document.querySelectorAll('[data-testid="submission-row"]')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Ann Lee.*Bank details.*Needs review/);
  assert.equal(document.querySelector('[data-testid="employee-row"]'), null);
});

// ── QA R1-5 / R1-11 / R1-12 / R1-13 / R1-14 / R1-23 ──────────────────────────────────────────────────────────────────
const openPackage = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Send 10 Onboarding Docs" }));
  await settle();
};
const toastText = () => [...document.querySelectorAll('[data-testid="toast"]')].map((n) => n.textContent).join(" | ");

test("R1-11: a hire with only a document waiting for their details can be sent; the send is confirmed in a toast", async (t) => {
  const calls = await load(t, { sendResult: { success: false, message: "Nothing sent yet: 1 document(s) are not ready.", issued: [],
    held: [{ category: "nda", title: "Non-Disclosure Agreement" }], email_sent: false } });
  await openPackage();
  fireEvent.click(document.getElementById("pkg-pick-daily_kpi"));         // leave only the NDA ticked
  const btn = screen.getByRole("button", { name: /Send 1 selected document/ });
  assert.equal(btn.disabled, false);
  fireEvent.click(btn);
  await settle();
  assert.deepEqual(calls.sendCategories, ["nda"]);
  assert.match(toastText(), /Nothing sent yet/);
});

test("R1-11: a failed send shows the error in a toast", async (t) => {
  await load(t, { sendError: new Error("Onboarding documents can only be sent while onboarding is active.") });
  await openPackage();
  fireEvent.click(screen.getByRole("button", { name: /Send 2 selected documents/ }));
  await settle();
  assert.match(toastText(), /can only be sent while onboarding is active/);
});

test("R1-12: Save choices confirms with 'Choices saved'", async (t) => {
  const pkg = { ...PACKAGE(7), input_fields: [{ key: "document.issue_date" }] };
  const calls = await load(t, { pkg });
  await openPackage();
  fireEvent.change(document.getElementById("pkg-issue"), { target: { value: "2026-12-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  await settle();
  assert.deepEqual(calls.inputs, { "document.issue_date": "2026-12-01" });
  assert.match(toastText(), /Choices saved/);
});

test("R1-12: a failed Save choices shows the error", async (t) => {
  const pkg = { ...PACKAGE(7), input_fields: [{ key: "document.issue_date" }] };
  await load(t, { pkg, saveError: new Error("Choose a role profile from the list.") });
  await openPackage();
  fireEvent.change(document.getElementById("pkg-issue"), { target: { value: "2026-12-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
  await settle();
  assert.match(toastText(), /Choose a role profile from the list/);
  assert.doesNotMatch(toastText(), /Choices saved/);
});

test("R1-5: the Role profile choice lists every configured role profile, 'Match the position' first and chosen by default", async (t) => {
  const pkg = { ...PACKAGE(7), input_fields: [{ key: "role_profile_slug" }], role: { slug: "python-developer", title: "Python Developer", source: "position" },
    role_profiles: [{ slug: "python-developer", title: "Python Developer" }, { slug: "account-manager", title: "Account Manager" }] };
  await load(t, { pkg, profiles: { engagement_profiles: [], role_profiles: [{ slug: "qa-engineer", title: "QA Engineer" }, { slug: "account-manager", title: "Account Manager" }] } });
  await openPackage();
  const select = document.getElementById("pkg-role");
  const options = [...select.options].map((o) => [o.value, o.textContent]);
  assert.deepEqual(options, [["", "Match the position: Python Developer"], ["account-manager", "Account Manager"],
    ["python-developer", "Python Developer"], ["qa-engineer", "QA Engineer"]]);
  assert.equal(select.value, "", "Match the position stays the default");
});

test("R1-5: with no role profiles the choice says where to add them", async (t) => {
  await load(t);
  await openPackage();
  assert.equal(document.getElementById("pkg-role").options.length, 1);
  assert.match(document.querySelector("[role=dialog]").textContent, /No role profiles yet\. Add role profiles in Settings/);
});

test("R1-13/R1-14: a Files Sent card counts the documents sent to new hires, and every card fills its cell", async (t) => {
  await load(t, { docs: [
    { id: 1, title: "Offer Letter", category: "offer_letter", kind: "package", board_state: "awaiting_signature", status: "requested", onboarding_new_hire_id: 7 },
    { id: 2, title: "NDA", category: "nda", kind: "package", board_state: "not_sent", status: "requested", onboarding_new_hire_id: 7 },
    { id: 3, title: "DWR", category: "daily_work_report", kind: "package", board_state: "available", status: "available", onboarding_new_hire_id: 7 },
    { id: 4, title: "ID proof", category: "id_proof", kind: "upload", board_state: "needs_review", status: "pending", onboarding_new_hire_id: 7, file_url: "/f/4" },
  ] });
  const sent = document.querySelector('[data-testid="count-sent"]');
  assert.match(sent.textContent, /Files Sent\s*2/);
  for (const id of ["pending", "requested", "sent", "approved", "rejected", "total"]) {
    const cell = document.querySelector(`[data-testid="count-${id}"]`);
    assert.match(cell.className, /\bh-full\b/, `${id} wrapper fills the grid row`);
    assert.match(cell.firstElementChild.className, /\bh-full\b/, `${id} card fills its wrapper`);
  }
});

test("R1-23: the Upload Document file picker shows a Browse button and the chosen file's name", async (t) => {
  await load(t);
  await open();
  const box = document.getElementById("od-file").closest("[data-file-input]");
  assert.match(box.textContent, /Browse/);
  assert.match(box.textContent, /No file chosen/);
  choose(new File(["%PDF"], "offer.pdf", { type: "application/pdf" }));
  await settle();
  assert.match(box.textContent, /offer\.pdf/);
  fireEvent.click(screen.getByRole("button", { name: "Remove offer.pdf" }));
  await settle();
  assert.match(box.textContent, /No file chosen/);
});
