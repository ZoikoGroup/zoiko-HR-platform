// Document preview format detection + in-browser renderers.
//
// Why this exists (ZHR 44): DocumentPreviewModal only knew about PDF and
// images, so every other format an organization can actually upload —
// docx, xls/xlsx, csv, txt, rtf, odt — rendered "Preview not available for
// this file type". The upload allow-list in service/documentsService.js is
// the source of truth for what users may store, so every one of those
// formats gets a real preview here.
//
// Renderers run entirely in the browser on the already-authenticated blob
// returned by service/hrService.js#getDocumentFile. Heavy parsers are
// imported dynamically so the initial bundle only pays for them when a user
// actually opens that format.

export const PDF = "pdf";
export const IMAGE = "image";
export const TEXT = "text";
export const MARKDOWN = "markdown";
export const HTML = "html";
export const SHEET = "sheet";
export const WORD = "word";
export const SLIDES = "slides";
export const UNSUPPORTED = "unsupported";

const EXT_KIND = {
  pdf: PDF,
  png: IMAGE, jpg: IMAGE, jpeg: IMAGE, gif: IMAGE, webp: IMAGE, bmp: IMAGE, svg: IMAGE, ico: IMAGE,
  txt: TEXT, log: TEXT,
  md: MARKDOWN, markdown: MARKDOWN,
  htm: HTML, html: HTML,
  csv: SHEET, tsv: SHEET, xls: SHEET, xlsx: SHEET, xlsm: SHEET, ods: SHEET,
  doc: WORD, docx: WORD, odt: WORD, rtf: WORD,
  ppt: SLIDES, pptx: SLIDES, odp: SLIDES,
};

export function fileExtension(filename = "") {
  const name = String(filename);
  const base = name.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Classify a document for preview. The extension wins over the stored MIME
 * type because uploads from different clients disagree constantly (Office
 * files arrive as application/octet-stream, and Safari sends
 * application/x-pdf for PDFs), while the extension the user typed is stable.
 * The MIME type is only consulted for images and as a fallback when there is
 * no usable extension.
 */
export function detectPreviewKind(filename = "", mimeType = "", blobType = "") {
  const mime = String(mimeType || blobType || "").toLowerCase().split(";")[0].trim();
  const ext = fileExtension(filename);

  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (mime === "application/pdf") return PDF;
  if (mime.startsWith("image/")) return IMAGE;
  if (mime.startsWith("text/") || mime === "application/json") return TEXT;
  if (mime === "application/rtf" || mime === "text/rtf") return WORD;
  return UNSUPPORTED;
}

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SHEET_ROWS = 400;

function blobToText(blob) {
  if (!blob.size || blob.size > MAX_TEXT_BYTES) return Promise.resolve(null);
  return blob.text();
}

function blobToBuffer(blob) {
  return blob.arrayBuffer();
}

/** Pull readable text out of a plain-text/CSV/TSV blob. */
export async function renderText(blob) {
  const text = await blobToText(blob);
  if (text == null) {
    return { text: "", truncated: true };
  }
  return { text, truncated: false };
}

/**
 * Spreadsheets: .xlsx/.xls/.ods via SheetJS, .csv/.tsv via the same reader so
 * the user gets a real grid instead of a comma-separated wall of text.
 */
export async function renderSheet(blob, filename = "") {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await blobToBuffer(blob), { type: "array", cellDates: true });
  const ext = fileExtension(filename);
  const dense = ext === "csv" || ext === "tsv";

  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });
    const truncated = rows.length > MAX_SHEET_ROWS;
    return {
      name,
      rows: truncated ? rows.slice(0, MAX_SHEET_ROWS) : rows,
      totalRows: rows.length,
      truncated,
    };
  });

  if (!sheets.length) {
    return { sheets: [{ name: "Sheet1", rows: [], totalRows: 0, truncated: false }] };
  }
  return { sheets, activeSheet: sheets[0].name, dense };
}

/**
 * Word processor files.
 *
 * .docx/.odt go through mammoth, which reads the OOXML/ODF text runs and emits
 * semantic HTML (headings, lists, tables, bold/italic). .rtf is de-tagged
 * locally. Legacy binary .doc is not a zip archive and has no pure-JS reader;
 * it degrades to a clear "convert to .docx" message rather than a broken
 * preview.
 */
export async function renderWord(blob, filename = "") {
  const ext = fileExtension(filename);
  const buffer = await blobToBuffer(blob);

  if (ext === "rtf") {
    const raw = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    return { html: sanitizeRtf(raw), viaMammoth: false };
  }
  if (ext === "doc") {
    return {
      legacy: true,
      message: "Legacy .doc files cannot be previewed in the browser. Convert the file to .docx or PDF, or download it below.",
    };
  }

  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return {
    html: result.value || "<p>(no readable text)</p>",
    viaMammoth: true,
    messages: (result.messages || []).map((m) => m.message).slice(0, 5),
  };
}

function sanitizeRtf(rtf) {
  let out = rtf;
  out = out.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  out = out.replace(/\{\\\*[^{}]*\}/g, "");
  out = out.replace(/\{\\fonttbl[\s\S]*?\}/gi, "");
  out = out.replace(/\{\\colortbl[\s\S]*?\}/gi, "");
  out = out.replace(/\\par[d]?\b/g, "\n");
  out = out.replace(/\\line\b/g, "\n");
  out = out.replace(/\\tab\b/g, "\t");
  out = out.replace(/\\[a-z]+-?\d*\s?/gi, "");
  out = out.replace(/[{}]/g, "");
  return `<pre>${escapeHtml(out.trim())}</pre>`;
}

/**
 * Presentation files. PPTX/ODP are zip containers whose slides are XML, so the
 * per-slide <a:t> text runs are extracted and shown slide by slide. Legacy
 * binary .ppt has no pure-JS reader and degrades like .doc does.
 */
export async function renderSlides(blob, filename = "") {
  const ext = fileExtension(filename);
  if (ext === "ppt") {
    return {
      legacy: true,
      message: "Legacy .ppt files cannot be previewed in the browser. Convert the file to .pptx or PDF, or download it below.",
    };
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blobToBuffer(blob));

  const collect = async (names) => {
    const files = names
      .filter((n) => /\/(slide|page)\d*\.xml$/.test(n) && !/notesSlide|_rels/.test(n))
      .sort((a, b) => (a.match(/(\d+)/)?.[1] || 0) - (b.match(/(\d+)/)?.[1] || 0));
    const slides = [];
    for (const name of files) {
      const xml = await zip.file(name).async("string");
      const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
      const paragraphs = xml
        .split(/<a:p>/)
        .map((p) =>
          [...p.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("").trim(),
        )
        .filter(Boolean);
      const text = paragraphs.length ? paragraphs.join("\n") : runs.join(" ");
      slides.push({ name: name.split("/").pop(), text: decodeXmlEntities(text) });
    }
    return slides;
  };

  const pptxSlides = await collect(Object.keys(zip.files).filter((n) => n.startsWith("ppt/slides/")));
  const odpSlides = await collect(Object.keys(zip.files).filter((n) => n.startsWith("content.xml")));

  const slides = pptxSlides.length ? pptxSlides : odpSlides;
  if (!slides.length) {
    return {
      slides: [],
      message: "This presentation has no extractable text. Download it to view the original.",
    };
  }
  return { slides };
}

function decodeXmlEntities(value = "") {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}