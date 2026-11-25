/** Bug 15: the organisation logo is uploaded on My Organization (it heads every email and the offer documents). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount(t, { hasLogo = false } = {}) {
  const calls = { upload: 0, remove: 0 };
  let logo = hasLogo;
  globalThis.URL.createObjectURL = () => "blob:logo";
  globalThis.URL.revokeObjectURL = () => {};
  t.mock.module("../src/service/hrService.js", { exports: {
    getOfferPackageLogo: async () => { if (!logo) throw Object.assign(new Error("No logo has been uploaded."), { status: 404 }); return { blob: new Blob(["png"]) }; },
    uploadOfferPackageLogo: async () => { calls.upload += 1; logo = true; return {}; },
    deleteOfferPackageLogo: async () => { calls.remove += 1; logo = false; return {}; },
  } });
  const { default: Card } = await import(`../src/components/OrganizationLogoCard.jsx?t=${Math.random()}`);
  render(React.createElement(Card, { organizationName: "Zoiko Industries" }));
  await settle();
  return calls;
}

test("with no logo yet the card says so, and the email preview shows the organisation name", async (t) => {
  await mount(t);
  assert.ok(screen.getByRole("heading", { name: "Organization logo" }));
  assert.ok(screen.getByText("No logo yet"));
  assert.match(screen.getByLabelText("Email preview").textContent, /Zoiko Industries/);
  assert.match(screen.getByLabelText("Email preview").textContent, /Powered by Zoiko HR/i);
});

test("uploading a logo saves it and shows it; a wrong file type is refused", async (t) => {
  const calls = await mount(t);
  fireEvent.change(screen.getByLabelText("Organization logo file"), { target: { files: [new File(["gif"], "x.gif", { type: "image/gif" })] } });
  await settle();
  assert.match(screen.getByRole("alert").textContent, /PNG, JPG or WebP/);
  assert.equal(calls.upload, 0);
  fireEvent.change(screen.getByLabelText("Organization logo file"), { target: { files: [new File(["png"], "logo.png", { type: "image/png" })] } });
  await settle();
  assert.equal(calls.upload, 1);
  assert.match(screen.getByRole("status").textContent, /Logo saved/);
  assert.ok(screen.getByAltText("Zoiko Industries logo"));
});

test("removing asks first, then removes", async (t) => {
  const calls = await mount(t, { hasLogo: true });
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await settle();
  assert.equal(calls.remove, 0, "nothing removed before confirming");
  fireEvent.click(screen.getByRole("group", { name: "Confirm removing the logo" }).querySelector("button"));
  await settle();
  assert.equal(calls.remove, 1);
  assert.ok(screen.getByText("No logo yet"));
});
