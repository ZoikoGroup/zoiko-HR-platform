/**
 * ZHR-27: GET /auth/me is a slow round trip to the database and the shell plus
 * the route guards mount more than once, so concurrent callers must share one
 * request instead of firing several.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("concurrent fetchCurrentUser() calls share a single GET /auth/me", async (t) => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  t.mock.module("../src/service/api.js", {
    exports: {
      api: {
        get: async (p) => {
          if (p === "/auth/me") { calls += 1; await gate; }
          return { id: 1, role: "super_admin" };
        },
        post: async () => ({}),
      },
      getAccessToken: () => "token",
      getRefreshToken: () => "refresh",
      getStoredUser: () => null,
      clearSession: () => {},
      setSession: () => {},
      API_BASE_URL: "http://x",
      AUTH_INVALID_EVENT: "zoiko-auth-session-invalid",
    },
  });

  const { fetchCurrentUser } = await import("../src/service/authService.js");
  const inFlight = Promise.all([fetchCurrentUser(), fetchCurrentUser(), fetchCurrentUser()]);
  release();
  const results = await inFlight;

  assert.equal(calls, 1);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { id: 1, role: "super_admin" });
});