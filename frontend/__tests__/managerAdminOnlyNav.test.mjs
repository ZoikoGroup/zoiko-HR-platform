/** Learning dashboard, Learning reports and Travel dashboard are organization-wide and admin-only on the API: managers don't get them in the menu. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES, ROLE_DISALLOWED_PREFIXES } from "../src/config/roles.js";

const walk = (items) => items.flatMap((i) => [i, ...(i.children ? walk(i.children) : [])]);
const hrefs = (role) => walk(filterSectionsForRole(sections, role, ["hr"]).flatMap((s) => s.items)).map((i) => i.href).filter(Boolean);

const ADMIN_ONLY = ["/zoiko-hr/learning", "/zoiko-hr/learning/reports", "/zoiko-hr/travel"];
const MANAGER_KEEPS = ["/zoiko-hr/learning/courses", "/zoiko-hr/learning/training-programs", "/zoiko-hr/learning/assessments",
  "/zoiko-hr/travel/requests", "/zoiko-hr/travel/approvals", "/zoiko-hr/travel/expenses", "/zoiko-hr/travel/settings"];

test("a manager's menu leaves out the admin-only Learning and Travel pages and keeps the rest", () => {
  const mine = hrefs(ROLES.MANAGER);
  for (const h of ADMIN_ONLY) assert.ok(!mine.includes(h), `${h} shown to manager`);
  for (const h of MANAGER_KEEPS) assert.ok(mine.includes(h), `${h} missing for manager`);
});

test("org admin and HR admin still see them", () => {
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
    const theirs = hrefs(role);
    for (const h of ADMIN_ONLY) assert.ok(theirs.includes(h), `${h} missing for ${role}`);
  }
});

test("the router also turns a manager away from Learning reports", () => {
  assert.ok(ROLE_DISALLOWED_PREFIXES[ROLES.MANAGER].includes("/zoiko-hr/learning/reports"));
});
