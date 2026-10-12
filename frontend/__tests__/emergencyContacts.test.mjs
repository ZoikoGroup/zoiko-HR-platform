/** ZHR-86: the same emergency contact (person or phone number) cannot be added twice. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateContact } from "../src/utils/emergencyContactForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const JANE = { id: "1", name: "Jane Doe", relationship: "Spouse", primaryPhone: "9876543210", alternatePhone: "", address: "12 Park Road", isPrimary: true };

test("duplicates by person or by phone number are caught, other people are fine", () => {
  const fresh = { name: "Raj Kumar", relationship: "Parent", primaryPhone: "9123456789", alternatePhone: "", address: "x" };
  assert.deepEqual(validateContact(fresh, [JANE]), {});
  assert.match(validateContact({ ...fresh, name: " jane  DOE ", relationship: "spouse" }, [JANE]).name, /already in your emergency contacts/);
  assert.match(validateContact({ ...fresh, primaryPhone: "+91 98765 43210" }, [JANE]).primaryPhone, /already used for Jane Doe/);
  assert.match(validateContact({ ...fresh, alternatePhone: "98765-43210" }, [JANE]).alternatePhone, /already used/);
  assert.match(validateContact({ ...fresh, alternatePhone: "91234 56789" }, [JANE]).alternatePhone, /cannot be the same as the primary/);
  const empty = validateContact({ name: "", relationship: "Spouse", primaryPhone: "12", alternatePhone: "", address: "" }, []);
  assert.deepEqual(Object.keys(empty).sort(), ["address", "name", "primaryPhone"]);
});

async function load(t, saved = []) {
  const calls = [];
  t.mock.module("../src/service/employee.js", { exports: { getMyProfile: async () => ({ id: 7, emergencyContacts: saved }), updateMyProfile: async (p) => { calls.push(p); return {}; } } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_EmergencyContacts.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("adding the same contact again shows the message and saves nothing", async (t) => {
  const calls = await load(t, [JANE]);
  fireEvent.click(screen.getByRole("button", { name: /Add Contact/ }));
  const box = (ph) => [...document.querySelectorAll("input")].find((i) => i.placeholder === ph);
  fireEvent.change(box("Jane Doe"), { target: { value: "Jane Doe" } });
  fireEvent.change(box("+91 98765 43210"), { target: { value: "9876543210" } });
  fireEvent.change(box("Full home address"), { target: { value: "Somewhere 1" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add Contact" }).at(-1));
  await settle();
  assert.match(document.body.textContent, /already in your emergency contacts/);
  assert.match(document.body.textContent, /already used for Jane Doe/);
  assert.equal(calls.length, 0);
  fireEvent.change(box("Jane Doe"), { target: { value: "Raj Kumar" } });
  fireEvent.change(box("+91 98765 43210"), { target: { value: "9123456789" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add Contact" }).at(-1));
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].emergency_contacts.length, 2);
});
