"""Checks on the setting that decides where links in emails (Sign in, reset password) point."""
from urllib.parse import urlparse


def is_other_product_host(url: str) -> bool:
    """True for an address of the umbrella platform (ZoikoOne): the Sign in button in a Zoiko HR email must open Zoiko HR."""
    host = (urlparse(url or "").hostname or "").lower()
    return "zoikoone" in host or "zoiko-one" in host


def link_config_problems(frontend_url: str, production_app_url: str) -> list[str]:
    """Plain-language problems with FRONTEND_URL (empty when it is fine)."""
    base = (frontend_url or "").strip().rstrip("/")
    host = (urlparse(base).hostname or "").lower()
    problems = []
    if not base:
        problems.append(f"FRONTEND_URL is not set, so Sign in links fall back to {production_app_url}.")
    elif host in ("localhost", "127.0.0.1", "0.0.0.0"):
        problems.append(f"FRONTEND_URL is {base}: Sign in and password-reset links in emails will open a page on the server itself, not the Zoiko HR app.")
    elif is_other_product_host(base):
        problems.append(f"FRONTEND_URL is {base}, which is the ZoikoOne platform, not the Zoiko HR app. Sign in links ignore it and use {production_app_url}; set FRONTEND_URL to the Zoiko HR app address.")
    return problems
