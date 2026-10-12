/** Employee dashboard: the numbers come from the person's real data (lower-case attendance statuses included). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import {
  leaveTotals, attendanceSummary, pendingCount, upcomingHolidays, inDaysText, firstNameOf, greetingFor, monthStart, recentLeaves,
} from "../src/utils/essDashboard.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("leave left is summed for this year, with the share left", () => {
  const now = new Date(2026, 5, 1);
  const r = leaveTotals([
    { year: 2026, total_days: 20, remaining_days: 15 },
    { year: 2026, total_days: 10, used_days: 4, pending_days: 1 },
    { year: 2025, total_days: 99, remaining_days: 99 },
  ], now);
  assert.deepEqual(r, { remaining: 20, total: 30, pct: 67 });
  assert.deepEqual(leaveTotals([], now), { remaining: 0, total: 0, pct: 0 });
});

test("attendance counts lower-case statuses (the old page showed 0%)", () => {
  const a = attendanceSummary([
    { date: "2026-10-01", status: "present" }, { date: "2026-10-02", status: "late" },
    { date: "2026-10-03", status: "absent" }, { date: "2026-10-04", status: "holiday" },
    { date: "2026-10-05", status: "Present" },
  ]);
  assert.equal(a.pct, 75);
  assert.equal(a.present, 3);
  assert.equal(a.onTime, 2);
  assert.equal(a.last7.length, 5);
  assert.equal(attendanceSummary([]).pct, null);
});

test("pending counts leave, requests, trips and claims still waiting", () => {
  assert.equal(pendingCount({
    leaves: [{ status: "pending" }, { status: "approved" }], ess: [{ status: "Pending" }],
    trips: [{ status: "submitted" }], claims: [{ status: "rejected" }],
  }), 3);
  assert.equal(pendingCount(), 0);
});

test("holidays: only today and later, soonest first", () => {
  const today = new Date(2026, 9, 9);
  const h = upcomingHolidays([
    { name: "Old", date: "2026-01-01" }, { name: "Later", date: "2026-12-25" },
    { name: "Soon", date: "2026-10-10" }, { name: "Off", date: "2026-10-11", is_active: false },
  ], today);
  assert.deepEqual(h.map((x) => [x.name, x.inDays]), [["Soon", 1], ["Later", 77]]);
  assert.equal(inDaysText(0), "Today");
  assert.equal(inDaysText(1), "Tomorrow");
  assert.equal(inDaysText(5), "In 5 days");
});

test("small helpers", () => {
  assert.equal(firstNameOf({ first_name: "Lee" }), "Lee");
  assert.equal(firstNameOf({ full_name: "Lee Park" }), "Lee");
  assert.equal(firstNameOf(null), "");
  assert.equal(greetingFor(new Date(2026, 0, 1, 9)), "Good morning");
  assert.equal(greetingFor(new Date(2026, 0, 1, 20)), "Good evening");
  assert.equal(monthStart(new Date(2026, 9, 9)), "2026-10-01");
  assert.deepEqual(recentLeaves([{ id: 1, created_at: "2026-01-01" }, { id: 2, created_at: "2026-02-01" }], 1).map((l) => l.id), [2]);
});

function Where() { return React.createElement("div", { "data-testid": "where" }, useLocation().pathname); }

async function open(t, over = {}) {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const svc = {
    getMyProfile: async () => ({ first_name: "Lee", last_name: "Park" }),
    getLeaveBalances: async () => [{ year: today.getFullYear(), total_days: 20, remaining_days: 15 }],
    getLeaveRequests: async () => [{ id: 1, leave_type: "annual", start_date: "2026-10-01", end_date: "2026-10-02", days: 2, status: "pending" }],
    getAttendanceRecords: async () => [{ date: iso(today), status: "present" }],
    getEss: async () => [],
    getHolidays: async () => [{ name: "Founders Day", date: iso(soon) }],
    getTravel: async () => [],
    getTravelExpenses: async () => [],
    ...over,
  };
  t.mock.module("../src/service/employee", { exports: svc });
  t.mock.module("../src/service/api", { exports: { getStoredUser: () => ({ id: 7 }) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/Employee_EssDashboard.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/employee/ess"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/employee/ess", element: React.createElement(Page) }),
    React.createElement(Route, { path: "*", element: React.createElement(Where) }))));
  await settle();
}

test("the dashboard greets the person and shows their real numbers", async (t) => {
  await open(t);
  assert.match(document.body.textContent, /Lee/);
  assert.match(document.body.textContent, /15/);
  assert.match(document.body.textContent, /100%/);
  assert.match(document.body.textContent, /Founders Day/);
  assert.match(document.body.textContent, /1 pending request/);
});

test("Apply for Leave and Claim Expense go to their pages", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: /Apply for Leave/ }));
  await settle();
  assert.equal(document.querySelector('[data-testid="where"]').textContent, "/employee/leaves/apply");
});

test("a part that fails to load does not blank the page", async (t) => {
  await open(t, { getHolidays: async () => { throw new Error("down"); } });
  assert.match(document.body.textContent, /Some parts of this page could not be loaded/);
  assert.match(document.body.textContent, /Lee/);
});

test("if the profile itself fails, an error with a retry is shown", async (t) => {
  await open(t, { getMyProfile: async () => { throw new Error("Profile down"); } });
  assert.match(screen.getByRole("alert").textContent, /Profile down/);
  assert.ok(screen.getByRole("button", { name: /Try again/ }));
});
