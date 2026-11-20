"""Cells written to a CSV or Excel export.

A spreadsheet treats a cell that starts with = + - @ (or a tab / carriage return, which some programs strip first) as a
formula, so a course or certificate named "=HYPERLINK(...)" would run when the export is opened. Text cells that start with
one of those characters get a leading apostrophe, which spreadsheets show as plain text. Numbers, dates and empty cells are
left as they are, so totals and sorting still work.
"""
from __future__ import annotations

from typing import Any, Iterable

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    if isinstance(value, str) and value[:1] in FORMULA_PREFIXES:
        return "'" + value
    return value


def safe_row(values: Iterable[Any]) -> list:
    return [safe_cell(v) for v in values]
