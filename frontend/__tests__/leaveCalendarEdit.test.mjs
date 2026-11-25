/** Bug 27: the admin leave calendar had no way to move a leave to other dates. A leave on the calendar now opens
 * "Change leave dates"; saving sends the new dates and reloads the month. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const LEAVE = { id: 41, employee_id: 3, employee_name: "Siddartha Arora", leave_type: "casual", start_date: `${ym}-10`, end_date: `${ym}-11`, days: 2, status: "approved" };

async function show(t, { update } = {}) {
  const sent = [];
  let loads = 0;
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("span", null, children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getLeaveCalendar: async () => { loads += 1; return [LEAVE]; },
    getLeaveRequests: async () => [],
    getHolidays: async () => [],
    createHoliday: async () => ({}),
    updateLeaveRequest: update || (async (id, body) => { sent.push([id, body]); return { ...LEAVE, ...body }; }),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/leave/leave-calendar.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return { sent, loads: () => loads };
}
const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("a leave on the calendar opens Change leave dates and the new dates are saved", async (t) => {
  const { sent, loads } = await show(t);
  fireEvent.click(screen.getAllByRole("button", { name: /Edit leave of Siddartha Arora/ })[0]);
  assert.ok(screen.getByRole("dialog", { name: "Change leave dates" }));
  assert.equal(document.getElementById("lc-start").value, `${ym}-10`);
  set("lc-start", `${ym}-20`);
  set("lc-end", `${ym}-22`);
  assert.match(document.body.textContent, /3 days\./);
  const before = loads();
  fireEvent.click(screen.getByRole("button", { name: "Save new dates" }));
  await settle();
  assert.deepEqual(sent, [[41, { start_date: `${ym}-20`, end_date: `${ym}-22` }]]);
  assert.equal(screen.queryByRole("dialog", { name: "Change leave dates" }), null);
  assert.match(document.body.textContent, /moved to .*They have been notified/);
  assert.ok(loads() > before, "the month is read again");
});

test("an end before the start is caught before anything is sent; a server refusal is shown", async (t) => {
  const { sent } = await show(t, { update: async () => { throw new Error("These dates overlap another leave of this employee."); } });
  fireEvent.click(screen.getAllByRole("button", { name: /Edit leave of/ })[0]);
  set("lc-start", `${ym}-20`);
  set("lc-end", `${ym}-18`);
  fireEvent.click(screen.getByRole("button", { name: "Save new dates" }));
  await settle();
  assert.equal(sent.length, 0);
  assert.match(screen.getByRole("alert").textContent, /end date cannot be before/);
  set("lc-end", `${ym}-21`);
  fireEvent.click(screen.getByRole("button", { name: "Save new dates" }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /overlap another leave/);
  assert.ok(screen.getByRole("dialog", { name: "Change leave dates" }), "the dialog stays open to fix the dates");
});
