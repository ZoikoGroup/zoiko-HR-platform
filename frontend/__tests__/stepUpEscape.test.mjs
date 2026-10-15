/** ZHR-PRIV-001 B06/B07: the step-up dialog is skipped when the server says the surface needs no fresh factor. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const coded = (code, message = "x") => Object.assign(new Error(message), { code });

async function mount(t, required) {
  const calls = { stepUp: 0, start: 0, confirm: 0 };
  t.mock.module("../src/service/authService.js", { exports: {
    mfaStepUp: async () => { calls.stepUp++; return {}; },
    mfaEnrollStart: async () => { calls.start++; return {}; },
    mfaEnrollConfirm: async () => { calls.confirm++; return {}; },
  } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ email: "platform.person@zoiko-ops.example" }) } });

  const { useStepUp } = await import(`../src/components/StepUpDialog.jsx?t=${Math.random()}`);
  let run;
  function ProbeComp() {
    const stepUp = useStepUp({ required });
    run = stepUp.run;
    return React.createElement("div", null, stepUp.dialog);
  }
  render(React.createElement(ProbeComp));
  await settle();
  return { calls, getRun: () => run };
}

test("required=false runs the action and never opens the dialog", async (t) => {
  const { calls, getRun } = await mount(t, false);
  const fn = async () => { throw coded("MFA_STEP_UP_REQUIRED", "Confirm it is you"); };
  await act(async () => { await assert.rejects(() => getRun()(fn), /Confirm it is you/); });
  assert.equal(document.body.textContent.includes("Confirm it is you"), false, "no dialog is rendered");
  assert.equal(calls.stepUp, 0, "no step-up call is made");
  assert.equal(calls.start, 0, "no enrollment is started");
});

test("required=false passes a successful result straight through", async (t) => {
  const { getRun } = await mount(t, false);
  let out;
  await act(async () => { out = await getRun()(async () => ({ ok: 42 })); });
  assert.deepEqual(out, { ok: 42 });
});

test("required=true still prompts for a code when the server asks", async (t) => {
  const { getRun } = await mount(t, true);
  const fn = async () => { throw coded("MFA_STEP_UP_REQUIRED", "Confirm it is you"); };
  let settled = false;
  act(() => { getRun()(fn).then(() => { settled = true; }, () => { settled = true; }); });
  await settle();
  assert.match(document.body.textContent, /Confirm it is you/, "the dialog appears");
  assert.equal(settled, false, "the action waits on the dialog");
});
