/** Post-submission onboarding C + G: admin "All submissions" list and detail; the new hire's "My documents". */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

const SUBMISSIONS = [
  { id: 1, title: "ID proof", category: "id_proof", status: "approved", onboarding_new_hire_id: 7, hire_name: "Ann Lee", position: "Analyst",
    kind: "upload", submitted_at: "2026-11-01T10:00:00Z", reviewed_by_name: "Hana HR" },
  { id: 2, title: "Bank details", category: "bank_details", status: "pending", onboarding_new_hire_id: 8, hire_name: "Raj Patel", position: "Engineer",
    kind: "form", package_mode: "COMPLETE", submitted_at: "2026-10-20T10:00:00Z" },
  { id: 3, title: "NDA", category: "nda", status: "requested", onboarding_new_hire_id: 7, hire_name: "Ann Lee", position: "Analyst",
    kind: "package", package_mode: "SIGN", details_changed: true },
];

async function loadSubmissions(t, over = {}) {
  const calls = { list: [], detail: [], review: [], zip: [] };
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingSubmissions: async (f) => { calls.list.push(f); return SUBMISSIONS; },
    getOnboardingDocumentDetail: async (id, reveal) => {
      calls.detail.push([id, reveal]);
      return { document: SUBMISSIONS.find((s) => s.id === id), can_reveal: over.canReveal ?? true,
        answers: [{ label: "Account number", value: reveal ? "12345678" : "****5678", masked: !reveal }],
        evidence: null, history: [{ version: 1, status: "rejected", rejection_reason: "Blurry" }, { version: 2, status: "pending" }] };
    },
    getOnboardingDocumentFile: async () => ({ blob: new Blob(["%PDF"], { type: "application/pdf" }), filename: "bank.pdf" }),
    downloadOnboardingDocumentFile: async () => ({ blob: new Blob(["%PDF"]), filename: "bank.pdf" }),
    reviewOnboardingDocument: async (id, decision, reason) => { calls.review.push([id, decision, reason]); return {}; },
    downloadHireDocumentsZip: async (id) => { calls.zip.push(id); return { blob: new Blob(["x"]), filename: "docs.zip" }; },
  } });
  t.mock.module("../src/utils/fileViewer.js", { exports: { openFile: (...a) => { calls.opened = a; } } });
  const { default: Submissions } = await import(`../src/modules/zoiko-hr/onboarding/OnboardingSubmissions.jsx?t=${Math.random()}`);
  const msgs = { success: [], error: [] };
  render(React.createElement(Submissions, { records: [], onSuccess: (m) => msgs.success.push(m), onError: (m) => msgs.error.push(m) }));
  await settle();
  return { calls, msgs };
}
const rows = () => [...document.querySelectorAll('[data-testid="submission-row"]')];

test("the list shows hire name and position, and puts Needs review first", async (t) => {
  await loadSubmissions(t);
  const r = rows();
  assert.equal(r.length, 3);
  assert.match(r[0].textContent, /Raj Patel/);
  assert.match(r[0].textContent, /Engineer/);
  assert.match(r[0].textContent, /Needs review/);
  assert.match(r.map((x) => x.textContent).join("|"), /Ann Lee/);
  assert.match(r.find((x) => /NDA/.test(x.textContent)).textContent, /Details changed – reissue/);
  assert.match(r.find((x) => /ID proof/.test(x.textContent)).textContent, /Hana HR/);
});

test("filters go to the server; the detail panel masks answers until Reveal, then rejects with a reason", async (t) => {
  const { calls, msgs } = await loadSubmissions(t);
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "form" } });
  await settle();
  assert.deepEqual(calls.list.at(-1), { hireId: "", status: "", type: "form" });
  assert.equal(rows().length, 1);
  fireEvent.click(rows()[0]);
  await settle();
  const panel = () => screen.getByRole("dialog");
  assert.match(panel().textContent, /\*\*\*\*5678/);
  assert.match(panel().textContent, /Version 1/);
  assert.match(panel().textContent, /Blurry/);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  await settle();
  assert.deepEqual(calls.detail.at(-1), [2, true]);
  assert.match(panel().textContent, /12345678/);
  fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
  await settle();
  assert.equal(calls.opened[2], "preview");
  fireEvent.click(screen.getByRole("button", { name: /Download all \(ZIP\)/ }));
  await settle();
  assert.deepEqual(calls.zip, [8]);
  fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Enter a reason/);
  assert.equal(calls.review.length, 0);
  fireEvent.change(document.getElementById("sub-reject-reason"), { target: { value: "Wrong account" } });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  assert.deepEqual(calls.review, [[2, "reject", "Wrong account"]]);
  assert.match(msgs.success.at(-1), /rejected/);
});

test("Reveal is offered only when the server allows it", async (t) => {
  await loadSubmissions(t, { canReveal: false });
  fireEvent.click(rows()[0]);
  await settle();
  assert.equal(screen.queryByRole("button", { name: "Reveal" }), null);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await settle();
});

// ── the new hire's portal ────────────────────────────────────────────────────────────────────────────────────────
const MY_DOCS = [
  { id: 11, title: "Offer Letter", status: "approved", status_label: "Signed", can_preview: true, can_download: true, can_resubmit: false },
  { id: 12, title: "Bank details", status: "pending", status_label: "Submitted – HR to review", can_preview: true, can_download: true },
  { id: 13, title: "ID proof", status: "rejected", status_label: "Returned", rejection_reason: "Photo is blurry", can_preview: true,
    can_download: true, can_resubmit: true },
];

test("My documents: status chips, Preview and Download, ZIP, and a resubmit for a returned item", async (t) => {
  const calls = { file: [], zip: 0, upload: [] };
  t.mock.module("../src/service/hrService.js", { exports: {
    getPortalMyDocuments: async () => MY_DOCS,
    getPortalMyDocumentFile: async (tok, id, dl) => { calls.file.push([tok, id, dl]); return { blob: new Blob(["%PDF"]), filename: `${id}.pdf` }; },
    getPortalMyDocumentsZip: async () => { calls.zip += 1; return { blob: new Blob(["x"]), filename: "mine.zip" }; },
    uploadPortalDocument: async (tok, id, file) => { calls.upload.push([tok, id, file.name]); return { documents: [] }; },
  } });
  t.mock.module("../src/utils/fileViewer.js", { exports: { openFile: (...a) => { calls.opened = a; } } });
  const { default: MyDocs } = await import(`../src/components/documents/PortalMyDocuments.jsx?t=${Math.random()}`);
  const updated = [];
  render(React.createElement(MyDocs, { token: "tok", onUpdated: (v, m) => updated.push(m), onError: () => {} }));
  await settle();
  const chips = [...document.querySelectorAll('[data-testid="my-doc-status"]')].map((c) => c.textContent);
  assert.deepEqual(chips, ["Signed", "Submitted – HR to review", "Returned"]);
  assert.match(document.body.textContent, /Returned by HR: Photo is blurry/);
  assert.equal(screen.getAllByRole("button", { name: /^Resubmit/ }).length, 1, "only the returned item can be resubmitted");

  fireEvent.click(screen.getByRole("button", { name: "Preview Offer Letter" }));
  await settle();
  assert.deepEqual(calls.file.at(-1), ["tok", 11, false]);
  assert.equal(calls.opened[2], "preview");
  fireEvent.click(screen.getByRole("button", { name: "Download Offer Letter" }));
  await settle();
  assert.deepEqual(calls.file.at(-1), ["tok", 11, true]);
  assert.equal(calls.opened[2], "download");
  fireEvent.click(screen.getByRole("button", { name: /Download all \(ZIP\)/ }));
  await settle();
  assert.equal(calls.zip, 1);

  fireEvent.click(screen.getByRole("button", { name: "Resubmit ID proof" }));
  await settle();
  fireEvent.change(screen.getByLabelText("New file for ID proof"), { target: { files: [new File(["x"], "id.png")] } });
  fireEvent.click(screen.getByRole("button", { name: /Upload again/ }));
  await settle();
  assert.deepEqual(calls.upload, [["tok", 13, "id.png"]]);
  assert.match(updated.at(-1), /ID proof uploaded again/);
});
