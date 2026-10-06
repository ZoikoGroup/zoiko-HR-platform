/** ZHR-54: Designation Reports show the organization's real report; the department table no longer shows 0s. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const svc = {};
const calls = [];
const mocked = new WeakSet();

const REPORT = {
  totals: { designations: 3, active: 2, inactive: 1, employees: 5, unfilled: 1, without_salary_range: 1, departments: 2, salary_min_total: 340000, salary_max_total: 520000 },
  by_department: [
    { department: "Engineering", designations: 2, active_designations: 2, employees: 5, salary_min_total: 340000, salary_max_total: 520000 },
    { department: "People", designations: 1, active_designations: 0, employees: 0, salary_min_total: 0, salary_max_total: 0 },
  ],
  headcount_trend: [
    { month: "2026-08", label: "Aug 2026", count: 1, joined: 1 },
    { month: "2026-09", label: "Sep 2026", count: 3, joined: 2 },
    { month: "2026-10", label: "Oct 2026", count: 5, joined: 2 },
  ],
  designation_growth: [{ quarter: "Q3 2026", new: 2, total: 2 }, { quarter: "Q4 2026", new: 1, total: 3 }],
  designations: [{ id: 1, title: "Engineer, Senior", designation_code: "DES1", department: "Engineering", level: "L3", status: "active", employees: 5, min_salary: 50000, max_salary: 80000 }],
};

async function open(t, impl = async () => REPORT) {
  calls.length = 0;
  svc.report = async (p) => { calls.push(p); return impl(p); };
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children, to }) => React.createElement("a", { href: to }, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/service/hrService.js", { exports: { getDesignationReport: (...a) => svc.report(...a) } });
  }
  const { default: Page } = await import("../src/modules/zoiko-hr/designations/reports.jsx");
  render(React.createElement(Page));
  await settle();
}

test("the stat cards come from the report", async (t) => {
  await open(t);
  const card = (title) => screen.getByText(title).closest("div.bg-white");
  assert.ok(within(card("Total Designations")).getByText("3") && within(card("Total Designations")).getByText("2 active · 1 inactive"));
  assert.ok(within(card("Total Headcount")).getByText("5") && within(card("Total Headcount")).getByText("1 designation with no employees"));
  assert.ok(within(card("Salary Budget")).getByText("$340K - $520K"));
  assert.ok(within(card("Departments")).getByText("1 without a salary range"));
});

test("Budget by Department lists departments with designations AND employees (it used to show 0)", async (t) => {
  await open(t);
  const table = screen.getByText("Budget by Department").closest("div.bg-white");
  const eng = within(table).getByText("Engineering").closest("tr");
  assert.deepEqual([...eng.querySelectorAll("td")].map((c) => c.textContent.replace(/\s+/g, " ").trim()), ["Engineering", "2", "5", "$340K - $520K"]);
  const people = within(table).getByText("People").closest("tr");
  assert.equal(people.querySelectorAll("td")[3].textContent, "—"); // no salary range set
  assert.ok(within(table).getByText("Total").closest("tr").textContent.includes("$340K - $520K"));
});

test("the trends are the server's, not the old hard-coded months and quarters", async (t) => {
  await open(t);
  assert.equal(within(screen.getByTestId("trend-2026-10")).getByText("5").textContent, "5");
  assert.equal(within(screen.getByTestId("trend-2026-08")).getByText("1").textContent, "1");
  assert.ok(screen.getByTestId("growth-Q4 2026"));
  assert.equal(screen.queryByText(/Q1 2025|Q2 2026/), null);
  assert.equal(screen.queryByText("294"), null); // the old static December value
});

test("an organization with no designations gets an honest empty state", async (t) => {
  await open(t, async () => ({ ...REPORT, totals: { ...REPORT.totals, designations: 0, employees: 0 }, by_department: [], designation_growth: [], designations: [] }));
  assert.ok(screen.getByText("No designations to report on yet"));
  assert.equal(screen.queryByText("Budget by Department"), null);
});

test("a failed load shows the error and Retry reloads", async (t) => {
  let n = 0;
  await open(t, async () => { if (n++ === 0) throw new Error("Server unavailable"); return REPORT; });
  assert.ok(screen.getByRole("alert").textContent.includes("Server unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.ok(screen.getByText("Budget by Department"));
  assert.ok(calls[1]?._, "retry asks for a fresh copy");
});

test("Refresh asks the server for a fresh report", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
  await settle();
  assert.equal(calls.length, 2);
  assert.ok(calls[1]?._);
});

test("Export CSV writes the real designations (title, not an undefined name) and quotes commas", async (t) => {
  await open(t);
  let text = "";
  const OriginalBlob = globalThis.Blob;
  globalThis.Blob = class extends OriginalBlob { constructor(parts, o) { super(parts, o); text = parts.join(""); } };
  const createUrl = URL.createObjectURL;
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
  try {
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  } finally {
    globalThis.Blob = OriginalBlob;
    URL.createObjectURL = createUrl;
  }
  const lines = text.split("\n");
  assert.equal(lines[0], "Designation,Code,Department,Level,Status,Active employees,Min salary,Max salary");
  assert.equal(lines[1], '"Engineer, Senior",DES1,Engineering,L3,active,5,50000,80000');
  assert.doesNotMatch(text, /undefined/);
});

test("no demo numbers are left in the page source", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/designations/reports.jsx", "utf8");
  assert.doesNotMatch(src, /startEmployees|month: "Jan"|Q1 2025|count: 294|new_designations/);
});
