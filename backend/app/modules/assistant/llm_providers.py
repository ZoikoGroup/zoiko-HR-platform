"""
modules/assistant/llm_providers.py
-----------------------------------
The LLM provider gateway (M1-11). This is the ONLY module that imports a provider SDK (a test enforces it).

A provider hands llm_client an OpenAI-compatible chat-completions client (`client.chat.completions.create(...)`, with
streaming). llm_client keeps everything provider-neutral: model fallback, redaction, JSON parsing, streaming.

Which provider runs is `HR_LLM_PROVIDER` (default "groq": no behaviour change). Adding one = a class here + a line in
_PROVIDERS; nothing in the assistant changes.
"""
from __future__ import annotations

from typing import Any, Protocol

from app.config import settings


class LLMProvider(Protocol):
    name: str                       # recorded on every model run (ChatModelRun.provider)

    def client(self) -> Any:
        """An OpenAI-compatible client: `.chat.completions.create(**kwargs)`."""
        ...


class GroqProvider:
    name = "groq"

    def __init__(self) -> None:
        self._client = None

    def client(self) -> Any:
        if self._client is None:
            if not settings.GROQ_API_KEY:
                raise RuntimeError("HR_GROQ_API_KEY is not configured.")
            from groq import Groq
            # Without a timeout a stalled connection can hang indefinitely. public_service's ThreadPoolExecutor
            # wrapper stops *waiting* on a hung call but doesn't kill the thread; this bounds the HTTP call itself.
            self._client = Groq(api_key=settings.GROQ_API_KEY, timeout=45.0)
        return self._client


_PROVIDERS: dict[str, type] = {"groq": GroqProvider}
_active: LLMProvider | None = None


def provider_name() -> str:
    """The configured provider's name, without creating a client (no API key needed)."""
    name = (getattr(settings, "LLM_PROVIDER", "") or "groq").strip().lower()
    if name not in _PROVIDERS:
        raise RuntimeError(f"Unknown HR_LLM_PROVIDER {name!r}; expected one of {sorted(_PROVIDERS)}")
    return name


def get_provider() -> LLMProvider:
    global _active
    name = provider_name()
    if _active is None or _active.name != name:
        _active = _PROVIDERS[name]()
    return _active
