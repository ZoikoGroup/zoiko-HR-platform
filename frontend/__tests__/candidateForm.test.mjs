/** ZHR-64: Add / Edit Candidate shows clear field-level messages, never technical validation text. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateCandidateForm, serverFieldErrors, candidatePayload } from "../src/utils/candidateForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const GOOD = { name: "Ann Lee", email: "ann@x.com", phone: "", position: "Engineer", status: "applied", source: "referral", location: "", experience: "", resume_link: "", notes: "", requisition_id: "" };

test("an empty form says which fields are required, in plain words", () => {
  const e = validateCandidateForm({ ...GOOD, name: "", email: "", position: "  " });
  assert.deepEqual(e, { name: "Name is required.", email: "Email is required.", position: "Position is required." });
});

test("invalid values get a specific message", () => {
  const e = validateCandidateForm({ ...GOOD, email: "ann@", phone: "12345", experience: "99", resume_link: "abc" });
  assert.match(e.email, /valid email/);
  assert.match(e.phone, /10-digit/);
  assert.match(e.experience, /between 0 and 60/);
  assert.match(e.resume_link, /http/);
  assert.deepEqual(validateCandidateForm({ ...GOOD, experience: "2.5" }), { experience: "Experience must be a whole number of years." });
  assert.deepEqual(validateCandidateForm(GOOD), {});
  assert.deepEqual(validateCandidateForm({ ...GOOD, phone: "+91 98765 43210", resume_link: "https://x.com/cv.pdf", experience: "0" }), {});
});

test("the server's technical 422 text is turned into field messages", () => {
  const out = serverFieldErrors([
    { loc: ["body", "name"], msg: "Field required", type: "missing" },
    { loc: ["body", "email"], msg: "Value error, Enter a valid email address, for example name@company.com." },
    { loc: ["body", "experience"], msg: "Input should be less than or equal to 60" },
    { loc: ["body", "phone"], msg: "String should have at most 50 characters" },
  ]);
  assert.equal(out.name, "Name is required.");
  assert.equal(out.email, "Enter a valid email address, for example name@company.com.");
  assert.equal(out.experience, "Experience must be 60 or less.");
  assert.equal(out.phone, "Phone can be at most 50 characters.");
  assert.deepEqual(serverFieldErrors("nope"), {});
});

test("the payload is trimmed and empty optional fields become null", () => {
  assert.deepEqual(candidatePayload({ ...GOOD, name: "  Ann   Lee ", experience: "3", requisition_id: "4", notes: " " }), {
    name: "Ann Lee", email: "ann@x.com", position: "Engineer", phone: null, status: "applied", source: "referral",
    location: null, experience: 3, resume_link: null, notes: null, requisition_id: 4,
  });
});

async function load(t, over = {}) {
  const calls = { create: [] };
  const svc = {
    getCandidates: async () => ({ items: [] }), getCandidateById: async () => null, getRequisitions: async () => ({ items: [] }),
    createCandidate: async (p) => { calls.create.push(p); if (over.createError) throw over.createError; return {}; },
    updateCandidate: async () => ({}), deleteCandidate: async () => ({}), updateCandidateStatus: async () => ({}),
  };
  t.mock.module("react-router-dom", { exports: {
    NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children),
    useParams: () => ({}), useSearchParams: () => [new URLSearchParams()],
  } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/candidates.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("Add with nothing entered shows field messages in the dialog and sends nothing", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /Add Candidate/ }));
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /Name is required\./);
  assert.match(text, /Email is required\./);
  assert.match(text, /Position is required\./);
  assert.doesNotMatch(text, /Field required|Value error|Input should/);
  assert.equal(calls.create.length, 0);
  fireEvent.change(document.getElementById("cand-name"), { target: { value: "Ann" } });
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Name is required/);
});

test("a server refusal appears under its own field and the page behind it stays", async (t) => {
  const err = Object.assign(new Error("email: Value error"), { validation: [{ loc: ["body", "email"], msg: "Value error, Enter a valid email address, for example name@company.com." }] });
  const calls = await load(t, { createError: err });
  fireEvent.click(screen.getByRole("button", { name: /Add Candidate/ }));
  fireEvent.change(document.getElementById("cand-name"), { target: { value: "Ann Lee" } });
  fireEvent.change(document.getElementById("cand-email"), { target: { value: "ann@x.com" } });
  fireEvent.change(document.getElementById("cand-position"), { target: { value: "Engineer" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.match(document.querySelector(".fixed").textContent, /Enter a valid email address/);
  assert.ok(screen.getByRole("heading", { name: "Candidates" }), "the list page is still there");
});

// ── ZHR-65: what was entered is shown
import { experienceText, shown, sourceLabel, candidateCsv, candidateTimeline } from "../src/utils/candidateDisplay.js";

const CAND = { id: 5, name: "Ann Lee", email: "ann@x.com", phone: "+919876543210", position: "Engineer", location: "Pune", experience: 5, source: "linkedin", status: "applied", resume_link: "https://x.com/cv.pdf", notes: "Strong", applied_at: "2026-10-01T10:00:00Z", requisition_title: null };

test("display helpers show what was entered, including 0 years", () => {
  assert.equal(experienceText(5), "5 yrs");
  assert.equal(experienceText(1), "1 yr");
  assert.equal(experienceText(0), "0 yrs");
  assert.equal(experienceText(null), "-");
  assert.equal(shown("  "), "-");
  assert.equal(shown("Pune"), "Pune");
  assert.equal(sourceLabel("company_website"), "Company Website");
  assert.equal(candidateCsv(["A", "B"], [['say "hi"', 0]]), '"A","B"\n"say ""hi""","0"');
  assert.equal(candidateTimeline(CAND)[0].description, "Applied for Engineer");
});

test("the candidates list shows phone, location and experience for each candidate", async (t) => {
  const svc = {
    getCandidates: async () => ({ items: [CAND, { ...CAND, id: 6, name: "Bo Fresh", email: "bo@x.com", phone: null, location: null, experience: 0 }] }),
    getCandidateById: async () => null, getRequisitions: async () => ({ items: [] }),
    createCandidate: async () => ({}), updateCandidate: async () => ({}), deleteCandidate: async () => ({}), updateCandidateStatus: async () => ({}),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children), useParams: () => ({}), useSearchParams: () => [new URLSearchParams()] } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/candidates.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  const headers = [...document.querySelectorAll("thead th")].map((h) => h.textContent);
  for (const h of ["Phone", "Location", "Experience"]) assert.ok(headers.includes(h), h);
  const rows = [...document.querySelectorAll("tbody tr")].map((r) => r.textContent);
  assert.match(rows[0], /\+919876543210/);
  assert.match(rows[0], /Pune/);
  assert.match(rows[0], /5 yrs/);
  assert.match(rows[0], /LinkedIn/);
  assert.match(rows[1], /0 yrs/);
});

test("the candidate record shows every detail that was entered", async (t) => {
  const svc = {
    getCandidates: async () => ({ items: [] }), getCandidateById: async () => CAND, getRequisitions: async () => ({ items: [] }),
    createCandidate: async () => ({}), updateCandidate: async () => ({}), deleteCandidate: async () => ({}), updateCandidateStatus: async () => ({}),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children), useParams: () => ({ id: "5" }), useSearchParams: () => [new URLSearchParams()] } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/candidates.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  const text = document.body.textContent;
  for (const want of ["ann@x.com", "+919876543210", "Pune", "5 yrs", "LinkedIn", "View resume", "Strong"]) assert.ok(text.includes(want), want);
  assert.doesNotMatch(text, /No activity recorded/);
  // opening Edit shows the saved values
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  assert.equal(document.getElementById("cand-phone").value, "+919876543210");
  assert.equal(document.getElementById("cand-location").value, "Pune");
  assert.equal(document.getElementById("cand-exp").value, "5");
});
