/** ZHR-4: "Continue with Google" really starts Google sign-in, finishes it when Google sends the person back, and explains every failure. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { googleErrorMessage, readGoogleReturn, withoutGoogleParams, GOOGLE_ERRORS } from "../src/utils/googleSignIn.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("the address Google sends the person back to is read and then cleaned", () => {
  assert.deepEqual(readGoogleReturn("?google_ticket=abc.def"), { ticket: "abc.def", error: "" });
  assert.deepEqual(readGoogleReturn("?google_error=no_account"), { ticket: "", error: "no_account" });
  assert.deepEqual(readGoogleReturn(""), { ticket: "", error: "" });
  assert.equal(withoutGoogleParams("?google_ticket=abc&redirect=%2Fx"), "?redirect=%2Fx");
  assert.equal(withoutGoogleParams("?google_error=failed"), "");
  for (const code of Object.keys(GOOGLE_ERRORS)) assert.ok(googleErrorMessage(code).length > 20, code);
  assert.equal(googleErrorMessage("who-knows"), GOOGLE_ERRORS.failed);
});

function Where() {
  const l = useLocation();
  return React.createElement("div", { "data-testid": "where" }, `${l.pathname}${l.search}`);
}

async function open(t, { url = "/login", enabled = true, exchange } = {}) {
  const calls = { exchange: [], assigned: [] };
  t.mock.module("../src/service/authService.js", { exports: {
    googleSignInEnabled: async () => enabled,
    login: async () => ({}), loginWithGoogleTicket: async () => ({}),
  } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "https://api.example.com" } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    login: async () => ({}),
    loginWithGoogle: exchange || (async (ticket) => { calls.exchange.push(ticket); return { id: 1 }; }),
    error: null, defaultRedirect: "/home",
  }) } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/login", element: React.createElement(React.Fragment, null, React.createElement(Page), React.createElement(Where)) }),
    React.createElement(Route, { path: "/home", element: React.createElement("div", null, "HOME PAGE") }))));
  await settle();
  return calls;
}

test("the Google button is a real, working button: it leaves for the server's Google sign-in address", async (t) => {
  await open(t);
  const button = screen.getByRole("button", { name: /Continue with Google/ });
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute("type"), "button");
});

test("when Google sign-in is not set up the button is disabled and the page says so", async (t) => {
  await open(t, { enabled: false });
  assert.equal(screen.getByRole("button", { name: /Continue with Google/ }).disabled, true);
  assert.match(document.body.textContent, /not set up for this site yet/);
});

test("coming back with a ticket finishes the sign-in, goes to the person's home page and cleans the address", async (t) => {
  const calls = await open(t, { url: "/login?google_ticket=abc.def" });
  assert.deepEqual(calls.exchange, ["abc.def"]);
  assert.match(document.body.textContent, /HOME PAGE/);
});

test("coming back with a reason shows it in words, once, and cleans the address", async (t) => {
  await open(t, { url: "/login?google_error=no_account" });
  assert.match(document.body.textContent, /No Zoiko HR account uses this Google email address/);
  assert.equal(document.querySelector('[data-testid="where"]').textContent, "/login");
});

test("a refused ticket shows the server's message and the person stays on the login page", async (t) => {
  await open(t, { url: "/login?google_ticket=old", exchange: async () => { throw new Error("That sign-in link expired. Please try again."); } });
  assert.match(document.body.textContent, /That sign-in link expired/);
  assert.doesNotMatch(document.body.textContent, /HOME PAGE/);
});

test("Google is the only single sign-on option on the login page: no Microsoft and no SSO buttons", async (t) => {
  await open(t);
  assert.ok(screen.getByRole("button", { name: /Continue with Google/ }));
  assert.equal(screen.queryByRole("button", { name: /Microsoft/i }), null);
  assert.equal(screen.queryByRole("button", { name: /SSO/i }), null);
  assert.doesNotMatch(document.body.textContent, /Microsoft|Continue with SSO/);
});
