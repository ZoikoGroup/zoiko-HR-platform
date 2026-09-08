/**
 * Tests for the entitlement denial-copy/classification utilities (Phase 7).
 * Run with: node --test frontend/__tests__/entitlementCopy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEntitlementDenialCopy,
  classifyDenialReason,
  PAID_REASONS,
  BLOCKED_REASONS,
  READONLY_REASONS,
} from "../src/utils/entitlementCopy.js";

test("paid reasons render an upgrade CTA", () => {
  for (const code of ["PLAN_REQUIRED", "TRIAL_RESTRICTED", "LIMIT_REACHED"]) {
    const copy = getEntitlementDenialCopy(code);
    assert.ok(copy.ctaLabel, `${code} should offer an upgrade CTA`);
    assert.equal(classifyDenialReason(code), "paid");
  }
});

test("policy/ops reasons are never painted as upgrade prompts", () => {
  for (const code of ["SUBSCRIPTION_INACTIVE", "POLICY_BLOCKED", "PAYMENT_RESTRICTED"]) {
    const copy = getEntitlementDenialCopy(code);
    assert.notEqual(copy.title, "Upgrade required", `${code} must not say upgrade`);
    assert.equal(classifyDenialReason(code), "blocked");
  }
});

test("downgrade read-only reason classifies as readonly", () => {
  assert.equal(
    classifyDenialReason("DOWNGRADE_PENDING_READ_ONLY"),
    "readonly",
  );
  assert.equal(classifyDenialReason("PLAN_REQUIRED", "READ_ONLY"), "readonly");
});

test("unknown codes fall back to generic copy and 'unknown' classification", () => {
  const copy = getEntitlementDenialCopy("ROLE_DENIED");
  assert.equal(copy.title, "Feature unavailable");
  assert.equal(classifyDenialReason("ROLE_DENIED"), "blocked");
  assert.equal(classifyDenialReason("SOME_FUTURE_CODE"), "unknown");
});

test("ENTITLED_NOT_CONFIGURED renders setup copy regardless of reason code", () => {
  const copy = getEntitlementDenialCopy("PLAN_REQUIRED", "ENTITLED_NOT_CONFIGURED");
  assert.equal(copy.title, "Setup required");
});

test("reason sets are disjoint and complete against the 13 Section 15.1 codes", () => {
  const all13 = [
    "PLAN_REQUIRED",
    "TRIAL_RESTRICTED",
    "SUBSCRIPTION_INACTIVE",
    "PAYMENT_RESTRICTED",
    "CONFIG_REQUIRED",
    "DEPENDENCY_REQUIRED",
    "POLICY_BLOCKED",
    "DOWNGRADE_PENDING_READ_ONLY",
    "ROLE_DENIED",
    "TENANT_SCOPE_DENIED",
    "JURISDICTION_BLOCKED",
    "LIMIT_REACHED",
    "INCIDENT_DISABLED",
  ];
  const union = new Set([...PAID_REASONS, ...BLOCKED_REASONS, ...READONLY_REASONS]);
  for (const code of all13) {
    assert.ok(union.has(code), `${code} missing from classification sets`);
  }
  const paid = new Set(PAID_REASONS);
  for (const code of [...BLOCKED_REASONS, ...READONLY_REASONS]) {
    assert.ok(!paid.has(code), `${code} double-classified`);
  }
});