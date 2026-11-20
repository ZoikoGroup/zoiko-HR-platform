/**
 * Documents Phase 0 (docs/new_docs/ZHR-DOCS-ARCH-001 §1.6).
 *
 * P5  Approval Workflow showed "Pending (0)" next to "Loading approvals…".
 * P6  Its "Search by Employee ID" box never filtered (stale closure) and fired a request per keystroke.
 * P8  A failed load fell through to "No documents found" instead of an error with Retry.
 * P10/P11 Employee Company Documents showed two loaders and two Refresh buttons.
 * P16 A manager could open the admin Documents pages.
 * P17 Admins and HR admins saw all eight employee Documents tabs but four of them redirected; those four tabs
 *     must then list only the signed-in person's own files.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES, ROLE_ALLOWED_PREFIXES, ROLE_DISALLOWED_PATHS } from "../src/config/roles.js";

afterEach(() => cleanup());

const settle = async (rounds = 5, ms = 25) => {
  for (let i = 0; i < rounds; i++) await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};
const never = () => new Promise(() => {});
const HOOK = {
  preview: null, busyId: null, busyAction: null, fileError: null,
  view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {},
};

function hrefsFor(role) {
  const out = [];
  const walk = (items) => (items || []).forEach((i) => { if (i.href) out.push(i.href); walk(i.children); });
  filterSectionsForRole(sections, role, [], "standard", null).forEach((s) => walk(s.items));
  return out;
}

// ── P16 / P17: role routing ────────────────────────────────────────────────────────────────────────────

test("a manager's menu has no admin Documents pages", () => {
  const hrefs = hrefsFor(ROLES.MANAGER);
  for (const h of ["/zoiko-hr/documents", "/zoiko-hr/documents/employees", "/zoiko-hr/documents/employee-upload",
                   "/zoiko-hr/documents/company-documents", "/zoiko-hr/documents/approvals"]) {
    assert.ok(!hrefs.includes(h), `manager should not see ${h}`);
  }
  assert.ok(ROLE_DISALLOWED_PATHS[ROLES.MANAGER].includes("/zoiko-hr/documents"));
});

test("admins and HR admins keep the admin Documents pages", () => {
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
    const hrefs = hrefsFor(role);
    assert.ok(hrefs.includes("/zoiko-hr/documents/employees"), role);
    assert.ok(hrefs.includes("/zoiko-hr/documents/company-documents"), role);
  }
});

test("admins and HR admins may open every employee Documents tab", () => {
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
    for (const path of ["/employee/documents/my-files", "/employee/documents/payslips",
                        "/employee/documents/contracts", "/employee/documents/tax"]) {
      assert.ok(ROLE_ALLOWED_PREFIXES[role].includes(path), `${role} → ${path}`);
    }
  }
});

test("the employee tabs that list files ask only for the caller's own documents", async (t) => {
  const calls = [];
  t.mock.module("../src/hooks/useDocumentFile.js", { exports: { useDocumentFile: () => HOOK } });
  t.mock.module("../src/service/employee.js", { exports: { getDocuments: async (p) => { calls.push(p); return { data: [] }; } } });
  for (const page of ["Employee_Payslips", "Employee_OfferContracts", "Employee_TaxCompliance"]) {
    const mod = await import(`../src/pages/Peoples/Employees/Documents/${page}.jsx?t=${Math.random()}`);
    render(React.createElement(MemoryRouter, null, React.createElement(mod.default)));
    await settle(3);
    cleanup();
  }
  assert.equal(calls.length, 3);   // My Files reads /hr/me/documents/categories (always the caller's own)
  assert.ok(calls.every((p) => p.mine === true), JSON.stringify(calls));
});

// P5 / P6 / P8 (Approval Workflow) moved with the page: covered by documentsPhase3.test.mjs since the legacy
// approvals.jsx was removed (ZHR-DOCS-ARCH-001 Phase 9).

// ── P10 / P11: employee Company Documents ──────────────────────────────────────────────────────────────

const impl = {};
async function mockCompanyDocs(t, { assigned, generated }) {
  // The signing/acknowledge dialogs import the rest of docTemplatesService: keep the real exports, override the reads.
  // IssuedDocumentsSection is cached after the first import, together with the mocked service it was linked to, so
  // the mocks delegate to `impl` and each test swaps the implementation instead of the module.
  impl.assigned = assigned;
  impl.generated = generated;
  const real = await import("../src/service/docTemplatesService.js");
  t.mock.module("../src/hooks/useDocumentFile.js", { exports: { useDocumentFile: () => HOOK } });
  // Phase 6: the page reads only what the access rules share (/hr/me/company-documents), grouped by category.
  t.mock.module("../src/service/documentsService.js", { exports: {
    getMyCompanyDocuments: async (...a) => {
      const r = await impl.assigned(...a);
      const items = (r?.data || []).map((d) => ({ ...d, can_download: true, require_ack: false, needs_ack: false }));
      return { total: items.length, groups: items.length ? [{ category: { id: 1, key: "company_policies", name: "Company Policies" }, items }] : [] };
    },
    acknowledgeCompanyDocument: async () => ({}),
  } });
  t.mock.module("../src/service/docTemplatesService.js", { exports: {
    ...real,
    listMyGeneratedDocuments: (...a) => impl.generated(...a), myPendingDocumentCount: async () => ({ count: 0 }),
    getMyGeneratedDocument: async () => ({}), previewMyGeneratedDocument: async () => ({}),
    downloadGeneratedDocument: async () => ({}),
  } });
}
async function renderCompanyDocs() {
  const mod = await import(`../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(mod.default)));
}

test("Company Documents shows one loader while both lists load", async (t) => {
  await mockCompanyDocs(t, { assigned: never, generated: never });
  await renderCompanyDocs();
  await settle(2);
  assert.ok(screen.getByText("Loading documents..."));
  assert.equal(screen.queryByText("Loading..."), null);
  assert.equal(screen.getAllByRole("button", { name: /Refresh/ }).length, 1);
});

test("Company Documents has one Refresh button, and it reloads both lists", async (t) => {
  const counts = { assigned: 0, generated: 0 };
  await mockCompanyDocs(t, {
    assigned: async () => { counts.assigned++; return { data: [{ id: 1, document_id: 1, title: "Travel rules" }] }; },
    generated: async () => { counts.generated++; return { items: [{ id: 7, title: "Offer letter", status: "ISSUED" }], total: 1 }; },
  });
  await renderCompanyDocs();
  await settle();
  assert.ok(screen.getByText("Travel rules"));
  assert.ok(screen.getByText("Documents issued to you"));
  const refresh = screen.getAllByRole("button", { name: /Refresh/ });
  assert.equal(refresh.length, 1);
  const before = { ...counts };
  fireEvent.click(refresh[0]);
  await settle();
  assert.equal(counts.assigned, before.assigned + 1);
  assert.equal(counts.generated, before.generated + 1);
});
