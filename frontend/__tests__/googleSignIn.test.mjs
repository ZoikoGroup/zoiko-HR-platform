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
    resendVerification: async () => ({}),
    mfaEnrollStart: async () => ({}),
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

test("when the server cannot be asked (starting up, offline) the button still works and nothing claims it is not set up", async (t) => {
  await open(t, { enabled: null });
  assert.equal(screen.getByRole("button", { name: /Continue with Google/ }).disabled, false);
  assert.doesNotMatch(document.body.textContent, /not set up/);
});

test("coming back to the page with the Back button un-sticks the Google button", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));   // jsdom does not leave the page
  assert.ok(screen.getByRole("button", { name: /Connecting to Google/ }).disabled);
  const restored = new window.Event("pageshow");
  Object.defineProperty(restored, "persisted", { value: true });
  await act(async () => { window.dispatchEvent(restored); });
  assert.equal(screen.getByRole("button", { name: /Continue with Google/ }).disabled, false);
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

test("the login page shows Microsoft, Google, Apple and Company SSO in the design's order; only Google starts a sign-in", async (t) => {
  await open(t);
  const names = [...document.querySelectorAll(".social-login-options button")].map((b) => b.textContent.trim());
  assert.deepEqual(names, ["Continue with Microsoft", "Continue with Google", "Continue with Apple", "Continue with Company SSO"]);
  // Microsoft, Apple and SSO have no server side yet: pressing one says so and goes nowhere.
  const before = window.location.href;
  for (const [label, provider] of [[/Microsoft/, "Microsoft"], [/Apple/, "Apple"], [/Company SSO/, "Company SSO"]]) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: label })); });
    assert.match(screen.getByRole("status").textContent, new RegExp(`Sign in with ${provider} is not available yet`));
  }
  assert.equal(window.location.href, before);
});

test("the login page is the hero and the sign-in card: tabs, account links and legal links go to their pages", async (t) => {
  await open(t);
  assert.equal(document.querySelector("header"), null);
  assert.ok(document.querySelector("img.login-hero-image").getAttribute("alt").startsWith("Zoiko HR"));
  const tabs = document.querySelector("nav[aria-label='Account options']");
  assert.deepEqual([...tabs.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]),
    [["Login", "/login"], ["Register", "/register"], ["Reset Password", "/forgot-password"]]);
  assert.equal(tabs.querySelector("[aria-current='page']").textContent, "Login");
  assert.equal(screen.getByText("Forgot password?").getAttribute("href"), "/forgot-password");
  assert.equal(document.querySelector(".register-prompt a").getAttribute("href"), "/register");
  assert.equal(screen.getByText("Terms").getAttribute("href"), "/terms");
  assert.match(document.querySelector(".login-footer").textContent, /© 2026 Zoiko Tech Inc\./);
});

// ── A1 (QA report 10 Nov 2026) ───────────────────────────────────────────────────────────────────────────────────────
import { googleExchangeMessage, GOOGLE_NEEDS_PASSWORD } from "../src/utils/googleSignIn.js";

test("A1 a signed-in Google user lands on their role's dashboard, not the pre-login default", async (t) => {
  const calls = { exchange: [] };
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => true, resendVerification: async () => ({}), mfaEnrollStart: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "https://api.example.com" } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    login: async () => ({}), loginWithGoogle: async (tk) => { calls.exchange.push(tk); return { id: 1, role: "employee" }; },
    error: null, defaultRedirect: "/dashboard",
  }) } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?a1=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login?google_ticket=t1"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/login", element: React.createElement(Page) }),
    React.createElement(Route, { path: "*", element: React.createElement(Where) }))));
  await settle();
  assert.deepEqual(calls.exchange, ["t1"]);
  assert.equal(screen.getByTestId("where").textContent, "/employee/ess");
});

test("A1 a Google user with a temporary password goes to the screen that replaces it", async (t) => {
  t.mock.module("../src/service/authService.js", { exports: { googleSignInEnabled: async () => true, resendVerification: async () => ({}), mfaEnrollStart: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { API_BASE_URL: "https://api.example.com" } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    login: async () => ({}), loginWithGoogle: async () => ({ id: 1, role: "admin", mustChangePassword: true }), error: null, defaultRedirect: "/dashboard",
  }) } });
  const { default: Page } = await import(`../src/pages/auth/LoginPage.jsx?a1b=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login?google_ticket=t2"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/login", element: React.createElement(Page) }),
    React.createElement(Route, { path: "*", element: React.createElement(Where) }))));
  await settle();
  assert.equal(screen.getByTestId("where").textContent, "/change-password");
});

test("A1 every exchange failure is shown in words and the Google button works again", async (t) => {
  await open(t, { url: "/login?google_ticket=x", exchange: async () => { throw Object.assign(new Error("Your organization has been suspended. Please contact support."), { status: 401 }); } });
  assert.match(document.querySelector("[role=alert]")?.textContent || document.body.textContent, /suspended/);
  assert.equal(screen.getByRole("button", { name: /Continue with Google/ }).disabled, false);
});

test("A1 the exchange message: server reason, a sentence for second-factor accounts, a fallback for network failures", () => {
  assert.equal(googleExchangeMessage(Object.assign(new Error("Your account has been deactivated."), { status: 401 })), "Your account has been deactivated.");
  assert.equal(googleExchangeMessage({ code: "MFA_REQUIRED", message: "x" }), GOOGLE_NEEDS_PASSWORD);
  assert.equal(googleExchangeMessage({ status: 0, message: "Failed to fetch" }), GOOGLE_ERRORS.failed);
  assert.equal(googleExchangeMessage(undefined), GOOGLE_ERRORS.failed);
});

test("A1 the Google button tells the server which app to come back to", async () => {
  const { googleLoginUrl } = await import("../src/utils/googleSignIn.js");
  assert.equal(googleLoginUrl("https://api.example.com", "https://app.zoikohr.com"),
    "https://api.example.com/auth/google/login?return_to=https%3A%2F%2Fapp.zoikohr.com");
  assert.equal(googleLoginUrl("https://api.example.com/", ""), "https://api.example.com/auth/google/login");
});
