"""
core/html_sanitizer.py
----------------------
Allow-list HTML sanitizer (stdlib only) for rich notification bodies.

Defence in depth: bodies are cleaned here on write AND again in the browser
(DOMPurify) on render. Anything not explicitly allowed is dropped: unknown tags
are unwrapped (their text survives), script/style/iframe-like elements are
removed together with their content, every attribute outside the allow-list
(all ``on*`` handlers, ``style``, ``srcdoc`` ...) is removed, and link targets
must be http(s)/mailto.
"""

from __future__ import annotations

import re
from html import escape
from html.parser import HTMLParser

ALLOWED_TAGS = {
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
    "blockquote", "code", "pre", "span", "div", "h1", "h2", "h3", "h4", "a",
}
# Dropped with everything inside them.
DROP_CONTENT_TAGS = {
    "script", "style", "iframe", "object", "embed", "applet", "template",
    "noscript", "svg", "math", "form", "textarea", "select", "option",
    "head", "title", "link", "meta", "base", "frame", "frameset",
}
VOID_TAGS = {"br", "hr"}
ALLOWED_ATTRS = {"a": {"href", "title"}}
_SAFE_HREF = re.compile(r"^(https?:|mailto:)", re.IGNORECASE)
_CONTROL_CHARS = re.compile(r"[\x00-\x20\x7f-\x9f]+")


def _safe_href(value: str) -> bool:
    # Browsers ignore whitespace/control chars inside the scheme ("java\tscript:").
    return bool(_SAFE_HREF.match(_CONTROL_CHARS.sub("", value or "")))


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._open: list[str] = []
        self._drop_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            self._drop_depth += 1
            return
        if self._drop_depth or tag not in ALLOWED_TAGS:
            return
        rendered = []
        for name, value in attrs:
            name = (name or "").lower()
            if name not in ALLOWED_ATTRS.get(tag, ()):
                continue
            if name == "href" and not _safe_href(value or ""):
                continue
            rendered.append(f' {name}="{escape(value or "", quote=True)}"')
        if tag == "a":
            rendered.append(' rel="noopener noreferrer nofollow" target="_blank"')
        self.out.append(f"<{tag}{''.join(rendered)}>")
        if tag not in VOID_TAGS:
            self._open.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS and self._drop_depth:
            self._drop_depth -= 1  # self-closing drop tag has no body

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            if self._drop_depth:
                self._drop_depth -= 1
            return
        if self._drop_depth or tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag in self._open:
            while self._open:
                top = self._open.pop()
                self.out.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data):
        if not self._drop_depth:
            self.out.append(escape(data, quote=False))

    def handle_comment(self, data):  # comments (incl. IE conditionals) are dropped
        return

    def handle_decl(self, decl):
        return

    def handle_pi(self, data):
        return

    def unknown_decl(self, data):
        return

    def close(self):
        super().close()
        while self._open:
            self.out.append(f"</{self._open.pop()}>")


def sanitize_html(value: str | None) -> str:
    if not value:
        return ""
    parser = _Sanitizer()
    parser.feed(value)
    parser.close()
    return "".join(parser.out).strip()


_TAG_RE = re.compile(r"<[^>]*>")


def html_to_text(value: str | None) -> str:
    """Plain-text rendering of sanitised HTML (for previews / message fallback)."""
    cleaned = sanitize_html(value)
    cleaned = re.sub(r"</(p|div|li|h[1-4]|blockquote|pre)>|<br\s*/?>|<hr\s*/?>", "\n", cleaned, flags=re.I)
    from html import unescape
    text = unescape(_TAG_RE.sub("", cleaned))
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()
