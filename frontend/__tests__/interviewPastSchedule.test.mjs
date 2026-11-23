/** QA-R1-1: an interview cannot be scheduled, or moved, into the past; "now" is read in the interview's own time zone. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAST_INTERVIEW_MESSAGE, nowIn, pastScheduleErrors, schedulesTime, validateInterviewForm } from "../src/utils/interviewFlow.js";

// 2026-11-23 10:30 UTC = 16:00 in Kolkata, 05:30 in New York
const NOW = Date.UTC(2026, 10, 23, 10, 30);
const base = { candidate_name: "Ann Lee", position: "Dev", interviewer: "Rahul Mehta", interview_type: "video" };

test("now is read in the given zone", () => {
  assert.deepEqual(nowIn("Asia/Kolkata", NOW), { day: "2026-11-23", time: "16:00" });
  assert.deepEqual(nowIn("America/New_York", NOW), { day: "2026-11-23", time: "05:30" });
  assert.deepEqual(nowIn("Pacific/Kiritimati", NOW), { day: "2026-11-24", time: "00:30" });
});

test("a past date or an earlier time today is refused on a new interview", () => {
  const f = { ...base, timezone: "Asia/Kolkata" };
  assert.deepEqual(pastScheduleErrors({ ...f, interview_date: "2026-11-22" }, { now: NOW }), { interview_date: PAST_INTERVIEW_MESSAGE });
  assert.deepEqual(pastScheduleErrors({ ...f, interview_date: "2026-11-23", start_time: "15:30" }, { now: NOW }), { start_time: PAST_INTERVIEW_MESSAGE });
  assert.deepEqual(pastScheduleErrors({ ...f, interview_date: "2026-11-23", start_time: "16:30" }, { now: NOW }), {});
  assert.deepEqual(pastScheduleErrors({ ...f, interview_date: "2026-11-23" }, { now: NOW }), {});          // no time: today is fine
  // 09:00 today has passed in Kolkata but not in New York
  assert.deepEqual(pastScheduleErrors({ ...base, timezone: "America/New_York", interview_date: "2026-11-23", start_time: "09:00" }, { now: NOW }), {});
  // the Kiritimati day has already moved on
  assert.ok(pastScheduleErrors({ ...base, timezone: "Pacific/Kiritimati", interview_date: "2026-11-23" }, { now: NOW }).interview_date);
});

test("the form shows the message only when asked to check the clock", () => {
  const f = { ...base, timezone: "Asia/Kolkata", interview_date: "2026-11-01" };
  assert.deepEqual(validateInterviewForm(f), {});
  assert.deepEqual(validateInterviewForm(f, { now: NOW }), { interview_date: PAST_INTERVIEW_MESSAGE });
});

test("editing a past interview without moving it is allowed; moving it or reinstating it is checked", () => {
  const original = { interview_date: "2026-11-10", start_time: "10:00", end_time: "11:00", timezone: "Asia/Kolkata", status: "scheduled" };
  const same = { ...base, ...original, notes: "Went well", status: "completed" };
  assert.equal(schedulesTime(same, original), false);
  assert.deepEqual(validateInterviewForm(same, { original, now: NOW }), {});
  assert.deepEqual(pastScheduleErrors({ ...same, start_time: "10:30" }, { original, now: NOW }), { interview_date: PAST_INTERVIEW_MESSAGE });
  assert.deepEqual(pastScheduleErrors({ ...same, interview_date: "2026-11-30" }, { original, now: NOW }), {});
  const cancelled = { ...original, status: "cancelled" };
  assert.equal(schedulesTime({ ...base, ...original, status: "scheduled" }, cancelled), true);
});
