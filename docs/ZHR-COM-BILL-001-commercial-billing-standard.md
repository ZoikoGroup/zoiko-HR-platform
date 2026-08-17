# ZOIKO HR — Commercial Billing & Subscription Operating Standard

| Field | Value |
|---|---|
| Document ID | ZHR-COM-BILL-001 |
| Version | 1.0 — Commercial Launch Standard |
| Date | August 7, 2026 |
| Status | Build-ready commercial architecture; final numeric price book, package feature allocation, merchant/tax verification, production limits, and formal go-live approval remain mandatory |
| Owner | Zoiko HR Product / Commercial |
| Classification | Confidential — Internal Use |
| Legal operator | Zoiko Tech Inc. — invoice/merchant identity and address must match verified Finance/Stripe/tax records before live billing |

> Source of truth for the Super Admin (Organization Owner) rebuild and the new billing/subscription module. Converted from `Zoiko HR Commercial Billing_Subscription Operating Standard (1).docx` on 2026-08-17. Numeric prices, merchant/tax verification, and go-live approval are explicitly **not** locked by this document — see Section 3 and Section 25.

---

## Contents
1. Executive Commercial Decisions
2. Canonical Commercial Architecture
3. P0 Launch Blockers — No-Go Until Closed
4. A. Accounts, Billable Workforce & Lifecycle
5. B. Evaluation, Pilot Access & Commercial Conversion
6. C. Modules, Entitlements & Integrations
7. D. Implementation, Migration & Professional Services
8. E. Governed AI, Automation & Usage
9. F. Documents, Storage, History & Retention
10. G. Failed Payments & Service Restriction
11. H. Pricing, Currency & Tax
12. I. Invoices, Credits, Refunds & Legal Compliance
13. J. Subscription Plans & Billing Policy
14. K. Mobile / App Commercial Rules
15. L. Billing Operations & Ownership
16. M. Existing, Internal, Pilot & Demo Workspaces
17. N. Canonical Price Catalog Governance
18. O. Testing, Approval & Operations
19. Billing RBAC — Canonical Access Matrix
20. Mandatory Production Acceptance Checklist
21. Minimum Engineering Data Model
22. Billing & Usage Event Rules
23. Critical Analysis of Current Commercial Drift
24. Authoritative Source Basis
25. Final CTO / Commercial Doctrine

---

## Executive Doctrine

Zoiko HR must have one commercial source of truth across website pricing, application entitlements, workforce records, billing quantity, modules, integrations, implementation services, Stripe, invoices, contracts, retention, lifecycle events and Finance records. A customer must never be charged because a historic employee record exists, an invitation is pending, a failed or duplicate import occurred, an AI request failed, or a non-billable workforce category was misclassified.

### Refinement decision
The final standard deliberately rejects three common commercial errors for HR platforms: billing by login rather than workforce scope; silently turning implementation complexity into hidden recurring fees; and allowing subscription entitlements to override employment-data governance. Zoiko HR is sold as standalone HR SaaS, priced from an approved workforce-and-capability catalog, with explicit implementation and integration boundaries.

---

## 1. Executive Commercial Decisions

| Area | Canonical decision |
|---|---|
| Package taxonomy | Zoiko HR Core, Zoiko HR Advanced, Zoiko HR Enterprise. This three-package standalone architecture is canonical for launch unless explicitly revised. |
| Free access | No permanent free production tier. The public no-signup Product Tour is the default research route. Controlled evaluations/pilots are explicitly classified, time-bounded, non-auto-converting, and non-billable unless an Order Form says otherwise. |
| Paid price book | Numeric Core and Advanced prices are not locked in the approved source record. Engineering must not invent or hard-code them. Enterprise is contract-priced. |
| Primary billing unit | Active billable workforce within the subscribed customer scope. A login is not the billing unit. Administrators, service accounts, applicants/candidates, historic former-worker records, failed imports and pending invitations do not become billable merely by existing. |
| Active worker rule | An in-scope worker becomes billable on the commercial effective start date when the worker is active in the customer workforce. Paid leave normally remains billable. A former worker becomes non-billable from the effective termination date for future quantity calculations. |
| Worker additions/removals | Additions above contracted quantity are prorated to renewal where supported. Reductions release operational capacity immediately but do not create automatic mid-term cash refunds or negative proration; quantity reduces at the next renewal/true-up unless contract terms say otherwise. |
| Implementation | Implementation, migration, configuration and professional services are commercially separate from recurring SaaS. Scope and charges require an accepted Order Form/SOW or approved packaged-service SKU before work begins. |
| Integrations | Zoiko Payroll, ZoikoTime, Zoiko Docs Pro, Zoiko Comply, Zoiko Insights, ZoikoID and Zoiko One remain separate products/services unless an approved catalog expressly bundles a connector or entitlement. An integration entitlement never grants another product subscription. |
| AI | No hidden customer-facing token or model-call billing at launch. AI access is package/policy governed; only successful, permitted countable outputs may consume an explicit allowance. AI never performs autonomous consequential employment decisions. |
| Storage / overages | No hidden document, export, API, storage or AI overage at launch. Use visible quotas, explicit add-ons or contract-defined usage. No "unlimited" claim without approved capacity, economics and abuse controls. |
| Failed payments | Graduated recovery: day 10 restricts new commercial expansion; day 20 applies controlled service restriction while preserving legally/operationally necessary read, billing-remediation, privacy and export paths; day 45 starts termination/closure workflow unless contract terms provide otherwise. |
| Tax | No hard-coded tax rate. SaaS subscription, implementation, training/support and other services may have different tax treatment by jurisdiction and require approved product tax codes/configuration. |
| Invoices | Stripe Billing/Invoicing may support standard web/card subscriptions after compliance setup. Enterprise/contract customers may be Finance-invoiced and pay by bank transfer. Internal entitlement state reconciles provider events but Finance remains the accounting authority. |
| Mobile commerce | Employee/manager mobile apps operate as companion access to an employer-provisioned subscription. No mobile install, login or employee self-service action creates a subscription or billable worker event. |
| Billing permissions | Organization Owner and Billing Admin control payments, plan changes and cancellation. HR Admin, IT Admin, Security/Privacy Admin, managers and employees do not gain financial authority merely from HR operational roles. |
| Existing workspaces | Internal, demo, QA, staging, partner sandbox, evaluation and pilot tenants are non-billable by default. Only COMMERCIAL classification may create live recurring charges. |
| Testing | Use isolated staging, Stripe test mode, synthetic organizations/workers, synthetic lifecycle/import events, test webhooks and isolated email. Never test billing rules by mutating production customer workforce state. |
| Critical consistency correction | The approved Zoiko HR website architecture uses Core / Advanced / Enterprise and states that pricing is based on active workforce size and selected capabilities. This standard adopts that architecture and refuses to infer numeric prices or unapproved module allocations. |

---

## 2. Canonical Commercial Architecture

| Package | Commercial role | Billing metric | Launch entitlement baseline |
|---|---|---|---|
| Zoiko HR Core | Growing organizations needing structured HR fundamentals | Active billable workforce; exact minimum/price per approved catalog | Core HR/employee records, organization structures, onboarding/lifecycle, leave administration, documents/policies, workflow essentials, self-service and baseline reporting. Exact allocation is catalog-controlled. |
| Zoiko HR Advanced | Multi-entity / more complex HR operations | Active billable workforce; exact price per approved catalog | Core plus expanded workflow, administration, reporting, permissions, governance, integrations, SSO/identity controls where approved, extended retention/configuration and governed AI capabilities. Exact allocation is catalog-controlled. |
| Zoiko HR Enterprise | Global, complex or regulated organizations | Contract-defined committed workforce, active workforce or negotiated metric | Advanced plus contractual security/governance, custom integration, residency/retention options where available, enterprise support, negotiated SLA/DPA, migration/implementation scope and approved advanced controls. |

- One immutable catalog version controls package names, recurring prices, workforce billing definitions, modules, add-ons, implementation SKUs, integration SKUs, discounts, Stripe Price IDs, invoice descriptions, emails, support tooling, sales materials and Order Forms.
- Product capability, commercial entitlement and runtime availability are separate. A feature can be commercially entitled but unavailable because of configuration, role, policy, jurisdiction, privacy/security restriction, implementation state, incident state or dependency limitation.
- Zoiko HR is commercially independent and purchasable without Zoiko One. Zoiko One is an optional integrated-suite route, not a prerequisite or superior hidden tier.
- Zoiko Payroll performs payroll calculation/finalization/remittance; ZoikoTime handles time/scheduling/attendance where enabled. Zoiko HR may exchange approved information with them but does not inherit their commercial entitlements or billing events.
- Employee access is not the billing meter. A worker may be billable even without a login, because Zoiko HR is administering the employee record and lifecycle. Conversely, a non-worker administrator or service account can have access without creating an employee billing unit.
- No recurring charge may be generated from an un-reconciled import row, duplicate worker identity, historical record, candidate, archived former employee or technical account.

---

## 3. P0 Launch Blockers — No-Go Until Closed

- Approve the numeric Core and Advanced monthly/annual price book, Enterprise commercial framework, currencies, minimums if any, and any annual savings claims. No numeric price is production truth until catalog approval.
- Lock package feature allocation for Core / Advanced / Enterprise. The homepage package labels are approved; the exact feature split is not yet a license matrix and must not be inferred by engineering.
- Approve the canonical billable-workforce definition, including employees, non-employees/contractors, pre-hires, workers on leave, former workers, multiple assignments, transfers between legal entities and excluded worker types.
- Implement a server-authoritative workforce quantity service. Browser counts, report row counts, identity-user counts and raw imported records must never drive invoices directly.
- Approve recurring quantity change policy for monthly and annual subscriptions, including proration, renewal reductions, true-ups, committed workforce and contract-specific exceptions.
- Approve implementation/migration packaging, what is included versus separately chargeable, change-order rules and the Commercial Service Start Date model.
- Confirm Zoiko Tech Inc. as the contracting/merchant entity for each channel and verify Stripe ownership, bank beneficiary, payout currency, tax registrations, invoice address and sales regions.
- Implement jurisdiction-aware tax with separate tax treatment/configuration for SaaS, implementation, training/support and other taxable/non-taxable service lines as applicable.
- Create explicit commercial entitlements for Zoiko Payroll, ZoikoTime, Zoiko One and other ecosystem integrations so an integration label never silently bundles a separate product subscription.
- Approve document/storage/AI/API/export limits and any add-on pricing only after cost, security, privacy and performance validation. No hidden overage.
- Reconcile public security, privacy, AI-governance, residency, accessibility, uptime and compliance claims with verified production evidence before they appear in contracts or commercial packages.
- Classify every existing tenant/workspace as COMMERCIAL or an explicit non-billable class before enabling live charging.
- Provision isolated test billing and synthetic lifecycle/migration data; validate signed provider events, idempotency, backdated/forward-dated workforce changes, time-zone behavior and invoice reconciliation.
- Implement billing RBAC and separation of duties so HR operational authority does not imply payment/refund/discount authority.
- Complete and sign the Section 20 production acceptance checklist before the live billing feature flag is enabled.

---

## 4. A. Accounts, Billable Workforce & Lifecycle

**A1. What is the billable unit for Core and Advanced?**
Decision: The active billable workforce in the contracted subscription scope, not application logins.
Rationale: Zoiko HR delivers value by administering workforce records and processes. Charging by login would undercount employees without accounts and overcount technical/admin users.
Engineering rule: Maintain an authoritative `billable_workforce_snapshot` derived from effective-dated worker commercial state and contract scope. Provider subscription quantity is reconciled from that snapshot, never from raw identity-user count.

**A2. When does a worker become billable?**
Decision: On the worker's commercial effective start date when the worker is in an ACTIVE_BILLABLE state within the subscribed scope.
Engineering rule: PRE_HIRE_NON_BILLABLE, IMPORT_PENDING and INVITED states do not increase billed quantity. A validated effective start event transitions the worker to ACTIVE_BILLABLE and, if above contracted quantity, triggers an idempotent quantity change/proration event.

**A3. Are workers on paid/unpaid leave billable?**
Decision: Yes by default while the employment/service relationship remains active, unless the contract explicitly excludes a defined leave category.
Engineering rule: Represent leave separately from commercial state. `employment_status=LEAVE` normally maps to `commercial_state=ACTIVE_BILLABLE`; any exception must be contract/catalog driven, not hard-coded by leave type.

**A4. Are former employees or terminated workers billable?**
Decision: No for future recurring quantity once the effective termination date is reached, while historical data may remain retained.
Engineering rule: At termination effective date, transition to FORMER_NON_BILLABLE. Reduce future subscription quantity at the next renewal/true-up under policy; do not delete the record or create an automatic cash refund.

**A5. Are pre-hires, candidates, applicants or onboarding invitees billable?**
Decision: Pre-hires are non-billable until the approved effective start date. Candidates/applicants are non-billable and recruitment is outside the approved core scope unless separately launched.
Engineering rule: Use PRE_HIRE_NON_BILLABLE and OUT_OF_SCOPE_NON_BILLABLE. Invitations or onboarding tasks may reserve workflow capacity but cannot mutate recurring quantity.

**A6. How are contractors/non-employees treated?**
Decision: Only as billable workforce when the customer contract/catalog explicitly includes that worker category in the subscribed population.
Engineering rule: Store `worker_commercial_category` and `billing_inclusion_rule_version`. Default unknown/non-employee categories to EXCLUDED_PENDING_REVIEW rather than automatically charging.

**A7. Can one person be counted twice because of multiple jobs, roles or legal-entity assignments?**
Decision: No, not within the same billing account unless a contract explicitly defines assignment-based billing.
Engineering rule: Deduplicate by canonical worker identity within billing account. Entity transfer inside one billing account creates no net charge; transfer across billing accounts produces matched decrement/increment events with audit linkage.

**A8. Do HR administrators, integration users or service accounts create billable workforce units?**
Decision: Not merely because they can sign in. They are billable only if they are also an in-scope active worker under the workforce metric.
Engineering rule: Identity role and worker commercial state are separate objects. SERVICE_ACCOUNT, IMPLEMENTATION_PARTNER and EXTERNAL_AUDITOR identities are non-worker access principals by default.

**A9. What happens when an active worker is removed mid-term?**
Decision: Operational access and active workforce state change immediately at the effective lifecycle date; no automatic cash refund or negative proration. The lower recurring quantity applies at the next renewal/true-up unless the contract says otherwise.
Engineering rule: Store effective lifecycle date and quantity history. Do not issue negative provider prorations from ordinary offboarding; Finance-approved credit notes are separate events.

**A10. How are backdated or corrected lifecycle events handled?**
Decision: They correct the HR record, but they do not silently rewrite already-finalized invoices. Material billing corrections use a controlled reconciliation/credit/debit workflow.
Engineering rule: If a backdated change crosses a finalized billing period, generate a BILLING_RECONCILIATION_REQUIRED event with evidence. Finance/Billing Operations decides corrective invoice/credit treatment under policy.

---

## 5. B. Evaluation, Pilot Access & Commercial Conversion

**B1. Should Zoiko HR have a permanent free production plan?**
Decision: No. Launch uses a no-signup Product Tour for research and controlled evaluation/pilot workspaces for serious buyers.
Engineering rule: Do not create a FREE_ACTIVE production package. Public tour data is synthetic and outside customer tenancy. Evaluation tenants use explicit EVALUATION/PILOT_NON_BILLABLE classification.

**B2. Should evaluations require a payment card or auto-convert?**
Decision: No card and no automatic conversion by default.
Engineering rule: Evaluation requires `evaluation_ends_at`, approved package scope, data policy and conversion owner. Expiry moves to EVALUATION_ENDED/read-only/closure workflow as configured; it never creates a live Stripe charge automatically.

**B3. Can an evaluation use real employee data?**
Decision: Only under an approved evaluation agreement/DPA, approved environment, customer authorization and data-minimization plan. Synthetic data is the default.
Engineering rule: Store `evaluation_data_classification=SYNTHETIC | CUSTOMER_CONTROLLED`. Customer-controlled evaluation data is prohibited in generic staging and requires approved tenant controls, retention and deletion dates.

**B4. What is required to convert an evaluation/pilot to COMMERCIAL?**
Decision: Accepted package/catalog version, billing metric and quantity/commitment, Service Start Date, billing channel, billing profile, tax determination, authorized payer/Order Form, implementation scope and customer acceptance.
Engineering rule: Privileged conversion writes immutable acceptance references, old/new classification, approver(s), catalog version, quantity basis, commercial_effective_at and implementation/SOW references before live charge creation.

**B5. Should historic pilot usage be back-billed?**
Decision: No unless a signed agreement explicitly says so.
Engineering rule: Conversion begins at `commercial_effective_at`; provider quantity/invoices may not include earlier dates without an explicit contract-backed billing adjustment event.

---

## 6. C. Modules, Entitlements & Integrations

**C1. How are package features enforced?**
Decision: Through server-side entitlements resolved from package + add-ons + contract + tenant configuration, never marketing copy or frontend visibility alone.
Engineering rule: Each protected API/action calls the entitlement service. `entitlement_snapshot` records catalog version, package, add-ons, contract overrides and runtime/policy restrictions.

**C2. Does an integration with Zoiko Payroll, ZoikoTime or Zoiko One include those products?**
Decision: No, unless an approved commercial catalog explicitly bundles them.
Engineering rule: Store connector entitlement separately from external product entitlement. Activation requires validated counterpart tenant/subscription and approved data-sharing configuration.

**C3. Can SSO, SCIM, advanced reporting or governance controls be package-gated?**
Decision: Yes, after Product/Commercial approve the package matrix.
Engineering rule: No engineering team may infer Core/Advanced/Enterprise allocation from homepage prose. Use immutable feature keys and versioned catalog mappings.

**C4. Can third-party connector use create hidden recurring fees?**
Decision: No. Any connector fee, premium integration package or third-party pass-through must be explicit before activation.
Engineering rule: Every chargeable connector has a catalog SKU, amount/metric, customer acceptance and provider mapping. Non-chargeable integrations still generate usage/health telemetry, not invoices.

**C5. What happens if an entitled feature is unavailable by policy or configuration?**
Decision: Display it as unavailable by policy/configuration or implementation state—not as an upgrade prompt when the customer already owns it.
Engineering rule: Entitlement resolver returns `ENTITLED_AVAILABLE`, `ENTITLED_POLICY_BLOCKED`, `ENTITLED_NOT_CONFIGURED`, `NOT_ENTITLED` or `DEPENDENCY_UNAVAILABLE`; billing does not change automatically from runtime availability.

---

## 7. D. Implementation, Migration & Professional Services

**D1. Are implementation services included in the recurring subscription?**
Decision: Only to the extent explicitly included by the approved package/catalog. Otherwise implementation is a separate one-time or milestone-based commercial line.
Engineering rule: Represent implementation as separate catalog/SOW items. Invoices clearly distinguish recurring SaaS from implementation/migration/training/support services.

**D2. When does recurring SaaS billing start?**
Decision: On the contractually agreed Commercial Service Start Date—not merely when an Order Form is signed or an import begins.
Engineering rule: Store `service_start_at` separately from `contract_signed_at`, `implementation_start_at` and `production_launch_at`. Provider subscription creation must use the approved commercial effective date.

**D3. Can a failed import or rejected migration row increase billable workforce?**
Decision: No.
Engineering rule: Only workers that pass reconciliation and enter an approved active commercial state can appear in the billable workforce snapshot. Failed, duplicate, quarantined or unresolved rows remain non-billable.

**D4. How are scope changes handled?**
Decision: Through a documented change order or approved add-on/SKU before extra chargeable work is performed.
Engineering rule: Change request records scope delta, customer approval, price/effort impact, revised milestones and approver. Engineering work is not a billing trigger by itself.

**D5. What if launch is delayed?**
Decision: Commercial treatment follows the signed Order Form/SOW and identified responsibility for delay; engineering may not infer a new billing start date.
Engineering rule: Any start-date change is a privileged commercial amendment with old/new dates, reason, approver and provider reconciliation. Never edit historical dates without audit evidence.

> **Implementation control**: The approved Zoiko HR delivery model is Discovery → Configuration → Data → Integration → Validation → Launch → Adoption. Commercial milestones, if used, must map to objective completion evidence rather than subjective "percent complete" estimates.

---

## 8. E. Governed AI, Automation & Usage

**E1. Should Zoiko HR bill customers per token/model call at launch?**
Decision: No.
Engineering rule: Meter model/token cost internally. Customer-facing AI is package-included, quota-based or an explicitly purchased add-on; no raw model-call invoice lines at launch.

**E2. What AI activity may consume a customer allowance?**
Decision: Only a successfully completed, authorized and policy-permitted countable AI output when an approved catalog defines an allowance.
Engineering rule: Use idempotent AI_USAGE_COMPLETED events. FAILED, CANCELED, DENIED, DUPLICATE and POLICY_BLOCKED events never increment customer quota.

**E3. Can administrators disable AI on paid packages?**
Decision: Yes.
Engineering rule: AI resolution requires entitlement + tenant enablement + permission + data scope + policy + runtime availability. Policy-disabled AI does not create usage charges.

**E4. Can AI make hiring, promotion, discipline, redundancy, termination or other consequential employment decisions?**
Decision: No.
Engineering rule: Block autonomous action routes for consequential decisions. AI may retrieve, summarize, draft or assist within permissions, but state-changing consequential actions require authorized human workflows and audit evidence.

**E5. How do AI quota limits behave?**
Decision: Warn transparently, then block or offer an explicit add-on/upgrade; never silent overage.
Engineering rule: Expose period, unit, current usage, remaining allowance and reset. Enterprise usage-based terms require explicit Order Form unit/rate and acceptance.

---

## 9. F. Documents, Storage, History & Retention

**F1. Can document/storage/retention limits vary by package?**
Decision: Yes, but exact limits require catalog approval before publication or enforcement.
Engineering rule: Store approved `document_storage_limit`, `history_limit`, `retention_capabilities`, `export_capabilities` and applicable add-on IDs per catalog version.

**F2. Does exceeding storage create automatic overage charges?**
Decision: No at launch.
Engineering rule: Use threshold warnings, explicit storage packs, or controlled write restrictions. Enterprise overage is allowed only when contract unit/rate and measurement method are explicit.

**F3. Does a former employee remain billable because records are retained?**
Decision: No.
Engineering rule: Retain former-worker records under retention policy while commercial state remains FORMER_NON_BILLABLE. Retention must never silently reactivate workforce billing.

**F4. Can downgrade or cancellation silently delete HR data?**
Decision: No.
Engineering rule: Before downgrade/cancellation, generate a retention/export impact assessment. Apply documented closure/deletion schedules and legal holds; no destructive action merely to satisfy a lower package limit.

**F5. What data survives subscription termination?**
Decision: Financial/tax records, commercial audit logs, security evidence and legally required retained records survive according to policy; eligible customer content follows the contracted export/retention/deletion workflow.
Engineering rule: Separate customer-content lifecycle from finance/security/legal record stores and evidence ledgers. Closure completion records reference what was deleted, retained and why.

---

## 10. G. Failed Payments & Service Restriction

**G1. What is the standard delinquency timeline?**
Decision: Recovery through day 14; restrict new commercial expansion from day 10; controlled service restriction at day 20; termination/closure workflow at day 45 if unpaid, subject to contract.
Engineering rule: Billing state is derived from reconciled provider/Finance events. Enterprise contractual cure periods can override standard timing through a contract policy object.

**G2. What does day-20 restriction mean for Zoiko HR?**
Decision: Block new paid expansion and non-essential write-heavy/premium operations while preserving authenticated billing remediation, approved read access, privacy/legal-hold actions, required employee record access and controlled export paths.
Engineering rule: Use centrally enforced RESTRICTED/SUSPENDED capability policies. Whitelist required remediation, privacy and export actions. Do not rely on frontend banners alone.

**G3. Which actions are restricted first?**
Decision: New worker expansion above entitlement, new modules/add-ons, new integrations, new bulk imports, non-essential AI generation and new configuration expansion.
Engineering rule: Map each API capability to delinquency policy. Critical record access and statutory/privacy workflows remain separately governed.

**G4. Who receives delinquency notices?**
Decision: Organization Owner, Billing Contact and Billing Admin; Zoiko HR Billing Operations internally; Enterprise also routes to assigned Customer Success/Account Executive.
Engineering rule: Use durable event IDs, role-resolved recipients and deduplication. Never send invoice amounts or financial terms to normal HR admins/employees unless authorized.

**G5. What happens at termination?**
Decision: At the contractual termination point, normal service ends and a controlled export/closure/deletion workflow begins. No immediate destructive purge.
Engineering rule: TERMINATED state blocks ordinary service but retains approved export/billing/privacy routes for the configured retrieval window. Closure follows contract/DPA/legal hold and produces completion evidence.

---

## 11. H. Pricing, Currency & Tax

**H1. What is the global list-price currency?**
Decision: USD unless Commercial approves fixed localized catalog currencies.
Engineering rule: Create immutable currency-specific price objects. No live FX conversion in the client. Store catalog currency, amount, interval, tax behavior and provider price ID.

**H2. What tax rate should checkout use?**
Decision: No hard-coded tax rate.
Engineering rule: Finance/Tax approves registrations, tax product codes, customer location evidence, exemptions/tax IDs and tax engine configuration. Distinguish subscription, implementation, training/support and other service SKUs where tax treatment differs.

**H3. Should customer tax IDs be collected?**
Decision: Yes where relevant to jurisdiction and invoice treatment.
Engineering rule: Billing profile supports legal customer name, billing address, country/subdivision, tax ID type/value, validation status, exemption evidence and billing contact. Finalized invoice tax fields are not silently edited.

**H4. Should payment processor fees be passed through?**
Decision: Absorb standard processor/card fees in list pricing unless a specific Enterprise contract and applicable law permit a separate treatment.
Engineering rule: No default "Stripe fee" invoice line. Bank transfer may be offered on contract without presenting card fees as a hidden penalty.

**H5. Can implementation and SaaS use the same tax code?**
Decision: Not by assumption.
Engineering rule: Each catalog SKU carries its own `tax_code`/`tax_behavior`. Finance owns mapping approval; engineering must not reuse the subscription tax code for all service lines by default.

---

## 12. I. Invoices, Credits, Refunds & Legal Compliance

**I1. Which system generates invoices?**
Decision: Stripe Billing/Invoicing for approved standard web subscriptions; Finance-issued invoicing for Enterprise/contract arrangements.
Engineering rule: Persist provider customer/subscription/invoice/payment/refund/credit-note IDs and source channel. Internal commercial ledger reconciles rather than invents provider payment outcomes.

**I2. What must a Zoiko HR invoice identify?**
Decision: Verified supplier legal entity, invoice number/date, customer legal/billing identity, package, active/committed workforce quantity basis, service period, add-ons/services, implementation lines where applicable, discounts, tax, total, currency, due/status and jurisdiction-required fields.
Engineering rule: Invoice descriptions use aggregate quantities and approved SKUs; never list employee names or sensitive HR data on commercial invoices.

**I3. Are refunds automatic when headcount falls or the customer cancels?**
Decision: No.
Engineering rule: Owner/Billing Admin may request; Billing Operations/Finance applies policy and provider-native refund/credit note. Offboarding events do not call refund APIs.

**I4. How are incorrect workforce counts handled?**
Decision: Treat confirmed overbilling/underbilling as a financial reconciliation incident with corrective credit/debit under policy.
Engineering rule: Compare workforce snapshot, lifecycle event history, catalog version, provider quantity history and invoice lines. Preserve evidence and idempotency before issuing a correction.

**I5. Can finalized invoice fields be silently edited?**
Decision: No.
Engineering rule: Use credit note/reissue or approved provider correction workflow. Preserve the original invoice, correction reason, actor and linkage.

---

## 13. J. Subscription Plans & Billing Policy

**J1. Should annual subscriptions be offered?**
Decision: Yes once annual prices are approved; paid upfront unless contract terms specify another schedule.
Engineering rule: Annual renewal anchor is fixed. Workforce additions above committed quantity may prorate/true-up; reductions do not automatically produce mid-term cash credits.

**J2. How do package upgrades work?**
Decision: Immediate by default after commercial acceptance, with prorated incremental charge where applicable.
Engineering rule: Atomically/recoverably update provider subscription, catalog plan, add-ons, internal ledger and entitlement snapshot. Runtime policy/configuration requirements remain separate.

**J3. How do package downgrades work?**
Decision: At renewal by default after an eligibility and data-impact check.
Engineering rule: Downgrade dry-run returns blockers, data/retention impacts and required remediation. Do not schedule until mandatory blockers are resolved/acknowledged.

**J4. Are minimum workforce commitments allowed?**
Decision: Yes only when explicitly approved in the catalog or Enterprise Order Form; no hidden engineering default.
Engineering rule: Store minimum/committed quantity per subscription/contract. Self-serve logic cannot invent a minimum because a package "looks enterprise."

**J5. How are promotions and negotiated discounts governed?**
Decision: Supported only through approved, auditable discount objects or contracts.
Engineering rule: Promotion/discount records include campaign/contract ID, approver, package/currency eligibility, effective dates, limits, non-stackability and migration treatment. Never alter an immutable historic price.

---

## 14. K. Mobile / App Commercial Rules

> **Mobile doctrine**: Zoiko HR mobile experiences are workforce access surfaces for an organization-managed SaaS subscription. The mobile app does not define the customer's paid plan, workforce quantity or commercial entitlement source.

**K1. Does downloading or signing into the mobile app create a subscription?**
Decision: No.
Engineering rule: Mobile clients read server-side entitlements from the organization/workforce context. No mobile analytics or identity event may mutate subscription quantity.

**K2. Should Zoiko HR sell organization subscriptions inside the employee mobile app at launch?**
Decision: No. Subscription procurement remains web/sales/contract controlled unless a separate mobile-commerce program is explicitly approved.
Engineering rule: Disable in-app commercial purchase surfaces by default. Any future in-app purchase design requires Product/Commercial/Legal review of app-store rules and reconciliation into the same entitlement ledger.

**K3. Can a mobile user be billed twice because they use web and mobile?**
Decision: No.
Engineering rule: Entitlements are account/organization scoped; web and mobile sessions reference the same worker identity and commercial state.

**K4. What happens to mobile access when employment ends?**
Decision: Access follows identity/offboarding policy; the former worker becomes non-billable for future workforce quantity while retained data follows HR/legal policy.
Engineering rule: Termination events revoke/adjust access per policy and transition commercial state independently; no mobile-provider refund or subscription event is created.

---

## 15. L. Billing Operations & Ownership

**L1. Who owns Stripe and payment credentials?**
Decision: Zoiko Tech Inc. through company-managed identities and least-privilege access; never personal emails/shared passwords.
Engineering rule: Authorized company officer/Finance owner holds top-level ownership; Finance and executive backup administer; payment engineering receives scoped developer access; Billing Operations receives least privilege. MFA/security keys required.

**L2. Which bank account receives payouts?**
Decision: The verified company bank account of the exact merchant entity.
Engineering rule: P0 configuration record includes merchant legal name, provider account ID, bank beneficiary, payout currency, tax registrations, verified address, descriptors and allowed sales regions.

**L3. Who handles billing support and disputes?**
Decision: Billing Operations/Finance owns billing inquiries, collections, refunds and chargebacks; Customer Success owns relationship support; Commercial/Legal owns contract escalation; Engineering supplies technical evidence only.
Engineering rule: Support taxonomy includes invoice, quantity/headcount, tax, payment failure, duplicate charge, package/add-on, implementation charge, integration charge, discount, refund/credit, entitlement mismatch and closure.

**L4. Who approves pricing/catalog changes?**
Decision: Commercial/Product proposes; Finance validates economics and tax; Engineering validates implementation; Legal reviews material terms; Founder/Executive authority approves the launch catalog.
Engineering rule: Catalog versions become immutable once referenced by a live invoice/order. New pricing always creates a new version with explicit grandfathering/migration rules.

---

## 16. M. Existing, Internal, Pilot & Demo Workspaces

**M1. How are pre-commercial Zoiko HR tenants treated?**
Decision: Non-billable by default until affirmative COMMERCIAL conversion.
Engineering rule: Set `billing_classification` to PILOT_NON_BILLABLE, EVALUATION, INTERNAL, DEMO, QA, STAGING or PARTNER_SANDBOX. Only COMMERCIAL can generate live recurring charges.

**M2. Are internal Zoiko employee records billable?**
Decision: No when the tenant is classified INTERNAL and not a customer commercial account.
Engineering rule: Provider-live billing is disabled for INTERNAL regardless of worker count. Internal cost telemetry may be measured separately.

**M3. What is required for COMMERCIAL conversion?**
Decision: Accepted package/catalog, billable workforce scope/quantity, Service Start Date, billing channel, customer billing profile/tax determination, authorized payer/Order Form and implementation status/plan.
Engineering rule: Privileged action records actor, customer acceptance evidence, old/new classification, quantity basis, commercial date, provider refs and approval chain.

---

## 17. N. Canonical Price Catalog Governance

| Catalog item | Launch price status | Billing metric | Commercial status |
|---|---|---|---|
| Zoiko HR Core | NOT NUMERICALLY LOCKED | Active billable workforce | Standalone package; numeric amount and exact feature allocation require approval |
| Zoiko HR Advanced | NOT NUMERICALLY LOCKED | Active billable workforce | Standalone package; numeric amount and exact feature allocation require approval |
| Zoiko HR Enterprise | Custom | Contract-defined committed/active workforce or negotiated metric | Sales-led / Order Form / invoice-led |
| Implementation / Migration | Quoted or approved packaged service | Project/milestone/fixed scope | Separate from recurring SaaS unless explicitly included |
| Add-ons / Premium integrations | Only when approved | SKU-specific | No hidden overage or connector fee |

- The approved website says pricing is based on active workforce size and selected capabilities. This standard converts that statement into an engineering rule without inventing numeric price points.
- Every catalog record includes package/SKU, interval, currency, amount, billing metric, minimum/commitment, tax behavior, effective dates, sales channel, provider product/price IDs, entitlement mapping and approval reference.
- Annual savings claims must be mathematically accurate for each approved monthly/annual pair. Never publish a blanket percentage unless it is true for every referenced package.
- Grandfathering, price increases, regional pricing and migrations are explicit catalog transitions. A price already referenced by a finalized invoice is never mutated.
- Implementation, support, training, migration, storage, AI and integration charges require distinct approved SKUs/contract lines when chargeable; engineering effort or usage telemetry is not itself a charge.

---

## 18. O. Testing, Approval & Operations

**O1. Can billing logic be tested against production HR data?**
Decision: No, except tightly controlled production verification that does not mutate commercial state and is explicitly approved.
Engineering rule: Use isolated staging, Stripe test mode, synthetic organizations/workers, synthetic imports, synthetic lifecycle effective dates, test webhooks and isolated emails. Production-like migrations use customer-approved controlled environments, not generic test copies.

**O2. Who gives final go-live approval?**
Decision: Founder/Executive approval after signed Product/Commercial, CTO/Engineering, QA, Finance/Billing, Security/Privacy, Legal/Tax and Customer Operations/Implementation gates.
Engineering rule: Production billing credentials and live-charging feature flag stay disabled until the Section 20 acceptance pack is complete and recorded.

**O3. Which lifecycle communications are required?**
Decision: Versioned event-driven communications covering evaluation, implementation, subscription, quantity changes, invoices, payment failure, restriction, cancellation, refunds/credits, annual renewal, limits/add-ons and Enterprise collections.
Engineering rule: Use durable event IDs, role-based recipient resolution and deduplication. Financial detail is sent only to authorized billing contacts; employee-level HR data is excluded from billing email.

| Lifecycle | Minimum communications |
|---|---|
| Evaluation / pilot | Evaluation started; data-upload readiness if applicable; expiry warning; evaluation ended; commercial conversion confirmation |
| Implementation | Kickoff; scope confirmation; secure upload; import complete/exceptions; integration validation; launch readiness; scope/change order |
| Subscription | Activated; Service Start Date; renewal scheduled; annual renewal 30d/7d; upgrade; downgrade scheduled; workforce quantity/commitment change; add-on change |
| Payment | Invoice/receipt; payment failed; payment method action; overdue; restriction warning; restricted; recovered; termination warning; termination |
| Cancellation / refund | Cancellation scheduled; closure/export dates; reactivation; refund approved/declined; credit note; closure completed |
| Usage / limits | Document/storage/AI/API threshold; limit reached; approved add-on activation |
| Enterprise | Invoice due; PO/procurement request; overdue escalation; renewal/QBR commercial notice; committed-workforce true-up where contracted |

---

## 19. Billing RBAC — Canonical Access Matrix

| Role | View plan/usage | Payment methods | Change plan | Cancel | Refund/credit | Discount/add-on | Invoices |
|---|---|---|---|---|---|---|---|
| Organization Owner | Yes | Yes | Yes | Yes | Request / policy | Yes | Yes |
| Billing Admin | Yes | Yes | Yes | Yes | Request / policy | Within policy | Yes |
| HR Admin | Package + workforce usage only | No | No | No | No | No | No financial detail by default |
| IT / Integration Admin | Technical entitlement view | No | No | No | No | No | No |
| Security / Privacy Admin | Governance/retention view | No | No | No | No | No | No |
| Manager | Relevant feature limits only | No | No | No | No | No | No |
| Employee | Own access only | No | No | No | No | No | No |
| Implementation Partner | Scoped project status only | No | No | No | No | No | No unless separately authorized |
| Zoiko Billing Ops | Tenant-scoped | Support workflow | Support workflow | Policy-controlled | Policy-controlled | Policy-controlled | Internal/support |
| Engineering | No routine customer billing access | No | No | No | No | No | Test mode only |

> **Separation-of-duties rule**: HR administration, employee-record authority, performance/leave approval, integration administration, security/privacy administration and billing authority are separate permissions. A user who can change employment data cannot thereby change payment methods, issue refunds, approve discounts or alter the customer's commercial contract.

---

## 20. Mandatory Production Acceptance Checklist

**Commercial & Product**
- [ ] Canonical package taxonomy implemented: Zoiko HR Core / Advanced / Enterprise.
- [ ] Numeric Core/Advanced monthly and annual prices approved or self-serve charging disabled until they are.
- [ ] Exact package entitlement matrix approved; no feature allocation inferred from marketing copy.
- [ ] Billable workforce definition approved across employees, leave, pre-hire, former workers, non-employees, multiple assignments and transfers.
- [ ] Zoiko HR is purchasable without Zoiko One; ecosystem products remain separate commercial entitlements unless explicitly bundled.
- [ ] No recruitment/EOR/payroll-processing/unsupported module is commercialized through an HR package by implication.

**Workforce Quantity & Lifecycle**
- [ ] Server-authoritative billable workforce snapshot implemented and reconciled to provider quantity.
- [ ] Worker import/invite/pending/pre-hire states do not bill.
- [ ] Effective start activates billing only after valid commercial state transition.
- [ ] Leave remains billable by default; terminated/former workers stop future billable quantity while retained records remain.
- [ ] Multiple roles/assignments do not double count within one billing account unless contract explicitly requires it.
- [ ] Backdated corrections across finalized invoices create reconciliation workflow rather than silent invoice mutation.
- [ ] Proration/renewal reduction/true-up behavior tested for monthly, annual and Enterprise committed models.

**Implementation & Migration**
- [ ] Implementation/migration recurring-vs-services separation approved and represented in catalog/SOW.
- [ ] Commercial Service Start Date is distinct from signature, implementation start and production launch dates.
- [ ] Failed, duplicate, quarantined or unreconciled imported rows cannot create billable workforce.
- [ ] Change-order workflow requires customer approval before extra chargeable work.
- [ ] Secure migration environments, retention, exception handling and reconciliation evidence approved.

**Merchant, Tax & Invoicing**
- [ ] Stripe merchant/legal entity/bank beneficiary/verified address/tax registrations/payout currency/sales regions approved.
- [ ] No hard-coded tax rate exists; SaaS and professional-service SKUs carry approved tax treatment.
- [ ] Customer billing address/tax ID/exemption fields implemented where required.
- [ ] Invoices show aggregate workforce quantity/commitment without employee names or HR-sensitive details.
- [ ] Credits/refunds/chargebacks preserve provider and internal audit evidence.

**Modules, Integrations & AI**
- [ ] Server-side entitlement enforcement covers all licensed modules, APIs, exports, integrations and AI.
- [ ] Zoiko Payroll/ZoikoTime/Zoiko One integration does not grant those product subscriptions or data rights.
- [ ] No hidden connector/storage/AI/API overage is enabled.
- [ ] AI failures/cancellations/denials do not consume customer quota.
- [ ] AI cannot autonomously execute consequential employment decisions.
- [ ] Runtime policy/configuration blocks are distinguishable from NOT_ENTITLED upgrade states.

**Failed Payment & Closure**
- [ ] Day-10 expansion restriction, day-20 controlled restriction, day-45 termination/closure and recovery paths tested.
- [ ] Controlled restriction preserves approved billing remediation, privacy/legal-hold, read and export rights.
- [ ] Cancellation, reactivation, refund/credit, chargeback and closure workflows tested.
- [ ] Downgrade dry-run identifies SSO, integration, retention, storage, workflow, AI and governance blockers.
- [ ] Closure generates export/deletion/retention evidence and does not immediately destroy legally retained records.

**Environments & QA**
- [ ] Isolated staging and Stripe test environments exist; no uncontrolled production HR data is used for billing QA.
- [ ] Synthetic fixtures cover Core, Advanced, Enterprise, evaluation, pilot, active, leave, pre-hire, former, contractor/nonemployee, transfer, rehire and duplicate-import states.
- [ ] Signed webhooks, replay protection, ordering tolerance and idempotency pass.
- [ ] E2E coverage includes evaluation → conversion → implementation → worker activation → quantity change → renewal/cancel.
- [ ] Billing effective-date/time-zone boundary tests pass for backdated/forward-dated lifecycle changes.
- [ ] Rollback plan and live billing feature flag tested; no open P0/P1 billing defect remains.

**Security, Privacy & Access**
- [ ] Billing RBAC tested; HR/IT/Security admins cannot change financial settings unless separately assigned Billing Admin.
- [ ] Payment card data is not stored when provider tokens/references suffice.
- [ ] Commercial/admin actions are audit logged with actor, tenant, before/after, reason, source, channel, event ID and timestamp.
- [ ] Secrets reside in approved secret manager; no live keys in client/source control.
- [ ] Support access is tenant-scoped, logged and time-bounded where appropriate.
- [ ] Public security/privacy/AI/compliance claims have evidence-owner approval; no unverified assurance becomes an invoice/contract promise.

**Customer Operations & Release Authority**
- [ ] Billing/implementation lifecycle emails approved and tested against the governed communications registry.
- [ ] Runbooks exist for invoice query, quantity dispute, payment failure, incorrect tax, duplicate charge, refund/credit, implementation charge, entitlement mismatch and closure.
- [ ] Billing portal exposes plan, aggregate workforce quantity/commitment, invoices, payment methods, renewal/cancel path and authorized contacts.
- [ ] Every internal/pilot/demo/partner/QA/evaluation tenant is explicitly non-billable unless converted.
- [ ] Launch record captures approver, date/time, catalog version, merchant/provider account, tax config version, quantity policy version, environment and rollback owner.

---

## 21. Minimum Engineering Data Model

| Field / object | Requirement |
|---|---|
| `organization.billing_classification` | COMMERCIAL \| EVALUATION \| PILOT_NON_BILLABLE \| INTERNAL \| DEMO \| STAGING \| QA \| PARTNER_SANDBOX |
| `subscription.status` | EVALUATION \| ACTIVE \| PAST_DUE \| RESTRICTED \| SUSPENDED \| CANCEL_AT_PERIOD_END \| CANCELED \| TERMINATED |
| `subscription.billing_channel` | WEB_STRIPE \| ENTERPRISE_INVOICE \| RESELLER_APPROVED \| OTHER_APPROVED |
| `plan.code` | CORE \| ADVANCED \| ENTERPRISE |
| `plan.price_catalog_version` | Immutable catalog version reference |
| `subscription.billing_metric` | ACTIVE_WORKFORCE \| COMMITTED_WORKFORCE \| CONTRACT_DEFINED |
| `subscription.quantity` / `committed_quantity` | Provider/contract quantity; reconciled to approved billing metric |
| `organization.billing_timezone` | Authoritative commercial effective-date timezone; not browser-local time |
| `worker.commercial_state` | PRE_HIRE_NON_BILLABLE \| ACTIVE_BILLABLE \| FORMER_NON_BILLABLE \| EXCLUDED_NON_BILLABLE \| PENDING_REVIEW |
| `worker.worker_commercial_category` | EMPLOYEE plus explicit approved non-employee categories; versioned inclusion rule |
| `worker.effective_start` / `effective_end` | Effective-dated lifecycle fields used for commercial state transition |
| `organization.active_billable_workforce` | Derived count from canonical worker identity and current commercial state |
| `billable_workforce_snapshot` | Quantity, snapshot_at, policy/catalog version, source event watermark, reconciliation status |
| `billing_profile` | Legal customer name, billing address, tax IDs, exemption evidence, billing contacts |
| `provider_refs` | Stripe customer/subscription/invoice/payment/refund/credit-note IDs and approved channel refs |
| `entitlement_snapshot` | Package + add-ons + contract overrides + catalog version + runtime/policy availability |
| `module_entitlement` | Feature/module key, state, source SKU/contract, effective dates |
| `integration_entitlement` | Connector key, counterpart product requirement, included/chargeable status, effective dates |
| `implementation_engagement` | SOW/order ref, scope version, milestones, service start, launch, change orders, billing method |
| `storage_usage_event` | Tenant/object category, bytes/count, period, countable unit, source event ID |
| `ai_usage_event` | Capability, source object, completion state, countable unit, model/cost internal metadata, period |
| `worker_lifecycle_event` | Worker identity, event type, effective date, source, before/after commercial state, idempotency key |
| `billing_reconciliation_case` | Period, discrepancy type, expected/actual quantity, evidence refs, financial action, approver |
| `billing_audit_event` | Actor, tenant, action, before/after, reason, source event ID, channel, timestamp |

---

## 22. Billing & Usage Event Rules

| Event | Canonical behavior |
|---|---|
| ORGANIZATION_CREATED | Create non-commercial/evaluation state; no live charge. |
| EVALUATION_STARTED | Set EVALUATION classification and explicit end/data policy; no auto-convert. |
| WORKER_IMPORT_RECEIVED | No charge. Records remain pending until validation/reconciliation. |
| WORKER_IMPORT_REJECTED / DUPLICATE | Never count toward billable workforce. |
| PRE_HIRE_CREATED | Non-billable until effective start/commercial activation. |
| WORKER_START_EFFECTIVE | Transition to ACTIVE_BILLABLE if in scope; update workforce snapshot and prorate increment when policy requires. |
| WORKER_LEAVE_STARTED | Employment status changes; commercial state remains ACTIVE_BILLABLE by default. |
| WORKER_TERMINATION_EFFECTIVE | Transition to FORMER_NON_BILLABLE; reduce future renewal/true-up quantity; no automatic cash refund. |
| WORKER_REHIRED | Re-enter billable state on new effective start under current catalog/contract. |
| WORKER_TRANSFER_SAME_BILLING_ACCOUNT | No net quantity change; preserve entity history. |
| WORKER_TRANSFER_DIFFERENT_BILLING_ACCOUNT | Matched decrement/increment events under each account with audit linkage. |
| PLAN_UPGRADE | Immediate by default; prorate incremental charge; re-resolve entitlements. |
| PLAN_DOWNGRADE | Schedule for renewal only after eligibility/data-impact dry-run. |
| MODULE_ADDON_ACTIVATED | Charge only from approved SKU/contract acceptance; then resolve entitlement. |
| INTEGRATION_ENABLED | No external-product subscription implied; connector charge only if explicit SKU accepted. |
| IMPLEMENTATION_MILESTONE_ACCEPTED | Invoice only if the SOW/catalog defines milestone billing and acceptance criteria are met. |
| AI_ASSIST_COMPLETED | Increment explicit AI allowance once if countable and policy-permitted. |
| AI_ASSIST_FAILED/CANCELED/DENIED | Do not consume customer quota or create charge. |
| STORAGE_THRESHOLD_REACHED | Notify/restrict/offer explicit add-on; no silent overage. |
| PAYMENT_FAILED | Enter recovery and notify authorized billing contacts. |
| DAY_10_UNPAID | Restrict new commercial expansion and defined cost-increasing actions. |
| DAY_20_UNPAID | Apply controlled service restriction while preserving approved remediation/read/privacy/export pathways. |
| DAY_45_UNPAID | Terminate standard subscription and begin controlled export/closure/deletion workflow. |
| PAYMENT_RECOVERED | Restore entitlements automatically if no other suspension/restriction reason exists. |
| CANCEL_REQUESTED | Set cancel_at_period_end or contract-defined cancellation path; begin impact/closure planning. |
| PROVIDER_REFUND_CONFIRMED | Reconcile provider refund/credit and internal ledger; never infer from client UI. |
| COMMERCIAL_CONVERSION | Set accepted package/catalog/quantity/channel/service start and change classification to COMMERCIAL under approval. |
| BILLING_COUNT_DISCREPANCY | Open reconciliation case; do not silently rewrite finalized invoice history. |

---

## 23. Critical Analysis of Current Commercial Drift

| Drift area | Observed issue | Launch decision |
|---|---|---|
| Package architecture | Approved homepage uses Core / Advanced / Enterprise, but exact feature allocation is intentionally not fixed in public copy. | Adopt three-package taxonomy; lock a separate entitlement matrix before billing launch. |
| Numeric pricing | Approved sources explain pricing methodology but do not provide verified Core/Advanced numeric rates. | Do not invent prices. Keep self-serve charging disabled until catalog approval. |
| Billing metric | Homepage states pricing is based on active workforce size and selected capabilities, but "active workforce" needs an engineering definition. | Use effective-dated billable workforce, not login count or raw HR row count; explicitly govern pre-hires, leave, former workers and non-employees. |
| Free/trial posture | Homepage deliberately provides a no-signup Product Tour and avoids a forced trial journey. | No permanent free production tier; use controlled non-auto-converting evaluations/pilots. |
| Implementation economics | Implementation is a material buyer concern and can vary by workforce, entities, data, jurisdictions and integrations. | Separate recurring SaaS from implementation/migration services; use approved SOW/catalog/change-order controls. |
| Zoiko One relationship | Zoiko HR is standalone but can integrate into Zoiko One. | No mandatory suite purchase and no hidden bundling. A Zoiko One route cannot rewrite the Zoiko HR price catalog by implication. |
| Payroll/time boundary | HR exchanges approved information with Zoiko Payroll/ZoikoTime, but those products own payroll/time functions. | Separate commercial entitlements and data contracts. Zoiko HR billing never charges wages, payroll taxes or time-processing amounts. |
| AI positioning | Governed AI is part of the approved product scope but consequential employment decisions remain human-accountable. | No token billing at launch; no autonomous employment decisions; policy can disable AI without changing the subscription. |
| Storage/retention | HR documents and historic worker records can remain after a worker becomes non-billable. | Do not equate retention with paid workforce status; no silent deletion/overage. |
| Delinquency | Generic SaaS hard lockouts are too crude for HR records and employee/privacy workflows. | Use graduated restriction preserving required read, remediation, privacy/legal-hold and export routes. |
| Tax | Subscription and professional services can have different jurisdictional tax treatment. | Use SKU-specific tax configuration; no universal SaaS rate reused for services. |
| Existing environments | Design partners, QA, internal and demo tenants may predate billing. | Default non-billable and require affirmative COMMERCIAL conversion. |
| Claims | Security/privacy/accessibility/global-operation statements are commercially important but cannot exceed verified production evidence. | Contract, pricing and invoice descriptions must use evidence-approved claims only. |

---

## 24. Authoritative Source Basis

Internal / saved Zoiko HR basis. This standard incorporates the approved standalone commercial doctrine, three-package pricing architecture, active-workforce pricing methodology, implementation and migration model, product boundaries, governed AI posture, controlled integrations, billing communications and corporate-operator position. Historic or illustrative values that are not explicitly approved are treated as non-authoritative.

| Source | Reference / use |
|---|---|
| Zoiko HR — Homepage Wireframe & Conversion Specification v3.0 | Canonical product definition, standalone SaaS doctrine, Core / Advanced / Enterprise package architecture, pricing based on active workforce size and selected capabilities, no-signup Product Tour, implementation model and claim governance. |
| Zoiko HR — Top Navigation & Mega Menu Wireframe Specification v2.0 | Pricing as a direct commercial destination, transparency where numeric rates are unpublished, standalone availability, integration boundaries and implementation routes. |
| Zoiko HR — About Us Page Wireframe & Production Copy v1.0 | Corporate operator, global/multi-jurisdictional positioning, product boundaries, implementation stages, support/closure expectations and standalone Zoiko One relationship. |
| Zoiko HR — Email Communications System v2.0 | Subscription/billing/account-administration lifecycle, overdue/restriction communications, cancellation/closure, privacy-safe billing communications and approval ownership. |
| Zoiko HR — Footer Wireframe Specification v2.0 Corrected Final | Availability qualifiers, legal boundary and verified public-claim discipline. |
| Saved Zoiko HR canonical product definition | Comprehensive HR platform across employee records, onboarding, leave, attendance, documentation, performance, policies and workforce administration; payroll calculation remains in Zoiko Payroll and time/scheduling remains in ZoikoTime where enabled. |
| Zoiko Tech Inc. merchant doctrine | Zoiko HR is a trading/product brand operated by Zoiko Tech Inc.; live merchant, bank, tax and invoice identity must match verified Finance records. |

> **Source-control rule**: This document is the commercial implementation baseline. Website copy, application constants, Stripe products/prices, invoices, emails, sales sheets, Order Forms and future mobile commerce are downstream artifacts and must be normalized to the approved catalog and policy—not treated as independent sources of truth.

---

## 25. Final CTO / Commercial Doctrine

> **Commercial-mode standard**: Zoiko HR should monetize governed workforce administration, not accidental database state. Every paid workforce unit, package, module, integration, implementation service, invoice, tax decision, payment state, AI allowance, retention transition and closure action must be deterministic, auditable, contract-aligned and governed by one versioned commercial source of truth.

- One package taxonomy: Zoiko HR Core / Advanced / Enterprise.
- One versioned price and entitlement catalog — no numeric price guessing and no hidden module allocation.
- One workforce billing definition — active in-scope workers, not logins, invites, raw imports or historical records.
- One canonical worker identity per billing account — no double charging because of multiple roles or assignments.
- One separation between recurring SaaS and implementation/migration/professional services.
- One entitlement ledger across application services, Stripe/Finance invoicing, contract overrides and approved channels.
- One ecosystem boundary — Zoiko Payroll, ZoikoTime and Zoiko One remain separate commercial products unless explicitly bundled.
- One governed AI rule — no autonomous consequential employment decisions and no hidden token billing at launch.
- No hidden storage, AI, API, export, integration or document overage at launch.
- No paid entitlement may weaken role-based access, privacy, retention, security, human accountability or legal-hold controls.
- No hard-coded universal tax rate and no assumption that SaaS and professional services share one tax treatment.
- No finalized invoice is silently rewritten because an HR effective date was corrected later.
- No production billing test mutates live customer workforce or commercial state.
- No internal, demo, QA, evaluation or pilot tenant becomes billable without affirmative conversion.
- No unverified security, privacy, accessibility, compliance, residency or global-coverage claim becomes a commercial promise.
- No employee wage, tax-withholding or payroll-remittance money flow is co-mingled with Zoiko HR subscription billing; payroll processing remains within Zoiko Payroll.
- No live charging until Product/Commercial, Finance, Tax/Legal, Security/Privacy, QA, CTO/Engineering, Implementation/Customer Operations and executive approval gates are complete.

### Final Approval Record — To Be Completed at Go-Live

| Approval gate | Sign-off |
|---|---|
| Product / Commercial | Name / signature / date |
| Finance / Billing | Name / signature / date |
| CTO / Engineering | Name / signature / date |
| QA | Name / signature / date |
| Security / Privacy | Name / signature / date |
| Legal / Tax | Name / signature / date |
| Implementation / Customer Operations | Name / signature / date |
| Founder / Executive Approval | Name / signature / date |
