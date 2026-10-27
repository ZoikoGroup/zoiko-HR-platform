import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("cached user recovery requires a token and never overrides an invalid session", async (t) => {
  let accessToken = null;
  let requestError = new Error("Network unavailable");
  let clearedSessions = 0;
  const cachedUser = { id: 1, role: "super_admin" };

  t.mock.module("../src/service/api.js", {
    exports: {
      api: { get: async () => { throw requestError; } },
      getAccessToken: () => accessToken,
      getStoredUser: () => cachedUser,
      clearSession: () => { clearedSessions += 1; },
      setSession: () => {},
    },
  });

  const { fetchCurrentUser } = await import(`../src/service/authService.js?cache-test=${Math.random()}`);

  await assert.rejects(fetchCurrentUser(), /Network unavailable/);

  accessToken = "valid-token";
  assert.deepEqual(await fetchCurrentUser(), cachedUser);

  requestError = Object.assign(new Error("Session expired"), { authInvalid: true });
  await assert.rejects(fetchCurrentUser(), (error) => error === requestError);
  assert.equal(clearedSessions, 1);
});
