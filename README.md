# Zoiko HR Platform

Standalone, two-app platform extracted from the Zoiko One monolith: a FastAPI backend and a React (Vite) frontend. Full HR parity with the monolith but zero foreign-module runtime imports — its own database, its own JWT namespace, and a super-admin surface scoped to what the HR platform actually owns.

## Architecture

```
zoiko-hr-platform/
├── backend/               FastAPI app
│   ├── app/
│   │   ├── main.py            app assembly + safe router import
│   │   ├── config.py          env-driven settings (HR_* namespace)
│   │   ├── database.py        engine / session / create_all
│   │   ├── core/              auth deps, exceptions, services
│   │   ├── modules/
│   │   │   ├── employee/      auth + employees (owns `employees` tables)
│   │   │   ├── hr/            attendance, leave, assets, compensation, compliance,
│   │   │   │                  engagement, onboarding, performance, recruitment,
│   │   │   │                  travel, learning, documents, workforce, org-config
│   │   │   └── super_admin/   admin bootstrap, orgs, audit, notifications, settings
│   ├── scripts/seed_super_admin.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/              React (Vite)
    ├── src/
    │   ├── modules/           platform, super-admin, organization-admin, hr-admin,
    │   │                      zoiko-hr, shared-layers, settings
    │   ├── service/           api.js + per-module clients (superAdminService, hrService, …)
    │   ├── App.jsx            routes
    │   ├── navigation.js      HR-scope nav (billing admin removed)
    │   └── config/roles.js    HR roles only
```

## Database

- **PostgreSQL (Neon) is the only supported database.** Set `HR_DATABASE_URL` to your Neon connection string; the backend refuses to start without it.
- All connection/secret config lives under the `HR_` prefix so the platform can never read the monolith's `DATABASE_URL` / `SECRET_KEY`.
- `HR_DATABASE_URL`, `HR_SECRET_KEY`, `SUPER_ADMIN_SETUP_KEY`, `CORS_ORIGINS`, `SMTP_*` — see `backend/.env.example`.

### Migrations (Alembic)

- **Development** (`HR_DEBUG=true`): the backend still auto-creates all 99 tables on boot via `create_all`, for zero-friction local setup.
- **Production**: table creation on boot is skipped entirely. Run migrations as an explicit deploy step before starting the app:
  ```bash
  cd backend
  alembic upgrade head
  ```
- The first migration (`alembic/versions/17aefc359dab_*.py`) is a baseline that calls `Base.metadata.create_all()` directly rather than hand-written `CREATE TABLE`s, since this project ran on `create_all` with no migration history before now. Every schema change from here on should be a normal generated migration:
  ```bash
  alembic revision --autogenerate -m "add employee_x column"
  alembic upgrade head
  ```
- An **existing** database that already has these tables (e.g. this repo's shared dev DB) should be stamped rather than upgraded, so Alembic records history without re-running DDL:
  ```bash
  alembic stamp head
  ```

## Quickstart

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # then set HR_DATABASE_URL / HR_SECRET_KEY / SUPER_ADMIN_SETUP_KEY
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Startup log confirms table creation. 99 tables, ~482 business routes.

### Super admin bootstrap

```bash
.venv\Scripts\python scripts/seed_super_admin.py   # or POST /super-admin/bootstrap
```

The bootstrap unlock is `SUPER_ADMIN_SETUP_KEY` (sent in the **request body** as `setup_key`). Leave it empty to disable bootstrap entirely.

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

`VITE_API_BASE_URL` defaults to `http://localhost:8000`. The frontend `.env` keeps the preloaded demo credentials for the login screen.

### Smoke credentials (dev)

| Role          | Email                    | Password      |
|---------------|--------------------------|---------------|
| Super Admin   | `sa@zoiko.example.com`   | `SuperPass123!` |
| Org Admin     | `smoketest@zoiko.example.com` | `SmokePass123!` |

Register flow auto-activates new organizations (no approval queue) and promotes the registrant to Org Admin directly.

## Containers

Both apps have a `Dockerfile`, verified with a real local build + run against the shared dev Neon DB:

```bash
# Backend — bakes tesseract-ocr + the embedding model in; needs the same
# env vars as local dev (HR_DATABASE_URL, HR_SECRET_KEY, ...).
docker build -t zoiko-hr-backend ./backend
docker run --rm -p 8000:8080 --env-file backend/.env -e PORT=8080 zoiko-hr-backend

# Frontend — VITE_* vars are baked in at BUILD time, not read at container
# start, so the real backend URL must be passed as a build arg.
docker build -t zoiko-hr-frontend ./frontend --build-arg VITE_API_BASE_URL=https://your-backend-url
docker run --rm -p 5173:8080 -e PORT=8080 zoiko-hr-frontend
```

Or `docker compose up --build` from the repo root runs both together (see `docker-compose.yml` — local convenience only, not a deployment manifest).

Two non-obvious things the Dockerfiles work around, in case either build ever breaks again:
- `frontend`'s `puppeteer` devDependency tries to download a Chrome binary during `npm ci` and fails inside a plain Linux image (wrong Node engine version, no `unzip`). It isn't referenced anywhere in `src/`, so the Dockerfile sets `PUPPETEER_SKIP_DOWNLOAD=true` before installing rather than removing the dependency.
- `backend`'s embedding model (fastembed) is baked into the image at build time via `FASTEMBED_CACHE_PATH=/app/.cache/fastembed` — deliberately outside `/tmp`, since platforms like Cloud Run mount `/tmp` as an empty tmpfs at container start, which would otherwise discard a model cached at fastembed's own default path.

## Deploying

- **File uploads land on local disk** (`HR_DOCUMENT_UPLOAD_DIR` / `UPLOAD_BASE_DIR`, default `/tmp/uploads/...`) — there is no S3/object-storage integration. Whatever container/host runs the backend **must** mount a persistent volume over that directory, or uploaded HR documents, onboarding files, and assistant attachments are lost on every redeploy/restart and invisible to any second instance.
- Set `HR_DEBUG=false` (or omit it) in production — this disables the public `/docs`/`/redoc`/`/openapi.json` schema, skips the dev-only `create_all` boot path, and is required before running `alembic upgrade head` as described above.
- `HR_SECRET_KEY` has no default — startup fails loudly if it's unset, rather than silently signing tokens with a value visible in this repo's source.
- `CORS_ORIGINS` must list your real frontend origin(s); it's also used to validate the `Origin` header on error responses (401/403/404/500), not just successful ones.
- CI (`.github/workflows/ci.yml`) runs the backend test suite against a `pgvector/pgvector:pg16` service container and builds the frontend on every push/PR to `main`.

## Runtime boundaries

- JWT namespace: `HR_SECRET_KEY` + `HR_ALGORITHM` — tokens are unreadable by the monolith and vice-versa.
- Super-admin list endpoints return `{ <list>, total }` shapes; notification CRUD is fully supported.
- Product-owned tables (`billing`, `spend`, `inventory`, `operations`, `payroll`, `comply`, `governance`, `insights`, `zoikotime`) have **no** backend module here; frontend pages/modules for them are deleted, and the monolith owns those schemas.

See `SCOPE.md` for the full kept/dropped breakdown and `TABLE_OWNERSHIP.md` for the table map.
