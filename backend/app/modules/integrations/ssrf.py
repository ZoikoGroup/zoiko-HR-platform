"""SSRF guard for outbound webhook URLs."""

import ipaddress
import socket
from urllib.parse import urlparse

from app.config import settings


class UnsafeURL(ValueError):
    pass


def _check_ip(ip_str: str) -> None:
    ip = ipaddress.ip_address(ip_str)
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped
    if not ip.is_global or ip.is_multicast:
        raise UnsafeURL("URL resolves to a private, loopback or otherwise internal address.")


def validate_webhook_url(url: str, resolver=socket.getaddrinfo) -> str:
    """Return the URL or raise UnsafeURL. HTTPS is required unless the app runs
    in development (DEBUG). Private/loopback/link-local/metadata ranges are
    always rejected. Run again immediately before each delivery."""
    url = (url or "").strip()
    parsed = urlparse(url)
    allowed = ("https", "http") if settings.DEBUG else ("https",)
    if parsed.scheme not in allowed:
        raise UnsafeURL("URL must use https.")
    host = parsed.hostname
    if not host:
        raise UnsafeURL("URL must include a host.")
    if parsed.username or parsed.password:
        raise UnsafeURL("URL must not contain credentials.")
    try:
        ipaddress.ip_address(host)
        is_literal = True
    except ValueError:
        is_literal = False
    if is_literal:
        _check_ip(host)
        return url
    if host.lower() == "localhost" or host.lower().endswith(".localhost"):
        raise UnsafeURL("URL must not point to localhost.")
    try:
        infos = resolver(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError:
        raise UnsafeURL("Host could not be resolved.")
    if not infos:
        raise UnsafeURL("Host could not be resolved.")
    for info in infos:
        _check_ip(info[4][0])
    return url
