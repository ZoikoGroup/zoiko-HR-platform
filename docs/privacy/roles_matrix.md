# Roles matrix

Source of truth in code: `core/dependencies.py` (who can pass which guard), `core/privacy/policy.py` (`GRANTS`), `core/privacy/employee_view.py`.

## Roles that exist
| Role (today) | Plane | Policy role | What it can do in tenant data |
|---|---|---|---|
| `super_admin` | platform | `PLATFORM_ADMIN` | **nothing** in tenant data. Control plane only: tenants, plans, Zoiko's own billing, platform settings, health; minimised activity and audit views; organization admin accounts |
| `admin` (organization admin) | tenant | `TENANT_ADMIN` | everything in its own organization (records, pay, cases, files, exports); not secrets |
| `hr_admin` | tenant | `HR_MANAGER` | the same as `admin` for HR data, **including pay fields, as it does today** |
| `billing_admin` | tenant | `BILLING_ADMIN` | Zoiko subscription billing for its organization; no people data |
| `manager` | tenant | `MANAGER` | direct reports' people and leave/attendance fields; never pay or cases; colleagues as directory only |
| `employee` | tenant | `EMPLOYEE` | own record in full; colleagues as directory only (name, title, department, designation, work e-mail) |
| (not in the product) | tenant | `TENANT_OWNER`, `PAYROLL_ADMIN`, `AGENCY_DELEGATE` | defined in the policy for when they exist; `PAYROLL_ADMIN` = people basics + pay, `AGENCY_DELEGATE` = basics inside its departments |
| service tokens | integration | `SERVICE` | only `<resource>:<action>` scopes inside the tenants the token names, audience `zoiko-hr` |
| the assistant | AI | `AI_AGENT` | exactly the person who called it |

## Where the platform used to inherit too much (A01, A07)
`super_admin` appeared in the allowed roles of `get_current_admin`, `get_current_org_admin` and the billing guards, and `get_scoped_organization_id` let it pick any organization. Result: every HR route worked for it with `?organization_id=`. It is now stopped before the handler runs (404). The guards still list `super_admin` (billing and control-plane routes need it); the data-plane routes never get that far.

## Decisions that need a human
1. **HR admin and pay.** HR admins can read and edit salary, CTC and the bank / tax profile today. The policy keeps that to avoid taking access away. To separate HR from finance give `HR_MANAGER` only BASIC and CONFIDENTIAL levels (`policy.GRANTS`) and add a payroll role.
2. **Managers and indirect reports.** Only direct reports (`reporting_manager_id`) get the manager view in the employee serializer; indirect reports are treated as colleagues.
3. **Directory contents.** `employee_view.DIRECTORY` decides what every colleague sees. Work e-mail is in; phone, login e-mail, employee code and personal details are out.
4. **Platform contact for a tenant.** See `platform_contact_decision.md`.

## Differences from before (for the people who notice)
- A plain employee or manager no longer sees a colleague's salary, CTC, phone, personal e-mail, address, date of birth or login e-mail in the employee list or detail; the record says which fields are hidden (`redacted`).
- Org-wide employee reports and the export are administrator-only.
- The platform can no longer reach any `/hr/*` route, the Documents / Expenses / Support / Approvals pages, or create tenant users.
