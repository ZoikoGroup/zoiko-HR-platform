# Where the platform (super admin) could reach tenant data, and what was done

Found by reading every route (`endpoint_inventory.md`), the platform pages and the services behind them.

| # | Exposure | Data | Control broken | Fixed by |
|---|---|---|---|---|
| 1 | Every `/hr/*` route accepted `super_admin` as an "admin" and an `organization_id` query parameter | everything an organization holds | A01, D02 | `PrivacyContextMiddleware` and the dependency gate answer 404 for platform identities on all DATA_PLANE routes |
| 2 | `/super-admin/users` listed every employee with names, e-mail, phone, code, title, with search | directory | E01 | admin accounts only, pseudonymous reference, masked address, search by organization name only |
| 3 | `/super-admin/organizations/{id}` showed admin name and e-mail, tax number, role counts | contact, tax id, small counts | E01, A08 | pseudonym + masked address, tax id removed, counts under 10 shown as "<10" |
| 4 | Organization list and dashboard returned exact per-organization and per-role counts | counts | A08 | suppression with a lower bound of `PRIVACY_MIN_COHORT` |
| 5 | Workflows page (`/super-admin/activity`) named the person, the target record, before/after values, IP and free-text errors; searchable by person | directory, pay, bank | E01, D03 | minimised view (role + pseudonym, action, organization, counts, failure code); person filters removed |
| 6 | Audit log page and per-organization audit logs: actor e-mail, entity id, IP, details | names, ids | E01 | tenant rows reduced to role + pseudonym; platform rows keep actor and IP; details scrubbed; probes limited to platform rows |
| 7 | Login activity and e-mail delivery logs: recipient address, subject, template variables, user agent | e-mail, tokens | E01 | masked / removed; recipient filter ignored |
| 8 | Notification centre could address individual people by id | recipients | D03 | refused; organization, role, plan or everyone only |
| 9 | `/super-admin/documents`, `/approvals`, `/expenses`, `/support` | tenant files, leave decisions, expense claims, employee tickets | A01, E04 | routers deleted, frontend pages removed |
| 10 | Webhook delivery payloads and workflow trigger payloads | event bodies | D03 | personal values scrubbed |
| 11 | Platform sidebar offered tenant product pages (`/zoiko-hr`, `/payroll`, shared Documents / Expenses) | navigation only | D01 | removed from the allow-list and navigation |
| 12 | Platform used `/hr/admin/users` to create, reset and suspend tenant users | accounts | A01 | `/super-admin/users` for organization admins only (create, reset link, suspend, activate) |
| 13 | Assistant admin routes reachable with `organization_id` | knowledge base, handoffs | A01 | `/assistant/*` is DATA_PLANE |
| 14 | `backend/add_mfa_cols.py` has a production database URL with a password in it | the database | secrets | **Not fixed here: rotate the password and delete the file** |
| 15 | A plain employee could read a colleague's full record (salary, CTC, phone, personal e-mail, address) through the employee list and detail, and the org-wide reports and export | pay, contact | E02, E06, T05 | field visibility by viewer (`core/privacy/employee_view.py`); reports and export are administrator-only |

No impersonation, "login as" or tenant switcher exists in the code (checked in the backend and the frontend).

Still reachable by design (control plane): tenants and plans, Zoiko's own subscription billing for a tenant, platform settings, service health, incidents, demo and pricing requests, command-centre aggregates. The command-centre figures are counts across the platform; per-tenant seat counts are billing quantities.

Known gap: platform dashboard and organization pages still count employees by reading the `employees` table. With the database roles in `db_roles.md` that read needs a count view or function the platform role may call.
