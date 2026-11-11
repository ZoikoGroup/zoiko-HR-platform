# QA reports of 6 and 10 Nov 2026: fixes and retest guide

Sources: **Report A** "Bug Report – Zoiko HR Platform" (Siddhartha, 10 Nov 2026, A1–A5) and **Report B** "Bug Report" (yaswanth, 6 Nov 2026, B1–B38, reconciled as in the fix prompt).
Branch: `rugvedh`. A4 (AI assistant) is out of scope: the assistant and support tickets are owned by another workstream and were not changed.

## Summary

| Bug | Root cause | Fix | Main files | Tests | Status |
|---|---|---|---|---|---|
| A1 | Production `API_BASE_URL` is unset: `GET https://api.zoikohr.com/auth/google/login` (checked 11 Nov) sends Google `redirect_uri=http://localhost:8000/auth/google/callback`, so Google refuses it (`redirect_uri_mismatch`) or sends the browser to localhost. `FRONTEND_URL` very likely has the same problem. Google sign-in is enabled there and CORS for `/auth/google/exchange` is correct. | The redirect URI falls back to the request's public address when the configured base is local; the app's origin is carried in the signed state (checked against the CORS allow-list) so people return to the app; the account is picked the way password sign-in picks it; one-time tickets are claimed in Redis when configured; the login page goes to the role's home (or `/change-password`) and shows every failure. | `employee/google_auth.py`, `employee/router.py`, `employee/service.py`, `LoginPage.jsx`, `utils/googleSignIn.js`, `.env.example` | `test_google_signin.py` (A1 tests), `googleSignIn.test.mjs` | Fixed in code. **Needs production config** (see below). |
| A2 | `ChangePasswordPage` had no visibility toggle. | New `PasswordInput` (own eye per field, `type="button"`, `aria-label`, `aria-pressed`, keeps focus and caret), used on every password field. | `components/PasswordInput.jsx`, auth pages, `Employee_settings.jsx`, `StepUpDialog.jsx`, `ZoikoConnectPage.jsx` | `passwordVisibility.test.mjs` | Fixed |
| A3 | `ResetPasswordPage` had one eye on New, and the same `show` state also drove Confirm. | Independent `PasswordInput` on both. | `ResetPasswordPage.jsx` | `passwordVisibility.test.mjs` | Fixed |
| A4 | – | – | – | – | **Not changed: the AI assistant is a protected area owned by another workstream** |
| A5 | `review_leave()` only called `notify_org_admins()`: the requester was never notified, and every notification call was wrapped in `except Exception: pass`. | `notify_users()` (user-targeted, org-scoped, skips people without an active login); leave events in the HR service layer (approved/rejected → requester; submitted/cancelled → approvers); the same helper for overtime, attendance corrections, expenses, travel, documents (incl. compensation letters), onboarding tasks and performance reviews; failures logged with ids; `link` column; the Notifications page shows a type icon and an Open link; the bell re-checks right after any action. | `super_admin/admin_notifications.py`, `hr/leave_notifications.py`, `hr/hr_notifications.py`, HR services, migration `d7e1a0b2c3fb`, `NotificationsPage.jsx`, `useUnreadNotifications.js`, `api.js` | `test_leave_notifications_a5.py`, `test_hr_notifications_a5.py`, `notificationsA5.test.mjs` | Fixed |
| B1 | Live site (checked at 1280/1440/1920 px): the "Connect & Control" group has **5** links in a `grid grid-cols-2`, so Integration Security sits alone on a third row, and the rows have different heights (75 px / 95 px, because descriptions wrap). | Marketing-site code: see "Marketing site" below. | not in this repository | – | **Needs marketing-site owner** |
| B2–B6 | Live site: `/images/home/lifecycle-onboarding.png`, `-leave.png`, `-documents.png`, `-performance.png`, `-reporting.png` all return **404** (only `lifecycle-core-hr.png` exists). The tab component references them, but the files were never deployed. | Marketing-site code: see below. | not in this repository | – | **Needs marketing-site owner** |
| B7–B13 | Registration checked only that fields were not empty. | Shared field rules (`field_rules`) on the form (one message per field) and enforced by `POST /auth/register`; industry is a list; the registration number follows the country's ID types with check digits; phone has a calling-code selector. | `RegisterPage.jsx`, `PhoneField.jsx`, `core/field_rules.py`, `employee/router.py` | `registerValidation.test.mjs`, `test_qa_field_validation.py`, `fieldRules` fixtures | Fixed |
| B14 | `Header.jsx` linked the logo to `/`, and `App.jsx` sent `/` to `/login`. Alt text said "Zoiko One". | The logo (header and sidebar) goes to the role's home; `/` is role-aware (`HomeRedirect`); alt text is "Zoiko HR" everywhere. | `Header.jsx`, `Sidebar.jsx`, `HomeRedirect.jsx`, `App.jsx` | `headerHomeAndUserMenu.test.mjs` | Fixed |
| B15 | `UserMenu.jsx` only toggled on its own button. | `useDismissible` (outside pointerdown, Escape with focus return, route change); the menu closes on item selection and has menu ARIA and arrow keys. Applied to the bell and the offers row menu; Escape added to the org picker and the organizations row menu. | `hooks/useDismissible.js`, `UserMenu.jsx`, `NotificationBell.jsx`, `offers.jsx`, `OrgPicker.jsx`, `OrganizationsPage.jsx` | `headerHomeAndUserMenu.test.mjs` | Fixed |
| B16–B38 | Add/Edit User checked only required fields, emails and a fixed 10-digit phone; the server accepted anything. | The same shared rules on Add/Edit User, HR Add Employee, ESS profile, the Excel import and the API. Country and state are lists; statutory numbers follow the country; edits check only changed values. | `UserManagementPage.jsx`, `userFormRules.js`, `addEmployeeForm.js`, `profileForm.js`, `employee/service.py`, `employee/schema.py` | `addUserValidation.test.mjs`, `test_qa_field_validation.py`, `test_field_rules.py`, `fieldRules.test.mjs` | Fixed |

## Field rules (B7–B13, B16–B38)

One module per side with the same messages, tested against one fixture (`backend/tests/fixtures/field_rules_cases.json`, 200 cases):
`backend/app/core/field_rules.py` and `frontend/src/utils/fieldRules.js`. The country, region, industry, postal, IBAN, business-ID and statutory tables are generated for the browser by `backend/scripts/export_field_rules_data.py` (`frontend/src/utils/fieldRulesData.js`); a backend test fails if that file is out of date.

All free-text fields: trimmed, repeated spaces collapsed; control, invisible (zero-width) and emoji characters refused; values made only of digits or symbols refused; no leading or trailing punctuation (a closing `)` or `.` is fine, and `+` / `#` at the end of a job title); never three of the same symbol in a row.

| Rule | Fields | Allowed | Length | Message |
|---|---|---|---|---|
| `person_name` | First / last name (B16, B17); Admin name (B13, 2–100) | letters in any script, marks, space, `'` `’` `-` `.`; starts with a letter; no digits | 1–50 | Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed. |
| `org_name` | Organization name (B7), Company (B22) | letters, digits, space, `& . , ' - ( ) /`; at least one letter | 2–150 | Use letters, numbers, spaces and & . , ' - ( ) / only. Include at least one letter. |
| `org_unit` | Department, Designation, Business unit, Division, Team (B20, B21, B23–B25) | letters, digits, space, `& - / , . ( )`; at least one letter | 2–100 | Use letters, numbers, spaces and & - / , . ( ) only. Include at least one letter. |
| `job_title` | Job title (B19) | as `org_unit` plus `+ #` | 2–100 | Use letters, numbers, spaces and & - / , . ( ) + # only. Include at least one letter. |
| `industry` | Industry (B10) | a list of 33 industries; "Other" asks for a name (org_unit rules) | – | Select an industry. |
| `place_name` | City (B12, B30); State where there is no list | letters, space, `- ' .`; starts with a letter | 2–80 | Use letters only. Spaces, hyphens, apostrophes and full stops are allowed. |
| `country` | Country (B32) | a list of the server's 123 countries; a name, ISO code or alias is accepted | – | Select a country. |
| `state` | State (B31) | a list for IN, US, CA, AU, AE and GB (ISO / postal codes such as `MH`, `NY` are accepted); `place_name` elsewhere | – | Select a state/region. |
| `address` | Address (B11), Current / Permanent address (B28, B29) | letters, digits, space, `, . - / # ' ( ) :`, line breaks; a letter **and** a digit or a second word | 5–250 | Enter a full address (for example: 12 MG Road, Indiranagar). Only letters, numbers and , . - / # ' ( ) : are allowed. |
| `email` | every e-mail (B18, B26, B27, registration) | RFC 5322 practical subset, ≤254 characters, domain lower-cased; placeholder and disposable domains refused; **server only**: a domain with no MX / A / AAAA record is refused (2–3 s DNS, cached; a DNS failure is accepted) | – | Enter a valid email address, for example name@company.com. / This email domain can't receive email. Check the address. |
| `phone` | Phone (B8, Add User) | calling-code selector + national number; only digits, spaces, `+ - ( )`; validated per country (`libphonenumber-js` / `phonenumbers`); stored as E.164 | – | Enter a valid phone number for <country>. |
| `postal_code` | Pincode (B33), postal code | per country (India 6 digits not starting with 0; US 5 or 5+4; UK, CA, AU, EU formats…); upper-cased | – | Enter a valid postal code for <country> (for example 560001). |
| `org_registration` | Tax / registration number (B9) | the country's ID types (GSTIN, CIN, PAN, LLPIN, EIN, ABN, ACN, VAT…) with GSTIN / ABN / ACN check digits; the label and example follow the selected type | – | from `business_ids` |
| `tax_id_person` | Tax identification number (B34) | IN PAN; US SSN/ITIN (000, 666, group 00, serial 0000 refused; ITIN groups); UK NI; others 4–20 letters/digits | – | Enter a valid <label> (for example …). |
| `social_payroll_ref` | Social security / payroll reference (B35) | IN UAN 12 digits; others 4–20 letters/digits/`-` | – | Enter a valid <label> (for example …). |
| `bank_account` | Bank account number (B36/B37) | IN 9–18 digits; IBAN countries IBAN with mod-97; US 4–17 digits; others 6–20 digits; letters cannot be typed outside IBAN countries | – | Enter a valid bank account number (digits only, 9–18 for India). |
| `bank_routing` | Bank branch / routing code (B38) | IN IFSC; US ABA with check digit; UK sort code; AU BSB; IBAN countries BIC; others BIC or 3–12 digits | – | Enter a valid <label> (for example HDFC0001234). |

Statutory numbers need the employee's country: without one the form shows a hint and the server answers "Select the employee's country first so this number can be checked."

**Where they apply:** Registration; Add User and Edit User (Org admin); HR dashboard Add Employee; HR employee create/update API; ESS My Profile (personal and work tabs); employee Excel import (one error per field per row; a row without a country follows the India template). The server answers 422 in FastAPI's usual shape, one entry per field, and the forms put each message under its field.

**Existing data:** when a record is edited, only values that change are checked (and the country-dependent fields when the country changes), so legacy records can still be saved. `python backend/scripts/field_rules_report.py [--json]` counts the stored values that would be refused today, per organization and field, with no names, e-mails or values in the output.

**Deviation from the prompt:** Country is a list of ISO countries, but the stored value stays the canonical country **name** (e.g. "India"), not ISO-2. Every existing employee record, the import templates, the per-country statutory labels and the salary currency key on the name, so switching to ISO-2 would break existing data (ground rule 4). The API accepts a name, code or alias and stores the name.

**Mailbox existence** cannot be verified at form time. The domain check plus the invitation / verification e-mail is the check. Bounce status on the user list needs bounce webhooks from the e-mail provider: follow-up.

## Production configuration (someone with access)

API (`api.zoikohr.com`) environment:

```
API_BASE_URL=https://api.zoikohr.com        # no trailing slash
FRONTEND_URL=https://app.zoikohr.com
HR_REDIS_URL=redis://...                    # when more than one worker / instance runs (one-time Google tickets)
SECRET_KEY=<the same value on every instance>
```

Google Cloud console, OAuth client used by `GOOGLE_CLIENT_ID`:
- Authorized redirect URIs: `https://api.zoikohr.com/auth/google/callback` (exact, https, no trailing slash)
- Authorized JavaScript origins: `https://app.zoikohr.com`
- OAuth consent screen: publishing status **In production** (in Testing only listed test users can sign in); authorized domain `zoikohr.com`.

Then run `alembic upgrade head` (adds `super_admin_notifications.link`, revision `d7e1a0b2c3fb`) and `pip install -r requirements.txt` (adds `phonenumbers`).

## Marketing site (zoikohr.com: separate Next.js project, not in this repository)

**B2–B6:** add the five missing files to the site's `public/images/home/` (case-sensitive names: `lifecycle-onboarding.png`, `lifecycle-leave.png`, `lifecycle-documents.png`, `lifecycle-performance.png`, `lifecycle-reporting.png`) and deploy. While doing so: serve WebP/AVIF with a PNG fallback (or `next/image`), set `width` / `height`, give each image a meaningful `alt` ("Leave and attendance dashboard…"), keep the first tab eager and preload the others when the section scrolls into view, and add a CI check that requests all six `/images/home/lifecycle-*.png` and fails on anything but 200 with a non-zero image size.

**B1:** in the mega-menu data, "Connect & Control" has 5 links rendered in `grid grid-cols-2`. Either render that group as a single column, or keep two columns with equal-height rows (`grid-cols-2 auto-rows-fr`) and make the last link span both columns (`col-span-2`) or add a sixth link. Check at 1280, 1440 and 1920 px and on tablet.

## Manual retest script

Use a test organization. "Refused" means: the message shown appears under the field, the field is outlined red, and nothing is saved.

**A1 Google sign-in** (after the production config above)
1. An active user's Google account → "Continue with Google" → lands on that role's dashboard.
2. A Google account with no Zoiko HR account → the Register page, saying there is no account yet.
3. A deactivated user → back on the login page: "Your account has been deactivated."
4. A user in a suspended organization → "Your organization has been suspended. Please contact support."
5. Cancel on Google's screen → "Google sign-in was cancelled."; the button works again.

**A2 / A3** Temporary-password screen (current, new, confirm) and Reset password (new, confirm): each field has its own eye; revealing one never reveals another; pressing the eye never submits.

**A5 notifications**
1. Employee applies for leave 12–14 Nov → the reporting manager (or HR admins when there is no manager) gets "New leave request from <name> awaiting your approval."
2. HR approves → within 45 s, or at once on refocus, the employee's bell count goes up; Notifications shows "Your leave request for 12–14 Nov has been approved." with a calendar icon and an Open link to the request.
3. Reject → "…was not approved." (no reason text). Another employee sees neither.
4. The employee withdraws a pending request → the approver gets "…cancelled their leave request…".

**B14** Click the logo from any page as each role → that role's dashboard (org admin `/organization-admin/dashboard`, HR admin `/hr-admin/dashboard`, manager `/zoiko-hr`, employee `/employee/ess`). Open `/` while signed in → dashboard; signed out → `/login`.

**B15** Open the account menu → it closes on a click elsewhere, on Escape (focus returns to the button), on navigation and on choosing Sign out.

**B7–B13 registration** (country India)

| Field | Refused | Accepted |
|---|---|---|
| Organization name | `@#$%`, `12345`, `Acme!!!` | `3M`, `7-Eleven`, `AT&T`, `H&M`, `Tata Consultancy Services (TCS)` |
| Phone | `98765 43` (letters cannot be typed) | `98765 43210` with +91 |
| Registration number (GSTIN) | `HELLO!!`, `27AAPFU0939F1ZA` (check digit) | `27AAPFU0939F1ZV`; type PAN: `AAPFU0939F` |
| Industry | – (a list) | any; Other + `Space Tourism` |
| Address | `abc`, `!!!!!`, `12345` | `12 MG Road, Indiranagar` |
| City | `Mumbai12`, `@@` | `Bengaluru`, `São Paulo` |
| Admin name | `Priya 123`, `@@` | `José O'Brien`, `王伟`, `अनिल कुमार`, `Jean-Luc D’Souza` |

**B16–B38 Add User** (country India unless stated)

| Field | Refused | Accepted |
|---|---|---|
| First / last name | `John123`, `@@@`, `-Ann` | `José`, `O'Brien`, `Jean-Luc`, `王伟`, `अनिल` |
| Email / work / personal email | `abc@`, `a..b@x.com`, `name@example.com`, `x@mailinator.com`, a domain with no mail servers | `name@yourcompany.com` |
| Job title | `$$$`, `12345`, `Engineer@Home` | `Engineer II`, `L2 Support`, `C++ Developer`, `C#` |
| Department / designation / business unit / division / team | `1234`, `!!!`, `+++`, `@team!` | `R&D`, `Sales - North`, `Team 7`, `People (HR)` |
| Company | `#$%` | `AT&T`, `3M` |
| Current / permanent address | `abc`, `!!!!!` | `12 MG Road, Indiranagar`, `#4, 3rd Cross, Koramangala` |
| City | `Pune123` | `Bengaluru` |
| State | – (a list for India) | `Karnataka` |
| Country | – (a list) | any |
| Pincode | `56A001`, `056001` | `560001` (US: `94105`, `94105-1234`) |
| Tax identification number | `ABC123` (India); `000-12-3456` (US) | `ABCDE1234F`; US `123-45-6789` |
| Social security / payroll reference | `12AB` (India UAN) | `101234567890` |
| Bank account number | letters cannot be typed; `12345678` | `123456789012`; Germany `DE89 3704 0044 0532 0130 00` |
| Bank branch / routing code | `HDFC1001234` | `HDFC0001234`; US `021000021`; UK `12-34-56` |

Edit an older user whose stored city is `City123`: changing only the job title saves; changing the city to `Pune9` is refused.

## Protected-area check

`git diff --name-only ad32869..` plus the working tree: 89 files, none under `backend/app/modules/assistant/`, `frontend/src/modules/shared-layers/assistant/`, `AuthenticatedAssistant.jsx`, `assistantService.js`, `supportService.js`, support ticket routers or pages, `MyTicketsPanel.jsx`, `AdminHandoffsPage.jsx`, `email_service.py`, `navigation.js` or `config/roles.js`. No migration touches assistant or ticket tables. The bell's mutation refresh ignores `/assistant`, `/support` and `/super-admin/support` requests.

## Not changed: protected area

- **A4** ("Failed to fetch" for "Have I clocked in today?"): owned by the assistant workstream.
- `assistant/action_service.py::_execute_book_leave` inserts a `LeaveRequest` directly instead of going through the HR leave service (its comment says `attendance_service.create_leave_request` used to fail). A leave booked through the assistant therefore does not send the new "awaiting your approval" notification to the approver. The fix belongs to the assistant workstream: call `hr_service.create_leave_request` (which now notifies).
- Assistant menus (`AssistantMenu.jsx`) and the support ticket screens were not given `useDismissible`, `PasswordInput` or the field rules.
