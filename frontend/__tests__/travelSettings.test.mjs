/** ZHR-78: the Travel approval workflow saves, whichever workflow is chosen, and a failure is explained. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateSettings, settingsPayload, settingsToForm, serverSettingErrors, WORKFLOWS, DEFAULT_SETTINGS } from "../src/utils/travelSettingsForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("all three workflows are offered, with the exact values the server stores", () => {
  assert.deepEqual(WORKFLOWS.map((w) => w.value), ["manager", "manager+director", "manager+director+finance"]);
  for (const w of WORKFLOWS) assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, approval_workflow: w.value }), {});
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, approval_workflow: "ceo" }).approval_workflow);
});

test("every number is checked with a plain message", () => {
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, max_trip_duration: "" }).max_trip_duration, "Maximum trip duration is required.");
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, max_trip_duration: "0" }).max_trip_duration, /between 1 and 365 days/);
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, max_trip_duration: "2.5" }).max_trip_duration, /whole number/);
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, reimbursement_deadline: "400" }).reimbursement_deadline, /between 1 and 365/);
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, expense_limit_per_day: "10.123" }).expense_limit_per_day, /2 decimal places/);
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, auto_approve_threshold: "-5" }).auto_approve_threshold, /must be a number/);
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, expense_limit_per_day: "0", auto_approve_threshold: "0" }), {}, "zero is allowed where it makes sense");
});

test("payload, form values and server messages", () => {
  assert.deepEqual(settingsPayload({ approval_workflow: "manager+director+finance", expense_limit_per_day: "750.5", max_trip_duration: "14", auto_approve_threshold: "2000", reimbursement_deadline: "45", notification_enabled: false }),
    { approval_workflow: "manager+director+finance", expense_limit_per_day: 750.5, max_trip_duration: 14, auto_approve_threshold: 2000, reimbursement_deadline: 45, notification_enabled: false });
  assert.equal(settingsToForm({ approval_workflow: "manager+director", expense_limit_per_day: "750.50", max_trip_duration: 14 }).expense_limit_per_day, "750.5");
  assert.equal(settingsToForm({ approval_workflow: "weird" }).approval_workflow, "manager", "an unknown stored value falls back to the default shown");
  assert.equal(serverSettingErrors([{ loc: ["body", "approval_workflow"], msg: "Value error, Choose Manager Only, Manager + Director, or Manager + Director + Finance." }]).approval_workflow.startsWith("Choose Manager Only"), true);
});

async function load(t, { stored, putError, getError } = {}) {
  const calls = { put: [] };
  const api = {
    get: async () => { if (getError) throw getError; return stored ?? { id: 1, organization_id: 1, approval_workflow: "manager", expense_limit_per_day: "500.00", max_trip_duration: 30, auto_approve_threshold: 1000, reimbursement_deadline: 30, notification_enabled: true }; },
    put: async (path, body) => { calls.put.push([path, body]); if (putError) throw putError; return { id: 1, organization_id: 1, ...body, expense_limit_per_day: String(body.expense_limit_per_day) }; },
  };
  t.mock.module("../src/modules/zoiko-hr/travel/TravelLayout.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/api.js", { exports: { api } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/travel/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("choosing 'Manager + Director + Finance' (the longest) and saving sends it and reports success", async (t) => {
  const calls = await load(t);
  fireEvent.change(document.getElementById("ts-workflow"), { target: { value: "manager+director+finance" } });
  assert.match(document.body.textContent, /unsaved changes/);
  fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
  await settle();
  assert.equal(calls.put.length, 1);
  assert.equal(calls.put[0][0], "/hr/travel/settings");
  assert.equal(calls.put[0][1].approval_workflow, "manager+director+finance");
  assert.match(screen.getByRole("status").textContent, /Travel settings saved/);
  assert.equal(document.getElementById("ts-workflow").value, "manager+director+finance");
  assert.doesNotMatch(document.body.textContent, /unsaved changes/);
});

test("Enter in a number box saves the settings too", async (t) => {
  const calls = await load(t);
  const box = document.getElementById("ts-duration");
  fireEvent.change(box, { target: { value: "14" } });
  fireEvent.submit(box.form);
  await settle();
  assert.equal(calls.put[0][1].max_trip_duration, 14);
});

test("a bad value is refused with the message under its box and nothing is sent", async (t) => {
  const calls = await load(t);
  fireEvent.change(document.getElementById("ts-duration"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
  await settle();
  assert.equal(calls.put.length, 0);
  assert.match(document.body.textContent, /Maximum trip duration must be between 1 and 365 days\./);
  assert.match(screen.getAllByRole("alert")[0].textContent, /Some settings need attention/);
});

test("a failed save says why (not a generic pop-up), and keeps what was entered", async (t) => {
  await load(t, { putError: new Error("The settings could not be saved: the database refused the value.") });
  fireEvent.change(document.getElementById("ts-workflow"), { target: { value: "manager+director" } });
  fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
  await settle();
  assert.match(screen.getAllByRole("alert")[0].textContent, /database refused the value/);
  assert.equal(document.getElementById("ts-workflow").value, "manager+director");
});

test("a server refusal of a field shows under that field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "approval_workflow"], msg: "Value error, Choose Manager Only, Manager + Director, or Manager + Director + Finance." }] });
  await load(t, { putError: err });
  fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
  await settle();
  assert.match(document.body.textContent, /Choose Manager Only, Manager \+ Director/);
});

test("if the settings cannot be loaded the page says so instead of silently showing defaults", async (t) => {
  await load(t, { getError: new Error("Network down") });
  assert.match(screen.getByRole("alert").textContent, /Network down/);
});
