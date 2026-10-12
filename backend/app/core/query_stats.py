"""Per-request database statistics for performance work (dev only).

Switched on with HR_LOG_QUERY_STATS=true. Every SQL statement executed while a request is being served is counted and
timed; request_logging_middleware (app/main.py) then logs "queries=N db_ms=X checkouts=C total_ms=Y" plus the slowest
single statement. X-Query-Count / X-DB-Time response headers are also set so benchmarking tooling (scripts/
measure_latency.py) can read the numbers without parsing logs. Off by default, so production pays only one attribute
read per query: the engine listeners are only attached when the flag is set.

The counter lives in a ContextVar holding a mutable object. Starlette copies the context into the threadpool that runs
sync endpoints and dependencies, so the same object is updated from there. Pool "checkout" events are attributed the
same way: the event fires on the thread doing the checkout, which inherits the request's context in both the event-loop
and threadpool cases.
"""
import time
from contextvars import ContextVar
from dataclasses import dataclass, field

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import Pool

from app.config import settings


def enabled() -> bool:
    return bool(getattr(settings, "LOG_QUERY_STATS", False))


def sql_enabled() -> bool:
    return bool(getattr(settings, "LOG_QUERY_SQL", False))


@dataclass
class QueryStats:
    count: int = 0
    db_seconds: float = 0.0
    checkouts: int = 0
    statements: list = field(default_factory=list)   # (ms, first 200 chars) of each statement, for finding N+1 patterns
    slowest_ms: float = 0.0
    slowest_sql: str | None = None


_current: ContextVar = ContextVar("hr_query_stats", default=None)
_attached = False


def start() -> QueryStats:
    stats = QueryStats()
    _current.set(stats)
    return stats


def current():
    return _current.get()


def _before(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("hr_qs_start", []).append(time.perf_counter())


def _after(conn, cursor, statement, parameters, context, executemany):
    starts = conn.info.get("hr_qs_start")
    if not starts:
        return
    elapsed = time.perf_counter() - starts.pop()
    stats = _current.get()
    if stats is not None:
        stats.count += 1
        stats.db_seconds += elapsed
        sql = " ".join(str(statement).split())[:200]
        if elapsed > stats.slowest_ms:
            stats.slowest_ms = elapsed
            stats.slowest_sql = sql
        if sql_enabled():
            stats.statements.append((round(elapsed * 1000, 1), sql))


def _on_checkout(dbapi_connection, connection_record, connection_proxy):
    # Fires on the thread that checked the connection out. In the FastAPI
    # threadpool that thread carries the request's copied context; on the
    # event loop it carries the request's own context — both see _current.
    stats = _current.get()
    if stats is not None:
        stats.checkouts += 1


class QueryStatsMiddleware:
    """Pure ASGI middleware that starts the per-request counter. Registered LAST in app/main.py so it is the outermost
    layer and the entitlement middleware's queries are counted too; request_logging_middleware (inner) logs the result."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            start()
        await self.app(scope, receive, send)


def install() -> bool:
    """Attach the listeners once (process-wide, idempotent). Returns True when stats are being collected.

    SQLAlchemy's event registry does NOT dedupe repeated event.listen calls on the same target+fn, so this is guarded
    by a plain module flag that is never reset in-process. In widget-less test runs the flag simply stays on once the
    first install() saw LOG_QUERY_STATS enabled; the listeners are inert while the ContextVar default (None) is used."""
    global _attached
    if enabled() and not _attached:
        event.listen(Engine, "before_cursor_execute", _before)
        event.listen(Engine, "after_cursor_execute", _after)
        event.listen(Pool, "checkout", _on_checkout)
        _attached = True
    return enabled()