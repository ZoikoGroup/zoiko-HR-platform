/**
 * Documents Phase 8 (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): the rules engine for admins — the rules list (system rules
 * can't be deleted), the WHEN · IF · THEN builder with "Try it", run history with retry, and the org settings where only
 * the Org Admin can pause automation.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const CATALOG = {
  events: [{ type: "document.rejected", description: "A document was rejected", fields: ["data.category_key", "data.reason_code"] },
           { type: "employee.created", description: "Someone joined", fields: ["data.employee_id"] }],
  fields: [{ field: "employee.department_id", label: "Department" }],
  operators: ["eq", "in", "exists"],
  actions: [{ type: "notify", description: "Send a notification" }, { type: "create_task", description: "Open a task" }],
  limits: { conditions: 10, actions: 8 },
};
const RULES = [
  { id: 1, key: "sys.onboarding_checklist", name: "Onboarding checklist", trigger_event: "employee.created", status: "paused", is_system: true,
    version: 1, definition: { conditions: { all: [] }, actions: [{ type: "create_upload_tasks", due_in_days: 14 }] }, runs_7d: 4, success_rate_7d: 75, last_run_at: "2026-11-18T10:00:00Z" },
  { id: 2, key: null, name: "Tell manager", trigger_event: "document.rejected", status: "active", is_system: false, version: 2,
    definition: { conditions: { all: [{ field: "data.category_key", op: "in", value: ["identity_proof"] }] }, actions: [{ type: "notify", to: "manager" }] },
    runs_7d: 0, success_rate_7d: null, last_run_at: null },
];

const impl = {};
const mocked = new WeakSet();
function mockAll(t, over = {}) {
  const calls = { create: [], update: [], status: [], remove: [], dry: [], retry: [], settings: [] };
  Object.assign(impl, {
    getAutomationCatalog: async () => CATALOG,
    listAutomationRules: async () => structuredClone(RULES),
    createAutomationRule: async (v) => { calls.create.push(v); return { id: 9, ...v }; },
    updateAutomationRule: async (v) => { calls.update.push(v); return v; },
    deleteAutomationRule: async (id) => { calls.remove.push(id); return null; },
    setAutomationRuleStatus: async (v) => { calls.status.push(v); return v; },
    dryRunAutomationRule: async (v) => { calls.dry.push(v); return { source: "recent", events: 3, matched: 2,
      results: [{ event_id: "aaaaaaaa1", matched: true, actions: [{ type: "notify", ok: true }] }, { event_id: "b", matched: false, actions: [] }] }; },
    listAutomationRuns: async () => ({ total: 1, page: 1, per_page: 50, items: [{ id: 77, rule_id: 2, rule_name: "Tell manager", event_type: "document.rejected",
      mode: "live", status: "dead", created_at: "2026-11-19T08:00:00Z", can_retry: true }] }),
    getAutomationRun: async (id) => ({ id, rule_id: 2, rule_name: "Tell manager", event_type: "document.rejected", status: "dead", attempt: 5,
      error: "SMTP unavailable", can_retry: true, steps: [{ type: "notify", ok: false, detail: { error: "SMTP unavailable" } }] }),
    retryAutomationRun: async (id) => { calls.retry.push(id); return { id, status: "pending" }; },
    getAutomationSettings: async () => ({ paused: false, globally_paused: false, features: { onboarding: true, ocr: false }, quiet_hours: null,
      rate_limits: {}, approval_sla_hours: 72, lock_after_exit_days: 30, can_change_global: false }),
    saveAutomationSettings: async (v) => { calls.settings.push(v); return v; },
    listNotificationTemplates: async () => ({ items: [], variables: {} }), saveNotificationTemplate: async () => ({}),
    revertNotificationTemplate: async () => null, previewNotificationTemplate: async () => ({}),
    listRetentionPolicies: async () => ({ items: [] }), saveRetentionPolicy: async () => ({}), deleteRetentionPolicy: async () => null,
    getMyDocumentCounts: async () => ({}),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/documentsService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
  }
  return calls;
}

async function renderAutomation(tab) {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/automation/AutomationSettingsPage.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(Page))));
  await settle();
  if (tab) { fireEvent.click(screen.getByRole("tab", { name: tab })); await settle(); }
}

test("the rules list shows status, success rate and System; only custom rules can be deleted", async (t) => {
  const calls = mockAll(t);
  await renderAutomation();
  const sys = screen.getByRole("button", { name: "Onboarding checklist" }).closest("tr");
  assert.ok(within(sys).getByText("System"));
  assert.ok(within(sys).getByText("75% of 4"));
  assert.equal(within(sys).queryByRole("button", { name: /Delete/ }), null);
  fireEvent.change(within(sys).getByLabelText("Status of Onboarding checklist"), { target: { value: "active" } });
  await settle();
  assert.deepEqual(calls.status, [{ id: 1, status: "active" }]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Tell manager" }));
  await settle();
  assert.deepEqual(calls.remove, [2]);
});

test("build a rule: WHEN · IF · THEN, try it, then activate", async (t) => {
  const calls = mockAll(t);
  await renderAutomation();
  fireEvent.click(screen.getByRole("button", { name: "New rule" }));
  await settle();
  const d = screen.getByRole("dialog", { name: "New rule" });
  fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Rejected ID: tell manager" } });
  fireEvent.change(within(d).getByLabelText("Event"), { target: { value: "document.rejected" } });
  fireEvent.click(within(d).getByRole("button", { name: /Add condition/ }));
  fireEvent.change(within(d).getByLabelText("Condition 1 field"), { target: { value: "data.category_key" } });
  fireEvent.change(within(d).getByLabelText("Condition 1 operator"), { target: { value: "in" } });
  fireEvent.change(within(d).getByLabelText("Condition 1 value"), { target: { value: "identity_proof, address_proof" } });
  fireEvent.click(within(d).getByRole("button", { name: /Add action/ }));
  fireEvent.click(within(d).getByRole("button", { name: /Add action/ }));
  fireEvent.change(within(d).getByLabelText("Action 2"), { target: { value: "create_task" } });
  fireEvent.change(within(d).getByLabelText("Due in (days)"), { target: { value: "5" } });
  fireEvent.click(within(d).getByRole("button", { name: "Move action 2 up" }));
  fireEvent.click(within(d).getByRole("button", { name: "Try it" }));
  await settle();
  assert.match(within(d).getByRole("status", { name: "Try-it result" }).textContent, /Matched 2 of the last 3 events\. Nothing was sent\./);
  const expected = { conditions: { all: [{ field: "data.category_key", op: "in", value: ["identity_proof", "address_proof"] }] },
                     actions: [{ type: "create_task", due_in_days: 5 }, { type: "notify", to: "assignee" }] };
  assert.deepEqual(calls.dry[0], { id: undefined, definition: expected, triggerEvent: "document.rejected" });
  fireEvent.click(within(d).getByRole("button", { name: "Activate" }));
  await settle();
  assert.deepEqual(calls.create, [{ name: "Rejected ID: tell manager", trigger_event: "document.rejected", definition: expected, status: "active" }]);
  assert.equal(screen.queryByRole("dialog"), null);
});

test("the server's reasons are shown when a rule can't be saved", async (t) => {
  mockAll(t, { createAutomationRule: async () => { throw Object.assign(new Error("This rule can't be saved."), { problems: ["action 1: 'approve_document' is not allowed in a rule"] }); } });
  await renderAutomation();
  fireEvent.click(screen.getByRole("button", { name: "New rule" }));
  await settle();
  const d = screen.getByRole("dialog", { name: "New rule" });
  fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Bad" } });
  fireEvent.change(within(d).getByLabelText("Event"), { target: { value: "employee.created" } });
  fireEvent.click(within(d).getByRole("button", { name: /Add action/ }));
  fireEvent.click(within(d).getByRole("button", { name: "Save paused" }));
  await settle();
  assert.match(within(d).getByRole("alert").textContent, /not allowed in a rule/);
});

test("a system rule's event can't be changed in the builder", async (t) => {
  mockAll(t);
  await renderAutomation();
  fireEvent.click(screen.getByRole("button", { name: "Onboarding checklist" }));
  await settle();
  const d = screen.getByRole("dialog", { name: /Edit rule/ });
  assert.equal(within(d).getByLabelText("Event").disabled, true);
});

test("run history: details of a failed run, and retry", async (t) => {
  const calls = mockAll(t);
  await renderAutomation("Run history");
  assert.ok(within(screen.getByRole("table")).getByText("Gave up"));
  fireEvent.click(screen.getByRole("button", { name: "Details of run 77" }));
  await settle();
  const d = screen.getByRole("dialog", { name: "Run 77" });
  assert.match(within(d).getByRole("alert").textContent, /SMTP unavailable/);
  fireEvent.click(within(d).getByRole("button", { name: /Retry/ }));
  await settle();
  assert.deepEqual(calls.retry, [77]);
});

test("settings: HR can change timing and automations but not pause or quiet hours", async (t) => {
  const calls = mockAll(t);
  await renderAutomation("Settings");
  assert.equal(screen.getByRole("checkbox", { name: /Pause all document automation/ }).disabled, true);
  fireEvent.change(screen.getByLabelText("Review target in hours"), { target: { value: "48" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Read document text/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await settle();
  assert.deepEqual(calls.settings, [{ features: { onboarding: true, ocr: true }, approval_sla_hours: 48, lock_after_exit_days: 30 }]);
});
