# ZHR-PRIV-001 Prompt 2 — threat model (just-in-time support access)

Scope: the support-access control plane (`backend/app/modules/support_access/`), its one hook in the central PDP
(`policy._evaluate_support_grant`), the enforced data path (`/support/...`), the audit chain, and break-glass. The AI
assistant (Mira) is out of scope — this work does not touch it.

## Assets

| Asset | Why it matters |
|---|---|
| Tenant employee records | name, contact, job; the everyday target |
| Special-category data | `leave_requests.reason`, `employee_profiles.religion` — the highest harm if leaked |
| Financial data | `employee_profiles.bank_account`, `pan_number` |
| Secrets | `employees.hashed_password` — must never be in any scope |
| The capability token | a signed, single-tenant, short-lived bearer |
| The audit record | the only evidence of who touched what |
| Tenant trust | the tenant must be able to see and stop platform access |

## Actors

| Actor | Trust |
|---|---|
| Platform engineer (super_admin) | authenticated, named; **no standing data access** |
| Tenant administrator | can designate authorisers and revoke now |
| Security / Privacy approver | independent co-approver for HIGH risk |
| Malicious insider (platform) | the primary adversary this design defeats |
| Compromised platform account | limited to what a fresh-MFA, dual-approved, scoped grant allows |
| Tenant attacker | cannot reach another tenant; cannot widen an approval |
| Outsider without a token | refused on every path |

## Threats and mitigations

| # | Threat | Mitigation | Where / test |
|---|---|---|---|
| T1 | A platform admin reads tenant data with no request | No route serves tenant data without `grant_context`; `/support` refuses without a live grant | `grant_context`, T02 |
| T2 | One engineer both requests and approves | Self-approval refused; HIGH risk needs an independent decision | T08, T10 |
| T3 | Approval widened beyond the request | Narrow-only intersection | model narrowing tests |
| T4 | Capability replayed in another session/device | Bound to `sid` (token iat) and `dev` (UA/AL) | `grant_context` |
| T5 | Capability used after revocation | Revocation-version mismatch + cache tombstone | T30 |
| T6 | Capability used past expiry | `expires_at` checked per request | flow tests |
| T7 | Read across tenants | Grant is single-tenant; policy refuses a foreign tenant | T05 |
| T8 | Read a record outside the granted list | `record_ids` object scope | T03 |
| T9 | Read a field outside the grant | Default view = grant; explicit extra field refuses | T01, T04 |
| T10 | Elevate read to export | Verb separation | T06 |
| T11 | `impersonate` at all | Never grantable | model tests |
| T12 | Secret/special values leak into scope | `validate_scope` refuses SECRET; special needs Privacy + legal basis | model tests, E02 |
| T13 | Edit or delete the audit record | SHA-256 chain; a break is named; PG append-only trigger | T13, T14, T15 |
| T14 | A denial is not recorded (repudiation) | Denials are audited and committed before the 403 | T16 |
| T15 | Everything depends on one engineer being available | Break-glass — but two-person, read-only, ≤60 min, no special-category | T19–T26 |
| T16 | Revocation is slow across nodes | Redis pub/sub + 5 s TTL + version check | T30, F07 |
| T17 | A revoked grant leaves a running export | Jobs cancelled with the grant | T31 |
| T18 | Quiet probing of the boundary | Denial-burst detection | T38 |
| T19 | Orphan/live-after-close grant | Detection + reconciliation | T33, T35 |
| T20 | Tenant has no visibility or control | Transparency read model + "Revoke now" + tenant kill switch | T37, T07, T29 |

## Residual risks (accepted or handed to a human)

1. **HS256 signing key** is derived from `SECRET_KEY` unless `HR_SUPPORT_GRANT_SIGNING_KEY` is set. A leaked server key
   could mint a capability — but the capability is still checked against the live grant row and its revocation version, so
   a forged token alone does not survive a revocation. Set a dedicated key (or RS256) in production.
2. **No external anchor** for the audit chain: a privileged DB user could rewrite the whole chain consistently. Anchoring
   to an append-only external sink (`audit.anchor`) is the fix and is left as a seam.
3. **Cross-node ≤60 s** is by construction (pub/sub + TTL) but is proven end-to-end only with a Redis deployment.
4. **Notification delivery** is a seam; until wired, the tenant's authoritative view is the transparency page, not e-mail.
5. **Phase 13 UI** is not built; controls are API-only today.
6. The application DB role is still the table owner for the Prompt 1 RLS work — see `db_roles.md`.

## Trust boundary

```
 outsider ──▶ FastAPI ──▶ route class (control plane vs data plane)
                 │
 platform ───────┼──▶ /support/*  ──▶ grant_context ──▶ policy.authorize ──▶ row
 tenant ─────────┘        (only a live, scoped, checked grant reaches here)
                 │
                 └──▶ support_access tables (control-plane metadata, PLATFORM_META)
                 └──▶ privacy_audit_events (append-only, hash-chained, no tenant FK)
```

See `trust_boundary.md` (Prompt 1) for the platform/tenant split this builds on.
