/**
 * QA round 1, Employee Documents reminders:
 * R1-15 the reminder dialog takes an optional date and time (past refused, empty = send now);
 * R1-16 what the per-document cooldown left out is said in the notice.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { localDateValue, localTimeValue, reminderSchedule } from "../src/modules/zoiko-hr/documents/validation.js";
import { bulkReminderNotice, reminderNotice } from "../src/modules/zoiko-hr/documents/constants.js";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

// ── R1-15: the schedule rule ─────────────────────────────────────────────────────────────────────────────────────────

test("reminderSchedule: empty sends now, half-filled or past is refused, the future becomes ISO UTC", () => {
  const now = new Date(2026, 10, 23, 10, 0, 0);
  assert.deepEqual(reminderSchedule("", "", now), { scheduledFor: null, errors: {} });
  assert.match(reminderSchedule("2026-11-24", "", now).errors.schedule, /Choose a time/);
  assert.match(reminderSchedule("", "09:00", now).errors.schedule, /Choose a date/);
  assert.match(reminderSchedule("2026-11-23", "09:59", now).errors.schedule, /future/);
  assert.match(reminderSchedule("2026-11-23", "10:00", now).errors.schedule, /future/, "this very minute is not the future");
  const ok = reminderSchedule("2026-11-24", "09:30", now);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.scheduledFor, new Date(2026, 10, 24, 9, 30).toISOString());
  assert.ok(ok.scheduledFor.endsWith("Z"));
});

test("the reminder notices say scheduled, sent, and what the cooldown left out", () => {
  assert.match(reminderNotice({ scheduled: true, scheduled_for: "2026-12-01T09:30:00Z" }), /^Reminder scheduled for /);
  assert.equal(reminderNotice({ sent: 1, categories: ["education"], cooling_down: [] }), "Reminder sent.");
  assert.match(reminderNotice({ sent: 1, categories: ["education"], cooling_down: ["identity_proof"] }), /1 document was left out/);
  assert.match(reminderNotice({ sent: 0, categories: [] }), /Nothing is missing/);
  assert.equal(bulkReminderNotice({ sent: 0, skipped: 0, scheduled: 3 }), "Reminders scheduled for 3 employees.");
});

async function renderDialog(onSubmit) {
  const { default: ReminderDialog } = await import(`../src/modules/zoiko-hr/documents/components/ReminderDialog.jsx?t=${Math.random()}`);
  render(h(ReminderDialog, { open: true, who: "Asha Rao", onSubmit, onClose: () => {} }));
  return screen.getByRole("dialog", { name: /Send a reminder to Asha Rao/ });
}

test("the reminder dialog sends now when the date and time are left empty", async () => {
  const sent = [];
  const dialog = await renderDialog(async (v) => { sent.push(v); });
  fireEvent.change(within(dialog).getByLabelText("Note (optional)"), { target: { value: "Before Friday" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send reminder" }));
  await settle();
  assert.deepEqual(sent, [{ message: "Before Friday", scheduledFor: undefined }]);
});

test("the reminder dialog refuses a time in the past and schedules a future one", async () => {
  const sent = [];
  const dialog = await renderDialog(async (v) => { sent.push(v); });
  const past = new Date(Date.now() - 2 * 3600 * 1000);
  fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: localDateValue(past) } });
  fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: localTimeValue(past) } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Schedule reminder" }));
  await settle();
  assert.match(within(dialog).getByRole("alert").textContent, /future/);
  assert.equal(sent.length, 0);
  const later = new Date(Date.now() + 26 * 3600 * 1000);
  fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: localDateValue(later) } });
  fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: "09:30" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Schedule reminder" }));
  await settle();
  assert.equal(sent.length, 1);
  const expected = new Date(later.getFullYear(), later.getMonth(), later.getDate(), 9, 30).toISOString();
  assert.equal(sent[0].scheduledFor, expected);
  assert.ok(within(dialog).getByLabelText("Date").getAttribute("min"), "the picker does not offer past days");
});
