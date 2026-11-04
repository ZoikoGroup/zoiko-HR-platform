/** Department Settings load what is saved, save what is changed, and stay off after a reload. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { normalizeDepartmentSettings, validateDepartmentSettings, DEFAULT_DEPARTMENT_SETTINGS } from "../src/utils/departmentSettings.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const mocked = new WeakSet();
const svc = {};

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getDepartmentSettings: (...a) => svc.get(...a), saveDepartmentSettings: (...a) => svc.save(...a),
  } });
}

const SAVED = { ...DEFAULT_DEPARTMENT_SETTINGS, auto_generate_codes: false, show_budget: false, compact_mode: true, max_hierarchy_depth: 3, notifications: { ...DEFAULT_DEPARTMENT_SETTINGS.notifications, created: false } };

async function openSettings(t, saved = SAVED) {
  register(t);
  const sent = [];
  svc.get = async () => saved;
  svc.save = async (p) => { sent.push(p); return p; };
  const { default: Page } = await import(`../src/modules/zoiko-hr/departments/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return sent;
}

const sw = (name) => screen.getByRole("switch", { name });

test("the page shows what is saved: switches that were turned off stay off after a reload", async (t) => {
  await openSettings(t);
  assert.equal(sw("Auto-generate Department Codes").getAttribute("aria-checked"), "false");
  fireEvent.click(screen.getByRole("tab", { name: /Hierarchy/ }));
  assert.equal(sw("Enforce Single Parent").getAttribute("aria-checked"), "true");
  assert.equal(screen.getByDisplayValue("3").getAttribute("type"), "number");
  fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));
  assert.equal(sw("Department created").getAttribute("aria-checked"), "false");
  assert.equal(sw("Department updated").getAttribute("aria-checked"), "true");
  fireEvent.click(screen.getByRole("tab", { name: /Display/ }));
  assert.equal(sw("Compact Mode").getAttribute("aria-checked"), "true");
  assert.equal(sw("Show Budget").getAttribute("aria-checked"), "false");
});

test("Save is disabled until something changes, then sends the whole set and confirms", async (t) => {
  const sent = await openSettings(t);
  const save = screen.getByRole("button", { name: /Save Changes/ });
  assert.equal(save.disabled, true);
  fireEvent.click(sw("Auto-generate Department Codes"));
  assert.equal(save.disabled, false);
  assert.ok(screen.getByText("Unsaved changes"));
  fireEvent.click(save);
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].auto_generate_codes, true);
  assert.equal(sent[0].compact_mode, true, "everything else is sent unchanged");
  assert.equal(sent[0].notifications.created, false);
  assert.ok(screen.getByText("Settings saved"));
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true);
});

test("disabling a switch, saving, and reloading keeps it disabled", async (t) => {
  const sent = await openSettings(t, { ...SAVED, enforce_unique_codes: true });
  const unique = sw("Enforce Unique Department Codes");
  assert.equal(unique.getAttribute("aria-checked"), "true");
  fireEvent.click(unique);
  assert.equal(unique.getAttribute("aria-checked"), "false");
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].enforce_unique_codes, false);
  // a reload shows the saved off state, not the default on state
  cleanup();
  const sent2 = await openSettings(t, { ...SAVED, enforce_unique_codes: false });
  assert.equal(sw("Enforce Unique Department Codes").getAttribute("aria-checked"), "false");
  assert.equal(sent2.length, 0, "nothing to save on a fresh load");
});

test("an invalid prefix or depth is flagged on its field and blocks Save", async (t) => {
  const sent = await openSettings(t);
  fireEvent.change(screen.getByDisplayValue("DEPT"), { target: { value: "x" } });
  assert.ok(screen.getByText(/2 to 6 letters or digits/));
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true);
  fireEvent.change(screen.getByDisplayValue("X"), { target: { value: "dep" } });
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, false);
  fireEvent.click(screen.getByRole("tab", { name: /Hierarchy/ }));
  fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "11" } });
  assert.ok(screen.getByText("Enter a whole number from 1 to 10."));
  assert.equal(sent.length, 0);
});

test("when the settings cannot be loaded the page says so instead of showing defaults as if saved", async (t) => {
  register(t);
  svc.get = async () => { throw new Error("Network down"); };
  const { default: Page } = await import(`../src/modules/zoiko-hr/departments/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Network down.*defaults, not your saved settings/);
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true, "defaults can never overwrite saved settings by accident");
});

test("pure helpers: tolerant reader and validation", () => {
  assert.deepEqual(normalizeDepartmentSettings(null), DEFAULT_DEPARTMENT_SETTINGS);
  const n = normalizeDepartmentSettings({ items_per_page: 7, default_sort_field: "nope", compact_mode: "yes", notifications: { created: false, bogus: true } });
  assert.equal(n.items_per_page, 10);
  assert.equal(n.default_sort_field, "name");
  assert.equal(n.compact_mode, false);
  assert.equal(n.notifications.created, false);
  assert.equal("bogus" in n.notifications, false);
  assert.deepEqual(validateDepartmentSettings(n), {});
});
