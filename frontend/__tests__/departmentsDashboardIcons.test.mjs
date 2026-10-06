/** ZHR-50: the Departments dashboard icons were white on pale tinted tiles (invisible). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());

test("every summary card icon has a dark shade on its tinted tile", async (t) => {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: { getDepartments: async () => ({ items: [
    { id: 1, name: "Engineering", is_active: true, employee_count: 5, budget: 100000, spent_budget: 40000, head: "Ann" },
    { id: 2, name: "Sales", is_active: false, employee_count: 2, budget: 50000, spent_budget: 10000 },
  ] }) } });
  const { default: Page } = await import("../src/modules/zoiko-hr/departments/dashboard.jsx");
  render(React.createElement(Page));
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  const tiles = screen.getAllByTestId("stat-icon");
  assert.equal(tiles.length, 6);
  for (const tile of tiles) {
    const cls = tile.className;
    assert.doesNotMatch(cls, /text-white/, `icon tile must not force a white icon: ${cls}`);
    assert.match(cls, /text-(rose|green|gray|blue|amber)-[5-7]00/, `icon needs a visible dark shade: ${cls}`);
    assert.match(cls, /bg-(rose|green|gray|blue|amber)-(50|100)/);
    assert.ok(tile.querySelector("svg"), "the icon is actually rendered");
  }
});
