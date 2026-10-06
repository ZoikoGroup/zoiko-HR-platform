"""A value set in .env must reach modules that read os.environ directly (UPLOAD_BASE_DIR, HR_DB_POOL_SIZE, ...)."""
import os
import subprocess
import sys


def _run(tmp_path, env_extra=None):
    (tmp_path / ".env").write_text("UPLOAD_BASE_DIR=/data/from-dotenv\nHR_DB_POOL_SIZE=7\n", encoding="utf-8")
    code = "import os; import app.config; print(os.environ.get('UPLOAD_BASE_DIR'), os.environ.get('HR_DB_POOL_SIZE'))"
    env = {k: v for k, v in os.environ.items() if k not in ("UPLOAD_BASE_DIR", "HR_DB_POOL_SIZE")}
    env["PYTHONPATH"] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env.update(env_extra or {})
    return subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env, capture_output=True, text=True).stdout.split()


def test_dotenv_values_reach_os_environ(tmp_path):
    assert _run(tmp_path) == ["/data/from-dotenv", "7"]


def test_real_environment_variables_win_over_dotenv(tmp_path):
    assert _run(tmp_path, {"UPLOAD_BASE_DIR": "/data/real"}) == ["/data/real", "7"]
