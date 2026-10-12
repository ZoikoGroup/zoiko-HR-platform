"""Only one process should run the background jobs.

With several uvicorn workers (or several containers) every process starts the APScheduler jobs, so the daily
plan changes, delinquency walk, evaluation reminders and the webhook/workflow worker would all run once per
process. When more than one worker is configured, the first process to take a Postgres advisory lock becomes
the leader and starts them; the others just serve requests. The lock lives on one dedicated connection for the
life of the process and is released by the database if the process dies.

A normal single-process deploy never elects anything: it is always the leader, exactly as before. (Electing
there would be harmful: during a restart the old process can still hold the lock for a moment, and the new one
would then start without its jobs.) When electing, the lock is retried for a short while so a restart that
hands over from an old process still ends up with a leader.

HR_BACKGROUND_JOBS=on|off forces the answer; WEB_CONCURRENCY (or HR_WORKERS) says how many workers there are.
"""
import logging
import os
import time

logger = logging.getLogger("zoiko")

_LOCK_KEY = 7_426_031_911  # arbitrary, unique to this app
_held_connection = None

ELECTION_WAIT_SECONDS = 30
ELECTION_RETRY_SECONDS = 2


def _configured_workers() -> int:
    for name in ("WEB_CONCURRENCY", "HR_WORKERS"):
        try:
            return max(int(os.getenv(name, "")), 1)
        except ValueError:
            continue
    return 1


def acquire_background_leadership(engine, wait_seconds: float = ELECTION_WAIT_SECONDS, sleep=time.sleep) -> bool:
    global _held_connection
    forced = os.getenv("HR_BACKGROUND_JOBS", "auto").lower()
    if forced in ("off", "false", "0"):
        return False
    if forced in ("on", "true", "1"):
        return True
    if _held_connection is not None:
        return True
    if engine.dialect.name != "postgresql" or _configured_workers() <= 1:
        return True

    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            conn = engine.connect()
            got = conn.exec_driver_sql("SELECT pg_try_advisory_lock(%s)", (_LOCK_KEY,)).scalar()
        except Exception as exc:  # fail closed: better no scheduler in one worker than a duplicate everywhere
            logger.warning("[startup] Could not check background-job leadership (%s); jobs not started here.", exc)
            return False
        if got:
            _held_connection = conn  # keep it open: closing it would release the lock
            return True
        conn.close()
        if time.monotonic() >= deadline:
            return False
        sleep(ELECTION_RETRY_SECONDS)
