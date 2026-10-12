/**
 * Reason-aware denial panel for ungranted features (Phase 7, Section 20).
 *
 * Distinguishes paywall reasons from policy/ops states so a blocked feature is
 * never painted as an upgrade prompt and an upgrade is never painted as an
 * admin decision.
 */
import React from "react";
import { getEntitlementDenialCopy } from "../utils/entitlementCopy";

export function EntitlementDenied({
  featureKey,
  state,
  reasonCode,
  requiredPlan,
  error,
  onRetry,
  upgradeHref,
}) {
  const copy = getEntitlementDenialCopy(reasonCode, state);
  const showUpgrade =
    copy.ctaLabel && (upgradeHref !== undefined ? upgradeHref : true);

  return (
    <div
      role="alert"
      style={{
        maxWidth: 560,
        margin: "40px auto",
        padding: "32px",
        border: `1px solid ${copy.border}`,
        borderRadius: 14,
        background: copy.background,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden="true">
        {error ? "⚠️" : copy.icon}
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
        {error ? "Unable to verify entitlement" : copy.title}
      </h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#4B5563" }}>
        {error ? copy.resolverError : copy.message}
        {!error && reasonCode && (
          <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "#9CA3AF" }}>
            Reason: {reasonCode}
            {requiredPlan ? ` · Upgrade to ${requiredPlan}` : ""}
          </span>
        )}
      </p>
      {error && onRetry ? (
        <button
          onClick={onRetry}
          style={buttonStyle(copy.cta)}
        >
          Retry
        </button>
      ) : (
        showUpgrade && (
          <a
            href={upgradeHref || copy.defaultUpgradeHref}
            style={{ ...buttonStyle(copy.cta), textDecoration: "none", display: "inline-block" }}
          >
            {copy.ctaLabel}
          </a>
        )
      )}
      <p style={{ margin: "14px 0 0", fontSize: 12, color: "#9CA3AF" }}>
        Feature: {featureKey}
      </p>
    </div>
  );
}

function buttonStyle(color) {
  return {
    marginTop: 16,
    padding: "10px 22px",
    border: "none",
    borderRadius: 999,
    background: color || "#3B82F6",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  };
}