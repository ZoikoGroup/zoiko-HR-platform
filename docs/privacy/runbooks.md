# ZHR-PRIV-001 Prompt 2 — runbooks

Operational procedures for just-in-time support access. Every endpoint below requires a fresh-MFA platform (or tenant)
token. ":300" means the MFA check must be no older than the number.

## 1. Grant access to a tenant (the normal path)

1. **Request** (named engineer):
   `POST /super-admin/support-access/requests`
   body: `tenant_id`, `ticket_reference`, `purpose`, `purpose_category`, `scope`, `duration_minutes`, `legal_basis_reference`.
   The scope names `resources`, `record_ids`/`entity_ids`/`department_ids`, `fields`, `actions`. It grants nothing yet.
   A special-category scope without `legal_basis_reference`, or a duration over the cap, is refused here (fail closed).
2. **Tenant approves**: the tenant admin opens `GET /hr/support-access/requests` and
   `POST /hr/support-access/requests/{id}/approve` (may narrow the scope, never widen).
3. **Independent approval** (only when risk is HIGH): a Security or Privacy approver, not the requester,
   `POST /super-admin/support-access/requests/{id}/independent-approve`.
4. **Activate** (the requester only): `POST /super-admin/support-access/requests/{id}/activate`.
   The response sets the `zhr_support_grant` cookie (path `/support`). Every read then goes through
   `GET /support/tenants/{tenant_id}/...` with the SAME bearer token used to activate.

**Verify**: `GET /super-admin/support-access/grants` lists it; the tenant sees it on `/hr/support-access/activity`.

## 2. Revoke access

- **Tenant "Revoke now"**: `POST /hr/support-access/grants/{grant_id}/revoke` (fresh MFA, ≤300 s).
- **Platform**: `POST /super-admin/support-access/grants/{grant_id}/revoke`.
- Both are immediate: the next request with the old cookie is refused (revocation-version mismatch + cache tombstone).

## 3. Kill switch (emergency stop)

`POST /super-admin/support-access/kill-switch` body `{ "scope": "PERSON|SESSION|TENANT|GLOBAL", "target": "...", "reason": "..." }`.
- `PERSON` / `SESSION` / `TENANT` need a `target`; `GLOBAL` revokes every live grant.
- A tenant admin calls `POST /hr/support-access/kill-switch`; the scope is **forced** to their own tenant.
- **Verify**: `GET /super-admin/support-access/revocations` (or the tenant's `/hr/support-access/revocations`) shows the
  event with `propagation_confirmed`. Confirm the affected read returns 403.

## 4. Break-glass (emergency access when no authoriser is reachable)

1. `POST /super-admin/support-access/breakglass` — `{tenant_id, incident_reference, reason, scope}`. Read-only, no
   special-category/secret fields; a write verb or such a field is refused here. The session is `PENDING_CONFIRMATION`.
2. A **different** platform engineer: `POST /super-admin/support-access/breakglass/{id}/confirm` — returns the capability
   cookie. It is capped at `min(HR_SUPPORT_BREAKGLASS_MAX_MINUTES, 60)`, non-renewable.
3. End it: `POST /super-admin/support-access/breakglass/{id}/end` (revokes the capability).
4. An unconfirmed session lapses after 15 minutes (maintenance job). Review afterwards: `GET /super-admin/support-access/recertification`.

## 5. Verify the audit chain

`GET /super-admin/support-access/audit/verify` → `{ ok, first_bad_id, head_hash, count, genesis }`.
- `ok=true` — the chain is intact.
- `ok=false` — `first_bad_id` is the first row that no longer matches. Treat as a security incident: the record was
  edited or a row deleted. Preserve the DB, stop writes, and investigate with the DBA. The PostgreSQL append-only trigger
  should have prevented this; if it did not, the trigger is missing from the environment.

## 6. Daily / quarterly governance

- **Daily**: `GET /super-admin/support-access/reconciliation` must be `ok=true`. The maintenance job logs an `ALERT` per
  failed check; wire that log line to your pager.
- **Daily**: `GET /super-admin/support-access/detections` — clear any `critical`/`high` finding (live sensitive grant,
  live-after-close, unpropagated revocation, active break-glass).
- **Quarterly**: `GET /super-admin/support-access/recertification` — re-affirm each tenant authoriser, each long-lived
  grant, and review every emergency session.

## 7. Key rotation

- Rotating `SECRET_KEY` (or `HR_SUPPORT_GRANT_SIGNING_KEY`) invalidates every outstanding capability at once. To avoid a
  hard cut, set `HR_SUPPORT_GRANT_SIGNING_KEY` to the new key and let live grants expire (≤120 min) before removing the
  old derivation. Announce the rotation if a tenant has an active grant.

## 8. RLS / database roles (from Prompt 1, still open)

The application connects as the table owner, so the row-level-security policies do not bind yet. Follow `db_roles.md` to
move the application to a non-owner role, then re-run `test_rls_postgres.py` with `HR_PRIVACY_PG_ADMIN_URL`. The support
tables are `PLATFORM_META` control-plane metadata and are excluded from the tenant row-scope by design.
