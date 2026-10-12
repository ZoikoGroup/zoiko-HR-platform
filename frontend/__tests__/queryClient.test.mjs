/** The shared query client: freshness defaults, retry policy, and no data left behind when the session changes. */
import "./support/setup-jsdom.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { queryClient, shouldRetryQuery, createQueryClient } from "../src/lib/queryClient.js";
import { setSession, clearSession, AUTH_INVALID_EVENT } from "../src/service/api.js";
import { keys } from "../src/service/queryKeys.js";

beforeEach(() => { localStorage.clear(); queryClient.clear(); });

test("defaults: 30 s fresh, 5 min kept, refetch on focus and reconnect, mutations never retry", () => {
  const d = createQueryClient().getDefaultOptions();
  assert.equal(d.queries.staleTime, 30_000);
  assert.equal(d.queries.gcTime, 300_000);
  assert.equal(d.queries.refetchOnWindowFocus, true);
  assert.equal(d.queries.refetchOnReconnect, true);
  assert.equal(d.mutations.retry, false);
});

test("a query is retried once, except after a client error", () => {
  assert.equal(shouldRetryQuery(0, new Error("network")), true);
  assert.equal(shouldRetryQuery(0, Object.assign(new Error("x"), { status: 503 })), true);
  assert.equal(shouldRetryQuery(1, Object.assign(new Error("x"), { status: 503 })), false, "only once");
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(shouldRetryQuery(0, Object.assign(new Error("x"), { status })), false, `${status} is not retried`);
  }
});

test("signing out empties the cache", () => {
  queryClient.setQueryData(keys.superAdmin.organizations.list({ page: 1 }), { organizations: [{ id: 1 }] });
  assert.ok(queryClient.getQueryData(keys.superAdmin.organizations.list({ page: 1 })));
  clearSession();
  assert.equal(queryClient.getQueryData(keys.superAdmin.organizations.list({ page: 1 })), undefined);
});

test("a different person signing in starts with an empty cache; a token refresh for the same person keeps it", () => {
  setSession({ accessToken: "a1", refreshToken: "r1", user: { id: 7 } });
  queryClient.setQueryData(keys.hr.dashboard(), { total: 5 });
  setSession({ accessToken: "a2", refreshToken: "r2", user: { id: 7 } });          // silent refresh, same person
  assert.deepEqual(queryClient.getQueryData(keys.hr.dashboard()), { total: 5 });
  setSession({ accessToken: "b1", refreshToken: "s1", user: { id: 8 } });          // someone else signs in
  assert.equal(queryClient.getQueryData(keys.hr.dashboard()), undefined);
});

test("an invalid-session event path leaves no cached data (clearSession is what the app calls on it)", () => {
  setSession({ accessToken: "a", refreshToken: "r", user: { id: 1 } });
  queryClient.setQueryData(keys.notifications.unreadCount(), { unread_count: 3 });
  clearSession();
  assert.equal(queryClient.getQueryData(keys.notifications.unreadCount()), undefined);
  assert.equal(typeof AUTH_INVALID_EVENT, "string");
});

test("keys follow [module, resource, params] and share prefixes for invalidation", () => {
  assert.deepEqual(keys.superAdmin.organizations.list({ page: 2, status: "active" }), ["superAdmin", "organizations", { page: 2, status: "active" }]);
  const all = keys.superAdmin.organizations.all;
  assert.deepEqual(keys.superAdmin.organizations.detail(5).slice(0, all.length), all);
  assert.deepEqual(keys.superAdmin.commandCenter.overview(30).slice(0, 2), keys.superAdmin.commandCenter.all);
});
