/** ZHR-68: the Onboarding Dashboard's bars never run into their labels, and nothing on it is invented. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { monthLabel, barPercent, completionParts } from "../src/utils/onboardingDashboard.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("month labels are readable and bar lengths are sensible", () => {
  assert.equal(monthLabel("2026-03"), "Mar 2026");
  assert.equal(monthLabel("2025-12"), "Dec 2025");
  assert.equal(monthLabel("weird"), "weird");
  assert.equal(barPercent(0, 10), 0);
  assert.equal(barPercent(10, 10), 100);
  assert.equal(barPercent(1, 100), 3, "a small non-zero value still shows");
  assert.equal(barPercent(5, 0), 0);
});

test("the completion bar splits the hires three ways and leaves cancelled out", () => {
  const c = completionParts({ total: 10, completed: 2, in_progress: 3, not_started: 4, cancelled: 1 });
  assert.equal(c.total, 9);
  assert.deepEqual(c.parts.map((p) => [p.key, p.value, p.percent]), [["completed", 2, 22], ["in_progress", 3, 33], ["not_started", 4, 44]]);
  assert.equal(c.cancelled, 1);
  assert.equal(completionParts(null).total, 0);
});

const DASH = {
  totalNewHires: 12, pendingOnboarding: 8, completedOnboarding: 3, documentsPending: 2, checklistsPending: 5, orientationPending: 1,
  monthlyJoiningTrend: [{ month: "2026-03", count: 4 }, { month: "2026-04", count: 0 }],
  departmentWise: [{ department: "Management and Corporate Operations", count: 6 }, { department: "Engineering", count: 4 }, { department: "Unassigned", count: 2 }],
  completionStatus: { total: 12, completed: 3, in_progress: 5, not_started: 3, cancelled: 1, pending: 8 },
  upcomingJoiners: [{ id: 1, name: "Ann", position: "Dev", department: null, joining_date: "2026-11-02", status: "offer_sent" }],
  recentActivities: [],
};

async function load(t, over = {}) {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingDashboard: async () => { if (over.fail) throw new Error("Network down"); return { ...DASH, ...over.data }; },
    getOnboardingRecords: async () => [], deleteOnboardingRecord: async () => ({}), updateOnboardingRecord: async () => ({}),
    getOnboardingTasks: async () => [], createOnboardingTask: async () => ({}), updateOnboardingTask: async () => ({}), deleteOnboardingTask: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/dashboard.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

test("a long department name is cut inside its own column, with the full name on hover, and the bar stays separate", async (t) => {
  await load(t);
  const label = screen.getByText("Management and Corporate Operations");
  assert.match(label.className, /truncate/);
  assert.match(label.className, /shrink-0/, "the label keeps its own width instead of being squeezed by the bar");
  const row = label.closest("div.flex");
  assert.match(row.getAttribute("title"), /Management and Corporate Operations: 6 of 12 new hires/);
  const bar = row.querySelector("div.flex-1");
  assert.ok(bar && bar.className.includes("min-w-0"), "the bar sits in its own cell next to the label");
  assert.ok(!bar.contains(label));
});

test("the months read as names and no growth figures are invented", async (t) => {
  await load(t);
  assert.ok(screen.getByText("Mar 2026"));
  const text = document.body.textContent;
  assert.doesNotMatch(text, /\+12%|\+8%|from last month/);
  assert.ok(screen.getByText("Checklist Items Pending"));
  assert.doesNotMatch(text, /Assets Pending|Training Pending/);
  assert.match(text, /1 cancelled \(not counted above\)/);
  assert.match(text, /Unassigned/);
});

test("a failed load says so and offers Try again", async (t) => {
  await load(t, { fail: true });
  assert.match(screen.getByRole("alert").textContent, /Network down/);
  assert.ok(screen.getByRole("button", { name: "Try again" }));
});

test("with no new hires the charts say so instead of drawing empty shapes", async (t) => {
  await load(t, { data: { totalNewHires: 0, departmentWise: [], monthlyJoiningTrend: [], completionStatus: { total: 0, completed: 0, in_progress: 0, not_started: 0, cancelled: 0 }, upcomingJoiners: [] } });
  assert.ok(screen.getByText("No new hires yet"));
  assert.equal(screen.getAllByText("No data available").length, 2);
});
