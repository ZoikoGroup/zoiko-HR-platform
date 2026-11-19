"""One-off: write the 10 onboarding package documents as platform starter templates.

    cd backend && python scripts/package_starters_generate.py [--check]

Reads each v2 builder in app/modules/hr/onboarding_package_content_v2.py, converts its blocks to the template vocabulary
(doc_templates/package_blocks.to_template), marks the blocks that must never be edited as locked, and writes
app/modules/doc_templates/seeds/content/HR-PKG/PKG-<template id>.json. --check exits 1 when a file would change.

Locked: every signature block and consent; statutory and privacy notices; the self-disclosure legal questions; the affidavit
attestation. tests/hr/test_package_starters_parity.py proves each starter renders the same text as its builder.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("ONBOARDING_PACKAGE_V2", "true")


def _texts(b) -> str:
    return json.dumps(b, ensure_ascii=False)


def locked(category: str, block: dict) -> bool:
    t = block["type"]
    if t in ("signature_block", "consent"):
        return True
    text = _texts(block)
    if category == "self_disclosure":
        # the legal questions (1–3a), the confidentiality notice and the acknowledgement statements
        return t in ("checks", "textbox", "notice", "list") or (t == "paragraph" and "If you answered No" in text) or (
            t == "table" and "Business / employer name" in text)
    if category == "exclusivity_affidavit":
        # the attestation: who swears, what they affirm, the scope hooks and the jurat
        return (t == "list") or (t == "clause") or (t == "paragraph" and ("hereby affirm" in text or "Sworn and declared" in text))
    if category == "job_application":
        return (t == "clause" and block.get("key") in ("criminal_record_question", "applicant_privacy_notice")) or (
            t == "paragraph" and "true and complete" in text)
    if category == "daily_kpi":
        return t == "list" and "No decision about pay" in text or (t == "list" and "human manager reviews" in text)
    if category == "nda":
        return t == "section" and "protected_disclosure_and_whistleblowing" in text
    return False


def build() -> dict:
    from app.modules.doc_templates import package_blocks as PB
    from app.modules.doc_templates import package_templates as PT
    from app.modules.hr import onboarding_package_content  # noqa: F401  (imports the v2 module in the right order)
    from app.modules.hr import onboarding_package_content_v2 as V2
    out = {}
    for (cat, title, tid, fam, typ, risk, sens, mode, orient, pages, signers, builder, initials) in V2.DOCUMENT_INDEX:
        blocks = PB.to_template(builder())
        for i, b in enumerate(blocks, 1):
            b["id"] = f"b{i}"
            if locked(cat, b):
                b["locked"] = True
        cid = PT.canonical_for(tid)
        out[cid] = {"canonical_id": cid, "template_id": tid, "category": cat, "title": title, "family_id": fam, "doc_type": typ,
                    "risk": risk, "sensitivity": sens, "mode": mode, "orientation": orient, "pages": pages, "signers": signers,
                    "initials": initials, "optional_fields": sorted(V2.OPTIONAL_BY_DOC.get(cat, set())),
                    "blocks": PB.normalise(blocks)}
    return out


def main() -> int:
    from app.modules.doc_templates import package_templates as PT
    check = "--check" in sys.argv
    PT.STARTER_DIR.mkdir(parents=True, exist_ok=True)
    changed = []
    for cid, payload in build().items():
        path = PT.STARTER_DIR / f"{cid}.json"
        text = json.dumps(payload, ensure_ascii=False, indent=1) + "\n"
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            changed.append(cid)
            if not check:
                path.write_text(text, encoding="utf-8")
    print(("would change: " if check else "written: ") + (", ".join(changed) or "nothing"))
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
