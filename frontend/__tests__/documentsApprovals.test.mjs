/**
 * ZHR-27/28/29 frontend: Documents + Approvals pages use real API data, the
 * download path works, and no source file uses `api` without importing it
 * (the "api is not defined" regression; the project has no ESLint setup).
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";

// ── static guard: undefined `api` / removed helpers ─────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("no source file calls api.* without importing or declaring api", () => {
  const offenders = [];
  for (const file of walk(path.resolve("src"))) {
    const src = fs.readFileSync(file, "utf8");
    if (!/\bapi\.(get|post|put|patch|delete)\s*\(/.test(src)) continue;
    const defined = /import\s+[^;]*\bapi\b[^;]*from|(const|let|var|function)\s+api\b|export\s+const\s+api\b/.test(src);
    if (!defined) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(offenders, []);
});

test("Documents and Approvals pages no longer reference undefined helpers or mock data", () => {
  const page = fs.readFileSync("src/modules/shared-layers/DocumentsPage.jsx", "utf8");
  const svc = fs.readFileSync("src/service/documentsService.js", "utf8");
  assert.doesNotMatch(page, /fetchDocuments/);
  assert.doesNotMatch(svc, /mockDocuments|Employee Handbook 2026/);
  assert.doesNotMatch(fs.readFileSync("src/modules/shared-layers/ApprovalsPage.jsx", "utf8"), /Evelyn Carter|Umbrella|Marcus Thorne/);
});

// ── service helpers ──────────────────────────────────────────────────────────
test("filenameFromDisposition handles RFC 5987, quoted and missing headers; validateFile", async (t) => {
  t.mock.module("../src/service/api.js", {
    exports: { api: {}, getAccessToken: () => null, API_BASE_URL: "http://x" },
  });
  const { filenameFromDisposition, validateFile } = await import("../src/service/documentsService.js");
  assert.equal(filenameFromDisposition("attachment; filename*=utf-8''R%C3%A9port%202026.pdf", "x"), "Réport 2026.pdf");
  assert.equal(filenameFromDisposition('attachment; filename="a b.pdf"', "x"), "a b.pdf");
  assert.equal(filenameFromDisposition(null, "fallback.pdf"), "fallback.pdf");
  assert.match(validateFile({ name: "run.exe", size: 5 }), /not allowed/);
  assert.match(validateFile({ name: "a.pdf", size: 11 * 1024 * 1024 }), /too large/);
  assert.equal(validateFile({ name: "a.PDF", size: 100 }), null);
});

// ── page behaviour with mocked services ──────────────────────────────────────
const docsSvc = {};
const apprSvc = {};
const auth = { user: { role: "super_admin" } };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });

const DOC = {
  id: 1, title: "Employee Handbook", file_name: "handbook.pdf", file_size: 2048, category: "policy",
  organization_name: "Acme Ltd", uploader_name: "Ann Lee", created_at: "2026-09-30T10:00:00Z",
};

function setup(t) {
  for (const o of [docsSvc, apprSvc]) for (const k of Object.keys(o)) delete o[k];
  Object.assign(docsSvc, {
    ALLOWED_EXTENSIONS: ["pdf"],
    MAX_FILE_SIZE_MB: 10,
    validateFile: (f) => (f ? null : "Choose a file"),
    getOrganizations: async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }] }),
    getDocuments: async () => ({ documents: [DOC], total: 1 }),
    deleteDocument: async () => ({ message: "Employee Handbook was deleted.", already_deleted: false }),
    downloadDocument: async () => "handbook.pdf",
    uploadDocument: async () => ({ title: "New", organization_name: "Acme Ltd" }),
  });
  Object.assign(apprSvc, {
    list: async () => ({ approvals: [], total: 0 }),
    summary: async () => ({ pending: 0, approved_this_month: 0, rejected_this_month: 0 }),
    approveLeave: async (id) => ({ id }),
    rejectLeave: async (id) => ({ id }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  // Delegating wrappers: tests may replace docsSvc members after registration.
  const wrap = (name) => (...a) => docsSvc[name](...a);
  t.mock.module("../src/service/documentsService.js", {
    exports: {
      ALLOWED_EXTENSIONS: ["pdf"],
      MAX_FILE_SIZE_MB: 10,
      validateFile: wrap("validateFile"),
      getOrganizations: wrap("getOrganizations"),
      getDocuments: wrap("getDocuments"),
      deleteDocument: wrap("deleteDocument"),
      downloadDocument: wrap("downloadDocument"),
      uploadDocument: wrap("uploadDocument"),
    },
  });
  t.mock.module("../src/service/approvalsService.js", {
    exports: {
      approvalsService: {
        list: (...a) => apprSvc.list(...a),
        summary: (...a) => apprSvc.summary(...a),
        approveLeave: (...a) => apprSvc.approveLeave(...a),
        rejectLeave: (...a) => apprSvc.rejectLeave(...a),
      },
    },
  });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
}

test("Documents lists real rows, searches with a debounced query and resets to page 1", async (t) => {
  setup(t);
  const calls = [];
  docsSvc.getDocuments = async (p) => { calls.push(p); return { documents: [DOC], total: 40 }; };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Employee Handbook"));
  assert.ok(screen.getByText(/handbook\.pdf · 2\.0 KB · by Ann Lee/));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  assert.equal(calls.at(-1).page, 2);
  fireEvent.change(screen.getByLabelText("Search documents"), { target: { value: "hand" } });
  await settle();
  assert.equal(calls.at(-1).q, "hand");
  assert.equal(calls.at(-1).page, 1);
  cleanup();
});

test("Documents empty states: none yet vs. no search match with clear action", async (t) => {
  setup(t);
  docsSvc.getDocuments = async () => ({ documents: [], total: 0 });
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/No documents yet/));
  fireEvent.change(screen.getByLabelText("Search documents"), { target: { value: "zzz" } });
  await settle();
  assert.ok(screen.getByText("No documents match your search."));
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await settle();
  assert.ok(screen.getByText(/No documents yet/));
  cleanup();
});

test("Documents download and delete (with confirmation) call the API", async (t) => {
  setup(t);
  let downloaded;
  let deleted;
  docsSvc.downloadDocument = async (d) => { downloaded = d.id; };
  docsSvc.deleteDocument = async (id) => { deleted = id; return { message: "Employee Handbook was deleted.", already_deleted: false }; };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByLabelText("Download Employee Handbook"));
  await settle();
  assert.equal(downloaded, 1);
  fireEvent.click(screen.getByLabelText("Delete Employee Handbook"));
  assert.ok(screen.getByText(/will be removed from the repository/));
  assert.equal(deleted, undefined);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  assert.equal(deleted, 1);
  assert.ok(screen.getByText(/was deleted/));
  cleanup();
});

test("Add Document opens a dialog, requires file + org, and shows server errors inside", async (t) => {
  setup(t);
  docsSvc.uploadDocument = async () => { throw new Error("File type .exe is not allowed."); };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Add Document/ }));
  assert.equal(screen.getByRole("button", { name: "Upload" }).disabled, true);
  const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(/^Organization/), { target: { value: "1" } });
  assert.equal(screen.getByRole("button", { name: "Upload" }).disabled, false);
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await waitFor(() => screen.getByText(/is not allowed/));
  assert.ok(screen.getByRole("dialog"));
  cleanup();
});

test("Approvals shows real pending items and the approve/reject flows", async (t) => {
  setup(t);
  const item = {
    id: 7, request_type: "leave", status: "pending", employee_name: "Bob Brown", employee_email: "b@x.test",
    organization_name: "Globex Inc", leave_type: "annual", start_date: "2026-07-01", end_date: "2026-07-02", days: 2,
    reason: "Trip", submitted_at: "2026-09-29T08:00:00Z", current_approver: "Organization admin / HR",
  };
  let approved;
  let rejected;
  apprSvc.list = async (p) => (p.status === "pending" ? { approvals: [item], total: 1 } : { approvals: [], total: 0 });
  apprSvc.summary = async () => ({ pending: 1, approved_this_month: 3, rejected_this_month: 2 });
  apprSvc.approveLeave = async (id, c) => { approved = [id, c]; return { id }; };
  apprSvc.rejectLeave = async (id, c) => { rejected = [id, c]; return { id }; };
  const { default: Page } = await import("../src/modules/shared-layers/ApprovalsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/Annual leave · 2026-07-01 → 2026-07-02 · 2 days/));
  assert.ok(screen.getAllByText("Globex Inc").length >= 1);
  assert.equal(screen.queryByText("Evelyn Carter"), null);

  fireEvent.click(screen.getByLabelText("Reject leave request 7"));
  assert.equal(screen.getByRole("button", { name: "Reject" }).disabled, true); // comment required
  fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "Peak season" } });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  assert.deepEqual(rejected, [7, "Peak season"]);

  fireEvent.click(screen.getByLabelText("Approve leave request 7"));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await settle();
  assert.deepEqual(approved, [7, ""]);
  cleanup();
});

test("Approvals empty state", async (t) => {
  setup(t);
  const { default: Page } = await import("../src/modules/shared-layers/ApprovalsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("No pending approvals."));
  assert.ok(screen.getByText("No decisions yet."));
  cleanup();
});
