/** Real e-mail addresses only: instant feedback on the forms, a confirmation page, and a clear message at sign-in. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { realEmailError, PLACEHOLDER_MESSAGE, DISPOSABLE_MESSAGE, SHAPE_MESSAGE } from "../src/utils/realEmail.js";
import { validateAddEmployee } from "../src/utils/addEmployeeForm.js";
import { validateProfile } from "../src/utils/profileForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("placeholder, reserved and disposable addresses are refused with a plain message; real ones and blanks pass", () => {
  for (const bad of ["a@example.com", "a@EXAMPLE.org", "a@test.com", "a@x.example.com", "a@company.test", "a@domain.com"]) assert.equal(realEmailError(bad), PLACEHOLDER_MESSAGE, bad);
  for (const bad of ["a@mailinator.com", "a@sub.mailinator.com", "a@guerrillamail.com", "a@10minutemail.com", "a@yopmail.com"]) assert.equal(realEmailError(bad), DISPOSABLE_MESSAGE, bad);
  assert.equal(realEmailError("not-an-email"), SHAPE_MESSAGE);
  assert.equal(realEmailError("a@localhost"), SHAPE_MESSAGE);
  for (const ok of ["priya@gmail.com", "Priya.Shah@Outlook.com", "ops@zoikohr.com", ""]) assert.equal(realEmailError(ok), "", ok);
});

test("the forms use the same rule", () => {
  const form = { first_name: "Aarav", last_name: "Sharma", email: "aarav@mailinator.com", job_title: "Engineer", date_of_joining: "2026-10-01", employment_type: "full_time" };
  assert.equal(validateAddEmployee(form).email, DISPOSABLE_MESSAGE);
  assert.equal(validateAddEmployee({ ...form, email: "aarav@gmail.com" }).email, undefined);
  assert.equal(validateProfile({ first_name: "A", last_name: "B", personal_email: "me@example.com" }).personal_email, PLACEHOLDER_MESSAGE);
  assert.equal(validateProfile({ first_name: "A", last_name: "B", personal_email: "me@gmail.com" }).personal_email, undefined);
});

async function openVerify(t, { url = "/verify-email?token=abc", verify, resend } = {}) {
  const calls = { verify: [], resend: [] };
  t.mock.module("../src/service/authService.js", { exports: {
    verifyEmail: verify || (async (tok) => { calls.verify.push(tok); return { message: "ok" }; }),
    resendVerification: resend || (async (email) => { calls.resend.push(email); return { message: "If that address belongs to an account that still needs confirming, a new confirmation link has been sent." }; }),
  } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/VerifyEmailPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path: "/verify-email", element: React.createElement(Page) }))));
  await settle();
  return calls;
}

test("opening the confirmation link confirms the address once and offers to sign in", async (t) => {
  const calls = await openVerify(t);
  assert.deepEqual(calls.verify, ["abc"]);
  assert.match(document.body.textContent, /Your email address is confirmed/);
  assert.equal(screen.getByRole("link", { name: "Sign in" }).getAttribute("href"), "/login");
});

test("a dead link says so, and a new one can be asked for with a real address only", async (t) => {
  const calls = await openVerify(t, { verify: async () => { throw new Error("This confirmation link is invalid or has expired. Ask for a new one from the sign-in page."); } });
  assert.match(document.body.textContent, /no longer works/);
  fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
  await settle();
  assert.match(document.body.textContent, /Enter the email address you signed up with/);
  fireEvent.change(document.getElementById("ve-email"), { target: { value: "me@mailinator.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
  await settle();
  assert.match(document.body.textContent, /disposable/i);
  assert.equal(calls.resend.length, 0);
  fireEvent.change(document.getElementById("ve-email"), { target: { value: "me@gmail.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
  await settle();
  assert.deepEqual(calls.resend, ["me@gmail.com"]);
  assert.match(document.body.textContent, /a new confirmation link has been sent/);
});

test("a link with no token goes straight to the can't-use-this page", async (t) => {
  const calls = await openVerify(t, { url: "/verify-email" });
  assert.equal(calls.verify.length, 0);
  assert.match(document.body.textContent, /no longer works/);
});

async function openLogin(t, { login, resend } = {}) {
  const calls = { resend: [] };
  t.mock.module("../src/service/authService.js", { exports: {
    googleSignInEnabled: async () => true,
    resendVerification: resend || (async (email) => { calls.resend.push(email); return { message: "A new confirmation link has been sent." }; }),
  } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "https://api.example.com" } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ login, loginWithGoogle: async () => ({}), error: null, defaultRedirect: "/home" }) } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/login", element: React.createElement(Page) }))));
  await settle();
  return calls;
}

test("signing in with an unconfirmed address shows the server's message and a button for a new confirmation email", async (t) => {
  const err = Object.assign(new Error("Please confirm your email address before signing in. We sent a confirmation link to pr***@gmail.com. Open it, then sign in. You can ask for a new link below."), { status: 403, code: "EMAIL_NOT_VERIFIED" });
  const calls = await openLogin(t, { login: async () => { throw err; } });
  fireEvent.change(document.querySelector('input[type="email"]'), { target: { value: "priya@gmail.com" } });
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: "Passw0rd1" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign In/ }));
  await settle();
  assert.match(document.body.textContent, /Please confirm your email address before signing in/);
  fireEvent.click(screen.getByRole("button", { name: "Send me a new confirmation email" }));
  await settle();
  assert.deepEqual(calls.resend, ["priya@gmail.com"]);
  assert.match(document.body.textContent, /A new confirmation link has been sent/);
});

test("a wrong password does not offer the confirmation button", async (t) => {
  await openLogin(t, { login: async () => { throw Object.assign(new Error("Invalid email or password."), { status: 401, code: "UNAUTHORIZED" }); } });
  fireEvent.change(document.querySelector('input[type="email"]'), { target: { value: "priya@gmail.com" } });
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: "wrongpass1" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign In/ }));
  await settle();
  assert.match(document.body.textContent, /Invalid email or password/);
  assert.equal(screen.queryByRole("button", { name: "Send me a new confirmation email" }), null);
});
