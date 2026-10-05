/**
 * ZHR-27/28/29 frontend: Documents page use real API data, the
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

test("Documents page no longer reference undefined helpers or mock data", () => {
  const page = fs.readFileSync("src/modules/shared-layers/DocumentsPage.jsx", "utf8");
  const svc = fs.readFileSync("src/service/documentsService.js", "utf8");
  assert.doesNotMatch(page, /fetchDocuments/);
  assert.doesNotMatch(svc, /mockDocuments|Employee Handbook 2026/);
});

// ── service helpers ──────────────────────────────────────────────────────────
test("filenameFromDisposition handles RFC 5987, quoted and missing headers; validateFile", async (t) => {
  t.mock.module("../src/service/api.js", {
    exports: { api: {}, getAccessToken: () => null, refreshSession: async () => false, API_BASE_URL: "http://x" },
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
const auth = { user: { role: "super_admin" } };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });

const DOC = {
  id: 1, title: "Employee Handbook", file_name: "handbook.pdf", file_size: 2048, category: "policy",
  organization_name: "Acme Ltd", uploader_name: "Ann Lee", created_at: "2026-09-30T10:00:00Z",
};

function setup(t) {
  for (const o of [docsSvc]) for (const k of Object.keys(o)) delete o[k];
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

test("a slow earlier list response cannot undo a newer search (ZHR-28)", async (t) => {
  setup(t);
  const OTHER = { ...DOC, id: 2, title: "Unrelated", file_name: "unrelated.pdf" };
  let releaseFirst;
  const firstLoad = new Promise((r) => { releaseFirst = r; });
  let call = 0;
  docsSvc.getDocuments = async (p) => {
    call += 1;
    if (call === 1) { await firstLoad; return { documents: [OTHER], total: 40 }; }
    return { documents: [DOC], total: 1 };
  };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));

  // A search goes out and lands while the first (unfiltered) load is still open.
  fireEvent.change(screen.getByLabelText("Search documents"), { target: { value: "hand" } });
  await settle();
  assert.ok(screen.getByText("Employee Handbook"));

  releaseFirst();
  await settle();
  // The stale unfiltered response must not repaint the filtered list.
  assert.ok(screen.getByText("Employee Handbook"));
  assert.equal(screen.queryByText("Unrelated"), null);
  assert.ok(screen.getByText(/1 result for “hand”/));
  cleanup();
});

test("a document deleted while an older list is in flight stays deleted (ZHR-28)", async (t) => {
  setup(t);
  const STALE = { ...DOC, id: 1, title: "Employee Handbook" };
  const GONE = { ...DOC, id: 2, title: "Handbook copy", file_name: "copy.pdf" };
  let releaseStale;
  const staleLoad = new Promise((r) => { releaseStale = r; });
  let deleted = false;
  let call = 0;
  docsSvc.getDocuments = async () => {
    call += 1;
    // The second load (paging) is slow and still holds the pre-delete snapshot.
    // total spans two pages so the Next button is enabled (PAGE_SIZE is 15).
    if (call === 2) { await staleLoad; return { documents: [STALE, GONE], total: 20 }; }
    return deleted ? { documents: [STALE], total: 19 } : { documents: [STALE, GONE], total: 20 };
  };
  docsSvc.deleteDocument = async () => { deleted = true; return { message: "'Handbook copy' was deleted.", already_deleted: false }; };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();

  fireEvent.click(screen.getByRole("button", { name: "Next" })); // slow load in flight
  fireEvent.click(screen.getByLabelText("Delete Handbook copy (#2)"));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  assert.equal(screen.queryByText("Handbook copy"), null);
  assert.ok(screen.getByText(/was deleted/));

  releaseStale();
  await settle();
  assert.equal(screen.queryByText("Handbook copy"), null);
  cleanup();
});

test("deleting the only row of the last page steps back instead of showing an empty repository", async (t) => {
  setup(t);
  const last = { ...DOC, id: 5, title: "Last page doc", file_name: "last.pdf" };
  const pages = { 1: { documents: [DOC], total: 16 }, 2: { documents: [last], total: 16 } };
  let afterDelete = false;
  docsSvc.getDocuments = async (p) => (afterDelete ? { documents: [DOC], total: 15 } : pages[p.page] || pages[1]);
  docsSvc.deleteDocument = async () => { afterDelete = true; return { message: "'Last page doc' was deleted.", already_deleted: false }; };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  assert.ok(screen.getByText("Last page doc"));

  fireEvent.click(screen.getByLabelText("Delete Last page doc (#5)"));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  await settle();
  assert.equal(screen.queryByText(/No documents yet/), null);
  assert.ok(screen.getByText("Employee Handbook"));
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
  fireEvent.click(screen.getByLabelText("Download Employee Handbook (#1)"));
  await settle();
  assert.equal(downloaded, 1);
  fireEvent.click(screen.getByLabelText("Delete Employee Handbook (#1)"));
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

test("Add Document explains a blocked upload instead of leaving a dead button", async (t) => {
  setup(t);
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Add Document/ }));

  assert.ok(screen.getByText(/Choose a file to upload\./));
  const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
  assert.ok(screen.getByText(/Select an organization\./));
  assert.equal(screen.getByRole("button", { name: "Upload" }).disabled, true);
  cleanup();
});

test("a failed organization list is reported in the dialog and Retry refetches it", async (t) => {
  setup(t);
  let orgCalls = 0;
  docsSvc.getOrganizations = async () => {
    orgCalls += 1;
    if (orgCalls === 1) throw new Error("Failed to load organizations.");
    return { organizations: [{ id: 1, name: "Acme Ltd" }] };
  };
  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Add Document/ }));
  assert.ok(await screen.findByText("Failed to load organizations."));
  assert.ok(screen.getByText(/Organizations could not be loaded/));
  assert.equal(screen.getByRole("button", { name: "Upload" }).disabled, true);

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  assert.equal(within(dialog).getByLabelText(/^Organization/).disabled, false);
  assert.equal(within(dialog).queryByText("Failed to load organizations."), null);
  cleanup();
});
