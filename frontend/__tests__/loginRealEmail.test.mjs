/** ZHR-103: the sign-in form starts empty and only real email addresses are sent for sign-in. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import fs from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function open(t, login) {
  const calls = [];
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ login: login || (async (c) => { calls.push(c); }), loginWithGoogle: async () => {}, error: null, defaultRedirect: "/dashboard" }) } });
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}), mfaEnrollStart: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "http://api" } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Page)));
  await settle();
  return calls;
}
const email = () => document.getElementById("login-email");
const password = () => document.getElementById("login-password");
const submit = async () => { fireEvent.click(screen.getByRole("button", { name: /Sign In/ })); await settle(); };

test("the form starts empty: no address or password is filled in", async (t) => {
  await open(t);
  assert.equal(email().value, "");
  assert.equal(password().value, "");
  assert.doesNotMatch(fs.readFileSync("src/pages/auth/LoginPage.jsx", "utf8"), /VITE_DEFAULT/);
});

test("a placeholder or throwaway address is refused on the form and nothing is sent", async (t) => {
  const calls = await open(t);
  for (const bad of ["admin@example.com", "x@mailinator.com", "someone@company.test", "nonsense"]) {
    fireEvent.change(email(), { target: { value: bad } });
    fireEvent.change(password(), { target: { value: "Passw0rd1" } });
    await submit();
    assert.ok(screen.getAllByRole("alert").length >= 1, bad);
  }
  assert.deepEqual(calls, []);
});

test("blank fields are named, and a real address signs in with the address trimmed", async (t) => {
  const calls = await open(t);
  await submit();
  assert.match(document.body.textContent, /Enter your email address/);
  assert.match(document.body.textContent, /Enter your password/);
  fireEvent.change(email(), { target: { value: "  person@gmail.com " } });
  fireEvent.change(password(), { target: { value: "Passw0rd1" } });
  await submit();
  assert.deepEqual(calls, [{ email: "person@gmail.com", password: "Passw0rd1" }]);
});

test("the server's refusal for an unusable address is shown", async (t) => {
  await open(t, async () => { throw new Error("Enter a real email address that you can open. Only real email addresses can sign in."); });
  fireEvent.change(email(), { target: { value: "person@gmail.com" } });
  fireEvent.change(password(), { target: { value: "Passw0rd1" } });
  await submit();
  assert.match(document.body.textContent, /Only real email addresses can sign in/);
});
