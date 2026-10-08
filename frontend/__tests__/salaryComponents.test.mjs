/** Salary components: the default amount is optional (decided after ZHR-75); the amount that counts is set in each salary structure. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateComponentForm, componentPayload, componentToForm, amountText, serverComponentErrors, EMPTY_COMPONENT } from "../src/utils/salaryComponentForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FULL = { name: "Basic Pay", component_type: "earning", is_taxable: true, default_amount: "5000", description: "" };

test("the default amount is optional, but when given it must be a sensible positive amount", () => {
  assert.equal(EMPTY_COMPONENT.default_amount, "");
  assert.deepEqual(validateComponentForm(FULL), {});
  assert.deepEqual(validateComponentForm({ ...FULL, default_amount: "" }), {});
  assert.deepEqual(validateComponentForm({ ...FULL, default_amount: "  " }), {});
  assert.equal(validateComponentForm({ ...FULL, default_amount: "0" }).default_amount, "Default amount must be greater than 0.");
  assert.match(validateComponentForm({ ...FULL, default_amount: "-5" }).default_amount, /positive number/);
  assert.match(validateComponentForm({ ...FULL, default_amount: "12.345" }).default_amount, /2 decimal places/);
  assert.match(validateComponentForm({ ...FULL, default_amount: "100000000" }).default_amount, /too large/);
  assert.equal(validateComponentForm({ ...FULL, default_amount: "0.5" }).default_amount, undefined);
  assert.equal(validateComponentForm({ ...FULL, name: " " }).name, "Component name is required.");
});

test("payload, display and server messages", () => {
  assert.deepEqual(componentPayload({ ...FULL, name: "  Basic   Pay ", default_amount: " 1234.5 ", description: " " }),
    { name: "Basic Pay", component_type: "earning", is_taxable: true, default_amount: 1234.5, description: null });
  assert.equal(componentPayload({ ...FULL, default_amount: "" }).default_amount, null, "a blank amount is sent as no default");
  assert.equal(amountText(5000), "$5,000");
  assert.equal(amountText("1234.50"), "$1,234.5");
  assert.equal(amountText(null), null);
  assert.equal(componentToForm({ name: "X", default_amount: null }).default_amount, "");
  assert.equal(componentToForm({ name: "X", default_amount: "2500.00" }).default_amount, "2500");
  assert.equal(serverComponentErrors([{ loc: ["body", "default_amount"], msg: "Value error, Default amount must be greater than 0." }]).default_amount, "Default amount must be greater than 0.");
});

async function load(t, items) {
  const calls = { create: [], update: [] };
  const svc = {
    getSalaryComponents: async () => items,
    createSalaryComponent: async (p) => { calls.create.push(p); return {}; },
    updateSalaryComponent: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteSalaryComponent: async () => ({}),
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/compensation/salary-components.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("a component can be created with no default amount, and the form says it is optional", async (t) => {
  const calls = await load(t, []);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Component" }));
  fireEvent.change(document.querySelector(".fixed form input[type=text]"), { target: { value: "Provident Fund" } });
  assert.match(document.querySelector(".fixed").textContent, /optional/i);
  fireEvent.click(screen.getByRole("button", { name: "Create Component" }));
  await settle();
  assert.deepEqual(calls.create, [{ name: "Provident Fund", component_type: "earning", is_taxable: true, default_amount: null, description: null }]);
});

test("a bad default amount is refused under the box; fixing it creates the component", async (t) => {
  const calls = await load(t, []);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Component" }));
  fireEvent.change(document.querySelector(".fixed form input[type=text]"), { target: { value: "Basic Pay" } });
  fireEvent.change(document.getElementById("cmp-new-amount"), { target: { value: "-5" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Component" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /positive number/);
  assert.equal(calls.create.length, 0);
  fireEvent.change(document.getElementById("cmp-new-amount"), { target: { value: "5000" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Component" }));
  await settle();
  assert.equal(calls.create[0].default_amount, 5000);
});

test("a component with no default shows 'Set per structure' and can be edited without adding one", async (t) => {
  const calls = await load(t, [{ id: 3, name: "Legacy", component_type: "earning", is_taxable: true, default_amount: null, description: "" }]);
  assert.match(document.querySelector("tbody tr").textContent, /Set per structure/);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(document.getElementById("cmp-edit-amount"), { target: { value: "750" } });
  fireEvent.click(screen.getByRole("button", { name: "Update Component" }));
  await settle();
  assert.equal(calls.update[0][1].default_amount, 750);
});
