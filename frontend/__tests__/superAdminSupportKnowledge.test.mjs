/**
 * ZHR-33/34 frontend: Support Tickets desk, Assistant Knowledge organization
 * scoping, and the assistantService organization param.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";

const support = {};
const orgSvc = {};
const apiCalls = [];
const scopeCalls = [];
const auth = { user: { role: "super_admin" }, role: "super_admin", isAuthenticated: true };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });

const TICKET = {
  id: 5, reference: "HR-ABCD1234", subject: "Cannot find my payslip", summary: "Cannot find my payslip", status: "new", priority: "high",
  organization_id: 2, organization_name: "Globex Inc", requester_name: "Bob Brown", requester_email: "bob@example.com",
  assignee_id: null, assignee_name: null, created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z",
};
const DETAIL = { ...TICKET, thread: [{ id: 0, author_name: "Bob Brown", author_role: "requester", body: "Cannot find my payslip", created_at: "2026-09-30T10:00:00Z" }] };

function reset(over = {}) {
  for (const o of [support, orgSvc]) for (const k of Object.keys(o)) delete o[k];
  apiCalls.length = 0;
  scopeCalls.length = 0;
  Object.assign(support, {
    list: async () => ({ tickets: [TICKET], total: 1 }), get: async () => DETAIL, update: async (id, d) => ({ ...DETAIL, ...d }),
    reply: async () => ({ ...DETAIL, status: "in_progress", notified: true, requester_name: "Bob Brown", thread: [...DETAIL.thread, { id: 1, author_name: "Root", author_role: "staff", body: "On it", created_at: "2026-09-30T11:00:00Z" }] }),
    assignees: async () => ({ assignees: [{ id: 1, name: "Root Admin" }, { id: 9, name: "Sam Support" }] }),
  });
  Object.assign(orgSvc, { getOrganizations: async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }, { id: 2, name: "Globex Inc" }] }) });
  Object.assign(auth, { user: { role: "super_admin" }, role: "super_admin" });
  Object.assign(support, over.support || {});
  Object.assign(orgSvc, over.orgSvc || {});
}

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/supportService.js", {
    exports: { supportService: Object.fromEntries(["list", "get", "update", "reply", "assignees"].map((n) => [n, (...a) => support[n](...a)])) },
  });
  t.mock.module("../src/service/documentsService.js", { exports: { getOrganizations: (...a) => orgSvc.getOrganizations(...a) } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("../src/service/assistantService.js", { exports: { setAdminOrganization: (id) => scopeCalls.push(id) } });
  t.mock.module("../src/modules/shared-layers/assistant/AdminKnowledgePage.jsx", {
    defaultExport: () => React.createElement("div", { "data-testid": "knowledge-body" }, `scope:${scopeCalls.at(-1)}`),
  });
}

// ───────────────────────── Support Tickets ─────────────────────────

test("Support Tickets lists real tickets from every organization with filters", async (t) => {
  reset();
  register(t);
  const calls = [];
  support.list = async (p) => { calls.push(p); return { tickets: [TICKET], total: 1 }; };
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminSupportTicketsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("HR-ABCD1234"));
  assert.ok(screen.getByText(/Globex Inc · Bob Brown · Unassigned/));
  fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "new" } });
  fireEvent.change(screen.getByLabelText("Priority filter"), { target: { value: "high" } });
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Assignee filter"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Search tickets"), { target: { value: "payslip" } });
  await settle();
  const last = calls.at(-1);
  assert.deepEqual([last.status, last.priority, last.organization_id, last.assignee_id, last.q, last.page], ["new", "high", "2", "0", "payslip", 1]);
  cleanup();
});

test("Support Tickets shows honest empty states", async (t) => {
  reset({ support: { list: async () => ({ tickets: [], total: 0 }) } });
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminSupportTicketsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("No support tickets yet."));
  fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "resolved" } });
  await settle();
  assert.ok(screen.getByText("No tickets match your filters."));
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await settle();
  assert.ok(screen.getByText("No support tickets yet."));
  cleanup();
});

test("ticket detail: thread, reply, status/priority/assignee changes", async (t) => {
  reset();
  register(t);
  const updates = [];
  const replies = [];
  support.update = async (id, d) => { updates.push([id, d]); return { ...DETAIL, ...d }; };
  support.reply = async (id, body, resolve) => {
    replies.push([id, body, resolve]);
    return { ...DETAIL, status: "in_progress", notified: true, requester_name: "Bob Brown",
      thread: [...DETAIL.thread, { id: 1, author_name: "Root", author_role: "staff", body, created_at: "2026-09-30T11:00:00Z" }] };
  };
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminSupportTicketsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByText("HR-ABCD1234"));
  await settle();
  const dlg = screen.getByRole("dialog");
  assert.ok(within(dlg).getByText("Conversation"));
  assert.ok(within(dlg).getAllByText("Cannot find my payslip").length >= 1);

  fireEvent.change(within(dlg).getByLabelText("Priority"), { target: { value: "urgent" } });
  await settle();
  fireEvent.change(within(dlg).getByLabelText("Assignee"), { target: { value: "9" } });
  await settle();
  fireEvent.change(within(dlg).getByLabelText("Status"), { target: { value: "in_progress" } });
  await settle();
  assert.deepEqual(updates.map((u) => u[1]), [{ priority: "urgent" }, { assigned_to: 9 }, { status: "in_progress" }]);

  const send = within(dlg).getByRole("button", { name: "Send reply" });
  assert.equal(send.disabled, true); // empty reply
  fireEvent.change(within(dlg).getByLabelText("Reply"), { target: { value: "Check the Documents tab" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Send reply" }));
  await settle();
  assert.deepEqual(replies, [[5, "Check the Documents tab", false]]);
  assert.ok(within(dlg).getByText(/Bob Brown was notified/));
  cleanup();
});

test("ticket errors surface inside the dialog", async (t) => {
  reset({ support: { update: async () => { throw new Error("Tickets can only be assigned to an active Super Admin."); } } });
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminSupportTicketsPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByText("HR-ABCD1234"));
  await settle();
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Priority"), { target: { value: "low" } });
  await settle();
  assert.ok(within(screen.getByRole("dialog")).getByText(/can only be assigned to an active Super Admin/));
  cleanup();
});

test("Support Tickets page is super-admin only", async (t) => {
  reset();
  register(t);
  auth.user = { role: "admin" };
  auth.role = "admin";
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminSupportTicketsPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/super admins only/));
  assert.equal(screen.queryByText("HR-ABCD1234"), null);
  cleanup();
});

// ───────────────────────── Assistant Knowledge ─────────────────────────

test("Assistant Knowledge asks for an organization, then scopes the knowledge page to it", async (t) => {
  reset();
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminKnowledgePage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/Choose an organization to view and manage/));
  assert.equal(screen.queryByTestId("knowledge-body"), null);
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "2" } });
  await settle();
  assert.equal(screen.getByTestId("knowledge-body").textContent, "scope:2");
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "1" } });
  await settle();
  assert.equal(screen.getByTestId("knowledge-body").textContent, "scope:1");
  cleanup();
});

test("Assistant Knowledge is super-admin only", async (t) => {
  reset();
  register(t);
  auth.user = { role: "hr_admin" };
  auth.role = "hr_admin";
  const { default: Page } = await import("../src/modules/shared-layers/assistant/SuperAdminKnowledgePage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/super admins only/));
  cleanup();
});

test("assistantService adds ?organization_id only when a Super Admin scope is set", async (t) => {
  t.mock.module("../src/service/api.js", {
    exports: {
      api: {
        get: async (p, o) => { apiCalls.push(["get", p, o]); return []; },
        post: async (p, b, o) => { apiCalls.push(["post", p, o]); return {}; },
        patch: async (p, b, o) => { apiCalls.push(["patch", p, o]); return {}; },
        delete: async (p, o) => { apiCalls.push(["delete", p, o]); return {}; },
      },
      API_BASE_URL: "", getAccessToken: () => null,
    },
  });
  const svc = await import("../src/service/assistantService.js");
  await svc.listKnowledgeSources({ search: "x" });
  assert.deepEqual(apiCalls.at(-1)[2], { params: { search: "x" } }); // org admin: untouched
  svc.setAdminOrganization(7);
  await svc.listKnowledgeSources({ search: "x" });
  assert.deepEqual(apiCalls.at(-1)[2], { params: { search: "x", organization_id: 7 } });
  await svc.publishKnowledgeSource(3);
  await svc.listHandoffTickets("open");
  await svc.deleteKnowledgeSource(3);
  await svc.listControls();
  for (const c of apiCalls.slice(-4)) assert.equal(c[2].params.organization_id, 7, c[1]);
  svc.setAdminOrganization(null);
  await svc.listControls();
  assert.equal(apiCalls.at(-1)[2].params, undefined);
});
