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


def _pending(monkeypatch, major=16):
    monkeypatch.setattr(pb, "pending_migrations", lambda url: ({"abc"}, {"def"}))
    monkeypatch.setattr(pb, "server_major", lambda url: major)
    monkeypatch.setattr(sys, "argv", ["predeploy_backup.py"])


def test_auto_install_off_and_no_pg_dump_stops_the_deploy(monkeypatch, pg_url, capsys):
    _pending(monkeypatch)
    monkeypatch.setenv("AUTO_INSTALL_PG_CLIENT", "false")
    monkeypatch.setattr(pb, "find_pg_tools", lambda major: (None, None))
    monkeypatch.setattr(pb, "install_pg_client", lambda major: pytest.fail("must not install when turned off"))
    with pytest.raises(SystemExit) as exit_info:
        pb.main()
    assert exit_info.value.code == 1
    assert "postgresql-client-16" in capsys.readouterr().out


def test_missing_pg_dump_is_installed_then_the_backup_runs(monkeypatch, pg_url, tmp_path):
    _pending(monkeypatch, major=17)
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path))
    found = iter([(None, None), ("/usr/lib/postgresql/17/bin/pg_dump", "/usr/lib/postgresql/17/bin/pg_restore")])
    monkeypatch.setattr(pb, "find_pg_tools", lambda major: next(found))
    installed = []
    monkeypatch.setattr(pb, "install_pg_client", lambda major: installed.append(major))
    ran = []

    def fake_run(cmd, **kwargs):
        ran.append(cmd[0])
        if cmd[0].endswith("pg_dump"):
            pathlib.Path(next(a for a in cmd if a.startswith("--file=")).split("=", 1)[1]).write_bytes(b"PGDMP")
        return type("R", (), {"returncode": 0, "stderr": "", "stdout": ""})()
    monkeypatch.setattr(pb.subprocess, "run", fake_run)
    pb.main()
    assert installed == [17]
    assert ran == ["/usr/lib/postgresql/17/bin/pg_dump", "/usr/lib/postgresql/17/bin/pg_restore"]
    assert len(list(tmp_path.glob("*.dump"))) == 1


def test_install_needing_a_password_stops_with_clear_advice(monkeypatch, capsys):
    monkeypatch.setattr(pb.shutil, "which", lambda name: "/usr/bin/apt-get")
    monkeypatch.setattr(pb, "_sudo", lambda *cmd, **kw: type("R", (), {"returncode": 1, "stderr": "sudo: a password is required"})())
    with pytest.raises(SystemExit):
        pb.install_pg_client(16)
    out = capsys.readouterr().out
    assert "without a password" in out and "postgresql-client-16" in out


def test_install_falls_back_to_the_postgresql_repository(monkeypatch):
    monkeypatch.setattr(pb.shutil, "which", lambda name: "/usr/bin/apt-get")
    calls = []

    def fake_sudo(*cmd, **kw):
        calls.append(cmd)
        first_try = cmd[:2] == ("apt-get", "install") and "postgresql-client-17" in cmd and len(
            [c for c in calls if "postgresql-client-17" in c]) == 1
        return type("R", (), {"returncode": 100 if first_try else 0, "stderr": ""})()
    monkeypatch.setattr(pb, "_sudo", fake_sudo)
    pb.install_pg_client(17)
    assert any("apt.postgresql.org.sh" in c[0] for c in calls)
    assert calls[-1][-1] == "postgresql-client-17"


def test_an_old_pg_dump_is_not_used_for_a_newer_server(monkeypatch):
    monkeypatch.setattr(pb.pathlib.Path, "glob", lambda self, pattern: iter([]))
    monkeypatch.setattr(pb.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(pb, "tool_major", lambda path: 14)
    assert pb.find_pg_tools(16) == (None, None)
    assert pb.find_pg_tools(14) == ("/usr/bin/pg_dump", "/usr/bin/pg_restore")


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
