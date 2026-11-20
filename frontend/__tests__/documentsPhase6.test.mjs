/**
 * Documents Phase 6 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 D1–D4, A6 templates): the employee portal tabs with badges and the
 * signatory tab only for signatories, Documents to Action chips, Company Documents with read-confirmation and view-only
 * files, and the organization's own notification wording.
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

const impl = {};
const mocked = new WeakSet();
function mockAll(t, over = {}) {
  const calls = { ack: [], save: [], revert: [], preview: [], retention: [], keep: [] };
  Object.assign(impl, {
    getMyDocumentCounts: async () => ({}),
    getMyCompanyDocuments: async () => ({ total: 2, groups: [{ category: { id: 1, key: "company_policies", name: "Company Policies" }, items: [
      { id: 10, title: "Code of conduct", version_id: 21, can_download: false, require_ack: true, needs_ack: true, acknowledged_at: null, updated_at: "2026-11-01T00:00:00Z" },
      { id: 11, title: "Travel policy", version_id: 31, can_download: true, require_ack: false, needs_ack: false, acknowledged_at: null },
    ] }] }),
    acknowledgeCompanyDocument: async (id, v) => { calls.ack.push([id, v]); return { acknowledged_at: "2026-11-19T10:00:00Z", round: 1 }; },
    listNotificationTemplates: async () => ({ variables: { first_name: "First name", title: "Document" }, items: [
      { key: "document.approved", default_subject: "Document approved", default_body: "Your “{{title}}” has been approved.", overrides: { email: null, in_app: null } },
      { key: "document.rejected", default_subject: "Document not approved", default_body: "Not approved.", overrides: { email: { subject: "S", body: "B" }, in_app: null } },
    ] }),
    saveNotificationTemplate: async (v) => { calls.save.push(v); return v; },
    revertNotificationTemplate: async (v) => { calls.revert.push(v); return null; },
    previewNotificationTemplate: async (v) => { calls.preview.push(v); return { subject: "Hi Asha", body: "Passport ok" }; },
    listRetentionPolicies: async () => ({ can_delete: false, clocks: [], actions: [], items: [
      { scope: "employee", key: "identity_proof", name: "Identity Proof", policy: null },
      { scope: "company", key: "company_policies", name: "Company Policies", policy: { retain_years: 5, clock: "from_upload", action: "archive", review_days: 30 } },
    ] }),
    saveRetentionPolicy: async (v) => { calls.retention.push(v); return {}; },
    deleteRetentionPolicy: async (v) => { calls.keep.push(v); return null; },
    getAutomationCatalog: async () => ({ events: [], fields: [], operators: [], actions: [], limits: {} }),
    listAutomationRules: async () => [], createAutomationRule: async () => ({}), updateAutomationRule: async () => ({}),
    deleteAutomationRule: async () => null, setAutomationRuleStatus: async () => ({}), dryRunAutomationRule: async () => ({}),
    listAutomationRuns: async () => ({ items: [], total: 0, page: 1, per_page: 50 }), getAutomationRun: async () => ({}),
    retryAutomationRun: async () => ({}), getAutomationSettings: async () => ({}), saveAutomationSettings: async () => ({}),
    getMyDocumentActions: async () => ({ overdue: 1, items: [
      { kind: "document", document_id: 5, title: "Offer letter", action: "sign", due_by: null, overdue: false, link: "/x" },
      { kind: "task.acknowledge", id: 7, task_id: 7, document_id: 10, title: "Read and confirm Code of conduct", action: "acknowledge", overdue: false, link: "/y" },
      { kind: "task.upload_required", id: 8, task_id: 8, title: "Upload your Address Proof", action: "upload", due_by: "2026-11-10T00:00:00Z", overdue: true, link: "/z" },
      { kind: "self_assessment", id: 9, title: "Self-assessment", action: "complete", overdue: false, link: "/p" },
    ] }),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    const fwd = (names) => Object.fromEntries(names.map((k) => [k, (...a) => impl[k](...a)]));
    t.mock.module("../src/service/documentsService.js", { exports: fwd(["getMyDocumentCounts", "getMyCompanyDocuments", "acknowledgeCompanyDocument",
      "listNotificationTemplates", "saveNotificationTemplate", "revertNotificationTemplate", "previewNotificationTemplate",
      "listRetentionPolicies", "saveRetentionPolicy", "deleteRetentionPolicy",
      "getAutomationCatalog", "listAutomationRules", "createAutomationRule", "updateAutomationRule", "deleteAutomationRule",
      "setAutomationRuleStatus", "dryRunAutomationRule", "listAutomationRuns", "getAutomationRun", "retryAutomationRun",
      "getAutomationSettings", "saveAutomationSettings"]) });
    t.mock.module("../src/service/goLiveService.js", { exports: fwd(["getMyDocumentActions"]) });
    t.mock.module("../src/hooks/useDocumentFile.js", { exports: { useDocumentFile: () => ({ preview: null, busyId: null, busyAction: null, fileError: null,
      view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {} }) } });
    t.mock.module("../src/components/documents/IssuedDocumentsSection.jsx", { exports: {
      default: ({ onLoadingChange }) => { React.useEffect(() => { onLoadingChange?.(false); }, [onLoadingChange]); return null; } } });
  }
  return calls;
}

async function renderPage(path, { query = false, tab } = {}) {
  const { default: Page } = await import(`${path}?t=${Math.random()}`);
  let tree = h(MemoryRouter, null, h(Page));
  if (query) tree = h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } }) }, tree);
  render(tree);
  await settle();
  if (tab) { fireEvent.click(screen.getByRole("tab", { name: tab })); await settle(); }
}

test("tab badges show counts and the signatory tab is only for signatories", async (t) => {
  mockAll(t);
  const { employeeDocumentTabs } = await import(`../src/modules/zoiko-hr/documents/ui.jsx?t=${Math.random()}`);
  const notSignatory = employeeDocumentTabs({ to_action: 3, company_needs_ack: 1, policies_pending: 0, my_files_attention: 2, signatory_queue: null });
  assert.equal(notSignatory.some((i) => i.href.endsWith("/signatory-queue")), false);
  assert.equal(notSignatory.find((i) => i.href.endsWith("/to-action")).count, 3);
  assert.equal(notSignatory.find((i) => i.href.endsWith("/my-files")).count, 2);
  const signatory = employeeDocumentTabs({ signatory_queue: 4 });
  assert.equal(signatory.find((i) => i.href.endsWith("/signatory-queue")).count, 4);
  // before the counts arrive every tab is shown, without badges
  assert.ok(employeeDocumentTabs(null).some((i) => i.href.endsWith("/signatory-queue")));
});

test("Documents to Action filters by chip and shows uploads HR asked for", async (t) => {
  mockAll(t);
  await renderPage("../src/pages/Peoples/Employees/Documents/Employee_DocumentsToAction.jsx");
  assert.ok(screen.getByRole("tab", { name: "All (4)" }));
  assert.ok(screen.getByText("1 overdue"));
  fireEvent.click(screen.getByRole("tab", { name: "Upload (1)" }));
  const list = screen.getByRole("list", { name: "Documents to action" });
  assert.deepEqual(within(list).getAllByRole("listitem").map((li) => li.textContent.includes("Address Proof")), [true]);
  assert.ok(within(list).getByRole("link", { name: "Upload" }));
  fireEvent.click(screen.getByRole("tab", { name: "Acknowledge (1)" }));
  assert.ok(screen.getByText("Read and confirm Code of conduct"));
  fireEvent.click(screen.getByRole("tab", { name: "Sign (1)" }));
  assert.ok(screen.getByText("Offer letter"));
});

test("Company Documents: confirm reading, and a view-only file has no Download", async (t) => {
  const calls = mockAll(t);
  await renderPage("../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx");
  const conduct = screen.getByRole("group", { name: "Code of conduct" });
  assert.ok(within(conduct).getByText("View only"));
  assert.equal(within(conduct).queryByRole("button", { name: /Download/ }), null);
  const travel = screen.getByRole("group", { name: "Travel policy" });
  assert.ok(within(travel).getByRole("button", { name: /Download/ }));
  assert.match(screen.getByText(/waiting for your read-confirmation/).textContent, /1 waiting/);
  fireEvent.click(within(conduct).getByRole("button", { name: "I have read Code of conduct" }));
  await settle();
  assert.deepEqual(calls.ack, [[10, 21]]);
  assert.ok(within(screen.getByRole("group", { name: "Code of conduct" })).getByText(/^Read /));
  assert.match(screen.getByRole("status").textContent, /you confirmed you have read/);
});

test("Company Documents shows a friendly empty state", async (t) => {
  mockAll(t, { getMyCompanyDocuments: async () => ({ total: 0, groups: [] }) });
  await renderPage("../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx");
  assert.ok(screen.getByText("Nothing shared with you yet."));
});

test("Templates: HR rewords a notification with placeholders, previews and saves it", async (t) => {
  const calls = mockAll(t);
  await renderPage("../src/modules/zoiko-hr/documents/automation/AutomationSettingsPage.jsx", { query: true, tab: "Templates" });
  const rejected = screen.getByText("Rejected").closest("tr");
  assert.ok(within(rejected).getByText("Custom"));
  fireEvent.click(screen.getByRole("button", { name: "Edit email wording for Approved" }));
  const dialog = screen.getByRole("dialog", { name: /Wording: Approved/ });
  const message = within(dialog).getByLabelText("Message");
  fireEvent.change(message, { target: { value: "Hello " } });
  message.setSelectionRange(6, 6);
  fireEvent.click(within(dialog).getByRole("button", { name: "{{first_name}}" }));
  assert.equal(message.value, "Hello {{first_name}}");
  fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
  await settle();
  assert.match(within(dialog).getByRole("status", { name: "Preview" }).textContent, /Passport ok/);
  assert.equal(within(dialog).getByRole("button", { name: /Use default/ }).disabled, true);   // nothing custom yet
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.save, [{ key: "document.approved", channel: "email", subject: "Document approved", body: "Hello {{first_name}}" }]);
  assert.equal(screen.queryByRole("dialog"), null);
});

test("Templates: a custom wording can go back to the default", async (t) => {
  const calls = mockAll(t);
  await renderPage("../src/modules/zoiko-hr/documents/automation/AutomationSettingsPage.jsx", { query: true, tab: "Templates" });
  fireEvent.click(screen.getByRole("button", { name: "Edit email wording for Rejected" }));
  const dialog = screen.getByRole("dialog", { name: /Wording: Rejected/ });
  fireEvent.click(within(dialog).getByRole("button", { name: /Use default/ }));
  await settle();
  assert.deepEqual(calls.revert, [{ key: "document.rejected", channel: "email" }]);
});

// ── Phase 7: retention ─────────────────────────────────────────────────────────────────────────────────────────────

test("Retention: set how long a category is kept; HR cannot pick Delete; a policy can be removed", async (t) => {
  const calls = mockAll(t);
  await renderPage("../src/modules/zoiko-hr/documents/automation/AutomationSettingsPage.jsx", { query: true, tab: "Retention" });
  const what = screen.getByLabelText("What happens to Identity Proof (employee)");
  assert.deepEqual([...what.options].map((o) => o.value), ["flag", "archive"]);
  const companyClock = screen.getByLabelText("When the period starts for Company Policies (company)");
  assert.equal([...companyClock.options].some((o) => o.value === "from_exit"), false);   // company files have no exit date
  fireEvent.change(screen.getByLabelText("Years to keep Identity Proof (employee)"), { target: { value: "7" } });
  const row = screen.getByText("Identity Proof").closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.retention, [{ scope: "employee", key: "identity_proof", retainYears: 7, clock: "from_exit", action: "archive" }]);
  fireEvent.click(screen.getByRole("button", { name: "Keep Company Policies (company) indefinitely" }));
  await settle();
  assert.deepEqual(calls.keep, [{ scope: "company", key: "company_policies" }]);
});
