# ZOIKO HR — Super Admin Command Center Commercial Standard (ZHR-SA-CMD-003)

> **STATUS STUB — full spec text not available in this repository.**
>
> ZHR-COM-ENT-001 §19 and §20 reference ZHR-SA-CMD-003 as the Super Admin
> Command Center Commercial Standard v3.0 (August 20, 2026). The full
> document text was not provided/checked in at the time this stub was
> created. Per the implementation-prompt Step 0 rule, this file is a
> placeholder and the spec has **not** been reconstructed from the
> section-number citations alone.
>
> Integration point used for ENT-001 work: the existing application code
> `backend/app/modules/command_center/` (command_center_router.py,
> command_center_models.py) is treated as the implemented source of truth
> for the Command Center's module IA, `/incidents` endpoint family, and
> Commercial Health surface. ENT-001 additions (active commercial
> exceptions, entitlement integrity, incident kill-switch) extend that
> existing code rather than build a parallel system.

---

## Controlled value header (from ENT-001 §19 reference)

| Field | Value |
|---|---|
| Document ID | ZHR-SA-CMD-003 |
| Version | 3.0 — Commercial Standard |
| Date | August 20, 2026 (per ZHR-COM-ENT-001 §27) |
| Status | Referenced; full text pending check-in |

## ENT-001 §19 required Command Center modules

- Catalog & Plans
- Subscriptions
- Trials & Pilots
- Entitlement Integrity
- Plan Changes
- Commercial Exceptions
- Reconciliation
- Audit

## Related ENT-001 requirements that shape Command Center work here

- §19.1 Operator override prohibition — no support agent may "just turn
  on" a paid feature by editing a tenant row; all exceptions typed with
  reason, approver, effective/expiry dates, audit evidence.
- §2 Source reconciliation — Commercial Health and Entitlement Integrity
  are control-plane concerns; add catalog, plan-change, trial, mismatch
  and reconciliation operations.
- §15.1 — typed reason codes surfaced to operators.
- ENT-ACC-15 — commercial exception searchable/auditable.

(Follow-up task: replace this stub with the authoritative ZHR-SA-CMD-003
text when the document is supplied.)