"""Server-side pagination for list endpoints (Phase 2, Part D).

Convention (the codebase's most common one):
  * HR / org routes:      ?page=&per_page=   ->  {"items": [...], "total": N, "page": p, "per_page": n}
  * super-admin routes:   ?page=&page_size=  ->  {..., "page_size": n}  (callers pass size_key="page_size")

Backward compatibility: when the caller sends NO paging parameter, the endpoint keeps answering with the plain list it
always returned, so no existing page breaks. That legacy list is capped at LEGACY_LIST_CAP rows (newest/first rows win
per the endpoint's ordering) and a warning is logged when the cap cuts rows off, so an unbounded table can no longer
produce an unbounded response. The cap is deliberately well above what today's pages show, so they are unaffected.
"""
import logging
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

logger = logging.getLogger("zoiko.pagination")

DEFAULT_PER_PAGE = 25
MAX_PER_PAGE = 200
LEGACY_LIST_CAP = 1000

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int


def wants_page(page: Optional[int], per_page: Optional[int]) -> bool:
    return page is not None or per_page is not None


def legacy_list(query, label: str, cap: int = LEGACY_LIST_CAP) -> list:
    """The un-paged list, capped. Logs when rows were cut off."""
    rows = query.limit(cap + 1).all()
    if len(rows) > cap:
        logger.warning("[pagination] %s returned the %d-row cap without paging params; pass page/per_page to see the rest.",
                       label, cap)
        rows = rows[:cap]
    return rows


def page_of(query, page: Optional[int], per_page: Optional[int], *, count: bool = True, size_key: str = "per_page") -> dict:
    """One page plus paging metadata. The total is a single COUNT over the unordered query; count=False skips it
    (total is then -1) for callers that only need next/previous."""
    page = max(int(page or 1), 1)
    size = min(max(int(per_page or DEFAULT_PER_PAGE), 1), MAX_PER_PAGE)
    rows = query.offset((page - 1) * size).limit(size).all()
    total = query.order_by(None).count() if count else -1
    return {"items": rows, "total": total, "page": page, size_key: size}


def list_or_page(query, page: Optional[int], per_page: Optional[int], *, label: str, serialize=None, size_key: str = "per_page"):
    """Plain capped list when no paging params were sent; otherwise a page dict. `serialize` maps each row."""
    if not wants_page(page, per_page):
        rows = legacy_list(query, label)
        return [serialize(r) for r in rows] if serialize else rows
    out = page_of(query, page, per_page, size_key=size_key)
    if serialize:
        out["items"] = [serialize(r) for r in out["items"]]
    return out
