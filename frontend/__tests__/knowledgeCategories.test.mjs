/**
 * __tests__/knowledgeCategories.test.mjs
 * --------------------------------------
 * The seven assistant knowledge categories (Policy, FAQs, SOPs, Compliance,
 * Handbook, Guide, Forms) must be visible in two places:
 *
 *   1. the Assistant Knowledge admin page (the only screen that authors them), and
 *   2. the employee-facing Company Documents list — testers on an employee login
 *      cannot open /hr-admin/assistant-knowledge (every knowledge route is
 *      get_current_admin, and roles.js gives the employee role no /hr-admin
 *      prefix), so this is the surface they can actually reach.
 *
 * These assert on the source rather than a render so a later refactor that
 * drops a category from either list fails loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ADMIN = "src/modules/shared-layers/assistant/AdminKnowledgePage.jsx";
const EMPLOYEE = "src/pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx";

// The canonical order — matches knowledge_sources.source_type in the backend
// (app/modules/assistant/models.py: policy | faq | sop | compliance |
// handbook | guide | form).
const EXPECTED_CODES = ["policy", "faq", "sop", "compliance", "handbook", "guide", "form"];
const EXPECTED_LABELS = ["Policy", "FAQs", "SOPs", "Compliance", "Handbook", "Guide", "Forms"];

function arrayLiteral(src, name, file) {
  const m = src.match(new RegExp(`const ${name} = (\\[[^;\\]]*\\])`));
  assert.ok(m, `${file} must declare const ${name}`);
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test("Assistant Knowledge admin offers all seven source types", () => {
  const src = fs.readFileSync(ADMIN, "utf8");
  assert.deepEqual(arrayLiteral(src, "SOURCE_TYPES", ADMIN), EXPECTED_CODES);
});

test("Assistant Knowledge admin displays readable labels for every category", () => {
  const src = fs.readFileSync(ADMIN, "utf8");
  for (const label of EXPECTED_LABELS) {
    // Label must exist as a literal (in SOURCE_TYPE_LABELS) and be used to
    // render, not left as the raw lowercase code.
    assert.match(src, new RegExp(`\\b${label}\\b`), `${ADMIN} must define the "${label}" label`);
  }
  assert.match(src, /typeLabel\(s\.source_type\)/, "list rows must render the label, not the raw code");
  assert.match(src, /typeLabel\(t\)/, "create/edit dropdowns must render the label, not the raw code");
  assert.match(src, /SOURCE_TYPES\.map\(\(t\) =>/, "the category chip row must render every type");
});

test("employee Company Documents shows every category for employee logins", () => {
  const src = fs.readFileSync(EMPLOYEE, "utf8");
  const categories = arrayLiteral(src, "CATEGORIES", EMPLOYEE);
  assert.equal(categories[0], "All categories");
  assert.deepEqual(categories.slice(1), EXPECTED_LABELS);

  // Each category needs an icon/badge style, or a rendered row would throw on
  // an undefined style object.
  for (const label of EXPECTED_LABELS) {
    assert.match(
      src,
      new RegExp(`^\\s+${label}: \\{ icon:`, "m"),
      `${EMPLOYEE} must style the "${label}" category`,
    );
  }
});

test("admin and employee categories stay in sync with each other", () => {
  const admin = fs.readFileSync(ADMIN, "utf8");
  const employee = fs.readFileSync(EMPLOYEE, "utf8");
  const codes = arrayLiteral(admin, "SOURCE_TYPES", ADMIN);
  const labels = arrayLiteral(employee, "CATEGORIES", EMPLOYEE).slice(1);

  assert.equal(codes.length, labels.length, "a category was added to one surface but not the other");
  // Every code must be rendered under a label of the same first letters, so a
  // category can't silently display as its raw code.
  for (const label of labels) {
    assert.match(admin, new RegExp(`\\b${label}\\b`), `admin must know how to display "${label}"`);
  }
});
