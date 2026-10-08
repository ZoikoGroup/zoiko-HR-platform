/** ZHR-94: an employee cannot submit travel dates that have already passed; the page says why, under the date. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateTravelForm, travelPayload, serverTravelErrors, todayString } from "../src/utils/travelRequestForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayString(d); };

test("past dates, reversed dates and missing details are named field by field", () => {
  const ok = { destination: "Pune", purpose: "Client visit", from: addDays(2), to: addDays(4) };
  assert.deepEqual(validateTravelForm(ok), {});
  assert.deepEqual(validateTravelForm({ ...ok, from: todayString(), to: todayString() }), {}, "today is allowed");
  const past = validateTravelForm({ ...ok, from: addDays(-3), to: addDays(-1) });
  assert.match(past.from, /cannot be in the past/);
  assert.match(past.to, /cannot be in the past/);
  assert.match(validateTravelForm({ ...ok, from: addDays(5), to: addDays(2) }).to, /end date cannot be before the start date/i);
  const empty = validateTravelForm({ destination: " ", purpose: "", from: "", to: "" });
  assert.deepEqual(Object.keys(empty).sort(), ["destination", "from", "purpose", "to"]);
  assert.match(validateTravelForm({ ...ok, destination: "12345" }).destination, /real place name/);
  assert.deepEqual(travelPayload({ destination: " New   Delhi ", purpose: " x  y ", from: "2030-01-02", to: "2030-01-03" }), { destination: "New Delhi", purpose: "x y", start_date: "2030-01-02", end_date: "2030-01-03" });
});

test("server refusals land under the right box", () => {
  const a = serverTravelErrors({ validation: [{ loc: ["body", "destination"], msg: "Value error, Destination is required." }] });
  assert.equal(a.fieldErrors.destination, "Destination is required.");
  const b = serverTravelErrors({ message: "Travel dates cannot be in the past. Choose today or a later date." });
  assert.match(b.fieldErrors.from, /in the past/);
  assert.equal(serverTravelErrors({ message: "Server down" }).message, "Server down");
});

async function load(t) {
  const calls = [];
  t.mock.module("../src/service/employee.js", { exports: { getTravel: async () => [], createTravel: async (p) => { calls.push(p); return {}; } } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }) } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Travel/Employee_TravelRequests.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /New Request/ }));
  return calls;
}
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("submitting past dates shows a message and sends nothing; fixing the dates submits", async (t) => {
  const calls = await load(t);
  type("tr-destination", "Mumbai"); type("tr-purpose", "Client Meeting");
  type("tr-from", addDays(-4)); type("tr-to", addDays(-2));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(document.querySelectorAll("[role=alert]").length >= 2, true);
  assert.match(document.body.textContent, /Travel dates cannot be in the past/);
  assert.equal(document.getElementById("tr-from").getAttribute("aria-invalid"), "true");
  assert.equal(document.getElementById("tr-from").getAttribute("min"), todayString());
  type("tr-from", addDays(3)); type("tr-to", addDays(5));
  assert.doesNotMatch(document.body.textContent, /Travel dates cannot be in the past/, "message goes away when corrected");
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await settle();
  assert.deepEqual(calls, [{ destination: "Mumbai", purpose: "Client Meeting", start_date: addDays(3), end_date: addDays(5) }]);
  assert.match(document.body.textContent, /submitted successfully/);
});

test("moving the start date past the end date clears the end date", async (t) => {
  await load(t);
  type("tr-from", addDays(2)); type("tr-to", addDays(3));
  type("tr-from", addDays(6));
  assert.equal(document.getElementById("tr-to").value, "");
});
