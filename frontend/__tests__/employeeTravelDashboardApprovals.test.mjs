/** Bugs 22/23: the employee travel Dashboard and Approvals counted travel requests only, so a submitted, approved or
 * rejected expense claim never changed "Pending Approval" / "Expenses Claimed" or the Approved/Pending/Rejected cards. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const TRIPS = [
  { id: 9, destination: "delhi", purpose: "client meeting", status: "approved", created_at: "2026-11-24T09:40:00Z" },
  { id: 10, destination: "Mumbai", purpose: "meeting", status: "approved", created_at: "2026-11-24T09:50:00Z" },
  { id: 11, destination: "Mumbai", purpose: "meeting", status: "rejected", created_at: "2026-11-24T09:56:00Z" },
];

async function show(t, page, claims) {
  const asked = [];
  t.mock.module("../src/service/employee.js", { exports: {
    getTravel: async (id) => { asked.push(["travel", id]); return TRIPS; },
    getTravelExpenses: async (id) => { asked.push(["expenses", id]); return claims; },
  } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }) } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/components/employee/StatCard.jsx", { exports: {
    default: ({ label, value }) => React.createElement("div", { "data-stat": label }, String(value)),
  } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Travel/${page}.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return asked;
}
const stat = (label) => document.querySelector(`[data-stat="${label}"]`)?.textContent;

test("a pending expense claim counts as pending approval and its amount as claimed", async (t) => {
  const asked = await show(t, "Employee_TravelDashboard", [
    { id: 5, request_id: 10, expense_type: "Flight", amount: "20000", currency: "INR", status: "approved" },
    { id: 6, request_id: 9, expense_type: "Hotel", amount: "30000", currency: "INR", status: "submitted" },
  ]);
  assert.deepEqual(asked, [["travel", 5], ["expenses", 5]]);
  assert.equal(stat("Pending Approval"), "1");
  assert.equal(stat("Expenses Claimed"), "₹50,000.00");
  assert.match(document.body.textContent, /Recent Expense Claims/);
});

test("a rejected expense claim leaves pending, drops out of the claimed total and shows as rejected", async (t) => {
  await show(t, "Employee_TravelDashboard", [
    { id: 5, request_id: 10, expense_type: "Flight", amount: "20000", currency: "INR", status: "approved" },
    { id: 6, request_id: 9, expense_type: "Hotel", amount: "30000", currency: "INR", status: "rejected" },
  ]);
  assert.equal(stat("Pending Approval"), "0");
  assert.equal(stat("Expenses Claimed"), "₹20,000.00");
  assert.match(document.body.textContent, /Hotel · ₹30,000\.00.*Rejected/s);
});

test("approvals count expense claims with travel requests", async (t) => {
  await show(t, "Employee_TravelApprovals", [
    { id: 5, request_id: 10, expense_type: "Flight", amount: "20000", currency: "INR", status: "approved", created_at: "2026-11-24T10:00:00Z" },
    { id: 6, request_id: 9, expense_type: "Hotel", amount: "30000", currency: "INR", status: "rejected", created_at: "2026-11-24T10:05:00Z" },
    { id: 7, expense_type: "Meals", amount: "900", currency: "INR", status: "submitted", created_at: "2026-11-24T10:10:00Z" },
  ]);
  assert.equal(stat("Approved"), "3");   // two trips + one claim
  assert.equal(stat("Rejected"), "2");   // one trip + one claim
  assert.equal(stat("Pending"), "1");    // the submitted claim
  assert.match(document.body.textContent, /EXP-6.*Hotel · ₹30,000\.00 \(delhi\).*Expense claim/s);
});
