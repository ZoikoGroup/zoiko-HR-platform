/** Post-submission onboarding D: one in-app file viewer; preview never downloads or opens a tab; no noopener blob tabs left. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";

import { openFile, closeFileViewer, getOpenFile, __resetFileViewer } from "../src/utils/fileViewer.js";
import { FileViewerHost } from "../src/components/FileViewerModal.jsx";
import { startLiveRefresh } from "../src/utils/useLiveRefresh.js";

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

function spyUrls(t) {
  const made = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", () => { const u = `blob:test/${made.length + 1}`; made.push(u); return u; });
  t.mock.method(URL, "revokeObjectURL", (u) => revoked.push(u));
  return { made, revoked };
}
function spyAnchorClicks(t) {
  const clicks = [];
  t.mock.method(window.HTMLAnchorElement.prototype, "click", function click() { clicks.push({ href: this.href, download: this.download }); });
  return clicks;
}

afterEach(() => { cleanup(); __resetFileViewer(); });

test("preview opens the in-app modal: no anchor download, no new tab; closing revokes the URL", async (t) => {
  const { revoked } = spyUrls(t);
  const clicks = spyAnchorClicks(t);
  const opened = [];
  t.mock.method(window, "open", (...a) => { opened.push(a); return null; });
  render(React.createElement(FileViewerHost));
  await act(async () => { openFile(new Blob(["%PDF-1.4"], { type: "application/pdf" }), "Offer Letter.pdf", "preview"); });
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Preview of Offer Letter.pdf" });
  const frame = dialog.querySelector("iframe");
  assert.ok(frame, "a PDF shows in an iframe");
  assert.match(frame.getAttribute("src"), /^blob:test\/1#page=1&zoom=100$/);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  assert.match(dialog.querySelector("iframe").getAttribute("src"), /#page=2&zoom=125$/);
  assert.equal(clicks.length, 0, "a preview never downloads");
  assert.equal(opened.length, 0, "a preview never opens a tab");
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  await settle();
  assert.equal(screen.queryByRole("dialog"), null);
  assert.deepEqual(revoked, ["blob:test/1"]);
  assert.equal(getOpenFile(), null);
});

test("images preview inline; the viewer mounts itself when no host is on the page", async (t) => {
  spyUrls(t);
  const clicks = spyAnchorClicks(t);
  await act(async () => { openFile({ blob: new Blob(["x"], { type: "image/png" }), filename: "id.png" }); });
  await settle();
  const img = document.querySelector('[data-testid="file-viewer"] img');
  assert.ok(img, "the auto-mounted viewer shows the image");
  assert.equal(img.getAttribute("alt"), "id.png");
  assert.equal(clicks.length, 0);
  await act(async () => closeFileViewer());
});

test("download mode clicks an <a download> with the name and revokes the URL", async (t) => {
  const { revoked } = spyUrls(t);
  const clicks = spyAnchorClicks(t);
  openFile(new Blob(["x"], { type: "application/pdf" }), "Contract.pdf", "download");
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].download, "Contract.pdf");
  assert.equal(document.querySelector('[data-testid="file-viewer"]'), null, "no modal for a download");
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(revoked, ["blob:test/1"]);
});

test("live refresh: on focus, on becoming visible, and on the interval only while visible", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const stop = startLiveRefresh(() => { calls += 1; }, 30000);
  window.dispatchEvent(new window.Event("focus"));
  assert.equal(calls, 1);
  t.mock.timers.tick(30000);
  assert.equal(calls, 2);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  t.mock.timers.tick(30000);
  assert.equal(calls, 2, "no polling in a hidden tab");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(calls, 3);
  stop();
  t.mock.timers.tick(60000);
  assert.equal(calls, 3);
});

// ── lint guard: blob/file previews go through openFile, never a noopener tab ─────────────────────────────────────────
const SRC = fileURLToPath(new URL("../src", import.meta.url));
// external links (meeting links, the support login URL) may still open in a new tab
const ALLOWED = new Set([
  "modules/zoiko-hr/recruitment/interviews.jsx",
  "modules/super-admin/TempSupportAccessPage.jsx",
]);
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|mjs|tsx?)$/.test(name)) yield p;
  }
}

test("no window.open(…, 'noopener') outside the external-link allow-list", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, "/");
    if (ALLOWED.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    const re = /window\.open\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(text))) {
      if (/noopener/.test(m[1])) offenders.push(`${rel}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `use openFile() from utils/fileViewer.js instead:\n${offenders.join("\n")}`);
});
