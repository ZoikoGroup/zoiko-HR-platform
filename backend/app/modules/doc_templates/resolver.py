"""The restricted placeholder resolver. Template bodies are content, never code.

Exactly three forms are recognised; everything else, including Jinja/Python syntax such as `{{ ''.__class__ }}` or `{% if %}`,
stays literal text and is HTML-escaped by the renderer like any other text:

    {{path.to.field}}          a registered data field (fields.py)
    {{clause:clause_key}}      a clause from the clause library; its text may hold {{path}} fields but never another clause
    {{required_clause_block}}  every clause in clause_rules.mandatory, in order

`generated_at` is the one registered field without a dot. Nothing here evaluates anything: the parser is a regular expression
and a lookup table.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

_BRACES = re.compile(r"\{\{([^{}]{0,200})\}\}")
_FIELD = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$|^generated_at$")
_CLAUSE = re.compile(r"^clause:([a-z][a-z0-9_]{0,79})$")
REQUIRED_BLOCK = "required_clause_block"


@dataclass(frozen=True)
class Segment:
    kind: str          # text | field | clause | required_block
    value: str


def parse(text: Optional[str]) -> list[Segment]:
    if not text:
        return []
    out: list[Segment] = []
    pos = 0
    for m in _BRACES.finditer(text):
        inner = m.group(1).strip()
        if inner == REQUIRED_BLOCK:
            seg = Segment("required_block", inner)
        elif _CLAUSE.match(inner):
            seg = Segment("clause", _CLAUSE.match(inner).group(1))
        elif _FIELD.match(inner):
            seg = Segment("field", inner)
        else:
            continue                                     # not ours: left in place as literal text
        if m.start() > pos:
            out.append(Segment("text", text[pos:m.start()]))
        out.append(seg)
        pos = m.end()
    if pos < len(text):
        out.append(Segment("text", text[pos:]))
    return _merge(out)


def _merge(segments: list[Segment]) -> list[Segment]:
    merged: list[Segment] = []
    for s in segments:
        if s.kind == "text" and merged and merged[-1].kind == "text":
            merged[-1] = Segment("text", merged[-1].value + s.value)
        else:
            merged.append(s)
    return merged


def field_keys(text: Optional[str]) -> set[str]:
    return {s.value for s in parse(text) if s.kind == "field"}


def clause_keys(text: Optional[str]) -> set[str]:
    return {s.value for s in parse(text) if s.kind == "clause"}


def uses_required_block(text: Optional[str]) -> bool:
    return any(s.kind == "required_block" for s in parse(text))


@dataclass(frozen=True)
class Run:
    """One piece of resolved text. The renderer escapes every run; `kind` only drives styling."""
    text: str
    kind: str = "text"   # text | value | clause


def resolve(text: Optional[str], value_of: Callable[[str], str], clause_text: Callable[[str], Optional[str]],
            required_clause_keys: list[str], *, inside_clause: bool = False) -> list[Run]:
    """Resolve placeholders to runs of plain text.

    value_of(key) -> formatted value ("" when an optional field is empty). clause_text(key) -> the clause's raw text, already
    checked by preflight; None means unresolved, which is a programming error at this point (preflight denies first)."""
    runs: list[Run] = []
    for seg in parse(text):
        if seg.kind == "text":
            runs.append(Run(seg.value))
        elif seg.kind == "field":
            runs.append(Run(value_of(seg.value) or "", "value"))
        elif inside_clause:
            # No recursion: a clause cannot pull in another clause or the required block. Kept as literal text.
            runs.append(Run("{{" + ("clause:" + seg.value if seg.kind == "clause" else seg.value) + "}}"))
        elif seg.kind == "clause":
            body = clause_text(seg.value)
            if body is None:
                raise LookupError(f"CLAUSE_UNRESOLVED:{seg.value}")
            runs += [Run(r.text, "clause" if r.kind == "text" else r.kind)
                     for r in resolve(body, value_of, clause_text, [], inside_clause=True)]
        else:
            for i, key in enumerate(required_clause_keys):
                body = clause_text(key)
                if body is None:
                    raise LookupError(f"CLAUSE_UNRESOLVED:{key}")
                if i:
                    runs.append(Run("\n\n", "clause"))
                runs += [Run(r.text, "clause" if r.kind == "text" else r.kind)
                         for r in resolve(body, value_of, clause_text, [], inside_clause=True)]
    return runs


def plain(runs: list[Run]) -> str:
    return "".join(r.text for r in runs)
