# ZHR-PRIV-001 Prompt 2 — evidence bundle

What to hand an auditor, and where each item lives. Everything is reproducible from a clean checkout.

## 1. Code

| Area | Path |
|---|---|
| Control plane (models, state, service, scopes, tokens, cache, events, jobs, audit, assurance, scheduler, router) | `backend/app/modules/support_access/` |
| Enforcement dependencies | `backend/app/modules/support_access/dependencies.py` |
| Central PDP hook | `backend/app/core/privacy/policy.py` (`_evaluate_support_grant`, `GrantCapability`) |
| Route classification | `backend/app/core/privacy/routes.py` |
| Layer registration | `backend/app/modules/support_access/dependencies.py` (imported by `backend/app/database.py`) |
| App wiring | `backend/app/main.py` (subscriber + maintenance scheduler) |

## 2. Migrations (reversible; tested up and down)

| Revision | Purpose |
|---|---|
| `5a6b7c8d9e0f` | support-access tables + PostgreSQL maker-checker trigger |
| `6b7c8d9e0f1a` | `privacy_audit_events` + PostgreSQL append-only trigger |
| `7c8d9e0f1a2b` | break-glass grant has no support request (`request_id` nullable) |

`python -m alembic heads` → single head `7c8d9e0f1a2b`.

## 3. Tests (the proof)

Run: `cd backend && python -m pytest tests/privacy -q` → **298 passed, 11 skipped**.

| File | Covers |
|---|---|
| `tests/privacy/test_support_access_model.py` | Phase 1: scope schema, risk, state machine, status-write scan, classification |
| `tests/privacy/test_support_access_flow.py` | T01–T12: the permitted path and every refusal |
| `tests/privacy/test_support_access_audit.py` | T13–T18: chain intact, tamper, delete, denial audited, verify endpoint |
| `tests/privacy/test_support_access_breakglass.py` | T19–T26: two-person, read-only, no special-category, capped, ends |
| `tests/privacy/test_support_access_revocation.py` | T27–T32: kill switch scopes, immediacy, job cancel, propagation record |
| `tests/privacy/test_support_access_assurance.py` | T33–T39: detection, reconciliation, recertification, transparency |
| Prompt 1 suites (unchanged) | boundary, IDOR, tenant scope, RLS (Postgres-gated), egress, tokens |

An end-to-end property/negative sweep is in `test_support_access_flow.py` and `test_platform_boundary.py`; the
route-classification sweep is `test_platform_boundary.py`.

## 4. Generated artefacts (CI-checked)

| Artefact | Generator | Check |
|---|---|---|
| `docs/privacy/data_classification.md` | `backend/scripts/privacy_classification_doc.py` | `--check` |
| `docs/privacy/endpoint_inventory.md` / `.json` | `backend/scripts/privacy_endpoint_inventory.py` | `--check` |

## 5. Design and operations documents

`control_status.md` (per-control P/F/U/N), `threat_model.md`, `runbooks.md`, `human_actions_required.md`,
`data_classification.md`, `endpoint_inventory.md`, `db_roles.md` (Prompt 1), `trust_boundary.md` (Prompt 1).

## 6. What is NOT yet proven (state it plainly to the auditor)

- Cross-node revocation ≤60 s with a real Redis (`F07` is `F`).
- External anchoring of the audit chain (`G04` is `F`; the seam exists).
- Production PostgreSQL run of migrations and RLS (`U`).
- Phase 13 UI (API-only today).
- Real notification delivery.
