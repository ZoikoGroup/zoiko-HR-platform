/**
 * Documents Phase 1 (docs/new_docs/ZHR-DOCS-ARCH-001): the shared frontend foundation — permission map, validators,
 * StatusChip, SectionState (one state per section) and FilePreviewDrawer.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { DOC_PERMISSIONS, hasDocPermission } from "../src/modules/zoiko-hr/documents/permissions.js";
import { validateUpload, validateReject, validateAccessRule, validateLadder, isValid } from "../src/modules/zoiko-hr/documents/validation.js";
import { statusMeta } from "../src/modules/zoiko-hr/documents/constants.js";
import { keys } from "../src/service/queryKeys.js";

afterEach(() => cleanup());
const settle = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const h = React.createElement;

// ── permissions ───────────────────────────────────────────────────────────────────────────────────────────────────

test("only admins and HR admins manage documents and decide approvals", () => {
  for (const role of ["admin", "hr_admin"]) assert.ok(hasDocPermission(role, "approval.decide"));
  for (const role of ["manager", "employee", "super_admin", undefined, null]) assert.ok(!hasDocPermission(role, "approval.decide"));
  assert.ok(hasDocPermission("employee", "me.upload"));
  assert.ok(!hasDocPermission("hr_admin", "automation.global"));
  assert.deepEqual(DOC_PERMISSIONS["system.issue"], []);               // deferred: nobody issues payslips yet
});

// ── validation ────────────────────────────────────────────────────────────────────────────────────────────────────

test("upload validation mirrors the server's limits", () => {
  assert.ok(validateUpload({ file: null }).file);
  assert.match(validateUpload({ file: { name: "run.exe", size: 10 } }).file, /not accepted/);
  assert.match(validateUpload({ file: { name: "id.pdf", size: 0 } }).file, /empty/);
  assert.match(validateUpload({ file: { name: "id.pdf", size: 11 * 1024 * 1024 } }).file, /larger than/);
  assert.ok(isValid(validateUpload({ file: { name: "ID.PDF", size: 100 } })));
  assert.ok(validateUpload({ file: { name: "id.pdf", size: 1 }, requiresExpiry: true }).expiryDate);
  assert.match(validateUpload({ file: { name: "id.pdf", size: 1 }, expiryDate: "2026-01-01", today: "2026-11-19" }).expiryDate, /expired/);
});

test("rejecting needs a reason and a note", () => {
  assert.deepEqual(Object.keys(validateReject({})).sort(), ["note", "reasonCode"]);
  assert.ok(validateReject({ reasonCode: "illegible", note: "bad" }).note);
  assert.ok(isValid(validateReject({ reasonCode: "illegible", note: "Too blurry to read" })));
});

test("an access rule names who it is for", () => {
  assert.ok(validateAccessRule({ visibility: "nobody" }).visibility);
  assert.ok(validateAccessRule({ visibility: "departments", department_ids: [] }).department_ids);
  assert.ok(isValid(validateAccessRule({ visibility: "all_employees" })));
  assert.ok(isValid(validateAccessRule({ visibility: "employees", employee_ids: [3] })));
});

test("an escalation ladder moves forward in time", () => {
  assert.ok(validateLadder([]).steps);
  assert.ok(validateLadder([{ after_days: 3 }, { after_days: 3 }]).steps);
  assert.ok(isValid(validateLadder([{ after_days: 0 }, { after_days: 3 }, { after_days: 7 }])));
});

test("document query keys are stable and nested under their prefix", () => {
  assert.deepEqual(keys.documents.approvals.list({ tab: "pending" }), ["documents", "approvals", "list", { tab: "pending" }]);
  assert.deepEqual(keys.documents.me.counts().slice(0, 2), keys.documents.me.all);
  assert.deepEqual(keys.automation.runs({}).slice(0, 1), keys.automation.all);
});

// ── StatusChip ────────────────────────────────────────────────────────────────────────────────────────────────────

test("StatusChip always writes the status out, and can link", async () => {
  const { default: StatusChip } = await import("../src/modules/zoiko-hr/documents/components/StatusChip.jsx");
  render(h(MemoryRouter, null, h("div", null,
    h(StatusChip, { status: "pending_approval", href: "/zoiko-hr/documents/approvals?item=4" }),
    h(StatusChip, { status: "rejected" }),
    h(StatusChip, { status: "something_new" }))));
  const link = screen.getByRole("link", { name: /Pending approval/ });
  assert.equal(link.getAttribute("href"), "/zoiko-hr/documents/approvals?item=4");
  assert.ok(screen.getByText("Rejected"));
  assert.ok(screen.getByText("something new"));
  assert.equal(statusMeta("approved").tone, "emerald");
});

// ── SectionState ──────────────────────────────────────────────────────────────────────────────────────────────────

async function section(props) {
  const { default: SectionState } = await import("../src/modules/zoiko-hr/documents/components/SectionState.jsx");
  render(h(SectionState, { empty: { title: "Nothing here" }, ...props }, (data) => h("p", null, `rows:${data.length}`)));
}

test("SectionState shows exactly one state at a time", async () => {
  await section({ query: { isPending: true } });
  assert.ok(screen.getByRole("status"));
  assert.equal(screen.queryByText(/rows:/), null);
  cleanup();

  let retried = 0;
  await section({ query: { isPending: false, isError: true, error: new Error("Server down"), refetch: () => { retried++; } } });
  assert.match(screen.getByRole("alert").textContent, /Server down/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  assert.equal(retried, 1);
  assert.equal(screen.queryByText("Nothing here"), null);              // an error is never shown as "empty"
  cleanup();

  await section({ query: { isPending: false, isError: true, error: Object.assign(new Error("no"), { status: 403 }) } });
  assert.ok(screen.getByText("You don't have access to this"));
  cleanup();

  await section({ query: { isPending: false, data: [] } });
  assert.ok(screen.getByText("Nothing here"));
  cleanup();

  await section({ loading: false, data: [1, 2] });
  assert.ok(screen.getByText("rows:2"));
});

// ── FilePreviewDrawer ─────────────────────────────────────────────────────────────────────────────────────────────

test("FilePreviewDrawer opens a file, offers download only when allowed, and closes on Escape", async () => {
  const { default: FilePreviewDrawer } = await import("../src/modules/zoiko-hr/documents/components/FilePreviewDrawer.jsx");
  let closed = 0;
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const opener = document.createElement("button");
  document.body.appendChild(opener);
  opener.focus();
  const ui = (canDownload) => h(FilePreviewDrawer, {
    open: true, title: "Passport", canDownload, fetcher: async () => ({ blob: png, filename: "passport.png" }),
    onClose: () => { closed++; },
  });
  const { rerender, unmount } = render(ui(false));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: /Preview of passport.png/ }));
  assert.ok(screen.getByTestId("preview-image"));
  assert.equal(screen.queryByRole("button", { name: /Download/ }), null);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Close preview" }));
  rerender(ui(true));
  await settle();
  assert.ok(screen.getByRole("button", { name: /Download/ }));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(closed, 1);
  unmount();
  assert.equal(document.activeElement, opener);                       // focus returns to what opened it
  opener.remove();
});

test("FilePreviewDrawer shows an error when the file cannot be fetched", async () => {
  const { default: FilePreviewDrawer } = await import("../src/modules/zoiko-hr/documents/components/FilePreviewDrawer.jsx");
  render(h(FilePreviewDrawer, { open: true, inline: true, title: "X", fetcher: async () => { throw new Error("File missing"); }, onClose: () => {} }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /File missing/);
  assert.equal(screen.queryByRole("dialog"), null);                    // inline mode is a region, not a modal
});
