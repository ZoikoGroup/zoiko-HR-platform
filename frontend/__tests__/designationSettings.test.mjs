/** ZHR-52: Designation Settings load what is saved, save what is changed, and shape the Designation List. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { normalizeDesignationSettings, validateDesignationSettings, sortDesignations, DEFAULT_DESIGNATION_SETTINGS } from "../src/utils/designationSettings.js";

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
    getDesignationSettings: (...a) => svc.get(...a), saveDesignationSettings: (...a) => svc.save(...a),
    getDesignations: (...a) => svc.designations(...a), getDepartments: async () => ({ data: [{ id: 1, name: "Eng" }] }), getHrEmployees: async () => ({ data: [] }),
    createDesignation: (...a) => svc.create(...a), updateDesignation: async () => ({}), deleteDesignation: async () => ({}),
  } });
  t.mock.module("../src/service/employee.js", { exports: { updateEmployee: async () => ({}) } });
}

const SAVED = { ...DEFAULT_DESIGNATION_SETTINGS, auto_generate_codes: false, show_salary_range: false, compact_mode: true, max_hierarchy_depth: 3, notifications: { ...DEFAULT_DESIGNATION_SETTINGS.notifications, created: false } };

async function openSettings(t, saved = SAVED) {
  register(t);
  const sent = [];
  svc.get = async () => saved;
  svc.save = async (p) => { sent.push(p); return p; };
  const { default: Page } = await import(`../src/modules/zoiko-hr/designations/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return sent;
}

const sw = (name) => screen.getByRole("switch", { name });

test("the page shows what is saved: switches that were turned off stay off after a reload", async (t) => {
  await openSettings(t);
  assert.equal(sw("Auto-generate Designation Codes").getAttribute("aria-checked"), "false");
  fireEvent.click(screen.getByRole("tab", { name: /Hierarchy/ }));
  assert.equal(sw("Enforce Single Parent").getAttribute("aria-checked"), "true");
  assert.equal(screen.getByDisplayValue("3").getAttribute("type"), "number");
  fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));
  assert.equal(sw("Designation created").getAttribute("aria-checked"), "false");
  assert.equal(sw("Designation updated").getAttribute("aria-checked"), "true");
  fireEvent.click(screen.getByRole("tab", { name: /Display/ }));
  assert.equal(sw("Compact Mode").getAttribute("aria-checked"), "true");
  assert.equal(sw("Show Salary Range").getAttribute("aria-checked"), "false");
});

test("Save is disabled until something changes, then sends the whole set and confirms", async (t) => {
  const sent = await openSettings(t);
  const save = screen.getByRole("button", { name: /Save Changes/ });
  assert.equal(save.disabled, true);
  fireEvent.click(sw("Auto-generate Designation Codes"));
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

test("a rejected save keeps the changes on screen and says why", async (t) => {
  await openSettings(t);
  svc.save = async () => { throw new Error("This action requires admin privileges."); };
  fireEvent.click(sw("Auto-generate Designation Codes"));
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /requires admin privileges/);
  assert.equal(sw("Auto-generate Designation Codes").getAttribute("aria-checked"), "true");
  assert.ok(screen.getByText("Unsaved changes"));
});

test("an invalid prefix or depth is flagged on its field and blocks Save", async (t) => {
  const sent = await openSettings(t);
  fireEvent.change(screen.getByDisplayValue("DES"), { target: { value: "x" } });
  assert.ok(screen.getByText(/2 to 6 letters or digits/));
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true);
  fireEvent.change(screen.getByDisplayValue("X"), { target: { value: "pos" } });
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, false);
  fireEvent.click(screen.getByRole("tab", { name: /Hierarchy/ }));
  fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "11" } });
  assert.ok(screen.getByText("Enter a whole number from 1 to 10."));
  assert.equal(sent.length, 0);
});

test("Discard puts back what was saved", async (t) => {
  await openSettings(t);
  fireEvent.click(sw("Auto-generate Designation Codes"));
  fireEvent.click(screen.getByRole("button", { name: /Discard/ }));
  assert.equal(sw("Auto-generate Designation Codes").getAttribute("aria-checked"), "false");
});

test("when the settings cannot be loaded the page says so instead of showing defaults as if saved", async (t) => {
  register(t);
  svc.get = async () => { throw new Error("Network down"); };
  const { default: Page } = await import(`../src/modules/zoiko-hr/designations/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /Network down.*defaults, not your saved settings/);
  assert.equal(screen.getByRole("button", { name: /Save Changes/ }).disabled, true, "defaults can never overwrite saved settings by accident");
});

test("the Designation List follows the settings: sort, page size, salary column, compact rows, level limit", async (t) => {
  register(t);
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Role ${String.fromCharCode(71 - i)}`, designation_code: `D${i}`, department_name: "Eng", level: "L1", status: "active", min_salary: 100, max_salary: 200, employees_count: 0, created_at: "2026-01-01T00:00:00Z" }));
  svc.designations = async () => ({ data: rows });
  svc.get = async () => ({ ...DEFAULT_DESIGNATION_SETTINGS, items_per_page: 5, default_sort_field: "title", default_sort_direction: "asc", show_salary_range: true, show_employee_count: false, compact_mode: true, max_hierarchy_depth: 2, auto_generate_codes: false });
  const { default: Page } = await import(`../src/modules/zoiko-hr/designations/designation-list.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  const titles = () => [...document.querySelectorAll("tbody tr td:nth-child(2)")].map((c) => c.textContent);
  assert.deepEqual(titles(), ["Role A", "Role B", "Role C", "Role D", "Role E"], "sorted by title, 5 per page");
  assert.ok(screen.getByText("1–5 of 7"));
  assert.ok(screen.getAllByText("100 – 200").length > 0, "salary range column");
  assert.equal([...document.querySelectorAll("th")].some((h) => h.textContent === "Employee"), false, "employee column hidden");
  assert.ok(document.querySelector("tbody td.py-1\\.5"), "compact rows");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  assert.deepEqual(titles(), ["Role F", "Role G"]);
  fireEvent.click(screen.getByRole("button", { name: /Add Designation/ }));
  const level = screen.getByDisplayValue("L1");
  assert.deepEqual([...level.querySelectorAll("option")].map((o) => o.value), ["L1", "L2"], "levels stop at the maximum depth");
  assert.ok(screen.getByLabelText("Designation Code"), "a code is typed when automatic codes are off");
});

test("pure helpers: tolerant reader, validation and sorting", () => {
  assert.deepEqual(normalizeDesignationSettings(null), DEFAULT_DESIGNATION_SETTINGS);
  const n = normalizeDesignationSettings({ items_per_page: 7, default_sort_field: "nope", compact_mode: "yes", notifications: { created: false, bogus: true } });
  assert.equal(n.items_per_page, 10);
  assert.equal(n.default_sort_field, "title");
  assert.equal(n.compact_mode, false);
  assert.equal(n.notifications.created, false);
  assert.equal("bogus" in n.notifications, false);
  assert.deepEqual(validateDesignationSettings(n), {});
  const rows = [{ title: "b", level: "L10" }, { title: "A", level: "L2" }, { title: "c", level: null }];
  assert.deepEqual(sortDesignations(rows, "title", "asc").map((r) => r.title), ["A", "b", "c"]);
  assert.deepEqual(sortDesignations(rows, "level", "desc").map((r) => r.level), ["L10", "L2", null]);
});
