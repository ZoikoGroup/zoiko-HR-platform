/** Reset Password: the page an emailed link opens. The person chooses a new password; a dead link is explained. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function open(t, { url = "/reset-password?token=abc123", reset } = {}) {
  const calls = [];
  t.mock.module("../src/service/authService.js", { exports: { resetPasswordWithToken: reset || (async (p) => { calls.push(p); return {}; }) } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/ResetPasswordPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Page)));
  await settle();
  return calls;
}
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const submit = async () => { fireEvent.click(screen.getByRole("button", { name: "Set new password" })); await settle(); };

test("a weak or mismatched password is refused under the box and nothing is sent", async (t) => {
  const calls = await open(t);
  await submit();
  assert.match(document.body.textContent, /At least 8 characters, with a letter and a number/);
  assert.match(document.body.textContent, /Re-enter the new password/);
  type("rp-password", "lettersonly"); type("rp-confirm", "lettersonly");
  await submit();
  assert.match(document.body.textContent, /with a letter and a number/);
  type("rp-password", "BrandNew123"); type("rp-confirm", "BrandNew124");
  await submit();
  assert.match(document.body.textContent, /do not match/);
  assert.equal(calls.length, 0);
});

test("a good password is sent with the token from the link and the person is told to sign in", async (t) => {
  const calls = await open(t);
  type("rp-password", "BrandNew123"); type("rp-confirm", "BrandNew123");
  await submit();
  assert.deepEqual(calls, [{ token: "abc123", password: "BrandNew123" }]);
  assert.match(document.body.textContent, /Your password has been changed/);
  assert.ok(screen.getByRole("link", { name: "Go to sign in" }));
});

test("a link with no token says so and offers a new link", async (t) => {
  await open(t, { url: "/reset-password" });
  assert.match(document.body.textContent, /This link is no longer valid/);
  assert.ok(screen.getByRole("link", { name: "Request a new link" }));
});

test("a link the server calls invalid or expired says so and offers a new link", async (t) => {
  await open(t, { url: "/reset-password?token=old", reset: async () => { throw Object.assign(new Error("This link is invalid or has expired. Please request a new one."), { status: 400 }); } });
  type("rp-password", "BrandNew123"); type("rp-confirm", "BrandNew123");
  await submit();
  assert.match(document.body.textContent, /This link is no longer valid/);
  assert.ok(screen.getByRole("link", { name: "Request a new link" }));
});

test("another server problem is shown on the form so the person can try again", async (t) => {
  await open(t, { reset: async () => { throw Object.assign(new Error("The server took too long to respond."), { status: 0 }); } });
  type("rp-password", "BrandNew123"); type("rp-confirm", "BrandNew123");
  await submit();
  assert.match(document.querySelector("[role=alert]").textContent, /took too long/);
  assert.ok(screen.getByRole("button", { name: "Set new password" }));
});
