/**
 * __tests__/documentAccessibility.test.mjs
 * -------------------------------------------
 * Testing requirement #4 from the document-pages redesign prompt:
 * "Basic accessibility check on the new components: visible keyboard focus
 * state on View/Download buttons and tab controls, and color-contrast
 * compliance for Ink/Ink Soft against Surface White/Surface Soft at the
 * sizes actually used."
 *
 * Contrast is computed with the real WCAG 2.x relative-luminance formula
 * (not eyeballed) against the exact token hex values declared in
 * src/index.css's `@theme` block, so this test breaks (and should) if that
 * file's doc-* values ever drift from what's asserted here.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

const here = path.dirname(fileURLToPath(import.meta.url));

// ── WCAG 2.x contrast ratio (real formula, not approximated) ────────────────

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Pull the actual token values out of src/index.css (single source of
//    truth) rather than hardcoding them a second time here ─────────────────

const cssSource = fs.readFileSync(path.join(here, "../src/index.css"), "utf8");
function tokenValue(name) {
  const m = cssSource.match(new RegExp(`--color-doc-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`Token --color-doc-${name} not found in index.css`);
  return m[1];
}

const TOKENS = {
  surface: tokenValue("surface"),
  surfaceSoft: tokenValue("surface-soft"),
  ink: tokenValue("ink"),
  inkSoft: tokenValue("ink-soft"),
  primary: tokenValue("primary"),
};

test("doc-ink on doc-surface meets WCAG AA for normal text (>= 4.5:1)", () => {
  const ratio = contrastRatio(TOKENS.ink, TOKENS.surface);
  assert.ok(ratio >= 4.5, `Ink on Surface contrast is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
});

test("doc-ink on doc-surface-soft meets WCAG AA for normal text (>= 4.5:1)", () => {
  const ratio = contrastRatio(TOKENS.ink, TOKENS.surfaceSoft);
  assert.ok(ratio >= 4.5, `Ink on Surface Soft contrast is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
});

test("doc-ink-soft on doc-surface meets WCAG AA for normal text (>= 4.5:1) — used at text-xs for row meta/empty-state copy", () => {
  const ratio = contrastRatio(TOKENS.inkSoft, TOKENS.surface);
  assert.ok(ratio >= 4.5, `Ink Soft on Surface contrast is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
});

test("doc-ink-soft on doc-surface-soft meets WCAG AA for normal text (>= 4.5:1) — the tightest pairing in this palette", () => {
  const ratio = contrastRatio(TOKENS.inkSoft, TOKENS.surfaceSoft);
  assert.ok(ratio >= 4.5, `Ink Soft on Surface Soft contrast is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
});

test("doc-primary on white (button text context, reversed) meets WCAG AA for normal text (>= 4.5:1)", () => {
  const ratio = contrastRatio(TOKENS.primary, "#FFFFFF");
  assert.ok(ratio >= 4.5, `white text on Primary Blue contrast is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
});

// ── Keyboard focus: View/Download buttons and tab controls ──────────────────

test("DocumentRow's View and Download buttons carry a visible focus-visible outline", async () => {
  const { default: DocumentRow } = await import("../src/components/documents/DocumentRow.jsx");
  render(
    React.createElement(DocumentRow, {
      title: "Sample.pdf",
      onView: () => {},
      onDownload: () => {},
    })
  );
  const viewBtn = screen.getByRole("button", { name: /view/i });
  const downloadBtn = screen.getByRole("button", { name: /download/i });
  for (const btn of [viewBtn, downloadBtn]) {
    assert.match(btn.className, /focus-visible:outline\b/, "must define a focus-visible outline, not rely on the browser default");
    assert.match(btn.className, /focus-visible:outline-2\b/);
  }
  cleanup();
});

test("DocumentErrorState's Retry button carries a visible focus-visible outline", async () => {
  const { default: DocumentErrorState } = await import("../src/components/documents/DocumentErrorState.jsx");
  render(React.createElement(DocumentErrorState, { message: "Failed", onRetry: () => {} }));
  const retryBtn = screen.getByRole("button", { name: /retry/i });
  assert.match(retryBtn.className, /focus-visible:outline\b/);
  cleanup();
});

test("org-admin EmployeeDocumentsPage tab buttons carry a visible focus-visible outline", () => {
  const source = fs.readFileSync(
    path.join(here, "../src/modules/organization-admin/EmployeeDocumentsPage.jsx"),
    "utf8"
  );
  // Static source check (not a render) since exercising this page requires
  // mocking its whole data layer — documentPagesSharedComponents.test.mjs
  // already renders it; this just pins the tab buttons' class string.
  const tabButtonBlock = source.slice(source.indexOf("TABS.map"), source.indexOf("TABS.map") + 400);
  assert.match(tabButtonBlock, /focus-visible:outline\b/);
});
