/**
 * ZHR-27: the app used to block every page on GET /auth/me, so "Add Document"
 * had no button to click while the screen said "Checking your session…".
 * With a cached user the shell must render immediately and the session check
 * must happen in the background.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

test("a cached user renders the app while /auth/me is still in flight", async (t) => {
  let release;
  const pendingMe = new Promise((r) => { release = r; });
  const state = { meCalls: 0 };
  localStorage.setItem("zoiko_user", JSON.stringify({ id: 1, email: "a@b.test", role: "super_admin" }));

  t.mock.module("../src/service/authService.js", {
    exports: {
      login: async () => ({}),
      register: async () => ({}),
      logout: async () => ({}),
      isAuthenticated: () => Boolean(localStorage.getItem("zoiko_access_token")),
      getCachedUser: () => JSON.parse(localStorage.getItem("zoiko_user") || "null"),
      fetchCurrentUser: async () => {
        state.meCalls += 1;
        await pendingMe;
        return { id: 1, email: "a@b.test", role: "super_admin" };
      },
    },
  });

  localStorage.setItem("zoiko_access_token", "token");
  const { AuthProvider } = await import("../src/context/AuthContext.jsx");
  render(React.createElement(AuthProvider, null, React.createElement("p", null, "Documents page")));

  // Synchronously rendered: no "Checking your session…" gate while /auth/me runs.
  assert.ok(screen.getByText("Documents page"));
  assert.equal(screen.queryByText(/Checking your session/i), null);

  await act(async () => { release(); await pendingMe; });
  assert.equal(state.meCalls, 1);
  cleanup();
});

test("no cached user and no token shows no app shell", async (t) => {
  t.mock.module("../src/service/authService.js", {
    exports: {
      login: async () => ({}),
      register: async () => ({}),
      logout: async () => ({}),
      isAuthenticated: () => Boolean(localStorage.getItem("zoiko_access_token")),
      getCachedUser: () => JSON.parse(localStorage.getItem("zoiko_user") || "null"),
      fetchCurrentUser: async () => { throw new Error("should not be called"); },
    },
  });

  localStorage.removeItem("zoiko_access_token");
  localStorage.setItem("zoiko_user", JSON.stringify({ id: 1, role: "super_admin" }));
  const { AuthProvider } = await import("../src/context/AuthContext.jsx");
  const { useAuth } = await import("../src/context/AuthContext.jsx");

  function Probe() {
    const { isAuthenticated } = useAuth();
    return React.createElement("p", null, isAuthenticated ? "authenticated" : "anonymous");
  }
  render(React.createElement(AuthProvider, null, React.createElement(Probe)));

  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.ok(screen.getByText("anonymous"));
  cleanup();
});