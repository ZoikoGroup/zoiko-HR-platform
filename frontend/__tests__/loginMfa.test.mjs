/** ZHR-PRIV-001 B02: platform accounts sign in with a second factor. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const coded = (code, message = "x") => Object.assign(new Error(message), { code });

async function open(t, { login, confirm, start } = {}) {
  const calls = { login: [], confirm: [], start: [] };
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    login: login ? async (c) => { calls.login.push(c); return login(c, calls); } : async (c) => { calls.login.push(c); },
    confirmMfaEnrollment: async (c) => { calls.confirm.push(c); return confirm ? confirm(c) : {}; },
    loginWithGoogle: async () => {}, error: null, defaultRedirect: "/super-admin/dashboard" }) } });
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}),
    mfaEnrollStart: async (c) => { calls.start.push(c); return start ? start(c) : { secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/Zoiko%20HR:x?secret=JBSWY3DPEHPK3PXP" }; } } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "http://api" } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Page)));
  await settle();
  return calls;
}
const fill = () => {
  fireEvent.change(document.getElementById("login-email"), { target: { value: "person@gmail.com" } });
  fireEvent.change(document.getElementById("login-password"), { target: { value: "Passw0rd1" } });
};
const submit = async (name = /Sign In|Confirm and sign in/) => { fireEvent.click(screen.getByRole("button", { name })); await settle(); };

test("an ordinary account never sees a code box", async (t) => {
  const calls = await open(t);
  assert.equal(document.getElementById("login-mfa"), null);
  fill();
  await submit();
  assert.deepEqual(calls.login, [{ email: "person@gmail.com", password: "Passw0rd1" }]);
});

test("when the server asks for a code, the box appears and the code is sent with the same credentials", async (t) => {
  const calls = await open(t, { login: (c) => { if (!c.mfaCode) throw coded("MFA_REQUIRED", "Enter the 6-digit code"); } });
  fill();
  await submit();
  assert.ok(document.getElementById("login-mfa"), "the code box is shown");
  assert.equal(document.querySelector('[role="alert"]'), null, "asking for a code is not an error message");
  await submit();
  assert.match(document.body.textContent, /6-digit code from your authenticator app/, "an empty code is refused on the page");
  assert.equal(calls.login.length, 1, "nothing is sent without a code");
  fireEvent.change(document.getElementById("login-mfa"), { target: { value: "12ab34 56" } });
  assert.equal(document.getElementById("login-mfa").value, "123456", "only digits are kept");
  await submit();
  assert.deepEqual(calls.login.at(-1), { email: "person@gmail.com", password: "Passw0rd1", mfaCode: "123456" });
});

test("a wrong code shows the server's message and clears the box for the next try", async (t) => {
  await open(t, { login: (c) => { if (!c.mfaCode) throw coded("MFA_REQUIRED"); throw coded("MFA_INVALID", "That code is not valid. Check the code and try again."); } });
  fill();
  await submit();
  fireEvent.change(document.getElementById("login-mfa"), { target: { value: "111111" } });
  await submit();
  assert.match(document.body.textContent, /That code is not valid/);
  assert.equal(document.getElementById("login-mfa").value, "");
});

test("an account that must enrol is shown the key, then confirms with a code and is signed in", async (t) => {
  const calls = await open(t, { login: () => { throw coded("MFA_ENROLLMENT_REQUIRED", "Platform accounts need a second factor."); } });
  fill();
  await submit();
  assert.deepEqual(calls.start, [{ email: "person@gmail.com", password: "Passw0rd1" }]);
  assert.match(screen.getByLabelText("Authenticator key").textContent, /JBSWY3DPEHPK3PXP/);
  fireEvent.change(document.getElementById("login-mfa"), { target: { value: "654321" } });
  await submit();
  assert.deepEqual(calls.confirm, [{ email: "person@gmail.com", password: "Passw0rd1", code: "654321" }]);
});
