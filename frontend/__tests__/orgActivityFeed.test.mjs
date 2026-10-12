/**
 * Super Admin > Workflows > Activity (ZHR-36): readable events, filters,
 * detail panel, loading / empty / error states.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const api = { list: null, filters: null };
const calls = [];
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 100)); });

const EVENT = {
  id: 1, sentence: "Priya Shah (Org Admin) added employee Rahul Mehta (EMP-1042) to Acme Ltd", organization_id: 1,
  organization_name: "Acme Ltd", actor_name: "Priya Shah", actor_role_label: "Org Admin", actor_email: "priya@acme.com",
  target_label: "Rahul Mehta (EMP-1042)", status: "success", created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  changes: [{ field: "job_title", label: "Job title", before: null, after: "Engineer" }, { field: "bank_account", label: "Bank account", before: null, after: "••••9012" }],
};
const FAILED = { ...EVENT, id: 2, status: "failed", sentence: "Gina Lopez (Org Admin) tried to add employee Bob", organization_name: "Globex Inc", error_message: "Employee with this email already exists", changes: [] };

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/activityService.js", { exports: { activityService: {
    list: (p) => { calls.push(p); return api.list(p); }, filters: () => api.filters(), get: async () => ({}) } } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ user: { role: "super_admin" }, role: "super_admin", isAuthenticated: true }) } });
}

async function open(t, over = {}) {
  calls.length = 0;
  api.list = over.list || (async () => ({ total: 2, events: [EVENT, FAILED] }));
  api.filters = async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }, { id: 2, name: "Globex Inc" }], action_groups: [{ key: "Employee", label: "Employee" }] });
  register(t);
  const { default: Feed } = await import("../src/modules/shared-layers/OrgActivityFeed.jsx");
  render(React.createElement(Feed));
  await settle();
}

test("events read as sentences with organization, time and status", async (t) => {
  await open(t);
  assert.ok(screen.getByText(EVENT.sentence));
  const row = screen.getByText(EVENT.sentence).closest("button");
  assert.ok(within(row).getByText("Acme Ltd") && within(row).getByText("Success") && within(row).getByText(/5 min ago/));
  assert.ok(within(screen.getByText(FAILED.sentence).closest("button")).getByText("Failed"));
  cleanup();
});

test("clicking an event opens the detail panel with masked changes and errors", async (t) => {
  await open(t);
  fireEvent.click(screen.getByText(EVENT.sentence));
  const changes = within(screen.getByLabelText("Changes"));
  assert.ok(changes.getByText("Job title") && changes.getByText("Engineer") && changes.getByText("••••9012"));
  const closers = screen.getAllByRole("button", { name: "Close" });
  fireEvent.click(closers[closers.length - 1]);
  fireEvent.click(screen.getByText(FAILED.sentence));
  assert.ok(screen.getByText("Employee with this email already exists"));
  cleanup();
});

test("filters are sent to the server", async (t) => {
  await open(t);
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await settle();
  const last = calls[calls.length - 1];
  assert.equal(last.organization_id, "2");
  assert.equal(last.status, "failed");
  assert.equal(last.page, 1);
  cleanup();
});

test("empty state, with and without filters", async (t) => {
  await open(t, { list: async () => ({ total: 0, events: [] }) });
  assert.ok(screen.getByText(/No organization activity yet/));
  fireEvent.change(screen.getByLabelText("Actor"), { target: { value: "zed" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await settle();
  assert.ok(screen.getByText("No activity matches these filters."));
  cleanup();
});

test("a failed load shows the real error message and Retry works", async (t) => {
  let n = 0;
  await open(t, { list: async () => { if (n++ === 0) throw new Error("Super Admin privileges required"); return { total: 1, events: [EVENT] }; } });
  assert.ok(screen.getByText(/Super Admin privileges required/));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.ok(screen.getByText(EVENT.sentence));
  cleanup();
});
