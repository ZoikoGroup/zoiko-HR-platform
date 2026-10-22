/**
 * Document template engine (docs/templates): every page is routed and reachable, public signing/verification pages sit
 * outside the app shell, server-rendered document HTML is only ever shown in a fully sandboxed iframe, and the
 * acknowledgement step never presents itself as a signature.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { render, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
const app = read("src/App.jsx");
const nav = read("src/navigation.js");
const roles = read("src/config/roles.js");

const HR_PAGES = [
  "/zoiko-hr/documents/templates", "/zoiko-hr/documents/templates/variants/:variantId", "/zoiko-hr/documents/templates/:canonicalId",
  "/zoiko-hr/documents/clauses", "/zoiko-hr/documents/jurisdiction-packs", "/zoiko-hr/documents/generated",
  "/zoiko-hr/documents/policy-distributions", "/zoiko-hr/documents/governance",
];

test("every template-engine page is registered as a route", () => {
  for (const p of [...HR_PAGES, "/employee/documents/signatory-queue"]) {
    assert.ok(app.includes(`"${p}":`), `missing route ${p}`);
  }
  // the organization-admin legal entities page was removed on request (2026-10-22)
  assert.ok(!app.includes('"/organization-admin/legal-entities":'), "the legal entities page is gone");
});

test("candidate signing and verification are public routes outside the app shell", () => {
  const publicBlock = app.slice(app.indexOf("<Routes>"), app.indexOf("<Route element={<AppLayout />}>"));
  assert.match(publicBlock, /<Route path="\/sign\/:token" element={<CandidateSignPage \/>} \/>/);
  assert.match(publicBlock, /<Route path="\/verify\/:documentNumber" element={<VerifyDocumentPage \/>} \/>/);
});

test("navigation links to the new pages and roles allow the shared ones", () => {
  assert.ok(nav.includes('"/employee/documents/signatory-queue"'), "no nav entry for the signatory queue");
  // removed from the sidebar on request (2026-10-22); the pages stay routed for the links inside the app
  for (const href of ["/zoiko-hr/documents/generated", "/zoiko-hr/documents/templates", "/zoiko-hr/documents/clauses",
    "/zoiko-hr/documents/jurisdiction-packs", "/zoiko-hr/documents/centre", "/zoiko-hr/documents/policies",
    "/zoiko-hr/documents/policy-distributions", "/zoiko-hr/documents/governance", "/organization-admin/legal-entities"]) {
    assert.ok(!nav.includes(`"${href}"`), `${href} should not be in the sidebar`);
  }
  assert.equal((roles.match(/"\/organization-admin\/legal-entities"/g) || []).length, 0, "no role opens the removed page");
  assert.equal((roles.match(/"\/employee\/documents\/signatory-queue"/g) || []).length, 2, "admin and hr_admin (others via /employee/documents)");
});

test("document HTML is rendered in a sandboxed iframe with no permissions", async () => {
  const { default: SandboxedHtmlPreview } = await import("../src/components/documents/SandboxedHtmlPreview.jsx");
  const { container } = render(React.createElement(SandboxedHtmlPreview, { html: "<p>x</p><script>alert(1)</script>" }));
  const frame = container.querySelector("iframe");
  assert.ok(frame, "iframe rendered");
  assert.equal(frame.getAttribute("sandbox"), "", "an empty sandbox: no scripts, no same-origin, no forms");
});

test("no template-engine page injects document HTML into the app DOM", () => {
  const dirs = ["src/modules/zoiko-hr/documents/templates", "src/modules/zoiko-hr/documents/generated", "src/components/documents",
    "src/pages/public"];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(path.join(here, "..", dir), { recursive: true })) {
      if (!String(f).endsWith(".jsx")) continue;
      assert.ok(!read(path.join(dir, String(f))).includes("dangerouslySetInnerHTML"), `${dir}/${f} uses dangerouslySetInnerHTML`);
    }
  }
});

test("the acknowledgement step is never worded as signing or accepting", () => {
  const dialog = read("src/components/documents/DocumentActionDialog.jsx");
  const ackSection = dialog.slice(dialog.indexOf("Acknowledge receipt"), dialog.indexOf("Acknowledge receipt") + 1500);
  assert.ok(!/\bSign\b|\bAccept\b/.test(ackSection), "acknowledgement UI must not say Sign or Accept");
  assert.ok(dialog.includes("statements?.acknowledgement?.text") || dialog.includes("statements.acknowledgement.text"),
    "the acknowledgement text is the server's versioned statement, shown verbatim");
});
