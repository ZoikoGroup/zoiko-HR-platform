/** QA-R1-4: the floating assistant reserves room at the bottom of the page and can be minimised to an edge tab,
 * remembered per person. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { DOCK_ATTR, applyDock, dockState, minimisedKey, readMinimised, writeMinimised } from "../src/modules/shared-layers/assistant/assistantDock.js";

const h = React.createElement;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* */ } });

test("dock state: nothing, the edge tab, or the launcher", () => {
  assert.equal(dockState({}), "launcher");
  assert.equal(dockState({ minimised: true }), "tab");
  assert.equal(dockState({ minimised: true, open: true }), "launcher");
  assert.equal(dockState({ hidden: true }), "none");
  assert.equal(dockState({ hidden: true, minimised: true }), "none");
  const root = document.createElement("div");
  applyDock("launcher", root);
  assert.equal(root.getAttribute(DOCK_ATTR), "launcher");
  applyDock("none", root);
  assert.equal(root.hasAttribute(DOCK_ATTR), false);
});

test("the minimised choice is per person and survives blocked storage", () => {
  const a = minimisedKey({ id: 1, organization_id: 9 }), b = minimisedKey({ id: 2, organization_id: 9 });
  assert.notEqual(a, b);
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  writeMinimised(a, true, store);
  assert.equal(readMinimised(a, store), true);
  assert.equal(readMinimised(b, store), false);
  writeMinimised(a, false, store);
  assert.equal(readMinimised(a, store), false);
  const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.equal(readMinimised(a, blocked), false);
  assert.doesNotThrow(() => writeMinimised(a, true, blocked));
});

test("the layout reserves the launcher's corner at every width", () => {
  const css = readFileSync(new URL("../src/modules/shared-layers/assistant/assistant-tokens.css", import.meta.url), "utf8");
  const rule = css.match(/html\[data-assistant-dock="launcher"\] \.portal-main \{([^}]*)\}/);
  assert.ok(rule, "padding rule on the portal's main");
  // launcher: bottom-6 (1.5rem) + h-14 (3.5rem) = 5rem; the reserve must clear it, and it is not inside a media query
  const rem = Number(rule[1].match(/padding-bottom:\s*([\d.]+)rem/)[1]);
  assert.ok(rem > 5, `reserve ${rem}rem clears the 5rem launcher`);
  const before = css.slice(0, rule.index);
  assert.equal((before.match(/\{/g) || []).length, (before.match(/\}/g) || []).length, "top level, not inside an @media block");
  const shell = readFileSync(new URL("../src/components/SuperAdminShell.jsx", import.meta.url), "utf8");
  assert.match(shell, /<main className="portal-main /, "the shell's main is the element that gets the room");
});

const auth = { isAuthenticated: true, user: { id: 5, organization_id: 3, role: "hr_admin" } };
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
mock.module("../src/components/PlanGate.jsx", { exports: { loadStates: async () => ({}), default: ({ children }) => children } });
mock.module("../src/modules/shared-layers/assistant/useAssistantConversation.js", { exports: { useAssistantConversation: () => ({ send: () => {} }) } });
mock.module("../src/modules/shared-layers/assistant/ConversationView.jsx", { exports: { default: () => h("div", null, "conversation") } });
const { default: AssistantLauncher } = await import("../src/modules/shared-layers/assistant/AssistantLauncher.jsx");
const mount = () => render(h(MemoryRouter, { initialEntries: ["/zoiko-hr/dashboard"] }, h(AssistantLauncher)));

test("minimise to the edge tab, restore, and the choice is remembered", async () => {
  const html = document.documentElement;
  mount();
  await settle();
  assert.equal(html.getAttribute(DOCK_ATTR), "launcher");
  assert.ok(screen.getByRole("button", { name: "Open Zoiko HR Assistant" }));

  fireEvent.click(screen.getByRole("button", { name: "Minimise Zoiko HR Assistant" }));
  await settle();
  assert.equal(html.getAttribute(DOCK_ATTR), "tab");
  assert.equal(screen.queryByRole("button", { name: "Open Zoiko HR Assistant" }), null);
  assert.ok(screen.getByRole("button", { name: "Show Zoiko HR Assistant" }));

  cleanup();                                            // a new page load: still minimised
  assert.equal(html.hasAttribute(DOCK_ATTR), false, "unmounting gives the space back");
  mount();
  await settle();
  assert.equal(html.getAttribute(DOCK_ATTR), "tab");
  fireEvent.click(screen.getByRole("button", { name: "Show Zoiko HR Assistant" }));
  await settle();
  assert.equal(html.getAttribute(DOCK_ATTR), "launcher");
  assert.ok(screen.getByRole("button", { name: "Open Zoiko HR Assistant" }));
  assert.equal(readMinimised(minimisedKey(auth.user)), false);
});
