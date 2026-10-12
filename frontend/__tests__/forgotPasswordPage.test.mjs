/** ZHR-7: the public forgot-password page. Any account can request a link, and the stated lifetime matches the server's 60-minute reset token. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function open(t, forgot) {
  const calls = [];
  t.mock.module("../src/service/authService.js", { exports: { forgotPassword: forgot || (async (p) => { calls.push(p); return {}; }) } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/ForgotPasswordPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/forgot-password"] }, React.createElement(Page)));
  await settle();
  return calls;
}
const type = (value) => fireEvent.change(document.getElementById("email"), { target: { value } });
const submit = async () => { fireEvent.click(screen.getByRole("button", { name: /Send reset link/ })); await settle(); };

test("the link request carries the typed email and confirms without revealing whether the account exists", async (t) => {
  const calls = await open(t);
  type("person@company.com");
  await submit();
  assert.deepEqual(calls, [{ email: "person@company.com" }]);
  assert.match(document.body.textContent, /Check your email/);
  assert.match(document.body.textContent, /If an account exists for/);
  assert.match(document.body.textContent, /person@company\.com/);
});

test("the stated expiry matches the server's 60-minute reset link", async (t) => {
  await open(t);
  type("person@company.com");
  await submit();
  assert.match(document.body.textContent, /The link expires in 60 minutes/);
  assert.doesNotMatch(document.body.textContent, /24 hours/);
});

test("a server failure is shown and the person can try again", async (t) => {
  await open(t, async () => { throw new Error("The server took too long to respond."); });
  type("person@company.com");
  await submit();
  assert.match(document.body.textContent, /took too long/);
  assert.ok(screen.getByRole("button", { name: /Send reset link/ }));
});
