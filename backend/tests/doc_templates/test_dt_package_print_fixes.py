"""Printed-text fixes in the v2 onboarding package: sign-by date, optional rows, note tokens."""
from datetime import date

from app.modules.hr import onboarding_package as P
from app.modules.hr import onboarding_package_render as R


def test_sign_by_date_is_never_after_the_start_date():
    cfg = {"response_days": 7}
    assert P.response_deadline(cfg, date(2026, 12, 1), "2026-11-16") == date(2026, 11, 23)     # well before the start
    assert P.response_deadline(cfg, date(2026, 11, 18), "2026-11-16") == date(2026, 11, 18)    # capped at the start
    assert P.response_deadline(cfg, date(2026, 11, 16), "2026-11-16") == date(2026, 11, 16)    # starts on the issue day
    assert P.response_deadline(cfg, date(2026, 11, 1), "2026-11-16") == date(2026, 11, 23)     # start already past: no cap
    assert P.response_deadline(cfg, None, "2026-11-16") == date(2026, 11, 23)


def _issue_ctx(values):
    return R.RenderContext(mode="issue", values=values)


def test_optional_kv_rows_are_dropped_only_when_unset():
    block = {"t": "kv", "rows": [("Job title", "{{role.title}}"), ("Programme", "{{engagement.programme_name}}")],
             "optional": ["{{engagement.programme_name}}"]}
    out = R.expand([block], _issue_ctx({"role.title": "Python Developer", "engagement.programme_name": None}))
    assert [r[0] for r in out[0]["rows"]] == ["Job title"]
    out = R.expand([block], _issue_ctx({"role.title": "X", "engagement.programme_name": "Zoiko Ascend"}))
    assert [r[0] for r in out[0]["rows"]] == ["Job title", "Programme"]
    tpl = R.expand([block], R.RenderContext(mode="template"))           # the template set shows every row
    assert len(tpl[0]["rows"]) == 2


def test_v2_documents_render_without_raw_tokens_or_double_stops():
    import re
    from pypdf import PdfReader
    import io
    from app.modules.hr import onboarding_package_content as C
    values = {k: f"V-{k}" for k in C.FIELDS}
    values.update({"company.velocity_motto": "We set the rhythm", "company.governing_law": "the laws of India",
                   "engagement.assessment_months": 6})
    for cat in ("velocity_report", "employment_contract", "nda"):
        pdf = R.render_pdf(cat, _issue_ctx(values))
        text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
        assert "{{company.velocity_motto}}" not in text
        assert not re.search(r"governed by the laws of India\.\.", text)
