/** ZHR-81: the Department column shows the chosen department, and the Headcount form checks its numbers. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateHeadcount, headcountPayload, headcountToForm, departmentText, serverHeadcountErrors, headcountRefusalField, EMPTY_HEADCOUNT } from "../src/utils/headcountForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const OK = { ...EMPTY_HEADCOUNT, department_id: "3", fiscal_year: "2027", approved_positions: "10", filled_positions: "6", vacant_positions: "4" };

test("the Department column never shows a bare dash for a department that exists", () => {
  assert.equal(departmentText({ department_name: "Management", department_id: 3 }), "Management");
  assert.equal(departmentText({ department_id: 3 }, [{ id: 3, name: "Management" }]), "Management", "falls back to the department list");
  assert.equal(departmentText({ department_id: 3 }), "Department #3");
  assert.equal(departmentText({ department_id: null }), "No department");
});

test("the form needs a department and numbers that add up", () => {
  assert.deepEqual(validateHeadcount(OK, [3, 4]), {});
  assert.match(validateHeadcount({ ...OK, department_id: "" }, [3]).department_id, /Choose the department/);
  assert.match(validateHeadcount({ ...OK, department_id: "99" }, [3]).department_id, /was not found/);
  assert.match(validateHeadcount({ ...OK, fiscal_year: "1999" }, [3]).fiscal_year, /between 2020 and 2100/);
  assert.match(validateHeadcount({ ...OK, fiscal_year: "27" }, [3]).fiscal_year, /four-digit/);
  assert.match(validateHeadcount({ ...OK, approved_positions: "-1" }, [3]).approved_positions, /whole number, 0 or more/);
  assert.match(validateHeadcount({ ...OK, filled_positions: "2.5" }, [3]).filled_positions, /whole number/);
  assert.match(validateHeadcount({ ...OK, filled_positions: "11", vacant_positions: "0" }, [3]).filled_positions, /Filled positions cannot be more than approved/);
  assert.match(validateHeadcount({ ...OK, filled_positions: "6", vacant_positions: "5" }, [3]).vacant_positions, /Filled plus vacant/);
  assert.match(validateHeadcount({ ...OK, projected_cost: "-5" }, [3]).projected_cost, /positive number/);
  assert.match(validateHeadcount({ ...OK, projected_cost: "1.234" }, [3]).projected_cost, /2 decimal places/);
  assert.deepEqual(validateHeadcount({ ...OK, filled_positions: "", vacant_positions: "" }, [3]), {}, "empty counts mean 0");
});

test("payload, form values and server messages", () => {
  assert.deepEqual(headcountPayload({ ...OK, planned_hires: "", projected_cost: "1500.5" }), { department_id: 3, fiscal_year: 2027, approved_positions: 10, filled_positions: 6, vacant_positions: 4, planned_hires: 0, projected_cost: 1500.5 });
  assert.equal(headcountToForm({ department_id: 3, fiscal_year: 2026, approved_positions: 0, projected_cost: "100.00" }).approved_positions, "0", "a saved zero is kept");
  assert.equal(headcountToForm({ department_id: 3, fiscal_year: 2026, projected_cost: "100.00" }).projected_cost, "100");
  assert.equal(serverHeadcountErrors([{ loc: ["body"], msg: "Value error, Filled plus vacant positions cannot be more than approved positions." }]).vacant_positions.startsWith("Filled plus vacant"), true);
  assert.equal(headcountRefusalField("This department already has a headcount record for 2027. Edit that record instead."), "fiscal_year");
  assert.equal(headcountRefusalField("The selected department was not found in this organization."), "department_id");
});

async function load(t, { items = [], departments, createError } = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getWfHeadcounts: async () => ({ items }),
    createWfHeadcount: async (p) => { calls.create.push(p); if (createError) throw createError; return {}; },
    updateWfHeadcount: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteWfHeadcount: async () => ({}),
    getDepartments: async () => ({ data: departments }),
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/workforce-planning/headcount.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const DEPTS = [{ id: 3, name: "Management" }, { id: 4, name: "Engineering" }];
const set = (id, v) => fireEvent.change(document.getElementById(id), { target: { value: v } });

test("a saved record shows its department, even if the server sent no name", async (t) => {
  await load(t, { departments: DEPTS, items: [
    { id: 1, department_id: 3, department_name: "Management", fiscal_year: 2027, approved_positions: 10 },
    { id: 2, department_id: 4, fiscal_year: 2026, approved_positions: 5 },
  ] });
  const cells = [...document.querySelectorAll("tbody tr")].map((r) => r.children[0].textContent);
  assert.deepEqual(cells, ["Management", "Engineering"]);
});

test("creating a record with a department sends the department id and refuses a missing one", async (t) => {
  const calls = await load(t, { departments: DEPTS });
  fireEvent.click(screen.getByRole("button", { name: /New Record/ }));
  assert.deepEqual([...document.getElementById("hc-dept").options].map((o) => o.textContent), ["Select department", "Management", "Engineering"]);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Choose the department this headcount is for\./);
  assert.equal(calls.create.length, 0);
  set("hc-dept", "3"); set("hc-approved", "10"); set("hc-filled", "6"); set("hc-vacant", "4");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].department_id, 3);
  assert.equal(calls.create[0].approved_positions, 10);
});

test("numbers that do not add up are refused under the right box", async (t) => {
  const calls = await load(t, { departments: DEPTS });
  fireEvent.click(screen.getByRole("button", { name: /New Record/ }));
  set("hc-dept", "3"); set("hc-approved", "5"); set("hc-filled", "6");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Filled positions cannot be more than approved/);
  assert.equal(calls.create.length, 0);
});

test("with no departments the form says so and Create is disabled", async (t) => {
  await load(t, { departments: [] });
  fireEvent.click(screen.getByRole("button", { name: /New Record/ }));
  assert.equal(document.getElementById("hc-dept").disabled, true);
  assert.match(document.querySelector(".fixed").textContent, /no departments in this organization yet/);
  assert.equal(screen.getByRole("button", { name: "Create" }).disabled, true);
});

test("a duplicate-year refusal from the server appears under Fiscal Year", async (t) => {
  await load(t, { departments: DEPTS, createError: new Error("This department already has a headcount record for 2027. Edit that record instead.") });
  fireEvent.click(screen.getByRole("button", { name: /New Record/ }));
  set("hc-dept", "3");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  const alerts = [...document.querySelectorAll(".fixed [role=alert]")].map((a) => a.textContent);
  assert.ok(alerts.some((a) => /already has a headcount record for 2027/.test(a)));
});

test("Edit opens with the department selected and a saved 0 kept as 0", async (t) => {
  await load(t, { departments: DEPTS, items: [{ id: 1, department_id: 4, department_name: "Engineering", fiscal_year: 2026, approved_positions: 5, filled_positions: 0, vacant_positions: 5, planned_hires: 0, projected_cost: 0 }] });
  fireEvent.click(screen.getByTitle("Edit"));
  assert.equal(document.getElementById("hc-dept").value, "4");
  assert.equal(document.getElementById("hc-filled").value, "0");
});
