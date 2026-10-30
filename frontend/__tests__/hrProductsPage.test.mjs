/** "Explore HR Products" on the login page opens a page that explains Core HR, Leave Management and Docs Pro. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

test("the page covers all three products, the plans, and ways to start", async () => {
  const { default: Page } = await import(`../src/pages/public/HrProductsPage.jsx?t=${Math.random()}`);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  render(React.createElement(MemoryRouter, { initialEntries: ["/hr-products"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/hr-products", element: React.createElement(Page) }))));
  for (const name of ["Core HR", "Leave Management", "Zoiko Docs Pro"]) {
    assert.ok(screen.getByRole("heading", { level: 2, name }), name);
  }
  assert.ok(screen.getByTestId("plan-comparison"));
  assert.equal(screen.getAllByRole("link", { name: /Start free evaluation/ })[0].getAttribute("href"), "/register");
  assert.ok(screen.getAllByRole("link", { name: /Sign in/ })[0].getAttribute("href") === "/login");
  assert.ok(document.getElementById("docs-pro"));
});

