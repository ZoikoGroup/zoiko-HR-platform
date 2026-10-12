/** ZHR-58: the Attendance dashboard shows the server's real figures, with no invented trends or filters. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const DATA = {
  present_today: 2, absent_today: 1, late_arrivals: 0, early_departures: 0, on_leave: 0, remote: 1, overtime: 1.5, attendance_percentage: 50,
  avg_working_hours: 8.2, total_employees: 4,
  department_attendance: [{ department: "Eng", present: 1, total: 2, count: 1 }, { department: "Ops", present: 1, total: 2, count: 1 }],
  shift_distribution: [], attendance_trend: [{ label: "Mon", present: 0, absent: 0 }, { label: "Tue", present: 2, absent: 1 }],
  changes: { present_today: -50, absent_today: null }, departments: ["Eng", "Ops"],
};

async function load(t, handler) {
  const calls = [];
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getAttendanceDashboard: async (p) => { calls.push(p); return handler(p); },
    exportAttendanceCsv: async () => {}, exportAttendanceExcel: async () => {},
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/dashboard.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("headline reads present/total from the server and never a made-up total", async (t) => {
  await load(t, async () => DATA);
  assert.match(document.body.textContent, /2\s*\/\s*4/);
});

test("movement badges come from the server; a null change shows no badge instead of a fake percentage", async (t) => {
  await load(t, async () => DATA);
  assert.match(document.body.textContent, /-50%/);
  assert.doesNotMatch(document.body.textContent, /\+5%|\+3%|\+4%|-2%/);
  assert.equal((document.body.textContent.match(/vs yesterday/g) || []).length, 1);
});

test("department rows say how many of the department are present", async (t) => {
  await load(t, async () => DATA);
  assert.equal((document.body.textContent.match(/1\/2 present/g) || []).length, 2);
});

test("the department filter is fed by the server list and is sent back to it", async (t) => {
  const calls = await load(t, async () => DATA);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Ops" } });
  await settle();
  assert.deepEqual(calls, [{}, { department: "Ops" }]);
});

test("an empty organization renders without NaN", async (t) => {
  await load(t, async () => ({ ...DATA, present_today: 0, total_employees: 0, attendance_percentage: 0, department_attendance: [], attendance_trend: [{ label: "Mon", present: 0, absent: 0 }], changes: {}, departments: [] }));
  assert.doesNotMatch(document.body.innerHTML, /NaN/);
});

test("the unbacked date-range and location filters and hard-coded trend numbers are gone", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/attendance/dashboard.jsx", "utf8");
  assert.doesNotMatch(src, /dateRange|locationFilter|change: (5|-2|1|3|2|4)\b|vs last month/);
});
