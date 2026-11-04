"""Trust-boundary middleware (ZHR-PRIV-001 A01, A02, C01, C07, D02).

Runs before everything else that handles a request (including the response cache), as pure ASGI so the context reaches
the sync route handlers that run in the threadpool. It does three things, all from the SIGNED identity in the access
token and never from request input:

  * sets the request context (plane, tenant, actor, correlation id);
  * refuses a platform (super admin) token on every tenant data-plane route, with the same 404 an unknown route gives;
  * refuses a tenant token that names a different organization in the query string, with that same 404.

Anything that cannot be decided (bad token) falls through to the normal authentication, which answers 401.
"""
from __future__ import annotations

import json
import logging
from urllib.parse import parse_qs

from app.core.privacy import context as ctx
from app.core.privacy import policy
from app.core.privacy.routes import classify_route

logger = logging.getLogger("zoiko.privacy")

ORG_PARAMS = (b"organization_id", b"org_id", b"tenant_id")
_NOT_FOUND = json.dumps({"detail": "Not Found"}).encode()


def _bearer(scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            v = value.decode("latin-1")
            if v.lower().startswith("bearer "):
                return v[7:].strip()
    return None


def _header(scope, key: bytes) -> str | None:
    for name, value in scope.get("headers", []):
        if name == key:
            return value.decode("latin-1")
    return None


async def _not_found(send, correlation_id: str):
    await send({"type": "http.response.start", "status": 404,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(_NOT_FOUND)).encode()),
                            (b"x-request-id", correlation_id.encode())]})
    await send({"type": "http.response.body", "body": _NOT_FOUND})


def _cors(scope) -> list:
    """This answer is sent before CORSMiddleware runs: add its headers for an allowed origin so the browser can read it."""
    import re
    from app.core.exceptions import _ALLOWED_ORIGINS
    origin = _header(scope, b"origin") or ""
    if origin and (origin in _ALLOWED_ORIGINS or re.fullmatch(r"https?://(localhost|127\.0\.0\.1)(:\d+)?", origin)):
        return [(b"access-control-allow-origin", origin.encode()), (b"access-control-allow-credentials", b"true"), (b"vary", b"Origin")]
    return []


async def _json(send, scope, status: int, body: dict, correlation_id: str):
    raw = json.dumps(body).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(raw)).encode()),
                            (b"x-request-id", correlation_id.encode())] + _cors(scope)})
    await send({"type": "http.response.body", "body": raw})


class PrivacyContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # honour an upstream request id when it looks sane, otherwise make one
        cid = (_header(scope, b"x-request-id") or "")[:64]
        if not cid or not all(c.isalnum() or c in "-_" for c in cid):
            cid = ctx.new_correlation_id()
        scope.setdefault("state", {})["correlation_id"] = cid

        plane, tenant, actor, role = None, None, None, None
        support_session = None
        token = _bearer(scope)
        if token:
            from app.core.security import decode_access_token
            payload = decode_access_token(token)
            if payload and payload.get("typ") != "refresh":
                role = payload.get("role")
                actor = payload.get("id")
                support_session = payload.get("sls")
                if role == "super_admin":
                    plane = ctx.PLATFORM
                elif role:
                    plane, tenant = ctx.TENANT, payload.get("organization_id")

        path = scope.get("path", "")
        if plane == ctx.PLATFORM and classify_route(path) == "DATA_PLANE":
            self._record(plane, actor, path, policy.PLATFORM_DATA_PLANE_DENIED, cid)
            return await _not_found(send, cid)

        if plane == ctx.TENANT and tenant is not None:
            query = parse_qs(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
            for key in ORG_PARAMS:
                for raw in query.get(key.decode(), []):
                    if str(raw).strip() not in ("", str(tenant)):
                        self._record(plane, actor, path, policy.NO_TENANT_MEMBERSHIP, cid)
                        return await _not_found(send, cid)

        # Temporary support sign-in: refused once it has ended, read-only always, every request logged for the tenant.
        if support_session is not None:
            import anyio
            from app.modules.support_login import gate
            verdict = await anyio.to_thread.run_sync(gate.check, support_session, tenant, scope.get("method", "GET"), path)
            if verdict is not None:
                status, code, message = verdict
                body = {"message": message} if status == 200 else {"detail": message, "error_code": code, "message": message}
                return await _json(send, scope, status, body, cid)

        reset = ctx.set_context(plane or "ANONYMOUS", tenant, actor, cid, role=role)

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                headers = [h for h in message.get("headers", []) if h[0].lower() != b"x-request-id"]
                headers.append((b"x-request-id", cid.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            ctx.reset_context(reset)

    @staticmethod
    def _record(plane, actor, path, reason, cid):
        try:
            policy._sink.emit({"actor_id": actor, "plane": plane, "tenant_id": None, "action": "route", "resource_class": classify_route(path),
                               "resource_type": "route", "decision": "DENY", "reason": reason, "policy_version": policy.POLICY_VERSION,
                               "correlation_id": cid})
            policy._recent.append({"actor_id": actor, "plane": plane, "action": "route", "decision": "DENY", "reason": reason, "correlation_id": cid})
        except Exception:
            logger.exception("privacy route denial could not be recorded")
