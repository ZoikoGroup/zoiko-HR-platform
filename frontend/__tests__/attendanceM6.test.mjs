/**
 * Attendance M6: the live "Today" panel — counts, the expected-attendance sentence, departments with bars, the people
 * not checked in (overdue marked), the department filter, refresh, and the error state.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const TODAY = {
  date: "2026-11-18", timezone: "Asia/Kolkata", as_of: "2026-11-18T04:30:00Z", holiday: false,
  total: 5, present: 1, late: 1, half_day: 0, remote: 1, on_leave: 1, absent: 0, missed_punch: 1, off: 0, not_checked_in: 1,
  on_break: 1, working_now: 1, checked_out: 0, expected: 4, attendance_rate: 75,
  by_department: [{ department_id: 1, department: "Engineering", total: 4, attended: 2, late: 1, on_leave: 1, not_checked_in: 1 },
                  { department_id: 2, department: "Sales", total: 1, attended: 1, late: 0, on_leave: 0, not_checked_in: 0 }],
  not_checked_in_list: [{ employee_id: 4, name: "Emp Person", employee_code: "C-emp", department: "Engineering", shift: "General",
                          shift_start: "09:00", overdue: true }],
};

const impl = {};
const mocked = new WeakSet();
function mockToday(t, fn) {
  const calls = [];
  impl.getAttendanceToday = async (p) => { calls.push(p); return fn(p); };
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/attendanceService.js", { exports: { getAttendanceToday: (...a) => impl.getAttendanceToday(...a) } });
  }
  return calls;
}

async function renderPanel() {
  const { default: Panel } = await import(`../src/modules/zoiko-hr/attendance/components/TodayPanel.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(Panel)));
  await settle();
}

test("today's counts, the expected sentence and the time zone", async (t) => {
  mockToday(t, () => structuredClone(TODAY));
  await renderPanel();
  const panel = screen.getByRole("region", { name: "Today" });
  const tile = (label) => within(panel).getByText(label).closest("div").querySelector("dd").textContent;
  assert.deepEqual(["Total", "Present", "Late", "Not checked in", "On leave", "Remote", "On a break", "Off today"].map(tile),
    ["5", "1", "1", "1", "1", "1", "1", "0"]);
  assert.match(panel.textContent, /75% of the 4 people expected today are in\. 1 missed punch-out\./);
  assert.match(panel.textContent, /2026-11-18 · Asia\/Kolkata · updated 10:00/);
});

test("departments and the people not checked in", async (t) => {
  mockToday(t, () => structuredClone(TODAY));
  await renderPanel();
  const depts = screen.getByRole("list", { name: "By department" });
  assert.match(within(depts).getByText("Engineering").closest("li").textContent, /2\/4 in · 1 late · 1 on leave · 1 not in/);
  const waiting = screen.getByRole("list", { name: "Not checked in yet" });
  assert.ok(within(waiting).getByLabelText("Overdue"));
  assert.match(waiting.textContent, /Emp Person.*Engineering.*shift 09:00/);
});

test("the department filter asks the server again and refresh reloads", async (t) => {
  const calls = mockToday(t, () => structuredClone(TODAY));
  await renderPanel();
  fireEvent.change(screen.getByLabelText("Department for today"), { target: { value: "2" } });
  await settle();
  assert.deepEqual(calls.at(-1), { department_id: "2" });
  const before = calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh today" }));
  await settle();
  assert.equal(calls.length, before + 1);
});

test("everyone in, and the error state", async (t) => {
  mockToday(t, () => ({ ...structuredClone(TODAY), not_checked_in: 0, not_checked_in_list: [] }));
  await renderPanel();
  assert.ok(screen.getByText("Everyone expected so far has checked in."));
  cleanup();
  mockToday(t, () => { throw new Error("Server unavailable"); });
  await renderPanel();
  assert.match(screen.getByRole("alert").textContent, /Server unavailable/);
});
