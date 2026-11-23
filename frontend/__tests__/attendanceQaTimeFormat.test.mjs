/**
 * Attendance QA R1-25 / R2-1: one time format for every attendance screen (12-hour with AM/PM, no stored preference
 * yet) and the punch card's worked-time timer in HH:MM:SS, ticking every second, its interval cleared on unmount.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
  dayTotalsAt, formatClockTime, formatDuration, timeIn, timeIn24,
} from "../src/modules/zoiko-hr/attendance/constants.js";

afterEach(() => cleanup());
const h = React.createElement;

test("the shared clock format: 12-hour with AM/PM for wall times and instants", () => {
  assert.equal(formatClockTime("12:00"), "12:00 PM");
  assert.equal(formatClockTime("06:00"), "06:00 AM");
  assert.equal(formatClockTime("00:05"), "12:05 AM");
  assert.equal(formatClockTime("18:30:09", { seconds: true }), "06:30:09 PM");
  assert.equal(formatClockTime("2026-11-17T09:00:00"), "09:00 AM");                 // a stored local date-time
  assert.equal(formatClockTime("18:30", { hour12: false }), "18:30");
  assert.equal(formatClockTime(null), "—");
  assert.equal(timeIn("2026-11-18T03:55:00Z", "Asia/Kolkata"), "09:25 AM");          // an instant, in the person's zone
  assert.equal(timeIn24("2026-11-18T12:40:00Z", "Asia/Kolkata"), "18:10");           // for <input type="time">
  assert.equal(timeIn(null), "—");
});

test("durations are HH:MM:SS and the day's totals come from the punch and break instants", () => {
  assert.equal(formatDuration(0), "00:00:00");
  assert.equal(formatDuration(3725), "01:02:05");
  const day = { check_in_at: "2026-11-18T03:55:00Z", worked_minutes: 0, break_minutes: 0,
    breaks: [{ start_at: "2026-11-18T04:00:00Z", end_at: "2026-11-18T04:10:00Z" }] };
  assert.deepEqual(dayTotalsAt(day, Date.parse("2026-11-18T05:00:05Z")), { worked: 55 * 60 + 5, breaks: 600 });
  assert.deepEqual(dayTotalsAt({ worked_minutes: 65, break_minutes: 5 }, NaN), { worked: 3900, breaks: 300 });
});

test("the punch card timer shows seconds, ticks every second and clears its interval on unmount", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-11-18T05:00:00Z") });
  const { default: PunchCard } = await import(`../src/modules/zoiko-hr/attendance/components/PunchCard.jsx?t=${Math.random()}`);
  const today = { date: "2026-11-18", timezone: "Asia/Kolkata", status: "present", as_of: "2026-11-18T05:00:00Z",
    check_in_at: "2026-11-18T03:55:00Z", check_out_at: null, worked_minutes: 65, break_minutes: 0, late_minutes: 0, breaks: [],
    running: true, on_break: false, punch_enabled: true, can_punch_out: true, can_start_break: true };
  const { unmount } = render(h(PunchCard, { today }));
  const timer = () => screen.getByRole("timer", { name: "Worked time" }).textContent;
  assert.equal(timer(), "01:05:00");
  assert.equal(screen.getByLabelText("Current time").textContent, "10:30:00 AM");
  act(() => t.mock.timers.tick(1000));
  assert.equal(timer(), "01:05:01");
  act(() => t.mock.timers.tick(59_000));
  assert.equal(timer(), "01:06:00");

  const cleared = [];
  const realClear = globalThis.clearInterval;
  globalThis.clearInterval = (id) => { cleared.push(id); return realClear(id); };
  try {
    unmount();
  } finally {
    globalThis.clearInterval = realClear;
  }
  assert.equal(cleared.length, 1);
});

test("on a break the worked timer stops and the break timer runs", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-11-18T05:00:00Z") });
  const { default: PunchCard } = await import(`../src/modules/zoiko-hr/attendance/components/PunchCard.jsx?t=${Math.random()}`);
  const today = { date: "2026-11-18", timezone: "Asia/Kolkata", status: "present", as_of: "2026-11-18T05:00:00Z",
    check_in_at: "2026-11-18T03:55:00Z", check_out_at: null, worked_minutes: 60, break_minutes: 5, late_minutes: 0,
    breaks: [{ start_at: "2026-11-18T04:55:00Z", end_at: null }], running: true, on_break: true, punch_enabled: true };
  render(h(PunchCard, { today }));
  assert.equal(screen.getByRole("status").textContent, "On a break");
  assert.equal(screen.getByRole("timer", { name: "Break time" }).textContent, "00:05:00");
  act(() => t.mock.timers.tick(3000));
  assert.equal(screen.getByRole("timer", { name: "Break time" }).textContent, "00:05:03");
});
