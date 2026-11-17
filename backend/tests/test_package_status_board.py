"""Onboarding › Checklists: the state of the 10 package documents for every new hire of an organisation, in one request."""
from datetime import date

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base


def _db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_the_board_lists_every_active_hire_with_all_ten_documents_in_a_few_queries():
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_package_content as C
    from app.modules.hr.models import OnboardingDocument, OnboardingNewHire, Organization, OrganizationStatus

    db = _db()
    db.add_all([Organization(id=1, name="Acme", status=OrganizationStatus.ACTIVE), Organization(id=2, name="B", status=OrganizationStatus.ACTIVE)])
    db.commit()
    hires = [OnboardingNewHire(organization_id=1, candidate_name=f"Hire {i}", email=f"h{i}@mail.com", position="Designer",
                               status=status, joining_date=date(2026, 12, i + 1))
             for i, status in enumerate(["in_progress", "pre_joining", "completed", "cancelled"])]
    other = OnboardingNewHire(organization_id=2, candidate_name="Elsewhere", email="e@mail.com", position="Designer", status="in_progress")
    db.add_all([*hires, other])
    db.commit()
    first = C.CATEGORIES[0]
    # an approved document that was issued through the package counts as completed
    db.add(OnboardingDocument(onboarding_new_hire_id=hires[0].id, organization_id=1, category=first, title="x",
                              file_path="x", status="approved"))
    hires[0].profile_details = {"_package_files": {first: "k"}}
    db.commit()

    statements = []
    event.listen(db.get_bind(), "before_cursor_execute", lambda *a: statements.append(a[2]))
    board = P.status_board(db, 1)
    assert len(statements) <= 4                                              # hires, documents (+ signing records): not per hire
    assert [h["candidate_name"] for h in board["hires"]] == ["Hire 0", "Hire 1"]       # still onboarding, this organisation only
    assert len(board["documents"]) == 10
    row = board["hires"][0]
    assert row["documents"][first]["state"] == "completed" and row["done"] == 1
    assert sum(row["counts"].values()) == 10 and row["counts"]["not_sent"] == 9
    assert board["totals"]["not_sent"] == 19

    with_finished = P.status_board(db, 1, include_finished=True)
    assert [h["candidate_name"] for h in with_finished["hires"]] == ["Hire 0", "Hire 1", "Hire 2"]   # cancelled never shows
