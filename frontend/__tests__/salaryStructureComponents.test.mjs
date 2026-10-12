/** The amount that counts is set inside the salary structure, and it is required there. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { structureAmountError, validateStructureComponent, structureComponentPayload, suggestedAmount, serverStructureErrors } from "../src/utils/structureComponentForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("the amount or formula is required, and numbers, percentages and formulas are told apart", () => {
  for (const ok of ["50000", "50,000", "1250.50", "12%", "40% of basic", "basic * 0.4"]) assert.equal(structureAmountError(ok), "", ok);
  assert.match(structureAmountError(""), /Enter the amount or formula/);
  assert.match(structureAmountError("   "), /Enter the amount or formula/);
  assert.match(structureAmountError("0"), /greater than 0/);
  assert.match(structureAmountError("-5"), /greater than 0/);
  assert.match(structureAmountError("12.345"), /2 decimal/);
  assert.match(structureAmountError("150%"), /at most 100/);
  assert.match(structureAmountError("<script>"), /formula/);
  assert.match(structureAmountError("x".repeat(300)), /255/);
  assert.deepEqual(validateStructureComponent({ componentId: "", amount: "" }), { componentId: "Choose a salary component.", amount: structureAmountError("") });
  assert.match(validateStructureComponent({ componentId: "4", amount: "10" }, [4]).componentId, /already in the structure/);
  assert.deepEqual(structureComponentPayload({ componentId: "4", amount: " 12% " }), { component_id: 4, amount_or_formula: "12%" });
  assert.equal(suggestedAmount({ default_amount: "5000.00" }), "5000");
  assert.equal(suggestedAmount({ default_amount: null }), "");
  assert.equal(serverStructureErrors({ validation: [{ loc: ["body", "amount_or_formula"], msg: "Value error, The amount must be greater than 0." }] }).fieldErrors.amount, "The amount must be greater than 0.");
});

const STRUCT = { id: 1, name: "Standard", is_active: true };
const CATALOG = [{ id: 10, name: "Basic Pay", component_type: "earning", default_amount: "5000.00" }, { id: 11, name: "Provident Fund", component_type: "deduction", default_amount: null }];

async function open(t, rows = []) {
  const calls = { add: [], update: [], remove: [] };
  let current = rows;
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getSalaryStructures: async () => [STRUCT], createSalaryStructure: async () => ({}), updateSalaryStructure: async () => ({}), deleteSalaryStructure: async () => ({}),
    getSalaryComponents: async () => CATALOG,
    getStructureComponents: async () => current,
    addStructureComponent: async (id, p) => { calls.add.push([id, p]); const c = CATALOG.find((x) => x.id === p.component_id); current = [...current, { id: 90 + current.length, structure_id: id, component_id: c.id, component_name: c.name, component_type: c.component_type, amount_or_formula: p.amount_or_formula }]; return {}; },
    updateStructureComponent: async (id, rid, p) => { calls.update.push([id, rid, p]); current = current.map((r) => (r.id === rid ? { ...r, amount_or_formula: p.amount_or_formula } : r)); return {}; },
    deleteStructureComponent: async (id, rid) => { calls.remove.push([id, rid]); current = current.filter((r) => r.id !== rid); return {}; },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/compensation/salary-structures.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Components" }));
  await settle();
  return calls;
}

test("a component with no default must be given an amount before it joins the structure", async (t) => {
  const calls = await open(t);
  fireEvent.change(document.getElementById("sc-component"), { target: { value: "11" } });
  assert.equal(document.getElementById("sc-amount").value, "", "no default, nothing suggested");
  fireEvent.click(screen.getByRole("button", { name: "Add to structure" }));
  await settle();
  assert.equal(calls.add.length, 0);
  assert.match(document.querySelector("[role=dialog]").textContent, /Enter the amount or formula/);
  fireEvent.change(document.getElementById("sc-amount"), { target: { value: "12%" } });
  fireEvent.click(screen.getByRole("button", { name: "Add to structure" }));
  await settle();
  assert.deepEqual(calls.add, [[1, { component_id: 11, amount_or_formula: "12%" }]]);
  assert.match(document.querySelector("[role=dialog] tbody").textContent, /Provident Fund/);
  assert.match(document.querySelector("[role=dialog] tbody").textContent, /12%/);
});

test("a default amount is filled in as a suggestion that can be changed", async (t) => {
  const calls = await open(t);
  fireEvent.change(document.getElementById("sc-component"), { target: { value: "10" } });
  assert.equal(document.getElementById("sc-amount").value, "5000");
  fireEvent.change(document.getElementById("sc-amount"), { target: { value: "6000" } });
  fireEvent.click(screen.getByRole("button", { name: "Add to structure" }));
  await settle();
  assert.equal(calls.add[0][1].amount_or_formula, "6000");
  assert.ok(![...document.getElementById("sc-component").options].some((o) => o.value === "10"), "already in the structure, so no longer offered");
});

test("the amount in the structure can be changed (but not blanked) and a component can be removed", async (t) => {
  const calls = await open(t, [{ id: 7, structure_id: 1, component_id: 10, component_name: "Basic Pay", component_type: "earning", amount_or_formula: "5000" }]);
  fireEvent.click(within(document.querySelector("[role=dialog]")).getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Amount or formula"), { target: { value: " " } });
  fireEvent.click(within(document.querySelector("[role=dialog]")).getByRole("button", { name: "Save" }));
  await settle();
  assert.equal(calls.update.length, 0);
  assert.match(document.querySelector("[role=dialog]").textContent, /Enter the amount or formula/);
  fireEvent.change(screen.getByLabelText("Amount or formula"), { target: { value: "7500" } });
  fireEvent.click(within(document.querySelector("[role=dialog]")).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.update, [[1, 7, { amount_or_formula: "7500" }]]);
  window.confirm = () => true;
  fireEvent.click(within(document.querySelector("[role=dialog]")).getByRole("button", { name: "Remove" }));
  await settle();
  assert.deepEqual(calls.remove, [[1, 7]]);
});
