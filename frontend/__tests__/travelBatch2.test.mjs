/** Travel audit, fix batch 2: server paging (T6), every role in the staff picker (T7), names on Approvals (T8),
 *  per-currency dashboard (T9) and what each travel setting does (T5). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { asPage } from "../src/utils/travelDisplay.js";

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

test("asPage reads both the paged answer and a plain list", () => {
  assert.deepEqual(asPage([{ id: 1 }], 1, 25), { items: [{ id: 1 }], total: 1, page: 1, per_page: 25 });
  const p = asPage({ items: [{ id: 2 }], total: 40, page: 2, per_page: 25 });
  assert.equal(p.total, 40);
  assert.equal(p.page, 2);
  assert.deepEqual(asPage(null).items, []);
});

test("Travel Requests asks the server for one page, shows the total, and moves to the next page", async (t) => {
  const paths = [];
  const api = {
    get: async (path) => {
      paths.push(path);
      if (path.startsWith("/hr/travel")) {
        const page = Number(new URL(path, "http://x").searchParams.get("page"));
        return { items: [{ id: page, employee_id: 5, employee_name: `Person ${page}`, destination: "Pune", status: "pending" }], total: 30, page, per_page: 25 };
      }
      return { items: [] };
    },
  };
  await mount(t, "travel-requests.jsx", api);
  assert.ok(paths.some((p) => /^\/hr\/travel\?page=1&per_page=25/.test(p)), paths.join(","));
  assert.match(document.body.textContent, /1–25 of 30 requests/);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  assert.ok(paths.some((p) => /^\/hr\/travel\?page=2/.test(p)));
  assert.match(document.body.textContent, /Person 2/);
});

test("the staff picker lists every role and searches the server", async (t) => {
  const paths = [];
  const api = {
    get: async (path) => {
      paths.push(path);
      if (path.startsWith("/hr/travel")) return [];
      return { items: [{ id: 9, first_name: "Hana", last_name: "Admin", email: "hana@x.com" }] };
    },
  };
  await mount(t, "travel-requests.jsx", api);
  const staff = paths.filter((p) => p.startsWith("/hr/employees"));
  assert.ok(staff.length && staff.every((p) => p.includes("include_all_roles=true")), staff.join(","));
  fireEvent.click(screen.getByRole("button", { name: /Issue Request/ }));
  assert.ok([...document.querySelectorAll(".fixed option")].some((o) => /Hana Admin/.test(o.textContent)));
  fireEvent.change(screen.getByLabelText("Search staff"), { target: { value: "hana" } });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  assert.ok(paths.some((p) => p.startsWith("/hr/employees") && p.includes("search=hana") && p.includes("include_all_roles=true")));
});

test("Approvals names each traveller from the server, also people missing from the staff list", async (t) => {
  const api = {
    get: async (path) => (path.startsWith("/hr/travel")
      ? { items: [{ id: 1, employee_id: 501, employee_name: "Mira Manager", destination: "Goa", status: "pending" }], total: 1, page: 1, per_page: 25 }
      : { items: [] }),
    put: async () => ({}),
  };
  await mount(t, "approvals.jsx", api);
  const cell = document.querySelector("tbody tr").children[0].textContent;
  assert.equal(cell, "Mira Manager");
  assert.doesNotMatch(document.querySelector("tbody").textContent, /Unknown/);
});

test("Approvals shows the server's refusal instead of a generic alert", async (t) => {
  const api = {
    get: async (path) => (path.startsWith("/hr/travel")
      ? { items: [{ id: 1, employee_id: 5, employee_name: "Ann Lee", destination: "Goa", status: "pending" }], total: 1, page: 1, per_page: 25 }
      : { items: [] }),
    put: async () => { throw new Error("A rejected trip cannot be changed to approved."); },
  };
  await mount(t, "approvals.jsx", api);
  fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /cannot be changed to approved/);
});

test("Expenses shows the server's totals for every claim, per currency, and flags claims over the daily limit", async (t) => {
  const api = {
    get: async () => ({
      items: [{ id: 1, employee_name: "Ann Lee", expense_type: "Hotel", amount: "150", currency: "INR", status: "pending", within_policy: false }],
      total: 120, page: 1, per_page: 25,
      totals: {
        total_claimed: [{ currency: "INR", amount: "98765" }, { currency: "USD", amount: "40" }],
        approved: [{ currency: "USD", amount: "40" }], pending: [{ currency: "INR", amount: "98765" }], rejected: [], reimbursed: [],
        categories: [{ label: "Hotel", currency: "INR", amount: "98765" }, { label: "Flight", currency: "USD", amount: "40" }],
      },
    }),
    put: async () => ({}),
  };
  await mount(t, "expenses.jsx", api);
  const text = document.body.textContent;
  assert.match(text, /₹98,765/);
  assert.match(text, /US\$40|\$40/);
  assert.match(text, /Hotel \(INR\)/);
  assert.match(text, /Over daily limit/);
  assert.match(text, /1–25 of 120 claims/);
});

test("the dashboard shows approved expenses per currency, never one dollar total", async (t) => {
  const api = {
    get: async (path) => (path === "/hr/travel/dashboard"
      ? { total_requests: 3, pending_requests: 1, approved_requests: 2, total_expenses: 0,
          approved_expenses_by_currency: [{ currency: "INR", amount: "150" }, { currency: "USD", amount: "20" }],
          reimbursed_expenses_by_currency: [{ currency: "INR", amount: "50" }],
          expenses_by_category: [{ label: "Hotel", currency: "INR", amount: "150" }] }
      : { items: [], total: 0 }),
  };
  await mount(t, "dashboard.jsx", api);
  const text = document.body.textContent;
  assert.match(text, /Approved Expenses/);
  assert.match(text, /₹150/);
  assert.match(text, /US\$20|\$20/);
  assert.match(text, /Reimbursed: ₹50/);
  assert.doesNotMatch(text, /Disbursed/);
});

test("Travel settings say which rules are enforced and which are for reference", async (t) => {
  const api = {
    get: async () => ({ id: 1, organization_id: 1, approval_workflow: "manager", expense_limit_per_day: "500.00", max_trip_duration: 30,
      auto_approve_threshold: 1000, reimbursement_deadline: 30, notification_enabled: true }),
    put: async () => ({}),
  };
  await mount(t, "settings.jsx", api);
  assert.match(document.getElementById("ts-duration-hint").textContent, /Enforced/);
  assert.match(document.getElementById("ts-auto-hint").textContent, /not applied automatically/);
  assert.match(document.getElementById("ts-workflow-hint").textContent, /not applied automatically/);
  assert.match(document.getElementById("ts-limit-hint").textContent, /Over daily limit/);
});
