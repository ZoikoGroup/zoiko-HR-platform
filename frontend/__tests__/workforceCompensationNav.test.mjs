/** Compensation and Workforce Planning stay in the sidebar for every HR role. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES } from "../src/config/roles.js";
import { collectNavMatches } from "../src/utils/navigationSearch.js";

const RESTORED_PREFIXES = ["/zoiko-hr/compensation", "/zoiko-hr/workforce-planning"];
const ALL_HREFS = [
  "/zoiko-hr/compensation", "/zoiko-hr/compensation/salary-structures", "/zoiko-hr/compensation/pay-grades",
  "/zoiko-hr/compensation/salary-components", "/zoiko-hr/compensation/bands", "/zoiko-hr/compensation/revisions",
  "/zoiko-hr/compensation/approvals", "/zoiko-hr/compensation/allowances", "/zoiko-hr/compensation/benefits",
  "/zoiko-hr/workforce-planning", "/zoiko-hr/workforce-planning/plans", "/zoiko-hr/workforce-planning/headcount",
  "/zoiko-hr/workforce-planning/succession", "/zoiko-hr/workforce-planning/job-descriptions",
  "/zoiko-hr/workforce-planning/reports",
];
// Managers keep neither HR-only approvals nor job descriptions (server refuses them).
const MANAGER_HREFS = ALL_HREFS.filter((h) => !["/zoiko-hr/compensation/approvals", "/zoiko-hr/workforce-planning/job-descriptions"].includes(h));

const walk = (items) => items.flatMap((i) => [i, ...(i.children ? walk(i.children) : [])]);
const navFor = (role) => walk(filterSectionsForRole(sections, role, ["hr"]).flatMap((s) => s.items));
const labels = (role) => navFor(role).map((i) => i.label);
const hrefs = (role) => navFor(role).map((i) => i.href).filter(Boolean);

for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER]) {
  const expected = role === ROLES.MANAGER ? MANAGER_HREFS : ALL_HREFS;
  test(`${role}: both sections and all their pages are in the sidebar`, () => {
    for (const label of ["Compensation", "Workforce Planning"]) assert.ok(labels(role).includes(label), `${label} missing for ${role}`);
    const kept = hrefs(role);
    for (const href of expected) assert.ok(kept.includes(href), `${href} missing for ${role}`);
  });

  if (role !== ROLES.MANAGER) {
    test(`${role}: sidebar search finds the restored sections`, () => {
      const searchable = filterSectionsForRole(sections, role, ["hr"]);
      for (const q of ["compensation", "workforce", "pay grades", "salary", "succession", "headcount", "job descriptions"]) {
        const hits = collectNavMatches(searchable, q).map((m) => m.href || "");
        assert.ok(hits.some((h) => RESTORED_PREFIXES.some((p) => h.startsWith(p))), `search "${q}" for ${role}`);
      }
    });
  }
}

test("only Employee Management stays hidden from Org Admin and HR Admin", () => {
  const marked = walk(sections.flatMap((s) => s.items))
    .filter((i) => i.excludeRoles?.includes(ROLES.ADMIN) && i.excludeRoles?.includes(ROLES.HR_ADMIN));
  assert.deepEqual(marked.map((i) => i.label), ["Employee Management"]);
});

test("My Compensation (the employee's own page) stays for managers and employees", () => {
  for (const role of [ROLES.MANAGER, ROLES.EMPLOYEE]) assert.ok(hrefs(role).includes("/employee/compensation"), role);
});
