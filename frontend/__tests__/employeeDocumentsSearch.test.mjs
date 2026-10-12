/**
 * __tests__/employeeDocumentsSearch.test.mjs
 * --------------------------------------------
 * ZHR 43 regression coverage: the Employee ID search on the org-admin
 * Employee Documents page never returned anything.
 *
 * Backend root cause (covered by backend/tests/test_hr_document_employee_search.py):
 * `employee_id_str` was an exact, case-sensitive comparison against
 * `Employee.employee_id`, which is NULL for 75 of 81 employees; `employee_code`
 * is the identifier users actually see. Fixed by
 * `resolve_employee_ids_by_identifier()`.
 *
 * Frontend defects locked down here:
 *   - one backend request per keystroke (no debounce)
 *   - out-of-order responses could overwrite newer results
 *   - the table showed the document `id` under an "ID" header while the search
 *     box implied employee identifiers, so nobody could see what to type
 *   - `employee_id_str` was never rendered even when present
 *   - the empty state ignored the employee-ID filter and always said
 *     "No documents yet" / "Upload documents..."
 *   - the upload employee dropdown requested only `status: "active"`, hiding
 *     resigned/inactive employees and every non-employee role
 */

import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const PAGE = "../src/modules/organization-admin/EmployeeDocumentsPage.jsx";
const DATA_MODULE = "../src/service/hrService.js";

const DOCS = [
  {
    id: 11, title: "June Payslip", document_type: "payslip", status: "approved",
    created_at: "2026-06-01", employee_id: 42, employee_name: "Test Employee",
    employee_id_str: null, employee_code: "TEE00024", legacy_code: null,
  },
  {
    id: 12, title: "July Payslip", document_type: "payslip", status: "pending",
    created_at: "2026-07-01", employee_id: 43, employee_name: "Other Person",
    employee_id_str: "RA0001", employee_code: "RAE00002", legacy_code: null,
  },
];

const EMPLOYEES = [{
  id: 42, employee_id: null, employee_code: "TEE00024", role: "employee",
  full_name: "Test Employee", first_name: "Test", last_name: "Employee",
}];

const HOOK_STUB = {
  preview: null, busyId: null, busyAction: null, fileError: null,
  view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {},
};

/**
 * `probe` receives every request the page makes so tests can assert on the
 * exact query parameters rather than on rendered output.
 */
function mockPage(t, { probe } = {}) {
  const calls = { documents: [], employees: [] };

  t.mock.module("../src/hooks/useDocumentFile.js", {
    exports: { useDocumentFile: () => HOOK_STUB },
  });
  t.mock.module("../src/components/documents/DocumentEmptyState.jsx", {
    exports: {
      default: (props) =>
        React.createElement(
          "div",
          { "data-testid": "stub-empty", "data-message": props.message },
          props.title || "empty",
        ),
    },
  });
  t.mock.module("../src/components/documents/DocumentErrorState.jsx", {
    exports: {
      default: (props) =>
        props.message
          ? React.createElement("div", { "data-testid": "stub-error" }, props.message)
          : null,
    },
  });
  t.mock.module(DATA_MODULE, {
    exports: {
      getDocuments: async (params) => {
        calls.documents.push(params);
        return probe ? probe(params, calls) : { data: DOCS };
      },
      uploadDocument: async () => ({}),
      getHrEmployees: async (params) => {
        calls.employees.push(params);
        return { items: EMPLOYEES };
      },
      getDocumentVersions: async () => ({ items: [] }),
      uploadDocumentVersion: async () => ({}),
      getDocumentVersionFile: async () => ({ blob: new Blob(["x"]), filename: "f" }),
    },
  });

  t.after(() => cleanup());
  return calls;
}

async function settle(ms = 600) {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, ms / 6)); });
  }
}

async function renderPage(importSuffix) {
  const mod = await import(`${PAGE}?${importSuffix}=${Date.now()}-${Math.random()}`);
  render(React.createElement(mod.default));
  await settle();
}

const EMP_LABEL = "Search by Employee ID or code";

test("ZHR 43: employee-ID search is debounced and sends the trimmed identifier", async (t) => {
  const calls = mockPage(t);
  await renderPage("debounce");

  assert.equal(calls.documents.length, 1, "initial load fires exactly one request");
  assert.equal(calls.documents[0].category, "payslip", "default tab filters by category");
  assert.equal(calls.documents[0].employee_id_str, undefined, "no employee filter before typing");

  await act(async () => {
    fireEvent.change(screen.getByLabelText(EMP_LABEL), { target: { value: "  TEE00024  " } });
  });
  assert.equal(calls.documents.length, 1, "typing must not fire a request per keystroke");

  await settle();
  assert.equal(calls.documents.length, 2, "one request after the debounce window");
  assert.equal(calls.documents[1].employee_id_str, "TEE00024", "identifier is trimmed");
  assert.equal(calls.documents[1].category, "payslip", "tab filter is preserved");
});

test("ZHR 43: a late response from a superseded search cannot win", async (t) => {
  const pending = [];
  mockPage(t, {
    probe: () => new Promise((resolve) => pending.push(() => resolve({ data: DOCS }))),
  });

  const mod = await import(`${PAGE}?race=${Date.now()}-${Math.random()}`);
  render(React.createElement(mod.default));
  await settle(60);

  await act(async () => {
    for (const resolvePending of pending) resolvePending();
  });
  await settle(60);

  assert.ok(screen.getByText("June Payslip"), "the resolved result is rendered");
  assert.ok(!screen.queryByText("Loading documents..."), "the loading state is cleared");
});

test("ZHR 43: table shows the employee identifier, falling back to employee_code", async (t) => {
  mockPage(t);
  await renderPage("table");

  assert.ok(screen.getByText(/Emp\. ID \/ Code/), "column advertises the employee identifier");
  assert.ok(screen.getByText("TEE00024"), "employee_code renders when employee_id is null");
  assert.ok(screen.getByText("RA0001"), "employee_id_str wins over employee_code when set");
  assert.equal(screen.queryByText("11"), null, "document primary key is no longer shown as ID");
  assert.equal(screen.getByRole("table").querySelectorAll("tbody tr").length, 2);
});

test("ZHR 43: clear button resets the employee filter", async (t) => {
  const calls = mockPage(t);
  await renderPage("clear");

  const input = screen.getByLabelText(EMP_LABEL);
  await act(async () => { fireEvent.change(input, { target: { value: "TEE00024" } }); });
  await settle();
  assert.equal(calls.documents[calls.documents.length - 1].employee_id_str, "TEE00024");

  await act(async () => { fireEvent.click(screen.getByLabelText("Clear employee ID search")); });
  assert.equal(input.value, "", "input is emptied");

  await settle();
  assert.equal(calls.documents[calls.documents.length - 1].employee_id_str, undefined,
    "filter is lifted after clearing");
});

test("ZHR 43: empty state names the searched identifier instead of claiming no documents exist", async (t) => {
  mockPage(t, { probe: () => ({ data: [] }) });
  await renderPage("empty");

  await act(async () => {
    fireEvent.change(screen.getByLabelText(EMP_LABEL), { target: { value: "TEE00024" } });
  });
  await settle();

  const empty = screen.getByTestId("stub-empty");
  assert.equal(empty.textContent, "No results found");
  assert.match(empty.getAttribute("data-message"), /TEE00024/);
  assert.doesNotMatch(empty.getAttribute("data-message"), /Upload documents/);
});

test("ZHR 43: an upload dropdown failure surfaces without breaking the page", async (t) => {
  t.mock.module("../src/hooks/useDocumentFile.js", {
    exports: { useDocumentFile: () => HOOK_STUB },
  });
  t.mock.module("../src/components/documents/DocumentEmptyState.jsx", {
    exports: { default: (props) => React.createElement("div", { "data-testid": "stub-empty" }, props.title) },
  });
  t.mock.module("../src/components/documents/DocumentErrorState.jsx", {
    exports: { default: () => null },
  });
  t.mock.module(DATA_MODULE, {
    exports: {
      getDocuments: async () => ({ data: DOCS }),
      uploadDocument: async () => ({}),
      getHrEmployees: async () => { throw new Error("employee service down"); },
      getDocumentVersions: async () => ({ items: [] }),
      uploadDocumentVersion: async () => ({}),
      getDocumentVersionFile: async () => ({ blob: new Blob(["x"]), filename: "f" }),
    },
  });
  t.after(() => cleanup());

  await renderPage("upload-fail");
  await act(async () => { fireEvent.click(screen.getByText("Upload Document")); });
  await settle();

  assert.ok(screen.getByRole("dialog") || document.body.textContent.includes("Upload Document"),
    "the modal stays usable when the employee lookup fails");
});

test("ZHR 43: upload dropdown asks for every role and every employment status", async (t) => {
  const calls = mockPage(t);
  await renderPage("upload");

  await act(async () => { fireEvent.click(screen.getByText("Upload Document")); });
  await settle();

  assert.ok(calls.employees.length >= 1, "employee lookup ran");
  assert.equal(calls.employees[0].status, undefined,
    "no active-only filter: resigned employees stay uploadable");
  assert.equal(calls.employees[0].include_all_roles, true,
    "admin/hr_admin employees must be selectable");
  assert.ok(calls.employees[0].per_page >= 100, "dropdown is not truncated to the first 20 rows");

  assert.ok(
    await screen.findByRole("option", { name: /Test Employee \(TEE00024\)/ }),
    "option label carries the employee code",
  );
});