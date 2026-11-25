/** Bug 10: interview times are chosen with AM / PM. components/TimeField.jsx keeps "HH:MM" (24 h) as its value. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

async function mount(initial = "") {
  const { default: TimeField } = await import(`../src/components/TimeField.jsx?t=${Math.random()}`);
  const seen = [];
  function Harness() {
    const [v, setV] = useState(initial);
    return React.createElement("div", null,
      React.createElement("label", { htmlFor: "t" }, "Start"),
      React.createElement(TimeField, { id: "t", label: "Start time", value: v, onChange: (x) => { seen.push(x); setV(x); } }));
  }
  render(React.createElement(Harness));
  return seen;
}
const hour = () => screen.getByLabelText("Start time: hour");
const minutes = () => screen.getByLabelText("Start time: minutes");
const period = () => screen.getByLabelText("Start time: AM or PM");

test("a 24-hour value shows as hour, minutes and AM / PM", async () => {
  await mount("14:30");
  assert.equal(hour().value, "2");
  assert.equal(minutes().value, "30");
  assert.equal(period().value, "PM");
  assert.deepEqual([...period().options].map((o) => o.textContent), ["AM", "PM"]);
});

test("midnight and noon read 12 AM and 12 PM", async () => {
  await mount("00:05");
  assert.equal(hour().value, "12");
  assert.equal(period().value, "AM");
  cleanup();
  await mount("12:00");
  assert.equal(hour().value, "12");
  assert.equal(period().value, "PM");
});

test("choosing parts gives back a 24-hour HH:MM", async () => {
  const seen = await mount("");
  assert.equal(hour().value, "");
  fireEvent.change(hour(), { target: { value: "3" } });            // 3 o'clock: afternoon is the likely half
  assert.equal(seen.at(-1), "15:00");
  fireEvent.change(minutes(), { target: { value: "45" } });
  assert.equal(seen.at(-1), "15:45");
  fireEvent.change(period(), { target: { value: "AM" } });
  assert.equal(seen.at(-1), "03:45");
  fireEvent.change(hour(), { target: { value: "10" } });           // keeps AM
  assert.equal(seen.at(-1), "10:45");
  fireEvent.change(hour(), { target: { value: "" } });
  assert.equal(seen.at(-1), "", "clearing the hour clears the time");
});

test("a fresh morning hour starts as AM, and a saved minute off the 5-minute step is kept", async () => {
  const seen = await mount("");
  fireEvent.change(hour(), { target: { value: "9" } });
  assert.equal(seen.at(-1), "09:00");
  cleanup();
  await mount("09:07");
  assert.equal(minutes().value, "7");
});

test("the label names the hour list, so the field is reachable from its label", async () => {
  await mount("09:00");
  assert.equal(screen.getByLabelText("Start").id, "t");
  assert.ok(screen.getByRole("group", { name: "Start time" }));
});
