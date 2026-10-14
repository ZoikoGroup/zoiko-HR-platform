"""Redaction of sensitive values in logs, error reports and outbound payloads (ZHR-PRIV-001 C10, D04, D07, D08).

The safety net behind the rule "no raw sensitive values in logs, traces, error messages, notifications or analytics". Code should
not log such values in the first place; this makes a slip harmless. It works on text (patterns) and on structured data
(keys whose names the classification registry or the name patterns mark as sensitive).
"""
from __future__ import annotations

import logging
import re
from typing import Any

REDACTED = "[REDACTED]"

_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[EMAIL]"),
    (re.compile(r"\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[JWT]"),                    # JWTs (three dot-separated segments)
    (re.compile(r"(?i)\b(authorization)(\s*[=:]\s*)(bearer\s+)?[A-Za-z0-9._~+/=-]{8,}"), r"\1\2[TOKEN]"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"), "Bearer [TOKEN]"),
    (re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b"), "[IBAN]"),                                                # IBAN
    (re.compile(r"\b(?:\d{4}[ -]){3}\d{4}\b|\b\d{16}\b"), "[CARD]"),                                           # card numbers (grouped by four, or 16 digits)
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[TAX-ID]"),                                                       # PAN-style
    (re.compile(r"\b\d{4} \d{4} \d{4}\b"), "[NATIONAL-ID]"),                                                    # Aadhaar-style, grouped
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[NATIONAL-ID]"),                                                    # SSN
    (re.compile(r"(?<![\w.])(?:\+\d[\d ()-]{7,15}\d|\(\d{3}\)[ -]?\d{3}[ -]?\d{4})(?![\w])"), "[PHONE]"),                 # phone numbers (+country code, or (123) 456-7890)
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)\b(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&]+)"), r"\1\2" + REDACTED),
    (re.compile(r"CANARY-[A-Z0-9-]+"), "[CANARY]"),                                                            # synthetic canaries must never survive a log line
]

_SENSITIVE_KEY = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|authorization|salary|ctc|basic_pay|bank|iban|ifsc|account_number|(^|_)pan(_|$)|aadhaar|aadhar|ssn|tax_id|"
    r"date_of_birth|(^|_)dob(_|$)|medical|health|disab|sick|disciplin|grievance|religion|ethnic|union|first_name|last_name|full_name|(^|_)name$|"
    r"email|phone|mobile|address|passport|visa|emergency|blood|marital|nationality|gender|resume|file_path|receipt)", re.I)
_SAFE_KEYS = {"organization_name", "plan", "plan_code", "status", "action", "decision", "reason", "policy_version", "correlation_id", "resource_type", "resource_class"}


def redact_text(text: str) -> str:
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


def redact_value(value: Any, key: str = "") -> Any:
    """Recursively redact structured data: values under sensitive keys are replaced, strings elsewhere are pattern-scrubbed."""
    if isinstance(value, dict):
        return {k: redact_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [redact_value(v, key) for v in value]
    if key and key not in _SAFE_KEYS and _SENSITIVE_KEY.search(key):
        return REDACTED if value is not None else None
    if isinstance(value, str):
        return redact_text(value)
    return value


class RedactingFilter(logging.Filter):
    """Scrubs the message and its arguments of every record that passes through the handler. Never raises, never drops a record."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            record.msg = redact_text(msg)
            record.args = None
            if record.exc_text:
                record.exc_text = redact_text(record.exc_text)
        except Exception:                                                     # a logging helper must never break logging
            pass
        return True


def install(logger: logging.Logger | None = None) -> None:
    """Attach the filter to every handler of the root logger (and any handler added later through the returned filter)."""
    root = logger or logging.getLogger()
    f = RedactingFilter()
    for h in root.handlers:
        if not any(isinstance(x, RedactingFilter) for x in h.filters):
            h.addFilter(f)
    if not any(isinstance(x, RedactingFilter) for x in root.filters):
        root.addFilter(f)


def scrub_error_event(event: dict, hint=None) -> dict | None:
    """A `before_send` hook for an error tracker (Sentry or equivalent): no request bodies, headers, cookies, user data or local
    variables; messages and exception values are pattern-scrubbed. Use with send_default_pii=False."""
    try:
        req = event.get("request") or {}
        for k in ("data", "cookies", "headers", "query_string", "env"):
            req.pop(k, None)
        event["request"] = req
        event.pop("user", None)
        for ex in (event.get("exception") or {}).get("values", []) or []:
            if "value" in ex and isinstance(ex["value"], str):
                ex["value"] = redact_text(ex["value"])
            for frame in (ex.get("stacktrace") or {}).get("frames", []) or []:
                frame.pop("vars", None)
        if isinstance(event.get("message"), str):
            event["message"] = redact_text(event["message"])
        for crumb in (event.get("breadcrumbs") or {}).get("values", []) or []:
            if isinstance(crumb.get("message"), str):
                crumb["message"] = redact_text(crumb["message"])
            crumb.pop("data", None)
        return event
    except Exception:
        return None                                                          # if scrubbing fails, nothing is sent


# ── what may be sent to an LLM provider (ZHR-PRIV-001 D07) ──────────────────────────────────────────────────────────────
# Identifiers that never help an answer and must not leave: tokens, keys, e-mail addresses, card / bank / national / tax ids.
# (Phone numbers and names are left alone: scrubbing them would change what a person is asking. No tool feeds FINANCIAL or
# SPECIAL_CATEGORY values into a prompt; docs/privacy/llm_dataflow.md.)
_LLM_KEEP = ("[EMAIL]", "[JWT]", "[TOKEN]", "[IBAN]", "[CARD]", "[TAX-ID]", "[NATIONAL-ID]", REDACTED, "[CANARY]")
_LLM_PATTERNS = [(p, r) for p, r in _PATTERNS if r not in ("[PHONE]",)]


def scrub_for_llm(text: str) -> str:
    for pattern, repl in _LLM_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def scrub_messages(messages: list[dict]) -> list[dict]:
    """A copy of chat messages with every string content scrubbed; the original list is never modified."""
    out = []
    for m in messages or []:
        content = m.get("content")
        out.append({**m, "content": scrub_for_llm(content)} if isinstance(content, str) else dict(m))
    return out
