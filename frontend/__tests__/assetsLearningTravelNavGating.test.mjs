/** Audit A14, A15, L18, T18: HR Admin reaches the Assets pages, and the Assets, Learning and Travel menu items follow the plan. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES } from "../src/config/roles.js";

const walk = (items) => items.flatMap((i) => [i, ...(i.children ? walk(i.children) : [])]);
const navFor = (role, entitlements) => walk(filterSectionsForRole(sections, role, ["hr"], "standard", entitlements).flatMap((s) => s.items));
const hrefs = (role, entitlements) => navFor(role, entitlements).map((i) => i.href).filter(Boolean);

const MODULE = { "/organization-admin/assets": "hr.assets.core", "/zoiko-hr/learning": "hr.learning.core", "/zoiko-hr/travel": "hr.travel.core" };
const moduleOf = (href) => Object.keys(MODULE).find((p) => href === p || href.startsWith(p + "/"));

test("HR Admin now has the Assets and Asset Requests pages, like Org Admin", () => {
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
    const mine = hrefs(role);
    assert.ok(mine.includes("/organization-admin/assets"), `Assets missing for ${role}`);
    assert.ok(mine.includes("/organization-admin/assets/requests"), `Asset Requests missing for ${role}`);
  }
});

test("every Assets, Learning and Travel admin menu item carries its module's plan feature", () => {
  const items = walk(sections.flatMap((s) => s.items)).filter((i) => i.href && moduleOf(i.href));
  assert.ok(items.length >= 12);
  for (const item of items) assert.equal(item.featureKey, MODULE[moduleOf(item.href)], item.href);
});

test("a plan without Learning hides the Learning pages and leaves Assets and Travel alone", () => {
  const entitlements = { "hr.assets.core": true, "hr.learning.core": false, "hr.travel.core": true };
  const mine = hrefs(ROLES.ADMIN, entitlements);
  assert.deepEqual(mine.filter((h) => moduleOf(h) === "/zoiko-hr/learning"), []);
  assert.ok(mine.includes("/organization-admin/assets"));
  assert.ok(mine.includes("/zoiko-hr/travel/requests"));
});
