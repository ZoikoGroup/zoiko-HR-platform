/** Bug 14: Set up docs → Documents to collect: Category and What to upload are dropdowns (and still take your own words). */
import "./support/setup-jsdom.mjs";
import { chooseOption, optionTexts } from "./support/searchableSelect.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount(t) {
  const calls = [];
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    getDocsSetupProposals: async () => ({ items: [{ id: 1, target: "request_category", decision: "accepted", proposed_value: { label: "Club membership" } }] }),
    addDocsSetupChange: async (id, body) => { calls.push(body); return {}; },
    decideDocsSetupProposal: async () => ({}),
  } });
  const { default: Step } = await import(`../src/modules/zoiko-hr/onboarding/docs-setup/PackageFormsStep.jsx?t=${Math.random()}`);
  render(React.createElement(Step, { session: { id: 7 } }));
  await settle();
  return calls;
}

test("a category and a document are picked from lists, and the document list follows the category", async (t) => {
  const calls = await mount(t);
  const category = document.getElementById("pf-cat");
  assert.equal(category.getAttribute("aria-haspopup"), "listbox");
  const cats = await optionTexts(category);
  assert.ok(cats.includes("Educational documents") && cats.includes("Identity proof"));
  assert.ok(cats.includes("Club membership"), "a category already used on the page can be picked again");
  await chooseOption(category, "Educational documents", { search: "educ" });
  const docs = await optionTexts("pf-cat-desc");
  assert.ok(docs.includes("Provisional certificate") && docs.includes("Degree certificate"));
  assert.ok(!docs.includes("Passport"), "only the documents of the chosen category");
  await chooseOption("pf-cat-desc", "Provisional certificate");
  fireEvent.click(screen.getByRole("button", { name: /Add/ }));
  await settle();
  assert.deepEqual(calls[0], { target: "request_category", value: { label: "Educational documents", description: "Provisional certificate" } });
});

test("a category that is not on the list can still be typed", async (t) => {
  const calls = await mount(t);
  await chooseOption("pf-cat", /Use “Driving records”/, { search: "Driving records" });
  assert.equal(document.getElementById("pf-cat").value, "Driving records");
  await chooseOption("pf-cat-desc", /Use “Licence copy”/, { search: "Licence copy" });
  fireEvent.click(screen.getByRole("button", { name: /Add/ }));
  await settle();
  assert.deepEqual(calls[0].value, { label: "Driving records", description: "Licence copy" });
});
