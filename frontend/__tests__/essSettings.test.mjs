/** ZHR-89: notification, language and timezone settings are saved and are still what was chosen after a reload. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function load(t, stored, over = {}, mock = true) {
  const calls = [];
  const svc = {
    getMyProfile: async () => ({ ...stored }),
    updateMyProfile: async (p) => { calls.push(p); Object.assign(stored, { notificationPreferences: p.notification_preferences, language: p.language, timezone: p.timezone }); return {}; },
    ...over,
  };
  if (mock) {
    t.mock.module("../src/service/employee.js", { exports: svc });
    t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  }
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/Employee_EssSettings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}
const on = (name) => screen.getByRole("switch", { name }).getAttribute("aria-checked");

test("turning email and push off is saved, sent in the server's field names, and still off after a reload", async (t) => {
  const stored = {};
  const calls = await load(t, stored);
  assert.equal(on("Email Notifications"), "true");               // defaults for someone who never saved
  fireEvent.click(screen.getByRole("switch", { name: "Email Notifications" }));
  fireEvent.click(screen.getByRole("switch", { name: "Push Notifications" }));
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.deepEqual(calls, [{ notification_preferences: { email: false, sms: false, push: false }, language: "English", timezone: "Asia/Kolkata" }]);
  assert.match(document.body.textContent, /Settings saved successfully/);
  cleanup();
  await load(t, stored, {}, false);                               // a fresh page load reads what the server kept
  assert.equal(on("Email Notifications"), "false");
  assert.equal(on("Push Notifications"), "false");
  assert.equal(on("SMS Notifications"), "false");
});

test("a saved 'off' is never turned back on by the defaults", async (t) => {
  await load(t, { notificationPreferences: { email: false, sms: true, push: false }, language: "Hindi", timezone: "UTC" });
  assert.deepEqual(["Email Notifications", "SMS Notifications", "Push Notifications"].map(on), ["false", "true", "false"]);
  assert.equal(document.querySelectorAll("select")[0].value, "Hindi");
  assert.equal(document.querySelectorAll("select")[1].value, "UTC");
});

test("when the settings cannot be loaded the page says so and does not offer to overwrite them", async (t) => {
  await load(t, {}, { getMyProfile: async () => { throw new Error("Server unavailable"); } });
  assert.match(document.body.textContent, /Server unavailable/);
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true);
});

test("a refused save is shown and nothing is claimed as saved", async (t) => {
  await load(t, {}, { updateMyProfile: async () => { throw new Error("Choose a language from the list."); } });
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.match(document.body.textContent, /Choose a language from the list/);
  assert.doesNotMatch(document.body.textContent, /Settings saved successfully/);
});
