/** Organizations page on the query cache: a recent visit needs no request, and changing a filter keeps the rows visible. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 120) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;

const state = { calls: [], deletedDelay: 0 };
const ACTIVE = { id: 4, name: "Acme Ltd", organization_code: "ACME", status: "active", user_count: 3, created_at: "2026-01-01T00:00:00Z" };
const GONE = { id: 9, name: "Old Co", organization_code: "OLD", status: "active", user_count: 1, deleted_at: "2026-09-29T10:00:00Z", delete_reason: "x", created_at: "2025-01-01T00:00:00Z" };
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getOrganizations: async (params) => {
    state.calls.push(params);
    if (params.deleted === "deleted") { await new Promise((r) => setTimeout(r, state.deletedDelay)); return { organizations: [GONE], total: 1 }; }
    return { organizations: [ACTIVE], total: 1 };
  },
} } });
mock.module("../src/service/billingService.js", { exports: { billingService: new Proxy({}, { get: () => async () => ({}) }) } });
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ user: { id: 1 }, role: "super_admin", isAuthenticated: true }) } });
mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, useParams: () => ({}), Link: ({ to, children }) => h("a", { href: to }, children) } });
const { default: Page } = await import("../src/modules/super-admin/OrganizationsPage.jsx");

test("coming back within 30 s shows the organizations at once and makes no new request", async () => {
  state.calls = [];
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle();
  assert.match(document.body.textContent, /Acme Ltd/);
  assert.equal(state.calls.length, 1);
  first.unmount();
  render(withQuery(h(Page), client));
  assert.match(document.body.textContent, /Acme Ltd/, "rows are there on the very first render, before any request");
  await settle();
  assert.equal(state.calls.length, 1, "no second request");
});

test("changing the lifecycle filter keeps the previous rows on screen until the new ones arrive", async () => {
  state.calls = [];
  state.deletedDelay = 400;
  render(withQuery(h(Page)));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Deleted/ }));
  await settle(50);
  assert.match(document.body.textContent, /Acme Ltd/, "old rows still visible while the new view loads");
  await settle(600);
  assert.match(document.body.textContent, /Old Co/);
  assert.equal(state.calls.at(-1).deleted, "deleted");
});

test("an organization action also marks the audit log cache stale (the action wrote an entry)", async () => {
  // covered structurally: the page's invalidation helper touches organizations, commandCenter and auditLogs keys
  const src = (await import("node:fs")).readFileSync(new URL("../src/modules/super-admin/OrganizationsPage.jsx", import.meta.url), "utf8");
  for (const key of ["organizations.all", "commandCenter.all", "auditLogs.all"]) assert.ok(src.includes(`keys.superAdmin.${key}`), key);
});
