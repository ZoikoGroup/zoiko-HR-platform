/** B14 (logo goes to the role's dashboard, "/" is role-aware) and B15 (account menu closes like a menu should). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

const HOMES = {
  admin: "/organization-admin/dashboard",
  hr_admin: "/hr-admin/dashboard",
  manager: "/zoiko-hr",
  employee: "/employee/ess",
  super_admin: "/super-admin/dashboard",
};

function mockAuth(t, auth) {
  t.mock.module("../src/context/AuthContext.jsx", {
    exports: { useAuth: () => ({ logout: async () => {}, user: { name: "Ann", email: "ann@acme.com" }, ...auth }) },
  });
}

function Where() {
  const { pathname } = useLocation();
  return React.createElement("output", { "data-testid": "where" }, pathname);
}

for (const [role, home] of Object.entries(HOMES)) {
  test(`B14 the header logo of a ${role} links to ${home}, not /login`, async (t) => {
    mockAuth(t, { role, defaultRedirect: home, getFirstAccessibleRoute: () => home });
    t.mock.module("../src/components/NotificationBell.jsx", { exports: { default: () => null } });
    const { default: Header } = await import(`../src/components/Header.jsx?r=${role}${Math.random()}`);
    render(React.createElement(MemoryRouter, { initialEntries: ["/some/page"] }, React.createElement(Header)));
    const link = screen.getByRole("link", { name: "Zoiko HR home" });
    assert.equal(link.getAttribute("href"), home);
    assert.ok(screen.getByAltText("Zoiko HR"));
  });

  test(`B14 "/" sends a signed-in ${role} to ${home}`, async (t) => {
    mockAuth(t, { role, isAuthenticated: true, loading: false, defaultRedirect: home, getFirstAccessibleRoute: () => home });
    const { default: HomeRedirect } = await import(`../src/components/HomeRedirect.jsx?r=${role}${Math.random()}`);
    render(React.createElement(MemoryRouter, { initialEntries: ["/"] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: "/", element: React.createElement(HomeRedirect) }),
        React.createElement(Route, { path: "*", element: React.createElement(Where) }))));
    assert.equal(screen.getByTestId("where").textContent, home);
  });
}

test('B14 "/" sends a visitor who is not signed in to /login', async (t) => {
  mockAuth(t, { role: null, isAuthenticated: false, loading: false, defaultRedirect: "/dashboard", getFirstAccessibleRoute: () => "/login" });
  const { default: HomeRedirect } = await import(`../src/components/HomeRedirect.jsx?anon${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/"] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: "/", element: React.createElement(HomeRedirect) }),
      React.createElement(Route, { path: "*", element: React.createElement(Where) }))));
  assert.equal(screen.getByTestId("where").textContent, "/login");
});

async function openMenu(t) {
  mockAuth(t, { role: "admin" });
  const { default: UserMenu } = await import(`../src/components/UserMenu.jsx?m=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/a"] },
    React.createElement("div", null,
      React.createElement("p", { "data-testid": "outside" }, "elsewhere"),
      React.createElement(Link, { to: "/b" }, "Go to B"),
      React.createElement(UserMenu))));
  const trigger = screen.getByRole("button", { name: /Account menu/ });
  fireEvent.click(trigger);
  await settle();
  assert.ok(screen.getByRole("menu"));
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  return trigger;
}

test("B15 the account menu closes on a click outside it", async (t) => {
  await openMenu(t);
  const ev = typeof window.PointerEvent === "function" ? "pointerDown" : "mouseDown";
  fireEvent[ev](screen.getByTestId("outside"));
  await settle();
  assert.equal(screen.queryByRole("menu"), null);
});

test("B15 a click inside the menu does not close it", async (t) => {
  await openMenu(t);
  const ev = typeof window.PointerEvent === "function" ? "pointerDown" : "mouseDown";
  fireEvent[ev](screen.getByRole("menu"));
  await settle();
  assert.ok(screen.getByRole("menu"));
});

test("B15 Escape closes the menu and returns focus to the trigger", async (t) => {
  const trigger = await openMenu(t);
  fireEvent.keyDown(document, { key: "Escape" });
  await settle();
  assert.equal(screen.queryByRole("menu"), null);
  assert.equal(document.activeElement, trigger);
});

test("B15 navigating away closes the menu", async (t) => {
  await openMenu(t);
  fireEvent.click(screen.getByRole("link", { name: "Go to B" }));
  await settle();
  assert.equal(screen.queryByRole("menu"), null);
});

test("B15 choosing a menu item closes the menu", async (t) => {
  await openMenu(t);
  fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
  await settle();
  assert.equal(screen.queryByRole("menu"), null);
});
