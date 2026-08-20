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


def parse_json_response(raw_text: str) -> dict:
    """Shared parsing for both generate_json() and the assembled text from
    stream_json() — one place that defines "did the model return valid
    JSON". Raises ValueError if not; callers must degrade, not guess."""
    text = _CODE_FENCE_RE.sub("", raw_text).strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValueError(f"Model did not return valid JSON: {e}") from e


def generate_json(messages: list[dict], temperature: float = 0.2) -> tuple[dict, ModelRunResult]:
    """Generate and parse a JSON object response. Raises ValueError if the
    model did not return valid JSON — callers must degrade, not guess."""
    result = generate(messages, json_mode=True, temperature=temperature)
    parsed = parse_json_response(result.text)
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


_ANSWER_TEXT_KEY_RE = re.compile(r'"answer_text"\s*:\s*"')


def _find_unescaped_quote(s: str, start: int) -> int | None:
    """Index of the first unescaped '"' at or after `start`, or None if the
    string doesn't close within what's arrived so far (still streaming)."""
    i, n = start, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            if i + 1 >= n:
                return None  # trailing lone backslash — incomplete escape, wait for more
            i += 2
            continue
        if c == '"':
            return i
        i += 1
    return None


def _best_effort_json_string_decode(segment: str) -> str:
    """Decode a (possibly incomplete) JSON string body. A chunk boundary can
    land mid-escape-sequence (e.g. buffer ends on a lone '\\'); trimming from
    the end until it parses just holds back the last character or two until
    the next chunk completes it, rather than showing a raw escape artifact."""
    candidate = segment
    for _ in range(4):
        try:
            return json.loads('"' + candidate + '"')
        except (json.JSONDecodeError, ValueError):
            if not candidate:
                return ""
            candidate = candidate[:-1]
    return ""


def stream_json(messages: list[dict], temperature: float = 0.2):
    """Streams a JSON-mode completion, incrementally extracting the
    'answer_text' string field's content as it's produced — real progressive
    token reveal, not a replay of an already-finished answer. Yields
    ("delta", text) for each new chunk of decoded answer_text, then a final
    ("done", raw_text, ModelRunResult).

    Best-effort by design: this scans for `"answer_text": "` textually
    rather than running a full incremental JSON parser, so it only emits
    deltas once the model has actually started that field (in the prompted
    schema it's the first key, and Groq follows requested key order in
    practice, but this isn't a language guarantee). If the field is never
    found as a distinct top-level string (e.g. very short/malformed output),
    no deltas fire and the caller parses raw_text once streaming ends —
    identical behavior to the non-streaming generate_json() path, so
    correctness never depends on the field actually being found early."""
    client = _get_client()
    start = time.monotonic()
    completion = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"},
        stream=True,
    )

    raw = ""
    emitted_len = 0
    field_start = None
    field_done = False

    for chunk in completion:
        delta = chunk.choices[0].delta
        if not (delta and delta.content):
            continue
        raw += delta.content
        if field_done:
            continue
        if field_start is None:
            m = _ANSWER_TEXT_KEY_RE.search(raw)
            if m:
                field_start = m.end()
        if field_start is not None:
            end = _find_unescaped_quote(raw, field_start)
            segment = raw[field_start:end] if end is not None else raw[field_start:]
            if end is not None:
                field_done = True
            decoded = _best_effort_json_string_decode(segment)
            if len(decoded) > emitted_len:
                yield ("delta", decoded[emitted_len:])
                emitted_len = len(decoded)

    latency_ms = int((time.monotonic() - start) * 1000)
    result = ModelRunResult(text=raw, prompt_tokens=None, completion_tokens=None, latency_ms=latency_ms)
    yield ("done", raw, result)
