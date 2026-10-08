/** ZHR-79: the staff member on a travel request is shown by name, never as "Unknown". */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { staffName, indexById } from "../src/utils/travelDisplay.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("staffName uses the server's name first, then an employee record, then the id", () => {
  assert.equal(staffName({ employee_id: 5, employee_name: "Ann Lee" }), "Ann Lee");
  assert.equal(staffName({ employee_id: 5 }, indexById([{ id: 5, first_name: "Sam", last_name: "Roy" }])), "Sam Roy");
  assert.equal(staffName({ employee_id: 5, employee: { first_name: "Eve", last_name: "Park" } }), "Eve Park");
  assert.equal(staffName({ employee_id: 5, employee: { email: "x@y.com" } }), "x@y.com");
  assert.equal(staffName({ employee_id: 5 }), "Employee #5");
  assert.equal(staffName({ employee_id: 5, employee_name: "  " }), "Employee #5");
  assert.equal(staffName({}), "Unknown");
  assert.equal(staffName(null), "Unknown");
});

const ROWS = [
  { id: 1, employee_id: 5, employee_name: "Ann Lee", destination: "Pune", purpose: "Client", start_date: "2026-11-01", end_date: "2026-11-03", status: "pending" },
  { id: 2, employee_id: 6, destination: "Delhi", purpose: "", start_date: "2026-11-05", end_date: "2026-11-06", status: "approved" },
];

async function load(t, { postError } = {}) {
  const calls = { post: [] };
  const api = {
    get: async (path) => (path.startsWith("/hr/travel") ? ROWS : { items: [{ id: 5, first_name: "Ann", last_name: "Lee", email: "ann@x.com" }, { id: 6, first_name: "Sam", last_name: "Roy", email: "sam@x.com" }] }),
    post: async (path, body) => { calls.post.push([path, body]); if (postError) throw postError; return { id: 3, employee_name: "Sam Roy", status: "pending", ...body }; },
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, children) } });
  t.mock.module("../src/modules/zoiko-hr/travel/TravelLayout.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/api.js", { exports: { api } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/travel/travel-requests.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("the list shows each staff member's name, from the server or from the employee list", async (t) => {
  await load(t);
  const rows = [...document.querySelectorAll("tbody tr")].map((r) => r.children[0].textContent);
  assert.deepEqual(rows, ["Ann Lee", "Sam Roy"]);
  assert.doesNotMatch(document.querySelector("tbody").textContent, /Unknown/);
});

test("searching by a person's name finds their requests", async (t) => {
  await load(t);
  fireEvent.change(screen.getByPlaceholderText("Filter workflows..."), { target: { value: "sam" } });
  const rows = [...document.querySelectorAll("tbody tr")];
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /Delhi/);
});

test("a new request appears with the person's name straight away, and a refusal is shown in the dialog", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /Issue Request/ }));
  const form = document.querySelector(".fixed form");
  fireEvent.change(form.querySelector("select"), { target: { value: "6" } });
  const [dest] = form.querySelectorAll("input[type=text]");
  fireEvent.change(dest, { target: { value: "Goa" } });
  const [start, end] = form.querySelectorAll("input[type=date]");
  fireEvent.change(start, { target: { value: "2026-12-10" } });
  fireEvent.change(end, { target: { value: "2026-12-05" } });
  fireEvent.submit(form);
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /end date cannot be before the start date/);
  assert.equal(calls.post.length, 0);
  fireEvent.change(end, { target: { value: "2026-12-12" } });
  fireEvent.submit(form);
  await settle();
  assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0][1].employee_id, 6);
  assert.equal(document.querySelector(".fixed"), null);
  assert.equal(document.querySelector("tbody tr").children[0].textContent, "Sam Roy");
});

test("a server refusal while creating appears in the dialog, not as a pop-up", async (t) => {
  await load(t, { postError: new Error("The selected staff member was not found in this organization. Choose someone from the list.") });
  fireEvent.click(screen.getByRole("button", { name: /Issue Request/ }));
  const form = document.querySelector(".fixed form");
  fireEvent.change(form.querySelector("select"), { target: { value: "6" } });
  fireEvent.change(form.querySelector("input[type=text]"), { target: { value: "Goa" } });
  const [start, end] = form.querySelectorAll("input[type=date]");
  fireEvent.change(start, { target: { value: "2026-12-10" } });
  fireEvent.change(end, { target: { value: "2026-12-12" } });
  fireEvent.submit(form);
  await settle();
  assert.match(document.querySelector(".fixed [role=alert]").textContent, /not found in this organization/);
});
