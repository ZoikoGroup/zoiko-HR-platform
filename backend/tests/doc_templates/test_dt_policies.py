"""Prompt 3 policies: publication, new joiners, acknowledgement evidence, re-acknowledgement on material change only, the employee
policy hub, and the Mira sync (current published version only, audience-restricted, placeholder documents retired)."""
from datetime import date

from app.modules.assistant import retrieval_service
from app.modules.assistant.models import KnowledgeFragment, KnowledgeSource, KnowledgeSourceVersion, KnowledgeStatus
from app.modules.doc_templates import hooks, preflight
from app.modules.doc_templates.models import DocumentAcknowledgement, PolicyDistribution
from tests.doc_templates.conftest import CANARY_NAME
from tests.doc_templates.p3_support import activate, docs, fake_embeddings, new_version, policy_settings, publish, text_of

POL = "HR-POL-002"


def _setup(world, monkeypatch, cid=POL):
    fake_embeddings(monkeypatch)
    policy_settings(world)
    return activate(world.db, cid)


def _people(world, *keys):
    return {"type": "employees", "ids": [world.u[k].id for k in keys]}


def test_publish_assigns_the_audience_and_records_the_acknowledged_version(world, monkeypatch):
    v = _setup(world, monkeypatch)
    out = publish(world, POL, _people(world, "a_emp", "a_emp2"))
    assert out["published"] and out["ready"] == 2
    mine = docs(world.db, POL, subject_id=world.u["a_emp"].id)
    assert len(mine) == 1 and mine[0].status == "ISSUED" and mine[0].variant_checksum == v.checksum
    t = text_of(mine[0])
    assert "Code of Conduct" in t and "Policy owner" in t and "Head of People" in t
    assert "does not form part of your contract of employment" in t and "You will not be treated unfairly" in t
    assert not docs(world.db, POL, subject_id=world.u["a_manager"].id), "outside the audience"
    r = world.post("a_emp", f"/hr/me/generated-documents/{mine[0].id}/acknowledge", json={"text_version": "ACK-1.0"})
    assert r.status_code == 200, r.text
    ack = world.db.query(DocumentAcknowledgement).filter_by(document_id=mine[0].id).one()
    assert ack.document_sha256 and ack.document_sha256 == mine[0].pdf_sha256


def test_policy_fields_fail_closed_until_the_organization_sets_them(world, monkeypatch):
    fake_embeddings(monkeypatch)
    activate(world.db, "HR-POL-004")
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id="HR-POL-004", subject_type="employee",
                                subject_id=world.u["a_emp"].id)
    assert {"MISSING_FIELD:policy.owner_name", "MISSING_FIELD:policy.contact"} <= set(r.reasons)
    policy_settings(world)
    r = preflight.run_preflight(world.db, organization_id=1, actor=world.u["a_hr"], canonical_id="HR-POL-004", subject_type="employee",
                                subject_id=world.u["a_emp"].id)
    assert r.reasons == ["MISSING_FIELD:policy.absence_notification_rule"], "never an invented notification rule"


def test_new_joiners_in_the_audience_receive_the_current_version(world, monkeypatch):
    _setup(world, monkeypatch)
    from app.modules.doc_templates import jobs
    from app.modules.hr.models import Department
    from tests.privacy.support import _emp
    from app.modules.employee.models import UserRole
    dept = Department(name="Ops", code="OPSP3", organization_id=1)
    world.db.add(dept)
    world.db.commit()
    world.u["a_emp"].department_id = dept.id
    world.db.commit()
    publish(world, POL, {"type": "departments", "ids": [dept.id]})
    joiner = _emp(world.db, "joiner@tenant-a.example.com", UserRole.EMPLOYEE, 1, "Jo", "Iner", department_id=dept.id, work_country="GB",
                  employing_entity_id=1)
    assert jobs.include_new_joiners(world.db) == 1
    assert docs(world.db, POL, subject_id=joiner.id)[0].status == "ISSUED"


def test_material_change_needs_reacknowledgement_and_a_minor_change_does_not(world, monkeypatch):
    v1 = _setup(world, monkeypatch)
    publish(world, POL, _people(world, "a_emp"))
    first = docs(world.db, POL, subject_id=world.u["a_emp"].id)[0]
    world.post("a_emp", f"/hr/me/generated-documents/{first.id}/acknowledge", json={"text_version": "ACK-1.0"})

    v2 = new_version(world.db, v1)
    hooks.send(world.db, "variant_released", world.u["a_admin"], v2, v1)
    draft = world.db.query(PolicyDistribution).filter_by(canonical_id=POL, status="DRAFT").one()
    assert draft.previous_distribution_id is not None and draft.audience == _people(world, "a_emp")
    assert len(docs(world.db, POL, subject_id=world.u["a_emp"].id)) == 1, "nothing is sent until HR publishes the new version"
    world.post("a_hr", f"/hr/policy-distributions/{draft.id}/publish", json={"confirm_partial": False})
    mine = docs(world.db, POL, subject_id=world.u["a_emp"].id)
    assert len(mine) == 2 and mine[-1].variant_version == 2 and mine[-1].status == "ISSUED"
    assert world.db.get(PolicyDistribution, draft.previous_distribution_id).status == "CLOSED"
    hub = {p["canonical_id"]: p for p in world.get("a_emp", "/hr/me/policies").json()["items"]}[POL]
    assert hub["version"] == 2 and hub["action_required"] and hub["what_changed"] and hub["acknowledged_version"] == 1
    assert hub["change_summary"] == "Clarified the conflicts of interest section." and len(hub["history"]) == 2
    assert "What changed in this version" in text_of(mine[-1])

    v3 = new_version(world.db, v2, minor=True, summary="Typo fixed.")
    hooks.send(world.db, "variant_released", world.u["a_admin"], v3, v2)
    assert len(docs(world.db, POL, subject_id=world.u["a_emp"].id)) == 2, "a minor change sends nothing"
    current = world.db.query(PolicyDistribution).filter_by(canonical_id=POL, status="PUBLISHED").one()
    assert current.version == 3 and current.kb_sync_status == "SYNCED"
    hub = {p["canonical_id"]: p for p in world.get("a_emp", "/hr/me/policies").json()["items"]}[POL]
    assert hub["version"] == 3 and hub["minor_change"]


def test_mira_answers_only_from_the_current_version_for_the_audience(world, monkeypatch):
    v1 = _setup(world, monkeypatch)
    db = world.db
    legacy = KnowledgeSource(organization_id=1, title="Employee Handbook & Code of Conduct", source_type="handbook", authority_tier="C",
                             status=KnowledgeStatus.PUBLISHED)
    db.add(legacy)
    db.flush()
    db.add(KnowledgeSourceVersion(knowledge_source_id=legacy.id, version_no=1, content_text="placeholder", content_hash="0" * 64))
    db.commit()
    publish(world, POL, _people(world, "a_emp"))
    src = db.query(KnowledgeSource).filter_by(policy_canonical_id=POL, status=KnowledgeStatus.PUBLISHED).one()
    assert src.title == "Code of Conduct (version 1)" and src.authority_tier == "A" and src.policy_version == 1
    text = " ".join(f.text for f in db.query(KnowledgeFragment).join(KnowledgeSourceVersion).filter(
        KnowledgeSourceVersion.knowledge_source_id == src.id))
    assert "Never offer or accept bribes" in text and "Version: 1" in text and CANARY_NAME not in text
    db.refresh(legacy)
    assert legacy.status == KnowledgeStatus.RETIRED, "the placeholder the policy replaces is retired"
    v1_versions = {v.id for v in src.versions}
    assert v1_versions <= set(retrieval_service.eligible_version_ids(db, 1, employee=world.u["a_emp"]))
    assert not v1_versions & set(retrieval_service.eligible_version_ids(db, 1, employee=world.u["a_emp2"])), "outside the audience"
    assert not v1_versions & set(retrieval_service.eligible_version_ids(db, 1)), "no employee, no audience-restricted policy"

    v2 = new_version(db, v1)
    hooks.send(db, "variant_released", world.u["a_admin"], v2, v1)
    draft = db.query(PolicyDistribution).filter_by(canonical_id=POL, status="DRAFT").one()
    world.post("a_hr", f"/hr/policy-distributions/{draft.id}/publish", json={"confirm_partial": False})
    db.refresh(src)
    assert src.status == KnowledgeStatus.RETIRED
    live = db.query(KnowledgeSource).filter_by(policy_canonical_id=POL, status=KnowledgeStatus.PUBLISHED).all()
    assert [s.title for s in live] == ["Code of Conduct (version 2)"]
    eligible = set(retrieval_service.eligible_version_ids(db, 1, employee=world.u["a_emp"]))
    assert not v1_versions & eligible and {v.id for v in live[0].versions} <= eligible


def test_a_failed_knowledge_ingest_still_retires_the_old_version(world, monkeypatch):
    v1 = _setup(world, monkeypatch)
    publish(world, POL, _people(world, "a_emp"))
    from app.modules.assistant import embeddings

    def broken(texts):
        raise RuntimeError("model unavailable")
    monkeypatch.setattr(embeddings, "embed_batch", broken)
    v2 = new_version(world.db, v1)
    hooks.send(world.db, "variant_released", world.u["a_admin"], v2, v1)
    draft = world.db.query(PolicyDistribution).filter_by(canonical_id=POL, status="DRAFT").one()
    world.post("a_hr", f"/hr/policy-distributions/{draft.id}/publish", json={"confirm_partial": False})
    world.db.refresh(draft)
    assert draft.kb_sync_status == "FAILED"
    assert world.db.query(KnowledgeSource).filter_by(policy_canonical_id=POL, status=KnowledgeStatus.PUBLISHED).count() == 0


def test_library_preview_and_super_admin_has_no_access(world, monkeypatch):
    _setup(world, monkeypatch)
    items = {p["canonical_id"]: p for p in world.get("a_hr", "/hr/policies").json()["items"]}
    assert len(items) == 14 and items[POL]["active_versions"][0]["version"] == 1 and items[POL]["owner_name"] == "Head of People"
    pv = world.post("a_hr", "/hr/policies/audience-preview", json={"canonical_id": POL, "audience": _people(world, "a_emp", "a_emp2")}).json()
    assert pv["recipients"] == 2 and pv["blocked"] == 0
    assert world.get("a_emp", "/hr/policies").status_code == 403
    assert world.get("platform", "/hr/policies").status_code == 404
    assert world.get("platform", "/hr/me/policies").status_code == 404
