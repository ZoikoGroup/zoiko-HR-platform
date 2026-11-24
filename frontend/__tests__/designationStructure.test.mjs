/** Designation Structure: every level up to the maximum depth (empty ones too), designations whatever the case of their
 * level, a "No level yet" group, and the level can be changed from the page. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const updates = [];
const mocked = new WeakSet();
const ROWS = [
  { id: 1, title: "Engineer", level: "l3", status: "active", employees_count: 2 },
  { id: 2, title: "Intern", level: "L1", status: "active", employees_count: 0 },
  { id: 3, title: "Imported Role", level: null, status: "active", employees_count: 1 },
  { id: 4, title: "Chief", level: "L10", status: "active", employees_count: 1 },
];

async function open(t, over = {}) {
  updates.length = 0;
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDesignations: over.getDesignations || (async () => ({ data: ROWS })),
      getDesignationSettings: async () => ({ max_hierarchy_depth: 4 }),
      updateDesignation: async (id, body) => { updates.push([id, body]); return { data: {} }; },
    } });
  }
  const mod = await import("../src/modules/zoiko-hr/designations/designation-structure.jsx");
  render(React.createElement(mod.default));
  await settle();
  return mod;
}

const levelButtons = () => screen.getAllByRole("button", { expanded: true }).concat(screen.queryAllByRole("button", { expanded: false }));

test("every level up to the maximum shows, plus levels in use beyond it and a No level yet group", async (t) => {
  await open(t);
  for (const name of [/Entry Level/, /Junior/, /Mid-Level/, /Senior/, /C-Level/, /No level yet/]) {
    assert.ok(levelButtons().some((b) => name.test(b.textContent)), String(name));
  }
  assert.ok(screen.getByText("Engineer"), "a lower-case l3 is grouped under L3");
  assert.ok(screen.getByText("Imported Role"), "no level is not hidden");
  assert.ok(screen.getByText("Above the maximum depth in Settings"));
});

test("the level can be changed from the page", async (t) => {
  await open(t);
  fireEvent.click(screen.getByText("Imported Role"));
  const panel = screen.getByRole("complementary", { name: "Designation details" });
  fireEvent.change(within(panel).getByLabelText("Level"), { target: { value: "L2" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(updates, [[3, { level: "L2" }]]);
  assert.ok(within(panel).getByText("Level saved."));
});

test("normalizeLevel and groupByLevel", async (t) => {
  const { normalizeLevel, groupByLevel } = await open(t);
  assert.deepEqual(["l3", " L3 ", "3", "L03", "", null, "Band A"].map(normalizeLevel), ["L3", "L3", "L3", "L3", null, null, "BAND A"]);
  const g = groupByLevel(ROWS, 4);
  assert.deepEqual(g.map((x) => [x.level, x.items.length]), [["L1", 1], ["L2", 0], ["L3", 1], ["L4", 0], ["L10", 1], ["none", 1]]);
});
