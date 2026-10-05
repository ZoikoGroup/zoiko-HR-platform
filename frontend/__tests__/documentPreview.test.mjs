/**
 * __tests__/documentPreview.test.mjs
 * -----------------------------------
 * ZHR 44 regression coverage for the format layer behind document preview.
 *
 * DocumentPreviewModal used to render only PDFs and images and showed
 * "Preview not available for this file type" for everything else — which is
 * most of what HR stores (docx, xls/xlsx, csv, txt, rtf, odt, pptx).
 * src/utils/documentPreview.js owns the detection and the renderers; these
 * tests exercise them against real files built here (a genuine OOXML .docx
 * and .pptx via JSZip, a genuine .xlsx via SheetJS), not against mocks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import {
  detectPreviewKind, fileExtension, humanFileSize, escapeHtml,
  renderText, renderSheet, renderWord, renderSlides,
  PDF, IMAGE, TEXT, MARKDOWN, HTML, SHEET, WORD, SLIDES, UNSUPPORTED,
} from "../src/utils/documentPreview.js";

function blobOf(parts, type = "") {
  return new Blob(parts, { type });
}

/** Minimal but valid-enough .docx: OOXML zip with the pieces mammoth reads. */
async function docxBlob(paragraphs) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
       <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
       <Default Extension="xml" ContentType="application/xml"/>
       <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
     </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
     </Relationships>`,
  );
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
       <w:body>${body}</w:body>
     </w:document>`,
  );
  return blobOf([await zip.generateAsync({ type: "uint8array" })],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

async function pptxBlob(slides) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  slides.forEach((text, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?>
       <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
         <p:cSld><p:spTree>
           <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
         </p:spTree></p:cSld>
       </p:sld>`,
    );
  });
  return blobOf([await zip.generateAsync({ type: "uint8array" })],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation");
}

// ── Format detection ──────────────────────────────────────────────────────────

test("every extension the upload validator accepts has a real preview kind", () => {
  // Mirrors ALLOWED_EXTENSIONS in backend/app/modules/hr/router.py plus the
  // image types the UI accepts.
  const expected = {
    pdf: PDF,
    docx: WORD, doc: WORD, odt: WORD, rtf: WORD,
    xls: SHEET, xlsx: SHEET, csv: SHEET, tsv: SHEET,
    txt: TEXT, md: MARKDOWN, htm: HTML,
    pptx: SLIDES, ppt: SLIDES,
    png: IMAGE, jpg: IMAGE, jpeg: IMAGE, gif: IMAGE, webp: IMAGE,
  };
  for (const [ext, kind] of Object.entries(expected)) {
    assert.equal(detectPreviewKind(`Payslip.${ext}`), kind, `${ext} must be previewable`);
  }
});

test("detection is case-insensitive and ignores paths and query noise", () => {
  assert.equal(detectPreviewKind("C:\\Users\\me\\OFFER LETTER.DOCX"), WORD);
  assert.equal(detectPreviewKind("/tmp/uploads/hr_documents/abc.PDF?v=2"), PDF);
  assert.equal(detectPreviewKind("archive.tar.gz"), UNSUPPORTED);
});

test("the extension wins over a misleading stored mime type", () => {
  // Office uploads frequently arrive as application/octet-stream.
  assert.equal(detectPreviewKind("report.xlsx", "application/octet-stream"), SHEET);
  // ...and Safari sends application/x-pdf for real PDFs.
  assert.equal(detectPreviewKind("payslip.pdf", "application/x-pdf"), PDF);
});

test("mime type is the fallback when there is no usable extension", () => {
  assert.equal(detectPreviewKind("download", "application/pdf"), PDF);
  assert.equal(detectPreviewKind("scan", "image/png"), IMAGE);
  assert.equal(detectPreviewKind("notes", "text/plain"), TEXT);
  assert.equal(detectPreviewKind("mystery", "application/zip"), UNSUPPORTED);
  assert.equal(detectPreviewKind("", ""), UNSUPPORTED);
});

test("fileExtension handles dotfiles, paths and empty input", () => {
  assert.equal(fileExtension("a/b/c.PDF"), "pdf");
  assert.equal(fileExtension("noext"), "");
  assert.equal(fileExtension(""), "");
  assert.equal(fileExtension(".gitignore"), "gitignore");
});

// ── Renderers ─────────────────────────────────────────────────────────────────

test("renderText returns the file contents", async () => {
  const { text, truncated } = await renderText(blobOf(["Payslip Jan\nNet pay 100"], "text/plain"));
  assert.match(text, /Payslip Jan/);
  assert.equal(truncated, false);
});

test("renderSheet reads a CSV into a grid", async () => {
  const csv = "Name,Department\nAsha,Finance\nBilal,Eng\n";
  const result = await renderSheet(blobOf([csv], "text/csv"), "employees.csv");
  assert.equal(result.sheets.length, 1);
  const rows = result.sheets[0].rows;
  assert.deepEqual(rows[0], ["Name", "Department"]);
  assert.deepEqual(rows[1], ["Asha", "Finance"]);
  assert.equal(result.dense, true);
});

test("renderSheet reads a real xlsx workbook with multiple sheets", async () => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]), "First");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "Second");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const result = await renderSheet(
    blobOf([bytes], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "workbook.xlsx",
  );
  assert.deepEqual(result.sheets.map((s) => s.name), ["First", "Second"]);
  assert.equal(result.activeSheet, "First");
  assert.deepEqual(result.sheets[1].rows[0], ["x"]);
});

test("renderSheet caps very large sheets and says so", async () => {
  const rows = [["h1", "h2"]];
  for (let i = 0; i < 900; i++) rows.push([`r${i}`, `v${i}`]);
  const csv = rows.map((r) => r.join(",")).join("\n");

  const result = await renderSheet(blobOf([csv], "text/csv"), "big.csv");
  assert.equal(result.sheets[0].rows.length, 400);
  assert.equal(result.sheets[0].truncated, true);
  assert.equal(result.sheets[0].totalRows, 901);
});

test("renderWord converts a real docx to HTML", async () => {
  const blob = await docxBlob(["Offer Letter", "Dear Asha,"]);
  const result = await renderWord(blob, "offer.docx");
  assert.equal(result.viaMammoth, true);
  assert.match(result.html, /Offer Letter/);
  assert.match(result.html, /Dear Asha/);
});

test("renderWord de-tags RTF instead of showing control codes", async () => {
  const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}\b1 Welcome\b0\0 to HR\par}`;
  const result = await renderWord(blobOf([rtf], "application/rtf"), "note.rtf");
  assert.equal(result.viaMammoth, false);
  assert.match(result.html, /Welcome/);
  assert.doesNotMatch(result.html, /\\rtf1|\\b1|\\par/);
});

test("renderWord degrades gracefully for legacy binary .doc", async () => {
  const result = await renderWord(blobOf([new Uint8Array([1, 2, 3])], "application/msword"), "old.doc");
  assert.equal(result.legacy, true);
  assert.match(result.message, /Convert the file to \.docx or PDF/);
});

test("renderSlides extracts per-slide text from a real pptx", async () => {
  const blob = await pptxBlob(["Quarterly plan &amp; goals", "Hiring update"]);
  const result = await renderSlides(blob, "deck.pptx");
  assert.equal(result.slides.length, 2);
  assert.match(result.slides[0].text, /Quarterly plan & goals/);
  assert.match(result.slides[1].text, /Hiring update/);
});

test("renderSlides degrades gracefully for legacy binary .ppt", async () => {
  const result = await renderSlides(blobOf([new Uint8Array([1])], "application/vnd.ms-powerpoint"), "old.ppt");
  assert.equal(result.legacy, true);
});

test("renderSlides explains an unreadable container instead of throwing", async () => {
  const result = await renderSlides(blobOf(["not a zip at all"]), "broken.pptx");
  assert.ok(result.legacy || result.message, "a broken container produces a message, not a crash");
});

// ── Small helpers ─────────────────────────────────────────────────────────────

test("humanFileSize formats bytes and refuses nonsense", () => {
  assert.equal(humanFileSize(512), "512 B");
  assert.equal(humanFileSize(1536), "1.5 KB");
  assert.equal(humanFileSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(humanFileSize(0), null);
  assert.equal(humanFileSize(undefined), null);
});

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});