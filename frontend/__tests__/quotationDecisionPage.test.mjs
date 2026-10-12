/** ZHR-45: the "Review proposal" link in the quotation email opens a working decision page. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const svc = {};
const search = { value: "?token=abc123def456" };
const mocked = new WeakSet();

const QUOTE = { quote_number: "Q-2026-00001", organization_name: "Acme Ltd", plan: "Advanced", billing_cycle: "monthly", amount_display: "USD 15.00", valid_until: "2026-10-20T00:00:00Z" };

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/quotationService.js", { exports: {
    getQuotationByToken: (...a) => svc.get(...a), decideQuotation: (...a) => svc.decide(...a) } });
  t.mock.module("react-router-dom", { exports: { useSearchParams: () => [new URLSearchParams(search.value)] } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
}

async function open(t, over = {}) {
  register(t);
  search.value = "?token=abc123def456";
  Object.assign(svc, { get: async () => QUOTE, decide: async () => ({ status: "ok" }) }, over);
  const { default: Page } = await import("../src/pages/auth/QuotationDecisionPage.jsx");
  render(React.createElement(Page));
  await settle();
}

test("shows the quotation from the emailed link and records an accept", async (t) => {
  const calls = [];
  await open(t, { get: async (tok) => { calls.push(["get", tok]); return QUOTE; }, decide: async (tok, d) => { calls.push(["decide", tok, d]); return {}; } });
  assert.ok(screen.getByText("Quotation Q-2026-00001") && screen.getByText("USD 15.00") && screen.getByText("Advanced"));
  assert.ok(screen.getByText("Acme Ltd"));
  fireEvent.click(screen.getByRole("button", { name: /Accept quote/ }));
  await settle();
  assert.deepEqual(calls, [["get", "abc123def456"], ["decide", "abc123def456", "accept"]]);
  assert.ok(screen.getByText("Quotation accepted"));
});

test("declining works and buttons are disabled while the request is in flight", async (t) => {
  let release;
  await open(t, { decide: () => new Promise((r) => { release = r; }) });
  fireEvent.click(screen.getByRole("button", { name: /Decline quote/ }));
  await settle();
  assert.equal(screen.getByRole("button", { name: /Accept quote/ }).disabled, true);
  await act(async () => { release({}); await new Promise((r) => setTimeout(r, 30)); });
  assert.ok(screen.getByText("Quotation declined"));
});

test("an expired or used link explains itself instead of showing a dead page", async (t) => {
  await open(t, { get: async () => { throw new Error("This quotation link is no longer valid. It may have expired or already been decided."); } });
  assert.ok(screen.getByRole("alert").textContent.includes("no longer valid"));
  assert.equal(screen.queryByRole("button", { name: /Accept quote/ }), null);
});

test("a link without a token is reported", async (t) => {
  register(t);
  search.value = "";
  Object.assign(svc, { get: async () => QUOTE, decide: async () => ({}) });
  const { default: Page } = await import("../src/pages/auth/QuotationDecisionPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByRole("alert").textContent.includes("incomplete"));
});

test("a failed decision shows the server message and lets the user retry", async (t) => {
  let n = 0;
  await open(t, { decide: async () => { if (n++ === 0) throw new Error("Too many attempts"); return {}; } });
  fireEvent.click(screen.getByRole("button", { name: /Accept quote/ }));
  await settle();
  assert.ok(screen.getByRole("alert").textContent.includes("Too many attempts"));
  fireEvent.click(screen.getByRole("button", { name: /Accept quote/ }));
  await settle();
  assert.ok(screen.getByText("Quotation accepted"));
});
