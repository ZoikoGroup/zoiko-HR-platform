/** One e-mail address with an account in several organizations: the person chooses which one to sign in to. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const coded = (code, message = "x", status) => Object.assign(new Error(message), { code, status });

const CHOICE = {
  requiresOrgSelection: true,
  selectionToken: "sel-token",
  message: "Your email address has an account in more than one organization. Choose the one to sign in to.",
  organizations: [
    { id: 11, name: "Acme Org", code: "ACM", role: "admin" },
    { id: 22, name: "Beta Org", code: "BET", role: "employee" },
  ],
};

async function open(t, { login, choose } = {}) {
  const calls = { login: [], choose: [] };
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    login: async (c) => { calls.login.push(c); return login ? login(c) : CHOICE; },
    chooseOrganization: async (c) => { calls.choose.push(c); return choose ? choose(c, calls) : { role: "employee" }; },
    confirmMfaEnrollment: async () => ({}), loginWithGoogle: async () => {}, error: null, defaultRedirect: "/dashboard" }) } });
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}),
    mfaEnrollStart: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "http://api" } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/login", element: React.createElement(Page) }),
    React.createElement(Route, { path: "*", element: React.createElement("p", null, "signed in page") }))));
  await settle();
  return calls;
}
const signIn = async () => {
  fireEvent.change(document.getElementById("login-email"), { target: { value: "sam@acme-corp.com" } });
  fireEvent.change(document.getElementById("login-password"), { target: { value: "Passw0rd1" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await settle();
};

test("several organizations: the list is shown with each role, and nobody is signed in yet", async (t) => {
  const calls = await open(t);
  await signIn();
  const picker = screen.getByRole("group", { name: "Choose an organization" });
  assert.ok(picker);
  assert.match(picker.textContent, /Acme Org/);
  assert.match(picker.textContent, /Organization admin/);
  assert.match(picker.textContent, /Beta Org/);
  assert.match(picker.textContent, /Employee/);
  assert.equal(document.getElementById("login-email"), null, "the form makes way for the choice");
  assert.equal(calls.choose.length, 0);
});

test("choosing an organization signs in to that one only and continues", async (t) => {
  const calls = await open(t);
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: /Beta Org/ }));
  await settle();
  assert.deepEqual(calls.choose, [{ selectionToken: "sel-token", organizationId: 22, mfaCode: undefined }]);
  assert.ok(screen.getByText("signed in page"));
});

test("'Use a different account' goes back to the form", async (t) => {
  await open(t);
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));
  await settle();
  assert.ok(document.getElementById("login-email"));
  assert.equal(screen.queryByRole("group", { name: "Choose an organization" }), null);
});

test("a chosen platform account asks for the authenticator code, then retries the same choice with it", async (t) => {
  const platformChoice = { ...CHOICE, organizations: [{ id: null, name: "Zoiko HR platform administration", role: "super_admin" }, CHOICE.organizations[0]] };
  const calls = await open(t, {
    login: () => platformChoice,
    choose: (c) => { if (!c.mfaCode) throw coded("MFA_REQUIRED", "Enter the code", 401); return { role: "super_admin" }; },
  });
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: /platform administration/ }));
  await settle();
  assert.ok(document.getElementById("login-mfa"), "the code box is shown");
  fireEvent.change(document.getElementById("login-mfa"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await settle();
  assert.deepEqual(calls.choose.at(-1), { selectionToken: "sel-token", organizationId: null, mfaCode: "123456" });
  assert.equal(calls.login.length, 1, "the password is not sent again");
});

test("an expired choice goes back to the form with the server's message", async (t) => {
  await open(t, { choose: () => { throw coded("UNAUTHORIZED", "This sign-in has expired. Please sign in again.", 401); } });
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: /Acme Org/ }));
  await settle();
  assert.match(document.body.textContent, /This sign-in has expired/);
  assert.ok(document.getElementById("login-email"), "back to the form");
});

test("a single organization signs straight in, no list", async (t) => {
  await open(t, { login: () => ({ role: "employee" }) });
  await signIn();
  assert.ok(screen.getByText("signed in page"));
});
