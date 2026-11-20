/**
 * Documents Phase 2 (docs/new_docs/ZHR-DOCS-ARCH-001): My Files lets employees upload their own documents into category
 * containers, shows each file's review status and rejection reason, replaces rejected copies, removes pending ones, and
 * never offers uploads in categories HR fills. Also the UploadDialog's validation and server-error display.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const CATEGORIES = [
  { id: 1, key: "identity_proof", name: "Identity Proof", is_required: true, can_upload: true, requires_expiry: true, file_count: 1,
    status: "rejected", files: [{ id: 10, title: "Passport", version: 1, status: "rejected", uploaded_at: "2026-11-01T10:00:00Z",
      rejection_reason: "Too blurry to read" }] },
  { id: 2, key: "education", name: "Education", is_required: true, can_upload: true, file_count: 1, status: "pending_approval",
    files: [{ id: 11, title: "Degree", version: 1, status: "pending_approval", uploaded_at: "2026-11-02T10:00:00Z" }] },
  { id: 3, key: "bank_details", name: "Bank Details", is_required: true, can_upload: true, file_count: 0, status: "not_uploaded", files: [] },
  { id: 4, key: "payslips", name: "Payslips", is_required: false, can_upload: false, file_count: 0, status: "not_uploaded", files: [] },
];

// The hooks module is cached after its first import together with the mocked service it was linked to, so the mock
// delegates to `impl` and each test swaps the implementation, not the module.
const impl = {};
function mockService(t, overrides = {}) {
  const calls = { upload: [], withdraw: [] };
  Object.assign(impl, {
    getMyDocumentCategories: async () => structuredClone(CATEGORIES),
    uploadMyDocument: async (v) => { calls.upload.push(v); return {}; },
    withdrawMyDocument: async (id) => { calls.withdraw.push(id); return null; },
    ...overrides,
  });
  t.mock.module("../src/service/documentsService.js", { exports: {
    getMyDocumentCategories: (...a) => impl.getMyDocumentCategories(...a),
    uploadMyDocument: (...a) => impl.uploadMyDocument(...a),
    withdrawMyDocument: (...a) => impl.withdrawMyDocument(...a),
  } });
  return calls;
}

async function renderMyFiles() {
  const { default: MyFiles } = await import(`../src/pages/Peoples/Employees/Documents/Employee_MyFiles.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(MyFiles))));
  await settle();
}

test("My Files shows each container with its required flag and status", async (t) => {
  mockService(t);
  await renderMyFiles();
  assert.match(screen.getByTestId("my-files-summary").textContent, /0 of 3 required documents approved/);
  const identity = screen.getByRole("button", { name: /Identity Proof/ }).closest("li");
  assert.ok(within(identity).getByText("Required"));
  assert.ok(within(identity).getByText("Rejected"));
  const payslips = screen.getByRole("button", { name: /Payslips/ }).closest("li");
  assert.ok(within(payslips).getByText("Optional"));
  assert.equal(within(payslips).queryByRole("button", { name: /^Upload$/ }), null);   // HR fills this one
  const bank = screen.getByRole("button", { name: /Bank Details/ }).closest("li");
  assert.ok(within(bank).getByRole("button", { name: /^Upload$/ }));
});

test("a rejected file shows its reason and can be replaced with a new copy", async (t) => {
  const calls = mockService(t);
  await renderMyFiles();
  fireEvent.click(screen.getByRole("button", { name: /Identity Proof/ }));
  assert.ok(screen.getByText("Too blurry to read"));
  fireEvent.click(screen.getByRole("button", { name: /Upload new copy/ }));
  const dialog = screen.getByRole("dialog", { name: /Upload a new copy of Passport/ });
  const file = new File(["%PDF-1.4"], "passport.pdf", { type: "application/pdf" });
  fireEvent.change(within(dialog).getByLabelText("File"), { target: { files: [file] } });
  fireEvent.change(within(dialog).getByLabelText(/Expiry date/), { target: { value: "2030-01-01" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  await settle();
  assert.equal(calls.upload.length, 1);
  assert.deepEqual({ ...calls.upload[0], file: calls.upload[0].file.name },
    { categoryId: 1, file: "passport.pdf", expiryDate: "2030-01-01", replacesDocumentId: 10 });
  assert.match(screen.getByRole("status").textContent, /HR will review it/);
});

test("a pending upload can be removed; a decided one cannot", async (t) => {
  const calls = mockService(t);
  await renderMyFiles();
  fireEvent.click(screen.getByRole("button", { name: /Education/ }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Degree" }));
  await settle();
  assert.deepEqual(calls.withdraw, [11]);
  fireEvent.click(screen.getByRole("button", { name: /Identity Proof/ }));
  assert.equal(screen.queryByRole("button", { name: "Remove Passport" }), null);
});

test("the upload dialog validates before sending and shows the server's reasons", async (t) => {
  const err = Object.assign(new Error("The file's contents do not match its type."), {
    code: "DOC_PRECHECK_FAILED", checks: [{ status: "fail", message: "The file's contents do not match its type." }],
  });
  mockService(t, { uploadMyDocument: async () => { throw err; } });
  await renderMyFiles();
  fireEvent.click(within(screen.getByRole("button", { name: /Bank Details/ }).closest("li")).getByRole("button", { name: /^Upload$/ }));
  const dialog = screen.getByRole("dialog", { name: "Upload Bank Details" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  assert.match(within(dialog).getByRole("alert").textContent, /Choose a file/);
  fireEvent.change(within(dialog).getByLabelText("File"), { target: { files: [new File(["x"], "virus.exe")] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  assert.match(within(dialog).getByRole("alert").textContent, /not accepted/);
  fireEvent.change(within(dialog).getByLabelText("File"), { target: { files: [new File(["x"], "bank.pdf")] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(within(screen.getByRole("dialog")).getByRole("alert").textContent, /contents do not match/);
});

test("My Files shows one error with Retry when the list cannot load", async (t) => {
  mockService(t, { getMyDocumentCategories: async () => { throw Object.assign(new Error("Server unavailable"), { status: 503 }); } });
  await renderMyFiles();
  assert.match(screen.getByRole("alert").textContent, /Server unavailable/);
  assert.ok(screen.getByRole("button", { name: "Retry" }));
});
