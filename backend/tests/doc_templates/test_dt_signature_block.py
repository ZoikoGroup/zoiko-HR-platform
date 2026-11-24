"""QA bug 17: the offer letter's signature block. Every party reads "Name: …" then "Date: …" so the columns line up; the
employer's side names the Company Profile signatory and carries the issue date; the candidate dates their own signature."""
import re

from app.modules.doc_templates import renderer as R

DATA = {"parties": [("employer", ""), ("candidate", "")], "names": {"candidate": "Yashwanth"}, "issued_on": "24 November 2026",
        "employer_name": "Zoiko", "employer_signatory": "Siddhartha Rao", "employer_signatory_title": "Director"}


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", html)).replace("&nbsp;", "_").strip()


def test_the_employer_side_names_the_signatory_and_is_dated_the_issue_day():
    s = R._signature_parts(DATA, "employer", "")
    assert (s["name"], s["role"], s["date"]) == ("Siddhartha Rao", "Director", "24 November 2026")
    assert s["label"] == "For and on behalf of Zoiko"


def test_the_candidate_is_named_and_dates_their_own_signature():
    s = R._signature_parts(DATA, "candidate", "")
    assert (s["name"], s["date"]) == ("Yashwanth", "")


def test_both_columns_read_name_then_date():
    text = _text(R._html_signatures(DATA))
    assert "Name: Siddhartha Rao Director Date: 24 November 2026" in text
    assert "Name: Yashwanth Date: _" in text
    assert text.count("Name:") == 2 and text.count("Date:") == 2


def test_without_a_signatory_the_employer_name_is_a_line_to_complete():
    data = {**DATA, "employer_signatory": "", "employer_signatory_title": ""}
    text = _text(R._html_signatures(data))
    assert "Name: _ Date: 24 November 2026" in text
