/**
 * The one clock format (utils/dateTime.js formatTime12h): 12-hour with AM/PM and a two-digit hour, seconds on request,
 * ISO instants converted to a time zone first, wall-clock "HH:MM[:SS]" shown as written, "—" for nothing. Plus
 * dayOffset for the "+1 day" hint on an overnight check-out. Attendance keeps its old name (formatClockTime).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOffset, DEFAULT_HOUR12, formatTime12h } from "../src/utils/dateTime.js";
import { formatClockTime, timeIn, timeIn24 } from "../src/modules/zoiko-hr/attendance/constants.js";

test("the required examples, with seconds", () => {
  const s = { seconds: true };
  assert.equal(formatTime12h("15:08:09", s), "03:08:09 PM");
  assert.equal(formatTime12h("09:30:00", s), "09:30:00 AM");
  assert.equal(formatTime12h("00:00:00", s), "12:00:00 AM");
  assert.equal(formatTime12h("12:00:00", s), "12:00:00 PM");
  assert.equal(formatTime12h("23:59:59", s), "11:59:59 PM");
});

test("the compact variant drops the seconds; a plain HH:MM is fine too", () => {
  assert.equal(formatTime12h("15:08:09"), "03:08 PM");
  assert.equal(formatTime12h("15:08"), "03:08 PM");
  assert.equal(formatTime12h("9:05"), "09:05 AM");                          // one-digit hour from the API
  assert.equal(formatTime12h("2026-11-23T18:30:00"), "06:30 PM");           // a stored local date-time: as written
});

test("nothing to show is a dash; unreadable text is left as it is", () => {
  for (const v of [null, undefined, ""]) assert.equal(formatTime12h(v), "—");
  assert.equal(formatTime12h(null, { empty: "" }), "");
  assert.equal(formatTime12h("soon"), "soon");
  assert.equal(formatTime12h("25:00"), "25:00");                            // not a real time: never shown as one
});

test("an ISO instant is converted to the time zone first", () => {
  assert.equal(formatTime12h("2026-11-23T09:38:09Z", { timeZone: "Asia/Kolkata", seconds: true }), "03:08:09 PM");
  assert.equal(formatTime12h("2026-11-23T18:30:00Z", { timeZone: "Asia/Kolkata" }), "12:00 AM");    // midnight IST
  assert.equal(formatTime12h("2026-11-23T06:30:00Z", { timeZone: "Asia/Kolkata" }), "12:00 PM");    // noon IST
  assert.equal(formatTime12h("2026-11-23T09:38:09+05:30", { timeZone: "UTC" }), "04:08 AM");        // an offset counts too
  assert.equal(formatTime12h(Date.parse("2026-11-23T09:38:09Z"), { timeZone: "Asia/Kolkata" }), "03:08 PM");
  assert.equal(formatTime12h("2026-11-23T09:38:09Z", { timeZone: "Not/AZone" }) === "—", false);   // bad zone: browser zone, still a time
});

test("hour12 false gives 24-hour HH:MM for <input type=time>", () => {
  assert.equal(DEFAULT_HOUR12, true);
  assert.equal(formatTime12h("2026-11-23T12:40:00Z", { timeZone: "Asia/Kolkata", hour12: false }), "18:10");
  assert.equal(timeIn24("2026-11-23T12:40:00Z", "Asia/Kolkata"), "18:10");
});

test("attendance keeps its names and gets the same output", () => {
  assert.equal(formatClockTime, formatTime12h);
  assert.equal(timeIn("2026-11-23T03:55:00Z", "Asia/Kolkata"), "09:25 AM");
  assert.equal(timeIn(null, "Asia/Kolkata"), "—");
});

test("dayOffset marks an overnight check-out as the next day, in the person's zone", () => {
  // a night shift that started on 23 Nov: out at 06:05 IST on 24 Nov (00:35 UTC on 24 Nov)
  assert.equal(dayOffset("2026-11-24T00:35:00Z", "2026-11-23", "Asia/Kolkata"), 1);
  // 23:30 IST on 23 Nov is 18:00 UTC the same day: same day
  assert.equal(dayOffset("2026-11-23T18:00:00Z", "2026-11-23", "Asia/Kolkata"), 0);
  // 19:00 UTC on 23 Nov is 00:30 IST on 24 Nov: the zone decides
  assert.equal(dayOffset("2026-11-23T19:00:00Z", "2026-11-23", "Asia/Kolkata"), 1);
  assert.equal(dayOffset("2026-11-23T19:00:00Z", "2026-11-23", "UTC"), 0);
  assert.equal(dayOffset(null, "2026-11-23", "Asia/Kolkata"), null);
  assert.equal(dayOffset("2026-11-24T00:35:00Z", null, "Asia/Kolkata"), null);
});
