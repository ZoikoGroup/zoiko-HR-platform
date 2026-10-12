# ZOIKO HR — Commercial Plan Entitlement & Subscription Control Specification

**Commercial Mode - Product, Engineering, Billing, Sales & Operations Decision Pack**

> **EXECUTIVE DOCTRINE**
>
> **One versioned commercial catalog must determine what a tenant has bought; one server-authoritative entitlement layer must determine what the tenant may use. No browser flag, stale cache, imported employee row, trial state, payment-provider UI, or support action may independently grant paid capability.**

| Field | Controlled value |
|---|---|
| Document ID | ZHR-COM-ENT-001 |
| Version | 1.0 - Commercial Launch Entitlement Standard |
| Date | August 27, 2026 |
| Status | Build-ready recommended baseline; numeric Core/Advanced prices remain a separate approval gate |
| Product | Zoiko HR |
| Legal operator | Zoiko Tech Inc. - merchant/invoice identity subject to verified Finance and tax records |
| Owner | Zoiko HR Product / Commercial |
| Prepared for | Engineering, Product, UI/UX, Finance, Billing Operations, Sales, Marketing, Customer Success, Implementation, Security, Privacy, Legal/Compliance, QA |
| Language | American English |
| Classification | Confidential - Internal Use |

**REFINED FINAL - COMMERCIAL & ENGINEERING BASELINE**

## Executive Decision

Yes. Zoiko HR requires a dedicated Commercial Plan Entitlement & Subscription Control Specification. The existing Commercial Billing & Subscription Operating Standard already identifies the missing package-to-feature license matrix as a P0 launch blocker. This document closes that gap and defines the engineering behavior required to make package enforcement, trials, conversions, upgrades and downgrades deterministic and auditable.

> **DECISION**
>
> **Lock Core / Advanced / Enterprise as the launch package taxonomy. Keep numeric Core and Advanced prices outside this document until the approved price book is signed off. Make Advanced the recommended commercial package, without using "Most Popular" until actual sales data supports that claim.**

## The five launch decisions

> **1.** Core is the complete HR foundation: governed employee records, single-entity organization management, onboarding/offboarding, leave, documents/policies, self-service, standard workflows and reporting. It must be useful in production, not a crippled demo tier.
>
> **2.** Advanced is the commercial growth engine: multi-entity/global administration, custom workflow automation, performance processes, advanced reporting, SSO, API/webhooks, deeper governance configuration and governed workforce-data AI. This is the recommended plan for organizations with operational complexity.
>
> **3.** Enterprise is not a feature dump. It adds contract-grade security/governance, SCIM and advanced identity, sandbox/promotion controls, custom integrations, enterprise support/SLA, complex implementation and negotiated retention/residency options where actually available.
>
> **4.** A 14-day Advanced Evaluation is recommended as the standard optional free trial: no card required, sample data by default, no automatic paid conversion, one trial per organization, and restricted production integrations. The existing no-signup Product Tour remains the default public research route.
>
> **5.** Upgrades are designed to be fast; downgrades are designed to be safe. A downgrade never silently deletes customer data, breaks authentication, strands in-flight workflows or disables a dependency without an impact report and remediation path.

## Document relationship and authority

| Source | Authority |
|---|---|
| ZHR-COM-ENT-001 - this document | Canonical package feature allocation, entitlement keys, trial entitlement profile, plan-change orchestration, downgrade safety and runtime enforcement. |
| ZHR-COM-BILL-001 | Canonical billing mechanics: billable workforce, invoices, taxes, payment failure, implementation charging, commercial classification and billing governance. |
| Approved Price Catalog version | Canonical numeric prices, currencies, billing interval, product/price IDs, approved limits, discounts and effective dates. |
| Zoiko HR product/engineering specifications | Canonical product behavior and functional capability. They do not create commercial rights by themselves. |
| Website, sales sheets, checkout and app UI | Downstream representations. They must read from or be validated against the approved catalog; they are never the entitlement source of truth. |

## Critical scope correction

- Zoiko HR does not inherit Zoiko Payroll, ZoikoTime, Zoiko One or any other Zoiko product subscription merely because a connector appears in the UI.
- Payroll calculation/finalization/remittance remain within Zoiko Payroll. Time tracking, scheduling, attendance capture and timesheets remain within ZoikoTime where enabled.
- Security, privacy, tenant isolation, encryption, audit evidence, accessibility and legally required data-rights paths are platform safeguards and must not be weakened because a customer buys a lower plan.
- Numeric Core/Advanced prices are intentionally not manufactured here. Engineering must fail closed if a live checkout attempts to reference an unapproved price/catalog version.

# 1. Purpose, Scope and Commercial Objective

The purpose of ZHR-COM-ENT-001 is to convert commercial packaging into enforceable software behavior. It gives Engineering a stable contract for determining whether a tenant may view, configure or execute a feature; gives Finance and Billing an auditable link from accepted package to invoice; gives Sales a commercially coherent package ladder; gives Customer Success a safe upgrade/downgrade model; and gives Product one place to control future packaging changes.

## 1.1 In scope

- Core / Advanced / Enterprise feature and service allocation.
- Commercial entitlement keys, plan-feature mapping and effective-dated catalog versions.
- Free trial/evaluation policy, trial restrictions and conversion to paid subscriptions.
- Upgrade, downgrade, cancellation, reactivation and Enterprise transition behavior.
- Frontend gating and server-side authorization for commercial capability.
- Billable-workforce linkage without allowing headcount telemetry to become the feature authorization system.
- Customer billing settings UX and Zoiko Super Admin commercial controls.
- Events, audit evidence, reconciliation, QA and release gates.

## 1.2 Explicitly out of scope

- Setting unapproved numeric prices, discount percentages, annual savings claims or tax rates.
- Inventing capabilities not present in the Zoiko HR product architecture.
- Bundling Zoiko Payroll or ZoikoTime subscriptions into Zoiko HR by implication.
- Autonomous employment decisions, hidden employee scoring or AI-based consequential decision making.
- Using frontend feature flags as the final authorization control.

## 1.3 Success test

> **NORTH-STAR TEST**
>
> **For any tenant, worker count, plan, trial state, payment state and feature request, two independent engineers should be able to derive the same entitlement result from the same catalog version and authoritative server state.**

# 2. Source Reconciliation and Refinements Adopted

| Area | Existing source position | Final refinement |
|---|---|---|
| **Package taxonomy** | Existing commercial baseline already locks Core / Advanced / Enterprise. | Retain exactly; no fourth paid tier at launch. |
| **Numeric pricing** | Existing baseline says Core/Advanced numeric prices are not verified. | Do not invent. Bind entitlements to immutable catalog SKUs; live checkout remains gated until price approval. |
| **Feature allocation** | Existing baseline intentionally leaves exact plan allocation open. | This document becomes the canonical entitlement allocation. |
| **Free access** | Existing baseline: no permanent free production tier; Product Tour + controlled evaluations. | Add optional 14-day Advanced Evaluation, still non-auto-converting and non-billable. |
| **Billing unit** | Active billable workforce, not logins. | Keep separate from feature authorization; workforce meter drives quantity, entitlement service drives capability. |
| **Admin console** | Commercial health and entitlement integrity are required control-plane concerns. | Add catalog, plan-change, trial, mismatch and reconciliation operations to Super Admin. |
| **Product boundaries** | HR can integrate with payroll/time but does not own those domains. | Connector entitlement never grants the external product subscription. |
| **AI** | Governed AI is in scope; no autonomous consequential decisions. | Tier AI by use case and administrative control, not by hidden token billing. |

## 2.1 Market calibration - why this split is commercially defensible

| Reference | Observed public pattern (Aug. 27, 2026) | Zoiko HR application |
|---|---|---|
| **BambooHR** | Core / Pro / Elite; public US pricing currently separates performance into Pro and compensation/custom analytics into Elite. | Keep Core complete; place performance and advanced analytics above Core. |
| **Personio** | Core / Core Pro plus apps; Core Pro adds position management, multi-entity, API and broader permissions. | Place multi-entity, API and advanced administration in Advanced; adopt non-auto-converting 14-day evaluation. |
| **HiBob** | Core HR foundation, then selectable modules; pricing depends on employee count and modules. | Use workforce-based pricing plus clear capability ladder; avoid excessive add-on fragmentation. |
| **Deel HR** | Core foundation with higher tiers adding performance/learning/surveys and then workforce planning/compensation. | Keep strategic/complex capabilities above foundation while maintaining strong Core utility. |

# 3. Canonical Commercial Package Strategy

| Plan | Positioning | Best fit | Commercial differentiator | Price status |
|---|---|---|---|---|
| **Zoiko HR Core** | Reliable HR foundation | Growing organizations operating primarily through one legal entity that need a governed HR system of record and dependable day-to-day HR administration. | Complete core records + lifecycle + leave + documents + self-service + standard workflows/reporting. | Catalog-controlled; numeric approval pending. |
| **Zoiko HR Advanced** | Operate complex HR with deeper automation and insight | Growing and mid-market organizations, multi-entity groups and HR teams requiring custom processes, performance, advanced reporting, SSO, APIs and governed AI. | Everything in Core + multi-entity/global administration + performance + custom workflows + advanced analytics + SSO/API + workforce-data AI. | Catalog-controlled; numeric approval pending. Recommended plan. |
| **Zoiko HR Enterprise** | Govern HR at enterprise scale | Large, regulated, global or highly complex organizations with contractual security, integration, support and implementation requirements. | Everything in Advanced + enterprise identity/provisioning + sandbox/promotion + custom integrations + contractual governance/support/SLA and negotiated controls. | Custom / Order Form. |

## 3.1 Core must not be intentionally frustrating

Core should win customers who need a serious HRIS foundation. The upgrade path should be created by genuine complexity: more entities, custom workflows, performance processes, custom analytics, SSO/API and AI over workforce data. Core must not withhold audit history, basic permissions, MFA, data export rights or essential HR administration merely to force an upgrade.

## 3.2 Advanced is the recommended commercial center of gravity

Advanced should carry the strongest self-serve commercial proposition. Use a "Recommended" badge. Do not use "Most Popular" until customer purchase data demonstrates that statement.

## 3.3 Enterprise is contract depth, not cosmetic exclusivity

Enterprise should monetize the work and risk associated with complex identity, advanced governance, dedicated sandbox/promotion, custom integrations, implementation scale, service commitments and contractual assurance. It should not simply hide normal product security behind a high-priced tier.

# 4. Entitlement Model and Allocation Legend

| Marker | Meaning |
|---|---|
| Included | Feature is commercially entitled in the plan, subject to role, policy, configuration, jurisdiction and service health. |
| Standard | Included with standard configuration/capacity defined in the catalog. No hidden overage. |
| Advanced | Expanded or configurable capability included from Advanced upward. |
| Contract | Available only where expressly included in Enterprise Order Form/catalog. |
| Separate service | Requires a separate SKU, SOW or subscription. The presence of a connector does not grant the external product. |
| Not included | No new use may be initiated under the plan. Historic data is handled according to downgrade/retention rules. |

# 5. Canonical Feature Entitlement Matrix

> **IMPLEMENTATION RULE**
>
> **Every row below must map to one or more versioned entitlement keys. UI labels may change; entitlement keys may not be repurposed after release. A feature is available only when commercial entitlement AND authorization AND runtime policy all allow it.**

## 5.1 Core HR, organization and self-service

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Employee records & profiles | hr.records | Included | Included | Included |
| Effective-dated workforce changes | hr.records.effective_changes | Included | Included | Included |
| Employee directory & org chart | hr.org.directory | Included | Included | Included |
| Locations, departments, teams | hr.org.structure | Included | Included | Included |
| Legal entity administration | hr.org.legal_entities | 1 active legal entity | Multi-entity | Multi-entity + enterprise governance |
| Jobs / job catalog | hr.org.jobs | Standard | Advanced | Advanced |
| Position management | hr.org.positions | Not included | Included | Included |
| Custom HR fields | hr.records.custom_fields | Standard set / catalog limit | Expanded configuration | Contract-governed / expanded |
| Record history / audit trail | hr.records.history | Included | Included | Included |
| Employee self-service | hr.self_service.employee | Included | Included | Included |
| Manager self-service | hr.self_service.manager | Included | Included | Included |
| Employee / manager mobile access | hr.mobile.companion | Included | Included | Included |

## 5.2 Onboarding, lifecycle, leave, documents and policies

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Onboarding plans | hr.lifecycle.onboarding | Standard templates | Custom + reusable | Custom + enterprise governance |
| Separation / offboarding plans | hr.lifecycle.offboarding | Standard | Advanced | Advanced |
| Lifecycle task ownership & reminders | hr.lifecycle.tasks | Included | Included | Included |
| Lifecycle automation / conditional tasking | hr.lifecycle.automation | Not included | Included | Included |
| Leave requests & balances | hr.leave.core | Included | Included | Included |
| Leave calendars / standard policy rules | hr.leave.policies | Standard | Advanced | Advanced |
| Complex accrual, carryover & policy groups | hr.leave.advanced | Not included | Included | Included |
| Multi-country leave configurations | hr.leave.global | Not included | Included | Included + contract governance |
| Documents & employee files | hr.documents.core | Included | Included | Included |
| Policies & acknowledgments | hr.documents.policies | Included | Included | Included |
| Advanced document workflows / e-sign orchestration | hr.documents.workflow | Not included | Included where production-enabled | Included / contract integration |
| Bulk document distribution / targeting | hr.documents.bulk | Not included | Included | Included |

## 5.3 Workflows, approvals and performance processes

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Standard HR workflows & approvals | hr.workflow.standard | Included | Included | Included |
| Custom no-code workflow builder | hr.workflow.builder | Not included | Included | Included |
| Conditional / multi-step approvals | hr.workflow.conditional | Not included | Included | Included |
| Bulk operational actions | hr.workflow.bulk_actions | Not included | Included | Included |
| Delegated administration | hr.admin.delegation | Standard manager delegation | Expanded scopes | Enterprise scopes / segregation of duties |
| Maker-checker / dual-control patterns | hr.workflow.dual_control | Not included | Selected admin controls | Contract / enterprise governance |
| Performance review cycles | hr.performance.cycles | Not included | Included | Included |
| Goals / structured performance inputs | hr.performance.goals | Not included | Included | Included |
| 1:1 process support | hr.performance.one_to_one | Not included | Included | Included |
| Performance reporting | hr.performance.reporting | Not included | Included | Included + cross-entity governance |

## 5.4 Reporting and insights

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Standard workforce dashboards | hr.reporting.standard | Included | Included | Included |
| Standard HR reports | hr.reporting.templates | Included | Included | Included |
| Permissioned CSV/XLSX export | hr.reporting.export | Standard | Expanded | Expanded / contract controls |
| Custom report builder | hr.reporting.builder | Not included | Included | Included |
| Custom dashboards / saved views | hr.reporting.dashboards_custom | Not included | Included | Included |
| Scheduled / shared reports | hr.reporting.scheduled | Not included | Included | Included |
| Cross-entity analysis | hr.reporting.cross_entity | Not included | Included | Included |
| Governed metric registry / custom metrics | hr.reporting.metric_governance | Definitions visible | Advanced tenant metrics | Enterprise governance / approval |
| Advanced export policy / secure sharing | hr.reporting.governed_sharing | Standard controls | Advanced | Contract / enterprise policy |

## 5.5 Governed AI assistance

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Product navigation / help AI | hr.ai.navigation | Included under fair-use policy | Included | Included |
| Policy / document Q&A | hr.ai.policy_qa | Standard governed sources | Expanded governed sources | Enterprise source governance |
| Authorized workforce-data Q&A | hr.ai.workforce_query | Not included | Included | Included |
| Summarization / drafting assistance | hr.ai.draft_summary | Limited to non-sensitive/admin-safe contexts | Included subject to role/policy | Included + enterprise policy |
| Workflow navigation / administrative assistance | hr.ai.workflow_assist | Not included | Included | Included |
| Customer-facing AI governance controls | hr.ai.governance_admin | Basic enable/disable | Advanced source/policy controls | Enterprise governance, evaluation and audit controls |
| Custom approved knowledge sources | hr.ai.custom_sources | Not included | Selected sources | Contract / enterprise sources |
| Autonomous consequential employment decisions | hr.ai.autonomous_decision | Prohibited | Prohibited | Prohibited |

## 5.6 Integrations, API and identity

| Feature | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| CSV import/export | hr.integration.file_exchange | Included | Included | Included |
| Standard Zoiko connector framework | hr.integration.zoiko_connector | Connector capability; external Zoiko product subscription still required | Included; external subscription required | Included |
| Standard third-party integrations | hr.integration.standard | Catalog-selected / limited | Expanded catalog | Expanded catalog |
| API read access | hr.api.read | Not included | Included / catalog limits | Higher or contracted limits |
| API write access | hr.api.write | Not included | Included where approved | Included / contract policy |
| Webhooks | hr.api.webhooks | Not included | Included | Included |
| SAML/OIDC enterprise SSO | hr.identity.sso | Not included | Included | Included |
| SCIM lifecycle provisioning | hr.identity.scim | Not included | Not included | Contract |
| Multiple IdPs / advanced identity routing | hr.identity.multi_idp | Not included | Not included | Contract |
| IP allowlisting / advanced access conditions | hr.identity.conditional_access | Not included | Selected controls where platform-wide | Contract / enterprise |
| Customer sandbox / configuration promotion | hr.enterprise.sandbox | Not included | Not included | Contract |
| Custom integration engineering | hr.integration.custom | Separate service | Separate service | Contract / SOW |

## 5.7 Support, implementation and enterprise services

| Feature / service | Entitlement key | Core | Advanced | Enterprise |
|---|---|---|---|---|
| Standard support | hr.support.standard | Included | Included | Included |
| Priority support routing | hr.support.priority | Not included | Included | Included |
| Named Customer Success / service governance | hr.support.named_success | Not included | Not included | Contract |
| Contractual support SLA | hr.support.sla | Not included | Not included | Contract |
| Implementation / configuration service | hr.service.implementation | Separate service | Separate service | Order Form / SOW |
| Data migration service | hr.service.migration | Separate service | Separate service | Order Form / SOW |
| Premium integration service | hr.service.integration | Separate service | Separate service | Order Form / SOW |
| Negotiated retention / residency options | hr.enterprise.data_options | Not included | Catalog policy only | Contract, only where production capability exists |

# 6. Platform Safeguards That Must Not Be Paywalled

| Safeguard | Coverage | Rule |
|---|---|---|
| Tenant isolation | All plans | Server-enforced tenant boundary. |
| Encryption and secure transport | All plans | Use verified production controls; do not market unverified specifics. |
| MFA availability / privileged MFA policy | All plans | MFA is baseline; Enterprise may add advanced identity orchestration, not basic account safety. |
| Role-based authorization | All plans | Commercial entitlement is an additional check, not a replacement for RBAC. |
| Audit evidence for material changes | All plans | Retention period may be policy/catalog controlled, but material actions remain auditable. |
| Privacy / data subject workflows | All plans | Required rights and legal processes remain available even during delinquency/closure states. |
| Billing remediation and invoice access | All plans | Never block a customer from fixing payment because the subscription is restricted. |
| Accessible product interaction | All plans | Accessibility is a platform requirement, not a premium feature. |
| Security incident controls / kill switches | All plans | Platform operator control independent of package. |

# 7. Free Trial / Evaluation Architecture

> **RECOMMENDED LAUNCH MODEL**
>
> **Keep the no-signup Product Tour as the default public research route. Add an optional 14-day Advanced Evaluation for qualified self-serve/product-led evaluation. No payment card is required and no evaluation auto-converts to a paid subscription.**

| Control | Launch rule | Engineering rationale |
|---|---|---|
| Evaluation plan | EVALUATION_ADVANCED_14D | Represents a controlled evaluation profile, not a paid SKU. |
| Duration | 14 calendar days | Starts when the evaluation workspace is activated, not when the user first lands on the website. |
| Payment method | Not required | Prevents accidental billing and supports trust. |
| Auto-conversion | Prohibited | Paid activation requires explicit plan choice, billing acceptance and commercial conversion. |
| Default data | Synthetic/sample organization | Safest evaluation path and fastest time to value. |
| Real employee data | Permitted only after required terms/privacy/DPA controls and explicit admin action | If real data is used, production-grade security and closure/retention rules apply. |
| External production integrations | Disabled by default | Avoid side effects, outbound HR events and accidental dependency creation during evaluation. |
| API/webhooks | Sandbox/read-only evaluation where supported | No production write credentials by default. |
| AI | Advanced evaluation with policy limits | Only approved sources and permitted sample/tenant data; no consequential decisions. |
| One trial rule | One standard trial per organization / commercial identity | Extension requires authorized Customer Success/Commercial approval and audit reason. |
| Expiry | Ends automatically; no charge | Workspace enters EVALUATION_EXPIRED with conversion/export/closure routes. |

## 7.1 Trial entitlement profile

| Capability | Evaluation state | Reason |
|---|---|---|
| Core HR / self-service | Enabled with sample data | Demonstrate foundation. |
| Multi-entity | Enabled for sample entities | Demonstrate Advanced value. |
| Custom workflows | Enabled | Demonstrate automation. |
| Performance | Enabled | Demonstrate Advanced differentiation. |
| Custom reporting | Enabled | Demonstrate Advanced differentiation. |
| SSO | Test configuration only where supported | Do not make trial success depend on production identity cutover. |
| API / webhooks | Sandbox or read-only / no production side effects | Protect customer systems. |
| Zoiko Payroll / ZoikoTime connectors | Demo/sandbox only unless separately approved | No implied cross-product subscription. |
| Bulk export | Allowed only within evaluation policy | Prevent uncontrolled extraction while preserving reasonable evaluation. |
| Enterprise-only controls | Not generally enabled | Enterprise evaluation should be guided and contract-scoped. |

## 7.2 Enterprise guided pilot

Enterprise prospects may receive a guided pilot with contract-defined duration and scope. A 30-day target may be used operationally, but the authoritative duration, data scope, security conditions and conversion terms must come from the approved pilot record or Order Form. Enterprise pilots never auto-convert and never silently become recurring invoices.

# 8. Trial Conversion to Paid Subscription

Conversion is an explicit commercial transaction. It must atomically replace evaluation entitlements with a paid entitlement snapshot only after required approvals and billing confirmation are satisfied.

1. Customer selects Core or Advanced, billing interval and the intended active billable-workforce scope. Enterprise routes to sales-assisted Order Form.
2. System resolves the exact immutable price/catalog version available to that customer, region, currency and channel.
3. Conversion preflight checks organization owner authority, billing identity, tax inputs, terms acceptance, payment method or Order Form, workforce quantity basis and selected-plan compatibility.
4. If converting from the Advanced Evaluation to Core, the downgrade-impact engine identifies Advanced-only configuration such as multiple legal entities, custom workflows, performance cycles, SSO/API and advanced reports.
5. Customer explicitly confirms "Activate Paid Plan." The confirmation payload contains catalog_version_id, plan_id, quantity basis, interval, amount/currency display, effective date and accepted terms version.
6. Billing provider subscription/invoice is created through an idempotent provider adapter. Client-side success is not enough.
7. After authoritative provider/Finance success, the subscription becomes COMMERCIAL_ACTIVE and the entitlement service generates a new effective entitlement snapshot.
8. The evaluation record is closed as CONVERTED. Trial and paid entitlements may never remain independently active at the same time.
9. If payment/provider confirmation fails or is uncertain, commercial activation remains pending and the system reconciles before retrying. Never grant paid capability merely because checkout displayed success.

## 8.1 Conversion communication minimums

- Evaluation started; 7 days remaining; 2 days remaining; evaluation expired.
- Paid plan selected; payment/Order Form action required; conversion confirmed.
- If Core chosen after Advanced Evaluation: clear list of features that will become unavailable and remediation required.
- No email may imply that a card will be charged automatically when the evaluation is designed as non-auto-converting.

# 9. Subscription and Commercial State Model

| State | Meaning | Entitlement behavior |
|---|---|---|
| EVALUATION_ACTIVE | Free evaluation within approved dates. | Evaluation entitlement profile only; no live recurring billing. |
| EVALUATION_GRACE | Optional short grace approved by policy. | Read/limited configuration; conversion routes visible. |
| EVALUATION_EXPIRED | Evaluation ended. | No new Advanced evaluation actions; preserve conversion/export/closure routes. |
| CONVERSION_PENDING | Paid conversion requested; provider/Finance outcome not final. | Do not grant paid entitlements until authoritative success. |
| COMMERCIAL_ACTIVE | Paid subscription in good standing. | Plan entitlement snapshot active. |
| PLAN_CHANGE_SCHEDULED | Downgrade/interval change accepted for future effective date. | Current plan remains active until effective transition. |
| PAST_DUE | Payment overdue, pre-restriction. | Preserve service per billing standard; show remediation. |
| RESTRICTED | Controlled service restriction. | Preserve required read, billing, privacy, export and legal routes. |
| CANCEL_AT_PERIOD_END | Cancellation scheduled. | Plan remains active until paid term ends unless contract says otherwise. |
| CANCELLED_RETENTION | Paid term ended; closure/retention window active. | No new paid operations; export/reactivation per policy. |
| CLOSED | Closure completed. | Only legally/operationally required retained evidence remains. |

# 10. Upgrade Policy

> **COMMERCIAL RULE**
>
> **Upgrade should feel immediate and positive, but never bypass payment, authorization or dependency checks.**

| Transition | Channel | Effective timing | Engineering behavior |
|---|---|---|---|
| Core → Advanced | Self-service for Organization Owner / Billing Admin where approved. | Immediate after successful charge/authorization; prorate according to billing catalog. | Generate new entitlement snapshot atomically; show newly available modules. |
| Core/Advanced → Enterprise | Sales-assisted / Order Form. | Contract effective date. | Enterprise entitlements activate only from approved contract/catalog record. |
| Add approved add-on/service | Self-service or assisted depending SKU. | Immediate or scheduled per SKU. | No hidden fees; customer sees recurring/non-recurring effect before confirmation. |
| Billing interval monthly → annual | Self-service if catalog permits. | Catalog-defined; typically immediate or renewal. | Never infer annual savings; show exact approved amount. |

## 10.1 Upgrade invariants

- Only Organization Owner or Billing Admin with current authorization may confirm a paid change.
- Provider events are deduplicated by durable event/idempotency keys.
- New entitlements are generated from a catalog version; they are never hand-added as ad hoc booleans unless represented as an approved exception entitlement with expiry and audit evidence.
- If payment succeeds but entitlement activation fails, reconciliation must complete the activation without creating a duplicate charge.
- If entitlement activation occurs but provider confirmation later resolves as failed, reconciliation must remove or restrict the unearned commercial expansion in a controlled manner.

# 11. Downgrade Policy

> **SAFETY DOCTRINE**
>
> **A downgrade is a controlled migration, not a destructive switch. It must preserve data, access continuity and explain exactly what will change before the customer confirms.**

Default: Core/Advanced downgrades take effect at the end of the current paid period. No automatic mid-period cash refund is created unless the applicable contract/catalog expressly provides one. Enterprise downgrades are assisted because contract, identity, support and integration obligations may need coordinated transition.

| Downgrade impact | Required preflight / transition | Data / safety rule |
|---|---|---|
| Multiple legal entities → Core | Block completion until one active legal entity is designated for continued Core operation and remaining entities are archived/migrated under a controlled plan. | Never delete entity/workforce history silently. |
| Custom workflows → Core | Identify active/in-flight workflows. Require completion, cancellation or mapped standard replacement before effective date. | Do not strand tasks or approvals. |
| Performance cycles → Core | Require active cycles to be closed/exported or explicitly ended before downgrade. | No silent loss of performance records; historic outcomes remain retained/read-only per policy. |
| SSO → Core | Require at least one verified local Organization Owner login with MFA before SSO entitlement is removed. | Prevents tenant lockout. |
| API/webhooks → Core | Warn, revoke/disable tokens at effective date and preserve integration logs according to retention. | Prevent unauthorized continuing access. |
| Advanced reports → Core | Preserve definitions/history as read-only/archive where practical; disable scheduling/new runs that require Advanced. | No silent deletion. |
| Advanced AI → Core | Stop new workforce-query/advanced AI operations; retain governed audit records as required. | No hidden continuing AI usage. |
| Priority support → Core | Change support routing at effective date. | No impact to open critical incident obligations already accepted. |

## 11.1 Downgrade impact status

| Status | Meaning |
|---|---|
| READY | No blocking incompatibility; downgrade may be scheduled. |
| ACTION_REQUIRED | Customer can resolve blockers through guided remediation. |
| ASSISTED_REQUIRED | Customer Success/Support must coordinate the transition. |
| CONTRACT_BLOCKED | Current contract/commitment does not permit requested effective date. |
| SECURITY_BLOCKED | Transition would create unsafe access/authentication state. |
| DEPENDENCY_BLOCKED | Active integration/workflow dependency must be resolved first. |

# 12. Billable Workforce and Plan Entitlements Are Separate Concerns

| Component | Responsibility | Non-responsibility |
|---|---|---|
| Billable-workforce service | Computes authoritative effective-dated billable worker quantity. | Feeds billing quantity / true-up. Does not decide whether Performance or API is enabled. |
| Entitlement service | Resolves plan, add-ons, exceptions, policy and effective date into feature rights. | Determines whether commercial capability may be used. Does not count workers. |
| Authorization service | Evaluates user role, tenant scope, field sensitivity and action permission. | A tenant can own a feature but a particular user may still be forbidden from using it. |
| Runtime policy / feature safety | Applies jurisdiction, security, incident, implementation and dependency gates. | Can temporarily or permanently block a commercially entitled feature. |

## 12.1 Canonical entitlement equation

> **AUTHORIZATION FORMULA**
>
> **ALLOW = commercial_entitlement AND user_authorized AND tenant_scope_valid AND runtime_policy_allows AND dependency_ready. Any false result denies execution. The client may display reason codes but cannot override the decision.**

# 13. Canonical Technical Architecture

| Component | Build responsibility |
|---|---|
| Commercial Catalog Service | Immutable catalog versions, plans, SKUs, intervals, currencies, price-provider IDs, feature mappings, limits, add-ons and effective dates. |
| Subscription Service | Customer subscription, interval, commercial status, renewal, cancellation, plan changes and contract references. |
| Entitlement Service | Compiles effective tenant entitlements into a server-authoritative snapshot; provides feature checks and reason codes. |
| Trial / Evaluation Service | Creates, expires and converts evaluation workspaces; enforces one-trial and restricted capability rules. |
| Plan Change Orchestrator | Runs upgrade/downgrade preflight, payment/contract checks, scheduling, effective-date transition and recovery. |
| Workforce Meter | Computes active billable workforce independently from identity/login counts. |
| Billing Provider Adapter | Stripe/other provider boundary; idempotent create/change/cancel operations; signed webhook processing; reconciliation. |
| Commercial Audit / Event Ledger | Append-only evidence for catalog publication, trial activation, conversions, plan changes, entitlement changes and operator overrides. |
| Customer Billing UI | Displays current plan, renewal, workforce quantity, invoices, trial/plan-change state and safe upgrade/downgrade journeys. |
| Zoiko Super Admin Commercial Console | Exception-first operator view for catalog, subscriptions, entitlement mismatches, trials, payment/reconciliation and controlled overrides. |

## 13.1 Request-path enforcement

1. Browser requests an action, e.g., create performance cycle.
2. Backend authenticates the actor and resolves tenant context.
3. Authorization policy validates role, scope and action permission.
4. Entitlement service evaluates `hr.performance.cycles` against the effective tenant snapshot.
5. Runtime policy checks implementation state, jurisdiction/security flags and dependency availability.
6. If allowed, domain service executes the action and writes audit evidence. If denied, return a typed reason such as PLAN_REQUIRED, ROLE_DENIED, CONFIG_REQUIRED or POLICY_BLOCKED.
7. Frontend renders the server outcome. It must never convert a disabled UI control into authorization.

## 13.2 Caching

Entitlement snapshots may be cached for performance, but the cache must be versioned and invalidated on subscription, catalog, add-on, exception, trial, payment restriction or policy events. Consequential commercial changes should use short-lived caches or direct authoritative reads. A stale cache must fail closed where it could grant a capability that is no longer entitled.

# 14. Minimum Engineering Data Model

| Entity | Minimum fields | Invariant |
|---|---|---|
| commercial_catalog_version | id, version, status, effective_from/to, approved_by, published_at, checksum | Immutable after live use. |
| commercial_plan | id, catalog_version_id, code, display_name, rank, sales_channel, billing_metric | CORE / ADVANCED / ENTERPRISE. |
| commercial_sku | id, catalog_version_id, code, type, interval, currency, amount, tax_code, provider_product_id, provider_price_id | Amount may be null until approved; live use forbidden when required value absent. |
| feature_definition | key, domain, description, sensitivity, enforcement_mode, status | Stable semantic feature key. |
| plan_feature_entitlement | plan_id, feature_key, mode, limit_ref, configuration, effective dates | Plan → feature mapping. |
| tenant_subscription | tenant_id, plan_id, sku_id, status, service_start, period_start/end, provider refs, contract_ref | One canonical active commercial record per product scope. |
| tenant_entitlement_snapshot | tenant_id, catalog_version_id, subscription_version, generated_at, checksum, entitlements JSON/ref | Server-authoritative compiled state. |
| trial_evaluation | tenant_id, evaluation_type, start/end, status, sponsor, extension_reason, converted_subscription_id | Non-billable evaluation lifecycle. |
| plan_change_request | id, tenant_id, from_plan, to_plan, requested_by, requested_at, effective_at, impact_status, status | Durable change state. |
| downgrade_impact_item | plan_change_id, feature_key, resource_type/id, severity, remediation, resolved_at | Concrete blockers/warnings. |
| billable_workforce_snapshot | tenant_id, as_of, quantity, rule_version, source_checksum | Billing quantity truth. |
| commercial_exception_entitlement | tenant_id, feature_key, mode, reason, approved_by, starts_at, expires_at | Time-bound controlled exception; never indefinite hidden override. |
| billing_event_inbox | provider, event_id, received_at, signature_status, processing_status | Deduplicate external provider events. |
| commercial_audit_event | event_id, tenant_id, actor, action, before_ref, after_ref, catalog_version, correlation_id, occurred_at | Append-only material commercial evidence. |

## 14.1 Entitlement modes

| Mode | Meaning |
|---|---|
| ENABLED | Feature may be used subject to authorization/policy. |
| DISABLED_PLAN | Plan does not include feature. |
| READ_ONLY | Historic/configured data may be viewed but no new mutation is permitted. |
| CONFIG_REQUIRED | Commercially entitled but implementation/configuration is incomplete. |
| DEPENDENCY_REQUIRED | Requires a separately subscribed/available product or integration. |
| POLICY_BLOCKED | Tenant, jurisdiction, privacy, security or AI policy blocks use. |
| RESTRICTED_BILLING | Payment state restricts new use under billing policy. |
| INCIDENT_DISABLED | Platform operator has temporarily disabled capability for safety/reliability. |
| LIMIT_REACHED | Approved visible quota/cap reached; no hidden overage. |

# 15. Entitlement Evaluation Contract

Recommended service contract:

```
check_entitlement(tenant_id, actor_id, feature_key, action, resource_context) -> decision

decision = {
    allowed: boolean,
    mode: ENABLED | READ_ONLY | DISABLED_PLAN | CONFIG_REQUIRED | ...,
    reason_code: string,
    required_plan: CORE | ADVANCED | ENTERPRISE | null,
    catalog_version_id: string,
    entitlement_snapshot_version: string,
    retryable: boolean,
    correlation_id: string
}
```

## 15.1 Mandatory reason codes

- PLAN_REQUIRED
- ROLE_DENIED
- TENANT_SCOPE_DENIED
- TRIAL_RESTRICTED
- SUBSCRIPTION_INACTIVE
- PAYMENT_RESTRICTED
- CONFIG_REQUIRED
- DEPENDENCY_REQUIRED
- POLICY_BLOCKED
- JURISDICTION_BLOCKED
- LIMIT_REACHED
- INCIDENT_DISABLED
- DOWNGRADE_PENDING_READ_ONLY

# 16. Minimum Commercial API Surface

| Endpoint | Purpose | Critical rule |
|---|---|---|
| GET /commercial/v1/plans | Return customer-visible eligible plans from approved catalog. | Never return unpublished price/catalog records. |
| GET /commercial/v1/subscription | Current plan, interval, renewal, commercial state, billable quantity summary and pending changes. | Tenant-scoped; finance fields restricted to authorized roles. |
| GET /commercial/v1/entitlements | Current compiled entitlement summary. | May expose client-safe modes/reasons; internal policy detail remains protected. |
| POST /commercial/v1/trials | Create approved evaluation. | Enforce one-trial policy, rate limits and commercial identity checks. |
| POST /commercial/v1/trials/{id}/convert | Begin explicit paid conversion. | Idempotent; requires accepted catalog/terms/payment or Order Form. |
| POST /commercial/v1/plan-changes/preview | Generate upgrade/downgrade price and impact preview. | No mutation. |
| POST /commercial/v1/plan-changes | Create confirmed plan change. | Idempotency key + authorization + accepted preview version. |
| DELETE /commercial/v1/plan-changes/{id} | Cancel scheduled change where policy permits. | Audit event required. |
| POST /commercial/v1/cancel | Schedule cancellation. | Show effective date and closure/export implications. |
| POST /commercial/v1/reactivate | Reactivate where eligible. | Revalidate plan/catalog/payment state. |
| GET /commercial/v1/downgrade-impact | Return blockers/warnings/remediation. | Resource identifiers scoped and privacy-safe. |
| POST /internal/commercial/reconcile | Internal reconciliation job/control. | Privileged, audited, not customer exposed. |

## 16.1 Idempotency and concurrency

- All mutating billing/plan endpoints require an idempotency key and correlation ID.
- Plan changes use optimistic concurrency or equivalent version checks so a stale preview cannot overwrite a newer subscription state.
- Provider webhook processing is idempotent by provider event ID. Duplicate delivery must not duplicate entitlement transitions.
- An "unknown commit" outcome triggers reconciliation; clients must not blindly retry a charge-creating operation.

# 17. Frontend Entitlement UX

Frontend gating is explanatory and ergonomic; backend gating is authoritative.

| UI state | Treatment | Rule |
|---|---|---|
| Entitled & ready | Normal navigation/action. | No sales interruption. |
| Entitled but setup required | Show setup state and route to configuration. | Do not advertise an upgrade when plan already includes the feature. |
| Higher plan required | Feature visible with concise value statement and "Compare Plans" / "Upgrade" for authorized billing roles. | Employees/managers should not see billing controls they cannot use. |
| Trial restricted | Explain that production side-effect is unavailable in evaluation. | Offer demo/sandbox path where relevant. |
| Downgrade scheduled | Show effective date and read-only/feature-removal warning. | Provide cancel-downgrade option to authorized billing roles. |
| Payment restricted | Show remediation to Owner/Billing Admin; preserve necessary HR read/export/privacy paths. | Do not present a misleading plan upgrade CTA. |
| Policy blocked | Explain that organization policy/security setting prevents use. | Do not imply a higher plan will bypass policy. |

## 17.1 Navigation rules

- Do not entirely hide every higher-tier feature from administrators; discoverability supports upgrade conversion. Use locked/preview states selectively.
- For employee and manager roles, avoid cluttering the experience with commercial upsell. Show only relevant unavailable states.
- When a feature is removed by downgrade, retain discoverable archive/read-only routes where customer data still exists.
- Never place plan names into domain authorization code on the client. Client asks for entitlement key state.

# 18. Customer / Tenant Commercial Experience

| Screen / module | Required content |
|---|---|
| Overview | Current plan, billing interval, renewal date, commercial status, active billable workforce summary, pending plan change, payment attention if any. |
| Plan & features | Plan comparison based on current eligible catalog; current features highlighted; recommended Advanced label allowed. |
| Usage & limits | Only approved visible quotas/capacity. No hidden overages. |
| Invoices & payment | Provider/Finance-backed invoice list, receipts, payment method and billing contact. |
| Upgrade | Immediate preview with exact commercial effect and entitlement additions. |
| Downgrade | Impact report first; schedule at renewal after blockers resolved. |
| Cancellation | Effective date, data/export/closure explanation, confirmation and reactivation route. |
| Trial conversion | Days remaining, Core vs Advanced comparison, explicit paid activation. |

## 18.1 Upgrade CTA hierarchy

Use "Upgrade Plan" as the primary authenticated commercial action for eligible self-serve customers. Use "Compare Plans" as the research action. Enterprise should use "Contact Sales" or the approved commercial CTA only when the transition requires an Order Form. Do not show competing upgrade buttons throughout ordinary HR workflows.

# 19. Super Admin Commercial Control Plane

| Module | Required visibility | Allowed operator action |
|---|---|---|
| Catalog & Plans | Catalog versions, plan-feature mappings, SKU status, provider IDs, publication approval, effective dates. | Publish new version; never mutate live historic version. |
| Subscriptions | Tenant, plan, quantity, billing state, renewal, provider/contract refs, pending change. | Investigate / reconcile / assisted change under RBAC. |
| Trials & Pilots | Active, expiring, expired, converted, extended; sponsor and reason. | Extend only with authorized reason/expiry. |
| Entitlement Integrity | Mismatch between subscription/catalog and compiled snapshot; stale caches; unauthorized exception entitlements. | Regenerate/reconcile; do not manually toggle feature without governed exception record. |
| Plan Changes | Upgrade/downgrade pipeline, blockers, failed transitions, scheduled effective dates. | Retry safe step / cancel / assisted remediation. |
| Commercial Exceptions | Time-bound feature exceptions, reason, approver, expiry. | Dual approval for high-risk/chargeable exceptions as policy requires. |
| Reconciliation | Provider event failures, subscription drift, invoice/subscription mismatch, quantity discrepancies. | Case-owned remediation with audit. |
| Audit | Catalog publication, plan change, trial conversion, overrides, operator actions. | Append-only searchable evidence. |

## 19.1 Operator override prohibition

> **CONTROL**
>
> **A support agent must never gain the power to "just turn on" a paid feature by editing a tenant row. Any exception must be a typed entitlement exception with reason, approver, effective/expiry dates and audit evidence, and it must not create a charge unless an approved commercial process does so.**

# 20. Canonical Commercial Events

| Event | Canonical behavior |
|---|---|
| CATALOG_PUBLISHED | New immutable catalog version becomes eligible for use. |
| TRIAL_STARTED | Evaluation entitlement profile activated. |
| TRIAL_EXTENDED | Authorized extension with reason and new expiry. |
| TRIAL_EXPIRED | Evaluation ended; non-conversion state applied. |
| COMMERCIAL_CONVERSION_REQUESTED | Customer explicitly requested paid activation. |
| COMMERCIAL_CONVERSION_CONFIRMED | Paid subscription and entitlement snapshot activated. |
| PLAN_UPGRADE_REQUESTED | Upgrade preview accepted. |
| PLAN_UPGRADE_APPLIED | New plan entitlements effective. |
| PLAN_DOWNGRADE_REQUESTED | Downgrade impact generated and request created. |
| PLAN_DOWNGRADE_SCHEDULED | Future downgrade locked for effective date. |
| PLAN_DOWNGRADE_BLOCKED | Blocking incompatibility detected. |
| PLAN_DOWNGRADE_APPLIED | Target plan snapshot active; removed capabilities transitioned safely. |
| ENTITLEMENT_SNAPSHOT_REBUILT | Snapshot regenerated from authoritative state. |
| ENTITLEMENT_MISMATCH_DETECTED | Runtime/catalog/subscription mismatch opened for reconciliation. |
| COMMERCIAL_EXCEPTION_GRANTED | Time-bound exception entitlement approved. |
| COMMERCIAL_EXCEPTION_EXPIRED | Exception automatically removed. |
| PAYMENT_RESTRICTION_APPLIED | Billing state changed permitted entitlement behavior. |
| PAYMENT_RECOVERED | Normal entitlement state restored if no other block exists. |
| CANCELLATION_SCHEDULED | Cancel-at-period-end set. |
| SUBSCRIPTION_REACTIVATED | Cancellation/closure reversed within permitted window. |

## 20.1 Audit requirements

- Every event includes event_id, tenant_id, actor/service identity, correlation_id, catalog_version_id, subscription_version, before/after reference and timestamp.
- Customer-visible plan changes preserve the exact preview/terms version the customer accepted.
- Admin overrides preserve reason, approver and expiry. No indefinite undocumented exception.
- Commercial event logs must not embed unnecessary employee-level HR data.

# 21. Failure Modes and Recovery

| Failure | Required recovery |
|---|---|
| Provider charged; entitlement activation failed | Queue reconciliation; do not charge again. Rebuild snapshot from confirmed provider/subscription state. |
| Entitlement activated; provider payment later failed | Move to controlled pending/restricted state; reconcile and communicate. Never silently retain unearned expansion indefinitely. |
| Webhook duplicated | Deduplicate by provider event ID; no duplicate state transition. |
| Webhook delayed/out of order | Version/timestamp checks; apply only valid transition and reconcile against provider source. |
| Downgrade scheduler failed | Current entitlement remains until transition is deterministically resolved; alert operator. Do not partially remove features. |
| Catalog version unavailable/corrupt | Fail closed for new commercial actions; existing immutable subscription version continues if verifiable. |
| Entitlement cache stale | Invalidate via event; protected actions may require authoritative check. |
| Trial expiry job failed | Secondary reconciliation detects overdue active evaluations and applies expiry without billing. |
| User loses SSO before downgrade | Security blocker prevents downgrade until verified local owner access exists. |
| Unknown provider commit | Mark UNKNOWN_COMMIT; reconcile before retrying any charge-creating request. |

# 22. Security, Privacy and Abuse Controls

- Server-side enforcement on every protected route/service action; frontend state is non-authoritative.
- Least-privilege billing roles: only Organization Owner and Billing Admin may make plan/payment changes by default.
- CSRF/session protections for browser changes; re-authentication or step-up for high-risk commercial actions where appropriate.
- No payment card data stored directly if payment provider tokenization can avoid it.
- No employee sensitive data placed into billing analytics, plan-change telemetry or provider metadata.
- Rate-limit trial creation, conversion and plan-change endpoints to prevent abuse or repeated billing attempts.
- Commercial exceptions expire automatically and are included in periodic access/control reviews.
- Data retained after downgrade/cancellation remains protected by original tenant authorization and retention policy.

# 23. QA and Certification Matrix

| ID | Acceptance criterion | Priority |
|---|---|---|
| ENT-ACC-01 | Core cannot execute an Advanced-only protected backend action even if the browser request is forged. | P0 |
| ENT-ACC-02 | Advanced can use every capability allocated to it when role/configuration permit. | P0 |
| ENT-ACC-03 | Enterprise contract entitlements activate only from approved catalog/Order Form state. | P0 |
| ENT-ACC-04 | 14-day evaluation ends without charge and without paid entitlement activation. | P0 |
| ENT-ACC-05 | Trial conversion requires explicit confirmation and authoritative billing/Finance success. | P0 |
| ENT-ACC-06 | Core → Advanced upgrade is idempotent and does not double charge on retry/webhook duplication. | P0 |
| ENT-ACC-07 | Advanced → Core downgrade cannot silently delete multi-entity, performance, workflow, report or integration data. | P0 |
| ENT-ACC-08 | Downgrade that would remove the only authentication path is blocked. | P0 |
| ENT-ACC-09 | Subscription state and entitlement snapshot reconcile after provider event delay/out-of-order delivery. | P0 |
| ENT-ACC-10 | Frontend feature lock cannot be bypassed to gain server capability. | P0 |
| ENT-ACC-11 | Billing restriction preserves required billing remediation, privacy, legal and export routes. | P0 |
| ENT-ACC-12 | Employee/manager roles do not gain plan-change authority. | P0 |
| ENT-ACC-13 | Zoiko Payroll/ZoikoTime connector cannot be used as proof of an external product subscription. | P0 |
| ENT-ACC-14 | Catalog version referenced by a live subscription is immutable. | P0 |
| ENT-ACC-15 | Commercial exception entitlement requires approver, reason and expiry and is audit-searchable. | P1 |
| ENT-ACC-16 | Trial creation one-per-organization policy is enforced with approved extension path. | P1 |
| ENT-ACC-17 | Entitlement cache invalidates after plan/payment/exception change. | P0 |
| ENT-ACC-18 | No sensitive employee fields appear in provider metadata, plan analytics or commercial emails. | P0 |

## 23.1 Required test suites

- Unit tests for entitlement resolution, catalog precedence and state transitions.
- Contract tests between Subscription, Entitlement, Billing Provider Adapter and HR domain services.
- Negative authorization tests for forged feature calls and cross-tenant commercial access.
- Provider webhook replay/out-of-order/duplicate tests in test mode.
- Time-travel tests for trial expiry, period-end downgrade, renewal, exception expiry and cancellation.
- Downgrade fixture tests containing multi-entity data, in-flight workflows, active performance cycles, SSO-only tenants, API integrations and scheduled reports.
- Reconciliation drills for provider success/internal failure and internal success/provider failure states.
- Accessibility and responsive tests for plan comparison, impact review and billing settings.

# 24. P0 Commercial Launch Gates

| Gate | Mandatory condition |
|---|---|
| 1 | Approve numeric Core and Advanced monthly/annual price book, currencies and approved billing intervals. |
| 2 | Publish catalog version 1 with provider Product/Price IDs and tax configuration. |
| 3 | Approve this Core/Advanced/Enterprise entitlement matrix and generate production feature keys. |
| 4 | Implement server-authoritative Entitlement Service and eliminate plan checks based only on frontend constants. |
| 5 | Implement authoritative billable-workforce service per ZHR-COM-BILL-001. |
| 6 | Implement 14-day Advanced Evaluation or explicitly defer public trial while preserving the controlled evaluation model. |
| 7 | Implement explicit non-auto-converting trial-to-paid conversion. |
| 8 | Implement plan-change preview, downgrade impact engine and period-end scheduler. |
| 9 | Implement billing provider idempotency, signed webhooks, event inbox and reconciliation. |
| 10 | Implement Customer Billing & Plan UX for Owner/Billing Admin. |
| 11 | Implement Super Admin entitlement integrity, trial and plan-change operations. |
| 12 | Complete P0 QA matrix and security review using synthetic tenants/data. |
| 13 | Reconcile website pricing/features and Sales collateral against catalog version 1 before publication. |
| 14 | Founder/Executive commercial go-live approval after Product, CTO/Engineering, QA, Finance/Billing, Security/Privacy, Legal/Tax and Customer Operations sign-off. |

# 25. Commercial Governance and Change Control

| Owner | Responsibility |
|---|---|
| Product / Commercial | Own package strategy, entitlement allocation and customer proposition. |
| Finance / Billing | Validate pricing economics, billing behavior, refunds, invoice mapping and provider configuration. |
| Engineering / Architecture | Implement catalog, entitlement, lifecycle and integration contracts; validate feasibility and backward compatibility. |
| Security / Privacy | Review identity, cross-tenant, commercial exception, data minimization and downgrade risks. |
| Legal / Tax | Review terms, trial language, contract transitions, tax configuration and regulated claims. |
| Sales / Marketing | Use only approved package names, features, price claims and trial language from current catalog. |
| Customer Success / Implementation | Own assisted transitions, migration readiness and customer remediation for blockers. |
| QA | Certify plan isolation, trial conversion, upgrade/downgrade, provider reconciliation and data preservation. |
| Founder / Executive | Final approval of live catalog and material package/price changes. |

## 25.1 Catalog change rules

- Never edit a price or entitlement mapping that is already referenced by a live invoice/subscription as if history changed. Publish a new catalog version.
- Every feature move between plans requires an effective date and a grandfathering/migration decision for existing customers.
- Existing customers may be grandfathered, migrated at renewal, or contract-migrated; the rule must be explicit and machine-readable.
- Website changes cannot precede catalog approval when they imply entitlement or price changes.
- New add-ons require clear inclusion, price, dependency, billing behavior, downgrade behavior and customer communication before launch.

# 26. Final Commercial Plan Summary for Sales, Website and Product

| Plan | Sales position | Headline inclusion | Upgrade trigger |
|---|---|---|---|
| **Core** | HR foundations you can trust. | Employee records; single-entity organization management; onboarding/offboarding; leave; documents/policies; employee/manager self-service; standard workflows; standard reporting; baseline governed AI help; core security/audit. | Upgrade when the customer needs multi-entity/global administration, custom automation, performance, advanced analytics, SSO/API or workforce-data AI. |
| **Advanced - Recommended** | Run more complex HR operations with greater automation and insight. | Everything in Core plus multi-entity/global HR; position management; advanced leave; custom workflows/approvals; performance; custom reporting/dashboards; scheduled sharing; SSO; API/webhooks; advanced integrations; governed workforce-data AI; priority support. | Upgrade to Enterprise when contractual identity, SCIM, sandbox, custom integration, advanced governance, dedicated service commitments or complex implementation are required. |
| **Enterprise** | Enterprise HR governance, integration and service assurance. | Everything in Advanced plus contract-defined advanced identity/provisioning; enterprise governance; sandbox/promotion; custom integrations; named service governance; SLA; complex migration/implementation; negotiated data options where available. | Custom commercial route / Order Form. |

# 27. Source Basis and Market References

Internal Zoiko HR sources reconciled for this specification:

- ZHR-COM-BILL-001 - Zoiko HR Commercial Billing & Subscription Operating Standard v1.0 (August 7, 2026).
- ZHR-SA-CMD-003 - Zoiko HR Super Admin Command Center Commercial Standard v3.0 (August 20, 2026).
- ZHR-WF-WEB-PLATFORM-001 - Zoiko HR Platform Overview Detailed Web Wireframe Specification (August 14, 2026).
- ZHR-WF-WEB-COREHR-002 - Zoiko HR Core HR Detailed Web Wireframe Specification (August 14, 2026).
- Zoiko HR detailed platform wireframes for Organization Management, Onboarding & Lifecycle, Reporting & Insights and Governed AI Assistance.
- Zoiko HR Homepage Wireframe & Conversion Specification v3.0 and global navigation specifications.

External market calibration used only for packaging/trial benchmarking (official vendor sources accessed August 27, 2026):

- BambooHR - Plans and Pricing (Core / Pro / Elite; per-employee pricing and feature comparison).
- Personio - Pricing and Free Trial pages (Core / Core Pro; 14-day trial without automatic paid conversion).
- HiBob - Pricing Plans (Core plus selectable modules; pricing by organization size/needs).
- Deel - HR and Pricing pages (Core and higher-level HR capability packaging).

# 28. Final CTO / Commercial Doctrine

> **COMMERCIAL LAUNCH STANDARD**
>
> **Zoiko HR must sell capability deliberately and enforce it deterministically. Core must be genuinely useful, Advanced must earn the upgrade through operational depth, and Enterprise must monetize contract-grade complexity. Trials must never surprise customers with charges; upgrades must not create duplicate billing; downgrades must not destroy or strand HR data; and no client-side switch may ever become the authority for paid access.**

## Final implementation rules

- One launch taxonomy: Core / Advanced / Enterprise.
- One immutable versioned price-and-entitlement catalog.
- One server-authoritative entitlement snapshot per tenant/product scope.
- One explicit, non-auto-converting evaluation-to-paid path.
- Immediate safe upgrades; period-end safe downgrades with impact analysis.
- No hidden overages; no accidental cross-product bundling; no arbitrary security paywall.
- No production launch until numeric pricing, provider configuration, feature keys and P0 acceptance gates are approved.

# Appendix A. Feature-Key Registry - Engineering Handoff

| Feature key | Meaning | Governance |
|---|---|---|
| hr.admin.delegation | Delegated administration | Stable semantic key; marketing labels may change. |
| hr.ai.autonomous_decision | Autonomous consequential employment decisions | Stable semantic key; marketing labels may change. |
| hr.ai.custom_sources | Custom approved knowledge sources | Stable semantic key; marketing labels may change. |
| hr.ai.draft_summary | Summarization / drafting assistance | Stable semantic key; marketing labels may change. |
| hr.ai.governance_admin | Customer-facing AI governance controls | Stable semantic key; marketing labels may change. |
| hr.ai.navigation | Product navigation / help AI | Stable semantic key; marketing labels may change. |
| hr.ai.policy_qa | Policy / document Q&A | Stable semantic key; marketing labels may change. |
| hr.ai.workflow_assist | Workflow navigation / administrative assistance | Stable semantic key; marketing labels may change. |
| hr.ai.workforce_query | Authorized workforce-data Q&A | Stable semantic key; marketing labels may change. |
| hr.api.read | API read access | Stable semantic key; marketing labels may change. |
| hr.api.webhooks | Webhooks | Stable semantic key; marketing labels may change. |
| hr.api.write | API write access | Stable semantic key; marketing labels may change. |
| hr.documents.bulk | Bulk document distribution / targeting | Stable semantic key; marketing labels may change. |
| hr.documents.core | Documents & employee files | Stable semantic key; marketing labels may change. |
| hr.documents.policies | Policies & acknowledgments | Stable semantic key; marketing labels may change. |
| hr.documents.workflow | Advanced document workflows / e-sign orchestration | Stable semantic key; marketing labels may change. |
| hr.enterprise.data_options | Negotiated retention / residency options | Stable semantic key; marketing labels may change. |
| hr.enterprise.sandbox | Customer sandbox / configuration promotion | Stable semantic key; marketing labels may change. |
| hr.identity.conditional_access | IP allowlisting / advanced access conditions | Stable semantic key; marketing labels may change. |
| hr.identity.multi_idp | Multiple IdPs / advanced identity routing | Stable semantic key; marketing labels may change. |
| hr.identity.scim | SCIM lifecycle provisioning | Stable semantic key; marketing labels may change. |
| hr.identity.sso | SAML/OIDC enterprise SSO | Stable semantic key; marketing labels may change. |
| hr.integration.custom | Custom integration engineering | Stable semantic key; marketing labels may change. |
| hr.integration.file_exchange | CSV import/export | Stable semantic key; marketing labels may change. |
| hr.integration.standard | Standard third-party integrations | Stable semantic key; marketing labels may change. |
| hr.integration.zoiko_connector | Standard Zoiko connector framework | Stable semantic key; marketing labels may change. |
| hr.leave.advanced | Complex accrual, carryover & policy groups | Stable semantic key; marketing labels may change. |
| hr.leave.core | Leave requests & balances | Stable semantic key; marketing labels may change. |
| hr.leave.global | Multi-country leave configurations | Stable semantic key; marketing labels may change. |
| hr.leave.policies | Leave calendars / standard policy rules | Stable semantic key; marketing labels may change. |
| hr.lifecycle.automation | Lifecycle automation / conditional tasking | Stable semantic key; marketing labels may change. |
| hr.lifecycle.offboarding | Separation / offboarding plans | Stable semantic key; marketing labels may change. |
| hr.lifecycle.onboarding | Onboarding plans | Stable semantic key; marketing labels may change. |
| hr.lifecycle.tasks | Lifecycle task ownership & reminders | Stable semantic key; marketing labels may change. |
| hr.mobile.companion | Employee / manager mobile access | Stable semantic key; marketing labels may change. |
| hr.org.directory | Employee directory & org chart | Stable semantic key; marketing labels may change. |
| hr.org.jobs | Jobs / job catalog | Stable semantic key; marketing labels may change. |
| hr.org.legal_entities | Legal entity administration | Stable semantic key; marketing labels may change. |
| hr.org.positions | Position management | Stable semantic key; marketing labels may change. |
| hr.org.structure | Locations, departments, teams | Stable semantic key; marketing labels may change. |
| hr.performance.cycles | Performance review cycles | Stable semantic key; marketing labels may change. |
| hr.performance.goals | Goals / structured performance inputs | Stable semantic key; marketing labels may change. |
| hr.performance.one_to_one | 1:1 process support | Stable semantic key; marketing labels may change. |
| hr.performance.reporting | Performance reporting | Stable semantic key; marketing labels may change. |
| hr.records | Employee records & profiles | Stable semantic key; marketing labels may change. |
| hr.records.custom_fields | Custom HR fields | Stable semantic key; marketing labels may change. |
| hr.records.effective_changes | Effective-dated workforce changes | Stable semantic key; marketing labels may change. |
| hr.records.history | Record history / audit trail | Stable semantic key; marketing labels may change. |
| hr.reporting.builder | Custom report builder | Stable semantic key; marketing labels may change. |
| hr.reporting.cross_entity | Cross-entity analysis | Stable semantic key; marketing labels may change. |
| hr.reporting.dashboards_custom | Custom dashboards / saved views | Stable semantic key; marketing labels may change. |
| hr.reporting.export | Permissioned CSV/XLSX export | Stable semantic key; marketing labels may change. |
| hr.reporting.governed_sharing | Advanced export policy / secure sharing | Stable semantic key; marketing labels may change. |
| hr.reporting.metric_governance | Governed metric registry / custom metrics | Stable semantic key; marketing labels may change. |
| hr.reporting.scheduled | Scheduled / shared reports | Stable semantic key; marketing labels may change. |
| hr.reporting.standard | Standard workforce dashboards | Stable semantic key; marketing labels may change. |
| hr.reporting.templates | Standard HR reports | Stable semantic key; marketing labels may change. |
| hr.self_service.employee | Employee self-service | Stable semantic key; marketing labels may change. |
| hr.self_service.manager | Manager self-service | Stable semantic key; marketing labels may change. |
| hr.service.implementation | Implementation / configuration service | Stable semantic key; marketing labels may change. |
| hr.service.integration | Premium integration service | Stable semantic key; marketing labels may change. |
| hr.service.migration | Data migration service | Stable semantic key; marketing labels may change. |
| hr.support.named_success | Named Customer Success / service governance | Stable semantic key; marketing labels may change. |
| hr.support.priority | Priority support routing | Stable semantic key; marketing labels may change. |
| hr.support.sla | Contractual support SLA | Stable semantic key; marketing labels may change. |
| hr.support.standard | Standard support | Stable semantic key; marketing labels may change. |
| hr.workflow.builder | Custom no-code workflow builder | Stable semantic key; marketing labels may change. |
| hr.workflow.bulk_actions | Bulk operational actions | Stable semantic key; marketing labels may change. |
| hr.workflow.conditional | Conditional / multi-step approvals | Stable semantic key; marketing labels may change. |
| hr.workflow.dual_control | Maker-checker / dual-control patterns | Stable semantic key; marketing labels may change. |
| hr.workflow.standard | Standard HR workflows & approvals | Stable semantic key; marketing labels may change. |

# Appendix B. Downgrade Preflight Checklist

| Area | Pass condition |
|---|---|
| Identity | At least one local MFA-capable Organization Owner remains if SSO/SCIM will be removed. |
| Legal entities | Target plan can represent active entity structure or an approved archive/migration plan exists. |
| Workflows | No in-flight workflow will be orphaned by target plan. |
| Performance | Active cycles are closed/exported/ended according to policy. |
| Reports | Scheduled/custom reports have clear read-only/archive/disable behavior. |
| Integrations | API tokens, webhooks, connectors and service accounts have a revoke/downscope plan. |
| AI | Advanced AI sources/operations have a target-plan state and audit retention rule. |
| Documents | No document is deleted merely because a premium workflow becomes unavailable. |
| Support/SLA | Open contractual obligations are reconciled before Enterprise transition. |
| Billing | Effective date, proration/refund rule and renewal state match catalog/contract. |
| Customer notice | Impact summary delivered before confirmation; final reminder before effective date. |
| Audit | Preview, confirmation, remediation and applied transition are linked by correlation ID. |