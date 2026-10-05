"""
app/modules/hr/file_storage.py
-----------------------------
Resolving stored upload paths to something the API can actually serve.

Why this module exists (ZHR 44): document uploads record an absolute path in
`hr_documents.file_path`, and that path was written by whichever machine/OS
performed the upload. Rows created on a Linux host store POSIX separators
(`/tmp/uploads/hr_documents/ab12….pdf`); the same app running on Windows
resolves that against the current drive, and rows created on Windows store
mixed separators (`/tmp/uploads\\hr_documents\\ab12….pdf`). A plain
`os.path.exists(stored_path)` therefore 404s for perfectly good files and the
UI shows nothing at all — "Preview not available" or a bare failed request —
with no way for the user to tell a missing file from a broken preview.

`resolve_stored_file` normalizes separators, retries against the current
upload roots, and returns the real path when the file exists. It deliberately
never returns a path for a file that does not exist, and it never returns a
path outside the configured upload roots unless the row already pointed there
(so historical rows keep working).
"""

import os
from pathlib import Path


def _configured_roots() -> list[str]:
    """Upload roots to search when the stored path does not resolve directly."""
    roots = []

    base = os.environ.get("UPLOAD_BASE_DIR") or "/tmp/uploads"
    roots.append(base)

    for env_key in ("HR_DOCUMENT_UPLOAD_DIR", "ONBOARDING_DOCUMENT_UPLOAD_DIR"):
        configured = os.environ.get(env_key)
        if configured:
            roots.append(configured)

    return roots


def _candidates(raw: str) -> list[str]:
    """Ordered candidate paths for a stored value, most likely first."""
    raw = str(raw).strip().strip('"').strip("'")
    if not raw:
        return []

    # Mixed separators are the common case: normalize both directions so the
    # same row works on POSIX and Windows hosts.
    variants = [raw, raw.replace("\\", "/"), raw.replace("/", os.sep).replace("\\", os.sep)]

    # Split a path like "/tmp/uploads/hr_documents/x.pdf" into its segments so
    # it can be re-anchored under each configured upload root when the absolute
    # prefix points at a different machine's filesystem layout.
    segments = [seg for seg in raw.replace("\\", "/").split("/") if seg]

    candidates: list[str] = []
    for variant in variants:
        if variant not in candidates:
            candidates.append(variant)

    for root in _configured_roots():
        root = str(root).replace("\\", "/").rstrip("/")
        if not root or not segments:
            continue
        # Try progressively shorter tails: the stored path may carry more
        # directory levels than the configured root (e.g. legacy
        # /tmp/uploads/hr_documents/x.pdf with UPLOAD_BASE_DIR already pointing
        # at the parent of hr_documents).
        for depth in (3, 2, 1):
            if depth > len(segments):
                continue
            tail = segments[-depth:]
            reanchored = "/".join([root, *tail])
            for variant in (reanchored, reanchored.replace("/", os.sep)):
                if variant not in candidates:
                    candidates.append(variant)

    # Basename alone, in case only the directory layout differs.
    if segments:
        name = segments[-1]
        for root in _configured_roots():
            candidate = os.path.join(str(root), name)
            if candidate not in candidates:
                candidates.append(candidate)

    return candidates


def resolve_stored_file(raw_path) -> str | None:
    """Return a servable absolute path for a stored upload path, or None.

    None means "the file is genuinely not on this host" — the caller should
    answer 404/410 rather than serving a broken response.
    """
    if not raw_path:
        return None

    raw = str(raw_path)
    # Reject traversal outright: a stored value must not be able to climb out
    # of the filesystem when it is echoed into FileResponse.
    if ".." in raw.replace("\\", "/").split("/"):
        return None

    for candidate in _candidates(raw):
        try:
            if os.path.isfile(candidate):
                return os.path.abspath(candidate)
        except (OSError, ValueError):
            continue

    return None


def file_missing(raw_path) -> bool:
    """True when a stored upload path cannot be served on this host."""
    return resolve_stored_file(raw_path) is None


def ensure_upload_dir(directory: str) -> str:
    """Create (if needed) and return an upload directory."""
    Path(directory).mkdir(parents=True, exist_ok=True)
    return directory