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

- **PostgreSQL (Neon) is the only supported database.** Set `HR_DATABASE_URL` to your Neon connection string; the backend refuses to start without it. Backend auto-creates all 99 tables on boot in development mode.
- All connection/secret config lives under the `HR_` prefix so the platform can never read the monolith's `DATABASE_URL` / `SECRET_KEY`.
- `HR_DATABASE_URL`, `HR_SECRET_KEY`, `SUPER_ADMIN_SETUP_KEY`, `CORS_ORIGINS`, `SMTP_*` — see `backend/.env.example`.

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

## Runtime boundaries

- JWT namespace: `HR_SECRET_KEY` + `HR_ALGORITHM` — tokens are unreadable by the monolith and vice-versa.
- Super-admin list endpoints return `{ <list>, total }` shapes; notification CRUD is fully supported.
- Product-owned tables (`billing`, `spend`, `inventory`, `operations`, `payroll`, `comply`, `governance`, `insights`, `zoikotime`) have **no** backend module here; frontend pages/modules for them are deleted, and the monolith owns those schemas.

See `SCOPE.md` for the full kept/dropped breakdown and `TABLE_OWNERSHIP.md` for the table map.
