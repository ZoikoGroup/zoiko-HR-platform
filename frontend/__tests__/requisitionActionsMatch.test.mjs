/**
 * Job Requisitions: the row's "..." menu and the detail panel's Quick Actions offer the SAME actions, with the same names,
 * in the same order, for every status (bug: the panel said "View" / "Publish", had no Delete, and listed them in another
 * order than the menu's "Authorization" / "Approve").
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const base = { department: "Quality Assurance", location: "bengaluru", openings: 1, priority: "high", employment_type: "full_time",
  hiring_manager_id: 7, created_at: "2026-11-23T10:00:00Z", budget_min: 1200000, budget_max: 1500000, currency: "INR" };
const ROWS = [
  { id: 1, title: "QA Tester", status: "open", candidate_count: 0, ...base },
  { id: 2, title: "Draft Role", status: "draft", candidate_count: 0, ...base },
  { id: 3, title: "Held Role", status: "on_hold", candidate_count: 2, ...base },
  { id: 4, title: "Closed Role", status: "closed", candidate_count: 3, ...base },
];

const mocked = new WeakSet();
function mockServices(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  const ok = async () => ({});
  t.mock.module("../src/service/hrService.js", { exports: {
    getRequisitions: async () => ({ items: structuredClone(ROWS), total: ROWS.length }),
    createRequisition: ok, updateRequisition: ok, deleteRequisition: ok, approveRequisition: ok, rejectRequisition: ok,
    submitRequisition: ok, holdRequisition: ok, resumeRequisition: ok, closeRequisition: ok,
    getCandidates: async () => ({ items: [] }), getDepartments: async () => ({ data: [] }), getRegions: async () => ({ currencies: [] }),
    getRecruitmentInsights: async () => ({}),
  } });
  t.mock.module("../src/service/recruitmentDocumentsService.js", { exports: { getRequisitionAuthorization: async () => ({}) } });
  t.mock.module("../src/service/employee.js", { exports: { getEmployees: async () => ({ items: [{ id: 7, first_name: "Aarav", last_name: "Sharma" }] }) } });
}

const labels = (container, selector) => [...container.querySelectorAll(selector)].map((b) => b.textContent.trim());

test("the row menu and the Quick Actions list the same actions for every status", async (t) => {
  mockServices(t);
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/job-requisitions.jsx?t=${Math.random()}`);
  render(h(MemoryRouter, null, h(Page)));
  await settle();
  for (const r of ROWS) {
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${r.title}` }));
    await settle(2);
    const menu = screen.getByRole("menu");
    const menuLabels = labels(menu, "[role=menuitem]").filter((l) => l !== "View details");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /View details/ }));
    await settle();
    const quick = screen.getByText("Quick Actions").closest("section, div").parentElement;
    const panelLabels = labels(quick, "button").filter((l) => menuLabels.includes(l) || /^(View|Publish)$/.test(l));
    assert.deepEqual(panelLabels, menuLabels, `${r.title} (${r.status}): menu ${menuLabels} vs panel ${panelLabels}`);
    assert.ok(menuLabels.includes("Authorization"));
    assert.ok(!panelLabels.includes("Publish") && !panelLabels.includes("View"));
  }
  // spot-check the permission rules both lists share
  fireEvent.click(screen.getByRole("button", { name: "Actions for Draft Role" }));
  await settle(2);
  assert.deepEqual(labels(screen.getByRole("menu"), "[role=menuitem]"),
    ["View details", "Authorization", "Edit", "Submit", "Approve", "Reject", "Delete"]);
  fireEvent.keyDown(document, { key: "Escape" });
  await settle(2);
  fireEvent.click(screen.getByRole("button", { name: "Actions for Closed Role" }));
  await settle(2);
  assert.deepEqual(labels(screen.getByRole("menu"), "[role=menuitem]"), ["View details", "Authorization"]);
});
