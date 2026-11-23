/**
 * Company Documents P5: the employee's Company Documents page shows folder sections inside each category. Files that are
 * not in a folder come first; each folder path gets its own labelled group, sorted by name.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, within } from "@testing-library/react";

afterEach(() => cleanup());

const item = (id, title, folder = null) => ({ id, title, folder, can_download: true, require_ack: false, needs_ack: false, updated_at: "2026-11-01T00:00:00Z" });

test("files sit under their folder path inside the category; loose files first", async (t) => {
  t.mock.module("../src/components/documents/DocumentRow.jsx", {
    exports: { default: (props) => React.createElement("div", { "data-testid": "row" }, props.title) },
  });
  t.mock.module("../src/hooks/useDocumentFile.js", {
    exports: { useDocumentFile: () => ({ preview: null, busyId: null, busyAction: null, fileError: null, view: () => {}, download: () => {},
      closePreview: () => {}, downloadFromPreview: () => {} }) },
  });
  t.mock.module("../src/service/documentsService.js", {
    exports: {
      getMyCompanyDocuments: async () => ({ total: 4, groups: [{ category: { id: 3, key: "onboarding", name: "Onboarding Documents" }, items: [
        item(1, "NDA", { id: 8, name: "Signed", path: "Joining / Signed" }),
        item(2, "Welcome pack"),
        item(3, "Bank form", { id: 7, name: "Joining", path: "Joining" }),
        item(4, "Tax form", { id: 8, name: "Signed", path: "Joining / Signed" }),
      ] }] }),
      acknowledgeCompanyDocument: async () => ({}), getMyDocumentCounts: async () => ({}),
    },
  });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  for (let i = 0; i < 50 && !screen.queryByText("NDA"); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

  const section = screen.getByRole("region", { name: "Onboarding Documents" });
  const rows = within(section).getAllByTestId("row").map((n) => n.textContent);
  assert.deepEqual(rows, ["Welcome pack", "Bank form", "NDA", "Tax form"]);
  const signed = within(section).getByRole("group", { name: "Folder Joining / Signed" });
  assert.deepEqual(within(signed).getAllByTestId("row").map((n) => n.textContent), ["NDA", "Tax form"]);
  assert.deepEqual(within(within(section).getByRole("group", { name: "Folder Joining" })).getAllByTestId("row").map((n) => n.textContent), ["Bank form"]);
});
