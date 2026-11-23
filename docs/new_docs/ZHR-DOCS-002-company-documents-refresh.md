# ZHR-DOCS-002: Company Documents refresh (folders, bulk upload, category settings, email sharing)

| | |
|---|---|
| Status | Implemented on `venu` (2026-11-23) |
| Builds on | [ZHR-DOCS-ARCH-001](ZHR-DOCS-ARCH-001-documents-module-and-automation-plan.md) (access rules, publish states, read-confirmation rounds) |
| Scope | Admin → Company Documents (every category: built-in and custom); Employee → Company Documents |
| Migrations | `c2d3e4f5a6b7` (category `is_hidden`), `a9d8c7b6e5f4` (email shares). Run `scripts/privacy_apply_rls.py` after upgrading. |

Everything below applies the same way to every company category: Onboarding, Company Policies, Employee Handbook,
Payslip Templates, Forms & Templates, Compliance & Legal, Holiday Calendar & Announcements, Training Materials and
custom categories. There is no category-specific code.

## Decisions

| # | Decision |
|---|---|
| Q1 | Outside email addresses: Admin / HR Admin only (the `COMPANY_SHARE` permission), attachments only. |
| Q2 | Email sends a portal link by default. Attachments are optional, only for download-allowed files, at most 10 MB per email. |
| Q3 | A company folder must be empty (no files, no sub-folders) before it can be deleted. |
| Q4 | An email share grants portal access only when "Also give them access" is ticked. |
| Q5 | Bulk upload: up to 20 files per batch, 10 MB each. |
| Q6 | Built-in categories can be renamed and hidden, never deleted. Custom categories can be deleted once empty. |

## P1: folders and row actions

**Backend** (`hr/service.py`, `hr/router.py`, `documents/company_docs.py`)

- Folder names are tidied (spaces collapsed) and must be 1–100 characters, without `/ \ : * ? " < > |`.
  Failure: `422 DOC_INVALID`.
- The same name (any letter case) can't be used twice in the same place (parent and category). Failure:
  `409 DOC_FOLDER_EXISTS`.
- Deleting a company folder that still holds files or folders returns `409 DOC_FOLDER_NOT_EMPTY` with
  `{files, folders}` and a message such as "“Forms” still has 2 files and 1 folder…". Legacy folders (no category)
  keep the old move-contents-up behaviour.
- Deleting a missing folder returns 404 (it used to be a 500).
- `folder_created`, `folder_renamed` (with the old and new name) and `folder_deleted` are written to
  `hr_document_audit_logs`.
- Folder cards from `GET /hr/documents/company-categories/{id}/items` carry `file_count` and `folder_count`.

**Frontend** (`CompanyCategoryPage.jsx` plus new `FolderDialog`, `ConfirmDialog`, `ActionMenu`, `PublishStatusChip`)

- A "New folder" button opens a dialog that applies the server's rules before sending and shows the server's refusal
  under the field.
- Each folder card has a ⋯ menu: Open, Rename, Who can see, Email, Delete (Delete always asks first).
- Status chips: Published (green), Unpublished (grey), Scheduled (amber), Waiting for approval (blue, links to Approval
  Workflow), Expired (red).
- Clash notes: "No one yet (not published)" and "Published, but only admins can see it" (with a Share link).
- File rows keep Preview and Download as icons and show a labelled Publish / Unpublish button (always confirmed).
  The ⋯ menu holds Who can see, Email, New version, Versions, Read confirmations and Remove.
- Result messages name the file and the effect, disappear after 5 s and can be closed.

## P2: upload

- `FileDropZone` provides drag-and-drop with a keyboard-accessible browse fallback.
- `CompanyFileDialog` handles both single and bulk uploads:
  - Up to 20 files; repeated files are ignored; files over the limit are left out with a note.
  - Each file has its own title (defaults to the file name). Expiry, read confirmation, publish time and notify apply
    to the whole batch.
  - Files that can't be uploaded (type, empty, over 10 MB) must be removed before sending.
  - Files are uploaded one at a time through the existing `POST /hr/documents/company-categories/{id}/files`, so the
    server checks each file exactly as for a single upload. No bulk endpoint was added.
  - Each file shows its own status, and Retry sends only the failed ones. "Stop after this file" leaves the rest
    unsent.
- The `notify` form field is now sent. It is on for one file and off by default for several, so a batch doesn't send
  one notification per file. Read-confirmation rounds still open either way.

## P3: category settings, hide and show

- **New column:** `hr_company_document_categories.is_hidden`. It is separate from `is_active`, which still means a
  custom category was deleted.
- **Hiding a category** (`PATCH /company-categories/{id}` with `{is_hidden}`):
  - `access_resolver.can_view` and `visible_company_documents` hide its files from non-admins (list, open, download).
  - Open `acknowledge` tasks are cancelled (`reason=category_hidden`).
  - Showing it again re-opens the current round for audience members who haven't confirmed.
  - `on_published` and `add_to_current_round` do nothing for a hidden category.
  - The change is audited as `category_hidden` or `category_shown`.
- **Category list:** `GET /company-categories?include_hidden=true` also returns hidden categories (each card carries
  `is_hidden`). Without the flag they are left out.
- **Names:** category names are unique within the organization, whatever the letter case (`409 DOC_CATEGORY_EXISTS`).
- **Deleting a custom category** also requires it to have no folders.
- **Frontend:** each category card has a ⋯ menu (Open, Settings, Who can see, Email, Hide or Show, and Delete for custom
  categories only). Hidden categories are listed in a collapsed section. `CategorySettingsDialog` edits the name,
  approval, default read confirmation, reminder days, re-confirmation months and automatic unpublish on expiry, and
  sends only the fields that changed.

## P4: email sharing (backend)

**Tables** (both classified PERSONAL_BASIC; `hr_document_share_recipients.email` is PERSONAL_CONFIDENTIAL because an
outside address may be a personal mailbox)

- `hr_document_shares`: target (document, folder or category), `target_name`, `mode` (`link` or `attachment`),
  `message`, `grant_portal_access`, `document_ids` (fixed when the share is made, so a retry sends the same files),
  `total_bytes`, `status` (`sending`, `sent`, `partial`, `failed`) and `created_by`.
- `hr_document_share_recipients`: `kind` (`employee` or `external`), `employee_id`, `email`, `status` (`pending`,
  `sent`, `failed`, `skipped`), `error`, `attempts` and `sent_at`.

**Endpoints** (all require `COMPANY_SHARE`, i.e. Admin or HR Admin; all are listed in the route entitlement map under
`hr.documents.core`)

| Method | Path | Notes |
|---|---|---|
| GET | `/hr/documents/email-status` | Returns `{configured, max_attachment_mb, max_recipients, max_external, message}`. No SMTP details. |
| POST | `/hr/documents/shares/email` | Body: `target_type, target_id, mode, employee_ids, department_ids, emails, message, grant_portal_access` |
| GET | `/hr/documents/shares` | Filters: `target_type, target_id, page, per_page`. Recipients are included. |
| POST | `/hr/documents/shares/{id}/retry` | Resends only to failed recipients. Returns `409` if nothing failed. |

**Rules** (`documents/share_service.py`)

| Code | When |
|---|---|
| `503 DOC_EMAIL_NOT_CONFIGURED` | No SMTP host or sender address is set. |
| `422 DOC_SHARE_NOT_PUBLISHED` | Link mode includes a file that is unpublished or in a hidden category. |
| `422 DOC_SHARE_NO_ACCESS` | Link mode includes recipients who can't open the files. Response carries `{employees, names}`. With `grant_portal_access` the files are assigned to those people instead (`DocumentAssignment`), audited as `access_granted_by_share`. |
| `422 DOC_SHARE_VIEW_ONLY` | Attachment mode includes a view-only file. |
| `422 DOC_SHARE_TOO_LARGE` | Attachments total more than 10 MB. |
| `422` (no code) | An outside address is used in link mode. |

Limits: 50 files per share, 200 recipients, 20 outside addresses, a 1,000-character message.

**Delivery**

- Every recipient gets their own email (template `email_templates/document_share.html`, autoescaped).
- The email worker sends in production; tests send inline.
- The background run uses its own session, inside a tenant context, and re-checks the sender is still active before
  sending.
- Each send is recorded in the email delivery log, and each file gets an audit entry `shared_by_email`.

## P5: Share dialog and the employee view

- `ShareModal` has two tabs: **Employee Portal** (the existing access-rule editor, unchanged) and **Email**
  (`EmailSharePanel`). `initialTab="email"` opens on the Email tab, which is what the ⋯ menus' Email item does.
- **The Email tab:**
  - Choose a mode, a searchable list of people, whole departments, outside addresses (attachments only, checked in the
    browser), a message with a counter, and "Also give them access".
  - A `DOC_SHARE_NO_ACCESS` refusal names the people and offers a one-click tick.
  - "Sent before" lists each recipient's result and has a Retry button.
- `api.js` now forwards `names`, `employees` and `files` from error bodies.
- **Employee view:** `GET /hr/me/company-documents` items carry `folder: {id, name, path}`. The employee page groups each
  category into loose files first, then one section per folder path.

## Tests

| Area | Files |
|---|---|
| Backend: folders and the upload `notify` flag | `tests/documents/test_docs_company_p1_folders.py` |
| Backend: categories | `test_docs_company_p3_categories.py` |
| Backend: email sharing and the employee folder path | `test_docs_company_p4_email_share.py` |
| Backend: migrations (including a guard that no two migrations share a revision ID) | `tests/test_migration_company_category_hidden.py` |
| Frontend: category page, upload, categories and Email tab | `__tests__/documentsCompanyRefresh.test.mjs` |
| Frontend: employee folder sections | `__tests__/documentsEmployeeFolders.test.mjs` |
| Frontend: existing tests updated for the new menus and confirmations | `__tests__/documentsPhase5.test.mjs` |

## Not done / limits

- Upload progress is counted per file, not per byte; there is no XHR progress helper yet.
- Hiding a category doesn't resend reminders already cancelled; showing it re-opens tasks, but escalation starts again
  from the beginning.
