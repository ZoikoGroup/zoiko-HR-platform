"""
scripts/seed_public_assistant.py
------------------------------------
One-off setup for the public zoikohr.com assistant:
1. Registers one organization to own the public content, via the real
   /auth/register flow (register_enterprise) — not a bare insert — so it
   inherits whatever side effects that flow performs (department, billing
   evaluation record, audit log) and is fully valid if a human ever needs to
   log in and edit content later.
2. Seeds knowledge sources with is_public=True, drawn verbatim from
   zoikohr.com's own real marketing copy (not invented content), via the
   same create_source()/publish_source() pipeline the admin UI uses.

The admin email below is a deliberate, non-deliverable placeholder
(example.com is IANA-reserved for exactly this — it will never reach a real
inbox even if the registration-confirmation email attempt fires). Replace it
with a real address later via the normal account-settings/password-reset
flow once you're ready to actually log in and manage this content.

NOTE: registering an organization also emails every existing Super Admin a
"new organization created" notification (see employee/service.py
register_enterprise) — on this database that is exactly one account,
ravurirugvedh@gmail.com, which is the platform's own existing test/dev
super-admin. Running this script sends that one real, informational email.

Run once: `python scripts/seed_public_assistant.py`
Safe to re-run — skips organization creation if one named ORG_NAME already
exists, and skips any knowledge source title that already exists for it.

After running, add the printed HR_PUBLIC_ORG_ID line to your .env.
"""

import datetime
import sys

sys.path.insert(0, ".")

from app.database import SessionLocal
from app.modules.assistant import knowledge_service
from app.modules.assistant.models import KnowledgeSource
from app.modules.hr.models import Organization

ORG_NAME = "Zoiko HR — Public Site"
ADMIN_EMAIL = "public-site-admin@example.com"  # IANA-reserved, non-deliverable placeholder
ADMIN_PASSWORD = "ReplaceMe123!Public"  # placeholder — reset via forgot-password before real use
ADMIN_NAME = "Public Content Admin"

DISCLOSURE = (
    "[PUBLIC SITE CONTENT — sourced verbatim from zoikohr.com's own marketing copy, for the "
    "unauthenticated zoikohr.com assistant only. Visible to anonymous site visitors.]\n\n"
)

DOCUMENTS = [
    {
        "title": "What is Zoiko HR?",
        "source_type": "faq",
        "content": DISCLOSURE + """WHAT IS ZOIKO HR?

Zoiko HR is a global HR management platform for organizing employee and organizational
information, coordinating onboarding and workforce changes, routing approvals, supporting
authorized employee and manager access, and connecting people operations.

Specific capabilities depend on the approved plan, contract, configuration, integration, and
jurisdiction.

Zoiko HR is built for structured, secure, global people operations, centered on five pillars:
- Global operating structure
- Role-based access
- Lifecycle auditability
- Employee self-service
- Connected ecosystem

Tagline: "Run global HR, not fragmented spreadsheets." One governed platform for employee
records, onboarding, leave, documents, approvals and performance — configured for every entity,
location and jurisdiction you operate in.

Zoiko HR organizes its capabilities into three pillars:
1. Structured information — consistent employee, position, organization, document, and
   lifecycle records.
2. Controlled operations — roles, permissions, approvals, effective dates, ownership, evidence,
   and auditability.
3. Connected experiences — employee, manager, HR, reporting, integration, implementation, and
   support pathways.
""",
    },
    {
        "title": "What is Core HR?",
        "source_type": "faq",
        "content": DISCLOSURE + """WHAT IS CORE HR?

Zoiko HR Core HR is the employee and organizational data foundation for structuring workforce
records, employment relationships, positions, teams, entities, locations, documents,
permissions, and effective-dated changes. It supports authorized employee, manager, HR,
reporting, and integration experiences.

Exact capabilities depend on approved product scope, plan, contract, configuration, and
jurisdiction.

Core HR is organized around three capabilities:
1. Structure — defined objects, fields, relationships, ownership, source, and validation for
   every workforce record.
2. Control — roles, organization scope, field sensitivity, approvals, effective dates, and full
   audit trails.
3. Connect — self-service, workflows, reporting, integrations, implementation pathways, and
   ongoing support.
""",
    },
    {
        "title": "What is Onboarding & Lifecycle management?",
        "source_type": "faq",
        "content": DISCLOSURE + """ONBOARDING & LIFECYCLE MANAGEMENT

Zoiko HR Onboarding & Lifecycle coordinates employee events from preboarding and onboarding
through changes, transfers, leave, return, separation, and post-employment record handling —
organized as event plans with tasks, owners, dependencies, documents, communications,
approvals, and evidence.

Exact capability and availability require approved product and contractual confirmation.

Key traits of how it works:
- Event-based: every journey has a defined subject, type, purpose, scope, owner and effective
  date.
- Participant-aware: employees, managers, HR, IT, specialists and reviewers see only relevant
  work and context.
- Effective-dated: current and proposed record states remain distinct until approved
  activation.
- Auditable: changes, decisions, communications, documents, handoffs and closure remain
  attributable.
""",
    },
    {
        "title": "What does the Zoiko HR platform cover?",
        "source_type": "faq",
        "content": DISCLOSURE + """PLATFORM SCOPE — SEVEN APPROVED DESTINATIONS

Zoiko HR is one governed platform covering seven approved product areas:
1. Platform Overview — category, operating model, capabilities, trust, implementation, and
   evaluation pathways.
2. Core HR — structured employee, position, organization, document, and lifecycle records.
3. Global HR Management — multi-entity, multi-location, and jurisdictional workforce
   administration.
4. Employee Records — structured employee and employment information, history, and documents.
5. Onboarding & Lifecycle — onboarding, changes, transitions, and separation administration.
6. Workflows & Approvals — roles, permissions, approvals, effective dates, ownership, and
   auditability.
7. Integrations — approved connectors, identity, payroll, and developer documentation.

The existence of a public product page does not confirm commercial inclusion or availability in
a package. Entitlement states — Included, Limited, Optional, Sales-assisted, Contract-dependent,
Unavailable — are only defined through approved commercial content, so ask your Zoiko contact or
request a demo to confirm what's included for your organization.
""",
    },
    {
        "title": "How do Zoiko HR integrations work?",
        "source_type": "faq",
        "content": DISCLOSURE + """ZOIKO HR INTEGRATIONS

Integrations connect Zoiko HR to other systems (such as identity and payroll providers) under a
governed set of principles:
1. Purpose — define business need, approved use, and accountable owner.
2. Authority — identify which system may create, propose, update, approve, or consume each
   field.
3. Minimum scope — request only required data, events, permissions, and actions.
4. Reliability — test, monitor, retry, reconcile, suspend, and recover safely.
5. Evidence — preserve configuration, mappings, operations, errors, decisions, and changes.
6. Qualification — publish providers and capabilities only after current validation.

See the Integrations page for the current catalogue of approved connectors and developer
documentation.
""",
    },
    {
        "title": "Who is Zoiko HR built for?",
        "source_type": "faq",
        "content": DISCLOSURE + """WHO ZOIKO HR SERVES

Zoiko HR is built for organizations that need HR to scale with the business — designed for:
- Growing businesses: creating a structured HR foundation before spreadsheets, inboxes, and
  local files become operational liabilities.
- Mid-market organizations: standardizing workforce records and processes as headcount, teams,
  managers, policies, and systems become more complex.
- Global organizations: maintaining common global structures while configuring approved local
  fields, policies, calendars, documents, permissions, and workflows.
- Multi-entity enterprises: administering distinct legal entities, business units, teams, access
  boundaries, and reporting requirements within one governed environment.

Zoiko HR provides role-appropriate experiences for HR teams, leaders, managers, employees, and
authorized technical users.
""",
    },
    {
        "title": "How is Zoiko HR priced, and how do I request a demo?",
        "source_type": "faq",
        "content": DISCLOSURE + """PRICING AND REQUESTING A DEMO

Zoiko HR pricing is published only from approved commercial content — there is no generic public
price list. The commercial evaluation may consider the selected product scope, employee and user
populations, entities and locations, integrations, implementation, support, contract, currency,
tax, and jurisdiction. Current package names, prices, entitlements, and availability are provided
only after validation with a Zoiko contact.

To get pricing or see the product, request a demo ("Book a Demo") or use the pricing request
form on the site — a specific, validated answer requires that conversation rather than a public
number, since scope varies by organization.
""",
    },
]


def get_or_create_public_org(db):
    existing = db.query(Organization).filter(Organization.organization_name == ORG_NAME).first()
    if existing:
        print(f"Organization already exists: id={existing.id}, name={existing.organization_name!r}")
        return existing.id, None

    from app.modules.employee import service as employee_service
    from app.modules.employee.schema import RegisterRequest

    payload = RegisterRequest(
        name=ADMIN_NAME,
        email=ADMIN_EMAIL,
        password=ADMIN_PASSWORD,
        organization=ORG_NAME,
        plan_code="core",
    )
    result = employee_service.register_enterprise(db, payload)
    org_id = result["organization_id"]
    print(f"Registered new organization: id={org_id}, name={ORG_NAME!r}, admin={ADMIN_EMAIL}")
    return org_id, ADMIN_EMAIL


def seed_public_content(db, organization_id):
    existing_titles = {
        s.title for s in db.query(KnowledgeSource).filter(KnowledgeSource.organization_id == organization_id).all()
    }
    created, skipped = 0, 0
    for doc in DOCUMENTS:
        if doc["title"] in existing_titles:
            print(f"SKIP (already exists): {doc['title']}")
            skipped += 1
            continue
        source = knowledge_service.create_source(
            db, organization_id, owner_employee_id=None,
            title=doc["title"], source_type=doc["source_type"], authority_tier="B",
            content_text=doc["content"],
            jurisdiction_code=None, worker_type=None, audience_role=None,
            effective_from=datetime.date.today(), effective_to=None,
            is_public=True,
        )
        knowledge_service.publish_source(db, organization_id, source.id, published_by=None)
        print(f"CREATED + PUBLISHED (public): {doc['title']} (source id {source.id})")
        created += 1
    print(f"\nDone. Created {created}, skipped {skipped} (already existed).")


def main():
    db = SessionLocal()
    try:
        org_id, admin_email = get_or_create_public_org(db)
        seed_public_content(db, org_id)
        print(f"\nAdd this to your .env: HR_PUBLIC_ORG_ID={org_id}")
        if admin_email:
            print(f"Placeholder admin login for later content edits: {admin_email} (password set in this script)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
