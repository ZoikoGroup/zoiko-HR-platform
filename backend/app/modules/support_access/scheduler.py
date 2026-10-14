"""Periodic upkeep for support access (ZHR-PRIV-001 Phases 10-12).

One interval job: expire grants and approval windows whose time is up, lapse break-glass sessions nobody confirmed, and
log a reconciliation summary. Enforcement already refuses an expired grant on every request, so this job is about the
RECORD (and about paging when the record stops agreeing with itself) - correctness never depends on it running.

Mirrors the existing APScheduler pattern; falls back to nothing when APScheduler is absent.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("zoiko.privacy.support")

INTERVAL_SECONDS = 300
_scheduler = None


def _maintenance_job() -> None:
    try:
        from app.database import SessionLocal
        from app.modules.support_access import assurance, service

        db = SessionLocal()
        try:
            result = service.run_maintenance(db)
            recon = assurance.reconcile(db)
            logger.info("[support] maintenance %s; reconciliation ok=%s", result, recon["ok"])
            if not recon["ok"]:
                for check in recon["checks"]:
                    if not check["ok"]:
                        logger.warning("[support] ALERT reconciliation failed: %s=%s", check["check"], check["value"])
        finally:
            db.close()
    except Exception as exc:  # never let the job die the process
        logger.error("[support] maintenance job failed: %s", exc)


def start_support_scheduler() -> bool:
    global _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning("[support] APScheduler not installed - support-access upkeep disabled")
        return False
    if _scheduler is not None and _scheduler.running:
        return True
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_maintenance_job, "interval", seconds=INTERVAL_SECONDS, id="support_access_maintenance")
    _scheduler.start()
    logger.info("[support] support-access maintenance started (every %ds)", INTERVAL_SECONDS)
    return True


def stop_support_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
