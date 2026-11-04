import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });

test("job descriptions save structured fields, run inclusive-language check, and submit for approval", async (t) => {
  const calls = { create: [], update: [], check: [], submit: [] };
  let record = null;
  const service = {
    getJobDescriptions: async () => ({ items: record ? [record] : [] }),
    getJobDescription: async () => record,
    createJobDescription: async (payload) => {
      calls.create.push(payload);
      record = { ...payload, id: 21, reference: "JD-00021", version: 1, status: "DRAFT" };
      return record;
    },
    updateJobDescription: async (id, payload) => {
      calls.update.push([id, payload]);
      record = { ...record, ...payload };
      return record;
    },
    checkJobDescriptionLanguage: async (id) => { calls.check.push(id); return { flags: [{ term: "aggressive", where: "title" }] }; },
    submitJobDescription: async (id) => {
      calls.submit.push(id);
      record = { ...record, status: "PENDING" };
      return record;
    },
    decideJobDescription: async () => record,
    createJobDescriptionVersion: async () => record,
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/components/documents/GenerateDocumentButton.jsx", { exports: { default: () => null } });
  t.mock.module("../src/service/workforcePlanningService.js", { exports: service });
  t.mock.module("../src/service/hrService.js", { exports: {
    getDesignations: async () => ({ items: [] }), getDepartments: async () => ({ data: [] }), getPayGrades: async () => ({ items: [] }),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/workforce-planning/job-descriptions.jsx?test=${Math.random()}`);
  render(React.createElement(Page));
  await settle();

  fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "People Operations Lead" } });
  fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Support a fair employee experience." } });
  fireEvent.change(screen.getByLabelText("Key responsibilities (one per line)"), { target: { value: "Build workforce plans\nCoach managers" } });
  fireEvent.change(screen.getByLabelText("Essential requirements (one per line)"), { target: { value: "Experience leading HR programs" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0].key_responsibilities, ["Build workforce plans", "Coach managers"]);

  fireEvent.click(screen.getByRole("button", { name: "Check inclusive language" }));
  await settle();
  assert.equal(calls.check[0], 21);
  assert.ok(screen.getAllByRole("status").some((node) => /Review inclusive-language flags/.test(node.textContent)));

  fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
  await settle();
  assert.deepEqual(calls.submit, [21]);
  assert.equal(record.status, "PENDING");
  assert.ok(screen.getByText(/Submitted for approval/));
});
