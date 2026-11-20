"""Move legacy uploaded documents into the encrypted document store (ZHR-DOCS-ARCH-001 §6.5).

Legacy hr_documents / hr_document_versions rows point at a plain file on disk (file_path). This copies each such file into
the encrypted store (app/modules/hr/documents/storage_service.py) and records storage_key, is_encrypted and sha256 on the row.
Reads already prefer storage_key and fall back to file_path, so the app keeps working during and after the run.

    python scripts/encrypt_hr_documents.py --dry-run               # count what would move (default)
    python scripts/encrypt_hr_documents.py --apply [--org 37] [--batch 500]

Resumable and idempotent: rows that already have a storage_key are skipped, and each batch is committed on its own.
The original plain files are NOT deleted; remove them once a run has completed and been verified (--delete-originals,
only together with --apply, deletes a file only after its encrypted copy has been read back and its hash matches).
Only ids and counts are printed.
"""
import argparse
import hashlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _rows(db, model, org, batch, after_id):
    q = db.query(model).filter(model.storage_key.is_(None), model.file_path.isnot(None), model.id > after_id)
    if org is not None:
        q = q.filter(model.organization_id == org)
    return q.order_by(model.id).limit(batch).all()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default is a dry run)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--org", type=int, default=None, help="limit to one organization id")
    parser.add_argument("--batch", type=int, default=500)
    parser.add_argument("--delete-originals", action="store_true", help="delete each plain file once its encrypted copy is verified")
    args = parser.parse_args()
    dry = not args.apply or args.dry_run

    from app.database import SessionLocal
    from app.modules.hr.documents import storage_service
    from app.modules.hr.file_storage import resolve_stored_file
    from app.modules.hr.models import HrDocument, HrDocumentVersion

    db = SessionLocal()
    moved = missing = 0
    try:
        for model in (HrDocument, HrDocumentVersion):
            after = 0
            while True:
                rows = _rows(db, model, args.org, args.batch, after)
                if not rows:
                    break
                to_delete = []
                for row in rows:
                    after = row.id
                    org = row.organization_id
                    if org is None and model is HrDocumentVersion:
                        doc = db.get(HrDocument, row.document_id)
                        org = doc.organization_id if doc else None
                    path = resolve_stored_file(row.file_path)
                    if not path or org is None:
                        missing += 1
                        print(f"missing file: {model.__tablename__} id={row.id}")
                        continue
                    if dry:
                        moved += 1
                        continue
                    with open(path, "rb") as fh:
                        plain = fh.read()
                    key, digest = storage_service.encrypt_existing(org, plain, row.file_name or os.path.basename(path))
                    if hashlib.sha256(storage_service.read_key(key)).hexdigest() != digest:
                        print(f"verify failed, left as is: {model.__tablename__} id={row.id}")
                        continue
                    row.storage_key, row.is_encrypted, row.sha256 = key, True, digest
                    moved += 1
                    if args.delete_originals:
                        to_delete.append(path)
                if not dry:
                    db.commit()
                    for path in to_delete:          # only once the rows pointing at the encrypted copies are committed
                        os.remove(path)
                print(f"{model.__tablename__}: processed up to id {after}")
    finally:
        db.close()
    print(f"{moved} file(s) {'would be' if dry else 'were'} encrypted; {missing} row(s) point at a missing file.")


if __name__ == "__main__":
    main()
