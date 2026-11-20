/** Onboarding › Checklists shows only the status of the 10 onboarding documents for each new hire (2026-11-17). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const DOCS = ["offer_letter", "employment_contract", "nda", "ip_assignment", "code_of_conduct", "privacy_notice", "self_disclosure",
  "job_application", "role_profile", "handbook_ack"].map((category, i) => ({ category, title: `Document ${i + 1}`, mode: "SIGN", mode_label: "E-signature" }));
const states = (list) => Object.fromEntries(DOCS.map((d, i) => [d.category, { state: list[i] || "not_sent" }]));
const BOARD = {
  documents: DOCS,
  totals: { completed: 11, awaiting_signature: 2, needs_review: 1, not_sent: 6 },
  hires: [
    { new_hire_id: 10, candidate_name: "Asha Rao", position: "Designer", status: "in_progress", joining_date: "2026-12-01", done: 10,
      counts: { completed: 10 }, documents: states(Array(10).fill("completed")) },
    { new_hire_id: 11, candidate_name: "Ravi Iyer", position: "Engineer", status: "pre_joining", joining_date: null, done: 1,
      counts: { completed: 1, awaiting_signature: 2, needs_review: 1, not_sent: 6 },
      documents: states(["completed", "awaiting_signature", "awaiting_signature", "needs_review"]) },
  ],
};

async function load(t, board = BOARD) {
  const calls = [];
  t.mock.module("react-router-dom", { exports: {
    NavLink: ({ children, to, className }) => React.createElement("a", { href: to, className: typeof className === "function" ? className({ isActive: false }) : className },
      typeof children === "function" ? children({ isActive: false }) : children),
  } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getPackageStatusBoard: async (all) => { calls.push(all); return board; },
    getRecruitmentInsights: async () => null,
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/checklists.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("every new hire's 10 documents are listed with their state, and nothing about checklist templates", async (t) => {
  const calls = await load(t);
  assert.deepEqual(calls, [false]);                                         // one request for the whole board
  assert.ok(screen.getAllByText("Asha Rao").length >= 1);
  assert.ok(screen.getAllByRole("img", { name: "Document 2: Awaiting signature" }).length >= 1);
  assert.ok(screen.getAllByRole("img", { name: "Document 4: Needs your review" }).length >= 1);
  assert.ok(screen.getAllByRole("img", { name: "Document 10: Not sent" }).length >= 1);
  assert.equal(screen.queryByText(/Assign Checklist|New Template|Checklist templates/), null);
  const link = screen.getAllByRole("link").find((a) => a.textContent.includes("Ravi Iyer"));
  assert.equal(link.getAttribute("href"), "/zoiko-hr/onboarding/new-hires?open=11");
});

test("filters narrow the list and the completed hires are one choice away", async (t) => {
  const calls = await load(t);
  fireEvent.change(screen.getByLabelText("Documents"), { target: { value: "attention" } });
  assert.equal(screen.queryAllByText("Asha Rao").length, 0);
  assert.ok(screen.getAllByText("Ravi Iyer").length >= 1);
  fireEvent.change(screen.getByLabelText("New hires"), { target: { value: "all" } });
  await settle();
  assert.deepEqual(calls, [false, true]);
});

test("an empty organisation says so", async (t) => {
  await load(t, { documents: DOCS, hires: [], totals: {} });
  assert.ok(screen.getByText("No new hires being onboarded"));
});
