/*
 * One way to show or save a fetched file: openFile(blob, name, mode).
 *
 *   "preview"  – shows the file in an in-app modal (PDF in an iframe of a blob URL with page/zoom controls, images inline).
 *                Never a new tab, never a download. The object URL is revoked when the viewer closes.
 *   "download" – saves the file through an <a download> click; the object URL is revoked right after.
 *
 * Why not a new tab with "noopener"? window.open then always returns null (so callers showed a false
 * "browser blocked" error, or fell back to downloading as well), and blob URLs in noopener tabs often render blank.
 *
 * Non-component code calls openFile(); the modal is drawn by <FileViewerHost/> (components/FileViewerModal.jsx). If no
 * host is mounted when a preview is asked for, one is mounted on document.body automatically.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { FileViewerHost } from "../components/FileViewerModal.jsx";

let current = null;               // { blob, name, url, type } | null
const listeners = new Set();
let mountedHosts = 0;
let autoRoot = null;

const emit = () => listeners.forEach((fn) => fn(current));

export function subscribeFileViewer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getOpenFile = () => current;

/** Called by FileViewerHost so openFile knows a host is on screen. */
export function registerFileViewerHost() {
  mountedHosts += 1;
  return () => { mountedHosts -= 1; };
}

const makeUrl = (blob) => (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "");
const revoke = (url) => { if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url); };

/** Saves a blob under `name` through a temporary <a download>. */
export function downloadBlob(blob, name = "download") {
  const url = makeUrl(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "download";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => revoke(url), 0);
  }
  return url;
}

export function closeFileViewer() {
  if (!current) return;
  revoke(current.url);
  current = null;
  emit();
}

function ensureHost() {
  if (mountedHosts > 0 || typeof document === "undefined") return;
  if (!autoRoot) {
    const el = document.createElement("div");
    el.setAttribute("data-file-viewer-root", "");
    document.body.appendChild(el);
    autoRoot = createRoot(el);
  }
  autoRoot.render(createElement(FileViewerHost));
}

/**
 * Show (mode "preview") or save (mode "download") a fetched file.
 * Accepts a Blob, or the { blob, filename } the service helpers return. `page` opens a PDF at that page.
 */
export function openFile(blobOrResult, name, mode = "preview", { page } = {}) {
  const blob = blobOrResult instanceof Blob || !blobOrResult?.blob ? blobOrResult : blobOrResult.blob;
  const fileName = name || blobOrResult?.filename || "document";
  if (!blob) return null;
  if (mode === "download") return downloadBlob(blob, fileName);
  if (current) revoke(current.url);
  current = { blob, name: fileName, url: makeUrl(blob), type: blob.type || "", page: Number(page) > 0 ? Number(page) : 1 };
  ensureHost();
  emit();
  return current.url;
}

/** Test helper: forget an auto-mounted host (jsdom between tests). */
export function __resetFileViewer() {
  closeFileViewer();
  if (autoRoot) { try { autoRoot.unmount(); } catch { /* already gone */ } autoRoot = null; }
  document.querySelectorAll?.("[data-file-viewer-root]").forEach((el) => el.remove());
}
