# Stack (verified in the repository, not assumed)

The control standard was written for Django + Next.js + Celery. This codebase is different, so every control was adapted. Nothing below is a guess.

| Area | What is actually there |
|---|---|
| Backend | FastAPI (installed 0.141, `requirements.txt` pins 0.111), Starlette, Pydantic v2, SQLAlchemy 2, Alembic, slowapi (rate limits), APScheduler (jobs) |
| Frontend | React 19 + Vite single-page app, react-router 7, TanStack Query. No Next.js, no server components, no API routes, no GraphQL |
| Database | PostgreSQL (Neon in production) through psycopg; SQLite in the unit tests |
| Auth | Own JWT (python-jose, HS256). Access token carries sub, role, id, organization_id, aud; refresh token carries typ=refresh. Roles are one enum on the `employees` row (`super_admin`, `admin`, `hr_admin`, `billing_admin`, `manager`, `employee`) |
| Tenant | `organization_id` (integer) on every tenant table; 124 tables carry it directly, 38 more reach it through a parent |
| Platform | A `super_admin` is a row in the same `employees` table with no organization |
| Background work | No Celery. APScheduler loops (`modules/billing/scheduler.py`, `modules/integrations/worker.py`) and fire-and-forget threads (`_notify_email_async`) |
| Cache | `core/cache.py` (in-process, or Redis when `HR_REDIS_URL` is set) for entitlement / org-access decisions; `core/cache_middleware.py` response cache keyed by organization + user + path (Redis only) |
| Search | SQL `ILIKE` filters in the routes; assistant retrieval is pgvector (`fastembed`), filtered by organization in `retrieval_service.retrieve` |
| Files | Local disk under `HR_DOCUMENT_UPLOAD_DIR`, `ONBOARDING_DOC_UPLOAD_DIR`, `ASSISTANT_ATTACHMENT_UPLOAD_DIR`. No object storage, no public URLs |
| E-mail | SMTP through `services/email_service.py` (queued, own DB session) |
| Error tracking / analytics | None in the repo (no Sentry, no analytics SDK). `core/privacy/redact.py` ships a `before_send` scrubber ready for one |
| AI assistant "Mira" | `modules/assistant/` (conversation, orchestration, retrieval, guardrails). Provider: Groq (`llm_client.py`). Tools: `assistant/tool_registry.py` |
| Integrations | `modules/integrations/` (webhooks, workflows, channels). Zoiko Payroll, ZoikoTime, Docs Pro, ZoikoID and Zoiko One are not called from this repository; the token rules in `core/privacy/tokens.py` are what they must present |
| New dependencies | `pyotp` (TOTP second factor, already installed, now pinned) and `hypothesis` (property tests, test-only). Nothing else |
