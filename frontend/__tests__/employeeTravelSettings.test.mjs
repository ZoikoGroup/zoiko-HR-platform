/** ZHR-96: Travel Settings only says "saved" when something real was entered and stored. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateTravelSettings, readTravelSettings, settingsChanged, travelSettingsPayload } from "../src/utils/travelSettingsPersonal.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("rules and helpers", () => {
  assert.deepEqual(validateTravelSettings({ currency: "INR", perDiem: "1500", autoNotify: false }), {});
  assert.match(validateTravelSettings({ currency: "INR", perDiem: "" }).perDiem, /Enter your daily per diem/);
  assert.match(validateTravelSettings({ currency: "INR", perDiem: "0" }).perDiem, /more than zero/);
  assert.match(validateTravelSettings({ currency: "INR", perDiem: "1.234" }).perDiem, /2 decimal/);
  assert.match(validateTravelSettings({ currency: "INR", perDiem: "99999999" }).perDiem, /too large/);
  assert.match(validateTravelSettings({ currency: "XYZ", perDiem: "5" }).currency, /currency/);
  assert.deepEqual(readTravelSettings({ travelPreferences: { currency: "USD", per_diem: 1500.5, auto_notify: true } }), { currency: "USD", perDiem: "1500.5", autoNotify: true });
  assert.deepEqual(readTravelSettings({}), { currency: "INR", perDiem: "", autoNotify: false });
  assert.equal(settingsChanged({ currency: "INR", perDiem: "1500.0", autoNotify: false }, { currency: "INR", perDiem: "1500", autoNotify: false }), false);
  assert.equal(settingsChanged({ currency: "INR", perDiem: "1600", autoNotify: false }, { currency: "INR", perDiem: "1500", autoNotify: false }), true);
  assert.deepEqual(travelSettingsPayload({ currency: "EUR", perDiem: " 900 ", autoNotify: true }), { travel_preferences: { currency: "EUR", per_diem: "900", auto_notify: true } });
});

async function load(t, stored = {}, over = {}) {
  const calls = [];
  t.mock.module("../src/service/employee.js", { exports: {
    getMyProfile: async () => ({ ...stored }),
    updateMyProfile: over.update || (async (p) => { calls.push(p); stored.travelPreferences = p.travel_preferences; return {}; }),
    ...(over.profile ? { getMyProfile: over.profile } : {}),
  } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Travel/Employee_TravelSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}
const save = async () => { fireEvent.click(screen.getByRole("button", { name: "Save Settings" })); await settle(); };

test("saving with nothing entered shows an error, not a success, and sends nothing", async (t) => {
  const calls = await load(t);
  await save();
  assert.equal(calls.length, 0);
  assert.match(document.body.textContent, /Enter your daily per diem limit/);
  assert.doesNotMatch(document.body.textContent, /saved successfully/);
  assert.equal(document.getElementById("ts-perdiem").getAttribute("aria-invalid"), "true");
});

test("entering a limit saves it, and a second save with no change says there is nothing to save", async (t) => {
  const stored = {};
  const calls = await load(t, stored);
  fireEvent.change(document.getElementById("ts-perdiem"), { target: { value: "1500" } });
  fireEvent.click(screen.getByRole("switch", { name: "Auto-notify Manager" }));
  await save();
  assert.deepEqual(calls, [{ travel_preferences: { currency: "INR", per_diem: "1500", auto_notify: true } }]);
  assert.match(document.body.textContent, /Settings saved successfully/);
  await save();
  assert.equal(calls.length, 1);
  assert.match(document.body.textContent, /Nothing to save/);
  assert.doesNotMatch(document.body.textContent, /saved successfully/);
});

test("saved values come back on a fresh load", async (t) => {
  await load(t, { travelPreferences: { currency: "GBP", per_diem: 80, auto_notify: true } });
  assert.equal(document.getElementById("ts-currency").value, "GBP");
  assert.equal(document.getElementById("ts-perdiem").value, "80");
  assert.equal(screen.getByRole("switch", { name: "Auto-notify Manager" }).getAttribute("aria-checked"), "true");
});

test("a refusal from the server is shown and nothing is claimed as saved; a failed load hides the form", async (t) => {
  await load(t, {}, { update: async () => { throw Object.assign(new Error("x"), { validation: [{ loc: ["body", "travel_preferences"], msg: "Value error, The per diem limit is too large." }] }); } });
  fireEvent.change(document.getElementById("ts-perdiem"), { target: { value: "500" } });
  await save();
  assert.match(document.body.textContent, /per diem limit is too large/);
  assert.doesNotMatch(document.body.textContent, /saved successfully/);
});

test("when the saved settings cannot be loaded the page says so and offers no form", async (t) => {
  await load(t, {}, { profile: async () => { throw new Error("Server unavailable"); } });
  assert.match(document.body.textContent, /Server unavailable/);
  assert.equal(document.getElementById("ts-perdiem"), null);
});
