/** B16–B38 (QA report 6 Nov 2026): Add User checks every field with the shared rules, shows each message under its own field,
 * focuses the first bad field and sends nothing; real international values are accepted; Edit User checks only what changed. */
import "./support/setup-jsdom.mjs";
import { withQuery } from "./support/queryWrapper.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const userSvc = {};
const auth = { user: { id: 1, role: "admin", email: "a@gmail.com" }, role: "admin", isAuthenticated: true };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const mocked = new WeakSet();
const LEGACY = { id: 9, firstName: "Old2", lastName: "Timer", email: "old@acme-corp.com", role: "employee", jobTitle: "t", status: "active", country: "India" };

function register(t) {
  Object.assign(userSvc, {
    createUser: async () => ({ message: "ok", temporary_password: null }), resetPassword: async () => ({}),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}), archiveUser: async () => ({}),
    getUser: async () => ({ first_name: "Old2", last_name: "Timer", email: "old@acme-corp.com", role: "employee", job_title: "t", city: "City123", country: "India", phone: "5550100" }),
    getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee", description: "" }] }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrap = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, (...a) => o[k](...a)]));
  t.mock.module("../src/service/employee.js", { exports: { importEmployees: async () => ({}), downloadImportTemplate: async () => ({}), getImportTemplateCountries: async () => [], getEmployees: async () => ({ items: [LEGACY], total: 1 }), hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}) } });
  t.mock.module("../src/service/userService.js", { exports: wrap(userSvc) });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
}

async function openAdd(t) {
  register(t);
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(withQuery(React.createElement(Page)));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
}

const set = (name, value, prefix = "add-user") => fireEvent.change(document.getElementById(`${prefix}-${name}`), { target: { value } });
const err = (name, prefix = "add-user") => document.getElementById(`${prefix}-${name}-error`)?.textContent || "";

const QA = {                       // what QA typed (report of 6 Nov 2026)
  first_name: "John123", last_name: "@@@", job_title: "$$$", department_name: "1234", designation_name: "!!!", company: "#$%",
  business_unit: "+++", division: "999", team: "@team!", work_email: "abc@", personal_email: "x@x", current_address: "abc",
  permanent_address: "!!!!!", city: "Pune123", pincode: "56A001", pan_number: "ABC123", uan_number: "12AB",
  bank_account: "123456", bank_ifsc: "HDFC1001234",
};

test("B16–B38 every QA input is refused under its own field, the first is focused, nothing is sent", async (t) => {
  const sent = [];
  await openAdd(t);
  userSvc.createUser = async (p) => { sent.push(p); return { message: "ok" }; };
  set("email", "john@acme-corp.com");
  set("country", "India");
  for (const [k, v] of Object.entries(QA)) set(k, v);
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 0);
  const shown = [...document.querySelectorAll('[id^="add-user-"][id$="-error"]')].map((e) => e.id);
  for (const k of Object.keys(QA)) assert.ok(err(k), `${k} has a message; shown: ${shown.join(",")}; alert: ${document.querySelector("[role=alert]")?.textContent}`);
  assert.match(err("first_name"), /Use letters only/);
  assert.equal(err("pincode"), "Enter a valid postal code for India (for example 560001).");
  assert.equal(err("bank_account"), "Enter a valid bank account number (digits only, 9–18 for India).");
  assert.equal(err("bank_ifsc"), "Enter a valid IFSC code (for example SBIN0001234).");
  const first = document.getElementById("add-user-first_name");
  assert.equal(first.getAttribute("aria-invalid"), "true");
  assert.equal(first.getAttribute("aria-describedby"), "add-user-first_name-error");
  assert.equal(document.activeElement, first);
  assert.equal(first.value, "John123", "what was typed is kept");
  cleanup();
});

test("B32/B31 country is a list; India's states are a list; letters cannot be typed into an Indian bank account", async (t) => {
  await openAdd(t);
  assert.equal(document.getElementById("add-user-country").tagName, "SELECT");
  set("country", "India");
  assert.equal(document.getElementById("add-user-state").tagName, "SELECT");
  set("bank_account", "12ab34");
  assert.equal(document.getElementById("add-user-bank_account").value, "1234");
  set("country", "Germany");
  assert.equal(document.getElementById("add-user-state").tagName, "INPUT", "no fixed list for Germany: typed with the place rules");
  cleanup();
});

test("B34–B38 statutory numbers ask for the country first", async (t) => {
  await openAdd(t);
  set("first_name", "Rahul"); set("last_name", "Mehta"); set("email", "rahul@acme-corp.com"); set("job_title", "Engineer");
  set("pan_number", "ABCDE1234F");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(err("pan_number"), "Select the employee's country first so this number can be checked.");
  cleanup();
});

test("B16–B38 real international values are accepted and sent", async (t) => {
  const sent = [];
  await openAdd(t);
  userSvc.createUser = async (p) => { sent.push(p); return { message: "ok" }; };
  const good = {
    first_name: "José", last_name: "O'Brien", email: "jose@acme-corp.com", job_title: "C++ Developer", company: "AT&T",
    department_name: "R&D", designation_name: "Engineer II", business_unit: "Sales - North", division: "Platform", team: "Team 7",
    current_address: "12 MG Road, Indiranagar", permanent_address: "#4, 3rd Cross, Koramangala", city: "Bengaluru",
    pincode: "560001", pan_number: "ABCDE1234F", uan_number: "101234567890", bank_account: "123456789012", bank_ifsc: "HDFC0001234",
  };
  set("country", "India");
  set("state", "Karnataka");
  for (const [k, v] of Object.entries(good)) set(k, v);
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 1, JSON.stringify([...document.querySelectorAll('[id$="-error"]')].map((e) => e.id)));
  assert.equal(sent[0].first_name, "José");
  assert.equal(sent[0].state, "Karnataka");
  cleanup();
});

test("Edit User checks only what changed: legacy values can be saved, new junk is refused", async (t) => {
  const sent = [];
  register(t);
  userSvc.updateUser = async (id, p) => { sent.push(p); return {}; };
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(withQuery(React.createElement(Page)));
  await settle();
  fireEvent.click(screen.getAllByTitle("Edit")[0]);
  await settle();
  set("job_title", "Lead Engineer", "edit-user");
  fireEvent.submit(document.getElementById("edit-user-job_title").closest("form"));
  await settle();
  assert.equal(sent.length, 1, "the stored 'Old2' name and 'City123' city do not block an unrelated edit");
  fireEvent.click(screen.getAllByTitle("Edit")[0]);
  await settle();
  set("city", "Pune9", "edit-user");
  fireEvent.submit(document.getElementById("edit-user-city").closest("form"));
  await settle();
  assert.match(err("city", "edit-user"), /Use letters only/);
  assert.equal(sent.length, 1, "the changed junk city is not sent");
  cleanup();
});
