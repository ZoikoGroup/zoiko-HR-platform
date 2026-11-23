/**
 * An administrator who opens the employee "Company documents" page (it lists every published document for them) is told
 * where company documents are managed; an employee sees no such note.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
let admin = false;

test("an admin gets a note pointing to Zoiko HR → Documents; an employee does not", async (t) => {
  t.mock.module("../src/components/documents/IssuedDocumentsSection.jsx", { exports: { default: () => null } });
  t.mock.module("../src/hooks/useDocumentFile.js", { exports: { useDocumentFile: () => ({ preview: null, busyId: null, busyAction: null,
    fileError: null, view: () => {}, download: () => {}, closePreview: () => {}, downloadFromPreview: () => {} }) } });
  t.mock.module("../src/service/documentsService.js", { exports: {
    getMyCompanyDocuments: async () => ({ total: 0, groups: [], viewer_is_admin: admin }),
    acknowledgeCompanyDocument: async () => ({}), getMyDocumentCounts: async () => ({}),
  } });
  const load = async () => {
    const { default: Page } = await import(`../src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx?t=${Math.random()}`);
    render(h(MemoryRouter, null, h(Page)));
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  };
  admin = true;
  await load();
  const note = screen.getByRole("note");
  assert.match(note.textContent, /because you are an administrator/);
  assert.equal(screen.getByRole("link", { name: /Zoiko HR → Documents → Company Documents/ }).getAttribute("href"),
    "/zoiko-hr/documents/company-documents");
  cleanup();
  admin = false;
  await load();
  assert.equal(screen.queryByRole("note"), null);
});
