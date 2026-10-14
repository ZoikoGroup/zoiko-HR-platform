"""Regenerate docs/privacy/data_classification.md from app/core/privacy/classification.py.

    python scripts/privacy_classification_doc.py           # write
    python scripts/privacy_classification_doc.py --check   # fail if stale, or if anything is unclassified
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ENVIRONMENT", "testing")
os.environ.setdefault("HR_DATABASE_URL", "sqlite:///:memory:")

import app.main  # noqa: E402,F401  (imports every model)
from app.core.privacy import classification as c  # noqa: E402
from app.database import Base  # noqa: E402

DOC = ROOT.parent / "docs" / "privacy" / "data_classification.md"


def main(argv):
    problems = c.audit(Base.metadata)
    md = c.render_markdown(Base.metadata)
    if "--check" in argv:
        for p in problems:
            print("UNCLASSIFIED:", p)
        stale = (not DOC.exists()) or DOC.read_text(encoding="utf-8") != md
        print("data_classification.md is STALE" if stale else "data_classification.md is up to date")
        return 1 if (problems or stale) else 0
    if problems:
        print("\n".join(problems))
        return 1
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(md, encoding="utf-8")
    print(f"wrote {DOC}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
