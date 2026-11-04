"""Fixtures for the document template engine suite (ZHR-ELT-TPL-001).

Two synthetic tenants (TA, TB) with every role, real signed tokens, an in-memory database, a temporary document store, captured
e-mails, and helpers that stand up jurisdiction packs, clauses and ACTIVE variants directly (the content lifecycle itself is
tested through the API in test_variants.py). No real people, e-mails or numbers appear anywhere.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.modules.employee.models import UserRole
from app.modules.hr.models import Organization, OrganizationStatus
from tests.privacy.support import _emp, token_for

CANARY_CLAUSE = "CANARY-CLAUSE-TEXT-7731"
CANARY_NAME = "Canaryworker"


class World:
    def __init__(self, db, app):
        self.db, self.app = db, app
        self.client = TestClient(app, raise_server_exceptions=False)
        self.u = {}
        self.mail = []

    def _h(self, who):
        return token_for(self.u[who]) if who else {}

    def get(self, who, url, **kw):
        return self.client.get(url, headers=self._h(who), **kw)

    def post(self, who, url, **kw):
        return self.client.post(url, headers=self._h(who), **kw)

    def put(self, who, url, **kw):
        return self.client.put(url, headers=self._h(who), **kw)

    def codes(self, template):
        """Six-digit codes sent in captured sign-code e-mails, newest last."""
        return [c["code"] for (to, t, c) in self.mail if t == template and "code" in c]


@pytest.fixture(autouse=True)
def _no_rate_limit():
    from app.core.rate_limiter import limiter
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def world(monkeypatch, tmp_path):
    from app.main import app
    from app.modules.doc_templates import bootstrap, storage
    from app.modules.doc_templates.models import EmployerEntity
    from app.services import email_service

    monkeypatch.setattr("app.modules.billing.service.evaluation_access_block_reason", lambda db, org_id: None)
    from app.modules.billing import entitlement_middleware as _em
    monkeypatch.setattr(_em, "check_entitlement", lambda db, org_id, key: {"state": _em.ENTITLED_AVAILABLE, "mode": "test", "allowed": True})
    # The middleware looks subscriptions up through its own session on the app engine, not this test database.
    monkeypatch.setattr(_em.EntitlementMiddleware, "_has_subscription", lambda self, db, org_id: False)
    storage.set_store(storage.LocalDocumentStore(str(tmp_path / "docs")))

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    db.add_all([
        Organization(id=1, name="TENANT-A", organization_name="Tenant A Ltd", organization_code="TA", status=OrganizationStatus.ACTIVE,
                     country="United Kingdom", currency="GBP"),
        Organization(id=2, name="TENANT-B", organization_name="Tenant B Ltd", organization_code="TB", status=OrganizationStatus.ACTIVE,
                     country="United Kingdom", currency="GBP"),
    ])
    db.commit()
    bootstrap.seed(db)
    w = World(db, app)
    E = lambda email, role, org, first, last, **kw: _emp(db, email, role, org, first, last, **kw)  # noqa: E731
    w.u = {
        "platform": E("ops@zoiko-ops.example.com", UserRole.SUPER_ADMIN, None, "Platform", "Operator"),
        "a_admin": E("admin1@tenant-a.example.com", UserRole.ADMIN, 1, "Avery", "Admin"),
        "a_admin2": E("admin2@tenant-a.example.com", UserRole.ADMIN, 1, "Blake", "Admin"),
        "a_hr": E("hr@tenant-a.example.com", UserRole.HR_ADMIN, 1, "Harper", "People"),
        "a_hr2": E("hr2@tenant-a.example.com", UserRole.HR_ADMIN, 1, "Hollis", "People"),
        "a_manager": E("manager@tenant-a.example.com", UserRole.MANAGER, 1, "Morgan", "Lead"),
        "a_signer": E("director@tenant-a.example.com", UserRole.EMPLOYEE, 1, "Dana", "Director"),
        "a_emp": E("worker@tenant-a.example.com", UserRole.EMPLOYEE, 1, CANARY_NAME, "Example"),
        "a_emp2": E("worker2@tenant-a.example.com", UserRole.EMPLOYEE, 1, "Quinn", "Other"),
        "b_admin": E("admin@tenant-b.example.com", UserRole.ADMIN, 2, "Bailey", "Admin"),
        "b_hr": E("hr@tenant-b.example.com", UserRole.HR_ADMIN, 2, "Briar", "People"),
        "b_emp": E("worker@tenant-b.example.com", UserRole.EMPLOYEE, 2, "Rowan", "Bee"),
    }
    for key in ("a_emp", "a_emp2", "a_signer", "a_manager", "b_emp"):
        u = w.u[key]
        u.work_country, u.work_region, u.work_city, u.date_of_joining = "GB", None, "Leeds", date(2026, 11, 2)
    w.u["a_emp"].reporting_manager_id = w.u["a_manager"].id
    for org_id in (1, 2):
        db.add(EmployerEntity(organization_id=org_id, legal_name=f"Tenant {'A' if org_id == 1 else 'B'} Employer Ltd", country="GB",
                              city="Leeds", postal_code="LS1 1AA", address_lines=["1 Sample Street"], registration_type="company_number",
                              registration_number="01234567", is_default=True, status="active"))
    db.commit()
    for key in ("a_emp", "a_emp2", "a_signer", "a_manager"):
        w.u[key].employing_entity_id = 1
    w.u["b_emp"].employing_entity_id = 2
    db.commit()

    def capture(email, template_name, context, db=None, organization_id=None, **_):
        w.mail.append((email, template_name, dict(context)))
        return True
    monkeypatch.setattr(email_service, "send_approval_email", capture)

    app.dependency_overrides[get_db] = lambda: db
    yield w
    app.dependency_overrides.pop(get_db, None)
    storage.set_store(None)
    db.close()
    engine.dispose()


# ── content helpers ──────────────────────────────────────────────────────────────────────────────────────────────────

BASIC_CONTENT = [
    {"type": "letterhead", "locked": True, "id": "lh"},
    {"type": "heading", "text": "Commencement confirmation for {{worker.full_name}}"},
    {"type": "paragraph", "text": "Dear {{worker.first_name}}, your employment as {{employment.position_title}} starts on {{employment.start_date}}."},
    {"type": "clause", "key": "notice_and_termination"},
    {"type": "paragraph", "text": "Contact {{employer.hr_contact_name}} with any questions."},
    {"type": "declaration", "text": "I confirm I have received and read this document.", "mode": "acknowledge", "locked": True, "id": "ack"},
]
BASIC_FIELDS = {"required": ["worker.full_name", "worker.first_name", "employment.position_title", "employment.start_date"],
                "optional": ["employer.hr_contact_name"]}
BASIC_RULES = {"mandatory": ["notice_and_termination"], "optional": [], "prohibited": ["post_termination_restrictions"]}
AGREEMENT_CONTENT = BASIC_CONTENT[:4] + [{"type": "signature_block", "parties": ["employer", "employee"], "locked": True, "id": "sig"}]


def implement(db, canonical_id, **overrides):
    from app.modules.doc_templates.models import TemplateDefinition
    d = db.get(TemplateDefinition, canonical_id)
    d.implemented = True
    for k, v in overrides.items():
        setattr(d, k, v)
    db.commit()
    return d


def make_pack(db, country="GB", region=None, *, owner=None, status="ACTIVE", effective_from=None, effective_to=None, retention=None):
    from app.modules.doc_templates.models import JurisdictionPack
    p = JurisdictionPack(scope_type="TENANT" if owner else "PLATFORM", owner_organization_id=owner, country=country, region=region,
                         status=status, effective_from=effective_from, effective_to=effective_to, retention_rules=retention or {},
                         created_at=datetime.utcnow(), signed_off_by_name="Test Counsel" if not owner else None)
    db.add(p)
    db.commit()
    return p


def make_clause(db, pack, key="notice_and_termination", text=None, *, owner=None, status="ACTIVE", version=1):
    from app.modules.doc_templates import blocks
    from app.modules.doc_templates.models import TemplateClause
    text = text or f"Either party may end the employment with written notice. {CANARY_CLAUSE} applies to {{{{worker.first_name}}}}."
    c = TemplateClause(clause_key=key, pack_id=pack.id, owner_organization_id=owner, language="en", version=version, status=status,
                       text=text, checksum=blocks.checksum(key, text, "en"))
    db.add(c)
    db.commit()
    return c


def make_variant(db, canonical_id, pack, *, content=None, field_contract=None, clause_rules=None, owner=None, status="ACTIVE",
                 version=1, options=None, applicability=None, effective_from=None, effective_to=None, language="en"):
    from app.modules.doc_templates import blocks
    from app.modules.doc_templates.models import TemplateVariant
    v = TemplateVariant(canonical_id=canonical_id, pack_id=pack.id, owner_organization_id=owner, language=language, version=version,
                        status=status, release_mode="TENANT_ATTESTED" if owner else "PLATFORM_COUNSEL",
                        content=content or BASIC_CONTENT, field_contract=field_contract or BASIC_FIELDS,
                        clause_rules=clause_rules or BASIC_RULES, options=options or {}, applicability=applicability,
                        effective_from=effective_from, effective_to=effective_to)
    v.checksum = blocks.checksum(v.content, v.field_contract, v.clause_rules, v.applicability, v.options, v.language)
    db.add(v)
    db.commit()
    return v


def ready(db, canonical_id="HR-ONB-007", *, content=None, field_contract=None, clause_rules=None, options=None, **definition):
    """An implemented template with an ACTIVE platform GB pack, its mandatory clause and an ACTIVE variant."""
    implement(db, canonical_id, **definition)
    pack = make_pack(db, "GB")
    make_clause(db, pack)
    v = make_variant(db, canonical_id, pack, content=content, field_contract=field_contract, clause_rules=clause_rules, options=options)
    return pack, v


def gen(w, who="a_hr", canonical_id="HR-ONB-007", subject="a_emp", **extra):
    body = {"canonical_id": canonical_id, "subject_type": "employee", "subject_id": w.u[subject].id, **extra}
    return w.post(who, "/hr/generated-documents/generate", json=body)
