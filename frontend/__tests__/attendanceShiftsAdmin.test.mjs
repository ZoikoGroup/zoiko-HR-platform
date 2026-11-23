/**
 * My Attendance plan step 6: Admin → Attendance → Shifts & Work Policy. Shifts carry required hours, working days and
 * thresholds (12-hour timing in the list, the backend's shift types only); a shift in use says to deactivate it;
 * shifts are assigned to people or a department from a date and can be ended; Working time requests keeps overtime and
 * corrections and points to the new page for shift notices and settings.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const SHIFTS = [
  { id: 1, name: "General", shift_type: "general", start_time: "09:00", end_time: "18:00", grace_time_minutes: 10, break_duration_minutes: 60,
    standard_hours: 8, working_days: ["mon", "tue", "wed", "thu", "fri"], is_active: true },
  { id: 2, name: "Night", shift_type: "night", start_time: "21:00", end_time: "06:00", grace_time_minutes: 5, break_duration_minutes: 30,
    standard_hours: null, working_days: null, is_active: true },
];
const impl = {};
const calls = { create: [], update: [], del: [], assign: [], end: [] };
let mocked = false;

function mock(t, over = {}) {
  for (const k of Object.keys(calls)) calls[k] = [];
  Object.assign(impl, {
    getShifts: async () => structuredClone(SHIFTS),
    createShift: async (b) => { calls.create.push(b); return { id: 3, ...b }; },
    updateShift: async (id, b) => { calls.update.push([id, b]); return { id, ...b }; },
    deleteShift: async (id) => { calls.del.push(id); return {}; },
    getDepartments: async () => ({ data: [{ id: 4, name: "Support" }] }),
    getHrEmployees: async () => ({ items: [{ id: 11, first_name: "Asha", last_name: "Rao", email: "asha@x.test" }] }),
    listShiftAssignments: async () => ({ items: [{ id: 21, employee: { id: 11, name: "Asha Rao" }, shift: { id: 2, name: "Night", start: "21:00", end: "06:00" },
      effective_from: "2026-11-01", effective_to: null }], total: 1 }),
    assignShift: async (b) => { calls.assign.push(b); return { items: [], count: 2 }; },
    endShiftAssignment: async (b) => { calls.end.push(b); return {}; },
    getTimeSettings: async () => ({ fallback_standard_workday_hours: 8 }), updateTimeSettings: async () => ({}),
    publishRoster: async () => ({}), changeShifts: async () => ({}),
    listOvertime: async () => ({ items: [] }), listCorrections: async () => ({ items: [] }), decideOvertime: async () => ({}),
    decideCorrection: async () => ({}), getTimeRecordDocuments: async () => ({ items: [] }),
    ...over,
  });
  if (mocked) return;
  mocked = true;
  const fwd = (names) => Object.fromEntries(names.map((k) => [k, (...a) => impl[k](...a)]));
  t.mock.module("../src/service/hrService.js", { exports: fwd(["getShifts", "createShift", "updateShift", "deleteShift", "getDepartments", "getHrEmployees"]) });
  t.mock.module("../src/service/attendanceService.js", { exports: fwd(["listShiftAssignments", "assignShift", "endShiftAssignment"]) });
  t.mock.module("../src/service/workDocumentsService.js", { exports: { MODULE_REASON_TEXT: {},
    ...fwd(["getTimeSettings", "updateTimeSettings", "publishRoster", "changeShifts", "listOvertime", "listCorrections", "decideOvertime",
      "decideCorrection", "getTimeRecordDocuments"]) } });
}

async function renderPage(file = "shifts.jsx") {
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/${file}?t=${Math.random()}`);
  render(h(MemoryRouter, null, h(Page)));
  await settle();
}

test("shifts list 12-hour timing, required hours and working days; a new shift sends the policy fields", async (t) => {
  mock(t);
  await renderPage();
  const row = (name) => screen.getAllByRole("row").find((r) => r.querySelector("td")?.textContent.startsWith(name));
  const night = row("Night");
  assert.match(night.textContent, /09:00 PM – 06:00 AM \(next day\)/);
  assert.match(night.textContent, /Organization's/);
  assert.match(row("General").textContent, /8h 00m.*Mon, Tue, Wed, Thu, Fri/);
  fireEvent.click(screen.getByRole("button", { name: "New shift" }));
  const form = screen.getByRole("form", { name: "New shift" });
  const types = within(form).getByLabelText("Type");
  assert.deepEqual([...types.options].map((o) => o.value), ["general", "morning", "evening", "night", "flexi"]);   // no "rotational"
  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Early" } });
  fireEvent.change(within(form).getByLabelText(/Required hours a day/), { target: { value: "7.5" } });
  fireEvent.click(within(form).getByRole("checkbox", { name: "Sat" }));
  fireEvent.change(within(form).getByLabelText(/Half day below/), { target: { value: "200" } });
  fireEvent.change(within(form).getByLabelText(/Counts as absent below/), { target: { value: "300" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create shift" }));
  assert.match(within(form).getByRole("alert").textContent, /can't be more than the half-day threshold/);
  fireEvent.change(within(form).getByLabelText(/Counts as absent below/), { target: { value: "60" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create shift" }));
  await settle();
  const sent = calls.create[0];
  assert.deepEqual([sent.name, sent.standard_hours, sent.working_days, sent.half_day_min_minutes, sent.min_present_minutes],
    ["Early", 7.5, ["sat"], 200, 60]);
});

test("deleting a shift in use shows the server's advice; deactivating works", async (t) => {
  mock(t, { deleteShift: async () => { throw new Error("“General” is assigned to people or used on past days, so it can't be deleted. Deactivate it instead."); } });
  t.mock.method(window, "confirm", () => true);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Delete General" }));
  await settle();
  assert.match(document.body.textContent, /Deactivate it instead/);
  fireEvent.click(screen.getByRole("button", { name: "Deactivate General" }));
  await settle();
  assert.deepEqual(calls.update[0], [1, { is_active: false }]);
});

test("assign a shift to a department from a date, and end someone's assignment", async (t) => {
  mock(t);
  await renderPage();
  fireEvent.click(screen.getByRole("tab", { name: "Assignments" }));
  await settle();
  const form = screen.getByRole("form", { name: "Assign a shift" });
  fireEvent.click(within(form).getByRole("button", { name: "Assign shift" }));
  assert.match(within(form).getByRole("alert").textContent, /Choose a shift, a start date, and people or a department/);
  fireEvent.change(within(form).getByLabelText("Shift"), { target: { value: "2" } });
  fireEvent.change(within(form).getByLabelText("From"), { target: { value: "2026-12-01" } });
  fireEvent.change(within(form).getByLabelText(/Whole department/), { target: { value: "4" } });
  fireEvent.click(within(form).getByRole("button", { name: "Assign shift" }));
  await settle();
  assert.deepEqual(calls.assign[0], { shift_id: 2, effective_from: "2026-12-01", effective_to: null, employee_ids: [], department_id: 4 });
  assert.match(document.body.textContent, /Shift assigned to 2 people; they have been notified/);
  const list = screen.getByRole("region", { name: "Who works which shift" });
  assert.match(list.textContent, /Asha Rao.*Night.*09:00 PM – 06:00 AM.*ongoing/);
  fireEvent.click(within(list).getByRole("button", { name: "End Asha Rao's Night assignment" }));
  fireEvent.change(within(list).getByLabelText("Last day"), { target: { value: "2026-12-31" } });
  fireEvent.click(within(list).getByRole("button", { name: "Confirm" }));
  await settle();
  assert.deepEqual(calls.end[0], { id: 21, effective_to: "2026-12-31" });
});

test("the page has four tabs and Working time requests points to it for notices and settings", async (t) => {
  mock(t);
  await renderPage();
  assert.deepEqual(screen.getAllByRole("tab").map((b) => b.textContent), ["Shifts", "Assignments", "Roster & notices", "Work policy"]);
  fireEvent.click(screen.getByRole("tab", { name: "Roster & notices" }));
  await settle();
  assert.ok(screen.getByRole("region", { name: "Publish a shift pattern" }));
  cleanup();
  await renderPage("time-requests.jsx");
  assert.deepEqual(screen.getAllByRole("tab").map((b) => b.textContent), ["Overtime", "Attendance corrections"]);
  assert.equal(screen.getByRole("link", { name: "Shifts & Work Policy" }).getAttribute("href"), "/zoiko-hr/attendance/shifts");
});
