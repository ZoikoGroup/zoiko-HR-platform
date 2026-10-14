"""Ending sessions (ZHR-PRIV-001 B04: joiner-mover-leaver).

Tokens carry `iat`, and a token issued before an account's `password_changed_at` is refused everywhere (core.security,
core.dependencies, the refresh endpoint). Moving that timestamp forward therefore ends every session and refresh token of the
account at once, with no session table to keep in step. Support grants (Prompt 2) extend `revoke_all_sessions` to end an
actor's grants in the same call.
"""
from datetime import datetime


def revoke_all_sessions(employee, *, now: datetime | None = None) -> None:
    """Every access and refresh token issued before now is refused from now on. The caller commits."""
    employee.password_changed_at = now or datetime.utcnow()
