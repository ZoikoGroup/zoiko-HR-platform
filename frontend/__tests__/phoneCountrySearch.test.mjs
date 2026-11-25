/** Bug 3: the phone country code is a searchable list (name, +code, digits or ISO code) that opens in its own layer. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

async function mount(initial = "") {
  const { default: PhoneField } = await import(`../src/components/PhoneField.jsx?t=${Math.random()}`);
  const seen = [];
  function Harness() {
    const [v, setV] = useState(initial);
    return React.createElement(PhoneField, { id: "ph", value: v, country: "India", onChange: (x) => { seen.push(x); setV(x); } });
  }
  render(React.createElement(Harness));
  return seen;
}

test("the code button opens a search box; typing a country name finds it and choosing it sets the code", async () => {
  const seen = await mount();
  fireEvent.change(document.getElementById("ph"), { target: { value: "9876543210" } });
  const button = screen.getByRole("button", { name: "Phone country code" });
  assert.match(button.textContent, /\+91 IN/);
  fireEvent.click(button);
  await settle();
  const search = screen.getByRole("combobox", { name: "Search countries" });
  assert.equal(document.activeElement === search, true, "the search box is focused when the list opens");
  fireEvent.change(search, { target: { value: "hondu" } });
  await settle();
  const list = screen.getByRole("listbox", { name: "Countries" });
  const options = within(list).getAllByRole("option");
  assert.equal(options.length, 1);
  assert.match(options[0].textContent, /\+504\s*Honduras/);
  fireEvent.click(options[0]);
  await settle();
  assert.equal(screen.queryByRole("listbox"), null, "the list closes after choosing");
  assert.match(button.textContent, /\+504 HN/);
  assert.equal(seen.at(-1), "+504 9876543210");
});

test("searching by calling code, digits or ISO code works, and the keyboard can choose", async () => {
  await mount("+91 98765 43210");
  const button = screen.getByRole("button", { name: "Phone country code" });
  fireEvent.click(button);
  await settle();
  const search = screen.getByRole("combobox", { name: "Search countries" });
  fireEvent.change(search, { target: { value: "+44" } });
  await settle();
  assert.ok(within(screen.getByRole("listbox")).getAllByRole("option").some((o) => /United Kingdom/.test(o.textContent)));
  fireEvent.change(search, { target: { value: "971" } });
  await settle();
  assert.match(within(screen.getByRole("listbox")).getAllByRole("option")[0].textContent, /United Arab Emirates/);
  fireEvent.change(search, { target: { value: "us" } });
  await settle();
  assert.ok(within(screen.getByRole("listbox")).getAllByRole("option").some((o) => /United States/.test(o.textContent)));
  fireEvent.change(search, { target: { value: "zzzz" } });
  await settle();
  assert.match(screen.getByRole("listbox").textContent, /No country matches/);
  // keyboard: search Germany, Enter picks it
  fireEvent.change(search, { target: { value: "germ" } });
  await settle();
  fireEvent.keyDown(search, { key: "Enter" });
  await settle();
  assert.match(button.textContent, /\+49 DE/);
  // Escape closes without changing anything
  fireEvent.click(button);
  await settle();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Search countries" }), { key: "Escape" });
  await settle();
  assert.equal(screen.queryByRole("listbox"), null);
  assert.match(button.textContent, /\+49 DE/);
});

test("the list is drawn in its own layer on the page body, not inside the form", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Phone country code" }));
  await settle();
  const list = screen.getByRole("listbox");
  assert.ok(!document.getElementById("ph").parentElement.parentElement.contains(list));
  assert.equal(list.closest("[style]").style.position, "fixed");
});

test("a mouse press opens the list (so a form that grows on blur cannot swallow the click)", async () => {
  await mount();
  const button = screen.getByRole("button", { name: "Phone country code" });
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  assert.ok(screen.getByRole("listbox", { name: "Countries" }));
  // the click that follows the press does not close it again
  fireEvent.click(button, { detail: 1 });
  await settle();
  assert.ok(screen.getByRole("listbox", { name: "Countries" }));
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  assert.equal(screen.queryByRole("listbox"), null, "a second press closes it");
});
