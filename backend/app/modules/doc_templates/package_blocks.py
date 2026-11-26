"""The onboarding package's documents in the template engine's block vocabulary.

The 10 package documents used to be Python builders (hr/onboarding_package_content_v2.py) with their own short block names
(``{"t": "p"}``, ``{"t": "hook"}``, ``{"t": "when"}`` …). They are now template content: starter JSON in
``seeds/content/HR-PKG/`` and, per organisation, ordinary template variants that go through review, legal approval and release.

Template content uses the engine's names (``paragraph``, ``heading``, ``clause``, ``signature_block``, ``page_break``,
``include_when`` …) plus the package-only types listed in ``blocks.PACKAGE_BLOCK_TYPES``. This module converts both ways:

* ``to_template(package_blocks)``: builder output → template content (what is stored);
* ``to_package(template_blocks)``: template content → the blocks ``onboarding_package_render`` draws.

``to_package(to_template(x))`` draws exactly what ``x`` draws (tests/hr/test_package_starters_parity.py). Block ids and the
``locked`` flag are template metadata and are dropped on the way to the renderer.
"""
from __future__ import annotations

import copy
from typing import Any

# package short name -> template type, for the simple one-to-one cases
_SAME = ("kv", "notice", "consent", "checks", "textbox", "columns", "toc", "cover", "kpis", "groups", "chart", "activities",
         "anchor", "fields", "letterhead", "table")
META_KEYS = ("id", "locked", "include_when")


def _when(key: str) -> dict:
    return {"field": key, "op": "present"}


# ── package -> template ──────────────────────────────────────────────────────────────────────────────────────────────
def to_template(blocks: list) -> list:
    out: list = []
    for b in blocks or []:
        out += _to_template_one(b)
    return out


def _item_to_template(item: Any):
    """An item inside a section / notice: text stays text, a block is converted (a `when` becomes conditional blocks)."""
    if isinstance(item, dict) and "t" in item:
        return _to_template_one(item)
    return [copy.deepcopy(item)]


def _to_template_one(b: dict) -> list:
    t = b.get("t")
    if t == "when":                               # every block inside carries the condition
        inner = []
        for child in b.get("blocks") or []:
            for c in _to_template_one(child):
                c = dict(c)
                if c.get("include_when"):         # nested when: both must hold
                    c["include_when"] = {"all": [_when(b["key"]), c["include_when"]]}
                else:
                    c["include_when"] = _when(b["key"])
                inner.append(c)
        return inner
    if t in ("h1", "h2", "h3"):
        return [{"type": "heading", "text": b["text"], "level": int(t[1])}]
    if t == "center":
        return [{"type": "heading", "text": b["text"], "level": 1, "style": "center"}]
    if t == "p":
        out = {"type": "paragraph", "text": b["text"]}
        if b.get("style") not in (None, "body"):
            out["style"] = b["style"]
        return [out]
    if t == "note":
        return [{"type": "paragraph", "text": b["text"], "style": "note"}]
    if t in ("bullets", "numbered"):
        return [{"type": "list", "style": "number" if t == "numbered" else "bullet", "items": list(b["items"])}]
    if t == "list":
        return [{"type": "list", "style": "number" if b.get("numbered") else "bullet", "items_from": _src(b["src"])}]
    if t in ("groups", "kpis"):
        return [{"type": t, "items_from": _src(b["src"])}]
    if t == "hook":
        return [{"type": "clause", "key": b["key"]}]
    if t == "signature":
        out = {"type": "signature_block", "rows": [list(r) for r in b["rows"]]}
        if b.get("statement"):
            out["statement"] = b["statement"]
        return [out]
    if t == "pagebreak":
        return [{"type": "page_break"}]
    if t == "clause":                             # a numbered section of an agreement
        items = []
        for i in b.get("items") or []:
            items += _item_to_template(i)
        out = {"type": "section", "num": b.get("num") or "", "title": b.get("title") or "", "items": items}
        if b.get("anchor"):
            out["anchor"] = b["anchor"]
        return [out]
    if t == "notice":
        items = []
        for i in b.get("items") or []:
            items += _item_to_template(i)
        return [{"type": "notice", "items": items}]
    if t == "columns":
        return [{"type": "columns", "left": to_template(b.get("left")), "right": to_template(b.get("right"))}]
    if t in _SAME:
        out = {"type": t, **{k: copy.deepcopy(v) for k, v in b.items() if k != "t"}}
        if t == "table":
            out["columns"] = out.pop("headers")
            for k in ("widths", "total"):
                if out.get(k) is None:
                    out.pop(k, None)
            if not out.get("compact"):
                out.pop("compact", None)
        if t == "checks" and not out.get("hook"):
            out.pop("hook", None)
        return [out]
    raise ValueError(f"unknown package block {t!r}")


def _src(src: str) -> str:
    return src.strip("{} ").strip()


# ── template -> package ──────────────────────────────────────────────────────────────────────────────────────────────
def to_package(blocks: list) -> list:
    """Template content -> renderer blocks. Consecutive blocks with the same condition become one `when` again."""
    out: list = []
    for b in blocks or []:
        if not isinstance(b, dict):
            continue
        cond = b.get("include_when")
        pb = _to_package_one(b)
        if cond:
            pb = _wrap(cond, pb)
            if out and out[-1].get("t") == "when" and out[-1].get("_cond") == cond and pb.get("_cond") == cond:
                out[-1]["blocks"] += pb["blocks"]
                continue
        out.append(pb)
    return [_strip_cond(b) for b in out]


def _wrap(cond: dict, block: dict) -> dict:
    """A block under a condition, as nested `when` blocks (the renderer prints them when the value is set)."""
    if "all" in cond:
        inner = block
        for c in reversed(cond["all"]):
            inner = _wrap(c, inner)
        return {**inner, "_cond": cond}
    key = cond.get("field")
    if cond.get("op") not in ("present", None) or not key:
        raise ValueError(f"package content supports only 'present' conditions, not {cond!r}")
    return {"t": "when", "key": key, "blocks": [block], "_cond": cond}


def _strip_cond(b: dict) -> dict:
    if b.get("t") == "when":
        b = {k: v for k, v in b.items() if k != "_cond"}
        b["blocks"] = [_strip_cond(x) for x in b["blocks"]]
    return b


def _items_to_package(items: list) -> list:
    out = []
    for i in items or []:
        if isinstance(i, dict) and "type" in i:
            pb = _to_package_one(i)
            out.append(_strip_cond(_wrap(i["include_when"], pb)) if i.get("include_when") else pb)
        else:
            out.append(copy.deepcopy(i))
    return out


def _to_package_one(b: dict) -> dict:
    t = b.get("type")
    body = {k: copy.deepcopy(v) for k, v in b.items() if k not in META_KEYS and k != "type"}
    if t == "heading":
        if body.get("style") == "center":
            return {"t": "center", "text": body["text"]}
        return {"t": f"h{int(body.get('level') or 1)}", "text": body["text"]}
    if t == "paragraph":
        if body.get("style") == "note":
            return {"t": "note", "text": body["text"]}
        # "normal" is the editors' name for the renderer's "body" style (a new paragraph block starts as "normal")
        style = body.get("style")
        return {"t": "p", "text": body["text"], "style": "body" if style in (None, "", "normal") else style}
    if t == "list":
        if body.get("items_from"):
            return {"t": "list", "src": "{{%s}}" % body["items_from"], "numbered": body.get("style") == "number"}
        return {"t": "numbered" if body.get("style") == "number" else "bullets", "items": list(body.get("items") or [])}
    if t in ("groups", "kpis"):
        return {"t": t, "src": "{{%s}}" % body["items_from"]}
    if t == "clause":
        return {"t": "hook", "key": body["key"]}
    if t == "signature_block":
        return {"t": "signature", "rows": [list(r) for r in body.get("rows") or []], "statement": body.get("statement")}
    if t == "page_break":
        return {"t": "pagebreak"}
    if t == "section":
        return {"t": "clause", "num": str(body.get("num") or ""), "title": body.get("title") or "",
                "items": _items_to_package(body.get("items")), "anchor": body.get("anchor")}
    if t == "notice":
        return {"t": "notice", "items": _items_to_package(body.get("items"))}
    if t == "columns":
        return {"t": "columns", "left": to_package(body.get("left")), "right": to_package(body.get("right"))}
    if t == "table":
        return {"t": "table", "headers": body.get("columns") or [], "rows": body.get("rows") or [],
                "widths": body.get("widths"), "total": body.get("total"), "compact": bool(body.get("compact"))}
    if t == "checks":
        return {"t": "checks", "label": body.get("label", ""), "options": list(body.get("options") or []), "hook": body.get("hook")}
    if t in _SAME:
        return {"t": t, **body}
    raise ValueError(f"block type {t!r} cannot be used in an onboarding package document")


def normalise(blocks: list) -> list:
    """Package blocks as JSON would hold them (tuples become lists), for comparisons."""
    import json
    return json.loads(json.dumps(blocks))
