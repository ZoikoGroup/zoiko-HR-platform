/**
 * __tests__/documentNavigation.test.mjs
 * ---------------------------------------
 * Step 2 of the document-pages redesign prompt: the dead
 * /zoiko-hr/ess/documents/* nav group (confirmed via
 * `grep -n "/zoiko-hr/ess/documents" src/App.jsx` to have zero registered
 * routes) must be gone from navigation.js. /zoiko-hr/ess/my-documents is
 * resolved as option (a) "retire from the sidebar": its nav entry is removed
 * from navigation.js, but the route itself stays registered in App.jsx
 * because 8 other zoiko-hr/ess/*.jsx pages cross-link to it from their own
 * internal tab strip — removing the route would 404 from within that
 * self-contained mini nav (see PR description for the evidence).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const navSource = fs.readFileSync(path.join(here, "../src/navigation.js"), "utf8");
const appSource = fs.readFileSync(path.join(here, "../src/App.jsx"), "utf8");

test("navigation.js no longer references the dead /zoiko-hr/ess/documents/* group", () => {
  // Matches an actual href value, not the removal comment that documents why
  // it's gone (that comment legitimately mentions the path as prose).
  assert.doesNotMatch(navSource, /href:\s*["']\/zoiko-hr\/ess\/documents\//);
});

test("navigation.js still defines the working /employee/documents/* section (the one kept and redesigned)", () => {
  for (const route of [
    "/employee/documents/company",
    "/employee/documents/my-files",
    "/employee/documents/payslips",
    "/employee/documents/contracts",
    "/employee/documents/tax",
    "/employee/documents/upload-request",
  ]) {
    assert.match(navSource, new RegExp(route.replace(/\//g, "\\/")));
  }
});

test("navigation.js no longer links /zoiko-hr/ess/my-documents from the sidebar (retired, not silently duplicated)", () => {
  assert.doesNotMatch(navSource, /href:\s*["']\/zoiko-hr\/ess\/my-documents["']/);
});

test("App.jsx still registers a route for /zoiko-hr/ess/my-documents (kept per option (a): other zoiko-hr/ess pages cross-link to it internally)", () => {
  assert.match(appSource, /["']\/zoiko-hr\/ess\/my-documents["']/);
});

test("App.jsx has no registered route for any /zoiko-hr/ess/documents/* path (confirms the removed nav group really was dead)", () => {
  assert.doesNotMatch(appSource, /["']\/zoiko-hr\/ess\/documents\//);
});
