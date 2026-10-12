/** ZHR-95: an employee can submit an expense claim, sees it listed, and is told what is wrong field by field. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateExpenseForm, expensePayload, serverExpenseErrors, formatClaimAmount } from "../src/utils/travelExpenseForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("each box is checked and the payload is what the server expects", () => {
  const ok = { tripId: "", category: "Hotel", amount: "4500.50", description: "Two nights in Pune" };
  assert.deepEqual(validateExpenseForm(ok), {});
  assert.deepEqual(expensePayload({ ...ok, tripId: "7", description: "  Two   nights " }), { expense_type: "Hotel", amount: "4500.50", description: "Two nights", currency: "INR", request_id: 7 });
  assert.match(validateExpenseForm({ ...ok, amount: "" }).amount, /Enter the amount/);
  assert.match(validateExpenseForm({ ...ok, amount: "0" }).amount, /more than zero/);
  assert.match(validateExpenseForm({ ...ok, amount: "-3" }).amount, /as a number/);
  assert.match(validateExpenseForm({ ...ok, amount: "1.234" }).amount, /2 decimal/);
  assert.match(validateExpenseForm({ ...ok, amount: "99999999" }).amount, /too large/);
  assert.match(validateExpenseForm({ ...ok, description: " " }).description, /Describe/);
  assert.match(validateExpenseForm({ ...ok, category: "Yacht" }).category, /category/);
  assert.equal(formatClaimAmount("4500.5", "INR"), "₹4,500.50");
  assert.equal(serverExpenseErrors({ validation: [{ loc: ["body", "amount"], msg: "Value error, The amount must be more than zero." }] }).fieldErrors.amount, "The amount must be more than zero.");
  assert.match(serverExpenseErrors({ message: "Choose one of your own trips for this claim, or leave the trip empty." }).fieldErrors.tripId, /own trips/);
});

async function load(t, { create } = {}) {
  const calls = [];
  let claims = [];
  t.mock.module("../src/service/employee.js", { exports: {
    getTravelExpenses: async () => claims,
    getTravel: async () => [{ id: 7, destination: "Pune", start_date: "2030-01-02", status: "approved" }],
    createTravelExpense: create || (async (p) => { calls.push(p); claims = [{ id: 31, expense_type: p.expense_type, amount: p.amount, currency: "INR", description: p.description, request_id: p.request_id, status: "pending", created_at: "2026-10-08T10:00:00" }]; return {}; }),
  } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }) } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Travel/Employee_TravelExpenses.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Claim Expense/ }));
  return calls;
}
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("a valid claim is submitted, the form closes and the claim appears in the list", async (t) => {
  const calls = await load(t);
  type("te-trip", "7"); type("te-category", "Cab"); type("te-amount", "850"); type("te-description", "Airport cab");
  fireEvent.click(screen.getByRole("button", { name: "Submit Claim" }));
  await settle();
  assert.deepEqual(calls, [{ expense_type: "Cab", amount: "850", description: "Airport cab", currency: "INR", request_id: 7 }]);
  assert.match(document.body.textContent, /submitted successfully/);
  assert.match(document.body.textContent, /₹850\.00/);
  assert.match(document.body.textContent, /Pune/);
  assert.equal(document.getElementById("te-amount"), null, "form closed");
});

test("an incomplete claim is refused with a message under each box and nothing is sent", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Submit Claim" }));
  await settle();
  assert.equal(calls.length, 0);
  assert.match(document.body.textContent, /Enter the amount/);
  assert.match(document.body.textContent, /Describe what the expense was for/);
  assert.equal(document.getElementById("te-amount").getAttribute("aria-invalid"), "true");
});

test("a server failure is shown in the form and the typed claim is kept", async (t) => {
  await load(t, { create: async () => { throw new Error("Something went wrong on the server."); } });
  type("te-amount", "500"); type("te-description", "Lunch with client");
  fireEvent.click(screen.getByRole("button", { name: "Submit Claim" }));
  await settle();
  assert.match(document.body.textContent, /Something went wrong on the server/);
  assert.equal(document.getElementById("te-description").value, "Lunch with client");
});
