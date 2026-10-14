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

// What the platform gets (ZHR-PRIV-001 E01): a role + pseudonymous reference, never a name, target, diff or free-text reason.
const EVENT = {
  id: 1, sentence: "Org Admin #a3f9 added 1 employee record in Acme Ltd", organization_id: 1,
  organization_name: "Acme Ltd", actor_ref: "Org Admin #a3f9", actor_role_label: "Org Admin", action_group: "Employee", entity_type: "Employee",
  status: "success", created_at: new Date(Date.now() - 5 * 60000).toISOString(), counts: null, failure_code: null,
};
const FAILED = { ...EVENT, id: 2, status: "failed", sentence: "Org Admin #b7c1 imported 50 employee records into Globex Inc (48 succeeded, 2 failed) - failed", organization_name: "Globex Inc", failure_code: "DUPLICATE", counts: { total: 50, succeeded: 48, failed: 2 } };

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

test("clicking an event shows who KIND of person, what kind of action and a generic failure code, and no record detail", async (t) => {
  await open(t);
  fireEvent.click(screen.getByText(EVENT.sentence));
  const text = document.body.textContent;
  assert.match(text, /Org Admin #a3f9/);
  assert.match(text, /not available to the platform/);
  assert.equal(screen.queryByLabelText("Changes"), null, "no before/after table");
  assert.doesNotMatch(text, /IP address|Target|@/);
  const closers = screen.getAllByRole("button", { name: "Close" });
  fireEvent.click(closers[closers.length - 1]);
  fireEvent.click(screen.getByText(FAILED.sentence));
  assert.ok(screen.getByText("Failed: DUPLICATE"));
  cleanup();
});

test("there is no way to search or filter by a person", async (t) => {
  await open(t);
  assert.equal(screen.queryByLabelText("Actor"), null);
  assert.ok(screen.getByLabelText("Search").placeholder.match(/organization/i));
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
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
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
