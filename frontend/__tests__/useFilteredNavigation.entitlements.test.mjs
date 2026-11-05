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
  { label: "Ungated", href: "/super-admin/dashboard", icon: () => null },
  { label: "Workflow", href: "/super-admin/audit-logs", icon: () => null, featureKey: "hr.documents.workflow" },
  { label: "SSO", href: "/super-admin/organizations", icon: () => null, featureKey: "hr.identity.sso" },
  {
    label: "Group",
    icon: () => null,
    featureKey: "hr.documents.core",
    children: [{ label: "Child Ungated", href: "/settings/user-management", icon: () => null }],
  },
];

// Paths are reachable by a SUPER_ADMIN so this file keeps testing the
// ENTITLEMENT filter only; role-based path filtering has its own tests.
const sections = [{ title: "GATED", items: entries }];

test("no entitlements map leaves every item visible (backward compatible)", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/super-admin/dashboard", "/super-admin/audit-logs", "/super-admin/organizations", undefined]);
});

test("granted keys keep their items", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.workflow": "ENTITLED_AVAILABLE",
    "hr.identity.sso": true,
    "hr.documents.core": "READ_ONLY",
  });
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/super-admin/dashboard", "/super-admin/audit-logs", "/super-admin/organizations", undefined]);
});

test("ungranted keys drop their items but keep ungated ones", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.workflow": "NOT_ENTITLED",
    "hr.identity.sso": false,
    "hr.documents.core": "ENTITLED_NOT_CONFIGURED",
  });
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/super-admin/dashboard"]);
});

test("string-state comparison treats READ_ONLY as granted", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.core": "READ_ONLY",
  });
  assert.ok(filtered[0].items.some((i) => i.href === undefined), "READ_ONLY group survives");
});

test("snapshot entries from useEntitlements keep granted items and fail closed otherwise", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", {
    "hr.documents.workflow": { state: "ENTITLED_AVAILABLE", granted: true },
    "hr.identity.sso": { state: "NOT_ENTITLED", granted: false },
    "hr.documents.core": { state: "READ_ONLY", granted: true },
  });
  const hrefs = filtered[0].items.map((i) => i.href);
  assert.deepEqual(hrefs, ["/super-admin/dashboard", "/super-admin/audit-logs", undefined]);
});

// Assistant Knowledge and Support Tickets follow the server's gate (assistant/plan_gate.py): the organization admin
// and HR admin see them in every plan state the admin API accepts — an evaluation included — and lose them only
// when the plan leaves the chatbot out or access is paused for an overdue payment.
test("Assistant Knowledge and Support Tickets show for org and HR admins in every state the server allows", async () => {
  const { sections: realSections } = await import("../src/navigation.js");
  const { GRANTED_STATES } = await import("../src/hooks/useEntitlements.js");
  const assistantItems = (role, state) => {
    const ent = state === undefined ? {} : Object.fromEntries(["hr.ai.policy_qa", "hr.ai.workflow_assist"]
      .map((key) => [key, { state, granted: GRANTED_STATES.has(state) }]));
    return filterSectionsForRole(realSections, role, ["hr"], "standard", ent)
      .flatMap((section) => section.items)
      .map((item) => item.label)
      .filter((label) => label === "Assistant Knowledge" || label === "Support Tickets");
  };
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN]) {
    for (const state of ["ENTITLED_AVAILABLE", "READ_ONLY", "TRIAL_RESTRICTED", "ENTITLED_NOT_CONFIGURED"]) {
      assert.deepEqual(assistantItems(role, state), ["Assistant Knowledge", "Support Tickets"], `${role} / ${state}`);
    }
    for (const state of ["NOT_ENTITLED", "DELINQUENCY_RESTRICTED", undefined]) {
      assert.deepEqual(assistantItems(role, state), [], `${role} / ${state ?? "unknown"}`);
    }
  }
});
