/** ZHR-66: an interview's status moves forward only and can never flip between completed and cancelled. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { nextStatuses, cardActions, statusOptions, validateInterviewForm } from "../src/utils/interviewFlow.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("there is no way between completed and cancelled", () => {
  assert.deepEqual(nextStatuses("completed"), []);
  assert.ok(!nextStatuses("cancelled").includes("completed"));
  assert.deepEqual(nextStatuses("cancelled"), ["scheduled"]);
  assert.deepEqual(nextStatuses("scheduled"), ["in_progress", "completed", "cancelled"]);
  assert.deepEqual(nextStatuses("in_progress"), ["completed", "cancelled"]);
  assert.deepEqual(statusOptions("completed").map((o) => o.value), ["completed"]);
  assert.deepEqual(statusOptions("cancelled").map((o) => o.value), ["cancelled", "scheduled"]);
  assert.deepEqual(cardActions("completed"), []);
  assert.equal(cardActions("scheduled").find((a) => a.status === "cancelled").confirm, "Cancel this interview?");
});

test("the form names what is missing", () => {
  assert.deepEqual(validateInterviewForm({ candidate_name: " ", position: "", interview_date: "" }),
    { candidate_name: "Candidate name is required.", position: "Position is required.", interview_date: "Interview date is required." });
  assert.deepEqual(validateInterviewForm({ candidate_name: "Ann", position: "Dev", interview_date: "2026-11-01" }), {});
});

const IV = (id, status, name) => ({ id, candidate_name: name, position: "Dev", interview_type: "video", interview_date: "2026-11-01", status });

async function load(t, over = {}) {
  const calls = { update: [] };
  const svc = {
    getInterviews: async () => ({ items: over.items ?? [IV(1, "completed", "Done Dan"), IV(2, "cancelled", "Gone Gus"), IV(3, "scheduled", "Soon Sue")] }),
    createInterview: async () => ({}), updateInterviewFeedback: async () => ({}),
    updateInterview: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw new Error(over.updateError); return {}; },
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/interviews.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const card = (name) => screen.getByText(name).closest("div.bg-white");

test("a completed card has no actions, a cancelled card can only be rescheduled, and nothing offers completed <-> cancelled", async (t) => {
  const calls = await load(t);
  const done = within(card("Done Dan"));
  assert.equal(done.queryAllByRole("button").length, 0);
  assert.ok(done.getByText("Final"));
  const gone = within(card("Gone Gus")).getAllByRole("button").map((b) => b.textContent);
  assert.deepEqual(gone, ["Reschedule"]);
  fireEvent.click(within(card("Gone Gus")).getByRole("button", { name: "Reschedule" }));
  await settle();
  assert.deepEqual(calls.update, [[2, { status: "scheduled" }]]);
});

test("cancelling asks first, and a refusal from the server is shown without wiping the page", async (t) => {
  const calls = await load(t, { updateError: "An interview that is scheduled cannot be changed." });
  const original = globalThis.window.confirm;
  globalThis.window.confirm = () => false;
  fireEvent.click(within(card("Soon Sue")).getByRole("button", { name: "Cancel interview" }));
  await settle();
  assert.equal(calls.update.length, 0, "declining the question changes nothing");
  globalThis.window.confirm = () => true;
  fireEvent.click(within(card("Soon Sue")).getByRole("button", { name: "Cancel interview" }));
  await settle();
  globalThis.window.confirm = original;
  assert.equal(calls.update.length, 1);
  assert.match(screen.getAllByRole("alert")[0].textContent, /cannot be changed/);
  assert.ok(screen.getByText("Soon Sue"), "the board is still there");
});

test("editing a completed interview offers no way to change its status and does not send one", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  const row = screen.getByText("Done Dan").closest("tr");
  fireEvent.click(within(row).getAllByRole("button")[0]);
  const status = document.getElementById("iv-status");
  assert.equal(status.disabled, true);
  assert.deepEqual([...status.options].map((o) => o.value), ["completed"]);
  fireEvent.change(document.getElementById("iv-interviewer"), { target: { value: "Bob" } });
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  await settle();
  assert.equal(calls.update.length, 1);
  assert.ok(!("status" in calls.update[0][1]));
  assert.equal(calls.update[0][1].interviewer, "Bob");
});

test("scheduling with nothing entered shows field messages and sends nothing", async (t) => {
  const calls = await load(t, { items: [] });
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  fireEvent.click(screen.getByRole("button", { name: /Schedule Interview/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /Candidate name is required\./);
  assert.match(text, /Position is required\./);
  assert.match(text, /Interview date is required\./);
  assert.equal(calls.update.length, 0);
});
