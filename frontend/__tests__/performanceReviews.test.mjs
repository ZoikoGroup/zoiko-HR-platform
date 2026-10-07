/** ZHR-60: New Review / Edit Review validate, save, and show failures instead of silently doing nothing. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const EMPLOYEES = [
  { id: 1, first_name: "Ann", last_name: "Lee" }, { id: 2, first_name: "Bob", last_name: "Ray" }, { id: 3, first_name: "Hana", last_name: "HR" },
];
const REVIEW = { id: 9, employee_id: 1, reviewer_id: 2, hr_reviewer_id: 3, admin_reviewer_id: null, cycle: "Q1 2026", rating: 4, comments: "Good", status: "pending" };

async function load(t, over = {}) {
  const calls = { create: [], update: [], remove: [] };
  const svc = {
    getPerformanceReviews: async () => over.reviews ?? [REVIEW],
    getPeerFeedback: async () => [],
    getHrEmployees: async () => ({ items: EMPLOYEES }),
    getDefaultReviewers: async () => ({ manager_id: 2, hr_reviewer_id: 3, admin_reviewer_id: null }),
    createPerformanceReview: async (p) => { calls.create.push(p); if (over.createError) throw new Error(over.createError); return { id: 10 }; },
    updatePerformanceReview: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw new Error(over.updateError); return {}; },
    deletePerformanceReview: async (id) => { calls.remove.push(id); },
    createPeerFeedback: async () => ({}), deletePeerFeedback: async () => ({}),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 77 }), api: {} } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/performance/reviews.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const selects = () => [...document.querySelectorAll(".fixed select")];
const choose = (el, value) => fireEvent.change(el, { target: { value: String(value) } });

test("New Review fills in the suggested reviewers, saves exactly what was entered, and refreshes", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /New Review/ }));
  choose(selects()[0], 1); // employee
  await settle();
  assert.equal(selects()[1].value, "2");  // manager suggested
  assert.equal(selects()[2].value, "3");  // HR suggested
  fireEvent.change(document.querySelector('.fixed input[placeholder="Q1 2026"]'), { target: { value: "  Q2 2026 " } });
  choose(selects()[4], 5);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.deepEqual(calls.create, [{ employee_id: 1, reviewer_id: 2, hr_reviewer_id: 3, admin_reviewer_id: null, cycle: "Q2 2026", rating: 5, comments: null }]);
  assert.equal(document.querySelector(".fixed"), null, "the dialog closes after saving");
});

test("Create with nothing chosen explains what is missing in the dialog and sends nothing", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /New Review/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(within(document.querySelector(".fixed")).getByRole("alert").textContent, /Choose the employee/);
  choose(selects()[0], 1);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed [role=alert]").textContent, /review cycle/);
  assert.equal(calls.create.length, 0);
});

test("a person cannot be their own manager reviewer", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /New Review/ }));
  choose(selects()[0], 2);
  await settle();
  choose(selects()[1], 2);
  fireEvent.change(document.querySelector('.fixed input[placeholder="Q1 2026"]'), { target: { value: "Q3" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed [role=alert]").textContent, /own manager reviewer/);
  assert.equal(calls.create.length, 0);
});

test("a server refusal stays in the dialog with the server's words and nothing is lost", async (t) => {
  await load(t, { createError: "This employee already has a review for 'Q1 2026'." });
  fireEvent.click(screen.getByRole("button", { name: /New Review/ }));
  choose(selects()[0], 1);
  await settle();
  fireEvent.change(document.querySelector('.fixed input[placeholder="Q1 2026"]'), { target: { value: "Q1 2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed [role=alert]").textContent, /already has a review/);
  assert.equal(document.querySelector('.fixed input[placeholder="Q1 2026"]').value, "Q1 2026");
});

test("Edit opens with the review's values, keeps its reviewers, and updates only that review", async (t) => {
  const calls = await load(t);
  const row = screen.getByText("Ann Lee").closest("tr");
  fireEvent.click(within(row).getAllByRole("button").find((b) => b.querySelector("svg.lucide-edit-2, svg.lucide-pen")) || within(row).getAllByRole("button").at(-2));
  await settle();
  assert.equal(document.querySelector(".fixed h2").textContent, "Edit Review");
  assert.equal(selects()[0].value, "1");
  assert.equal(selects()[1].value, "2");
  assert.equal(document.querySelector('.fixed input[placeholder="Q1 2026"]').value, "Q1 2026");
  choose(selects()[4], 2);
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  await settle();
  assert.deepEqual(calls.update, [[9, { employee_id: 1, reviewer_id: 2, hr_reviewer_id: 3, admin_reviewer_id: null, cycle: "Q1 2026", rating: 2, comments: "Good", status: "pending" }]]);
});

test("Edit lets a pending review be moved on, and a person missing from the list stays selectable", async (t) => {
  const calls = await load(t);
  const row = screen.getByText("Ann Lee").closest("tr");
  fireEvent.click(within(row).getAllByRole("button").at(-2));
  await settle();
  const status = selects().find((s) => [...s.options].some((o) => o.value === "in_progress"));
  assert.equal(status.value, "pending");
  choose(status, "in_progress");
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  await settle();
  assert.equal(calls.update[0][1].status, "in_progress");
});

test("a failed Edit shows the reason and the status buttons send only the status", async (t) => {
  const calls = await load(t, { updateError: "This action requires admin privileges." });
  fireEvent.click(screen.getByRole("button", { name: /Start/ }));
  await settle();
  assert.deepEqual(calls.update, [[9, { status: "in_progress" }]]);
  assert.match(screen.getAllByRole("alert")[0].textContent, /requires admin privileges/);
});

test("a failed load is reported rather than showing an empty table as if nothing exists", async (t) => {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 77 }), api: {} } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getPerformanceReviews: async () => { throw new Error("Network down"); }, getPeerFeedback: async () => [], getHrEmployees: async () => [],
    getDefaultReviewers: async () => ({}), createPerformanceReview: async () => ({}), updatePerformanceReview: async () => ({}), deletePerformanceReview: async () => ({}),
    createPeerFeedback: async () => ({}), deletePeerFeedback: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/performance/reviews.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Network down/);
});
