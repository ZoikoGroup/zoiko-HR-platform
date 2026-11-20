/**
 * __tests__/knowledgeCategories.test.mjs
 * --------------------------------------
 * The seven assistant knowledge categories (Policy, FAQs, SOPs, Compliance,
 * Handbook, Guide, Forms) must be visible in two places:
 *
 *   1. the Assistant Knowledge admin page (the only screen that authors them), and
 *   2. (until ZHR-DOCS-ARCH-001 Phase 6) the employee-facing Company Documents list — testers on an employee login
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

// ZHR-DOCS-ARCH-001 Phase 6: employee Company Documents no longer hard-codes a category list. It shows the organization's
// own company-document categories, and only the files the access rules share with that person (documentsPhase6 renders
// it). The assistant knowledge vocabulary above stays on the Assistant Knowledge page.
test("employee Company Documents builds its category filter from what is shared, not a fixed list", () => {
  const src = fs.readFileSync(EMPLOYEE, "utf8");
  assert.match(src, /getMyCompanyDocuments/, "the list comes from /hr/me/company-documents");
  assert.match(src, /groups\.map\(\(g\) => g\.category\)/, "the filter lists the categories the server returned");
  assert.doesNotMatch(src, /const CATEGORIES = \[/, "no fixed category vocabulary on the employee page");
});
