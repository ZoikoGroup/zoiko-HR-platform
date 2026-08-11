"""
core/sanitize.py
----------------
Input sanitization utilities using MarkupSafe to prevent XSS attacks.
"""

from enum import Enum

from markupsafe import escape


def sanitize_input(value):
    """Sanitize a string input to prevent XSS. Returns escaped string or None."""
    if value is None:
        return None
    if isinstance(value, Enum):
        return value
    if isinstance(value, str):
        return str(escape(value.strip()))
    return value


def sanitize_dict(data: dict) -> dict:
    """Sanitize all string values in a dictionary."""
    return {k: sanitize_input(v) for k, v in data.items()}
