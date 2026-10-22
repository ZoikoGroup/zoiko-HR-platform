"""In-process document hooks: how HR modules react to a document's outcome without the engine knowing about them.

    hooks.on("executed", ["HR-HIR-011", "HR-HIR-012"], handler)      # handler(db, doc) after the change is committed

Events: generated, issued, executed, declined, expired, acknowledged, cancelled. Handlers run after the engine's own commit,
each in its own try block: a failing handler is logged (by document id) and never undoes the document change. HR state changes
(an offer becoming accepted, a candidate hired) happen in the module's own service inside the handler, never in the renderer.

Integration modules register at import; `load_integrations()` imports them once (they live next to the data they own).
"""
from __future__ import annotations

import importlib
import logging
from collections import defaultdict
from typing import Callable, Iterable

logger = logging.getLogger("zoiko.doc_templates")

EVENTS = ("generated", "issued", "executed", "declined", "expired", "acknowledged", "cancelled")
INTEGRATION_MODULES = (
    "app.modules.hr.recruitment_documents",
    "app.modules.hr.workforce_documents",
    "app.modules.hr.onboarding_documents",
    "app.modules.hr.policy_documents",
    "app.modules.hr.leave_documents",
    "app.modules.hr.time_documents",
    "app.modules.hr.compensation_documents",
    "app.modules.hr.performance_documents",
    "app.modules.hr.learning_documents",
    "app.modules.hr.change_documents",
)

_handlers: dict[tuple[str, str], list[Callable]] = defaultdict(list)
_loaded = False


def on(event: str, canonical_ids: Iterable[str], handler: Callable) -> None:
    if event not in EVENTS:
        raise ValueError(f"unknown document event {event}")
    for cid in canonical_ids:
        if handler not in _handlers[(event, cid)]:
            _handlers[(event, cid)].append(handler)


def load_integrations() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    for name in INTEGRATION_MODULES:
        try:
            importlib.import_module(name)
        except ModuleNotFoundError as exc:
            if exc.name != name:
                raise


_providers: dict[str, list[Callable]] = defaultdict(list)


def context(canonical_ids: Iterable[str], provider: Callable) -> None:
    """provider(ctx) fills ctx.extra / ctx.form_values / ctx.checklist_state / ctx.lists before fields are checked."""
    for cid in canonical_ids:
        if provider not in _providers[cid]:
            _providers[cid].append(provider)


def provide(ctx, canonical_id: str) -> None:
    load_integrations()
    for provider in _providers.get(canonical_id, []):
        provider(ctx)


def dispatch(db, event: str, doc) -> None:
    load_integrations()
    for handler in list(_handlers.get((event, doc.canonical_id), [])):
        try:
            handler(db, doc)
        except Exception:
            db.rollback()
            logger.exception("doc_templates hook %s failed for document id %s (%s)", event, doc.id, getattr(handler, "__name__", "?"))


# ── signals: engine events that are not about one document ───────────────────────────────────────────────────────────
# "variant_released"   handler(db, actor, variant, previous)   a new template version became ACTIVE
# "policy_published"   handler(db, actor, distribution)        a policy distribution was published
SIGNALS = ("variant_released", "policy_published")
_subscribers: dict[str, list[Callable]] = defaultdict(list)


def subscribe(signal: str, handler: Callable) -> None:
    if signal not in SIGNALS:
        raise ValueError(f"unknown signal {signal}")
    if handler not in _subscribers[signal]:
        _subscribers[signal].append(handler)


def send(db, signal: str, *args) -> None:
    """Like dispatch(): after the engine's commit, each handler isolated; a failure is logged and never undoes the change."""
    load_integrations()
    for handler in list(_subscribers.get(signal, [])):
        try:
            handler(db, *args)
        except Exception:
            db.rollback()
            logger.exception("doc_templates signal %s failed (%s)", signal, getattr(handler, "__name__", "?"))
