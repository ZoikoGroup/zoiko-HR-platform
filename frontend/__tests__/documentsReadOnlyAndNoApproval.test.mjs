/**
 * ZHR-46: only organization admins upload documents, so documents are never
 * pending / approved / rejected, and employees only read.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

async function flush(path) {
  const mod = await import(`${path}?t=${Date.now()}-${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(mod.default)));
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
}

const HOOK = {
  preview: null, busyId: null, busyAction: null, fileError: null,
  view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {},
};
const DOCS = [{ id: 1, title: "Handbook", file_name: "handbook.pdf", status: "approved", created_at: "2026-09-01" }];

// ZHR-DOCS-ARCH-001 reverses ZHR-46 for My Files: employees upload their own documents (approved by HR). That contract is
// tested in documentsPhase2.test.mjs. Admins still never upload on an employee's behalf from the employee pages.

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

// ZHR-DOCS-ARCH-001 Module B replaced the folder-only page: category cards, an All / Expiring soon / Expired segment and
// no employee search on company documents.
test("Company Documents (admin) is organized by category with an expiry segment and no employee search", () => {
  for (const f of ["CompanyCategoriesPage", "CompanyCategoryPage"]) {
    const src = fs.readFileSync(`src/modules/zoiko-hr/documents/company-documents/${f}.jsx`, "utf8");
    assert.match(src, /\["expiring_soon", "Expiring soon"\]/, f);
    assert.doesNotMatch(src, /Search by Employee|employee_id_str/, f);
  }
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

test("a file missing on the server is reported, not shown as a broken preview", () => {
  // The server answers 410 with the reason; the preview drawer shows it as an error (documentsPhase1 renders it).
  const src = fs.readFileSync("src/modules/zoiko-hr/documents/components/FilePreviewDrawer.jsx", "utf8");
  assert.match(src, /state\.status === "error" && <DocumentErrorState message=\{state\.message\}/);
});

// ── ZHR-49: no Manager approval stage ────────────────────────────────────────

test("the Document Approval Workflow page has no Manager stage", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/documents/approvals/ApprovalWorkflowPage.jsx", "utf8");
  assert.match(src, /Approval chain: HR Admin → Org Admin/);
  assert.doesNotMatch(src, /Manager → HR Admin/);
  assert.doesNotMatch(src, /Managers approve only their step/);
  // the server reports a legacy "manager" step as the HR Admin stage that now owns it (queue_service)
  assert.match(fs.readFileSync("../backend/app/modules/hr/documents/queue_service.py", "utf8"), /"hr_admin" if s\.required_role == "manager"/);
});
