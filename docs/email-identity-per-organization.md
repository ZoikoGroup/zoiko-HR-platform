# E-mail identity is per organization

## The rule

1. **One address, many organizations.** The same e-mail address may have an account in any number of organizations. Each
   one is a completely separate account, with its own password, role, status, second factor and data.
2. **One address per organization.** Inside an organization an address appears once. Addresses are compared after
   trimming spaces and ignoring case, so `Sam@Acme.com` and ` sam@acme.com ` are the same address.
3. **No crossing over.** Nothing done in one organization's account reads, changes or reveals anything about another
   organization's account with the same address.

Platform (super admin) accounts have no organization (`organization_id IS NULL`). They are unique among themselves, and an
address used by a platform account cannot register a new organization.

## Where it is enforced

| Layer | What | Where |
| --- | --- | --- |
| Storage format | Every write stores the address trimmed and lower-cased | `Employee._normalise_email` (`backend/app/modules/employee/models.py`) |
| Database guarantee | Unique `(organization_id, lower(email))` for organization accounts; unique `lower(email)` for platform accounts | indexes `uq_employees_org_lower_email`, `uq_employees_platform_lower_email`; migration `d1e2f3a4b5c6` |
| Friendly check | Refuses an address already used **in the same organization** with 409 *"An employee with this email already exists in this organization."* | `identity.ensure_email_free` (`backend/app/modules/employee/identity.py`) |
| Race fallback | Two simultaneous adds: the index refuses the second, and the person gets the same 409, never a database error | `identity.is_duplicate_email_error`, the create functions in `employee/service.py`, `generic_exception_handler` |
| Sign-in | Only accounts whose own password matches are considered. One match signs in; several return `requires_org_selection` with a 5-minute, single-use selection token; `POST /auth/login/select-organization` finishes | `employee/service.py` `login_employee`, `login_selected_organization`; `identity.resolve_sign_in` |
| Sessions | Access and refresh tokens carry `id`, `sub` (address) and `organization_id`; each request resolves exactly one account | `core/dependencies.py` `get_current_user`; `/auth/refresh` |
| Security links | Reset, invite and verification tokens are bound to the address **and** organization; issuing one never cancels another account's link | `_issue_action_token`, `_revoke_outstanding_tokens`, `_token_account` |
| Tenant scope | Every tenant request's queries are limited to its organization | `core/privacy/tenant_scope.py` |

## Paths that set an address

All of these use `identity.ensure_email_free` with the target organization:

- self-service registration (also with Google)
- super admin "create organization"
- add employee
- add or invite a user, including a tenant admin added by a super admin
- onboarding a hire
- bulk import

In a bulk import, an address that already exists in the organization updates that person; it never creates a second account.
An address repeated within the same file, in any case, is refused for the later rows.

An account's address cannot be edited after it is created. No update endpoint accepts `email`, so an edit can never collide.

## Archived and deactivated accounts

They keep their address in their organization. Adding the same address again is refused with the duplicate message plus a
hint to reactivate the existing account in User Management, which keeps the person's history. It is never a raw database error.

## Sign-in and privacy

- Wrong password, unknown address and an address in several organizations all get the same answer: *"Invalid email or
  password."*
- An unknown address still costs one password check, so it takes as long as a wrong password on a known address.
- The work does grow with the number of accounts the address has (one password check per account). That reveals at most how
  many accounts an address has, never which organizations they are in.

## Forgot password with several accounts

Each active account gets its own e-mail, naming its organization in the subject. Each link resets that one account only.

## Tests

- `backend/tests/test_email_identity_per_org.py` covers every path, the database guarantee, the concurrency race, sign-in
  and links.
- `backend/tests/privacy/test_same_email_isolation.py` covers one address in two tenants across every read and write route,
  changes to one account, links, the selection token and sign-in answers.
