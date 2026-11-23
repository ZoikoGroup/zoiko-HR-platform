/**
 * QA round 1, Company Documents:
 * R1-18 New Folder is never stuck disabled and creates the folder in the open category;
 * R1-21 files can be ticked (select all) and shared together in one action;
 * R1-22 a file missing on the server is flagged and its preview offers "Upload it again".
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
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });

// ── company documents page (R1-18, R1-21, R1-22) ─────────────────────────────────────────────────────────────────────

const ACCESS = { visibility: "admin_only", label: "Admin only", permission: "view", require_ack: false, audience_count: 2 };
const FILES = [
  { id: 10, title: "Job Description", version: 1, version_id: 21, status: "approved", publish_state: "published", uploaded_by: { name: "Hr" },
    uploaded_at: "2026-11-01T00:00:00Z", access: ACCESS, ack: null, file_available: false },
  { id: 11, title: "Offer Letter", version: 1, version_id: 22, status: "approved", publish_state: "published", uploaded_by: { name: "Hr" },
    uploaded_at: "2026-11-01T00:00:00Z", access: ACCESS, ack: null, file_available: true },
];

const impl = {};
const mocked = new WeakSet();
function mockServices(t, over = {}) {
  const calls = { folder: [], bulk: [], put: [], version: [] };
  Object.assign(impl, {
    listCompanyItems: async () => ({ category: { id: 3, name: "Onboarding Documents" }, breadcrumb: [], folders: [],
                                     files: { items: structuredClone(FILES), total: 2, page: 1, per_page: 50 } }),
    uploadCompanyDocument: async () => ({}), uploadCompanyVersion: async (v) => { calls.version.push(v); return {}; },
    listCompanyVersions: async () => [], publishCompanyDocument: async () => ({}), unpublishCompanyDocument: async () => ({}),
    deleteCompanyDocument: async () => null,
    createCompanyFolder: async (v) => { calls.folder.push(v); return { id: 9, name: v.name }; },
    getAccessRule: async () => ({ rule: null, effective: { ...ACCESS, label: "Admin only", department_ids: [], roles: [], employee_ids: [] } }),
    putAccessRule: async (...a) => { calls.put.push(a); return {}; },
    putBulkAccessRule: async (ids, rule) => { calls.bulk.push([ids, rule]); return { updated: ids.length }; },
    previewAccessRule: async () => ({ audience_count: 5, sample: [] }),
    getAckTracking: async () => ({ items: [] }), remindAcks: async () => ({}),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/documentsService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDepartments: async () => ({ data: [] }), getHrEmployees: async () => ({ items: [] }),
      getDocumentFile: async () => {
        throw Object.assign(new Error("The file for this document is missing on the server. Upload it again as a new version."),
          { status: 410, code: "DOC_FILE_MISSING", recovery: "upload_version" });
      },
    } });
  }
  return calls;
}

async function renderCategory() {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/company-documents/CompanyCategoryPage.jsx?t=${Math.random()}`);
  render(h(QueryClientProvider, { client: qc() }, h(MemoryRouter, { initialEntries: ["/c/3"] },
    h(Routes, null, h(Route, { path: "/c/:categoryId", element: h(Page) })))));
  await settle();
}

test("New Folder is enabled, explains an empty name, and creates the folder in the open category", async (t) => {
  const calls = mockServices(t);
  await renderCategory();
  const button = screen.getByRole("button", { name: "New Folder" });
  assert.equal(button.disabled, false);
  fireEvent.click(button);
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Type a name/);
  assert.equal(calls.folder.length, 0);
  fireEvent.change(screen.getByLabelText("New folder name"), { target: { value: "  Offer   letters " } });
  fireEvent.click(button);
  await settle();
  assert.deepEqual(calls.folder, [{ name: "Offer letters", categoryId: 3, parentId: null }]);
  assert.match(screen.getByRole("status").textContent, /Offer letters/);
});

test("a name the browser filled in without a change event still creates the folder", async (t) => {
  const calls = mockServices(t);
  await renderCategory();
  const input = screen.getByLabelText("New folder name");
  // autofill / password managers set the value directly; React's state never hears about it
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "Autofilled");
  fireEvent.submit(input.closest("form"));
  await settle();
  assert.equal(calls.folder[0]?.name, "Autofilled");
});

test("select all, then Share selected shares every ticked file in one request", async (t) => {
  const calls = mockServices(t);
  await renderCategory();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all files on this page" }));
  await settle();
  const bar = screen.getByRole("region", { name: "Selected files" });
  assert.match(bar.textContent, /2 selected/);
  fireEvent.click(within(bar).getByRole("button", { name: /Share selected/ }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: /Who can see these 2 documents/ });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Each one the same/ }));   // inherit is on by default: turn it off
  fireEvent.click(within(dialog).getByRole("radio", { name: "All employees" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.equal(calls.put.length, 0, "not one request per file");
  assert.equal(calls.bulk.length, 1);
  assert.deepEqual(calls.bulk[0][0].sort(), [10, 11]);
  assert.equal(calls.bulk[0][1].visibility, "all_employees");
  assert.equal(screen.queryByRole("region", { name: "Selected files" }), null, "the selection is cleared after sharing");
});

test("ticking one file then unticking the header clears the selection", async (t) => {
  mockServices(t);
  await renderCategory();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Offer Letter" }));
  await settle();
  const all = screen.getByRole("checkbox", { name: "Select all files on this page" });
  assert.equal(all.indeterminate, true);
  fireEvent.click(all);                       // select all
  fireEvent.click(all);                       // and none
  await settle();
  assert.equal(screen.queryByRole("region", { name: "Selected files" }), null);
});

test("a file missing on the server is flagged and its preview offers Upload it again", async (t) => {
  const calls = mockServices(t);
  await renderCategory();
  const row = screen.getByText("Job Description").closest("tr");
  assert.ok(within(row).getByText("File missing"));
  assert.equal(within(screen.getByText("Offer Letter").closest("tr")).queryByText("File missing"), null);
  fireEvent.click(within(row).getByRole("button", { name: "Preview Job Description" }));
  await settle();
  const missing = screen.getByTestId("file-missing");
  assert.match(missing.textContent, /File missing on the server/);
  fireEvent.click(within(missing).getByRole("button", { name: "Upload it again" }));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: /New version of Job Description/ }));
  assert.equal(calls.version.length, 0);
});
