/**
 * Attendance M5: the admin attendance log — filters and date presets go to the server, the new columns, add / edit with
 * a required reason, the history drawer, removal with a reason, exports with the same filters, and the empty state.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };

const ROW = { id: 7, employee_id: 4, employee_name: "Asha Rao", employee_code: "E-004", department: "Engineering", date: "2026-11-18",
  status: "late", status_locked: false, check_in_time: "09:40", check_out_time: "18:30", worked_minutes: 485, break_minutes: 45,
  late_minutes: 30, overtime_minutes: 5, source: "web", notes: null };
const FULL = { ...ROW, timezone: "Asia/Kolkata", breaks: [{ start: "13:00", end: "13:45" }] };

const impl = {};
const mocked = new WeakSet();
function mockAll(t, over = {}) {
  const calls = { list: [], create: [], update: [], remove: [], exports: [] };
  Object.assign(impl, {
    listAttendanceRecords: async (p) => { calls.list.push(p); return { items: [structuredClone(ROW)], total: 1, page: 1, per_page: 25 }; },
    getAttendanceRecord: async () => structuredClone(FULL),
    createAttendanceRecord: async (b) => { calls.create.push(b); return { id: 9 }; },
    updateAttendanceRecord: async (b) => { calls.update.push(b); return b; },
    deleteAttendanceRecord: async (b) => { calls.remove.push(b); return {}; },
    getAttendanceRecordAudit: async () => ({ items: [
      { id: 1, action: "punch_in", at: "2026-11-18T04:10:00Z", actor_name: "Asha Rao", actor_type: "user", after: { status: "late" }, before: null },
      { id: 2, action: "updated", at: "2026-11-18T13:00:00Z", actor_name: "Hr Person", actor_type: "user", reason: "Reader lag",
        before: { status: "late", check_in: "2026-11-18T09:40:00" }, after: { status: "present", check_in: "2026-11-18T09:00:00" } },
    ] }),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    const fwd = (names) => Object.fromEntries(names.map((k) => [k, (...a) => impl[k](...a)]));
    t.mock.module("../src/service/attendanceService.js", { exports: fwd(["listAttendanceRecords", "getAttendanceRecord", "createAttendanceRecord",
      "updateAttendanceRecord", "deleteAttendanceRecord", "getAttendanceRecordAudit"]) });
    t.mock.module("../src/service/hrService.js", { exports: {
      exportAttendanceCsv: async (p) => { calls.exports.push(["csv", p]); return "a.csv"; },
      exportAttendanceExcel: async (p) => { calls.exports.push(["excel", p]); return "a.xlsx"; },
      getDepartments: async () => ({ data: [{ id: 1, name: "Engineering" }, { id: 2, name: "Sales" }] }),
      getHrEmployees: async () => ({ items: [{ id: 4, first_name: "Asha", last_name: "Rao" }] }),
    } });
  }
  return calls;
}

async function renderPage() {
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/daily-records.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: ["/zoiko-hr/attendance/daily"] }, h(Page))));
  await settle();
}

test("the log asks the server with today's preset and shows the new columns", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  assert.equal(calls.list[0].preset, "today");
  assert.equal(calls.list[0].per_page, 25);
  const row = screen.getByText("Asha Rao").closest("tr");
  for (const text of ["Engineering", "09:40 AM", "+30m", "06:30 PM", "0h 45m", "8h 05m", "0h 05m", "Late", "Web"]) assert.ok(within(row).getByText(text), text);
  // times, durations, the date and the headers stay on one line ("06:17 PM" was breaking into "06:17 / PM")
  for (const text of ["06:30 PM", "0h 45m", "8h 05m"]) assert.match(within(row).getByText(text).closest("td").className, /whitespace-nowrap/, text);
  assert.match(row.closest("table").querySelector("thead").className, /whitespace-nowrap/);
});

test("filters and presets are sent to the server, and paging resets", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "This month" }));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "missed_punch" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "manual" } });
  fireEvent.change(screen.getByPlaceholderText(/Search employee/), { target: { value: "Asha" } });
  await settle();
  const last = calls.list.at(-1);
  assert.deepEqual({ preset: last.preset, status: last.status, department_id: last.department_id, source: last.source, search: last.search, page: last.page },
    { preset: "this_month", status: "missed_punch", department_id: "2", source: "manual", search: "Asha", page: 1 });
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-11-01" } });
  await settle();
  assert.equal(calls.list.at(-1).preset, undefined);
  assert.equal(calls.list.at(-1).date_from, "2026-11-01");
});

test("adding needs a reason; the server's duplicate answer is explained", async (t) => {
  const calls = mockAll(t, { createAttendanceRecord: async () => { throw Object.assign(new Error("409"), { code: "ATT_EXISTS" }); } });
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: /Add Record/ }));
  const d = screen.getByRole("dialog", { name: "Add attendance record" });
  fireEvent.change(within(d).getByLabelText("Employee"), { target: { value: "4" } });
  fireEvent.change(within(d).getByLabelText("Date"), { target: { value: "2026-11-17" } });
  fireEvent.change(within(d).getByLabelText("Check-in"), { target: { value: "09:00" } });
  const save = within(d).getByRole("button", { name: "Add record" });
  assert.equal(save.disabled, true);
  fireEvent.change(within(d).getByLabelText(/Reason for this record/), { target: { value: "Badge reader was down" } });
  fireEvent.click(save);
  await settle();
  assert.match(within(d).getByRole("alert").textContent, /already has a record for that day/);
  assert.equal(calls.create.length, 0);
});

test("editing loads the full record (with breaks), sends the change and the reason", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Edit Asha Rao on 2026-11-18" }));
  await settle();
  const d = screen.getByRole("dialog", { name: "Edit attendance record" });
  assert.equal(within(d).getByLabelText("Break 1 start").value, "13:00");
  fireEvent.change(within(d).getByLabelText("Check-in"), { target: { value: "09:00" } });
  fireEvent.change(within(d).getByLabelText(/Reason for this change/), { target: { value: "Reader lag" } });
  fireEvent.click(within(d).getByRole("button", { name: "Save changes" }));
  await settle();
  assert.deepEqual(calls.update[0], { id: 7, reason: "Reader lag", notes: null, check_in: "09:00", check_out: "18:30",
    breaks: [{ start: "13:00", end: "13:45" }] });
  assert.match(screen.getByRole("status").textContent, /Record updated/);
});

test("a no-time status clears the times and locks the status", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Edit Asha Rao on 2026-11-18" }));
  await settle();
  const d = screen.getByRole("dialog", { name: "Edit attendance record" });
  fireEvent.change(within(d).getByLabelText("Status"), { target: { value: "on_leave" } });
  assert.equal(within(d).queryByLabelText("Check-in"), null);
  fireEvent.change(within(d).getByLabelText(/Reason for this change/), { target: { value: "Leave approved on paper" } });
  fireEvent.click(within(d).getByRole("button", { name: "Save changes" }));
  await settle();
  assert.deepEqual(calls.update[0], { id: 7, reason: "Leave approved on paper", notes: null, status: "on_leave" });
});

test("the history shows who changed what and why", async (t) => {
  mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "History of Asha Rao on 2026-11-18" }));
  await settle();
  const drawer = screen.getByRole("dialog", { name: /History of Asha Rao/ });
  const items = within(drawer).getAllByRole("listitem");
  assert.ok(within(drawer).getByText("Record changed"));
  assert.ok(within(drawer).getByText(/Hr Person/));
  assert.ok(within(drawer).getByText("“Reader lag”"));
  assert.match(drawer.textContent, /Check-in: 2026-11-18 09:40 AM → 2026-11-18 09:00 AM/);
  assert.ok(items.length >= 2);
});

test("removing asks for a reason; exports carry the filters", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  const original = window.prompt;
  window.prompt = () => "Entered twice";
  try {
    fireEvent.click(screen.getByRole("button", { name: "Remove Asha Rao on 2026-11-18" }));
    await settle();
  } finally { window.prompt = original; }
  assert.deepEqual(calls.remove, [{ id: 7, reason: "Entered twice" }]);
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "late" } });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Excel$/ }));
  await settle();
  assert.deepEqual(calls.exports.at(-1), ["excel", { preset: "today", status: "late" }]);
});

test("an empty result explains itself and offers to clear the filters", async (t) => {
  mockAll(t, { listAttendanceRecords: async () => ({ items: [], total: 0, page: 1, per_page: 25 }) });
  await renderPage();
  assert.ok(screen.getByText("No records found"));
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "biometric" } });
  await settle();
  assert.ok(screen.getByText("No records match these filters."));
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  assert.equal(screen.getByLabelText("Source").value, "");
});
