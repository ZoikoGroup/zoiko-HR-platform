/**
 * EntitlementGuard — opt-in per-page gate (Phase 7).
 *
 * The backend stays authoritative (see entitlement_middleware). This component
 * only improves UX: it renders the page's children while the key is granted,
 * a read-only banner when the key is READ_ONLY, or a denial panel (with an
 * upgrade CTA for upgrade-typical reason codes) when it is not.
 *
 * Usage:
 *   <EntitlementGuard featureKey="hr.documents.workflow">
 *     <ApprovalWorkflowPage />
 *   </EntitlementGuard>
 *
 * Props:
 *   featureKey   — registered Section 15 feature key
 *   children     — rendered when granted
 *   readOnly     — optional node replacing children when state is READ_ONLY
 *                  (defaults to children under a read-only banner)
 *   deny         — optional node replacing the default denial panel
 *   upgradeHref  — target for the upgrade CTA (default: billing & plan page)
 */
import React from "react";
import { useEntitlement } from "../hooks/useEntitlement";
import { EntitlementDenied } from "./EntitlementDenied";

export default function EntitlementGuard({
  featureKey,
  children,
  readOnly,
  deny,
  upgradeHref,
}) {
  const { state, mode, reasonCode, requiredPlan, loading, error, refetch } =
    useEntitlement(featureKey);

  if (loading) return null;

  if (state === "READ_ONLY") {
    if (readOnly) return readOnly;
    return (
      <div>
        <div
          role="status"
          style={{
            background: "#FFF7E6",
            border: "1px solid #F0C060",
            color: "#7A5A00",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          This feature is read-only on your current plan. You can view data,
          but changes are disabled.
        </div>
        {children}
      </div>
    );
  }

  if (state === "ENTITLED_AVAILABLE") return children;

  return (
    deny || (
      <EntitlementDenied
        featureKey={featureKey}
        state={state}
        mode={mode}
        reasonCode={reasonCode}
        requiredPlan={requiredPlan}
        error={error && refetch ? null : error}
        onRetry={refetch}
        upgradeHref={upgradeHref}
      />
    )
  );
}