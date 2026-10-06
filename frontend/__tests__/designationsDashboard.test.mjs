/** ZHR-52: the Designations dashboard shows the organization's real data, nothing hard-coded. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const svc = {};
const mocked = new WeakSet();

const D = (id, title, dept, level, status, min, max, emps, created) => ({
  id, title, department_name: dept, level, status, min_salary: min, max_salary: max, employees_count: emps, created_at: created,
});
// Deliberately unlike the old static page (which always said "$60K - $180K", L1-L10 bars of 2,2,2,1,2,3,1,1,1,1).
const DATA = [
  D(1, "QA Engineer", "Quality", "L2", "active", 40000, 55000, 4, "2026-09-01T10:00:00Z"),
  D(2, "QA Lead", "Quality", "L5", "active", 70000, 90000, 1, "2026-09-05T10:00:00Z"),
  D(3, "CTO", "Executive", "L10", "inactive", 250000, 400000, 0, "2026-09-10T10:00:00Z"),
  D(4, "Intern", "Quality", null, "active", null, null, 2, "2026-09-12T10:00:00Z"),
];

async function open(t, getDesignations = async () => ({ data: DATA })) {
  svc.get = getDesignations;
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children, to }) => React.createElement("a", { href: to }, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/service/hrService.js", { exports: { getDesignations: (...a) => svc.get(...a) } });
  }
  const { default: Page } = await import("../src/modules/zoiko-hr/designations/dashboard.jsx");
  render(React.createElement(Page));
  await settle();
}

test("headline numbers come from the data", async (t) => {
  await open(t);
  assert.equal(screen.getByTestId("hero-active").textContent, "3");
  assert.ok(screen.getByText("4 total across 2 departments"));
  assert.ok(screen.getByText("3/10")); // L2, L5, L10 are the levels in use
  assert.ok(screen.getByText("$40K - $400K")); // lowest minimum to highest maximum, not a fixed string
  assert.equal(screen.queryByText(/60K - \$180K/), null);
  assert.ok(screen.getByText("1 inactive"));
  const employeesCard = screen.getByText("Employees in Designations").closest("div.bg-white");
  assert.ok(within(employeesCard).getByText("7")); // 4 + 1 + 0 + 2 active employees assigned
  assert.equal(screen.queryByText(/vs last month/), null); // no invented trend percentages
});

test("the level chart counts real designations per level", async (t) => {
  await open(t);
  const count = (lvl) => within(screen.getByTestId(`level-${lvl}`)).getAllByText(/^\d+$/)[0].textContent;
  assert.equal(count("L2"), "1");
  assert.equal(count("L5"), "1");
  assert.equal(count("L10"), "1");
  assert.equal(count("L1"), "0");
  assert.equal(count("L6"), "0"); // the old static chart showed 3 here
  assert.ok(screen.getByTestId("level-—")); // the designation with no level gets its own bar
});

test("salary ranges are per level from the data and skip levels with none", async (t) => {
  await open(t);
  assert.ok(within(screen.getByTestId("salary-L2")).getByText("$40K - $55K"));
  assert.ok(within(screen.getByTestId("salary-L10")).getByText("$250K - $400K"));
  assert.equal(screen.queryByTestId("salary-L3"), null);
  assert.equal(screen.queryByTestId("salary-L1"), null);
});

test("department distribution and recent designations are real", async (t) => {
  await open(t);
  const distribution = screen.getByText("Department Distribution").closest("div.bg-white");
  const quality = within(distribution).getByText("Quality").closest("tr");
  assert.deepEqual([...quality.querySelectorAll("td")].map((c) => c.textContent), ["Quality", "3", "7"]);
  const recentTitles = [...screen.getAllByText("Intern"), ...screen.getAllByText("QA Lead")].length;
  assert.ok(recentTitles >= 2);
  // newest first: the Intern (created 12 Sep) is listed before the CTO (10 Sep)
  const order = [...document.querySelectorAll("tbody tr td:first-child")].map((c) => c.textContent);
  assert.ok(order.indexOf("Intern") < order.indexOf("CTO"));
});

test("an organization with no designations gets an honest empty state, not demo numbers", async (t) => {
  await open(t, async () => ({ data: [] }));
  assert.ok(screen.getByText("No designations yet"));
  assert.equal(screen.queryByText(/60K/), null);
  assert.ok(screen.getByRole("link", { name: "Go to Designation List" }));
});

test("a load failure shows the error with a working Retry", async (t) => {
  let n = 0;
  await open(t, async () => { if (n++ === 0) throw new Error("Server unavailable"); return { data: DATA }; });
  assert.ok(screen.getByRole("alert").textContent.includes("Server unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.equal(screen.getByTestId("hero-active").textContent, "3");
});

test("no hard-coded demo data is left in the page source", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/designations/dashboard.jsx", "utf8");
  assert.doesNotMatch(src, /STATIC_LEVEL_BARS|STATIC_MAX_COUNT|\$60K|410000|vs last month/);
});
