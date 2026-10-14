"""Platform accounts belong to named people (ZHR-PRIV-001 B01).

A shared or generic account (admin@, support@, superadmin, ...) cannot be tied to one human, so nothing it does can be attributed.
Creating one is refused; existing ones are listed by scripts/privacy_flag_generic_accounts.py so a person can replace them.
"""
from __future__ import annotations

import re

GENERIC_LOCAL_PARTS = frozenset({
    "admin", "administrator", "root", "support", "superadmin", "super-admin", "super_admin", "sysadmin", "sys-admin", "helpdesk", "help",
    "noreply", "no-reply", "donotreply", "info", "ops", "operations", "team", "platform", "security", "contact", "hello", "office", "mail",
    "webmaster", "postmaster", "billing", "accounts", "service", "services", "it", "hr", "staff", "system", "test", "demo", "user", "owner",
})

GENERIC_MESSAGE = ("Platform accounts must belong to one named person. Use that person's own work address, not a shared one "
                   "such as admin@ or support@.")


def local_part(email: str) -> str:
    return (email or "").strip().lower().split("@", 1)[0]


def is_generic_account(email: str) -> bool:
    """admin, Admin01, support.team, super_admin2, ...: made only of shared role words, with or without numbers or separators."""
    local = local_part(email)
    if not local:
        return True
    squash = lambda w: re.sub(r"[._+-]", "", w)
    generic = GENERIC_LOCAL_PARTS | {squash(g) for g in GENERIC_LOCAL_PARTS}
    if local in generic or squash(re.sub(r"\d+$", "", local)) in generic:
        return True
    tokens = [re.sub(r"\d+$", "", t) for t in re.split(r"[._+-]+", local) if t]
    return bool(tokens) and all(t in generic for t in tokens)
