/**
 * Attendance QA R1-24: the working time settings show the half-day threshold and, next to it, the minimum worked time
 * for a day to count; a minimum above the threshold is refused before saving. Since the My Attendance plan step 6 these
 * settings live in Shifts & Work Policy → Work policy (moved from Working time requests → Settings).
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

test("the half-day threshold and the minimum to count the day are edited together", async (t) => {
  const saved = [];
  const none = async () => ({ items: [] });
  t.mock.module("../src/service/workDocumentsService.js", { exports: {
    MODULE_REASON_TEXT: {}, changeShifts: none, decideCorrection: none, decideOvertime: none, getTimeRecordDocuments: none,
    listCorrections: none, listOvertime: none, publishRoster: none,
    getTimeSettings: async () => ({ standard_workday_hours: 8, shift_change_notice_days: 7, half_day_min_hours: 4, min_present_hours: 1,
      fallback_standard_workday_hours: 8 }),
    updateTimeSettings: async (body) => { saved.push(body); return body; },
  } });
  t.mock.module("../src/service/hrService.js", { exports: { getShifts: async () => [], getHrEmployees: async () => [],
    createShift: async () => ({}), updateShift: async () => ({}), deleteShift: async () => ({}), getDepartments: async () => ({ data: [] }) } });
  t.mock.module("../src/service/attendanceService.js", { exports: { listShiftAssignments: async () => ({ items: [], total: 0 }),
    assignShift: async () => ({}), endShiftAssignment: async () => ({}) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/shifts.jsx?t=${Math.random()}`);
  render(h(MemoryRouter, null, h(Page)));
  await settle();
  fireEvent.click(screen.getByRole("tab", { name: "Work policy" }));
  await settle();
  const half = screen.getByLabelText(/Half-day threshold/);
  const min = screen.getByLabelText(/Minimum worked time for the day to count/);
  assert.equal(half.value, "4");
  assert.equal(min.value, "1");

  fireEvent.change(min, { target: { value: "5" } });
  assert.equal(min.getAttribute("aria-invalid"), "true");
  assert.ok(screen.getByText(/cannot be more than the half-day threshold/));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await settle();
  assert.equal(saved.length, 0);

  fireEvent.change(min, { target: { value: "0.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(saved, [{ standard_workday_hours: 8, half_day_min_hours: 4, min_present_hours: 0.5, grace_minutes: null, edit_lock_days: null,
    shift_change_notice_days: 7, default_shift_id: null, overtime_requires_approval: true, auto_close_punch_out: true, allow_web_punch: true }]);
});
