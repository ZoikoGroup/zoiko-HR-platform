"""app.core.spreadsheet: the one helper every CSV / Excel export uses against formula injection (audit L14)."""
import csv
import io
from datetime import date
from decimal import Decimal

from app.core.spreadsheet import safe_cell, safe_row


def test_text_starting_with_a_formula_character_gets_an_apostrophe():
    for text in ("=1+1", "+1", "-1+2", "@SUM(A1)", "\tx", "\rx", '=HYPERLINK("http://x","y")'):
        assert safe_cell(text) == "'" + text


def test_everything_else_is_left_alone():
    for value in ("Laptop", "", "a=b", "1-2", None, 5, -5, 2.5, Decimal("-1.50"), date(2026, 1, 1), True):
        assert safe_cell(value) == value


def test_safe_row_and_the_older_helpers_agree():
    from app.modules.doc_templates.governance import _csv_safe as governance_csv_safe
    from app.modules.hr.attendance_service import _csv_safe as attendance_csv_safe
    assert safe_row(["=x", "ok", 3]) == ["'=x", "ok", 3]
    assert governance_csv_safe("=x") == attendance_csv_safe("=x") == "'=x"
    out = io.StringIO()
    csv.writer(out).writerow(safe_row(["=cmd|' /C calc'!A0"]))
    assert out.getvalue().startswith("'=cmd")

