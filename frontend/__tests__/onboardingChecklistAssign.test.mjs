/** Onboarding Checklists only offers "Assign" where a new hire / template pair is still open: once a template is
 * assigned to a hire, that pair is not offered again (the server refuses a second copy). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const TEMPLATES = [{ id: 1, name: "IT Setup", category: "IT", items: [] }, { id: 2, name: "HR Basics", category: "HR", items: [] }];
const HIRES = [
  { id: 10, candidate_name: "Asha Rao", status: "in_progress" },
  { id: 11, candidate_name: "Ben Ito", status: "offer_accepted" },
];
const assignment = (id, hire, tpl) => ({ id, onboarding_new_hire_id: hire, template_id: tpl, name: TEMPLATES.find((t) => t.id === tpl).name, status: "pending", items: [] });

async function load(t, initial) {
  let assignments = [...initial];
  const calls = { create: [] };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingChecklistTemplates: async (cat) => (cat ? TEMPLATES.filter((x) => x.category === cat) : TEMPLATES),
    createOnboardingChecklistTemplate: async () => ({}), updateOnboardingChecklistTemplate: async () => ({}), deleteOnboardingChecklistTemplate: async () => ({}),
    getOnboardingChecklistAssignments: async () => assignments,
    createOnboardingChecklistAssignment: async (p) => {
      calls.create.push(p);
      const a = assignment(100 + calls.create.length, p.onboarding_record_id, p.template_id);
      assignments = [...assignments, a];
      return a;
    },
    updateOnboardingChecklistAssignment: async () => ({}), deleteOnboardingChecklistAssignment: async () => ({}),
    getOnboardingRecords: async () => HIRES,
    getRecruitmentInsights: async () => null,
  } });
  t.mock.module("../src/service/employee.js", { exports: { getEmployees: async () => [] } });
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: { errorMessage: (e, f) => e?.message || f, setChecklistException: async () => ({}) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/checklists.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const hireSection = (name) => screen.getByRole("region", { name: `Checklists for ${name}` });
const assignIn = (el) => within(el).queryByRole("button", { name: /^Assign$/ });

test("a hire who has every template is not offered Assign; one with an open template is", async (t) => {
  await load(t, [assignment(1, 10, 1), assignment(2, 10, 2), assignment(3, 11, 1)]);
  assert.equal(assignIn(hireSection("Asha Rao")), null);
  assert.ok(assignIn(hireSection("Ben Ito")));
});

test("after assigning the last open template, the Assign options disappear", async (t) => {
  const calls = await load(t, [assignment(1, 10, 1), assignment(2, 10, 2), assignment(3, 11, 1)]);
  fireEvent.click(assignIn(hireSection("Ben Ito")));
  await settle();
  const tplSelect = document.getElementById("assign-template");
  const itSetup = within(tplSelect).getByRole("option", { name: /IT Setup/ });
  assert.equal(itSetup.disabled, true);
  assert.match(itSetup.textContent, /already assigned/);
  fireEvent.change(tplSelect, { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Assign checklist" }));
  await settle();
  assert.deepEqual(calls.create, [{ onboarding_record_id: 11, template_id: 2 }]);
  assert.equal(assignIn(hireSection("Ben Ito")), null);
  assert.equal(screen.getByRole("button", { name: "Assign Checklist" }).disabled, true);
});

test("from a template, hires that already have it cannot be picked", async (t) => {
  await load(t, [assignment(1, 10, 2)]);
  fireEvent.click(screen.getByRole("tab", { name: /Checklist templates/ }));
  await settle();
  const card = screen.getByText("HR Basics").closest("article");
  fireEvent.click(within(card).getByRole("button", { name: "Assign" }));
  await settle();
  const hireSelect = document.getElementById("assign-hire");
  assert.equal(within(hireSelect).getByRole("option", { name: /Asha Rao/ }).disabled, true);
  assert.equal(within(hireSelect).getByRole("option", { name: /Ben Ito/ }).disabled, false);
});

test("a template every active hire already has shows as assigned instead of Assign", async (t) => {
  await load(t, [assignment(1, 10, 2), assignment(2, 11, 2)]);
  fireEvent.click(screen.getByRole("tab", { name: /Checklist templates/ }));
  await settle();
  const card = screen.getByText("HR Basics").closest("article");
  assert.equal(within(card).queryByRole("button", { name: "Assign" }), null);
  assert.match(card.textContent, /Assigned to all active hires/);
});
