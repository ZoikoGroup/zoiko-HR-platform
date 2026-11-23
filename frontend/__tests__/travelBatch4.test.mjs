/** Travel audit, fix batch 4: confirmed Reject and Delete with the server's refusal shown (T13, T15), a reload after each
 *  action (T15), the "awaiting second approval" state (T16) and dark-mode classes (T17). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const layout = { default: ({ children }) => React.createElement("div", null, children) };

async function mount(t, file, api) {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, children) } });
  t.mock.module("../src/modules/zoiko-hr/travel/TravelLayout.jsx", { exports: layout });
  t.mock.module("../src/service/api.js", { exports: { api } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/travel/${file}?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

function withConfirm(t, answer) {
  const asked = [];
  const prev = window.confirm;
  window.confirm = (msg) => { asked.push(msg); return answer; };
  t.after(() => { window.confirm = prev; });
  return asked;
}

const TRIP = { id: 7, employee_id: 5, employee_name: "Ann Lee", destination: "Goa", status: "pending", start_date: "2026-12-01", end_date: "2026-12-03" };

test("Reject on Approvals asks first; saying no sends nothing", async (t) => {
  const asked = withConfirm(t, false);
  const puts = [];
  await mount(t, "approvals.jsx", {
    get: async (p) => (p.startsWith("/hr/travel") ? { items: [TRIP], total: 1, page: 1, per_page: 25 } : { items: [] }),
    put: async (...a) => { puts.push(a); return {}; },
  });
  fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
  await settle();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /Reject the trip to Goa for Ann Lee/);
  assert.equal(puts.length, 0);
});

test("a confirmed Reject is sent and the list is reloaded from the server", async (t) => {
  withConfirm(t, true);
  let status = "pending";
  let gets = 0;
  await mount(t, "approvals.jsx", {
    get: async (p) => {
      if (!p.startsWith("/hr/travel")) return { items: [] };
      gets++;
      return { items: [{ ...TRIP, status }], total: 1, page: 1, per_page: 25 };
    },
    put: async (url, body) => { status = body.status; return {}; },
  });
  const before = gets;
  fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
  await settle();
  assert.ok(gets > before, "reloaded after the action");
  assert.match(screen.getByRole("status").textContent, /rejected/);
  assert.match(document.querySelector("tbody").textContent, /rejected/);
  assert.match(document.querySelector("tbody").textContent, /Processed/);
});

test("Delete on Travel Requests asks first and shows the server's refusal naming the claims", async (t) => {
  const asked = withConfirm(t, true);
  const deletes = [];
  await mount(t, "travel-requests.jsx", {
    get: async (p) => (p.startsWith("/hr/travel") ? { items: [TRIP], total: 1, page: 1, per_page: 25 } : { items: [] }),
    delete: async (url) => { deletes.push(url); throw new Error("This trip has 1 expense claim (EXP-00003), so it cannot be deleted. Cancel the trip instead; its claims stay on record."); },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  assert.equal(asked.length, 1);
  assert.deepEqual(deletes, ["/hr/travel/7"]);
  assert.match(screen.getByRole("alert").textContent, /EXP-00003/);
  assert.match(document.querySelector("tbody").textContent, /Goa/);
});

test("Delete that is not confirmed sends nothing", async (t) => {
  withConfirm(t, false);
  const deletes = [];
  await mount(t, "travel-requests.jsx", {
    get: async (p) => (p.startsWith("/hr/travel") ? { items: [TRIP], total: 1, page: 1, per_page: 25 } : { items: [] }),
    delete: async (url) => { deletes.push(url); return {}; },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  assert.equal(deletes.length, 0);
});

const CLAIM = { id: 3, employee_name: "Ann Lee", expense_type: "Hotel", amount: "500", currency: "INR", status: "in_progress",
  awaiting_second_approval: true, first_approver_id: 2, first_approver_name: "Hari HR" };

test("a claim with its first of two approvals shows that, and the first approver gets no Approve button", async (t) => {
  await mount(t, "expenses.jsx", {
    get: async () => ({ items: [{ ...CLAIM, first_approved_by_me: true }], total: 1, page: 1, per_page: 25, totals: {} }),
    put: async () => ({}),
  });
  const text = document.body.textContent;
  assert.match(text, /Awaiting 2nd approval/);
  assert.match(text, /You gave the first approval; a different approver must give the second/);
  assert.equal(screen.queryByRole("button", { name: /Approve|2nd approval/ }), null);
  assert.ok(screen.getByRole("button", { name: "Reject" }));
});

test("another approver sees 'Give 2nd approval', and the first approval message is distinct", async (t) => {
  await mount(t, "expenses.jsx", {
    get: async () => ({ items: [{ ...CLAIM, first_approved_by_me: false }], total: 1, page: 1, per_page: 25, totals: {} }),
    put: async () => ({ ...CLAIM, status: "approved", awaiting_second_approval: false }),
  });
  assert.ok(screen.getByRole("button", { name: "Give 2nd approval" }));
  assert.equal(document.querySelector("[title]").getAttribute("title"), "First approved by Hari HR");
});

test("a first approval tells the approver a second one is needed", async (t) => {
  await mount(t, "expenses.jsx", {
    get: async () => ({ items: [{ ...CLAIM, status: "pending", awaiting_second_approval: false, first_approver_id: null }], total: 1, page: 1, per_page: 25, totals: {} }),
    put: async () => ({ ...CLAIM, first_approved_by_me: true }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await settle();
  assert.match(screen.getByRole("status").textContent, /First approval recorded/);
});

test("the travel pages carry dark-mode classes", async (t) => {
  await mount(t, "approvals.jsx", {
    get: async (p) => (p.startsWith("/hr/travel") ? { items: [TRIP], total: 1, page: 1, per_page: 25 } : { items: [] }),
    put: async () => ({}),
  });
  assert.ok(document.querySelector("[class*='dark:bg-[#1e293b]']"));
  assert.ok(document.querySelector("[class*='dark:text-white']"));
});
