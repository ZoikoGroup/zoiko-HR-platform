/** Organization detail on the query cache: a revisit is instant, a failing side section does not break the page. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const state = { org: 0, audit: 0, sub: 0, fail: false, orgFail: false };
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getOrganization: async () => { state.org += 1; if (state.orgFail) throw new Error("org is down"); return { id: 4, name: "Acme Ltd", status: "active", users_count: 3 }; },
  getOrganizationAuditLogs: async () => { state.audit += 1; if (state.fail) throw new Error("audit down"); return { logs: [] }; },
} } });
mock.module("../src/service/billingService.js", { exports: { billingService: {
  getSubscription: async () => { state.sub += 1; return null; },
  getEvaluations: async () => ({ list: [] }), getConversions: async () => ({ list: [] }),
  getDelinquency: async () => null, listSupportAccess: async () => ({ list: [] }),
} } });
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ user: { role: "super_admin" } }) } });
mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, useParams: () => ({ orgId: "4" }), Link: ({ to, children }) => h("a", { href: to }, children) } });
const { default: Page } = await import("../src/modules/super-admin/OrganizationDetailPage.jsx");

test("a revisit within the freshness window makes no new requests", async () => {
  Object.assign(state, { org: 0, audit: 0, sub: 0, fail: false, orgFail: false });
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle();
  assert.match(document.body.textContent, /Acme Ltd/);
  assert.deepEqual([state.org, state.audit, state.sub], [1, 1, 1]);
  first.unmount();
  render(withQuery(h(Page), client));
  await settle();
  assert.match(document.body.textContent, /Acme Ltd/);
  assert.deepEqual([state.org, state.audit, state.sub], [1, 1, 1]);
});

test("a failing audit section does not break the page", async () => {
  Object.assign(state, { fail: true, orgFail: false });
  render(withQuery(h(Page), testQueryClient()));
  await settle();
  assert.match(document.body.textContent, /Acme Ltd/);
});

test("a failing organization shows the error with Retry, and Retry refetches", async () => {
  Object.assign(state, { org: 0, fail: false, orgFail: true });
  render(withQuery(h(Page), testQueryClient()));
  await settle();
  assert.match(document.body.textContent, /org is down/);
  state.orgFail = false;
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  await settle();
  assert.equal(state.org, 2);
  assert.match(document.body.textContent, /Acme Ltd/);
});
