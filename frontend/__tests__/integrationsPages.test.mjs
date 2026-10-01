/**
 * ZHR-24/25/26 frontend: Connect, Hub and Workflow pages render only real
 * (server-provided) state, keep the honest empty states, and work the buttons.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";

const service = {};
const auth = { user: { role: "super_admin" } };
const mocked = new WeakSet();

const CHANNELS = {
  channels: [
    { key: "smtp", name: "SMTP Email Server", status: "Not configured", details: {}, editable: false, note: "env" },
    { key: "slack", name: "Slack Notifications", status: "Not configured", details: {}, editable: true },
    { key: "twilio", name: "Twilio SMS Gateway", status: "Not configured", details: {}, editable: true },
  ],
};

function setup(t, overrides = {}, role = "super_admin") {
  auth.user = { role };
  for (const k of Object.keys(service)) delete service[k];
  Object.assign(service, {
    getChannels: async () => CHANNELS,
    saveChannel: async () => ({}),
    removeChannel: async () => ({}),
    testChannel: async () => ({ success: true, message: "Test message sent to Slack." }),
    getApplications: async () => ({ applications: [] }),
    getEvents: async () => ({ events: [{ key: "user.created", description: "A user was created." }] }),
    getWebhooks: async () => ({ webhooks: [] }),
    createWebhook: async () => ({ id: 1, signing_secret: "whsec_ABCDEF" }),
    getWorkspaces: async () => ({ workspaces: [] }),
    getWorkflowOverview: async () => ({ organizations: [], totals: { workspaces: 0, workflows: 0, active_workflows: 0, runs_7d: 0, failed_7d: 0 } }),
    getWorkflows: async () => ({ workflows: [] }),
    getExecutions: async () => ({ executions: [], total: 0 }),
    getWorkflowMeta: async () => ({ triggers: [{ key: "user.created", description: "d" }], step_types: [] }),
    createWorkspace: async () => ({ id: 1 }),
    ...overrides,
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/integrationsService.js", { exports: { integrationsService: service } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("../src/service/documentsService.js", { exports: { getOrganizations: async () => ({ organizations: [] }) } });
  t.mock.module("react-router-dom", {
    exports: { Link: ({ to, children }) => React.createElement("a", { href: to }, children) },
  });
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("Connect shows Not configured and disables Send Test Message", async (t) => {
  setup(t);
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoConnectPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.equal(screen.getAllByText("Not configured").length, 3);
  assert.equal(screen.queryByText(/zoiko-alerts/), null);
  for (const b of screen.getAllByRole("button", { name: "Send Test Message" })) assert.equal(b.disabled, true);
  cleanup();
});

test("Connect shows real status, last error and enables test when configured", async (t) => {
  setup(t, {
    getChannels: async () => ({
      channels: [{ key: "slack", name: "Slack Notifications", status: "Error", details: { webhook_url: "••••abcd" },
        editable: true, last_tested_at: "2026-09-30T10:00:00Z", last_error: "Slack rejected the message: revoked" }],
    }),
  });
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoConnectPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Error"));
  assert.ok(screen.getByText(/revoked/));
  assert.ok(screen.getByText(/••••abcd/));
  assert.equal(screen.getByRole("button", { name: "Send Test Message" }).disabled, false);
  cleanup();
});

test("Connect test dialog shows the provider result", async (t) => {
  let sent;
  setup(t, {
    getChannels: async () => ({ channels: [{ key: "slack", name: "Slack Notifications", status: "Configured (untested)", details: {}, editable: true }] }),
    testChannel: async (key, body) => { sent = { key, body }; return { success: true, message: "Test message sent to Slack." }; },
  });
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoConnectPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Send Test Message" }));
  fireEvent.click(screen.getByRole("button", { name: /Send test/ }));
  await settle();
  assert.equal(sent.key, "slack");
  assert.ok(screen.getByText("Test message sent to Slack."));
  cleanup();
});

test("Hub lists only server-provided apps and shows the one-time secret", async (t) => {
  setup(t, {
    getApplications: async () => ({ applications: [{ key: "slack", name: "Slack Notifications", status: "Not connected", href: "/shared/connect" }] }),
  });
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoHubPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Not connected"));
  assert.equal(screen.queryByText("QuickBooks Online"), null);
  assert.ok(screen.getByText(/No webhooks registered yet/));

  fireEvent.click(screen.getByRole("button", { name: "Register New Webhook" }));
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "CRM" } });
  fireEvent.change(screen.getByLabelText(/Endpoint URL/), { target: { value: "https://example.com/h" } });
  fireEvent.click(screen.getByLabelText(/user\.created/));
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => screen.getByText("whsec_ABCDEF"));
  assert.ok(screen.getByText(/will not be shown again/));
  cleanup();
});

test("Workflow shows honest empty states and Create Workspace works", async (t) => {
  let created;
  setup(t, { createWorkspace: async (b) => { created = b; return { id: 1 }; } });
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoWorkflowPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/No workspaces yet/));
  assert.ok(screen.getByText("No workflows yet."));
  assert.ok(screen.getByText(/No executions yet/));
  assert.equal(screen.queryByText("Employee Onboarding Pipeline"), null);
  assert.equal(screen.getByRole("button", { name: "Create Workflow" }).disabled, true);

  fireEvent.click(screen.getByRole("button", { name: "Create Workspace" }));
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Ops" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.equal(created.name, "Ops");
  cleanup();
});

test("Workflow View Executions Log opens the real (empty) log", async (t) => {
  setup(t);
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoWorkflowPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "View Executions Log" }));
  await settle();
  assert.ok(screen.getByText("No executions found."));
  cleanup();
});

test("pages are super-admin only", async (t) => {
  setup(t, {}, "admin");
  const { default: Page } = await import("../src/modules/shared-layers/ZoikoHubPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/super admins only/));
  cleanup();
});
