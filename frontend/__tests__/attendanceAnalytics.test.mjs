/** ZHR-59: Overtime Trajectory and the other analytics show server figures only: no random or estimated numbers. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const base = {
  kpis: { attendance_rate: 91.5, avg_work_hours: 8.4, total_overtime: 6.5, shift_efficiency: null, changes: { attendance_rate: 2, avg_work_hours: null, total_overtime: -10, shift_efficiency: null } },
  trends: { trends: [{ date: "2026-03-10", label: "10 Mar", present: 3, absent: 1 }] },
  dept: { department_breakdown: [{ department: "Eng", present: 3, absent: 1, late: 0, total_records: 4, attendance_rate: 75 }] },
  overtime: { monthly_breakdown: [{ month: "2026-01", label: "Jan 2026", hours: 0, employees: 0 }, { month: "2026-03", label: "Mar 2026", hours: 6.5, employees: 2 }] },
  shift: { shift_efficiency: [] },
};

async function load(t, over = {}) {
  const calls = {};
  const d = { ...base, ...over };
  const rec = (name, v) => async (p) => { (calls[name] ||= []).push(p); return v; };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getAttendanceKpis: rec("kpis", d.kpis), getAttendanceTrends: rec("trends", d.trends), getDepartmentAnalysis: rec("dept", d.dept),
    getOvertimeAnalytics: rec("overtime", d.overtime), getShiftEfficiency: rec("shift", d.shift),
    exportAttendanceCsv: async () => {}, exportAttendanceExcel: async () => {},
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/analytics.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("overtime bars show exactly the server's months and hours", async (t) => {
  await load(t);
  const text = document.body.textContent;
  assert.match(text, /Jan 2026/);
  assert.match(text, /Mar 2026/);
  assert.match(text, /6\.5h/);
  assert.doesNotMatch(text, /97h/);
});

test("with no overtime in the period the chart says so instead of drawing numbers", async (t) => {
  await load(t, { overtime: { monthly_breakdown: [{ month: "2026-03", label: "Mar 2026", hours: 0, employees: 0 }] } });
  assert.match(document.body.textContent, /No overtime recorded in this period/);
  assert.doesNotMatch(document.body.textContent, /Mar 2026/);
});

test("when the overtime request returns nothing useful there is still no invented data", async (t) => {
  await load(t, { overtime: {} });
  assert.match(document.body.textContent, /No overtime recorded/);
});

test("headline figures come from the server; unknown ones are a dash; changes only when known", async (t) => {
  await load(t);
  const text = document.body.textContent;
  assert.match(text, /91\.5/);
  assert.match(text, /8\.4/);
  assert.match(text, /—/);              // shift efficiency has no data
  assert.match(text, /\+2%/);
  assert.match(text, /-10%/);
  assert.doesNotMatch(text, /7\.8/);    // the old hard-coded average
  assert.equal((text.match(/vs previous period/g) || []).length, 2);
});

test("picking a month sends that month's date range to every analytics call", async (t) => {
  const calls = await load(t);
  fireEvent.change(document.querySelector('input[type="month"]'), { target: { value: "2026-03" } });
  await settle();
  for (const name of ["kpis", "trends", "dept", "overtime", "shift"]) {
    assert.deepEqual(calls[name].at(-1), { date_from: "2026-03-01", date_to: "2026-03-31" }, name);
  }
});

test("no random or estimated figures remain in the page", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/attendance/analytics.jsx", "utf8");
  assert.doesNotMatch(src, /Math\.random|change: (8|2|-1|0\.5)\b|value: "7\.8"|late \* 2|vs last month/);
});
