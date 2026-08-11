# SCOPE.md — Zoiko HR Platform

## In scope

### Backend modules
| Module | Routes | Owns |
|---|---|---|
| `employee` | auth (12) + employee CRUD | `employees`, `employee_profiles`, `employee_history`, `employee_lifecycle`, `employee_reporting`, `employee_benefits`, `employee_compensations` |
| `hr` | 452 | attendance, shifts, holidays, leave, assets, compensation/payroll structures, compliance, engagement, ESS, onboarding, performance, recruitment, travel, learning, HR documents, workforce planning, org config |
| `super_admin` | 14 | organizations, status control, audit logs, login activity, notifications (CRUD), platform settings, bootstrap |

~482 business routes, 99 tables.

### Roles
- **Super Admin** — platform-wide: org management, audit, notifications, platform settings.
- **Org Admin** — owns one organization; created via register, active immediately.
- **HR Admin** — HR operations within the org.
- **Manager** — team-level HR operations.
- **Employee** — self-service (ESS).

### Super-admin surface (frontend)
- Dashboard, Organizations + detail (profile / status control / audit activity)
- Audit Logs, Notifications (create/read/delete), Platform Settings

## Out of scope (monolith-owned products)

No backend module exists here and all related frontend pages/modules are deleted:

- **Billing / Billing Admin** — `billing_admin` role fully removed (roles.js, navigation, UserManagement, settings)
- **Payroll** — backend payroll routes absent; org-admin dashboard payroll entry now points to a guidance page
- **Spend, Inventory, Operations, Comply, Governance, Insights, Zoikotime**

Super-admin pages dropped (no backend contract): Products, Subscriptions, User Management, Analytics, System Health, Security, Support, Pending Organizations/Approvals.

## Boundaries enforced

- No imports of monolith-only packages at runtime; backend uses `_safe_import` so one broken module never takes down the app.
- `HR_`-prefixed env namespace; own `HR_SECRET_KEY`; own database.
- Register auto-activates orgs (approval flow intentionally absent).
- Legacy `/hr/compliance/*` handlers and compliance document handlers not carried over.

## Known deviations from monolith
- `OrganizationStatus` enum has no `REACTIVATED` member; reactivation uses `active` (fixed AttributeError that previously 500'd on suspend→active).
- Super-admin list endpoints return `{ list, total }` object shapes (not bare arrays).
