/**
 * Company Documents P1 (every category): New folder dialog with name rules and server refusals, folder cards with counts
 * and a "⋯" menu (rename, delete only when empty), status chips, clash notes, the row "⋯" menu, confirmed Publish,
 * and result messages that name the file and can be dismissed.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const ACCESS = (v = "admin_only", extra = {}) => ({ visibility: v, label: v === "admin_only" ? "Admin only" : v === "all_employees" ? "All employees" : "Restricted",
  permission: "view", require_ack: false, inherited_from: "category", audience_count: 7, ...extra });
const base = { version: 1, version_id: 1, status: "approved", uploaded_by: { name: "Hr User" }, uploaded_at: "2026-11-01T00:00:00Z", expiry_date: null, expiry_state: null, ack: null };
const FILES = [
  { ...base, id: 1, title: "Joining kit", publish_state: "published", access: ACCESS("all_employees") },
  { ...base, id: 2, title: "Draft letter", publish_state: "draft", access: ACCESS("all_employees") },
  { ...base, id: 3, title: "Secret plan", publish_state: "published", access: ACCESS("admin_only") },
  { ...base, id: 4, title: "Bank form", publish_state: "draft", status: "pending_approval", access: ACCESS("all_employees") },
  { ...base, id: 5, title: "Old notice", publish_state: "published", expiry_date: "2026-01-01", expiry_state: "expired", access: ACCESS("all_employees") },
  { ...base, id: 6, title: "Next year", publish_state: "scheduled", publish_at: "2030-01-01T09:00:00Z", access: ACCESS("all_employees") },
];
const FOLDERS = [{ id: 7, name: "Forms", file_count: 2, folder_count: 1 }, { id: 8, name: "Empty one", file_count: 0, folder_count: 0 }];

const SHARE = (extra = {}) => ({ id: 31, target_type: "document", target_id: 2, target_name: "Draft letter", mode: "link", message: null,
  grant_portal_access: false, status: "sent", created_at: "2026-11-23T10:00:00Z", created_by: { id: 1, name: "Hr User" },
  files: [{ id: 2, title: "Draft letter" }], counts: { sent: 1, failed: 0, pending: 0, skipped: 0 },
  recipients: [{ id: 1, kind: "employee", employee_id: 11, name: "Asha Rao", email: "asha@x.test", status: "sent", error: null }], ...extra });
const impl = {};
const hr = { departments: async () => ({ data: [] }), employees: async () => ({ items: [] }) };
const mocked = new WeakSet();
function mockServices(t, over = {}) {
  hr.departments = async () => ({ data: [] });
  hr.employees = async () => ({ items: [] });
  const calls = { create: [], rename: [], del: [], publish: [], upload: [], share: [], retry: [] };
  Object.assign(impl, {
    listCompanyItems: async () => ({ category: { id: 3, name: "Onboarding", default_require_ack: false }, breadcrumb: [], folders: structuredClone(FOLDERS),
                                     files: { items: structuredClone(FILES), total: FILES.length, page: 1, per_page: 50 } }),
    listCompanyCategories: async () => [], createCompanyCategory: async () => ({}), updateCompanyCategory: async () => ({}),
    deleteCompanyCategory: async () => null, listCompanyFiles: async () => ({ items: [], total: 0, page: 1, per_page: 50 }),
    uploadCompanyDocument: async (v) => { calls.upload.push(v); return {}; }, uploadCompanyVersion: async () => ({}), listCompanyVersions: async () => [],
    publishCompanyDocument: async (id) => { calls.publish.push(id); return {}; }, unpublishCompanyDocument: async () => ({}),
    deleteCompanyDocument: async () => null,
    createCompanyFolder: async (v) => { calls.create.push(v); return {}; },
    renameCompanyFolder: async (v) => { calls.rename.push(v); return {}; },
    deleteCompanyFolder: async (id) => { calls.del.push(id); return {}; },
    getAccessRule: async () => ({ rule: null, effective: { ...ACCESS(), department_ids: [], roles: [], employee_ids: [] } }),
    putAccessRule: async () => ({}), previewAccessRule: async () => ({ audience_count: 0, sample: [] }),
    getAckTracking: async () => ({ items: [], total: 0, page: 1, per_page: 50 }), remindAcks: async () => ({}),
    getEmailStatus: async () => ({ configured: true, max_attachment_mb: 10, max_recipients: 200, max_external: 20, message: null }),
    shareByEmail: async (b) => { calls.share.push(b); return SHARE({ mode: b.mode }); },
    listShares: async () => ({ items: [], total: 0, page: 1, per_page: 10 }),
    retryShare: async (id) => { calls.retry.push(id); return SHARE({ status: "sent", counts: { sent: 2, failed: 0, pending: 0, skipped: 0 } }); },
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/documentsService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDepartments: async () => hr.departments(), getHrEmployees: async () => hr.employees(),
      getDocumentFile: async () => ({ blob: new Blob(["x"]), filename: "x.pdf" }),
    } });
  }
  return calls;
}

async function renderPage(path = "/c/3") {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/company-documents/CompanyCategoryPage.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/c/:categoryId", element: h(Page) })))));
  await settle();
}
const rowOf = (title) => screen.getByText(title).closest("tr");

test("New folder: name rules are checked before sending, and a server refusal keeps the dialog open", async (t) => {
  const calls = mockServices(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "New folder" }));
  const dialog = screen.getByRole("dialog", { name: "New folder in Onboarding" });
  const input = within(dialog).getByLabelText("Folder name");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
  assert.match(within(dialog).getByRole("alert").textContent, /Give the folder a name/);
  fireEvent.change(input, { target: { value: "a/b" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
  assert.match(within(dialog).getByRole("alert").textContent, /cannot contain/);
  assert.equal(calls.create.length, 0);

  impl.createCompanyFolder = async () => { throw new Error("A folder called “Forms” already exists here."); };
  fireEvent.change(input, { target: { value: "forms" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
  await settle();
  assert.match(within(screen.getByRole("dialog", { name: "New folder in Onboarding" })).getByRole("alert").textContent, /already exists here/);

  impl.createCompanyFolder = async (v) => { calls.create.push(v); return {}; };
  fireEvent.change(input, { target: { value: "  Signed   copies " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
  await settle();
  assert.deepEqual(calls.create, [{ name: "Signed copies", categoryId: 3, parentId: null }]);
  assert.equal(screen.queryByRole("dialog", { name: /New folder/ }), null);
  assert.match(screen.getByRole("status").textContent, /Folder “Signed copies” created in Onboarding/);
});

test("folder cards show counts; the ⋯ menu renames, and delete explains why a full folder cannot go", async (t) => {
  const calls = mockServices(t);
  await renderPage();
  const forms = screen.getByText("Forms").closest("li");
  assert.ok(within(forms).getByText("2 files · 1 folder"));
  assert.ok(within(screen.getByText("Empty one").closest("li")).getByText("Empty"));

  fireEvent.click(within(forms).getByRole("button", { name: "More actions for folder Forms" }));
  fireEvent.click(within(forms).getByRole("menuitem", { name: "Rename" }));
  const dialog = screen.getByRole("dialog", { name: "Rename folder Forms" });
  fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "Joining forms" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  await settle();
  assert.deepEqual(calls.rename, [{ folderId: 7, name: "Joining forms" }]);

  impl.deleteCompanyFolder = async () => { throw new Error("“Forms” still has 2 files and 1 folder. Move or remove them first."); };
  fireEvent.click(within(forms).getByRole("button", { name: "More actions for folder Forms" }));
  fireEvent.click(within(forms).getByRole("menuitem", { name: "Delete" }));
  const confirm = screen.getByRole("alertdialog", { name: "Delete folder Forms?" });
  assert.match(confirm.textContent, /still has 2 files and 1 folder/);
  fireEvent.click(within(confirm).getByRole("button", { name: "Delete folder" }));
  await settle();
  assert.match(within(screen.getByRole("alertdialog")).getByRole("alert").textContent, /Move or remove them first/);
});

test("status chips and clash notes say who really sees each file", async (t) => {
  mockServices(t);
  await renderPage();
  assert.ok(within(rowOf("Joining kit")).getByText("Published"));
  assert.ok(within(rowOf("Draft letter")).getByText("Unpublished"));
  assert.ok(within(rowOf("Draft letter")).getByText("No one yet (not published)"));
  assert.ok(within(rowOf("Secret plan")).getByText(/Published, but only admins can see it/));
  assert.ok(within(rowOf("Secret plan")).getByRole("button", { name: "Share Secret plan with employees" }));
  assert.ok(within(rowOf("Bank form")).getByRole("link", { name: /Waiting for approval/ }));
  assert.equal(within(rowOf("Bank form")).queryByRole("button", { name: /Publish/ }), null);
  assert.ok(within(rowOf("Old notice")).getByText("Expired"));
  assert.ok(within(rowOf("Next year")).getByText(/^Scheduled/));
});

test("row keeps Preview and Download as icons; the rest is in ⋯; Publish asks first and names the file", async (t) => {
  const calls = mockServices(t);
  await renderPage();
  const row = rowOf("Draft letter");
  assert.ok(within(row).getByRole("button", { name: "Preview Draft letter" }));
  assert.ok(within(row).getByRole("button", { name: "Download Draft letter" }));
  assert.equal(within(row).queryByRole("button", { name: "Remove Draft letter" }), null);
  fireEvent.click(within(row).getByRole("button", { name: "More actions for Draft letter" }));
  const menu = within(row).getByRole("menu");
  assert.deepEqual(within(menu).getAllByRole("menuitem").map((b) => b.textContent), ["Who can see", "Email", "New version", "Versions", "Remove"]);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(within(row).queryByRole("menu"), null);

  fireEvent.click(within(row).getByRole("button", { name: "Publish Draft letter now" }));
  const confirm = screen.getByRole("alertdialog", { name: "Publish Draft letter?" });
  assert.match(confirm.textContent, /All employees \(7 people\) will be able to see it/);
  fireEvent.click(within(confirm).getByRole("button", { name: "Publish now" }));
  await settle();
  assert.deepEqual(calls.publish, [2]);
  const status = screen.getByRole("status");
  assert.match(status.textContent, /“Draft letter” is published\. All employees can see it now\./);
  fireEvent.click(within(status).getByRole("button", { name: "Dismiss message" }));
  assert.equal(screen.queryByRole("status"), null);
});

// ── P2: drop zone and bulk upload ─────────────────────────────────────────────────────────────────────────────────────

const pdf = (name, size = 4) => new File(["%PDF".padEnd(size, "x")], name, { type: "application/pdf" });
const openUpload = () => { fireEvent.click(screen.getByRole("button", { name: "Upload to Onboarding" })); return screen.getByRole("dialog", { name: "Upload to Onboarding" }); };

test("dropped files get their own titles; unusable files must be removed; a batch is quiet by default", async (t) => {
  const calls = mockServices(t);
  await renderPage();
  const dialog = openUpload();
  fireEvent.drop(within(dialog).getByTestId("drop-zone"), { dataTransfer: { files: [pdf("Offer letter.pdf"), pdf("NDA.pdf"), new File(["MZ"], "setup.exe")] } });
  const list = within(dialog).getByRole("list", { name: "Files to upload" });
  assert.equal(within(list).getAllByRole("listitem").length, 3);
  assert.match(within(list).getByText(/setup\.exe/).closest("li").textContent, /not accepted/);
  assert.equal(within(dialog).getByRole("checkbox", { name: /Notify the people/ }).checked, false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload 2 files" }));
  assert.match(within(dialog).getByRole("alert").textContent, /Remove them to continue/);
  assert.equal(calls.upload.length, 0);

  fireEvent.click(within(dialog).getByRole("button", { name: "Remove setup.exe from the list" }));
  fireEvent.change(within(dialog).getByLabelText("Title for NDA.pdf"), { target: { value: "Non-disclosure agreement" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload 2 files" }));
  await settle();
  assert.deepEqual(calls.upload.map((u) => [u.title, u.file.name, u.notify, u.categoryId]),
    [["Offer letter", "Offer letter.pdf", false, 3], ["Non-disclosure agreement", "NDA.pdf", false, 3]]);
  assert.equal(screen.queryByRole("dialog", { name: "Upload to Onboarding" }), null);
  assert.match(screen.getByRole("status").textContent, /2 files uploaded to Onboarding/);
});

test("a failed file keeps the dialog open with its reason; Retry sends only the failed ones", async (t) => {
  const calls = mockServices(t);
  let failOnce = true;
  impl.uploadCompanyDocument = async (v) => {
    if (v.file.name === "b.pdf" && failOnce) { failOnce = false; throw new Error("This file looks damaged and could not be opened."); }
    calls.upload.push(v); return {};
  };
  await renderPage();
  const dialog = openUpload();
  fireEvent.change(within(dialog).getByLabelText("Files"), { target: { files: [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload 3 files" }));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: "Upload to Onboarding" }));
  assert.match(within(dialog).getByText(/b\.pdf/).closest("li").textContent, /looks damaged/);
  assert.match(within(dialog).getByRole("status").textContent, /2 of 3 uploaded · 1 failed/);
  assert.equal(within(dialog).getByLabelText("Upload progress").value, 2);
  fireEvent.click(within(dialog).getByRole("button", { name: "Retry 1 failed" }));
  await settle();
  assert.deepEqual(calls.upload.map((u) => u.file.name), ["a.pdf", "c.pdf", "b.pdf"]);
  assert.equal(screen.queryByRole("dialog", { name: "Upload to Onboarding" }), null);
  assert.match(screen.getByRole("status").textContent, /3 files uploaded to Onboarding/);
});

test("closing with failures says which files were not uploaded", async (t) => {
  mockServices(t, { uploadCompanyDocument: async (v) => { if (v.file.name === "b.pdf") throw new Error("Too big"); return {}; } });
  await renderPage();
  const dialog = openUpload();
  fireEvent.change(within(dialog).getByLabelText("Files"), { target: { files: [pdf("a.pdf"), pdf("b.pdf")] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload 2 files" }));
  await settle();
  fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /1 of 2 files uploaded to Onboarding\. Not uploaded: b/);
});

test("at most 20 files at a time; repeats are ignored", async (t) => {
  mockServices(t);
  await renderPage();
  const dialog = openUpload();
  const files = Array.from({ length: 22 }, (_, i) => pdf(`f${i}.pdf`));
  fireEvent.change(within(dialog).getByLabelText("Files"), { target: { files } });
  assert.equal(within(within(dialog).getByRole("list", { name: "Files to upload" })).getAllByRole("listitem").length, 20);
  assert.match(dialog.textContent, /Only 20 files can be uploaded at a time; 2 were left out/);
  fireEvent.change(within(dialog).getByLabelText("Files"), { target: { files: [files[0]] } });
  assert.match(dialog.textContent, /1 file was already in the list/);
});

// ── P3: category settings and overview menus ──────────────────────────────────────────────────────────────────────────

const CAT = (id, name, extra = {}) => ({ id, key: `k${id}`, name, file_count: 0, last_updated: null, requires_approval: false, default_require_ack: false,
  ack_reminder_after_days: null, reack_interval_months: null, auto_unpublish_on_expiry: false, locked_by_org_admin: false, is_system: true, is_hidden: false,
  access: ACCESS("all_employees"), ...extra });

async function renderCategories(t, cats, over = {}) {
  const calls = mockServices(t, { listCompanyCategories: async (p) => { calls.list.push(p); return structuredClone(cats); }, ...over });
  calls.list = []; calls.update = []; calls.deleteCat = [];
  impl.updateCompanyCategory = over.updateCompanyCategory || (async (id, data) => { calls.update.push([id, data]); return {}; });
  impl.deleteCompanyCategory = over.deleteCompanyCategory || (async (id) => { calls.deleteCat.push(id); return null; });
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/company-documents/CompanyCategoriesPage.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: ["/c"] }, h(Routes, null, h(Route, { path: "/c", element: h(Page) })))));
  await settle();
  return calls;
}
const cardOf = (name) => screen.getByRole("link", { name }).closest("li");

test("built-in categories offer Settings and Hide but never Delete; custom ones can be deleted", async (t) => {
  const calls = await renderCategories(t, [CAT(1, "Payslip Templates"), CAT(9, "IT policies", { is_system: false })]);
  assert.equal(calls.list[0].include_hidden, true);
  fireEvent.click(within(cardOf("Payslip Templates")).getByRole("button", { name: "More actions for Payslip Templates" }));
  assert.deepEqual(within(cardOf("Payslip Templates")).getAllByRole("menuitem").map((b) => b.textContent), ["Open", "Settings", "Who can see", "Email", "Hide"]);
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(within(cardOf("IT policies")).getByRole("button", { name: "More actions for IT policies" }));
  fireEvent.click(within(cardOf("IT policies")).getByRole("menuitem", { name: "Delete" }));
  fireEvent.click(within(screen.getByRole("alertdialog", { name: "Delete IT policies?" })).getByRole("button", { name: "Delete category" }));
  await settle();
  assert.deepEqual(calls.deleteCat, [9]);
  assert.match(screen.getByRole("status").textContent, /Category “IT policies” was deleted/);
});

test("Settings sends only what changed and shows a duplicate-name refusal under the name", async (t) => {
  let refuse = true;
  const calls = await renderCategories(t, [CAT(1, "Payslip Templates", { default_require_ack: false })], {
    updateCompanyCategory: async (id, data) => {
      if (refuse) { refuse = false; throw new Error("A category called “Company Policies” already exists."); }
      calls.update.push([id, data]); return {};
    },
  });
  fireEvent.click(within(cardOf("Payslip Templates")).getByRole("button", { name: "More actions for Payslip Templates" }));
  fireEvent.click(within(cardOf("Payslip Templates")).getByRole("menuitem", { name: "Settings" }));
  const dialog = screen.getByRole("dialog", { name: "Settings for Payslip Templates" });
  assert.match(dialog.textContent, /can be renamed and hidden, but not deleted/);
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Company Policies" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save settings" }));
  await settle();
  assert.match(within(dialog).getByRole("alert").textContent, /already exists/);
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  Salary   slips " } });
  fireEvent.change(within(dialog).getByLabelText(/Remind people who have not confirmed after/), { target: { value: "0" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save settings" }));
  assert.match(within(dialog).getByRole("alert").textContent, /at least 1/);
  fireEvent.change(within(dialog).getByLabelText(/Remind people who have not confirmed after/), { target: { value: "5" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /confirm “I have read this” by default/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save settings" }));
  await settle();
  assert.deepEqual(calls.update, [[1, { name: "Salary slips", default_require_ack: true, ack_reminder_after_days: 5 }]]);
  assert.match(screen.getByRole("status").textContent, /Settings for “Salary slips” saved/);
});

test("hiding asks first; hidden categories sit in their own section and can be shown again", async (t) => {
  const calls = await renderCategories(t, [CAT(1, "Training Materials", { file_count: 3 }), CAT(2, "Holiday Calendar", { is_hidden: true })]);
  assert.equal(screen.queryByRole("link", { name: "Holiday Calendar" }), null);
  fireEvent.click(screen.getByRole("button", { name: "Hidden categories (1)" }));
  const hidden = within(screen.getByRole("list", { name: "Hidden categories" }));
  assert.ok(hidden.getByText("Hidden from employees"));
  fireEvent.click(hidden.getByRole("button", { name: "Show Holiday Calendar to employees" }));
  await settle();
  assert.deepEqual(calls.update.at(-1), [2, { is_hidden: false }]);

  fireEvent.click(within(cardOf("Training Materials")).getByRole("button", { name: "More actions for Training Materials" }));
  fireEvent.click(within(cardOf("Training Materials")).getByRole("menuitem", { name: "Hide" }));
  const confirm = screen.getByRole("alertdialog", { name: "Hide Training Materials?" });
  assert.match(confirm.textContent, /stop seeing its 3 files.*Nothing is deleted/);
  fireEvent.click(within(confirm).getByRole("button", { name: "Hide category" }));
  await settle();
  assert.deepEqual(calls.update.at(-1), [1, { is_hidden: true }]);
});

// ── P5: the Share dialog's Email tab ──────────────────────────────────────────────────────────────────────────────────

const PEOPLE = { items: [{ id: 11, first_name: "Asha", last_name: "Rao", email: "asha@x.test" }, { id: 12, first_name: "Ben", last_name: "Lee", email: "ben@x.test" }] };
async function openEmail(t, over = {}) {
  const calls = mockServices(t, over);
  hr.employees = async () => PEOPLE;
  hr.departments = async () => ({ data: [{ id: 4, name: "Engineering" }] });
  await renderPage();
  const row = rowOf("Draft letter");
  fireEvent.click(within(row).getByRole("button", { name: "More actions for Draft letter" }));
  fireEvent.click(within(row).getByRole("menuitem", { name: "Email" }));
  await settle();
  return { calls, dialog: screen.getByRole("dialog", { name: "Email “Draft letter”" }) };
}

test("Email in the ⋯ menu opens the Share dialog on its Email tab; the portal tab is one click away", async (t) => {
  const { dialog } = await openEmail(t);
  assert.equal(within(dialog).getByRole("tab", { name: "Email" }).getAttribute("aria-selected"), "true");
  fireEvent.click(within(dialog).getByRole("tab", { name: "Employee Portal" }));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: /Who can see “Draft letter”/ }));
});

test("a portal link goes to the chosen people; someone without access is named and can be granted access", async (t) => {
  let refuse = true;
  const { calls, dialog } = await openEmail(t, {
    shareByEmail: async (b) => {
      if (refuse) { refuse = false; const e = new Error("“Ben Lee” can't open this file in the portal."); e.code = "DOC_SHARE_NO_ACCESS"; throw e; }
      calls.share.push(b); return SHARE({ counts: { sent: 2, failed: 0, pending: 0, skipped: 0 } });
    },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
  assert.match(within(dialog).getByRole("alert").textContent, /at least one person/);
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Asha Rao/ }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Ben Lee/ }));
  fireEvent.change(within(dialog).getByLabelText(/Message/), { target: { value: "Please read before Friday" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
  await settle();
  assert.match(within(dialog).getByRole("alert").textContent, /Ben Lee.*can't open/);
  fireEvent.click(within(dialog).getByRole("button", { name: /Tick “Also give them access”/ }));
  assert.equal(within(dialog).getByRole("checkbox", { name: /Also give them access/ }).checked, true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
  await settle();
  assert.deepEqual(calls.share, [{ target_type: "document", target_id: 2, mode: "link", employee_ids: [11, 12], department_ids: [], emails: [],
    message: "Please read before Friday", grant_portal_access: true }]);
  assert.match(within(dialog).getByRole("status").textContent, /Sent to 2 people/);
  assert.match(screen.getAllByRole("status").map((n) => n.textContent).join(" "), /“Draft letter” emailed to 2 people/);
});

test("outside addresses appear only for attachments and are checked before sending", async (t) => {
  const { calls, dialog } = await openEmail(t);
  assert.equal(within(dialog).queryByLabelText(/People outside the company/), null);
  fireEvent.click(within(dialog).getByRole("radio", { name: /Attach the files/ }));
  const outside = within(dialog).getByLabelText(/People outside the company/);
  fireEvent.change(outside, { target: { value: "auditor@example.org, nope" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
  assert.match(within(dialog).getByRole("alert").textContent, /Check this address: nope/);
  fireEvent.change(outside, { target: { value: "Auditor@Example.org; auditor@example.org" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Engineering" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
  await settle();
  assert.deepEqual(calls.share[0], { target_type: "document", target_id: 2, mode: "attachment", employee_ids: [], department_ids: [4],
    emails: ["auditor@example.org"], message: null, grant_portal_access: false });
});

test("without email set up the tab says so and cannot send", async (t) => {
  const { dialog } = await openEmail(t, { getEmailStatus: async () => ({ configured: false, message: "Email sending isn't set up yet. Ask your platform administrator to configure it." }) });
  assert.match(within(dialog).getByRole("alert").textContent, /isn't set up yet/);
  assert.equal(within(dialog).getByRole("button", { name: "Send email" }).disabled, true);
});

test("Sent before lists each recipient's result and retries the failed ones", async (t) => {
  const failed = SHARE({ status: "partial", counts: { sent: 1, failed: 1, pending: 0, skipped: 0 }, recipients: [
    { id: 1, kind: "employee", name: "Asha Rao", email: "asha@x.test", status: "sent", error: null },
    { id: 2, kind: "external", name: "auditor@example.org", email: "auditor@example.org", status: "failed", error: "550 mailbox unavailable" }] });
  const { calls, dialog } = await openEmail(t, { listShares: async () => ({ items: [failed], total: 1, page: 1, per_page: 10 }) });
  const history = within(within(dialog).getByRole("region", { name: "Sent before" }));
  assert.ok(history.getByText("Partly sent"));
  fireEvent.click(history.getByRole("button", { expanded: false }));
  assert.match(history.getByText("auditor@example.org").closest("li").textContent, /outside the company.*Failed.*550 mailbox unavailable/);
  fireEvent.click(history.getByRole("button", { name: "Retry 1 failed" }));
  await settle();
  assert.deepEqual(calls.retry, [31]);
  assert.match(within(dialog).getByRole("status").textContent, /Sent to 2 people/);
});
