/**
 * ZHR-46: only organization admins upload documents, so documents are never
 * pending / approved / rejected, and employees only read.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

async function flush(path) {
  const mod = await import(`${path}?t=${Date.now()}-${Math.random()}`);
  render(React.createElement(mod.default));
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
}

const HOOK = {
  preview: null, busyId: null, busyAction: null, fileError: null,
  view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {},
};
const DOCS = [{ id: 1, title: "Handbook", file_name: "handbook.pdf", status: "approved", created_at: "2026-09-01" }];

test("employee My Files has no upload card, no delete button and no status badge", async (t) => {
  t.mock.module("../src/hooks/useDocumentFile.js", { exports: { useDocumentFile: () => HOOK } });
  t.mock.module("../src/service/employee.js", { exports: { getDocuments: async () => ({ data: DOCS }) } });
  await flush("../src/pages/Peoples/Employees/Documents/Employee_MyFiles.jsx");
  assert.ok(screen.getByText("Handbook"));
  assert.equal(screen.queryByText("Upload Document"), null);
  assert.equal(screen.queryByText(/Browse Files/), null);
  assert.equal(screen.queryByRole("button", { name: /Delete/ }), null);
  assert.equal(screen.queryByText(/Pending|Approved|Rejected/), null);
});

test("the Upload Request page is gone from the employee area", () => {
  assert.equal(fs.existsSync("src/pages/Peoples/Employees/Documents/Employee_UploadRequest.jsx"), false);
  assert.doesNotMatch(fs.readFileSync("src/App.jsx", "utf8"), /upload-request|EmployeeUploadRequest/);
  assert.doesNotMatch(fs.readFileSync("src/config/roles.js", "utf8"), /upload-request/);
});

test("no employee-facing document page imports the upload service", () => {
  for (const f of ["Employee_MyFiles", "Employee_Payslips", "Employee_OfferContracts", "Employee_TaxCompliance", "Employee_CompanyDocuments"]) {
    const src = fs.readFileSync(`src/pages/Peoples/Employees/Documents/${f}.jsx`, "utf8");
    assert.doesNotMatch(src, /uploadDocument|deleteDocument/, f);
  }
});

test("Company Documents (admin) has no Pending / Approved / Rejected filters or badges", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/documents/company-documents.jsx", "utf8");
  assert.match(src, /STATUS_FILTERS = \["all", "expired"\]/);
  assert.doesNotMatch(src, /label: "Pending"|label: "Approved"|label: "Rejected"/);
  assert.match(src, /Only organization admins upload company documents/);
});

// ── ZHR-47: preview of an uploaded document ─────────────────────────────────

import { normalizePreviewBlob } from "../src/utils/documentPreview.js";

test("a PDF or image stored with a generic content type is previewed with the right one", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const generic = new Blob([bytes], { type: "application/octet-stream" });
  const pdf = normalizePreviewBlob(generic, "Offer Letter.PDF");
  assert.equal(pdf.type, "application/pdf");
  assert.equal(pdf.size, 4);
  assert.equal(normalizePreviewBlob(new Blob([bytes], { type: "" }), "scan.png").type, "image/png");
  assert.equal(normalizePreviewBlob(generic, "photo.JPG").type, "image/jpeg");
  // already right, or not something to override: left alone
  const good = new Blob([bytes], { type: "application/pdf" });
  assert.equal(normalizePreviewBlob(good, "x.pdf"), good);
  const doc = new Blob([bytes], { type: "application/octet-stream" });
  assert.equal(normalizePreviewBlob(doc, "contract.docx"), doc);
  assert.equal(normalizePreviewBlob(null, "x.pdf"), null);
});

test("Company Documents disables Preview and says why when the file is missing on the server", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/documents/company-documents.jsx", "utf8");
  assert.match(src, /disabled=\{busyId === d\.id \|\| d\.file_missing\}/);
  assert.match(src, /The file is missing on the server/);
});

// ── ZHR-49: no Manager approval stage ────────────────────────────────────────

test("the Document Approval Workflow page has no Manager stage", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/documents/approvals.jsx", "utf8");
  assert.match(src, /Approval Chain: HR Admin → Org Admin/);
  assert.doesNotMatch(src, /Manager → HR Admin/);
  assert.doesNotMatch(src, /Managers approve only their step/);
  // a legacy "manager" step is displayed as the HR Admin stage that now owns it
  assert.match(src, /manager: "HR Admin"/);
});
