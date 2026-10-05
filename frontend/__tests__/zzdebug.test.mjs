import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const docsSvc = {};
const apprSvc = {};
const auth = { user: { role: "super_admin" } };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });
const L = (...a) => console.error("[dbg]", ...a);

const DOC = {
  id: 1, title: "Employee Handbook", file_name: "handbook.pdf", file_size: 2048, category: "policy",
  organization_name: "Acme Ltd", uploader_name: "Ann Lee", created_at: "2026-09-30T10:00:00Z",
};

const STALE = { ...DOC, id: 1, title: "Employee Handbook" };
const GONE = { ...DOC, id: 2, title: "Handbook copy", file_name: "copy.pdf" };

test("debug", async (t) => {
  const wrap = (name) => (...a) => docsSvc[name](...a);
  t.mock.module("../src/service/documentsService.js", {
    exports: {
      ALLOWED_EXTENSIONS: ["pdf"], MAX_FILE_SIZE_MB: 10,
      validateFile: () => null,
      getOrganizations: async () => ({ organizations: [{ id: 1, name: "Acme Ltd" }] }),
      getDocuments: wrap("getDocuments"),
      deleteDocument: wrap("deleteDocument"),
      downloadDocument: wrap("downloadDocument"),
      uploadDocument: wrap("uploadDocument"),
    },
  });
  t.mock.module("../src/service/approvalsService.js", {
    exports: { approvalsService: { list: async () => ({ approvals: [], total: 0 }) } },
  });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });

  let releaseStale;
  const staleLoad = new Promise((r) => { releaseStale = r; });
  let deleted = false;
  let call = 0;
  docsSvc.getDocuments = async (p) => {
    call += 1;
    L("getDocuments call", call, JSON.stringify(p));
    if (call === 2) { L("  -> waiting on stale"); await staleLoad; L("  -> stale released"); return { documents: [STALE, GONE], total: 2 }; }
    return deleted ? { documents: [STALE], total: 1 } : { documents: [STALE, GONE], total: 2 };
  };
  docsSvc.deleteDocument = async () => { deleted = true; L("deleteDocument called"); return { message: "'Handbook copy' was deleted.", already_deleted: false }; };

  const { default: Page } = await import("../src/modules/shared-layers/DocumentsPage.jsx");
  render(React.createElement(Page));
  await settle();
  L("mounted, calls =", call);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  L("clicked next, calls =", call);
  fireEvent.click(screen.getByLabelText("Delete Handbook copy (#2)"));
  L("opened delete modal");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  L("clicked delete confirm");
  await settle();
  L("after delete settle, calls =", call);
  L("plain dom count", document.body.textContent.includes("Handbook copy"));
  L("body html length", document.body.innerHTML.length);
  assert.equal(screen.queryByText("Handbook copy"), null);
  L("gone ok");
  releaseStale();
  await settle();
  L("after release settle, calls =", call);
  cleanup();
});