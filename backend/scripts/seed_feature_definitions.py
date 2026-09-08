"""
scripts/seed_feature_definitions.py
-----------------------------------
Populate the durable `feature_definition` registry (Section 14) from the
runtime FEATURE_KEYS registry. Idempotent — run at any time, safe to re-run:

    python scripts/seed_feature_definitions.py

Writes one row per key with domain derived from the key prefix and the default
governance posture (INTERNAL sensitivity, REPORT_ONLY enforcement).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.modules.billing.catalog_service import sync_feature_definitions  # noqa: E402
from app.modules.billing.feature_keys import FEATURE_KEYS  # noqa: E402


def main():
    with SessionLocal() as db:
        result = sync_feature_definitions(db, feature_keys=FEATURE_KEYS)
    print(
        f"feature_definition sync complete: inserted={result['inserted']} "
        f"existing={result['existing']} total={result['total']}"
    )


if __name__ == "__main__":
    main()