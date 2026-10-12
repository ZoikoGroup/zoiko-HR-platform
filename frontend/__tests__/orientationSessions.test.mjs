/** ZHR-70: an orientation session can be moved to another valid future date, and its form names every problem. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { validateSessionForm, sessionPayload, serverSessionErrors, todayIso } from "../src/utils/orientationForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return todayIso(d); };

test("a future date is valid, an old date is not, and a session already in the past stays editable", () => {
  const ok = { title: "Welcome", date: iso(30) };
  assert.deepEqual(validateSessionForm(ok), {});
  assert.equal(validateSessionForm({ ...ok, date: "2020-01-01" }).date, "Choose today or a later date.");
  assert.deepEqual(validateSessionForm({ ...ok, date: "2020-01-01" }, { originalDate: "2020-01-01" }), {}, "unchanged past date is fine");
  assert.equal(validateSessionForm({ ...ok, date: todayIso() }).date, undefined, "today is allowed");
  assert.match(validateSessionForm({ ...ok, date: "2101-01-01" }).date, /2000 and 2100/);
  assert.deepEqual(validateSessionForm({ title: " ", date: "" }), { title: "Title is required.", date: "Date is required." });
  const bad = validateSessionForm({ ...ok, time: "25:00", meeting_link: "abc", location: "x".repeat(201) });
  assert.deepEqual(Object.keys(bad).sort(), ["location", "meeting_link", "time"]);
});

test("the payload is trimmed, empty fields are null, and status is sent only when editing", () => {
  const f = { title: "  Welcome   day ", date: "2027-01-05", time: "", location: " Room A ", meeting_link: "", presenter: " ", status: "completed" };
  assert.deepEqual(sessionPayload(f, false), { title: "Welcome day", date: "2027-01-05", time: null, location: "Room A", meeting_link: null, presenter: null });
  assert.equal(sessionPayload(f, true).status, "completed");
  assert.equal(serverSessionErrors([{ loc: ["body", "date"], msg: "Value error, Choose today or a later date." }]).date, "Choose today or a later date.");
});

const SESSION = { id: 4, title: "Welcome", date: iso(10), time: "10:30", location: "Room A", meeting_link: "", presenter: "Sam", status: "scheduled" };

async function load(t, over = {}) {
  const calls = { update: [], create: [] };
  const svc = {
    getOnboardingOrientationSessions: async () => [SESSION],
    getOnboardingOrientationAttendees: async () => [{ id: 1, session_id: 4, onboarding_new_hire_id: 7, status: "attended" }, { id: 2, session_id: 4, onboarding_new_hire_id: 8, status: "pending" }],
    getOnboardingRecords: async () => [],
    createOnboardingOrientationSession: async (p) => { calls.create.push(p); return {}; },
    updateOnboardingOrientationSession: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw over.updateError; return {}; },
    deleteOnboardingOrientationSession: async () => ({}), createOnboardingOrientationAttendee: async () => ({}),
    updateOnboardingOrientationAttendee: async () => ({}), deleteOnboardingOrientationAttendee: async () => ({}),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/orientation.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("Edit opens with the saved values, and the date can be moved to another future date", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  assert.equal(document.getElementById("os-date").value, SESSION.date);
  assert.equal(document.getElementById("os-title").value, "Welcome");
  fireEvent.change(document.getElementById("os-date"), { target: { value: iso(45) } });
  fireEvent.click(screen.getByRole("button", { name: "Update Session" }));
  await settle();
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0][0], 4);
  assert.equal(calls.update[0][1].date, iso(45));
  assert.equal(document.querySelector(".fixed"), null, "the dialog closes after saving");
});

test("a past date is refused under the Date box, and the dialog keeps what was typed", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(document.getElementById("os-date"), { target: { value: "2020-01-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Update Session" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Choose today or a later date\./);
  assert.equal(calls.update.length, 0);
  fireEvent.change(document.getElementById("os-date"), { target: { value: iso(3) } });
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Choose today/);
});

test("a server refusal stays in the dialog under its field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "meeting_link"], msg: "Value error, Enter a valid link starting with http:// or https://." }] });
  await load(t, { updateError: err });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Update Session" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /valid link/);
});

test("the summary tiles count every session's attendees without opening any", async (t) => {
  await load(t);
  const tile = (label) => screen.getByText(label).parentElement.textContent;
  assert.match(tile("Total Attendees"), /2/);
  assert.match(tile("Attended"), /1/);
  assert.match(tile("Pending"), /1/);
});
