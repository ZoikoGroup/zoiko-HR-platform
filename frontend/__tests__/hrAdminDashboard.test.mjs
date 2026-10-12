/** The HR admin dashboard renders when the organization has employees (it used to crash: TEAL/AMBER were never defined). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("recent employees with every status colour show instead of crashing the page", async (t) => {
  const recent = [
    { name: "Lee Park", dept: "Eng", designation: "Engineer", initials: "LP", status: "Active", statusColor: "teal" },
    { name: "Ana Roy", dept: "Ops", designation: "Analyst", initials: "AR", status: "On leave", statusColor: "amber" },
    { name: "Sam Wu", dept: "HR", designation: "Lead", initials: "SW", status: "Inactive", statusColor: "off" },
  ];
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ user: { name: "Hana HR" } }) } });
  t.mock.module("../src/service/orgAdminService", { exports: {
    getOrganizationDashboardStats: async () => ({ total_employees: 3, active_employees: 2, departments: 3, recent_employees: recent, recent_activity: [] }),
    getOrganizationDetails: async () => ({ name: "Acme" }),
  } });
  t.mock.module("../src/service/hrService", { exports: {
    getLearningDashboard: async () => null, getPerformanceDashboard: async () => null, getRecruitmentDashboard: async () => null,
  } });
  const { default: Page } = await import(`../src/modules/hr-admin/DashboardPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  for (const name of ["Lee Park", "Ana Roy", "Sam Wu"]) assert.match(document.body.textContent, new RegExp(name));
});
