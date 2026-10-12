/** ZHR-85: the Reveal button on Bank Details shows the full account number, and Hide masks it again. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function load(t, ext) {
  t.mock.module("../src/service/employee.js", { exports: { getMyProfile: async () => ({ id: 7, firstName: "Anne", lastName: "Lee", fullName: "Anne Lee" }), getEmployeeProfile: async () => ext, updateEmployeeProfile: async () => ({}) } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_BankDetails.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

test("Reveal shows the whole account number on the card and in the box, Hide masks it again", async (t) => {
  await load(t, { bank_name: "Axis Bank", bank_account: "123456789012", bank_ifsc: "UTIB0001234", pan_number: "ABCDE1234F" });
  const card = () => screen.getByTestId("card-account").textContent;
  assert.match(card(), /9012$/);
  assert.doesNotMatch(card(), /1234 5678/);
  fireEvent.click(screen.getByRole("button", { name: /Reveal/ }));
  assert.equal(card(), "1234 5678 9012");
  fireEvent.click(screen.getByRole("button", { name: "Hide account number" }));
  assert.doesNotMatch(card(), /5678/);
  fireEvent.click(screen.getByRole("button", { name: "Show account number" }));
  assert.ok([...document.querySelectorAll("input")].some((i) => i.value === "123456789012"));
});

test("with no account saved, Reveal says so instead of showing dots", async (t) => {
  await load(t, {});
  fireEvent.click(screen.getByRole("button", { name: /Reveal/ }));
  assert.equal(screen.getByTestId("card-account").textContent, "Not added yet");
});
