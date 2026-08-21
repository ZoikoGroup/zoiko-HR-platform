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



# Groq's JSON mode cannot stream at all — verified directly against the live
# API: response_format=json_object + stream=True delivers the entire
# completion as a single SSE chunk regardless of length (measured: 1 chunk
# vs. 408 chunks for the identical prompt without json_mode). So real
# streaming means the model writes its answer as plain text (which does
# stream token-by-token) followed by a delimiter and a small trailing JSON
# metadata block, rather than one JSON object wrapping everything.
META_DELIMITER = "§§META§§"


def stream_text_and_metadata(messages: list[dict], temperature: float = 0.2):
    """Streams the plain-language answer as real per-token deltas, then
    parses a trailing metadata block once the stream ends. Yields
    ("delta", text) for each new chunk of the answer (holding back enough
    of the tail that a partial delimiter match is never shown as visible
    text), then a final ("done", answer_text, metadata_dict_or_None,
    ModelRunResult). metadata_dict is None if the delimiter or its JSON
    never resolved — callers must treat that as malformed output, same as
    generate_json()'s ValueError path, not guess at the missing fields."""
    client = _get_client()
    start = time.monotonic()
    completion = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )

    raw = ""
    emitted_len = 0
    delim_idx = None

    for chunk in completion:
        delta = chunk.choices[0].delta
        if not (delta and delta.content):
            continue
        raw += delta.content

        if delim_idx is None:
            found = raw.find(META_DELIMITER)
            if found != -1:
                delim_idx = found
            else:
                # Hold back a tail long enough to contain a partial
                # delimiter match so a chunk boundary mid-delimiter never
                # leaks as visible text.
                safe_len = max(0, len(raw) - (len(META_DELIMITER) - 1))
                if safe_len > emitted_len:
                    yield ("delta", raw[emitted_len:safe_len])
                    emitted_len = safe_len
                continue

        if emitted_len < delim_idx:
            yield ("delta", raw[emitted_len:delim_idx])
            emitted_len = delim_idx

    latency_ms = int((time.monotonic() - start) * 1000)
    result = ModelRunResult(text=raw, prompt_tokens=None, completion_tokens=None, latency_ms=latency_ms)

    if delim_idx is not None:
        answer_text = raw[:delim_idx].strip()
        meta_raw = raw[delim_idx + len(META_DELIMITER):].strip()
        try:
            metadata = parse_json_response(meta_raw)
        except ValueError:
            metadata = None
        yield ("done", answer_text, metadata, result)
    else:
        # Delimiter never appeared — emit whatever was held back so nothing
        # is silently dropped, but there's no metadata to parse.
        if emitted_len < len(raw):
            yield ("delta", raw[emitted_len:])
        yield ("done", raw.strip(), None, result)
