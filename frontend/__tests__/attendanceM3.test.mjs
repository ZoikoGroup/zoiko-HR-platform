/**
 * Attendance M3: My Attendance — punch in / out and breaks with friendly errors, the shift card, KPIs over working days,
 * the month calendar with day details, the records table, and routing (the old pretend clock-in page redirects; admins
 * and HR admins can open their own attendance).
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const SHIFT = { id: 1, name: "General", start: "09:00", end: "18:00", grace_minutes: 10, break_minutes: 60, standard_minutes: 480,
  crosses_midnight: false, expected_end: "2026-11-18T12:30:00Z" };
const IDLE = { date: "2026-11-18", timezone: "Asia/Kolkata", status: null, check_in_at: null, check_out_at: null, worked_minutes: 0,
  break_minutes: 0, late_minutes: 0, overtime_minutes: 0, on_break: false, running: false, breaks: [], shift: SHIFT, punch_enabled: true,
  can_punch_in: true, can_punch_out: false, can_start_break: false, can_end_break: false, record_id: null };
const WORKING = { ...IDLE, status: "late", check_in_at: "2026-11-18T03:55:00Z", running: true, late_minutes: 15, worked_minutes: 65,
  can_punch_in: false, can_punch_out: true, can_start_break: true, record_id: 5 };
const MONTH = {
  month: "2026-11", timezone: "Asia/Kolkata", today: "2026-11-18",
  policy: { grace_minutes: 10, half_day_min_minutes: 240, standard_minutes: 480, working_days: ["mon", "tue", "wed", "thu", "fri"] },
  kpis: { working_days: 12, present: 6, late: 2, absent: 1, half_day: 1, on_leave: 1, remote: 0, holiday: 1, weekly_off: 5, missed_punch: 1,
    attended_days: 8.5, attendance_rate: 71, punctuality_rate: 75, avg_worked_minutes: 505, overtime_minutes: 130, approved_overtime_minutes: 60 },
  days: Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    const status = day > 18 ? null : day === 3 ? "late" : day === 10 ? "absent" : day === 4 ? "holiday" : [1, 7, 8, 14, 15].includes(day) ? "weekly_off" : day === 18 ? null : "present";
    return { date, status, future: day > 18, check_in: status === "present" || status === "late" ? (status === "late" ? "09:40" : "09:00") : null,
      check_out: status === "present" || status === "late" ? "18:00" : null, worked_minutes: status === "present" ? 480 : status === "late" ? 440 : 0,
      break_minutes: status === "present" ? 60 : 0, late_minutes: status === "late" ? 30 : 0, overtime_minutes: 0, shift: "General", record_id: day };
  }),
};
const DAY = { ...WORKING, date: "2026-11-03", status: "late", check_out_at: "2026-11-03T12:30:00Z", running: false, notes: "Traffic",
  breaks: [{ start_at: "2026-11-03T07:30:00Z", end_at: "2026-11-03T08:00:00Z" }],
  history: [{ action: "punch_in", at: "2026-11-03T04:10:00Z", by_self: true, actor_type: "user" },
            { action: "updated", at: "2026-11-03T13:00:00Z", by_self: false, actor_type: "user", reason: "Badge reader fault" }] };

const impl = {};
const mocked = new WeakSet();
function mockApi(t, over = {}) {
  const calls = { punchIn: 0, punchOut: 0, startBreak: 0, months: [] };
  Object.assign(impl, {
    getMyAttendanceToday: async () => structuredClone(IDLE),
    punchIn: async () => { calls.punchIn++; return structuredClone(WORKING); },
    punchOut: async () => { calls.punchOut++; return { ...structuredClone(WORKING), running: false, check_out_at: "2026-11-18T12:30:00Z", can_punch_out: false }; },
    startBreak: async () => { calls.startBreak++; return { ...structuredClone(WORKING), on_break: true, can_start_break: false, can_end_break: true }; },
    endBreak: async () => structuredClone(WORKING),
    getMyAttendanceMonth: async (m) => { calls.months.push(m); return structuredClone(MONTH); },
    getMyAttendanceDay: async () => structuredClone(DAY),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/attendanceService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
  }
  return calls;
}

async function renderPage() {
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/Employee_EssAttendance.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(Page))));
  await settle();
}

test("punch in, start a break and punch out update the card", async (t) => {
  const calls = mockApi(t);
  await renderPage();
  const card = screen.getByRole("region", { name: "Punch in and out" });
  assert.match(within(card).getByRole("status").textContent, /Not punched in yet/);
  fireEvent.click(within(card).getByRole("button", { name: /Punch in/ }));
  await settle();
  assert.equal(calls.punchIn, 1);
  assert.equal(within(card).getByRole("status").textContent, "Working");
  assert.match(within(card).getByRole("timer", { name: "Worked time" }).textContent, /^01:05:0\d$/);   // HH:MM:SS (QA R1-25)
  assert.ok(within(card).getByText("Late"));
  assert.ok(within(card).getByText("15 min"));
  assert.equal(within(card).queryByRole("button", { name: /Punch in/ }), null);
  fireEvent.click(within(card).getByRole("button", { name: /Start break/ }));
  await settle();
  assert.equal(calls.startBreak, 1);
  assert.ok(within(card).getByRole("button", { name: /End break/ }));
  assert.match(within(card).getByRole("status").textContent, /On a break/);
});

test("a refused punch shows a friendly message", async (t) => {
  mockApi(t, { punchIn: async () => { throw Object.assign(new Error("409"), { code: "ATT_DAY_CLOSED" }); } });
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: /Punch in/ }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /already punched in and out today/);
});

test("web punching turned off: no Punch in button, an explanation instead", async (t) => {
  mockApi(t, { getMyAttendanceToday: async () => ({ ...structuredClone(IDLE), punch_enabled: false, can_punch_in: false }) });
  await renderPage();
  assert.equal(screen.queryByRole("button", { name: /Punch in/ }), null);
  assert.ok(screen.getByText(/turned off for your organization/));
});

test("the shift card, and the message when no shift is assigned", async (t) => {
  mockApi(t);
  await renderPage();
  const shift = screen.getByRole("region", { name: "My shift" });
  assert.ok(within(shift).getByText("General"));
  assert.ok(within(shift).getByText("09:00 AM – 06:00 PM"));
  assert.ok(within(shift).getByText(/10 min grace/));
  cleanup();
  mockApi(t, { getMyAttendanceToday: async () => ({ ...structuredClone(IDLE), shift: null }) });
  await renderPage();
  assert.match(screen.getByRole("region", { name: "My shift" }).textContent, /No shift is assigned/);
});

test("KPIs count working days only", async (t) => {
  mockApi(t);
  await renderPage();
  const kpis = screen.getByLabelText("This month");
  assert.ok(within(kpis).getByText("8.5 / 12"));
  assert.ok(within(kpis).getByText("71% of working days"));
  assert.ok(within(kpis).getByText("75%"));
  assert.ok(within(kpis).getByText("1 missed punch-out"));
  assert.ok(within(kpis).getByText("8h 25m"));
  // QA R2-2: the Overtime card and its note read the same figure; approved overtime is named as such
  assert.ok(within(kpis).getByText("2h 10m"));
  assert.ok(within(kpis).getByText("Beyond the standard day · 1h 00m approved"));
});

test("the calendar opens a day with its breaks and history", async (t) => {
  mockApi(t);
  await renderPage();
  const grid = screen.getByRole("grid", { name: "Attendance calendar" });
  assert.equal(within(grid).getByRole("gridcell", { name: /2026-11-25/ }).disabled, true);   // future
  fireEvent.click(within(grid).getByRole("gridcell", { name: "2026-11-03: Late" }));
  await settle();
  const drawer = screen.getByRole("dialog", { name: /Attendance on 03 Nov 2026/ });
  assert.ok(within(drawer).getByText("01:00 PM – 01:30 PM"));                                         // the break, in Kolkata time
  assert.ok(within(drawer).getByText(/Badge reader fault/));
  assert.match(within(drawer).getByText(/Badge reader fault/).textContent, /by HR/);
  assert.ok(within(drawer).getByRole("button", { name: /Request a correction/ }));                // the form itself: attendanceM4
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
});

test("the records table filters, and the month can be changed", async (t) => {
  const calls = mockApi(t);
  await renderPage();
  const table = screen.getByRole("region", { name: "Attendance records" });
  fireEvent.click(within(table).getByRole("tab", { name: "Late" }));
  const rows = within(table).getAllByRole("row").slice(1);
  assert.equal(rows.length, 1);
  assert.ok(within(rows[0]).getByText("09:40 AM"));
  assert.equal(screen.getByRole("button", { name: "Next month" }).disabled, true);            // no future months
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  await settle();
  assert.equal(calls.months.at(-1), "2026-10");
});

test("routing: the old pretend clock-in page redirects and admins can open their own attendance", async () => {
  const routes = fs.readFileSync("src/routes/PortalApp.jsx", "utf8");
  assert.match(routes, /"\/zoiko-hr\/ess\/attendance": <Navigate to="\/employee\/ess\/attendance" replace \/>/);
  assert.equal(fs.existsSync("src/modules/zoiko-hr/ess/attendance.jsx"), false);
  const { ROLE_ALLOWED_PREFIXES, ROLES } = await import("../src/config/roles.js");
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.EMPLOYEE]) {
    assert.ok(ROLE_ALLOWED_PREFIXES[role].includes("/employee/ess/attendance") || ROLE_ALLOWED_PREFIXES[role].includes("/employee/ess"), role);
  }
});

test("step 2: an overnight check-out shows '+1 day' in the records table and the day drawer, 12-hour times", async (t) => {
  const night = structuredClone(MONTH);
  // 3 Nov: a night shift, in at 21:00 IST (15:30 UTC), out at 06:05 IST on 4 Nov (00:35 UTC)
  Object.assign(night.days[2], { status: "present", check_in: "21:00", check_out: "06:05",
    check_in_at: "2026-11-03T15:30:00Z", check_out_at: "2026-11-04T00:35:00Z" });
  const nightDay = { ...structuredClone(DAY), date: "2026-11-03", check_in_at: "2026-11-03T15:30:00Z", check_out_at: "2026-11-04T00:35:00Z" };
  mockApi(t, { getMyAttendanceMonth: async () => night, getMyAttendanceDay: async () => nightDay });
  await renderPage();
  const row = screen.getAllByRole("row").find((r) => r.textContent.includes("03 Nov 2026"));
  assert.match(row.textContent, /09:00 PM/);
  assert.match(row.textContent, /06:05 AM\s*\+1 day/);
  const other = screen.getAllByRole("row").find((r) => r.textContent.includes("02 Nov 2026"));
  assert.doesNotMatch(other.textContent, /\+1 day/);
  fireEvent.click(within(row).getByRole("button", { name: "03 Nov 2026" }));
  await settle();
  const drawer = screen.getByRole("dialog");
  assert.match(drawer.textContent, /Punched out06:05 AM\+1 day/);
});
