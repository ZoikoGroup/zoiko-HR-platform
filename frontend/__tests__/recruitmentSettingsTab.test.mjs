/** Bug 9: the recruitment privacy settings left the Candidates page for Recruitment → Settings (HR and admins only). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

test("the Settings tab is offered to HR and admins, never to managers or employees", async () => {
  const { recruitmentNavFor } = await import(`../src/modules/zoiko-hr/recruitment/ui.jsx?t=${Math.random()}`);
  const labels = (role) => recruitmentNavFor({ role }).map((i) => i.label);
  for (const role of ["hr_admin", "admin", "super_admin", "HR_ADMIN"]) assert.equal(labels(role).at(-1), "Settings", role);
  for (const role of ["manager", "employee", undefined]) assert.ok(!labels(role).includes("Settings"), String(role));
  assert.deepEqual(labels("manager"), ["Dashboard", "Job Requisitions", "Candidates", "Interviews", "Offer Management", "Offers Issued"]);
});

test("Recruitment → Settings shows the privacy settings", async (t) => {
  t.mock.module("../src/modules/zoiko-hr/recruitment/PrivacySettings.jsx", { exports: {
    default: ({ embedded }) => React.createElement("section", null, `Recruitment privacy settings (embedded: ${embedded})`) } });
  t.mock.module("../src/modules/zoiko-hr/recruitment/ui.jsx", { exports: {
    RecruitmentLayout: ({ title, children }) => React.createElement("main", null, React.createElement("h1", null, title), children) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByRole("heading", { name: "Recruitment Settings" }));
  assert.ok(screen.getByText("Recruitment privacy settings (embedded: true)"));
});

test("the Candidates page no longer carries a Privacy settings button", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/modules/zoiko-hr/recruitment/candidates.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Privacy settings/);
  assert.doesNotMatch(src, /PrivacySettings/);
});
