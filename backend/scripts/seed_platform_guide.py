"""
scripts/seed_platform_guide.py
----------------------------------
Publishes the "Zoiko HR Platform Guide" — every module and screen of the
platform, where it is in the menu and who sees it (built from
app/modules/assistant/platform_nav.json) — as platform-wide knowledge, so
every organization's assistant can answer questions about Zoiko HR itself.

Re-run after the menu changes (node scripts/export_platform_nav.mjs first).
Unchanged text is skipped; changed text publishes a new source and retires the
old one, so the assistant never quotes two versions.

Run: `python scripts/seed_platform_guide.py <owner_employee_id>`
     (loads into HR_PLATFORM_KNOWLEDGE_ORG_ID; the owner must belong to it)
"""

import datetime
import hashlib
import sys

sys.path.insert(0, ".")

from app.config import settings
from app.database import SessionLocal
from app.modules.assistant import knowledge_service, platform_guide
from app.modules.assistant.models import KnowledgeSource, KnowledgeStatus

TITLE = "Zoiko HR Platform Guide"


def main():
    if len(sys.argv) != 2 or not settings.PLATFORM_KNOWLEDGE_ORG_ID:
        print("Usage: python scripts/seed_platform_guide.py <owner_employee_id>   (needs HR_PLATFORM_KNOWLEDGE_ORG_ID)")
        sys.exit(1)
    org_id, owner_id = settings.PLATFORM_KNOWLEDGE_ORG_ID, int(sys.argv[1])
    text = platform_guide.guide_text()
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

    db = SessionLocal()
    try:
        current = (
            db.query(KnowledgeSource)
            .filter(KnowledgeSource.organization_id == org_id, KnowledgeSource.title == TITLE,
                    KnowledgeSource.status == KnowledgeStatus.PUBLISHED)
            .all()
        )
        if any(v.content_hash == digest for s in current for v in s.versions):
            print(f"SKIP: {TITLE} is already published with this content")
            return
        source = knowledge_service.create_source(
            db, org_id, owner_id, title=TITLE, source_type="guide", authority_tier="A", content_text=text,
            jurisdiction_code=None, worker_type=None, audience_role=None,
            effective_from=datetime.date.today(), effective_to=None,
        )
        knowledge_service.publish_source(db, org_id, source.id, owner_id)
        print(f"CREATED + PUBLISHED: {TITLE} (source id {source.id}, {len(text)} chars)")
        for old in current:
            knowledge_service.retire_source(db, org_id, old.id, owner_id)
            print(f"RETIRED previous version: source id {old.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
