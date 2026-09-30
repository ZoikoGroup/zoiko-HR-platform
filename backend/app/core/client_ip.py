"""
core/client_ip.py
-----------------
Real client IP for audit trails, correct behind a reverse proxy / load balancer.

``request.client.host`` is the TCP peer, which behind a proxy is the proxy's own
address — so every audit row recorded the load balancer, never the user. The
forwarded header is only honoured when the peer is a *trusted proxy*
(``HR_TRUSTED_PROXIES``: comma-separated IPs/CIDRs, empty by default = trust no
one, so the header can never be spoofed by a direct caller). The X-Forwarded-For
chain is walked right-to-left, skipping trusted hops; the first address that is
not one of ours is the client.

``ClientIPMiddleware`` stores the result in a ContextVar so any audit writer —
however deep in the service layer — can stamp it without a ``Request`` being
threaded through. ``stamp_client_ip`` does that automatically on insert.
"""

from __future__ import annotations

import ipaddress
from contextvars import ContextVar
from typing import Iterable, Optional

from sqlalchemy import event

from app.config import settings

# Longest textual IPv6 (full IPv4-mapped form) is 45 chars.
MAX_IP_LENGTH = 45

_client_ip: ContextVar[Optional[str]] = ContextVar("client_ip", default=None)


def normalize_ip(raw: Optional[str]) -> Optional[str]:
    """Canonical IP string, or None if ``raw`` isn't a valid address.

    Strips brackets / ports / zone ids and unmaps IPv4-mapped IPv6
    (``::ffff:1.2.3.4`` -> ``1.2.3.4``).
    """
    if not raw:
        return None
    value = raw.strip().strip('"')
    if not value:
        return None
    if value.startswith("["):  # [v6]:port
        value = value[1:].split("]", 1)[0]
    elif value.count(":") == 1:  # v4:port
        value = value.split(":", 1)[0]
    value = value.split("%", 1)[0]  # IPv6 zone id
    try:
        addr = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return str(addr)[:MAX_IP_LENGTH]


def _parse_networks(spec: str) -> list:
    nets = []
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            continue
    return nets


def _is_trusted(ip: Optional[str], networks: Iterable) -> bool:
    if not ip:
        return False
    addr = ipaddress.ip_address(ip)
    return any(addr in net for net in networks)


def resolve_client_ip(
    peer: Optional[str],
    forwarded_for: Optional[str],
    trusted_proxies: Optional[str] = None,
) -> Optional[str]:
    """Pure resolver (unit-testable): peer address + XFF header -> client IP."""
    networks = _parse_networks(settings.TRUSTED_PROXIES if trusted_proxies is None else trusted_proxies)
    peer_ip = normalize_ip(peer)
    if not forwarded_for or not _is_trusted(peer_ip, networks):
        return peer_ip
    hops = [normalize_ip(h) for h in forwarded_for.split(",")]
    hops = [h for h in hops if h]
    for hop in reversed(hops):
        if not _is_trusted(hop, networks):
            return hop
    # every hop was one of our own proxies — the leftmost is the origin
    return hops[0] if hops else peer_ip


def get_client_ip(request) -> Optional[str]:
    peer = request.client.host if getattr(request, "client", None) else None
    return resolve_client_ip(peer, request.headers.get("x-forwarded-for"))


def current_client_ip() -> Optional[str]:
    return _client_ip.get()


class ClientIPMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware) so the ContextVar reaches sync routes
    that run in the threadpool."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        client = scope.get("client")
        peer = client[0] if client else None
        xff = None
        for name, value in scope.get("headers", []):
            if name == b"x-forwarded-for":
                xff = value.decode("latin-1")
                break
        token = _client_ip.set(resolve_client_ip(peer, xff))
        try:
            await self.app(scope, receive, send)
        finally:
            _client_ip.reset(token)


def _stamp(_mapper, _connection, target) -> None:
    current = current_client_ip()
    if current is None:
        return
    if getattr(target, "ip_address", None):
        # writers that captured their own value still get it normalised
        target.ip_address = normalize_ip(target.ip_address) or target.ip_address[:MAX_IP_LENGTH]
    else:
        target.ip_address = current


def register_ip_stamping(*models) -> None:
    """Fill ``ip_address`` on insert for audit-style models (idempotent)."""
    for model in models:
        if not event.contains(model, "before_insert", _stamp):
            event.listen(model, "before_insert", _stamp)
