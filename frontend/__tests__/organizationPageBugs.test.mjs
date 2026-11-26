/** QA bugs 29 and 30 on Organization: "View audit log" opens the organisation's audit log, and the Edit Organization
 * fields keep focus while typing (Backspace works) because each field is no longer remounted on every keystroke. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const ORG = { name: "zoiko", industry: "Engineering", address: "Guntur\nGurazala", city: "Gurazala", state: "Andhra Pradesh",
  country: "India", timezone: "Asia/Kolkata", currency: "INR", total_employees: 3, active_employees: 3, hr_admins: 1,
  subscription_plan: "Pro", subscription_status: "active", max_users: 50 };

async function loadPage(t, svc = {}) {
  t.mock.module("../src/service/orgAdminService.js", { exports: {
    getOrganizationDetails: async () => ({ ...ORG }), updateOrganizationDetails: async (b) => ({ ...ORG, ...b }),
    getOrganizationAuditLog: async () => ({ total: 0, events: [], areas: [] }), ...svc,
  } });
  t.mock.module("../src/components/OrganizationLogoCard.jsx", { exports: { default: () => null } });
  return import(`../src/modules/organization-admin/OrganizationPage.jsx?t=${Math.random()}`);
}

test("typing and Backspace in the Edit Organization fields keep the same input and its focus (bug 30)", async (t) => {
  const { default: Page } = await loadPage(t);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Edit organization" }));
  const name = screen.getByLabelText("Organization Name");
  name.focus();
  fireEvent.change(name, { target: { value: "zoikox" } });
  assert.equal(screen.getByLabelText("Organization Name"), name, "the input is not remounted after a keystroke");
  assert.equal(document.activeElement, name, "focus stays in the field");
  fireEvent.change(name, { target: { value: "zoi" } });          // Backspace three times
  assert.equal(screen.getByLabelText("Organization Name").value, "zoi");
  const address = screen.getByLabelText("Address");
  fireEvent.change(address, { target: { value: "Guntur" } });
  assert.equal(screen.getByLabelText("Address"), address);
  assert.equal(address.value, "Guntur");
});

test("View audit log opens the organisation's audit log (bug 29)", async (t) => {
  const { default: Page } = await loadPage(t);
  render(React.createElement(MemoryRouter, { initialEntries: ["/organization-admin/organization"] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: "/organization-admin/organization", element: React.createElement(Page) }),
      React.createElement(Route, { path: "/organization-admin/audit-log", element: React.createElement("p", null, "AUDIT LOG PAGE") }))));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "View audit log" }));
  await settle();
  assert.ok(screen.getByText("AUDIT LOG PAGE"));
});

test("the audit log page lists events and filters them", async (t) => {
  const calls = [];
  t.mock.module("../src/service/orgAdminService.js", { exports: {
    getOrganizationAuditLog: async (p) => { calls.push(p); return { total: 1, areas: ["Employee", "Leave"], events: [
      { id: 1, sentence: "Admin User added Emp User.", action_group: "Employee", status: "success", created_at: "2026-11-26T09:00:00Z",
        changes: [{ field: "job_title", label: "Job title", before: "Analyst", after: "Senior Analyst" }] }] }; },
  } });
  t.mock.module("../src/components/PageHeader.jsx", { exports: { default: ({ title }) => React.createElement("h1", null, title) } });
  const { default: AuditLog } = await import(`../src/modules/organization-admin/AuditLogPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(AuditLog)));
  await settle();
  assert.ok(screen.getByText("Admin User added Emp User."));
  assert.ok(screen.getByText("Job title: Analyst → Senior Analyst"));
  fireEvent.change(screen.getByLabelText("Area"), { target: { value: "Leave" } });
  await settle();
  assert.equal(calls.at(-1).action_group, "Leave");
});


test("the Seats over limit tile says which limit and what it means (bug 32)", async (t) => {
  const { seatsOverText } = await loadPage(t);
  assert.equal(seatsOverText({ seatsOver: 0, seatsUsed: 3, maxUsers: 50, isUnlimited: false, plan: "EVALUATION" }),
    "All 3 users fit in your 50-seat plan · 47 seats free");
  assert.equal(seatsOverText({ seatsOver: 4, seatsUsed: 54, maxUsers: 50, isUnlimited: false, plan: "Pro" }),
    "4 users more than your 50-seat plan allows: upgrade the plan or deactivate users");
  assert.equal(seatsOverText({ seatsOver: 0, seatsUsed: 9, maxUsers: null, isUnlimited: true, plan: "Enterprise" }),
    "Your Enterprise plan has no seat limit");
  assert.equal(seatsOverText({ seatsOver: 0, seatsUsed: 1, maxUsers: 2, isUnlimited: false, plan: "Starter" }),
    "All 1 user fit in your 2-seat plan · 1 seat free");
});

test("the page shows the new wording, never 'Within limit'", async (t) => {
  const { default: Page } = await loadPage(t);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  assert.equal(screen.queryByText("Within limit"), null);
  assert.ok(screen.getByText(/fit in your 50-seat plan/));
});


test("the workforce footer starts with the seats in use, so '0 inactive' is not read as 'none in use' (QA bug 36)", async (t) => {
  const { default: Page } = await loadPage(t);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  const text = document.body.textContent;
  assert.match(text, /3 seats in use/);
  assert.match(text, /0 inactive/);
  assert.match(text, /47 seats free on Pro plan/);
  assert.equal(text.includes("seats inactive"), false);
});
