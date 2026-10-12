/** ZHR-98: the admin Travel Expenses page loads the claims, shows each in its own currency, and lets HR decide them. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { formatMoney, claimState, totalsByCurrency, categoryTotals } from "../src/utils/travelExpenseAdmin.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("money is per currency and totals are never mixed", () => {
  assert.equal(formatMoney(4500.5, "INR"), "₹4,500.50");
  assert.equal(claimState("completed"), "reimbursed");
  const claims = [
    { amount: "100", currency: "INR", status: "pending", expense_type: "Hotel" },
    { amount: "50", currency: "INR", status: "approved", expense_type: "Cab" },
    { amount: "20", currency: "USD", status: "pending", expense_type: "Cab" },
    { amount: "9", currency: "INR", status: "rejected", expense_type: "Meals" },
  ];
  assert.deepEqual(totalsByCurrency(claims, ["pending"]), [{ currency: "INR", amount: 100 }, { currency: "USD", amount: 20 }]);
  assert.deepEqual(totalsByCurrency(claims, ["pending", "approved", "reimbursed"]).map((l) => l.currency), ["INR", "USD"]);
  assert.deepEqual(categoryTotals(claims.filter((c) => c.currency === "INR")).map((c) => c.label), ["Hotel", "Cab", "Meals"]);
  assert.ok(categoryTotals(claims).every((c) => /\((INR|USD)\)$/.test(c.label)), "mixed currencies are kept apart");
});

const CLAIMS = [
  { id: 2, employee_name: "Ann Lee", expense_type: "Hotel", description: "Two nights in Pune", amount: "4500.50", currency: "INR", status: "pending", request_id: null, created_at: "2026-10-08T10:00:00" },
  { id: 1, employee_name: "Raj Kumar", expense_type: "Cab", amount: "850", currency: "INR", status: "approved", request_id: 3, created_at: "2026-10-07T10:00:00" },
];

async function load(t, { get, put } = {}) {
  const calls = { put: [], get: 0 };
  let list = CLAIMS.map((c) => ({ ...c }));
  const api = {
    get: get || (async () => { calls.get++; return list; }),
    put: put || (async (url, body) => { calls.put.push([url, body]); list = list.map((c) => (`/hr/travel-expenses/${c.id}` === url ? { ...c, status: body.status } : c)); return {}; }),
  };
  t.mock.module("../src/service/api.js", { exports: { api } });
  t.mock.module("../src/modules/zoiko-hr/travel/TravelLayout.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/travel/expenses.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("claims load with names, descriptions and rupee amounts, and no dollar sign", async (t) => {
  await load(t);
  const text = document.body.textContent;
  assert.match(text, /Ann Lee/);
  assert.match(text, /Two nights in Pune/);
  assert.match(text, /₹4,500\.50/);
  assert.doesNotMatch(text, /\$/);
  assert.match(text, /Total Claimed/);
});

test("a server error shows its message with a Retry that reloads", async (t) => {
  let fail = true;
  const calls = await load(t, { get: async () => { if (fail) throw new Error("The server could not load the claims."); return CLAIMS; } });
  assert.match(document.body.textContent, /could not load the claims/);
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
  await settle();
  assert.match(document.body.textContent, /Ann Lee/);
});

test("approving a pending claim sends the decision, reloads, and offers reimbursement next", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await settle();
  assert.deepEqual(calls.put, [["/hr/travel-expenses/2", { status: "approved" }]]);
  assert.match(document.body.textContent, /Claim approved/);
  assert.equal(screen.getAllByRole("button", { name: "Mark reimbursed" }).length, 2);
  assert.equal(screen.queryByRole("button", { name: "Approve" }), null);
});

test("a refused decision is shown as an error", async (t) => {
  await load(t, { put: async () => { throw new Error("This claim is already approved; it has been decided and cannot be decided again."); } });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await settle();
  assert.match(document.body.querySelector("[role=alert]").textContent, /already approved/);
});
