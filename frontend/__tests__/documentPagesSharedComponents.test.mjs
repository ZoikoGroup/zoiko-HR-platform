/**
 * __tests__/documentPagesSharedComponents.test.mjs
 * ---------------------------------------------------
 * Testing requirement #3 from the document-pages redesign prompt: "A render
 * test per redesigned page confirming the shared DocumentRow/empty/error
 * components are actually used (not just visually similar copies) — assert
 * on the component's presence, not just matching CSS classes."
 *
 * Each of the seven document pages has its own module-level mock of
 * components/documents/{DocumentRow,DocumentEmptyState,DocumentErrorState}.jsx
 * (via node:test's module mocking, keyed by absolute resolved path — so this
 * intercepts the REAL import inside each page file, not a copy). If a page
 * were ever "fixed" to look right by pasting similar-looking markup instead
 * of actually importing these components, these tests would go back to
 * rendering the page's own un-mocked markup and the stub markers below would
 * never appear.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act } from "@testing-library/react";

async function flushRender(importPath) {
  const mod = await import(`${importPath}?t=${Date.now()}-${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(mod.default)));
  // Wait until the page has finished loading (Company Documents shows one loader until BOTH of its lists are in), with a
  // cap, instead of a fixed delay that a busy test machine can outrun.
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    if (i >= 3 && !document.body.textContent.includes("Loading documents...")) break;
  }
}

function mockSharedDocComponents(t) {
  t.mock.module("../src/components/documents/DocumentRow.jsx", {
    exports: {
      default: (props) =>
        React.createElement("div", { "data-testid": "stub-row", "data-doc-title": props.title }, props.title),
    },
  });
  t.mock.module("../src/components/documents/DocumentEmptyState.jsx", {
    exports: {
      default: (props) => React.createElement("div", { "data-testid": "stub-empty" }, props.title || "empty"),
    },
  });
  t.mock.module("../src/components/documents/DocumentErrorState.jsx", {
    exports: {
      default: (props) => (props.message ? React.createElement("div", { "data-testid": "stub-error" }, props.message) : null),
    },
  });
}

const HOOK_STUB = {
  preview: null, busyId: null, busyAction: null, fileError: null,
  view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {},
};

function mockUseDocumentFile(t) {
  t.mock.module("../src/hooks/useDocumentFile.js", {
    exports: { useDocumentFile: () => HOOK_STUB },
  });
}

// Employee_UploadRequest.jsx is the only one of the seven pages that reads
// useAuth() — real AuthContext pulls in service/authService -> service/api.js,
// which reads import.meta.env at module scope (fine under Vite, not under
// plain node --test). Stub it out rather than dragging that whole chain in.
function mockAuthContext(t) {
  t.mock.module("../src/context/AuthContext.jsx", {
    exports: { useAuth: () => ({ user: { id: 1, email: "a@z.test" } }) },
  });
}

const SAMPLE_DOCS = [
  { id: 1, title: "June Payslip", document_type: "payslip", status: "approved", created_at: "2026-06-01" },
  { id: 2, title: "July Payslip", document_type: "payslip", status: "pending", created_at: "2026-07-01" },
];

// Each entry: page under test, its data-source module path (relative to this
// test file), the named exports that module must provide, and how to make it
// return SAMPLE_DOCS vs. an empty list for the two mock variants below.
// The six employee-facing pages: all use DocumentRow for their list.
const PAGES = [
  {
    name: "Employee_CompanyDocuments",
    path: "../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx",
    // ZHR-DOCS-ARCH-001 Phase 6: only what the access rules share, grouped by category
    dataModule: "../src/service/documentsService.js",
    exportsFor: (docs) => ({
      getMyCompanyDocuments: async () => ({ total: docs.length, groups: docs.length ? [{ category: { id: 1, key: "company_policies", name: "Company Policies" },
        items: docs.map((d) => ({ ...d, can_download: true, require_ack: false, needs_ack: false })) }] : [] }),
      acknowledgeCompanyDocument: async () => ({}), getMyDocumentCounts: async () => ({}),
    }),
  },
  // Employee_MyFiles moved to category containers (ZHR-DOCS-ARCH-001 Phase 2): covered by documentsPhase2.test.mjs.
  {
    name: "Employee_Payslips",
    path: "../src/pages/Peoples/Employees/Documents/Employee_Payslips.jsx",
    dataModule: "../src/service/employee.js",
    exportsFor: (docs) => ({ getDocuments: async () => ({ data: docs }) }),
  },
  {
    name: "Employee_OfferContracts",
    path: "../src/pages/Peoples/Employees/Documents/Employee_OfferContracts.jsx",
    dataModule: "../src/service/employee.js",
    exportsFor: (docs) => ({
      getDocuments: async () => ({ data: docs.map((d) => ({ ...d, title: `Offer Letter ${d.id}` })) }),
    }),
  },
  {
    name: "Employee_TaxCompliance",
    path: "../src/pages/Peoples/Employees/Documents/Employee_TaxCompliance.jsx",
    dataModule: "../src/service/employee.js",
    exportsFor: (docs) => ({ getDocuments: async () => ({ data: docs }) }),
  },
];

for (const page of PAGES) {
  test(`${page.name}: renders the shared DocumentRow (not a look-alike) for each document returned`, async (t) => {
    mockSharedDocComponents(t);
    mockUseDocumentFile(t);
    if (page.needsAuthMock) mockAuthContext(t);
    t.mock.module(page.dataModule, { exports: page.exportsFor(SAMPLE_DOCS) });

    await flushRender(page.path);

    const rows = screen.queryAllByTestId("stub-row");
    assert.ok(rows.length >= 1, `${page.name} must render at least one stub-row when documents exist`);
    cleanup();
  });

  test(`${page.name}: renders the shared DocumentEmptyState (not a look-alike) when there are no documents`, async (t) => {
    mockSharedDocComponents(t);
    mockUseDocumentFile(t);
    if (page.needsAuthMock) mockAuthContext(t);
    t.mock.module(page.dataModule, { exports: page.exportsFor([]) });

    await flushRender(page.path);

    assert.ok(screen.queryByTestId("stub-empty"), `${page.name} must render the shared empty state with zero documents`);
    assert.equal(screen.queryAllByTestId("stub-row").length, 0);
    cleanup();
  });
}

// The org-admin EmployeeDocumentsPage was retired (ZHR-DOCS-ARCH-001 Phase 9): Admin → Employee Documents is the
// read-only drill-down covered by documentsPhase4.test.mjs.
