"""
modules/assistant/llm_client.py
---------------------------------
Thin, provider-neutral wrapper around Groq's chat-completions API — the
"model gateway" referenced by the architecture spec. Swapping providers later
means changing this file only; nothing else in the assistant module talks to
Groq directly.
"""

import json
import logging
import re
import time

from groq import Groq

from app.config import settings

logger = logging.getLogger("zoiko.assistant")

_client = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not settings.GROQ_API_KEY:
            raise RuntimeError("HR_GROQ_API_KEY is not configured.")
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


class ModelRunResult:
    def __init__(self, text: str, prompt_tokens: int | None, completion_tokens: int | None, latency_ms: int):
        self.text = text
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.latency_ms = latency_ms


def generate(messages: list[dict], json_mode: bool = False, temperature: float = 0.2) -> ModelRunResult:
    """Single non-streaming completion. Raises on any provider failure —
    callers must catch and degrade (never fabricate an answer on error)."""
    client = _get_client()
    start = time.monotonic()
    kwargs = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    completion = client.chat.completions.create(**kwargs)
    latency_ms = int((time.monotonic() - start) * 1000)

    choice = completion.choices[0]
    usage = getattr(completion, "usage", None)
    return ModelRunResult(
        text=choice.message.content or "",
        prompt_tokens=getattr(usage, "prompt_tokens", None) if usage else None,
        completion_tokens=getattr(usage, "completion_tokens", None) if usage else None,
        latency_ms=latency_ms,
    )


_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def generate_json(messages: list[dict], temperature: float = 0.2) -> tuple[dict, ModelRunResult]:
    """Generate and parse a JSON object response. Raises ValueError if the
    model did not return valid JSON — callers must degrade, not guess."""
    result = generate(messages, json_mode=True, temperature=temperature)
    text = _CODE_FENCE_RE.sub("", result.text).strip()
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValueError(f"Model did not return valid JSON: {e}") from e
    return parsed, result


def stream(messages: list[dict], temperature: float = 0.2):
    """Yield text deltas as they arrive. Caller is responsible for persisting
    the final assembled text once the stream ends."""
    client = _get_client()
    completion = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in completion:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content
