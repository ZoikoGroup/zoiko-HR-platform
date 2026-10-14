# ZHR-PRIV-001 Prompt 2 — human actions required

Decisions or actions this work deliberately leaves to a person. None blocks the code; each closes a gap marked `F`/`N`
in `control_status.md`.

1. **Set a dedicated grant signing key.** `HR_SUPPORT_GRANT_SIGNING_KEY`, or a PEM for RS256. The default derives from
   `SECRET_KEY` (HS256). Rotating it invalidates every live capability — do it during a quiet window, or when no grant is
   active.

2. **Configure external audit anchoring.** `audit.anchor(sink=...)` is a seam with no destination. Point it at an
   append-only external sink (a separate store, a WORM bucket, a third-party log) and schedule a periodic anchor so a
   full-chain rewrite in the primary DB is detectable. Until then, tamper-evidence is within the DB only.

3. **Wire tenant notifications.** `service.notify_tenant` emits a `TENANT_NOTIFIED` event and logs it; no e-mail/portal
   message is delivered. Choose the channel (e-mail via the existing e-mail service, or the tenant portal feed) and
   subscribe to the event. The tenant's authoritative view is `/hr/support-access/activity` meanwhile.

4. **Deploy Redis.** `HR_REDIS_URL` enables the revocation pub/sub fan-out and the cross-node ≤60 s guarantee
   (`cache.start_subscriber` is already wired into the app lifespan). Without it, a single node is still bounded by the
   5 s cache TTL and the per-request version check.

5. **Decide the review cadence and owner.** The recertification queue (`/super-admin/support-access/recertification`)
   needs a named owner and a schedule (quarterly suggested). The reconciliation `ALERT` log line
   (from `support_access/scheduler.py`) needs a pager route.

6. **Build the Phase 13 UI.** Platform: request/approve/revoke/kill-switch screens and a live "support session active"
   banner for the tenant. Tenant: approve, "Revoke now", and the transparency page. All APIs exist; no React screen is
   built. Also expose the platform's detections/reconciliation to the on-call surface.

7. **Rotate and delete `backend/add_mfa_cols.py`** (still open from Prompt 1 — it contains a hard-coded production URL).

8. **Move the application DB role** off the table owner so the Prompt 1 RLS policies bind (`db_roles.md`), then run the
   PostgreSQL privacy tests with `HR_PRIVACY_PG_ADMIN_URL`.

9. **Confirm the retention/erasure story for `privacy_audit_events`.** The chain is append-only; GDPR erasure must not
   break it. Decide whether audit rows are pseudonymised on erasure (rewriting the chain is not an option) and record the
   decision. The table stores names/ids and non-sensitive metadata only, never field values.

10. **Run the migrations and the classification/inventory checks against a production-equivalent PostgreSQL.** This work
    validated migrations on SQLite and the logic on the test database; it never contacted the live database.
