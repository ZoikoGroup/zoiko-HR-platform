/**
 * __tests__/RegistrationSuccessPage.test.mjs
 * --------------------------------------------
 * Testing step 5.5 from the "Remove Super Admin Approval Requirement from New
 * Organization Creation" prompt: a render test for RegistrationSuccessPage.jsx
 * confirming the updated copy ("Your workspace is ready" / "no approval
 * needed") and a working sign-in call-to-action — no "awaiting approval"
 * messaging left, and the primary button actually navigates to /login.
 *
 * Follows the same pattern as documentPagesSharedComponents.test.mjs: mocks
 * react-router-dom's hooks (the page reads useLocation().state and calls
 * useNavigate()) and stubs the logo SVG import so no asset loader is needed
 * under plain `node --test`.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const SUCCESS_STATE = {
  organizationName: "NewCo Inc.",
  email: "admin@newco.example",
  planCode: "core",
  evaluationEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
};

async function flushRender(t, locationState, navigate) {
  t.mock.module("react-router-dom", {
    exports: {
      useNavigate: () => navigate,
      useLocation: () => ({ state: locationState }),
    },
  });

  const mod = await import(
    `../src/pages/auth/RegistrationSuccessPage.jsx?t=${Date.now()}-${Math.random()}`
  );
  render(React.createElement(mod.default));
  for (let i = 0; i < 4; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
}

test("RegistrationSuccessPage: renders immediate-usability copy (no approval messaging)", async (t) => {
  const navCalls = [];
  const navigate = (to) => navCalls.push(to);
  await flushRender(t, SUCCESS_STATE, navigate);

  assert.ok(screen.getByText("Your workspace is ready"));
  assert.ok(screen.getByText(/Workspace activated — no approval needed/));
  assert.ok(screen.getByText(/is active and ready to use/));

  assert.equal(
    screen.queryByText(/awaiting.*approval/i),
    null,
    "no 'awaiting approval' copy may remain"
  );
  assert.equal(
    screen.queryByText(/once approved/i),
    null,
    "no 'once approved' copy may remain"
  );

  cleanup();
});

test("RegistrationSuccessPage: Sign In button navigates to /login", async (t) => {
  const navCalls = [];
  const navigate = (to) => navCalls.push(to);
  await flushRender(t, SUCCESS_STATE, navigate);

  const signInBtn = screen.getByRole("button", { name: /sign in/i });
  assert.ok(signInBtn, "primary action is a Sign In button, not a passive state");

  fireEvent.click(signInBtn);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

  assert.deepEqual(navCalls, ["/login"], "Sign In must navigate to /login");

  cleanup();
});

test("RegistrationSuccessPage: redirects to /register when arrived with no state", async (t) => {
  const navCalls = [];
  const navigate = (to) => navCalls.push(to);
  await flushRender(t, null, navigate);

  assert.deepEqual(navCalls, ["/register"], "missing org state must bounce to /register");
  cleanup();
});