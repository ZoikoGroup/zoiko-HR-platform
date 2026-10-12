/** Part B: the portal shell renders once; pages change inside it; errors and loading stay local; access rules unchanged. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React, { useEffect } from "react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";

afterEach(() => cleanup());
const settle = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;

// The modules the layout imports are cached after first use, so the mocks are installed once and read this shared state,
// which every test resets.
const state = { auth: {}, mounts: { sidebar: 0, header: 0, bell: 0 } };
const authFor = (over = {}) => {
  const a = {
    isAuthenticated: true, loading: false, role: "super_admin", user: { id: 1 }, products: [], defaultRedirect: "/home",
    hasRole: (roles) => roles.includes(a.role), canAccessProduct: () => true, getFirstAccessibleRoute: () => "/home", ...over,
  };
  return a;
};
const Bell = () => { useEffect(() => { state.mounts.bell += 1; }, []); return h("span", null, "bell"); };
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => state.auth } });
mock.module("../src/components/Sidebar.jsx", { exports: { default: () => {
  useEffect(() => { state.mounts.sidebar += 1; }, []);
  return h("aside", null, h(Link, { to: "/a" }, "go-a"), h(Link, { to: "/b" }, "go-b"), h(Link, { to: "/c" }, "go-c"));
} } });
mock.module("../src/components/Header.jsx", { exports: { default: () => {
  useEffect(() => { state.mounts.header += 1; }, []);
  return h("header", null, "header", h(Bell));
} } });
const { default: AppLayout, RouteBoundary } = await import("../src/components/AppLayout.jsx");
const { default: ProtectedRoute } = await import("../src/components/ProtectedRoute.jsx");

async function setup(_t, { auth = {}, pages, start = "/a" }) {
  state.auth = authFor(auth);
  state.mounts = { sidebar: 0, header: 0, bell: 0 };
  const route = (path, el, roles) => h(Route, { key: path, path, element: h(RouteBoundary, null, h(ProtectedRoute, { allowedRoles: roles }, el)) });
  render(h(MemoryRouter, { initialEntries: [start] }, h(Routes, null,
    h(Route, { path: "/login", element: h("div", null, "LOGIN PAGE") }),
    h(Route, { path: "/home", element: h("div", null, "HOME PAGE") }),
    h(Route, { element: h(AppLayout) }, ...pages(route)))));
  await settle(120);
  return state.mounts;
}

test("moving between pages never remounts the sidebar, header or notification bell", async (t) => {
  const mounts = await setup(t, { pages: (r) => [r("/a", h("div", null, "PAGE A"), ["super_admin"]), r("/b", h("div", null, "PAGE B"), ["super_admin"])] });
  assert.match(document.body.textContent, /PAGE A/);
  assert.deepEqual(mounts, { sidebar: 1, header: 1, bell: 1 });
  fireEvent.click(screen.getByText("go-b"));
  await settle();
  assert.match(document.body.textContent, /PAGE B/);
  fireEvent.click(screen.getByText("go-a"));
  await settle();
  assert.match(document.body.textContent, /PAGE A/);
  assert.deepEqual(mounts, { sidebar: 1, header: 1, bell: 1 }, "each shell part mounted exactly once across three page views");
});

test("a page that throws shows the error in the content area while the sidebar stays usable, and navigating away recovers", async (t) => {
  const Boom = () => { throw new Error("kaboom"); };
  const consoleError = console.error; console.error = () => {};            // React logs caught render errors
  t.after(() => { console.error = consoleError; });
  const mounts = await setup(t, { pages: (r) => [r("/a", h(Boom), ["super_admin"]), r("/b", h("div", null, "PAGE B"), ["super_admin"])] });
  assert.ok(screen.getByRole("alert"));
  assert.match(document.body.textContent, /ran into a problem/);
  assert.ok(screen.getByText("go-b"), "the sidebar is still there");
  fireEvent.click(screen.getByText("go-b"));
  await settle();
  assert.match(document.body.textContent, /PAGE B/);
  assert.equal(screen.queryByRole("alert"), null, "the error did not follow the user to the next page");
  assert.equal(mounts.sidebar, 1);
});

test("the same page can be retried after an error", async (t) => {
  let broken = true;
  const Flaky = () => { if (broken) throw new Error("once"); return h("div", null, "RECOVERED"); };
  const consoleError = console.error; console.error = () => {};
  t.after(() => { console.error = consoleError; });
  await setup(t, { pages: (r) => [r("/a", h(Flaky), ["super_admin"])] });
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  await settle();
  assert.match(document.body.textContent, /RECOVERED/);
});

test("role-protected pages still redirect: wrong role goes to the default page, signed-out goes to login", async (t) => {
  await setup(t, { auth: { role: "employee" }, pages: (r) => [r("/a", h("div", null, "ADMIN ONLY"), ["super_admin"])] });
  assert.match(document.body.textContent, /HOME PAGE/);
  assert.doesNotMatch(document.body.textContent, /ADMIN ONLY/);
  cleanup();
  await setup(t, { auth: { isAuthenticated: false }, pages: (r) => [r("/a", h("div", null, "ADMIN ONLY"), ["super_admin"])] });
  assert.match(document.body.textContent, /LOGIN PAGE/);
  assert.equal(document.querySelector("aside"), null, "no shell is shown to a signed-out visitor");
});

test("a forced password change still wins over the shell", async (t) => {
  await setup(t, { auth: { user: { id: 1, mustChangePassword: true } }, pages: (r) => [r("/a", h("div", null, "PAGE A"), ["super_admin"])] });
  assert.doesNotMatch(document.body.textContent, /PAGE A/);
  assert.equal(document.querySelector("aside"), null);
});

test("while a page's code loads only the content area changes: the shell stays and a skeleton shows", async (t) => {
  const Slow = React.lazy(() => new Promise((resolve) => setTimeout(() => resolve({ default: () => h("div", null, "LOADED PAGE") }), 1500)));
  await setup(t, { pages: (r) => [r("/a", h(Slow), ["super_admin"])] });
  await settle(300);                                                          // past the fallback's short delay, well before the page loads
  assert.ok(document.querySelector("aside") && document.querySelector("header"), "shell visible while loading");
  assert.ok(document.querySelector("[aria-busy='true']"), "a content skeleton is showing");
  await settle(1600);
  assert.match(document.body.textContent, /LOADED PAGE/);
});
