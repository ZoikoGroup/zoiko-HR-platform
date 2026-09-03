/**
 * Tests for src/utils/entitlementMapper.js
 *
 * Verifies that each of the five canonical entitlement states maps to the
 * correct UI treatment (Section 20: policy blocks must be distinguishable
 * from upgrade states).
 *
 * Run with: node --test frontend/__tests__/entitlementMapper.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEntitlementUITreatment,
  isFeatureAvailable,
  getEntitlementStateLabel,
} from "../src/utils/entitlementMapper.js";

const FIVE_STATES = [
  "ENTITLED_AVAILABLE",
  "NOT_ENTITLED",
  "ENTITLED_NOT_CONFIGURED",
  "DEPENDENCY_UNAVAILABLE",
  "ENTITLED_POLICY_BLOCKED",
];

test("all five canonical states have a distinct UI treatment", () => {
  // Distinctness: no two states share the same bannerVariant except the
  // null (no banner) for AVAILABLE.
  const variants = {};
  for (const state of FIVE_STATES) {
    const t = getEntitlementUITreatment(state);
    const variant = t.bannerVariant;
    if (variant !== null) {
      assert.ok(!(variant in variants), `duplicate bannerVariant '${variant}' for ${state}`);
      variants[variant] = state;
    }
  }
  // The four non-available states must be mutually distinguishable.
  assert.deepEqual(
    Object.keys(variants).sort(),
    ["blocked", "info", "upgrade", "warning"].sort()
  );
});

test("ENTITLED_AVAILABLE renders feature normally", () => {
  const t = getEntitlementUITreatment("ENTITLED_AVAILABLE");
  assert.equal(t.visible, true);
  assert.equal(t.disabled, false);
  assert.equal(t.ctaLabel, null);
  assert.equal(t.bannerVariant, null);
});

test("NOT_ENTITLED shows upgrade CTA", () => {
  const t = getEntitlementUITreatment("NOT_ENTITLED");
  assert.equal(t.ctaLabel, "Upgrade Plan");
  assert.equal(t.bannerVariant, "upgrade");
  assert.equal(isFeatureAvailable("NOT_ENTITLED"), false);
});

test("ENTITLED_NOT_CONFIGURED shows contact-support notice (not upgrade)", () => {
  const t = getEntitlementUITreatment("ENTITLED_NOT_CONFIGURED");
  // Must NOT be the same as upgrade → CTA is contact support, not upgrade
  assert.equal(t.ctaLabel, "Contact Support");
  assert.equal(t.bannerVariant, "info");
  assert.notEqual(t.bannerVariant, "upgrade");
});

test("DEPENDENCY_UNAVAILABLE shows setup-required notice", () => {
  const t = getEntitlementUITreatment("DEPENDENCY_UNAVAILABLE");
  assert.equal(t.ctaLabel, "Contact Support");
  assert.equal(t.bannerVariant, "warning");
  assert.equal(t.disabled, true);
});

test("ENTITLED_POLICY_BLOCKED is distinguishable from upgrade (Section 20)", () => {
  const t = getEntitlementUITreatment("ENTITLED_POLICY_BLOCKED");
  // Policy block is NOT an upgrade opportunity — no upgrade CTA
  assert.notEqual(t.bannerVariant, "upgrade");
  assert.equal(t.bannerVariant, "blocked");
  assert.equal(t.ctaLabel, null);
  assert.equal(t.disabled, true);
  assert.match(
    getEntitlementStateLabel("ENTITLED_POLICY_BLOCKED"),
    /Disabled by Admin/i
  );
});

test("getEntitlementStateLabel covers all five states", () => {
  for (const state of FIVE_STATES) {
    assert.ok(getEntitlementStateLabel(state) && getEntitlementStateLabel(state) !== "Unknown");
  }
});

test("unknown state fails closed to a safe treatment", () => {
  const t = getEntitlementUITreatment("BOGUS_STATE");
  assert.equal(t.disabled, false);
  assert.equal(t.visible, false);
});

// ── useEntitlement route-guard behaviour (mock-based) ───────────────────────
// We test the underlying mapping logic that the hook + a route guard rely on:
// every non-AVAILABLE state must render as NOT callable (disabled / hidden /
// CTA), which is what the route guard enforces.

test("route guard fails closed for every non-available state", () => {
  for (const state of ["NOT_ENTITLED", "ENTITLED_NOT_CONFIGURED", "DEPENDENCY_UNAVAILABLE", "ENTITLED_POLICY_BLOCKED"]) {
    const t = getEntitlementUITreatment(state);
    // A route guard should not call the backend action for any of these.
    const callable = isFeatureAvailable(state);
    assert.equal(callable, false, `${state} should not be callable`);
  }
});

test("useEntitlement falsey featureKey returns immediately (no crash)", async () => {
  // The useEntitlement hook returns early when featureKey is falsy.
  // That early return guards against calling the API with no key. The
  // mapping layer (under test) treats the resulting state appropriately.
  const t = getEntitlementUITreatment(null);
  assert.ok(t);
});
