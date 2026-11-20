/**
 * Attendance M4: asking for a correction — from a day in My Attendance (prefilled, the day is fixed) and on the Time
 * Requests page (any date, ?date= prefills). Each kind sends the right fields; server refusals are shown.
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

const DAY = { date: "2026-11-17", timezone: "Asia/Kolkata", status: "missed_punch", check_in_at: "2026-11-17T03:30:00Z", check_out_at: null,
  worked_minutes: 0, break_minutes: 0, late_minutes: 0, overtime_minutes: 0, breaks: [], history: [], notes: null, source: "web" };

const impl = {};
const mocked = new WeakSet();
function mockAll(t, over = {}) {
  const sent = [];
  Object.assign(impl, {
    requestCorrection: async (body) => { sent.push(body); return { id: 9, status: "PENDING", ...body }; },
    listCorrections: async () => ({ items: [{ id: 3, date: "2026-11-10", kind: "wrong_status", status: "APPROVED" }] }),
    listOvertime: async () => ({ items: [] }), requestOvertime: async () => ({}),
    getMyAttendanceDay: async () => structuredClone(DAY),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    const fwd = (names) => Object.fromEntries(names.map((k) => [k, (...a) => impl[k](...a)]));
    t.mock.module("../src/service/workDocumentsService.js", { exports: fwd(["requestCorrection", "listCorrections", "listOvertime", "requestOvertime"]) });
    t.mock.module("../src/service/attendanceService.js", { exports: {
      ...fwd(["getMyAttendanceDay"]),
      getMyAttendanceToday: async () => ({}), getMyAttendanceMonth: async () => ({}), punchIn: async () => ({}), punchOut: async () => ({}),
      startBreak: async () => ({}), endBreak: async () => ({}),
    } });
  }
  return sent;
}

function withProviders(node, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [path] }, node));
}

test("from a day: a missed punch-out is prefilled with the local check-in and sent for that day", async (t) => {
  const sent = mockAll(t);
  const { default: Drawer } = await import(`../src/modules/zoiko-hr/attendance/components/DayDetailDrawer.jsx?t=${Math.random()}`);
  render(withProviders(h(Drawer, { date: "2026-11-17", onClose: () => {} })));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Request a correction/ }));
  const form = screen.getByRole("form", { name: "Attendance correction" });
  assert.equal(within(form).getByRole("radio", { name: /Missed punch/ }).checked, true);
  assert.equal(within(form).queryByLabelText("Date"), null);                                   // the day is fixed
  assert.equal(within(form).getByLabelText(/Check-in/).value, "09:00");                        // 03:30 UTC in Kolkata
  fireEvent.change(within(form).getByLabelText("Check-out"), { target: { value: "18:30" } });
  const send = within(form).getByRole("button", { name: /Send correction/ });
  assert.equal(send.disabled, true);                                                           // not confirmed yet
  fireEvent.click(within(form).getByRole("checkbox", { name: /accurate/ }));
  fireEvent.click(send);
  await settle();
  assert.deepEqual(sent, [{ date: "2026-11-17", kind: "missed_punch", reason: "forgot", reason_detail: null, confirm_accurate: true,
    requested_check_in: "09:00", requested_check_out: "18:30" }]);
  assert.match(screen.getByRole("status").textContent, /changes only if it is approved/);
});

test("on Time Requests: wrong status and breaks send their own fields, ?date= prefills", async (t) => {
  const sent = mockAll(t);
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/Employee_TimeRequests.jsx?t=${Math.random()}`);
  render(withProviders(h(Page), "/employee/ess/time-requests?date=2026-11-12"));
  await settle();
  const form = screen.getByRole("form", { name: "Attendance correction" });
  assert.equal(within(form).getByLabelText("Date").value, "2026-11-12");
  fireEvent.click(within(form).getByRole("radio", { name: /Wrong status/ }));
  fireEvent.change(within(form).getByLabelText(/The day should be/), { target: { value: "remote" } });
  fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "off_site" } });
  fireEvent.click(within(form).getByRole("checkbox", { name: /accurate/ }));
  fireEvent.click(within(form).getByRole("button", { name: /Send correction/ }));
  await settle();
  assert.deepEqual(sent[0], { date: "2026-11-12", kind: "wrong_status", reason: "off_site", reason_detail: null, confirm_accurate: true,
    requested_status: "remote" });
  assert.match(screen.getByRole("status").textContent, /Correction sent/);
  // the form resets for the next request
  const fresh = screen.getByRole("form", { name: "Attendance correction" });
  fireEvent.click(within(fresh).getByRole("radio", { name: /Breaks/ }));
  fireEvent.change(within(fresh).getByLabelText("Date"), { target: { value: "2026-11-13" } });
  fireEvent.change(within(fresh).getByLabelText("Break 1 start"), { target: { value: "13:00" } });
  fireEvent.change(within(fresh).getByLabelText("Break 1 end"), { target: { value: "13:30" } });
  fireEvent.click(within(fresh).getByRole("button", { name: /Add a break/ }));
  fireEvent.change(within(fresh).getByLabelText("Break 2 start"), { target: { value: "16:00" } });
  fireEvent.change(within(fresh).getByLabelText("Break 2 end"), { target: { value: "16:10" } });
  fireEvent.click(within(fresh).getByRole("checkbox", { name: /accurate/ }));
  fireEvent.click(within(fresh).getByRole("button", { name: /Send correction/ }));
  await settle();
  assert.deepEqual(sent[1].requested_breaks, [{ start: "13:00", end: "13:30" }, { start: "16:00", end: "16:10" }]);
  assert.equal(sent[1].kind, "break");
  assert.ok(screen.getByText(/Wrong status · Approved/));                                      // the list names the kind
});

test("the server's refusal is shown in the form", async (t) => {
  mockAll(t, { requestCorrection: async () => { throw new Error("A correction for this day is already waiting for a decision."); } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/Employee_TimeRequests.jsx?t=${Math.random()}`);
  render(withProviders(h(Page), "/employee/ess/time-requests?date=2026-11-12"));
  await settle();
  const form = screen.getByRole("form", { name: "Attendance correction" });
  fireEvent.change(within(form).getByLabelText(/Check-in/), { target: { value: "09:00" } });
  fireEvent.change(within(form).getByLabelText("Check-out"), { target: { value: "18:00" } });
  fireEvent.click(within(form).getByRole("checkbox", { name: /accurate/ }));
  fireEvent.click(within(form).getByRole("button", { name: /Send correction/ }));
  await settle();
  assert.match(within(form).getByRole("alert").textContent, /already waiting/);
});

test("review pages describe each kind of correction in words", async () => {
  const { correctionSummary } = await import("../src/modules/zoiko-hr/attendance/constants.js");
  assert.equal(correctionSummary({ kind: "missed_punch", requested_check_in: "2026-11-17T09:00:00", requested_check_out: "2026-11-17T18:30:00" }), "Missed punch: 09:00–18:30");
  assert.equal(correctionSummary({ kind: "wrong_status", requested_status: "remote" }), "Wrong status: Remote");
  assert.equal(correctionSummary({ kind: "break", requested_breaks: [{ start: "13:00", end: "13:30" }] }), "Breaks: 13:00–13:30");
  assert.equal(correctionSummary({ requested_check_in: "09:05", requested_check_out: "17:00" }), "Missed punch: 09:05–17:00");   // older requests
});
