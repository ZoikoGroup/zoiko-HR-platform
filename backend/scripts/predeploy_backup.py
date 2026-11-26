"""
scripts/predeploy_backup.py — a database restore point before every migration (M1-02).

Run by the deploy (inside backend/, venv active) right before `alembic upgrade head`:

    python scripts/predeploy_backup.py --label <commit sha>

- No pending migrations → nothing to back up, exit 0 (most deploys).
- Pending migrations → `pg_dump --format=custom` of HR_DATABASE_URL into BACKUP_DIR (default ~/zoiko-hr-backups) as
  <UTC time>_<label>.dump, checked with `pg_restore --list`, and backups older than KEEP_DAYS (default 7) removed.
- Any failure → exit 1, so the deploy stops BEFORE the migration runs.

The password goes to pg_dump through PGPASSWORD, never on the command line. Restore: docs/runbooks/database-restore.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import pathlib
import re
import shutil
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

BACKEND = pathlib.Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"::error::Pre-migration backup failed: {message}")
    print("The deploy stopped before running migrations; the database is unchanged.")
    sys.exit(1)


def pending_migrations(url: str) -> tuple[set, set]:
    """(current revisions in the database, head revisions in the code)."""
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine

    heads = set(ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini"))).get_heads())
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            current = set(MigrationContext.configure(conn).get_current_heads())
    finally:
        engine.dispose()
    return current, heads


def server_major(url: str) -> int:
    from sqlalchemy import create_engine, text
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return int(conn.execute(text("SHOW server_version_num")).scalar()) // 10000
    finally:
        engine.dispose()


def libpq_target(url: str) -> tuple[str, dict]:
    """A libpq connection URI without the password, and the env that carries it."""
    from sqlalchemy.engine import URL, make_url
    u = make_url(url)
    env = dict(os.environ)
    if u.password:
        env["PGPASSWORD"] = u.password
    # URL.create, not u.set(password=None): in SQLAlchemy, set(password=None) means "leave the password as it is"
    uri = URL.create("postgresql", username=u.username, host=u.host, port=u.port, database=u.database,
                     query=u.query).render_as_string(hide_password=False)
    return uri, env


def prune(directory: pathlib.Path, keep_days: int) -> None:
    cutoff = dt.datetime.now().timestamp() - keep_days * 86400
    for f in [*directory.glob("*.dump"), *directory.glob("*.partial")]:
        if f.stat().st_mtime < cutoff:
            f.unlink()
            print(f"Removed old backup {f.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--label", default="manual", help="usually the commit being deployed")
    parser.add_argument("--force", action="store_true", help="back up even with no pending migrations")
    args = parser.parse_args()

    from app.config import settings
    url = (settings.DATABASE_URL or "").strip()          # the direct URL, not the pooler: pg_dump needs a session
    if not url.startswith(("postgresql", "postgres")):
        fail("HR_DATABASE_URL is not a PostgreSQL URL")

    try:
        current, heads = pending_migrations(url)
    except Exception as exc:                              # noqa: BLE001
        fail(f"could not read the migration state ({type(exc).__name__})")
    if current == heads and not args.force:
        print(f"No pending migrations (at {', '.join(sorted(heads))}); no backup needed.")
        return
    print(f"Pending migrations: database at {sorted(current) or 'none'}, code at {sorted(heads)}. Backing up first.")

    pg_dump, pg_restore = shutil.which("pg_dump"), shutil.which("pg_restore")
    try:
        major = str(server_major(url))
    except Exception:                                     # noqa: BLE001
        major = "<server major version>"
    if not pg_dump or not pg_restore:
        fail(f"pg_dump is not installed on this server. Install it once: sudo apt-get install -y postgresql-client-{major}")

    directory = pathlib.Path(os.environ.get("BACKUP_DIR") or pathlib.Path.home() / "zoiko-hr-backups")
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)                            # the dump holds personal data
    label = re.sub(r"[^A-Za-z0-9._-]", "", args.label)[:40] or "manual"
    target = directory / f"{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}_{label}.dump"
    partial = target.with_suffix(".partial")

    uri, env = libpq_target(url)
    run = subprocess.run([pg_dump, "--format=custom", "--no-owner", "--no-privileges", f"--file={partial}", uri],
                         env=env, capture_output=True, text=True, timeout=1800)
    if run.returncode != 0:
        partial.unlink(missing_ok=True)
        detail = run.stderr.strip().splitlines()[-1:] or ["no output"]
        hint = (f" Install the matching client: sudo apt-get install -y postgresql-client-{major}"
                if "version mismatch" in run.stderr else "")
        fail(f"pg_dump exited {run.returncode}: {detail[0]}.{hint}")

    check = subprocess.run([pg_restore, "--list", str(partial)], capture_output=True, text=True, timeout=300)
    if check.returncode != 0 or partial.stat().st_size == 0:
        partial.unlink(missing_ok=True)
        fail("the dump could not be read back with pg_restore --list")
    partial.rename(target)
    os.chmod(target, 0o600)
    print(f"Backup written: {target} ({target.stat().st_size / 1_048_576:.1f} MB)")

    prune(directory, int(os.environ.get("KEEP_DAYS") or 7))


if __name__ == "__main__":
    main()
