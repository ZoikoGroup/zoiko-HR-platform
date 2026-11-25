"""
scripts/retire_spec_knowledge.py
------------------------------------
Retires the docs/new_docs engineering-wireframe documents from the assistant's
knowledge base. They were loaded as knowledge (scripts/seed_real_policy_docs.py)
but are design specs for planned features — numbered sections and planned screen
names — and the assistant repeated them as if they were menus in the live app
("31.3 HR — Offboarding Control Center").

Retrieval already ignores them (retrieval_service.SPEC_DOC_TITLES); this makes
it permanent in the database. Retiring keeps the rows and their history (nothing
is deleted) and is the same action as "Retire" on the Assistant Knowledge page.
Company policies published from the policy hub are never touched: they carry a
policy_canonical_id, these documents don't.

Dry run by default (lists what would change):
    python scripts/retire_spec_knowledge.py
Apply:
    python scripts/retire_spec_knowledge.py --apply <acting_employee_id>
"""

import sys

sys.path.insert(0, ".")

from app.database import SessionLocal
from app.modules.assistant import knowledge_service
from app.modules.assistant.models import KnowledgeSource, KnowledgeStatus
from app.modules.assistant.retrieval_service import SPEC_DOC_TITLES


def main():
    apply = "--apply" in sys.argv
    if apply and len(sys.argv) != 3:
        print("Usage: python scripts/retire_spec_knowledge.py [--apply <acting_employee_id>]")
        sys.exit(1)
    actor = int(sys.argv[-1]) if apply else None

    db = SessionLocal()
    try:
        sources = (
            db.query(KnowledgeSource)
            .filter(KnowledgeSource.title.in_(SPEC_DOC_TITLES), KnowledgeSource.policy_canonical_id.is_(None),
                    KnowledgeSource.status != KnowledgeStatus.RETIRED)
            .order_by(KnowledgeSource.organization_id, KnowledgeSource.id)
            .all()
        )
        if not sources:
            print("Nothing to retire: no active engineering-wireframe documents in the knowledge base.")
            return
        for s in sources:
            print(f"{'RETIRE' if apply else 'would retire'}: source #{s.id} org {s.organization_id} "
                  f"[{s.status.value}] {s.title}")
            if apply:
                knowledge_service.retire_source(db, s.organization_id, s.id, actor)
        print(f"\n{len(sources)} document(s) {'retired' if apply else 'found — run with --apply <employee_id> to retire'}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
