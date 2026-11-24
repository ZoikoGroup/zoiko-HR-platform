/**
 * My Attendance plan step 5: a shift notice waiting for acknowledgement shows a banner on My Attendance. "Read and
 * acknowledge" opens the documents' own dialog (a stand-in here: the real dialog is covered by the documents tests),
 * and once acknowledged the page asks the server again, so the banner goes away. Its own file so the dialog stand-in is
 * in place before the page is first loaded.
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
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const TODAY = { date: "2026-11-18", timezone: "Asia/Kolkata", status: null, check_in_at: null, check_out_at: null, worked_minutes: 0,
  break_minutes: 0, late_minutes: 0, overtime_minutes: 0, on_break: false, running: false, breaks: [], shift: null, punch_enabled: true,
  can_punch_in: true, can_punch_out: false, can_start_break: false, can_end_break: false, record_id: null, required_minutes: 480,
  next_shift_change: null };
const MONTH = { month: "2026-11", timezone: "Asia/Kolkata", today: "2026-11-18", days: [], policy: {},
  kpis: { working_days: 0, present: 0, late: 0, absent: 0, half_day: 0, on_leave: 0, remote: 0, holiday: 0, weekly_off: 0, missed_punch: 0,
    expected_days: 0, attended_days: 0, attendance_rate: null, punched_days: 0, on_time_days: 0, punctuality_rate: null,
    avg_worked_minutes: 0, overtime_minutes: 0, approved_overtime_minutes: 0 } };
const NOTICE = { notice_id: 7, kind: "change", start_date: "2026-11-30",
  document: { id: 55, title: "Shift change notice", document_number: "TIM-004-1", needs_declaration: false, needs_otp: false } };

test("a waiting shift notice shows a banner that opens the document dialog and refreshes after acknowledging", async (t) => {
  let todayCalls = 0;
  t.mock.module("../src/components/documents/DocumentActionDialog.jsx", { exports: { default: ({ doc, mode, onDone }) =>
    h("div", { role: "dialog", "aria-label": `${mode} ${doc.title}` }, h("button", { type: "button", onClick: () => onDone({}) }, "I acknowledge")) } });
  t.mock.module("../src/service/attendanceService.js", { exports: {
    getMyAttendanceToday: async () => { todayCalls++; return { ...structuredClone(TODAY), pending_shift_notice: todayCalls === 1 ? NOTICE : null }; },
    getMyAttendanceMonth: async () => structuredClone(MONTH), getMyAttendanceDay: async () => ({}),
    punchIn: async () => ({}), punchOut: async () => ({}), startBreak: async () => ({}), endBreak: async () => ({}),
  } });
  const { default: Page } = await import("../src/pages/Peoples/Employees/ESS/Employee_EssAttendance.jsx");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(Page))));
  await settle();
  const banner = screen.getByRole("region", { name: "Shift notice" });
  assert.match(banner.textContent, /Your shift is changing from 30 Nov 2026/);
  fireEvent.click(within(banner).getByRole("button", { name: "Read and acknowledge" }));
  const dialog = screen.getByRole("dialog", { name: "acknowledge Shift change notice" });
  fireEvent.click(within(dialog).getByRole("button", { name: "I acknowledge" }));
  await settle();
  assert.equal(todayCalls, 2);
  assert.equal(screen.queryByRole("region", { name: "Shift notice" }), null);
});
