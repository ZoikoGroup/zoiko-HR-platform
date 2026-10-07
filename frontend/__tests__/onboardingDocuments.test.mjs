/** ZHR-69: the Upload Document form recognises the title, category and file that were entered. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateUploadForm, serverUploadErrors, extensionOf, fileSizeText } from "../src/utils/onboardingDocForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const file = (name, size = 100) => ({ name, size });

test("the root cause: a header set to undefined is not sent, so the browser can add the multipart boundary", async () => {
  const seen = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { seen.headers = opts.headers; seen.body = opts.body; return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const { apiRequest } = await import("../src/service/api.js");
    const fd = new FormData();
    fd.append("title", "Offer");
    await apiRequest("/hr/onboarding/documents", { method: "POST", body: fd, headers: { "Content-Type": undefined } });
    assert.ok(!("Content-Type" in seen.headers), JSON.stringify(seen.headers));
    assert.ok(seen.body instanceof FormData);
    await apiRequest("/x", { method: "POST", body: { a: 1 } });
    assert.equal(seen.headers["Content-Type"], "application/json", "ordinary JSON calls keep their header");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a filled form validates, and each problem is named", () => {
  assert.deepEqual(validateUploadForm({ title: "Offer", category: "offer_letter", file: file("a.pdf") }), {});
  assert.deepEqual(validateUploadForm({ title: " ", category: "", file: null }),
    { title: "Title is required.", category: "Category is required.", file: "Choose a file to upload." });
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("run.exe") }).file, /\.exe file type is not allowed/);
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("a.pdf", 0) }).file, /empty/);
  assert.match(validateUploadForm({ title: "x", category: "nda", file: file("a.pdf", 11 * 1024 * 1024) }).file, /maximum size is 10 MB/);
  assert.match(validateUploadForm({ title: "x".repeat(201), category: "nda", file: file("a.pdf") }).title, /200/);
  assert.equal(extensionOf("Report.FINAL.PDF"), ".pdf");
  assert.equal(fileSizeText(1536), "2 KB");
});

test("the server's refusals become field messages, never a bare 'Field required'", () => {
  const out = serverUploadErrors([
    { loc: ["body", "title"], msg: "Value error, Title is required." },
    { loc: ["body", "file"], msg: "Field required" },
  ]);
  assert.equal(out.title, "Title is required.");
  assert.equal(out.file, "File is required.");
});

async function load(t, over = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getOnboardingDocuments: async () => over.docs ?? [{ id: 1, title: "NDA copy", category: "nda", status: "pending", onboarding_new_hire_id: 7, file_url: "/hr/onboarding/documents/1/file", created_at: "2026-10-01T10:00:00Z" }],
    getOnboardingRecords: async () => [{ id: 7, candidate_name: "Ann Lee" }],
    createOnboardingDocument: async (fd) => { calls.create.push(Object.fromEntries(fd.entries())); if (over.createError) throw over.createError; return {}; },
    updateOnboardingDocument: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteOnboardingDocument: async () => ({}),
    getOnboardingDocumentFile: async () => ({ blob: new Blob(["x"]), filename: "NDA copy.pdf" }),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/documents.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const open = async () => { fireEvent.click(screen.getByRole("button", { name: /Upload Document/ })); await settle(); };
const choose = (f) => fireEvent.change(document.getElementById("od-file"), { target: { files: [f] } });

test("with the title, category and file filled in, the upload is sent with all three", async (t) => {
  const calls = await load(t);
  await open();
  fireEvent.change(document.getElementById("od-title"), { target: { value: "  Signed   offer " } });
  fireEvent.change(document.getElementById("od-category"), { target: { value: "offer_letter" } });
  fireEvent.change(document.getElementById("od-record"), { target: { value: "7" } });
  choose(new File(["%PDF"], "offer.pdf", { type: "application/pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].title, "Signed offer");
  assert.equal(calls.create[0].category, "offer_letter");
  assert.equal(calls.create[0].onboarding_record_id, "7");
  assert.equal(calls.create[0].file.name, "offer.pdf");
  assert.equal(document.querySelector(".fixed"), null, "the dialog closes");
});

test("an empty form names each missing field and sends nothing; typing clears the message", async (t) => {
  const calls = await load(t);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /Title is required\./);
  assert.match(text, /Category is required\./);
  assert.match(text, /Choose a file to upload\./);
  assert.equal(calls.create.length, 0);
  fireEvent.change(document.getElementById("od-title"), { target: { value: "Offer" } });
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Title is required/);
  choose(new File(["x"], "virus.exe"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /\.exe file type is not allowed/);
});

test("a server refusal is shown under its field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "file"], msg: "Value error, File too large. Maximum size is 10MB." }] });
  await load(t, { createError: err });
  await open();
  fireEvent.change(document.getElementById("od-title"), { target: { value: "Offer" } });
  fireEvent.change(document.getElementById("od-category"), { target: { value: "nda" } });
  choose(new File(["x"], "big.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /File too large/);
});

test("the list says who each document is for, and Reject needs a reason", async (t) => {
  const calls = await load(t);
  assert.match(document.querySelector("tbody tr").textContent, /Ann Lee/);
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" }).at(-1));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Enter a reason/);
  assert.equal(calls.update.length, 0);
  fireEvent.change(document.querySelector(".fixed textarea"), { target: { value: "Blurry scan" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" }).at(-1));
  await settle();
  assert.deepEqual(calls.update, [[1, { status: "rejected", rejection_reason: "Blurry scan" }]]);
});
