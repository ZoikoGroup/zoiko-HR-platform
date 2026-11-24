/**
 * The employee sidebar shows MY WORKSPACE (and notifications), never the admin PRODUCTS menu. One link in PRODUCTS
 * (Zoiko HR → ESS → Attendance → /employee/ess/attendance) is an employee page, and used to keep the whole admin section
 * visible to employees. Managers still get PRODUCTS (their team pages); admins still reach their own attendance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";

const titles = (role) => filterSectionsForRole(sections, role, ["hr"], "standard", null).map((s) => s.title);
const hrefs = (role, title) => {
  const out = [];
  const walk = (items) => items.forEach((i) => { if (i.href) out.push(i.href); if (i.children) walk(i.children); });
  const s = filterSectionsForRole(sections, role, ["hr"], "standard", null).find((x) => x.title === title);
  if (s) walk(s.items);
  return out;
};

test("employees see their workspace, not the admin product menu", () => {
  assert.deepEqual(titles("employee"), ["MY WORKSPACE", "NOTIFICATIONS"]);
  assert.ok(hrefs("employee", "MY WORKSPACE").includes("/employee/ess/attendance"));      // their attendance is still there
});

test("managers keep the product menu for their team pages; admins still reach their own attendance", () => {
  assert.ok(titles("manager").includes("PRODUCTS"));
  assert.ok(hrefs("hr_admin", "PRODUCTS").includes("/employee/ess/attendance"));
});
