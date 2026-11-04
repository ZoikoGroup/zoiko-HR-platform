# ZHR-PRIV-001 Prompt 2 — human actions required

Decisions or actions this work deliberately leaves to a person. None blocks the code; each closes a gap marked `F`/`N`
in `control_status.md`.

1. **Set a dedicated grant signing key.** `HR_SUPPORT_GRANT_SIGNING_KEY`, or a PEM for RS256. The default derives from
   `SECRET_KEY` (HS256). Rotating it invalidates every live capability — do it during a quiet window, or when no grant is
   active.

2. **Configure external audit anchoring.** `audit.anchor(sink=...)` is a seam with no destination. Point it at an
   append-only external sink (a separate store, a WORM bucket, a third-party log) and schedule a periodic anchor so a
   full-chain rewrite in the primary DB is detectable. Until then, tamper-evidence is within the DB only.

3. **Wire tenant notifications.** `service.notify_tenant` emits a `TENANT_NOTIFIED` event and logs it; no e-mail/portal
   message is delivered. Choose the channel (e-mail via the existing e-mail service, or the tenant portal feed) and
   subscribe to the event. The tenant's authoritative view is `/hr/support-access/activity` meanwhile.

4. **Deploy Redis.** `HR_REDIS_URL` enables the revocation pub/sub fan-out and the cross-node ≤60 s guarantee
   (`cache.start_subscriber` is already wired into the app lifespan). Without it, a single node is still bounded by the
   5 s cache TTL and the per-request version check.

5. **Decide the review cadence and owner.** The recertification queue (`/super-admin/support-access/recertification`)
   needs a named owner and a schedule (quarterly suggested). The reconciliation `ALERT` log line
   (from `support_access/scheduler.py`) needs a pager route.

6. **Build the Phase 13 UI.** Platform: request/approve/revoke/kill-switch screens and a live "support session active"
   banner for the tenant. Tenant: approve, "Revoke now", and the transparency page. All APIs exist; no React screen is
   built. Also expose the platform's detections/reconciliation to the on-call surface.

7. **Rotate and delete `backend/add_mfa_cols.py`** (still open from Prompt 1 — it contains a hard-coded production URL).

8. **Move the application DB role** off the table owner so the Prompt 1 RLS policies bind (`db_roles.md`), then run the
   PostgreSQL privacy tests with `HR_PRIVACY_PG_ADMIN_URL`.

9. **Confirm the retention/erasure story for `privacy_audit_events`.** The chain is append-only; GDPR erasure must not
   break it. Decide whether audit rows are pseudonymised on erasure (rewriting the chain is not an option) and record the
   decision. The table stores names/ids and non-sensitive metadata only, never field values.

10. **Run the migrations and the classification/inventory checks against a production-equivalent PostgreSQL.** This work
    validated migrations on SQLite and the logic on the test database; it never contacted the live database.

## Document template engine (ZHR-ELT-TPL-001, Prompt 1 of 4)

11. **Zoiko Legal / Product: approve the TENANT_ATTESTED release mode** (`docs/templates/release_modes.md`): organizations
    adopt starter content under their own responsibility, with author ≠ reviewer ≠ releaser and the attestation wording
    "We have reviewed this template for use in {country} and accept responsibility for its content." Defaults: on for
    L1/L2 (`HR_TEMPLATES_TENANT_ATTESTATION_ENABLED=true`), off for L3 (`HR_TEMPLATES_TENANT_ATTESTATION_L3_ENABLED=false`).

12. **Zoiko Legal: approve treating the HR-DOC governance records as system records** (registers and evidence produced by
    the engine, outside the jurisdiction-pack regime).

13. **Product: place the new feature keys in plans.** `hr.documents.templates` and `hr.documents.tenant_attestation` are
    unpriced (included in every plan) until `plan_baseline.PLAN_BASELINE` or `plan_entitlement_mappings` says otherwise.
    Decide whether e-signature belongs under `hr.documents.workflow` (Advanced only today).

14. **Mount `HR_GENERATED_DOCS_DIR` on persistent storage** before any document is generated (signature evidence lives there).

15. **Confirm backfilled work countries.** Migration `d7e1a0b2c3f4` set `employees.work_country` from the recorded country
    (exact name/code match only) or, when none was recorded, from the organization's country. HR should confirm the second
    group; `scripts/doc_templates_jurisdiction_report.py` lists the people it could not map at all.

16. **Signature assurance.** The in-house e-signature is an advanced-evidence electronic signature, not a qualified one.
    Decide per jurisdiction pack whether that is sufficient, or connect a qualified provider through `signing.SignatureProvider`.

17. **Managers and C3 documents.** Managers are denied C3/C4 generated documents by the privacy policy (MANAGER grant stops at
    PERSONAL_CONFIDENTIAL), including performance documents about their reports. Confirm or widen before Prompt 4.

## Recruitment, workforce planning and onboarding (Prompt 2 of 4)

18. **Write and release the jurisdiction-specific clauses.** Before the affected templates can be generated, Legal must provide
     and release `privacy_lawful_basis_recruitment`, `privacy_international_transfers`, `probation_summary`,
     `internship_status_statement`, `fixed_term_statement` and `offer_withdrawal_rights` for each applicable jurisdiction.
     These intentionally have no starter text; preflight denies generation until the required clause is active.

19. **Approve the onboarding form-record model.** New-starter, emergency-contact and bank/payroll form records are stored as
     HR-internal (`HR_INTERNAL`, execution mode `NONE`). The declaration and submission evidence are captured by the onboarding
     portal instead of asking the new hire to sign a second generated record. Legal and Product should confirm this is the intended
     employee-facing experience and retention treatment.

20. **Confirm pre-offer jurisdiction handling.** Before an offer establishes a work country, candidate documents resolve
     jurisdiction from the selected employing entity's country. Configure the organization's default entity and have Legal confirm
     this is appropriate for pre-offer candidate notices and other candidate records.

21. **Confirm payroll-data ownership.** Bank details from onboarding are encrypted in the form submission and are not copied into
     `EmployeeProfile`. Payroll/Finance must appoint permitted verifiers and confirm the authoritative system, verification process
     and retention/deletion path.

22. **Accept requisition separation-of-duties behavior.** The requisition decision itself is not blocked when its decider raised the
     request. Separation of duties is enforced for the generated HR-HIR-001 authorization record instead. HR/Compliance should
     confirm that this boundary meets the organization's approval policy.

23. **Confirm declined-offer status mapping.** A candidate's declined offer is stored as `rejected` for compatibility with the
     existing offer state model and is labeled “Declined” in the user interface. Product should confirm reporting and downstream
     integrations do not interpret that value as candidate rejection.

24. **Complete recruitment privacy settings.** HR/Privacy must set the candidate privacy contact and retention period (1–120
     months), confirm whether CV parsing should remain enabled (it defaults on), provide a talent-pool opt-in destination if used,
     and decide whether to issue an unconditional-offer confirmation automatically after all conditions are cleared.

25. **Set position-approval policy.** Organization administrators should decide which designations require approval before
     activation and set the `require_position_approval` designation setting accordingly. Requested positions stay inactive until a
     different HR approver decides.

## Policies, leave, working time and compensation (Prompt 3 of 4)

26. **Write and release the Prompt 3 jurisdiction clauses.** Legal must write and release, per jurisdiction, the clauses with no
     starter text listed in `docs/templates/policies_leave_time_compensation.md` (`probation_legal_limits`, `rest_breaks`,
     `overtime_pay_or_time_off`, `maximum_working_time`, `statutory_annual_leave`, `annual_leave_carry_over`, `leave_on_termination`,
     `sickness_evidence_rules`, `sick_pay`, `family_leave_entitlements`, `family_leave_pay`, `family_leave_notice_requirements`,
     `monitoring_notice`). Until then the policies and records that require them cannot be generated. Review the two starter
     clauses (`leave_rights_statement`, `sickness_evidence_reminder`) before release.

27. **Complete the policy settings.** HR must set each policy's owner and contact, and the values the policies print (absence
     notification rule, default probation months, standard working day, notice days, self-certification days, privacy contact,
     travel and expense rules, claim deadlines). Nothing is defaulted; a policy that prints an unset value is blocked.

28. **Confirm the sickness-reason handling.** Sickness reasons are now encrypted special-category data, hidden from every list and
     from managers, revealable by HR only (audited), and optional when applying. The migration moves existing reasons into the
     encrypted column. Privacy should confirm who may reveal them and the retention period; Product should confirm that an optional
     reason for sick and bereavement leave is acceptable.

29. **Confirm the leave-type to document mapping.** The default mapping (annual/earned/casual → HR-LEV-001 + 018; sick → 003 on
     request and 018 on decision; maternity/paternity → 007 on HR confirmation and 018; bereavement → 013 + 018; others → 018) can be
     changed per organization (`leave.document_map`). HR should confirm it, and decide whether bereavement evidence may ever be asked
     for (`leave.bereavement_evidence_enabled`, off).

30. **Set the working-time settings.** Set `attendance.standard_workday_hours` (overtime analytics use 8 hours only as a fallback
     until it is set) and `attendance.shift_change_notice_days`. While the notice setting is empty, no shift change counts as short
     notice; HR/Legal should set it to the lawful or agreed minimum.

31. **Decide manager visibility of compensation.** Managers cannot open compensation documents by default. An organization admin may
     switch on `compensation.managers_see_reports` for direct and indirect reports; Privacy should confirm whether that is ever
     appropriate and record the decision.

32. **Appoint compensation approvers and the expense threshold.** Salary revisions and allowance awards are approved by an
     organization admin or an authorised signatory whose scope covers `HR-CMP`, never the requester. Register signatories as needed
     and set `compensation.expense_second_approval_threshold` if large claims need two approvers.

33. **Confirm the payroll hand-off.** Approved salary revisions, allowance awards and overtime emit ID-only events
     (`compensation.change.approved`, `attendance.overtime.approved`). Payroll must subscribe to them; nothing in Zoiko HR changes pay
     by itself. Legacy salary revisions recorded through the old screen are now drafts until approved.

34. **Review the Mira policy sync.** Publishing a policy version replaces what the assistant answers from and retires the placeholder
     documents seeded from the engineering wireframes in `docs/`. The Knowledge Base owner should confirm those placeholders may be
     retired, and monitor the "Mira sync failed" indicator on the Company Policies page (the old version is retired even when the new
     one fails to sync).

35. **Allowance awards on the existing table.** Allowances were already per employee, so award terms and approval were added to
     `allowances` rather than a new `employee_allowance_awards` table. Allowances recorded before Prompt 3 have no status and no letter.
     Product should confirm this, and whether old allowances need letters.

## Performance, probation, learning, employment changes and go-live (Prompt 4 of 4)

36. **Write and release the Prompt 4 jurisdiction clauses.** `probation_extension_rules` (with its `max_probation_months`
     parameter, or `null` where the law sets no limit), `probation_termination_notice`, `appeal_rights` and `pip_outcomes` have no
     starter text; the probation extension, unsuccessful-probation and PIP letters are blocked until they are released. Review the
     `change_terms_statement` starter before release.

37. **Confirm the visibility of performance documents.** Appraisals, manager assessments and PIPs are visible to the employee, HR
     and the manager chain (direct manager and one level up); never to peers. Privacy/HR should confirm the depth (two levels) and
     whether calibration should be compulsory (`performance.calibration_required`, off).

38. **Decide plan pricing for template features.** `seeds/plan_features.json` currently requires `hr.documents.workflow` for
     e-signature templates, compensation letters and automation, and `hr.documents.bulk` for bulk runs; everything else needs
     `hr.documents.templates`. Product must confirm the mapping before go-live (organizations without a subscription are unaffected).

39. **Set retention durations.** No retention period is defaulted. Each organization admin (or counsel, through the pack's
     retention rules) must set durations per rule key in Documents centre → Retention; until then documents are kept and counted as
     "retention not configured". Disposal and HR-DOC-020 destruction certificates are not part of this release.

40. **Bundle right-to-left fonts and shaping before any Arabic-script pack.** RTL direction is implemented, but the PDF fonts cover
     only Latin and Devanagari. Add Noto Sans Arabic and Arabic shaping (e.g. `arabic-reshaper`, `python-bidi`) and test it with
     counsel-approved text before activating a UAE or Saudi pack.

41. **Confirm e-signature legal sufficiency per country.** The engine records typed or drawn signatures with an e-mail one-time code
     and a certificate (HR-DOC-012). Counsel must confirm, for each activated country, which documents may be signed this way and
     which need a qualified provider (`signing.SignatureProvider`).

42. **Run the country activation kit with counsel.** For each work country in use, download the counsel review pack (Documents
     centre → Country activation), have counsel return the clause texts, and activate the tenant pack under the attestation rules.
     Zoiko Legal should use the platform country-demand report (Super Admin → Template controls) to prioritise PLATFORM_COUNSEL packs;
     platform packs stay SUSPENDED until Zoiko Legal signs them.

43. **Move employment changes to the approval flow.** The existing immediate promote / transfer / confirm actions still exist for
     compatibility and produce no letters or approvals. HR should use Employment changes; Product should decide when to retire the
     immediate actions.

44. **Re-run the load test on staging PostgreSQL.** `docs/templates/performance.md` records a SQLite baseline (p95 83 ms per policy
     document for 2,000 employees). Repeat it on staging with the production document store before the first large tenant.
