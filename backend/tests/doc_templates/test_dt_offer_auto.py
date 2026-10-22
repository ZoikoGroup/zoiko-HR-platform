"""'Offer letters without approval' (recruitment setting): saving an offer approves it and generates the letter for the offer's
type in the variant and clauses released for its work country, with no second approver. HR still sends it. Off by default."""
from app.modules.doc_templates.models import DecisionReceipt, DocumentEvent, GeneratedDocument
from app.modules.hr.models import OfferStatus, RecruitmentOffer, RecruitmentOfferApproval
from tests.doc_templates.p2_support import activate, signatory
from tests.doc_templates.test_dt_recruitment import _candidate, _offer


def _switch(world, on: bool):
    r = world.put("a_admin", "/hr/recruitment/privacy-settings", json={"offer_letters_without_approval": on})
    assert r.status_code == 200, r.text
    assert r.json()["offer_letters_without_approval"] is on


def test_off_by_default_an_offer_still_waits_for_a_second_person(world):
    signatory(world)
    activate(world.db, "HR-HIR-011")
    r = world.get("a_admin", "/hr/recruitment/privacy-settings")
    assert r.json()["offer_letters_without_approval"] is None
    o = _offer(world, _candidate(world))
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.status != OfferStatus.APPROVED and offer.document_id is None
    assert world.db.query(GeneratedDocument).count() == 0


def test_on_saving_the_offer_generates_the_country_letter_and_hr_sends_it(world):
    signatory(world)
    activate(world.db, "HR-HIR-011")
    _switch(world, True)
    o = _offer(world, _candidate(world))                     # GB, full time with an open condition -> HR-HIR-011
    world.db.expire_all()
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.status == OfferStatus.APPROVED and offer.approved_by == world.u["a_hr"].id
    approval = world.db.query(RecruitmentOfferApproval).filter_by(offer_id=offer.id).one()
    assert "without approval" in approval.comments
    doc = world.db.get(GeneratedDocument, offer.document_id)
    assert doc.canonical_id == "HR-HIR-011" and doc.status == "RENDERED_DRAFT" and doc.approval_policy == "L1"
    receipt = world.db.query(DecisionReceipt).filter_by(source_ref=f"recruitment_offer:{offer.id}").order_by(DecisionReceipt.id.desc()).first()
    assert receipt.inputs["approval_waived"]["policy"] == "L2"
    assert world.db.query(DocumentEvent).filter_by(document_id=doc.id, event_type="approval_waived").count() == 1

    # changing the terms before it is sent replaces the unsent letter with one built from the new terms
    r = world.put("a_hr", f"/hr/recruitment/offers/{offer.id}", json={"position": "Senior Analyst"})
    assert r.status_code == 200, r.text
    world.db.expire_all()
    letters = world.db.query(GeneratedDocument).filter_by(canonical_id="HR-HIR-011").order_by(GeneratedDocument.id).all()
    assert [d.status for d in letters] == ["CANCELLED", "RENDERED_DRAFT"]
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.status == OfferStatus.APPROVED and offer.document_id == letters[1].id

    r = world.post("a_hr", f"/hr/recruitment/offers/{offer.id}/letter/issue")   # the person who saved it may send it
    assert r.status_code == 200, r.text
    assert r.json()["letter"]["status"] == "ISSUED" and r.json()["status"] == "pending"
    assert any(t == "candidate_document_sign.html" for (_, t, _) in world.mail)



def test_on_with_no_released_pack_for_the_work_country_the_offer_saves_and_no_letter_is_made(world):
    signatory(world)
    activate(world.db, "HR-HIR-011")                         # released for GB only
    _switch(world, True)
    o = _offer(world, _candidate(world), work_country="FR")
    world.db.expire_all()
    offer = world.db.get(RecruitmentOffer, o["id"])
    assert offer.document_id is None and world.db.query(GeneratedDocument).count() == 0
    receipt = world.db.query(DecisionReceipt).filter_by(source_ref=f"recruitment_offer:{offer.id}").order_by(DecisionReceipt.id.desc()).first()
    assert receipt is not None and receipt.outcome != "ALLOW"


def test_only_an_l2_policy_can_be_waived():
    from app.modules.doc_templates import preflight
    import inspect
    src = inspect.getsource(preflight.run_preflight)
    assert 'if waive_approval and r.policy == "L2":' in src, "an L3 document always keeps its approvers"


def test_readiness_lists_every_missing_prerequisite_at_once_and_clears_when_set_up(world):
    o = _offer(world, _candidate(world), work_country="FR")          # nothing is released for France
    r = world.get("a_hr", f"/hr/recruitment/offers/{o['id']}/letter/readiness")
    assert r.status_code == 200, r.text
    steps = {s["key"]: s for s in r.json()["steps"]}
    assert r.json()["ready"] is False
    assert not steps["pack"]["ok"] and steps["pack"]["fix"]["href"] == "/zoiko-hr/documents/jurisdiction-packs"
    assert not steps["template"]["ok"] and not steps["signatory"]["ok"] and not steps["approval"]["ok"]
    assert steps["entity"]["ok"] and steps["offer"]["ok"]

    signatory(world)
    activate(world.db, "HR-HIR-011")                                    # GB pack, template and clauses
    o2 = _offer(world, _candidate(world, name="Gia GB", email="gia@example.com"))
    assert world.post("a_admin", f"/hr/recruitment/offers/{o2['id']}/approve", json={}).status_code == 200
    r = world.get("a_hr", f"/hr/recruitment/offers/{o2['id']}/letter/readiness").json()
    assert r["ready"] is True, [s for s in r["steps"] if not s["ok"]]
