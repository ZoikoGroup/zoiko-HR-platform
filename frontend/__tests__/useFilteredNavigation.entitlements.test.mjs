/**
 * Tests for entitlement-aware navigation filtering (Phase 6). Exercises the
 * exported `filterSectionsForRole` pure core with an entitlements map. Run
 * with: node --test frontend/__tests__/useFilteredNavigation.entitlements.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES } from "../src/config/roles.js";

const entries = [
  { label: "Ungated", href: "/gated/always", icon: () => null },
  { label: "Workflow", href: "/gated/workflow", icon: () => null, featureKey: "hr.documents.workflow" },
  { label: "SSO", href: "/gated/sso", icon: () => null, featureKey: "hr.identity.sso" },
  {
    label: "Group",
    icon: () => null,
    featureKey: "hr.documents.core",
    children: [{ label: "Child Ungated", href: "/gated/group/child", icon: () => null }],
  },
];

const sections = [{ title: "GATED", items: entries }];

test("no entitlements map leaves every item visible (backward compatible)", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/gated/always", "/gated/workflow", "/gated/sso", undefined]);
});

test("granted keys keep their items", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.workflow": "ENTITLED_AVAILABLE",
    "hr.identity.sso": true,
    "hr.documents.core": "READ_ONLY",
  });
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/gated/always", "/gated/workflow", "/gated/sso", undefined]);
});

test("ungranted keys drop their items but keep ungated ones", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.workflow": "NOT_ENTITLED",
    "hr.identity.sso": false,
    "hr.documents.core": "ENTITLED_NOT_CONFIGURED",
  });
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/gated/always"]);
});

test("string-state comparison treats READ_ONLY as granted", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.core": "READ_ONLY",
  });
  assert.ok(filtered[0].items.some((i) => i.href === undefined), "READ_ONLY group survives");
});
