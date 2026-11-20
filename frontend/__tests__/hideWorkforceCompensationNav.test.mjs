/** Workforce Planning and Compensation are temporarily hidden from the sidebar for Org Admin and HR Admin (menu only). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES } from "../src/config/roles.js";
import { collectNavMatches } from "../src/utils/navigationSearch.js";

const HIDDEN = ["Compensation", "Workforce Planning"];
const HIDDEN_PREFIXES = ["/zoiko-hr/compensation", "/zoiko-hr/workforce-planning"];

const walk = (items) => items.flatMap((i) => [i, ...(i.children ? walk(i.children) : [])]);
const navFor = (role) => walk(filterSectionsForRole(sections, role, ["hr"]).flatMap((s) => s.items));
const labels = (role) => navFor(role).map((i) => i.label);
const hrefs = (role) => navFor(role).map((i) => i.href).filter(Boolean);

for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
  test(`${role}: neither section nor any of their pages is in the sidebar or its search`, () => {
    for (const label of HIDDEN) assert.ok(!labels(role).includes(label), `${label} shown to ${role}`);
    assert.deepEqual(hrefs(role).filter((h) => HIDDEN_PREFIXES.some((p) => h.startsWith(p))), []);
    const searchable = filterSectionsForRole(sections, role, ["hr"]);
    for (const q of ["compensation", "workforce", "pay grades", "salary", "succession", "headcount", "job descriptions"]) {
      const hits = collectNavMatches(searchable, q).map((m) => m.href || "");
      assert.deepEqual(hits.filter((h) => HIDDEN_PREFIXES.some((p) => h.startsWith(p))), [], `search "${q}" for ${role}`);
    }
  });
}

test("a manager still has both sections, with every page they had", () => {
  for (const label of HIDDEN) assert.ok(labels(ROLES.MANAGER).includes(label), `${label} missing for manager`);
  const kept = hrefs(ROLES.MANAGER);
  for (const h of ["/zoiko-hr/compensation", "/zoiko-hr/compensation/pay-grades", "/zoiko-hr/compensation/salary-components",
    "/zoiko-hr/compensation/allowances", "/zoiko-hr/workforce-planning", "/zoiko-hr/workforce-planning/headcount",
    "/zoiko-hr/workforce-planning/succession"]) {
    assert.ok(kept.includes(h), `${h} missing for manager`);
  }
});

test("only the two sections were marked: nothing else changes for anyone", () => {
  const marked = walk(sections.flatMap((s) => s.items)).filter((i) => i.excludeRoles?.includes(ROLES.ADMIN) && i.excludeRoles?.includes(ROLES.HR_ADMIN));
  assert.deepEqual(marked.map((i) => i.label).sort(), ["Compensation", "Employee Management", "Workforce Planning"]);
});

test("My Compensation (the employee's own page) stays for managers and employees", () => {
  for (const role of [ROLES.MANAGER, ROLES.EMPLOYEE]) assert.ok(hrefs(role).includes("/employee/compensation"), role);
});
