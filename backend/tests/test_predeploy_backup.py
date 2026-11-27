"""
tests/test_predeploy_backup.py
-------------------------------
M1-02: scripts/predeploy_backup.py, run by the deploy before `alembic upgrade head`.
"""
import importlib.util
import os
import pathlib
import sys
import time

import pytest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "predeploy_backup.py"
spec = importlib.util.spec_from_file_location("predeploy_backup", SCRIPT)
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

PG = "postgresql+psycopg://hr_user:s3cr%40t@db.internal:5432/zoiko_hr?sslmode=require"


@pytest.fixture
def pg_url(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "DATABASE_URL", PG)


def test_password_never_on_the_command_line():
    uri, env = pb.libpq_target(PG)
    assert "s3cr" not in uri and env["PGPASSWORD"] == "s3cr@t"
    assert uri.startswith("postgresql://hr_user@db.internal:5432/zoiko_hr") and "sslmode=require" in uri


def test_no_pending_migrations_means_no_backup(monkeypatch, pg_url, capsys):
    monkeypatch.setattr(pb, "pending_migrations", lambda url: ({"abc"}, {"abc"}))
    monkeypatch.setattr(pb.shutil, "which", lambda name: pytest.fail("pg_dump must not run"))
    monkeypatch.setattr(sys, "argv", ["predeploy_backup.py", "--label", "40d9200"])
    pb.main()
    assert "no backup needed" in capsys.readouterr().out


def test_pending_migrations_without_pg_dump_stop_the_deploy(monkeypatch, pg_url, capsys):
    monkeypatch.setattr(pb, "pending_migrations", lambda url: ({"abc"}, {"def"}))
    monkeypatch.setattr(pb, "server_major", lambda url: 16)
    monkeypatch.setattr(pb.shutil, "which", lambda name: None)
    monkeypatch.setattr(sys, "argv", ["predeploy_backup.py"])
    with pytest.raises(SystemExit) as exit_info:
        pb.main()
    assert exit_info.value.code == 1
    assert "postgresql-client-16" in capsys.readouterr().out


def test_unreadable_migration_state_stops_the_deploy(monkeypatch, pg_url):
    def boom(url):
        raise ConnectionError("refused")
    monkeypatch.setattr(pb, "pending_migrations", boom)
    monkeypatch.setattr(sys, "argv", ["predeploy_backup.py"])
    with pytest.raises(SystemExit) as exit_info:
        pb.main()
    assert exit_info.value.code == 1


def test_old_backups_are_pruned(tmp_path):
    old, new = tmp_path / "old.dump", tmp_path / "new.dump"
    old.write_bytes(b"x")
    new.write_bytes(b"x")
    eight_days_ago = time.time() - 8 * 86400
    os.utime(old, (eight_days_ago, eight_days_ago))
    pb.prune(tmp_path, keep_days=7)
    assert not old.exists() and new.exists()


def test_the_deploy_backs_up_before_migrating():
    deploy = (pathlib.Path(__file__).resolve().parents[2] / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
    assert deploy.index("scripts/predeploy_backup.py") < deploy.index("alembic upgrade head")
