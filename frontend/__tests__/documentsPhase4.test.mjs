/**
 * Documents Phase 4 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2, A5): Admin → Employee Documents is a READ-ONLY drill-down
 * (list with completion → one employee's containers → files), with reminders and ZIP export but no upload and no
 * decisions; and the category settings page.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const EMPLOYEE = { id: 7, name: "Asha Rao", employee_id_str: "EMP-007", designation: "Engineer", joined_on: "2026-01-05", is_active: true,
  completion: { approved: 3, required: 4, pending: 1, rejected: 0, expired: 0, missing: 0, percent: 75 }, status: "needs_review" };
const CATS = [
  { id: 1, key: "identity_proof", name: "Identity Proof", is_required: true, can_upload: true, uploader: "employee", file_count: 1, status: "pending_approval",
    files: [{ id: 50, title: "Passport", version: 2, status: "pending_approval", uploaded_at: "2026-11-01T00:00:00Z", expiry_date: "2030-01-01" }] },
  { id: 2, key: "education", name: "Education", is_required: true, can_upload: true, uploader: "employee", file_count: 0, status: "not_uploaded", files: [] },
  { id: 3, key: "payslips", name: "Payslips", is_required: false, can_upload: false, uploader: "system", file_count: 0, status: "not_uploaded", files: [] },
];

const impl = {};
const mocked = new WeakSet();
function mockService(t, over = {}) {
  const calls = { list: [], remind: [], update: [], bulk: [] };
  Object.assign(impl, {
    listDocumentEmployees: async (p) => { calls.list.push(p); return { items: [EMPLOYEE], total: 1, page: 1, per_page: 25 }; },
    getDocumentEmployeesSummary: async () => ({ complete: 4, pending: 2, needs_review: 1, expired: 0 }),
    getDocumentEmployee: async () => ({ employee: EMPLOYEE, categories: structuredClone(CATS), last_reminder_at: null }),
    getEmployeeCategoryFiles: async (_e, c) => ({ employee: EMPLOYEE, category: { ...CATS[Number(c) - 1], files: undefined }, files: CATS[Number(c) - 1].files }),
    sendEmployeeReminder: async (v) => { calls.remind.push(v); return { sent: 1, categories: ["education"] }; },
    sendBulkReminders: async (v) => { calls.bulk.push(v); return { sent: 1, skipped: 0 }; },
    downloadEmployeeZip: async () => ({ blob: new Blob(["zip"]), filename: "x.zip" }),
    listEmployeeCategories: async () => ({ items: [{ id: 1, key: "identity_proof", name: "Identity Proof", is_required: true, requires_expiry: true,
      uploader: "employee", id_number_field: null, human_approval_required: true, is_system: true, is_active: true }],
      id_number_checks: [{ key: "in.pan", label: "PAN (India)" }, { key: "passport", label: "Passport number (any country)" }] }),
    createEmployeeCategory: async () => ({}), updateEmployeeCategory: async (id, data) => { calls.update.push([id, data]); return {}; },
    deleteEmployeeCategory: async () => null,
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/documentsService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
  }
  return calls;
}

async function renderAt(file, path, routePath) {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/${file}?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: routePath, element: h(Page) })))));
  await settle();
}

test("the list shows completion and status, filters by status card, and has no upload", async (t) => {
  const calls = mockService(t);
  await renderAt("employee-documents/EmployeeDocumentsListPage.jsx", "/zoiko-hr/documents/employees", "/zoiko-hr/documents/employees");
  const row = screen.getByRole("link", { name: "Asha Rao" }).closest("tr");
  assert.ok(within(row).getByText("3/4 approved"));
  assert.ok(within(row).getByText("Needs review"));
  assert.equal(screen.queryByRole("button", { name: /Upload/ }), null);
  fireEvent.click(screen.getByRole("button", { name: /Complete/ }));
  await settle();
  assert.equal(calls.list.at(-1).status, "complete");
});

test("bulk reminders go to the selected employees", async (t) => {
  const calls = mockService(t);
  await renderAt("employee-documents/EmployeeDocumentsListPage.jsx", "/zoiko-hr/documents/employees", "/zoiko-hr/documents/employees");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Asha Rao" }));
  fireEvent.click(screen.getByRole("button", { name: /Remind 1/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send reminder" }));
  await settle();
  assert.deepEqual(calls.bulk, [{ employeeIds: [7], message: undefined }]);
});

test("one employee's containers: a missing required one offers a reminder; HR-issued ones do not", async (t) => {
  const calls = mockService(t);
  await renderAt("employee-documents/EmployeeDocumentCategoriesPage.jsx", "/zoiko-hr/documents/employees/7", "/zoiko-hr/documents/employees/:employeeId");
  assert.ok(screen.getByRole("navigation", { name: "Document path" }).textContent.includes("Asha Rao"));
  const education = screen.getByRole("link", { name: "Education" }).closest("li");
  assert.ok(within(education).getByText("Not uploaded"));
  const payslips = screen.getByRole("link", { name: "Payslips" }).closest("li");
  assert.equal(within(payslips).queryByRole("button", { name: /Send reminder/ }), null);
  assert.equal(screen.queryByRole("button", { name: /Upload|Approve/ }), null);
  fireEvent.click(within(education).getByRole("button", { name: /Send reminder/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send reminder" }));
  await settle();
  assert.deepEqual(calls.remind, [{ employeeId: 7, categoryIds: [2], message: undefined }]);
});

test("files in a container: preview and download only; a pending file links to Approval Workflow", async (t) => {
  mockService(t);
  await renderAt("employee-documents/EmployeeCategoryFilesPage.jsx", "/zoiko-hr/documents/employees/7/1", "/zoiko-hr/documents/employees/:employeeId/:categoryId");
  const row = screen.getByText("Passport").closest("tr");
  assert.equal(within(row).getByRole("link", { name: /Pending approval/ }).getAttribute("href"), "/zoiko-hr/documents/approvals?tab=pending&item=50");
  assert.ok(within(row).getByRole("button", { name: "Preview Passport" }));
  assert.ok(within(row).getByRole("button", { name: "Download Passport" }));
  assert.equal(screen.queryByRole("button", { name: /Approve|Reject|Upload|Verify/ }), null);
});

test("category settings: toggles and the jurisdiction ID check are saved", async (t) => {
  const calls = mockService(t);
  await renderAt("settings/DocumentCategorySettingsPage.jsx", "/s", "/s");
  fireEvent.click(screen.getByRole("checkbox", { name: "Identity Proof is required" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Identity Proof identity-number check" }), { target: { value: "passport" } });
  await settle();
  assert.deepEqual(calls.update, [[1, { is_required: false }], [1, { id_number_field: "passport" }]]);
  assert.equal(screen.queryByRole("button", { name: "Delete Identity Proof" }), null);       // built-in: no delete
});

test("the old admin upload address redirects to the read-only list", () => {
  const routes = fs.readFileSync("src/routes/PortalApp.jsx", "utf8");
  assert.match(routes, /"\/zoiko-hr\/documents\/employee-upload": <Navigate to="\/zoiko-hr\/documents\/employees" replace \/>/);
  for (const f of ["EmployeeDocumentsListPage", "EmployeeDocumentCategoriesPage", "EmployeeCategoryFilesPage"]) {
    const src = fs.readFileSync(`src/modules/zoiko-hr/documents/employee-documents/${f}.jsx`, "utf8");
    assert.doesNotMatch(src, /uploadDocument|uploadMyDocument|approveDocument/, f);
  }
});
