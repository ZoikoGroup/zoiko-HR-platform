/** Bug 4: the state (and country) dropdowns can be searched. components/SearchableSelect.jsx */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const STATES = ["Andhra Pradesh", "Karnataka", "Kerala", "Tamil Nadu", "Telangana"];

async function mount(props = {}) {
  const { RegionSelect, CountrySelect } = await import(`../src/components/RemunerationFields.jsx?t=${Math.random()}`);
  const log = { changes: [], blurs: 0 };
  function Harness() {
    const [state, setState] = useState(props.state ?? "");
    const [country, setCountry] = useState("IN");
    return React.createElement("div", null,
      React.createElement("label", { htmlFor: "cty" }, "Country"),
      React.createElement(CountrySelect, { id: "cty", regions: { countries: [{ code: "IN", name: "India" }, { code: "US", name: "United States" }] },
        value: country, onChange: setCountry }),
      React.createElement("label", { htmlFor: "st" }, "State / UT"),
      React.createElement(RegionSelect, { id: "st", regions: STATES, value: state, placeholder: "Select state / ut",
        onChange: (v) => { log.changes.push(v); setState(v); } }));
  }
  render(React.createElement(Harness));
  return log;
}

test("the state dropdown has a search box: typing narrows the list and a click chooses", async () => {
  const log = await mount();
  const button = screen.getByLabelText("State / UT");
  assert.equal(button.tagName, "BUTTON");
  assert.match(button.textContent, /Select state \/ ut/);
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  const search = screen.getByRole("combobox", { name: "Search states" });
  fireEvent.change(search, { target: { value: "kar" } });
  await settle();
  const options = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
  assert.deepEqual(options, ["Karnataka"]);
  fireEvent.click(screen.getByRole("option", { name: "Karnataka" }));
  await settle();
  assert.deepEqual(log.changes, ["Karnataka"]);
  assert.equal(button.value, "Karnataka");
  assert.match(button.textContent, /Karnataka/);
});

test("the first entry clears the choice, and an empty search shows everything", async () => {
  const log = await mount({ state: "Kerala" });
  fireEvent.mouseDown(screen.getByLabelText("State / UT"), { button: 0 });
  await settle();
  const options = within(screen.getByRole("listbox")).getAllByRole("option");
  assert.equal(options.length, STATES.length + 1);
  assert.equal(options[0].textContent, "Select state / ut");
  fireEvent.click(options[0]);
  await settle();
  assert.deepEqual(log.changes, [""]);
});

test("the country dropdown searches by name or ISO code", async () => {
  await mount();
  const button = screen.getByLabelText("Country");
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  fireEvent.change(screen.getByRole("combobox", { name: "Search countries" }), { target: { value: "us" } });
  await settle();
  assert.ok(within(screen.getByRole("listbox")).getAllByRole("option").some((o) => o.textContent === "United States"));
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Search countries" }), { key: "Escape" });
  await settle();
  assert.equal(screen.queryByRole("listbox"), null);
});
