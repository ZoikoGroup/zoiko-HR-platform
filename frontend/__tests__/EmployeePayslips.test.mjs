/**
 * __tests__/EmployeePayslips.test.mjs
 * -------------------------------------
 * Frontend regression check for the HR document visibility fix (Step 4 of
 * the "Fix Employee Document Visibility Scoping" prompt).
 *
 * This does NOT catch a backend scoping bug — Employee_Payslips.jsx trusts
 * whatever GET /hr/documents?category=payslip returns. What it locks in is
 * that the page itself renders *exactly* that response and nothing else: no
 * stale rows left over from a previous render, no accidentally-unfiltered
 * `rawDocs` slipping past the `useMemo` mapping step, no hardcoded/leftover
 * data. Two distinct mocked API responses are rendered in turn and the
 * table's contents are asserted to match each one exactly.
 *
 * Run with: npm test (frontend/package.json wires up the jsx/jsdom loader
 * this needs — see __tests__/support/).
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

// @testing-library/react's own `waitFor` (MutationObserver-based) never
// re-invokes its check callback under this jsdom + `node --test` combination
// — it hangs instead of polling or timing out, in every case tried here.
// This is a plain, real-timer poll wrapped in `act()` so React state updates
// flush between checks; equivalent in effect, just not MutationObserver-based.
async function waitForCondition(predicate, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeout) {
      throw new Error("waitForCondition: condition not met within timeout");
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, interval));
    });
  }
}

const HOOK_STUB = {
  preview: null,
  busyId: null,
  busyAction: null,
  fileError: null,
  view: () => {},
  download: () => {},
  closePreview: () => {},
  downloadFromPreview: () => {},
};

async function renderPayslipsWithDocs(t, docs) {
  t.mock.module("../src/service/employee.js", {
    exports: { getDocuments: async () => ({ data: docs }) },
  });
  t.mock.module("../src/hooks/useDocumentFile.js", {
    exports: { useDocumentFile: () => HOOK_STUB },
  });

  // Re-import fresh each call so the module-mock (registered above) is
  // actually in effect for this render's data fetch.
  const mod = await import(
    `../src/pages/Peoples/Employees/Documents/Employee_Payslips.jsx?t=${Date.now()}-${Math.random()}`
  );
  const Payslips = mod.default;

  render(React.createElement(Payslips));
  await waitForCondition(() => screen.queryByText(/Loading payslips/i) === null);
}

function rowMonths() {
  // Payslips' list now renders through the shared DocumentRow component
  // (role="group", aria-label=<month>) rather than a <table> — see the
  // documents-redesign prompt's Step 4, which moved this page off its own
  // table onto the shared row/empty/error components used by every
  // document page.
  return screen.getAllByRole("group").map((row) => row.getAttribute("aria-label"));
}

test("renders exactly employee A's payslips (response A) and nothing else", async (t) => {
  const responseA = [
    { id: 101, month: "2026-06", net: "₹50,000", gross: "₹60,000", deductions: "₹10,000", status: "approved" },
    { id: 102, month: "2026-07", net: "₹51,000", gross: "₹61,000", deductions: "₹10,000", status: "approved" },
  ];

  await renderPayslipsWithDocs(t, responseA);

  const months = rowMonths();
  assert.deepEqual(new Set(months), new Set(["2026-06", "2026-07"]));
  assert.equal(months.length, responseA.length, "no extra rows beyond the API response");

  cleanup();
});

test("renders exactly a different response B, with no rows leaked from a prior render", async (t) => {
  // A different employee's (or a later fetch's) response — deliberately
  // shares no month with responseA above, so any leftover-row bug would show.
  const responseB = [
    { id: 201, month: "2026-01", net: "₹40,000", gross: "₹45,000", deductions: "₹5,000", status: "approved" },
  ];

  await renderPayslipsWithDocs(t, responseB);

  const months = rowMonths();
  assert.deepEqual(months, ["2026-01"]);
  assert.equal(months.length, 1, "must render exactly the one document response B returned");

  cleanup();
});

test("renders no rows when the API returns none (does not fabricate data)", async (t) => {
  await renderPayslipsWithDocs(t, []);

  assert.equal(screen.getByText(/No payslips found/i) !== null, true);
  assert.equal(screen.queryByRole("table"), null);

  cleanup();
});
