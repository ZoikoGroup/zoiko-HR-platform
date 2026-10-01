/**
 * ZHR-35 frontend: every delete entry point uses the same confirmation dialog and
 * endpoint; lists refresh immediately; Deleted filter + Restore.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";

const sa = {};
const userSvc = {};
const auth = { user: { id: 1, email: "root@example.com", role: "super_admin" }, role: "super_admin", isAuthenticated: true };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 150)); });

const ORG = { id: 4, name: "Acme Ltd", organization_code: "ACM001", status: "active", user_count: 3, total_employees: 3, subscription_plan: "Core", created_at: "2026-01-01T00:00:00Z" };
const DELETED = { id: 9, name: "Old Co", organization_code: "OLD001", status: "active", user_count: 2, deleted_at: "2026-09-29T10:00:00Z", delete_reason: "Contract ended", created_at: "2025-01-01T00:00:00Z" };
const IMPACT = {
  organization_id: 4, name: "Acme Ltd", users_total: 3, users_active: 2, restore_window_days: 90,
  subscription: { plan: "core", status: "ACTIVE" },
  effects: ["All of the organization's users lose access immediately and are signed out.", "Documents, invoices, refunds, audit logs and other records are kept."],
};

function reset(over = {}) {
  for (const o of [sa, userSvc]) for (const k of Object.keys(o)) delete o[k];
  Object.assign(sa, {
    getOrganizations: async () => ({ organizations: [ORG], total: 1 }),
    getOrganizationDeletionImpact: async () => IMPACT,
    deleteOrganization: async () => ({ message: "Organization 'Acme Ltd' was deleted. It can be restored for 90 days." }),
    restoreOrganization: async () => ({ message: "Organization 'Old Co' was restored. Its users can sign in again." }),
    getUsers: async () => ({ users: [{ id: 7, first_name: "Olivia", last_name: "Owner", email: "olivia@example.com", role: "admin", is_active: true, status: "active", organization_id: 4, organization_name: "Acme Ltd" }], total: 1 }),
    mintConfirmationToken: async () => ({}),
  });
  Object.assign(userSvc, {
    getUsers: async () => ({ items: [], total: 0 }), createUser: async () => ({}), updateUser: async () => ({}), deactivateUser: async () => ({}),
    activateUser: async () => ({}), resetPassword: async () => ({}), suspendUser: async () => ({}), archiveUser: async () => ({}),
    hardDeleteUser: async () => ({}), getAssignableRoles: async () => ({ roles: [{ value: "admin", label: "Organization Admin", scope: "organization", description: "d" }] }),
  });
  Object.assign(sa, over);
}

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/superAdminService.js", {
    exports: { superAdminService: new Proxy({}, { get: (_, name) => (...a) => sa[name](...a) }) },
  });
  t.mock.module("../src/service/userService.js", {
    exports: Object.fromEntries(Object.keys(userSvc).map((n) => [n, (...a) => userSvc[n](...a)])),
  });
  t.mock.module("../src/service/billingService.js", { exports: { billingService: new Proxy({}, { get: () => async () => ({}) }) } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", {
    exports: { useNavigate: () => () => {}, useParams: () => ({ orgId: "4" }), Link: ({ to, children }) => React.createElement("a", { href: to }, children) },
  });
}

async function openOrganizations(t, over) {
  reset(over);
  register(t);
  const { default: Page } = await import("../src/modules/super-admin/OrganizationsPage.jsx");
  render(React.createElement(Page));
  await settle();
}

// ───────────────────────── the shared dialog ─────────────────────────

test("dialog shows users affected, subscription and effects, and needs the exact name", async (t) => {
  reset();
  register(t);
  const { default: Dialog } = await import("../src/components/DeleteOrganizationDialog.jsx");
  const sent = [];
  sa.deleteOrganization = async (id, body) => { sent.push([id, body]); return { message: "deleted" }; };
  let result;
  render(React.createElement(Dialog, { org: { id: 4, name: "Acme Ltd" }, onClose: () => {}, onDeleted: (r) => { result = r; } }));
  await settle();
  const dlg = screen.getByRole("dialog");
  assert.ok(within(dlg).getByText("Delete Acme Ltd?"));
  assert.ok(within(dlg).getByText(/will lose access/));
  assert.ok(within(dlg).getByText(/2 active/));
  assert.ok(within(dlg).getByText(/core/));
  assert.ok(within(dlg).getByText(/signed out/));
  const btn = within(dlg).getByRole("button", { name: "Delete organization" });
  assert.equal(btn.disabled, true);
  const input = within(dlg).getByLabelText("Type the organization name to confirm");
  fireEvent.change(input, { target: { value: "acme ltd" } });
  assert.equal(btn.disabled, true); // case matters
  fireEvent.change(input, { target: { value: "Acme Ltd" } });
  fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: "Contract ended" } });
  assert.equal(btn.disabled, false);
  fireEvent.click(btn);
  fireEvent.click(btn); // no double submission
  await settle();
  assert.deepEqual(sent, [[4, { confirm_name: "Acme Ltd", reason: "Contract ended" }]]);
  assert.equal(result.message, "deleted");
  cleanup();
});

test("dialog keeps open and shows the server error", async (t) => {
  reset({ deleteOrganization: async () => { throw new Error("This organization has already been deleted."); } });
  register(t);
  const { default: Dialog } = await import("../src/components/DeleteOrganizationDialog.jsx");
  render(React.createElement(Dialog, { org: { id: 4, name: "Acme Ltd" }, onClose: () => {}, onDeleted: () => { throw new Error("must not be called"); } }));
  await settle();
  fireEvent.change(screen.getByLabelText("Type the organization name to confirm"), { target: { value: "Acme Ltd" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
  await settle();
  assert.ok(within(screen.getByRole("dialog")).getByRole("alert").textContent.includes("already been deleted"));
  assert.equal(screen.getByRole("button", { name: "Delete organization" }).disabled, false);
  cleanup();
});

// ───────────────────────── Organizations page ─────────────────────────

test("Organizations: deleting goes through the dialog and the list reloads immediately", async (t) => {
  const listCalls = [];
  const deleted = [];
  let gone = false;
  await openOrganizations(t, {
    getOrganizations: async (p) => { listCalls.push(p); return gone ? { organizations: [], total: 0 } : { organizations: [ORG], total: 1 }; },
    deleteOrganization: async (id, body) => { deleted.push([id, body.confirm_name]); gone = true; return { message: "Organization 'Acme Ltd' was deleted." }; },
  });
  assert.equal(listCalls[0].deleted, "active"); // default view never shows deleted organizations
  assert.ok(screen.getByText("Acme Ltd"));
  fireEvent.click(screen.getAllByTitle("Delete organization")[0]);
  await settle();
  const dlg = screen.getByRole("dialog");
  fireEvent.change(within(dlg).getByLabelText("Type the organization name to confirm"), { target: { value: "Acme Ltd" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Delete organization" }));
  await settle();
  await settle();
  assert.deepEqual(deleted, [[4, "Acme Ltd"]]);
  assert.ok(listCalls.length >= 2, "list re-fetched after the delete");
  assert.equal(screen.queryByText("Acme Ltd", { selector: "div" }), null); // gone from the list
  assert.ok(screen.getByText(/was deleted/));
  assert.equal(screen.queryByRole("dialog"), null);
  cleanup();
});

test("Organizations: Deleted filter lists deleted orgs with a Deleted badge and Restore", async (t) => {
  const listCalls = [];
  const restored = [];
  await openOrganizations(t, {
    getOrganizations: async (p) => { listCalls.push(p); return p.deleted === "deleted" ? { organizations: [DELETED], total: 1 } : { organizations: [ORG], total: 1 }; },
    restoreOrganization: async (id) => { restored.push(id); return { message: "Organization 'Old Co' was restored." }; },
  });
  const toggle = () => within(screen.getByRole("group", { name: "Organization lifecycle" }));
  fireEvent.click(toggle().getByRole("button", { name: "Deleted" }));
  await settle();
  assert.equal(listCalls.at(-1).deleted, "deleted");
  const row = screen.getByTestId("deleted-org-9");
  assert.ok(within(row).getByText("Deleted"));
  assert.ok(within(row).getByText("Reason: Contract ended"));
  assert.equal(within(row).queryByTitle("Delete organization"), null); // no delete button on a deleted org
  fireEvent.click(within(row).getByRole("button", { name: "Restore" }));
  await settle();
  assert.deepEqual(restored, [9]);
  assert.ok(screen.getByText(/was restored/));
  fireEvent.click(toggle().getByRole("button", { name: "Active" }));
  await settle();
  assert.equal(listCalls.at(-1).deleted, "active");
  cleanup();
});

test("Organizations: empty Deleted view has an honest message", async (t) => {
  await openOrganizations(t, { getOrganizations: async (p) => ({ organizations: [], total: 0 }) });
  fireEvent.click(within(screen.getByRole("group", { name: "Organization lifecycle" })).getByRole("button", { name: "Deleted" }));
  await settle();
  assert.ok(screen.getByText("No organizations have been deleted."));
  cleanup();
});

// ───────────────────────── User Management entry point ─────────────────────────

test("User Management: Delete organization opens the same dialog and the list refreshes", async (t) => {
  reset();
  register(t);
  const userCalls = [];
  const deleted = [];
  sa.getUsers = async (p) => { userCalls.push(p); return { users: userCalls.length > 1 ? [] : [{ id: 7, first_name: "Olivia", last_name: "Owner", email: "olivia@example.com", role: "admin", is_active: true, status: "active", organization_id: 4, organization_name: "Acme Ltd" }], total: 1 }; };
  sa.deleteOrganization = async (id, body) => { deleted.push([id, body.confirm_name]); return { message: "Organization 'Acme Ltd' was deleted." }; };
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();
  assert.ok(screen.getByText("Olivia Owner"));
  fireEvent.click(screen.getAllByTitle("Delete organization")[0]);
  await settle();
  assert.ok(screen.getByText("Delete Acme Ltd?"));
  const dlg = screen.getByRole("dialog", { name: "Delete organization" });
  fireEvent.change(within(dlg).getByLabelText("Type the organization name to confirm"), { target: { value: "Acme Ltd" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Delete organization" }));
  await settle();
  await settle();
  assert.deepEqual(deleted, [[4, "Acme Ltd"]]);
  assert.ok(userCalls.length >= 2, "user list re-fetched after the organization delete");
  assert.equal(screen.queryByText("Olivia Owner"), null);
  cleanup();
});

// ───────────────────────── one path, no leftovers ─────────────────────────

test("no page uses the old hard-delete confirmation-token flow any more", () => {
  for (const f of ["src/modules/super-admin/OrganizationsPage.jsx", "src/modules/super-admin/OrganizationDetailPage.jsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /"delete_organization"/, f);
    assert.match(src, /DeleteOrganizationDialog/, f);
  }
  const svc = fs.readFileSync("src/service/superAdminService.js", "utf8");
  const del = svc.slice(svc.indexOf("deleteOrganization:"), svc.indexOf("restoreOrganization:"));
  assert.doesNotMatch(del, /headers|X-Confirmation/);
  assert.match(del, /body:/);
  assert.match(svc, /restoreOrganization/);
});
