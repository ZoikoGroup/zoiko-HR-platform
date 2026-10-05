/**
 * ZHR-30/31/32 frontend: User Management (roles from API, reset dialog),
 * forced password change, and the Expenses page.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";

const userSvc = {};
const saSvc = {};
const authSvc = {};
const expSvc = {};
const navCalls = [];
const orgSvc = {};
const auth = { user: { id: 1, email: "root@example.com", role: "super_admin" }, role: "super_admin", isAuthenticated: true };
const mocked = new WeakSet();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });

const ROLES = [
  { value: "super_admin", label: "Super Admin", scope: "platform", description: "Platform-wide access." },
  { value: "admin", label: "Organization Admin", scope: "organization", description: "Full control of one organization." },
  { value: "hr_admin", label: "HR Admin", scope: "organization", description: "Manages HR data." },
  { value: "billing_admin", label: "Billing Admin", scope: "organization", description: "Manages billing." },
  { value: "manager", label: "Manager", scope: "organization", description: "Leads a team." },
  { value: "employee", label: "Employee", scope: "organization", description: "Self-service access." },
];
const USER = { id: 7, first_name: "Bob", last_name: "Brown", email: "bob@example.com", role: "employee", is_active: true, status: "active", organization_name: "Globex Inc", organization_id: 2 };

function reset(overrides = {}) {
  for (const o of [userSvc, saSvc, authSvc, expSvc, orgSvc]) for (const k of Object.keys(o)) delete o[k];
  Object.assign(userSvc, {
    getUsers: async () => ({ items: [], total: 0 }), createUser: async () => ({ message: "ok", temporary_password: null }),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}),
    resetPassword: async () => ({ message: "sent", temporary_password: null }),
    suspendUser: async () => ({}), archiveUser: async () => ({}), hardDeleteUser: async () => ({}),
    getAssignableRoles: async () => ({ roles: ROLES }),
  });
  Object.assign(saSvc, {
    getUsers: async () => ({ users: [USER], total: 1 }),
    getOrganizations: async () => ({ organizations: [{ id: 2, name: "Globex Inc" }] }),
    createOrganization: async () => ({ organization_id: 9, organization_name: "X", temporary_password: "x" }),
    mintConfirmationToken: async () => ({ confirmation_id: 1, token: "t" }), updateOrganizationStatus: async () => ({}),
    reactivateOrganization: async () => ({}), getOrganizationDeletionImpact: async () => ({}), deleteOrganization: async () => ({}),
  });
  Object.assign(authSvc, { changePassword: async () => ({}), fetchCurrentUser: async () => ({ id: 1, mustChangePassword: false }) });
  Object.assign(orgSvc, { getOrganizations: async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }, { id: 2, name: "Globex Inc" }] }) });
  Object.assign(expSvc, {
    claims: async () => ({ claims: [], total: 0 }), claim: async () => ({}), summary: async () => ({ totals: {}, counts: {}, claim_count: 0 }),
    byOrganization: async () => ({ organizations: [] }),
    categories: async () => ({ categories: [] }), budgets: async () => ({ budgets: [] }), createBudget: async () => ({}), archiveBudget: async () => ({}),
  });
  Object.assign(auth, { user: { id: 1, email: "root@example.com", role: "super_admin" }, role: "super_admin", isAuthenticated: true });
  const targets = { userSvc, saSvc, authSvc, expSvc, orgSvc };
  for (const [name, o] of Object.entries(overrides)) Object.assign(targets[name], o);
}

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrapAll = (target, names) => Object.fromEntries(names.map((n) => [n, (...a) => target[n](...a)]));
  t.mock.module("../src/service/userService.js", { exports: wrapAll(userSvc, Object.keys(userSvc)) });
  t.mock.module("../src/service/superAdminService.js", { exports: { superAdminService: wrapAll(saSvc, Object.keys(saSvc)) } });
  t.mock.module("../src/service/expensesService.js", {
    exports: {
      expensesService: wrapAll(expSvc, Object.keys(expSvc)),
      formatMoney: (a, c) => `${c} ${Number(a).toFixed(2)}`,
    },
  });
  t.mock.module("../src/service/documentsService.js", { exports: { getOrganizations: (...a) => orgSvc.getOrganizations(...a) } });
  t.mock.module("../src/service/authService.js", { exports: wrapAll(authSvc, Object.keys(authSvc)) });
  t.mock.module("../src/service/api.js", { exports: { getAccessToken: () => "a", getRefreshToken: () => "r", setSession: () => {}, api: {}, API_BASE_URL: "" } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", {
    exports: { useNavigate: () => (...a) => navCalls.push(a), Navigate: ({ to }) => React.createElement("div", { "data-testid": "redirect" }, to), Link: ({ to, children }) => React.createElement("a", { href: to }, children) },
  });
}

async function openUsers(t, overrides) {
  reset(overrides);
  register(t);
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();
  // A super admin picks an organization first; its users are listed after that.
  const open = screen.queryByRole("button", { name: /^Open Globex Inc$/ });
  if (open) { fireEvent.click(open); await settle(); await settle(); }
}

// ───────────────────────── ZHR-32 ─────────────────────────

test("Create User offers every role from the API, with descriptions, and a role filter", async (t) => {
  await openUsers(t);
  const filter = screen.getByDisplayValue("All Roles");
  assert.deepEqual([...within(filter).getAllByRole("option")].map((o) => o.textContent), ["All Roles", ...ROLES.map((r) => r.label)]);
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  const select = screen.getByText("Role", { selector: "label" }).parentElement.querySelector("select");
  assert.deepEqual([...select.options].map((o) => o.value), ROLES.map((r) => r.value));
  assert.equal(select.value, "employee");
  assert.ok(screen.getByText("Self-service access."));
  cleanup();
});

test("organization roles require an organization; Super Admin requires confirmation and no organization", async (t) => {
  let created;
  await openUsers(t, { userSvc: { createUser: async (p) => { created = p; return { message: "created", temporary_password: "Temp12345678" }; } } });
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  const dlg = () => document.querySelector("form");
  const roleSelect = () => within(dlg()).getByText("Role", { selector: "label" }).parentElement.querySelector("select");
  const fill = () => {
    const [first, last] = dlg().querySelectorAll('input[type="text"]');
    fireEvent.change(first, { target: { value: "New" } });
    fireEvent.change(last, { target: { value: "Person" } });
    fireEvent.change(dlg().querySelector('input[type="email"]'), { target: { value: "new@example.com" } });
  };
  fill();
  fireEvent.change(roleSelect(), { target: { value: "manager" } });
  assert.ok(within(dlg()).getByText(/^Organization/, { selector: "label" }));
  const orgSelect = () => within(dlg()).getByText(/^Organization/, { selector: "label" }).parentElement.querySelector("select");
  assert.equal(orgSelect().value, "2"); // the organization being viewed is preselected
  fireEvent.change(orgSelect(), { target: { value: "" } });
  fireEvent.click(within(dlg()).getByRole("button", { name: "Create User" }));
  await settle();
  assert.ok(screen.getByText("Select an organization for this role"));
  assert.equal(created, undefined);
  fireEvent.change(within(dlg()).getByText(/^Organization/, { selector: "label" }).parentElement.querySelector("select"), { target: { value: "2" } });
  fireEvent.click(within(dlg()).getByRole("button", { name: "Create User" }));
  await settle();
  assert.deepEqual([created.role, created.organization_id, created.confirm_super_admin], ["manager", 2, undefined]);
  assert.ok(screen.getByText("Temporary Password")); // shown once, masked by default
  fireEvent.click(screen.getByRole("button", { name: "Done" }));

  created = undefined;
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  fill();
  fireEvent.change(roleSelect(), { target: { value: "super_admin" } });
  assert.equal(within(dlg()).queryByText(/^Organization/, { selector: "label" }), null); // no org for a platform role
  fireEvent.click(within(dlg()).getByRole("button", { name: "Create User" }));
  await settle();
  assert.ok(screen.getByText(/Confirm that this person should get full platform access/));
  assert.equal(created, undefined);
  fireEvent.click(within(dlg()).getByRole("checkbox"));
  fireEvent.click(within(dlg()).getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(created.role, "super_admin");
  assert.equal(created.confirm_super_admin, true);
  assert.equal(created.organization_id, undefined);
  cleanup();
});

test("server validation errors are shown inside the Create User dialog", async (t) => {
  await openUsers(t, { userSvc: { createUser: async () => { throw new Error("Select an organization: this role belongs to a specific organization."); } } });
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  const form = document.querySelector("form");
  const [first, last] = form.querySelectorAll('input[type="text"]');
  fireEvent.change(first, { target: { value: "A" } });
  fireEvent.change(last, { target: { value: "B" } });
  fireEvent.change(form.querySelector('input[type="email"]'), { target: { value: "a@example.com" } });
  fireEvent.change(within(form).getByText(/^Organization/, { selector: "label" }).parentElement.querySelector("select"), { target: { value: "2" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create User" }));
  await waitFor(() => screen.getByText(/this role belongs to a specific organization/));
  assert.ok(document.querySelector("form"));
  cleanup();
});

test("super admin sees users of every role, not only Organization Admins", async (t) => {
  const calls = [];
  await openUsers(t, { saSvc: { getUsers: async (p) => { calls.push(p); return { users: [USER], total: 1 }; } } });
  assert.equal(calls[0].role, undefined); // no hardcoded role filter any more
  assert.ok(screen.getByText("Bob Brown"));
  assert.ok(screen.getAllByText("Employee").length >= 1);
  fireEvent.change(screen.getByDisplayValue("All Roles"), { target: { value: "manager" } });
  await settle();
  assert.equal(calls.at(-1).role, "manager");
  cleanup();
});

// ───────────────────────── ZHR-31 ─────────────────────────

test("reset dialog shows the user, defaults to email link, and reports success", async (t) => {
  const calls = [];
  await openUsers(t, { userSvc: { resetPassword: async (id, m) => { calls.push([id, m]); return { message: "Reset link sent", temporary_password: null, method: "link" }; } } });
  fireEvent.click(screen.getByTitle("Reset password"));
  const dlg = screen.getByRole("dialog");
  assert.ok(within(dlg).getByText(/Bob Brown/) && within(dlg).getByText("bob@example.com"));
  assert.equal(within(dlg).getAllByRole("radio")[0].checked, true);
  fireEvent.click(within(dlg).getByRole("button", { name: "Send reset link" }));
  await settle();
  assert.deepEqual(calls, [[7, "link"]]);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(screen.getByText("Reset link sent to bob@example.com."));
  cleanup();
});

test("email failure is shown inside the dialog and the button works again; no double submit", async (t) => {
  let n = 0;
  let release;
  await openUsers(t, { userSvc: { resetPassword: () => { n += 1; return new Promise((_, rej) => { release = () => rej(new Error("Email could not be sent: SMTP authentication rejected")); }); } } });
  fireEvent.click(screen.getByTitle("Reset password"));
  const dlg = screen.getByRole("dialog");
  const btn = within(dlg).getByRole("button", { name: "Send reset link" });
  fireEvent.click(btn);
  fireEvent.click(btn);
  await settle();
  assert.equal(n, 1);
  assert.equal(within(dlg).getByRole("button", { name: "Working…" }).disabled, true);
  await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); });
  assert.ok(within(dlg).getByRole("alert").textContent.includes("Email could not be sent: SMTP authentication rejected"));
  assert.equal(within(dlg).getByRole("button", { name: "Send reset link" }).disabled, false);
  cleanup();
});

test("temporary password is shown once with a copy button", async (t) => {
  const calls = [];
  await openUsers(t, { userSvc: { resetPassword: async (id, m) => { calls.push(m); return { message: "set", temporary_password: "Tmp-Secret-99", method: "temporary" }; } } });
  fireEvent.click(screen.getByTitle("Reset password"));
  const dlg = screen.getByRole("dialog");
  fireEvent.click(within(dlg).getAllByRole("radio")[1]);
  fireEvent.click(within(dlg).getByRole("button", { name: "Set temporary password" }));
  await settle();
  assert.deepEqual(calls, ["temporary"]);
  assert.ok(screen.getByText("Temporary Password"));
  assert.ok(screen.getByText(/must change it at next sign-in/));
  assert.ok(screen.getByRole("button", { name: "Copy" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  assert.equal(screen.queryByText("Temporary Password"), null);
  assert.equal(document.body.textContent.includes("Tmp-Secret-99"), false);
  cleanup();
});

test("you cannot reset your own password from the list", async (t) => {
  reset({ userSvc: { getUsers: async () => ({ items: [{ ...USER, id: 99 }], total: 1 }) } });
  register(t);
  auth.user = { id: 99, email: "bob@example.com", role: "admin" };
  auth.role = "admin";
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();
  assert.equal(screen.getByTitle("Use account settings to change your own password").disabled, true);
  cleanup();
});

test("forced password change page validates and submits", async (t) => {
  reset();
  register(t);
  const calls = [];
  authSvc.changePassword = async (p) => { calls.push(p); return {}; };
  const { default: Page, passwordProblem } = await import("../src/pages/auth/ChangePasswordPage.jsx");
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("lettersonly"));
  assert.equal(passwordProblem("GoodPass1"), null);
  render(React.createElement(Page));
  const fields = document.querySelectorAll('input[type="password"]');
  fireEvent.change(fields[0], { target: { value: "Temp-old-1" } });
  fireEvent.change(fields[1], { target: { value: "weak" } });
  fireEvent.change(fields[2], { target: { value: "weak" } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  assert.ok(screen.getByRole("alert").textContent.includes("At least 8 characters"));
  fireEvent.change(fields[1], { target: { value: "GoodPass1" } });
  fireEvent.change(fields[2], { target: { value: "Different1" } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  assert.ok(screen.getByRole("alert").textContent.includes("do not match"));
  assert.equal(calls.length, 0);
  cleanup();
});

// ───────────────────────── ZHR-30 ─────────────────────────

const CLAIM = { id: 3, organization_name: "Globex Inc", employee_name: "Bob Brown", category: "Travel", amount: "340.50", currency: "USD", status: "approved", submitted_at: "2026-09-29T10:00:00Z", has_receipt: true };

test("Expenses shows real claims, per-currency totals, and honest empty states", async (t) => {
  reset();
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/ExpensesPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("No expense claims in this period."));
  assert.ok(screen.getByText("No expense claims yet."));
  assert.ok(screen.getByText("No budgets configured."));
  for (const fake of ["Marcus Thorne", "Cloud Server Hosting", "$12,400"]) assert.equal(screen.queryByText(fake), null);
  cleanup();

  reset({
    expSvc: {
      claims: async () => ({ claims: [CLAIM], total: 1 }),
      summary: async () => ({ totals: { USD: { claimed: "340.50", pending: "0.00", approved: "340.50", paid: "0.00", rejected: "0.00" }, EUR: { claimed: "10.00", pending: "10.00", approved: "0.00", paid: "0.00", rejected: "0.00" } }, counts: {}, claim_count: 2 }),
      budgets: async () => ({ budgets: [{ id: 1, name: "Travel Q3", organization_name: "Globex Inc", category: "Travel", period_start: "2026-07-01", period_end: "2026-09-30", currency: "USD", allocated: "1000.00", spent: "1200.00", remaining: "-200.00", utilization_pct: 120, over_budget: true }] }),
    },
  });
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Bob Brown"));
  assert.ok(screen.getByText("USD 340.50", { selector: "td" }));
  assert.equal(screen.getAllByLabelText(/^Totals in/).length, 2); // one row of cards per currency
  assert.ok(screen.getByText(/never added across currencies/));
  assert.ok(screen.getByText("Over budget"));
  assert.equal(screen.getByRole("progressbar").getAttribute("aria-valuenow"), "100");
  assert.ok(screen.getByText(/Over by/));
  cleanup();
});

test("Expenses sections fail and retry independently; filters reach the API", async (t) => {
  reset();
  register(t);
  const claimCalls = [];
  let budgetsFail = true;
  expSvc.claims = async (p) => { claimCalls.push(p); return { claims: [CLAIM], total: 1 }; };
  expSvc.budgets = async () => { if (budgetsFail) throw new Error("boom"); return { budgets: [] }; };
  const { default: Page } = await import("../src/modules/shared-layers/ExpensesPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Bob Brown")); // claims fine
  assert.ok(screen.getByText("Budgets: boom")); // budgets failed on their own
  budgetsFail = false;
  fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
  await settle();
  assert.ok(screen.getByText("No budgets configured."));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
  fireEvent.change(screen.getByLabelText("Minimum amount"), { target: { value: "50" } });
  await settle();
  assert.equal(claimCalls.at(-1).status, "pending");
  assert.equal(claimCalls.at(-1).min_amount, "50");
  assert.equal(claimCalls.at(-1).page, 1);
  cleanup();
});

test("Expenses is super-admin only", async (t) => {
  reset();
  register(t);
  auth.user = { role: "admin" };
  auth.role = "admin";
  const { default: Page } = await import("../src/modules/shared-layers/ExpensesPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText(/super admins only/));
  cleanup();
});

test("Expenses shows each organization separately, including ones with no claims, and selecting one filters the claims", async (t) => {
  const claimCalls = [];
  reset({
    expSvc: {
      claims: async (p) => { claimCalls.push(p); return { claims: [CLAIM], total: 1 }; },
      byOrganization: async () => ({
        organizations: [
          { organization_id: 1, organization_name: "Acme Ltd", claim_count: 3, counts: {}, totals: { USD: { claimed: "150.00", pending: "100.00", approved: "50.00", paid: "0.00", rejected: "0.00" }, EUR: { claimed: "20.00", pending: "0.00", approved: "20.00", paid: "0.00", rejected: "0.00" } } },
          { organization_id: 2, organization_name: "Globex Inc", claim_count: 1, counts: {}, totals: { USD: { claimed: "400.00", pending: "0.00", approved: "0.00", paid: "400.00", rejected: "0.00" } } },
          { organization_id: 3, organization_name: "Initech", claim_count: 0, counts: {}, totals: {} },
        ],
      }),
    },
  });
  register(t);
  const { default: Page } = await import("../src/modules/shared-layers/ExpensesPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.ok(screen.getByText("Expenses by Organization (3)"));
  const acme = within(screen.getByRole("button", { name: "Acme Ltd expenses" }));
  assert.ok(acme.getByText("3 claims") && acme.getByText("USD 150.00"));
  assert.equal(screen.getAllByLabelText(/^Acme Ltd totals in/).length, 2); // per-currency blocks, never merged
  assert.ok(within(screen.getByRole("button", { name: "Initech expenses" })).getByText(/No expense claims yet/));
  assert.equal(within(screen.getByRole("button", { name: "Globex Inc expenses" })).getAllByText("USD 400.00", { selector: "dd" }).length, 2); // claimed + paid

  fireEvent.click(screen.getByRole("button", { name: "Globex Inc expenses" }));
  await settle();
  assert.equal(claimCalls.at(-1).organization_id, "2");
  assert.equal(screen.getByRole("button", { name: "Globex Inc expenses" }).getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: "Show all organizations" }));
  await settle();
  assert.equal(claimCalls.at(-1).organization_id, undefined);
  cleanup();
});

test("when email is unavailable the dialog offers the temporary-password route in one click", async (t) => {
  const calls = [];
  await openUsers(t, { userSvc: { resetPassword: async (id, m) => {
    calls.push(m);
    if (m === "link") throw new Error("Email could not be sent: SMTP authentication rejected");
    return { message: "set", temporary_password: "Tmp-Secret-99", method: "temporary" };
  } } });
  fireEvent.click(screen.getByTitle("Reset password"));
  const dlg = screen.getByRole("dialog");
  fireEvent.click(within(dlg).getByRole("button", { name: "Send reset link" }));
  await settle();
  fireEvent.click(within(dlg).getByRole("button", { name: /set a temporary password instead/ }));
  assert.equal(within(dlg).getAllByRole("radio")[1].checked, true);
  fireEvent.click(within(dlg).getByRole("button", { name: "Set temporary password" }));
  await settle();
  assert.deepEqual(calls, ["link", "temporary"]);
  assert.ok(screen.getByText("Temporary Password"));
  cleanup();
});

test("secondary row actions live in a More menu so the table never needs horizontal scrolling", async (t) => {
  await openUsers(t);
  assert.equal(screen.queryByRole("menuitem"), null);
  fireEvent.click(screen.getAllByRole("button", { name: /^More actions for/ })[0]);
  const names = screen.getAllByRole("menuitem").map((m) => m.textContent.trim());
  assert.ok(["Deactivate", "Suspend", "Archive", "Delete user"].every((n) => names.includes(n)), names.join());
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("menuitem"), null);
  assert.equal(document.querySelector(".overflow-x-auto"), null);
  cleanup();
});

test("super admin can create an organization from User Management and gets the admin's one-time password", async (t) => {
  const created = [];
  let orgCalls = 0;
  await openUsers(t, { saSvc: {
    getOrganizations: async () => { orgCalls += 1; return { organizations: [{ id: 2, name: "Globex Inc" }] }; },
    createOrganization: async (b) => {
      created.push(b);
      return { message: "Organization 'Initech Corp' was created.", organization_id: 9, organization_name: "Initech Corp", admin_email: "olivia@example.com", temporary_password: "Org-Temp-77" };
    },
  } });
  fireEvent.click(screen.getByRole("button", { name: /Add Organization/ }));
  const dlg = screen.getByRole("dialog", { name: "Create organization" });
  fireEvent.change(within(dlg).getByLabelText(/Organization name/), { target: { value: "Initech Corp" } });
  fireEvent.change(within(dlg).getByLabelText(/Admin name/), { target: { value: "Olivia Owner" } });
  fireEvent.change(within(dlg).getByLabelText(/Admin email/), { target: { value: "olivia@example.com" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Create organization" }));
  await settle();
  assert.equal(created.length, 1);
  assert.deepEqual([created[0].organization, created[0].admin_name, created[0].admin_email, created[0].plan_code],
    ["Initech Corp", "Olivia Owner", "olivia@example.com", "core"]);
  assert.equal(created[0].industry, undefined); // blank optional fields are not sent
  assert.ok(screen.getByText("Temporary Password")); // shown once
  assert.ok(orgCalls >= 2); // organization list refreshed
  assert.equal(screen.queryByRole("dialog", { name: "Create organization" }), null);
  cleanup();
});

test("organization creation errors stay in the dialog; non-super-admins do not see the button", async (t) => {
  await openUsers(t, { saSvc: { createOrganization: async () => { throw new Error("An organization named 'Initech Corp' already exists."); } } });
  fireEvent.click(screen.getByRole("button", { name: /Add Organization/ }));
  const dlg = screen.getByRole("dialog", { name: "Create organization" });
  fireEvent.change(within(dlg).getByLabelText(/Organization name/), { target: { value: "Initech Corp" } });
  fireEvent.change(within(dlg).getByLabelText(/Admin name/), { target: { value: "O O" } });
  fireEvent.change(within(dlg).getByLabelText(/Admin email/), { target: { value: "o@example.com" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Create organization" }));
  await settle();
  assert.ok(within(dlg).getByRole("alert").textContent.includes("already exists"));
  assert.equal(within(dlg).getByRole("button", { name: "Create organization" }).disabled, false);
  cleanup();

  reset({ userSvc: { getUsers: async () => ({ items: [USER], total: 1 }) } });
  register(t);
  auth.user = { id: 99, email: "a@example.com", role: "admin" };
  auth.role = "admin";
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  assert.equal(screen.queryByRole("button", { name: /Add Organization/ }), null);
  cleanup();
});

test("super admin sees organizations first and a user list only after opening one", async (t) => {
  const calls = [];
  reset({ saSvc: {
    getOrganizations: async () => ({ organizations: [
      { id: 2, name: "Globex Inc", organization_code: "GLX001", status: "active", user_count: 5, active_employees: 4, admin_name: "Gina Lopez", admin_email: "gina@example.com" },
      { id: 3, name: "Initech", organization_code: "INI001", status: "active", user_count: 0, active_employees: 0 },
    ], total: 2 }),
    getUsers: async (p) => { calls.push(p); return { users: [USER], total: 1 }; },
  } });
  register(t);
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();
  assert.equal(calls.length, 0); // no cross-organization user list
  assert.equal(screen.queryByText("Bob Brown"), null);
  const globex = within(screen.getByRole("button", { name: "Open Globex Inc" }));
  assert.ok(globex.getByText("5") && globex.getByText("4") && globex.getByText(/Admin: Gina Lopez/));
  fireEvent.change(screen.getByLabelText("Search organizations"), { target: { value: "initech" } });
  assert.equal(screen.queryByRole("button", { name: "Open Globex Inc" }), null);
  fireEvent.change(screen.getByLabelText("Search organizations"), { target: { value: "" } });

  fireEvent.click(screen.getByRole("button", { name: "Open Globex Inc" }));
  await settle();
  await settle();
  assert.equal(calls.at(-1).organization_id, 2); // scoped to the opened organization
  assert.ok(screen.getByText("Bob Brown"));
  assert.ok(screen.getByRole("navigation", { name: "Breadcrumb" }));
  assert.equal(screen.queryByText("Organization", { selector: "th" }), null); // redundant inside one organization

  fireEvent.click(screen.getByRole("button", { name: "All organizations" }));
  await settle();
  assert.equal(screen.queryByText("Bob Brown"), null);
  assert.ok(screen.getByRole("button", { name: "Open Initech" }));
  cleanup();
});

test("Back goes to the previous page, or to the organization list when inside an organization", async (t) => {
  navCalls.length = 0;
  reset();
  register(t);
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Back to previous page" }));
  assert.deepEqual(navCalls, [[-1]]);

  fireEvent.click(screen.getByRole("button", { name: "Open Globex Inc" }));
  await settle();
  await settle();
  assert.ok(screen.getByText("Bob Brown"));
  fireEvent.click(screen.getByRole("button", { name: "Back to all organizations" }));
  await settle();
  assert.equal(screen.queryByText("Bob Brown"), null);
  assert.ok(screen.getByRole("button", { name: "Open Globex Inc" }));
  assert.equal(navCalls.length, 1); // inside an organization, Back did not leave the page
  cleanup();
});

test("organization cards: suspend, reactivate, reset the admin's password and delete", async (t) => {
  const calls = [];
  let status = "active";
  reset({
    saSvc: {
      getOrganizations: async () => ({ organizations: [{ id: 2, name: "Globex Inc", organization_code: "GLX001", status, user_count: 1, active_employees: 1 }], total: 1 }),
      mintConfirmationToken: async (id, purpose) => { calls.push(["mint", id, purpose]); return { confirmation_id: 11, token: "tok" }; },
      updateOrganizationStatus: async (id, b) => { calls.push(["status", id, b.status, b.confirmation_id, b.confirmation_token]); status = b.status; return {}; },
      reactivateOrganization: async (id) => { calls.push(["reactivate", id]); status = "active"; return {}; },
      getOrganizationDeletionImpact: async () => ({ organization_id: 2, name: "Globex Inc", users_total: 1, users_active: 1, restore_window_days: 90, subscription: null, effects: [] }),
      getUsers: async (p) => { calls.push(["admins", p.organization_id, p.role]); return { users: [{ id: 21, first_name: "Gina", last_name: "Lopez", email: "gina@example.com", role: "admin", is_active: true, organization_id: 2 }], total: 1 }; },
    },
    userSvc: { resetPassword: async (id, m) => { calls.push(["reset", id, m]); return { message: "sent", temporary_password: null }; } },
  });
  register(t);
  const { default: Page } = await import("../src/modules/settings/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  await settle();

  // suspend needs a confirmation, then goes through the confirmation-token flow
  fireEvent.click(screen.getByRole("button", { name: "Suspend Globex Inc" }));
  assert.deepEqual(calls, []);
  fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
  await settle();
  assert.deepEqual(calls.slice(0, 2), [["mint", 2, "update_organization_status"], ["status", 2, "suspended", 11, "tok"]]);
  assert.ok(screen.getByRole("button", { name: "Reactivate Globex Inc" })); // card reflects the new status

  fireEvent.click(screen.getByRole("button", { name: "Reactivate Globex Inc" }));
  fireEvent.click(screen.getByRole("button", { name: "Reactivate", exact: true }));
  await settle();
  assert.deepEqual(calls.at(-1), ["reactivate", 2]);
  assert.ok(screen.getByRole("button", { name: "Suspend Globex Inc" }));

  // reset: finds the organization admin, then uses the normal reset dialog
  fireEvent.click(screen.getByRole("button", { name: "Reset admin password for Globex Inc" }));
  await settle();
  assert.deepEqual(calls.at(-1), ["admins", 2, "admin"]);
  const dlg = screen.getByRole("dialog", { name: "Reset password" });
  assert.ok(within(dlg).getByText(/gina@example.com/));
  fireEvent.click(within(dlg).getByRole("button", { name: "Send reset link" }));
  await settle();
  assert.deepEqual(calls.at(-1), ["reset", 21, "link"]);

  // delete opens the shared deletion dialog
  fireEvent.click(screen.getByRole("button", { name: "Delete Globex Inc" }));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: "Delete organization" }));
  cleanup();
});
