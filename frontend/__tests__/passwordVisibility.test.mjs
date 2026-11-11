/** A2 / A3: every password field has its own show/hide eye; revealing one never reveals another. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

const typeOf = (id) => document.getElementById(id).getAttribute("type");
const eyeFor = (id) => within(document.getElementById(id).parentElement).getByRole("button");

function assertIndependent(ids) {
  for (const id of ids) assert.equal(typeOf(id), "password", `${id} starts hidden`);
  for (const id of ids) {
    const eye = eyeFor(id);
    assert.equal(eye.getAttribute("type"), "button", "the eye never submits the form");
    assert.equal(eye.getAttribute("aria-label"), "Show password");
    assert.equal(eye.getAttribute("aria-pressed"), "false");
    fireEvent.click(eye);
    assert.equal(typeOf(id), "text", `${id} is revealed by its own eye`);
    assert.equal(eye.getAttribute("aria-label"), "Hide password");
    assert.equal(eye.getAttribute("aria-pressed"), "true");
    for (const other of ids.filter((x) => x !== id)) assert.equal(typeOf(other), "password", `revealing ${id} leaves ${other} hidden`);
    fireEvent.click(eye);
    assert.equal(typeOf(id), "password");
  }
}

test("A2 PasswordInput: the eye toggles only its own field and never submits the form", async () => {
  const { default: PasswordInput } = await import("../src/components/PasswordInput.jsx");
  let submitted = 0;
  render(React.createElement("form", { onSubmit: (e) => { e.preventDefault(); submitted++; } },
    React.createElement(PasswordInput, { id: "a", autoComplete: "new-password", defaultValue: "secret1" }),
    React.createElement(PasswordInput, { id: "b", autoComplete: "new-password", defaultValue: "secret2" })));
  assertIndependent(["a", "b"]);
  assert.equal(submitted, 0);
  assert.equal(document.getElementById("a").getAttribute("autocomplete"), "new-password");
});

test("A2 the temporary-password 'Set a new password' screen has an eye on every field", async (t) => {
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ isAuthenticated: true, user: { email: "a@acme.com" }, role: "employee" }) } });
  t.mock.module("../src/service/authService.js", { exports: { changePassword: async () => ({}), fetchCurrentUser: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { getAccessToken: () => "x", getRefreshToken: () => "y", setSession: () => {} } });
  const { default: Page } = await import(`../src/pages/auth/ChangePasswordPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  assert.ok(screen.getByLabelText("New password"));
  assert.ok(screen.getByLabelText("Confirm new password"));
  assertIndependent(["cp-current", "cp-new", "cp-confirm"]);
});

test("A3 Reset password: New and Confirm each have their own eye", async (t) => {
  t.mock.module("../src/service/authService.js", { exports: { resetPasswordWithToken: async () => ({}) } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/ResetPasswordPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/reset-password?token=abc"] }, React.createElement(Page)));
  await settle();
  assertIndependent(["rp-password", "rp-confirm"]);
});

test("A2 Login keeps its eye toggle (shared component)", async (t) => {
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ login: async () => {}, confirmMfaEnrollment: async () => {}, loginWithGoogle: async () => {}, error: null, defaultRedirect: "/x" }) } });
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}), mfaEnrollStart: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "http://api" } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Page)));
  await settle();
  assertIndependent(["login-password"]);
});

test("A2 Security settings: current, new and confirm each have an independent eye", async (t) => {
  t.mock.module("../src/service/authService.js", { exports: { changePassword: async () => ({}), forgotMyPassword: async () => ({}) } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assertIndependent(["es-current-password", "es-new-password", "es-confirm-password"]);
});
