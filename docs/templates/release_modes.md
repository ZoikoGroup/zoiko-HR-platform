# Release modes

All 566 templates arrive `BLOCKED_PENDING_JURISDICTION_COUNSEL_SIGNOFF`, and the four platform research packs (GB, US, AU,
SG) are `SUSPENDED`. A document can be generated only from an ACTIVE variant in an ACTIVE pack. Two modes produce ACTIVE
variants; every document records which one it came from (`generated_documents.release_mode`).

## 1. PLATFORM_COUNSEL (preferred)

* Authored and signed off by Zoiko Legal for a PLATFORM pack, loaded through a reviewed change with
  `backend/scripts/doc_templates_platform_content.py` (author, reviewer and releaser must be three different named people;
  the pack carries the counsel sign-off). There is no super-admin screen: platform accounts never reach tenant data routes.
* Read-only to every tenant.

## 2. TENANT_ATTESTED

The organization adopts Zoiko's starter content (Prompts 2–4), edits it, and releases it for itself under its own legal
responsibility.

| Step | Who | Rule |
|---|---|---|
| Jurisdiction pack | hr_admin/admin creates a TENANT pack per work country; an organization admin **other than the creator** activates it with an attestation | `content.activate_pack` |
| Draft | hr_admin or admin (author) | locked blocks (letterhead, signature, evidence, rights statements) cannot be removed or edited |
| Legal review | organization admin or authorised signatory, **not the author** | attestation: "We have reviewed this template for use in {country} and accept responsibility for its content." L3 also needs the name, firm and qualification of the organization's legal counsel and the review date. Produces the HR-DOC-003 record |
| Release | organization admin, **not the author and not the reviewer** | release test renders the variant with synthetic data; supersedes the previous version (HR-DOC-018) |

Controls:

* `HR_TEMPLATES_TENANT_ATTESTATION_ENABLED` (default **true**) — platform switch for L1/L2.
* `HR_TEMPLATES_TENANT_ATTESTATION_L3_ENABLED` (default **false**) — L3 templates cannot be tenant-attested unless enabled.
* Plan: feature key `hr.documents.tenant_attestation` (per plan through `plan_entitlement_mappings`; unpriced = included today).
* Organization: `doc_template_settings.tenant_attestation_enabled` (organization admin toggle) and `prefer_tenant_variants`.

Presentation: HR screens show the badge "Organization-approved template". Employee- and candidate-facing documents show
nothing about the release mode and never say "approved by Zoiko". The HR-DOC-003 record of a tenant-attested variant states
that it has not been approved by Zoiko.

## System records (governance templates)

The ten HR-DOC templates of this release are records about documents (registers, approvals, evidence certificates), produced
by the engine from its own evidence. They are not employment documents, are not jurisdiction-specific and have no variants:
`registry.SYSTEM_RECORDS`. They cannot be requested through `/generate` (`ENGINE_RECORD_ONLY`).

## Decisions needed (also in docs/privacy/human_actions_required.md)

1. Zoiko Legal / Product: approve the TENANT_ATTESTED mode, its attestation wording and the L1/L2-on, L3-off defaults.
2. Zoiko Legal: approve treating HR-DOC governance records as system records outside the jurisdiction-pack regime.
3. Product: decide plan placement of `hr.documents.templates` and `hr.documents.tenant_attestation` (both currently unpriced,
   so included in every plan) and whether e-signature belongs under `hr.documents.workflow` (Advanced only today).
