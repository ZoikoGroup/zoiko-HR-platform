/**
 * __tests__/documentViewDownload.test.mjs
 * ------------------------------------------
 * Step 1 of the document-pages redesign prompt: lock in view/download
 * correctness with tests BEFORE any redesign work, since a visual pass that
 * quietly reintroduces the old file_path/file_url bug on some page would be
 * a regression, not progress.
 *
 * Exercises the ONE shared, correct pattern every document page uses:
 * useDocumentFile() (src/hooks/useDocumentFile.js) + DocumentPreviewModal
 * (src/components/DocumentPreviewModal.jsx) — both driven off an
 * authenticated blob fetch (getDocumentFile), never a raw <a href>/file_url.
 *
 * Covers every MIME type the app actually deals with (PDF, PNG, JPEG,
 * DOCX, XLSX, and one arbitrary/unknown type), confirms preview-not-supported
 * never means download-not-supported, and confirms a fetch failure surfaces
 * as a visible `fileError` rather than being swallowed.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

async function flushUntil(predicate, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeout) throw new Error("flushUntil: condition not met within timeout");
    await act(async () => { await new Promise((r) => setTimeout(r, interval)); });
  }
}

const MIME_TYPES = [
  { mime: "application/pdf", filename: "payslip.pdf", expectInline: "pdf" },
  { mime: "image/png", filename: "id-proof.png", expectInline: "image" },
  { mime: "image/jpeg", filename: "photo.jpg", expectInline: "image" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: "offer-letter.docx", expectInline: "none" },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "compensation.xlsx", expectInline: "none" },
  { mime: "application/x-arbitrary-unknown", filename: "mystery.bin", expectInline: "none" },
];

function mockGetDocumentFileResolves(t, { mime, filename }) {
  const savedCalls = [];
  t.mock.module("../src/service/hrService.js", {
    exports: {
      getDocumentFile: async (id) => ({ blob: new Blob(["x"], { type: mime }), filename }),
    },
  });
  t.mock.module("../src/utils/documents.js", {
    exports: {
      saveBlobAs: (blob, name) => savedCalls.push({ blobType: blob.type, name }),
      fmtDate: (d) => d,
      fmtDateTime: (d) => d,
      fileTypeIcon: () => "📄",
    },
  });
  return savedCalls;
}

function mockGetDocumentFileRejects(t, message) {
  t.mock.module("../src/service/hrService.js", {
    exports: {
      getDocumentFile: async () => { throw new Error(message); },
    },
  });
  t.mock.module("../src/utils/documents.js", {
    exports: { saveBlobAs: () => {}, fmtDate: (d) => d, fmtDateTime: (d) => d, fileTypeIcon: () => "📄" },
  });
}

// ── useDocumentFile: the shared hook every page calls ────────────────────────

for (const { mime, filename } of MIME_TYPES) {
  test(`useDocumentFile.view() fetches an authenticated blob for ${mime} and exposes it as preview`, async (t) => {
    mockGetDocumentFileResolves(t, { mime, filename });
    const { useDocumentFile } = await import(`../src/hooks/useDocumentFile.js?t=${Date.now()}-${Math.random()}`);

    const { result } = renderHook(() => useDocumentFile());
    await act(async () => { await result.current.view(1); });

    assert.equal(result.current.preview.mimeType, mime);
    assert.equal(result.current.preview.filename, filename);
    assert.equal(result.current.fileError, null);
    cleanup();
  });

  test(`useDocumentFile.download() always calls saveBlobAs with the correct filename for ${mime}, regardless of preview support`, async (t) => {
    const saved = mockGetDocumentFileResolves(t, { mime, filename });
    const { useDocumentFile } = await import(`../src/hooks/useDocumentFile.js?t=${Date.now()}-${Math.random()}`);

    const { result } = renderHook(() => useDocumentFile());
    await act(async () => { await result.current.download(1); });

    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, filename);
    assert.equal(saved[0].blobType, mime);
    cleanup();
  });
}

test("useDocumentFile surfaces a fetch failure as fileError, not silently", async (t) => {
  mockGetDocumentFileRejects(t, "Failed to load document: 404");
  const { useDocumentFile } = await import(`../src/hooks/useDocumentFile.js?t=${Date.now()}-${Math.random()}`);

  const { result } = renderHook(() => useDocumentFile());
  await act(async () => { await result.current.view(1); });

  assert.equal(result.current.preview, null);
  assert.match(result.current.fileError, /404/);
  cleanup();
});

test("useDocumentFile surfaces a download failure (e.g. auth failure) as fileError", async (t) => {
  mockGetDocumentFileRejects(t, "Failed to load document: 401");
  const { useDocumentFile } = await import(`../src/hooks/useDocumentFile.js?t=${Date.now()}-${Math.random()}`);

  const { result } = renderHook(() => useDocumentFile());
  await act(async () => { await result.current.download(1); });

  assert.match(result.current.fileError, /401/);
  cleanup();
});

// ── DocumentPreviewModal: the shared "View" surface every page renders ──────

for (const { mime, filename, expectInline } of MIME_TYPES) {
  test(`DocumentPreviewModal renders the right preview surface for ${mime}`, async () => {
    const { default: DocumentPreviewModal } = await import("../src/components/DocumentPreviewModal.jsx");
    const preview = { url: "blob:fake-url", filename, mimeType: mime };
    render(React.createElement(DocumentPreviewModal, { preview, onClose: () => {}, onDownload: () => {} }));

    if (expectInline === "pdf") {
      assert.ok(document.querySelector("iframe"), "PDF must render inline in an iframe");
    } else if (expectInline === "image") {
      assert.ok(document.querySelector("img"), "image types must render inline in an <img>");
    } else {
      assert.equal(document.querySelector("iframe"), null);
      assert.equal(document.querySelector("img"), null);
      assert.ok(screen.getByText(/Preview not available for this file type/i));
    }
    cleanup();
  });

  test(`DocumentPreviewModal always shows a working Download button for ${mime}, even when preview isn't supported`, async () => {
    const { default: DocumentPreviewModal } = await import("../src/components/DocumentPreviewModal.jsx");
    const preview = { url: "blob:fake-url", filename, mimeType: mime };
    let downloadCalls = 0;
    render(React.createElement(DocumentPreviewModal, { preview, onClose: () => {}, onDownload: () => { downloadCalls++; } }));

    const downloadButton = screen.getByRole("button", { name: /download/i });
    downloadButton.click();
    assert.equal(downloadCalls, 1, "Download must work regardless of whether inline preview succeeded");
    cleanup();
  });
}

test("DocumentPreviewModal renders nothing when there is no preview (closed state)", async () => {
  const { default: DocumentPreviewModal } = await import("../src/components/DocumentPreviewModal.jsx");
  const { container } = render(React.createElement(DocumentPreviewModal, { preview: null, onClose: () => {}, onDownload: () => {} }));
  assert.equal(container.innerHTML, "");
  cleanup();
});
