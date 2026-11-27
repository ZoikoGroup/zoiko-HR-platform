/** QA bug 31: the Workforce composition chart shows its green (HR admins) and silver (inactive) parts, never a negative. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

async function load(t) {
  t.mock.module("../src/service/orgAdminService.js", { exports: { getOrganizationDetails: async () => ({}), updateOrganizationDetails: async () => ({}) } });
  t.mock.module("../src/components/OrganizationLogoCard.jsx", { exports: { default: () => null } });
  return import(`../src/modules/organization-admin/OrganizationPage.jsx?t=${Math.random()}`);
}

test("HR admins are part of the active employees, so the parts add up to the total (the reported case)", async (t) => {
  const { workforceSegments } = await load(t);
  const [active, hr, inactive] = workforceSegments(3, 3, 1);
  assert.deepEqual([active.count, hr.count, inactive.count], [2, 1, 0]);
  assert.deepEqual([active.pct, hr.pct, inactive.pct], [67, 33, 0]);
  assert.ok(workforceSegments(3, 3, 1).every((s) => s.count >= 0), "never a negative count");
  const odd = workforceSegments(4, 2, 5);           // more HR admins than active people: capped
  assert.deepEqual(odd.map((s) => s.count), [0, 2, 2]);
  assert.deepEqual(workforceSegments(0, 0, 0).map((s) => s.pct), [0, 0, 0]);
});

test("the ring draws a green and a silver part when there are HR admins and inactive employees", async (t) => {
  const { WorkforceRing } = await load(t);
  const { container } = render(React.createElement(WorkforceRing, { total: 5, active: 3, hrAdmins: 1 }));
  const arcs = [...container.querySelectorAll("circle[data-segment]")].map((c) => [c.dataset.segment, c.getAttribute("stroke")]);
  assert.deepEqual(arcs, [["active", "url(#orgActiveGrad)"], ["hr", "#10B981"], ["inactive", "#C3CAD6"]]);
  assert.ok(screen.getByText("Inactive"));
  assert.equal(screen.queryByText("Unassigned"), null);
  assert.equal(screen.getByRole("img").getAttribute("aria-label"), "Active employees 2, HR admins 1, Inactive 2");
});

test("a part with nobody in it is not drawn, and the reported case shows the green part", async (t) => {
  const { WorkforceRing } = await load(t);
  const { container } = render(React.createElement(WorkforceRing, { total: 3, active: 3, hrAdmins: 1 }));
  const segs = [...container.querySelectorAll("circle[data-segment]")].map((c) => c.dataset.segment);
  assert.deepEqual(segs, ["active", "hr"]);
  assert.equal(container.textContent.includes("-"), false, "no negative figure anywhere");
});
