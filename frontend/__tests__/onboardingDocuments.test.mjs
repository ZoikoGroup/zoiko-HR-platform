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
    sendOnboardingPackage: async (id) => { CURRENT.calls.sendPackage.push(id); return CURRENT.over.sendResult ?? { success: true, message: "1 document(s) sent to Ann Lee.", issued: [{ category: "daily_kpi", title: "Daily Key Performance Indicators", mode: "ACKNOWLEDGE" }], held: [], email_sent: true }; },
    getHirePackage: async (id) => CURRENT.over.pkg ?? PACKAGE(id),
    saveHirePackageInputs: async (id, values) => { CURRENT.calls.inputs = values; return PACKAGE(id); },
    getHirePackagePreview: async () => ({ blob: new Blob(["%PDF"]), filename: "preview.pdf" }),
    sendOnboardingPortalInvite: async () => ({ email_sent: true }),
    getOfferPackageTemplateSet: async () => ({ blob: new Blob(["%PDF"]), filename: "set.pdf" }),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
    Link: ({ children }) => React.createElement("a", null, children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
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
  fireEvent.click(screen.getByRole("button", { name: /Send 1 ready document/ }));
  await settle();
  assert.deepEqual(calls.sendPackage, [7]);
  assert.match(document.body.textContent, /Sent: Daily Key Performance Indicators/);
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
