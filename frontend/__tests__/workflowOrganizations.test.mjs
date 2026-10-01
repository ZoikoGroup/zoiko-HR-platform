/**
 * Zoiko Workflow page: every organization's workflows are visible and clearly
 * separated - overview cards, grouping, a trigger -> steps flow, org filter.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

const svc = {};
const auth = { user: { role: "super_admin" }, role: "super_admin", isAuthenticated: true };
const calls = { workflows: [], workspaces: [], executions: [], created: [] };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 150)); });

const wf = (id, name, org, orgName, over = {}) => ({
  id, name, description: null, workspace_id: id, workspace_name: `${orgName} ops`, organization_id: org, organization_name: orgName,
  trigger_event: "user.created", steps: [{ type: "slack", message: "hi" }, { type: "delay", seconds: 30 }], step_count: 2,
  is_active: true, last_run_at: "2026-09-30T10:00:00Z", last_run_status: "succeeded", runs: 4, succeeded: 3, failed: 1, success_rate: 75, ...over,
});
const WORKFLOWS = [
  wf(1, "Welcome Acme", 1, "Acme Ltd"),
  wf(2, "Welcome Globex", 2, "Globex Inc", { is_active: false, runs: 0, succeeded: 0, failed: 0, success_rate: null, last_run_at: null, last_run_status: null }),
  wf(3, "Platform audit", null, "Platform-wide", { steps: [{ type: "email", to: "ops@example.com", subject: "s", body: "b" }] }),
];
const OVERVIEW = {
  organizations: [
    { organization_id: 1, organization_name: "Acme Ltd", workspaces: 1, workflows: 1, active_workflows: 1, runs_7d: 4, succeeded_7d: 3, failed_7d: 1, last_run_at: "2026-09-30T10:00:00Z", last_run_status: "succeeded" },
    { organization_id: 2, organization_name: "Globex Inc", workspaces: 1, workflows: 1, active_workflows: 0, runs_7d: 0, succeeded_7d: 0, failed_7d: 0, last_run_at: null, last_run_status: null },
    { organization_id: null, organization_name: "Platform-wide", workspaces: 1, workflows: 1, active_workflows: 1, runs_7d: 1, succeeded_7d: 1, failed_7d: 0, last_run_at: "2026-09-30T09:00:00Z", last_run_status: "succeeded" },
  ],
  totals: { workspaces: 3, workflows: 3, active_workflows: 2, runs_7d: 5, failed_7d: 1 },
};

function reset(over = {}) {
  for (const k of Object.keys(svc)) delete svc[k];
  for (const k of Object.keys(calls)) calls[k].length = 0;
  Object.assign(svc, {
    getWorkflowOverview: async () => OVERVIEW,
    getWorkspaces: async (p) => { calls.workspaces.push(p); return { workspaces: [{ id: 1, name: "Acme ops", organization_id: 1, organization_name: "Acme Ltd", workflow_count: 1 }] }; },
    getWorkflows: async (p) => {
      calls.workflows.push(p);
      const org = p?.organization_id;
      return { workflows: org === undefined ? WORKFLOWS : WORKFLOWS.filter((w) => (org === "0" ? w.organization_id === null : String(w.organization_id) === org)) };
    },
    getExecutions: async (p) => { calls.executions.push(p); return { executions: [{ id: 9, workflow_name: "Welcome Acme", organization_name: "Acme Ltd", trigger_event: "user.created", status: "succeeded", created_at: "2026-09-30T10:00:00Z" }], total: 1 }; },
    getWorkflowMeta: async () => ({ triggers: [{ key: "user.created", description: "d" }], step_types: [{ key: "slack", label: "Slack" }] }),
    getWebhooks: async () => ({ webhooks: [] }),
    createWorkspace: async (b) => { calls.created.push(b); return { id: 5 }; },
    getExecution: async () => ({}),
    ...over,
  });
}

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/integrationsService.js", { exports: { integrationsService: new Proxy({}, { get: (_, n) => (...a) => svc[n](...a) }) } });
  t.mock.module("../src/service/documentsService.js", { exports: { getOrganizations: async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }, { id: 2, name: "Globex Inc" }] }) } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
}

async function open(t, over) {
  reset(over);
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoWorkflowPage.jsx");
  render(React.createElement(Page));
  await settle();
}

test("overview strip and one card per organization plus Platform-wide", async (t) => {
  await open(t);
  const totals = within(screen.getByLabelText("Workflow totals"));
  assert.ok(totals.getByText("Workspaces") && totals.getByText("Runs (7 days)"));
  for (const name of ["Acme Ltd", "Globex Inc", "Platform-wide"]) assert.ok(screen.getByRole("button", { name: `${name} workflows` }), name);
  const acme = screen.getByRole("button", { name: "Acme Ltd workflows" });
  assert.ok(within(acme).getByText(/of 1 workflow active/));
  assert.ok(within(acme).getByText("1 failed")); // failures are called out
  assert.ok(within(screen.getByRole("button", { name: "Globex Inc workflows" })).getByText("No runs yet"));
  cleanup();
});

test("workflows are grouped by organization, each shown as trigger -> steps", async (t) => {
  await open(t);
  for (const name of ["Acme Ltd", "Globex Inc", "Platform-wide"]) assert.ok(screen.getByRole("region", { name: `${name} workflows` }), name);
  const acme = within(screen.getByRole("region", { name: "Acme Ltd workflows" }));
  assert.ok(acme.getByText("Welcome Acme"));
  assert.equal(acme.queryByText("Welcome Globex"), null); // never mixed into another organization's block
  const flow = within(acme.getByLabelText("Workflow flow"));
  assert.ok(flow.getByText("When user.created"));
  assert.ok(flow.getByText("Slack message") && flow.getByText("Wait 30s"));
  assert.ok(acme.getByText("75% succeeded · 1 failed"));
  const globex = within(screen.getByRole("region", { name: "Globex Inc workflows" }));
  assert.ok(globex.getByText("No success rate yet")); // a workflow that never ran is not shown with a made-up rate
  assert.ok(globex.getByText("Never run"));
  assert.ok(within(screen.getByRole("region", { name: "Platform-wide workflows" })).getByText("Email → ops@example.com"));
  cleanup();
});

test("selecting an organization filters workflows, workspaces and activity to it", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Globex Inc workflows" }));
  await settle();
  assert.equal(calls.workflows.at(-1).organization_id, "2");
  assert.equal(calls.workspaces.at(-1).organization_id, "2");
  assert.equal(calls.executions.at(-1).organization_id, "2");
  assert.ok(screen.getByText("Workflows · Globex Inc"));
  const card = within(screen.getByText("Workflows · Globex Inc").closest("section"));
  assert.ok(card.getByText("Welcome Globex"));
  assert.ok(!card.queryByText("Welcome Acme"), "another organization's workflow must not be listed");
  assert.equal(screen.getByRole("button", { name: "Globex Inc workflows" }).getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: "Platform-wide workflows" }));
  await settle();
  assert.equal(calls.workflows.at(-1).organization_id, "0");
  fireEvent.click(screen.getByRole("button", { name: "Show all organizations" }));
  await settle();
  assert.ok(calls.workflows.at(-1) === undefined);
  assert.ok(screen.getByText("Workflows · All organizations"));
  cleanup();
});

test("Create Workspace lets you choose the organization (or platform-wide)", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Create Workspace" }));
  const dlg = screen.getByRole("dialog");
  const select = within(dlg).getByLabelText("Applies to");
  assert.deepEqual([...select.options].map((o) => o.textContent), ["Platform-wide (all organizations)", "Acme Ltd", "Globex Inc"]);
  fireEvent.change(within(dlg).getByLabelText(/^Name/), { target: { value: "Globex ops" } });
  fireEvent.change(select, { target: { value: "2" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Create" }));
  await settle();
  assert.deepEqual(calls.created, [{ name: "Globex ops", description: null, organization_id: 2 }]);
  cleanup();
});

test("Create Workspace defaults to platform-wide", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Create Workspace" }));
  const dlg = screen.getByRole("dialog");
  fireEvent.change(within(dlg).getByLabelText(/^Name/), { target: { value: "Everyone" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Create" }));
  await settle();
  assert.equal(calls.created[0].organization_id, null);
  cleanup();
});

test("recent activity shows which organization each run belongs to", async (t) => {
  await open(t);
  const activity = screen.getByText("Recent Activity").closest("section");
  assert.ok(within(activity).getByText("Acme Ltd"));
  cleanup();
});

test("executions log has an organization filter", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "View Executions Log" }));
  await settle();
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "0" } });
  await settle();
  assert.equal(calls.executions.at(-1).organization_id, "0");
  const row = screen.getByText(/#9 Welcome Acme/).closest("button");
  assert.ok(within(row).getByText("Acme Ltd")); // the run row shows its organization
  cleanup();
});

test("honest empty overview", async (t) => {
  await open(t, { getWorkflowOverview: async () => ({ organizations: [], totals: { workspaces: 0, workflows: 0, active_workflows: 0, runs_7d: 0, failed_7d: 0 } }),
    getWorkspaces: async () => ({ workspaces: [] }), getWorkflows: async () => ({ workflows: [] }), getExecutions: async () => ({ executions: [], total: 0 }) });
  assert.ok(screen.getByText(/No organization has any workspace or workflow yet/));
  assert.ok(screen.getByText("No workflows yet."));
  assert.ok(screen.getByText(/No executions yet/));
  cleanup();
});
