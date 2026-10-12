/** ZHR-87: Security Settings offers an emailed reset link when the current password is forgotten. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function load(t, forgot) {
  t.mock.module("../src/service/authService.js", { exports: { changePassword: async () => ({}), forgotMyPassword: forgot } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

test("the link asks for a reset email and confirms where it went", async (t) => {
  let n = 0;
  await load(t, async () => { n++; return { email: "me***@x.com" }; });
  fireEvent.click(screen.getByRole("button", { name: /Forgot your current password/ }));
  await settle();
  assert.equal(n, 1);
  assert.match(document.body.textContent, /reset link has been sent to me\*\*\*@x\.com/);
});

test("a failure is shown and the person can try again", async (t) => {
  await load(t, async () => { throw new Error("Too many requests"); });
  fireEvent.click(screen.getByRole("button", { name: /Forgot your current password/ }));
  await settle();
  assert.match(document.body.textContent, /Too many requests/);
  assert.ok(screen.getByRole("button", { name: /Forgot your current password/ }));
});
