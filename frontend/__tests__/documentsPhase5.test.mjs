/**
 * Documents Phase 5 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): admin Company Documents — category cards that are never
 * blank, the expiry segment, uploading / versioning, the Share dialog with its live audience count, view-only vs download,
 * and read-confirmation tracking.
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
  permission: "view", require_ack: false, inherited_from: "category", audience_count: 3, ...extra });
const CARDS = [
  { id: 1, key: "company_policies", name: "Company Policies", file_count: 2, last_updated: "2026-11-10T00:00:00Z", requires_approval: false,
    default_require_ack: true, access: ACCESS("all_employees", { require_ack: true }) },
  { id: 2, key: "forms_templates", name: "Forms & Templates", file_count: 0, last_updated: null, requires_approval: true, access: ACCESS() },
];
const FILE = { id: 10, title: "Code of conduct", version: 2, version_id: 21, status: "approved", publish_state: "published",
  uploaded_by: { name: "Hr User" }, uploaded_at: "2026-11-01T00:00:00Z", expiry_date: null, expiry_state: null,
  access: ACCESS("departments", { audience_count: 12 }), ack: { round: 1, acknowledged: 3, pending: 9 } };

const impl = {};
const mocked = new WeakSet();
function mockServices(t, over = {}) {
  const calls = { put: [], preview: [], upload: [], version: [], unpublish: [], remind: [], cards: [] };
  Object.assign(impl, {
    listCompanyCategories: async (p) => { calls.cards.push(p); return structuredClone(CARDS); },
    createCompanyCategory: async () => ({}),
    listCompanyFiles: async () => ({ items: [{ ...FILE, id: 11, title: "Old form", category_id: 2, expiry_date: "2026-01-01", expiry_state: "expired" }], total: 1, page: 1, per_page: 50 }),
    listCompanyItems: async () => ({ category: { id: 1, name: "Company Policies", default_require_ack: true }, breadcrumb: [], folders: [{ id: 5, name: "2026" }],
                                     files: { items: [FILE], total: 1, page: 1, per_page: 50 } }),
    uploadCompanyDocument: async (v) => { calls.upload.push(v); return {}; },
    uploadCompanyVersion: async (v) => { calls.version.push(v); return {}; },
    listCompanyVersions: async () => [],
    publishCompanyDocument: async () => ({}), unpublishCompanyDocument: async (id) => { calls.unpublish.push(id); return {}; },
    deleteCompanyDocument: async () => null, createCompanyFolder: async () => ({}),
    getAccessRule: async () => ({ rule: null, effective: { ...ACCESS("admin_only"), department_ids: [], roles: [], employee_ids: [] } }),
    putAccessRule: async (t2, id, rule) => { calls.put.push([t2, id, rule]); return {}; },
    previewAccessRule: async (rule) => { calls.preview.push(rule); return { audience_count: rule.visibility === "all_employees" ? 42 : 2, sample: [] }; },
    getAckTracking: async () => ({ round: 1, due_at: null, acknowledged: 1, pending: 1, total: 2, page: 1, per_page: 50,
      items: [{ employee_id: 1, name: "Asha Rao", status: "acknowledged", acknowledged_at: "2026-11-05T00:00:00Z" }, { employee_id: 2, name: "Ben Lee", status: "pending" }] }),
    remindAcks: async (id) => { calls.remind.push(id); return { sent: 1 }; },
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/documentsService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDepartments: async () => ({ data: [{ id: 1, name: "Engineering" }, { id: 2, name: "Sales" }] }),
      getHrEmployees: async () => ({ items: [] }), getDocumentFile: async () => ({ blob: new Blob(["x"]), filename: "x.pdf" }),
    } });
  }
  return calls;
}

async function renderAt(file, path, routePath) {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/company-documents/${file}?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: routePath, element: h(Page) })))));
  await settle();
}

test("category cards show counts, access and flags; the expiry segment lists files across categories", async (t) => {
  mockServices(t);
  await renderAt("CompanyCategoriesPage.jsx", "/c", "/c");
  const policies = screen.getByRole("link", { name: "Company Policies" }).closest("li");
  assert.ok(within(policies).getByText(/2 files/));
  assert.ok(within(policies).getByText("All employees"));
  assert.ok(within(policies).getByText("Read confirmation"));
  const forms = screen.getByRole("link", { name: "Forms & Templates" }).closest("li");
  assert.ok(within(forms).getByText("Admin only"));
  assert.ok(within(forms).getByText("Needs approval"));
  assert.equal(screen.queryByText(/Search by Employee/), null);
  fireEvent.click(screen.getByRole("tab", { name: "Expired" }));
  await settle();
  assert.ok(screen.getByText("Old form"));
});

test("the Share dialog previews the audience before saving and saves the rule", async (t) => {
  const calls = mockServices(t);
  await renderAt("CompanyCategoriesPage.jsx", "/c", "/c");
  fireEvent.click(screen.getByRole("button", { name: "Who can see Forms & Templates" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: /Who can see/ });
  fireEvent.click(within(dialog).getByRole("radio", { name: "All employees" }));
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  await settle();
  assert.match(within(dialog).getByRole("status").textContent, /Visible to 42 people/);
  fireEvent.click(within(dialog).getByRole("radio", { name: "View and download" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /confirm “I have read this”/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.equal(calls.put.length, 1);
  const [type, id, rule] = calls.put[0];
  assert.deepEqual([type, id, rule.visibility, rule.permission, rule.require_ack], ["category", 2, "all_employees", "download", true]);
});

test("choosing departments requires at least one", async (t) => {
  const calls = mockServices(t);
  await renderAt("CompanyCategoriesPage.jsx", "/c", "/c");
  fireEvent.click(screen.getByRole("button", { name: "Who can see Forms & Templates" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: /Who can see/ });
  fireEvent.click(within(dialog).getByRole("radio", { name: "Selected departments" }));
  await settle();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  assert.match(within(dialog).getByRole("alert").textContent, /at least one department/);
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Engineering" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.put[0][2].department_ids, [1]);
});

test("inside a category: files with version, access and read progress; new version asks material vs minor", async (t) => {
  const calls = mockServices(t);
  await renderAt("CompanyCategoryPage.jsx", "/c/1", "/c/:categoryId");
  const row = screen.getByText("Code of conduct").closest("tr");
  assert.ok(within(row).getByText("v2"));
  assert.ok(within(row).getByText(/Restricted \(12\)/));
  assert.ok(within(row).getByRole("button", { name: "3/12" }));
  assert.ok(screen.getByRole("button", { name: "Upload to Company Policies" }) && screen.getByRole("button", { name: /New folder/i }) && screen.getByRole("button", { name: /Refresh/ }));
  // Upload and Share live in the content area for the chosen category, not in the page header.
  assert.ok(screen.getByRole("button", { name: "Share Company Policies" }));
  assert.equal(screen.getByRole("button", { name: "Upload to Company Policies" }).closest("header"), null);
  fireEvent.click(within(row).getByRole("button", { name: "More actions for Code of conduct" }));
  fireEvent.click(within(row).getByRole("menuitem", { name: "New version" }));
  const dialog = screen.getByRole("dialog", { name: /New version of Code of conduct/ });
  fireEvent.change(within(dialog).getByLabelText("File"), { target: { files: [new File(["%PDF"], "v3.pdf")] } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Material change/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  await settle();
  assert.equal(calls.version.length, 1);
  assert.deepEqual({ ...calls.version[0], file: calls.version[0].file.name },
    { documentId: 10, file: "v3.pdf", changeNotes: undefined, expiryDate: undefined, materialChange: false });
  fireEvent.click(within(row).getByRole("button", { name: "Unpublish Code of conduct" }));
  assert.deepEqual(calls.unpublish, []);                       // asks first
  fireEvent.click(within(screen.getByRole("alertdialog", { name: "Unpublish Code of conduct?" })).getByRole("button", { name: "Unpublish" }));
  await settle();
  assert.deepEqual(calls.unpublish, [10]);
});

test("read-confirmation tracking lists who confirmed and reminds the rest", async (t) => {
  const calls = mockServices(t);
  await renderAt("CompanyCategoryPage.jsx", "/c/1", "/c/:categoryId");
  fireEvent.click(screen.getByRole("button", { name: "3/12" }));
  await settle();
  const drawer = screen.getByRole("dialog", { name: /Read confirmations for Code of conduct/ });
  assert.match(within(drawer).getByText("Asha Rao").closest("li").textContent, /Confirmed/);
  assert.match(within(drawer).getByText("Ben Lee").closest("li").textContent, /Waiting/);
  fireEvent.click(within(drawer).getByRole("button", { name: /Remind waiting/ }));
  await settle();
  assert.deepEqual(calls.remind, [10]);
});

test("a new company upload sends the category's read-confirmation default and a UTC publish time", async (t) => {
  const calls = mockServices(t);
  await renderAt("CompanyCategoryPage.jsx", "/c/1", "/c/:categoryId");
  fireEvent.click(screen.getByRole("button", { name: "Upload to Company Policies" }));
  const dialog = screen.getByRole("dialog", { name: /Upload to Company Policies/ });
  fireEvent.change(within(dialog).getByLabelText("Files"), { target: { files: [new File(["%PDF"], "policy.pdf")] } });
  fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Travel policy" } });
  fireEvent.change(within(dialog).getByLabelText(/Publish at/), { target: { value: "2030-01-01T09:00" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  await settle();
  const sent = calls.upload[0];
  assert.equal(sent.requireAck, true);
  assert.equal(sent.title, "Travel policy");
  assert.equal(sent.publishAt, new Date("2030-01-01T09:00").toISOString());
});
