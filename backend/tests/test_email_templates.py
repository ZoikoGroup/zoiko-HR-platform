"""
Phase 1 acceptance checks for the Zoiko HR email system (Email Communications
System v2.0 §5.2 / §7.1): every template renders from its real sender, extends
the shared layout, carries exactly one Zoiko HR logo from an absolute HTTPS
URL, is escaped, mobile/Outlook/dark-mode safe and free of Zoiko One branding.
"""

import email
import glob
import os
import re

import pytest

from app.config import settings
from app.services import email_service
from email_samples import collect_sample_calls

TEMPLATE_DIR = email_service.TEMPLATE_DIR
ASSET_BASE = "https://app.zoikohr.com/email"

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF\U00002B00-\U00002BFF✅❌⏳⌛]"
)


def _branding(organization_id=None, db=None):
    branding = dict(email_service._BRANDING_DEFAULTS)
    if organization_id:
        branding.update(company_name="Acme Corp", tenant_name="Acme Corp")
    return branding


@pytest.fixture(autouse=True)
def email_env(monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.zoikohr.com")
    monkeypatch.setattr(settings, "HR_EMAIL_ASSET_BASE_URL", ASSET_BASE)
    monkeypatch.setattr(settings, "HR_EMAIL_INLINE_LOGO", False)
    monkeypatch.setattr(email_service, "_get_org_branding", _branding)


def _rendered_samples():
    return [
        (label, template, context, email_service.render_email(template, context, organization_id=org_id))
        for label, template, context, org_id in collect_sample_calls()
    ]


@pytest.fixture
def rendered():
    return _rendered_samples()


def _template_files():
    return sorted(glob.glob(os.path.join(TEMPLATE_DIR, "*.html")))


# ── Coverage & structure ──────────────────────────────────────────────────


def test_every_template_is_rendered_by_a_sender(rendered):
    used = {template for _, template, _, _ in rendered}
    on_disk = {os.path.basename(p) for p in _template_files()}
    assert on_disk, "no email templates found"
    assert on_disk - used == set(), f"templates with no sender sample: {on_disk - used}"


@pytest.mark.parametrize("path", _template_files(), ids=os.path.basename)
def test_template_extends_base_layout(path):
    with open(path, encoding="utf-8") as f:
        source = f.read()
    assert source.startswith('{% extends "_layouts/base.html" %}')
    for forbidden in ("<!DOCTYPE", "<html", "<head", "<body", "{{#if", "{{/if}}"):
        assert forbidden not in source, f"{os.path.basename(path)} contains {forbidden!r}"


# ── Logo ──────────────────────────────────────────────────────────────────


def test_exactly_one_zoiko_hr_logo_per_email(rendered):
    for label, _, _, out in rendered:
        light = re.findall(r'<img class="zhr-logo zhr-logo-light"[^>]*>', out.html)
        assert len(light) == 1, f"{label}: expected exactly one Zoiko HR logo, found {len(light)}"
        img = light[0]
        assert f'src="{ASSET_BASE}/zoikohr-logo-email@2x.png"' in img, label
        assert 'alt="Zoiko HR"' in img, label
        assert 'width="180"' in img and 'height="31"' in img, label
        # alt text is styled so the brand still reads with images blocked
        assert "color:#06508d" in img and "font-size:22px" in img, label
        # the reversed dark-mode variant exists once and is hidden by default
        dark = re.findall(r'<div class="zhr-logo-dark-wrap" style="display:none[^"]*">', out.html)
        assert len(dark) == 1, label
        assert f"{ASSET_BASE}/zoikohr-logo-email-white@2x.png" in out.html, label


def test_logo_never_svg_data_uri_or_relative(rendered):
    for label, _, _, out in rendered:
        for src in re.findall(r'<img[^>]*src="([^"]*)"', out.html):
            assert src.startswith("https://"), f"{label}: non-https img src {src}"
            assert not src.lower().endswith(".svg"), label
        assert "data:image" not in out.html, label


def test_logo_dimensions_match_svg_aspect_ratio():
    assert round(180 * 895.85 / 5241.58) == 31


def test_logo_assets_exist_and_are_small():
    from PIL import Image

    for directory in (
        os.path.join(TEMPLATE_DIR, "assets"),
        os.path.join(os.path.dirname(os.path.dirname(TEMPLATE_DIR)), "..", "frontend", "public", "email"),
    ):
        for name in (email_service.LOGO_FILE, email_service.LOGO_DARK_FILE):
            path = os.path.join(directory, name)
            assert os.path.exists(path), path
            assert os.path.getsize(path) < 15 * 1024, path
            with Image.open(path) as img:
                assert img.width == 360
                assert img.format == "PNG"


def test_asset_base_falls_back_to_https_host(monkeypatch):
    monkeypatch.setattr(settings, "HR_EMAIL_ASSET_BASE_URL", "")
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:5173")
    assert email_service.email_asset_base() == "https://app.zoikohr.com/email"
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://staging.zoikohr.com/")
    assert email_service.email_asset_base() == "https://staging.zoikohr.com/email"


def test_tenant_logo_is_secondary_cobrand_only(monkeypatch):
    def _with_logo(url):
        return lambda organization_id=None, db=None: {
            **email_service._BRANDING_DEFAULTS, "company_name": "Acme", "tenant_name": "Acme", "logo_url": url,
        }

    context = {"subject": "s", "first_name": "Sam", "document_name": "Doc", "due_at_local": "Oct 1",
               "action_url": "https://app.zoikohr.com/docs"}

    monkeypatch.setattr(email_service, "_get_org_branding", _with_logo("https://cdn.acme.test/logo.png\"><x"))
    html = email_service.render_email("document_assigned.html", context, organization_id=1).html
    assert 'class="zhr-logo zhr-logo-light"' in html  # Zoiko HR logo still present
    assert 'src="https://cdn.acme.test/logo.png&#34;&gt;&lt;x"' in html  # escaped
    assert 'height="24"' in html

    monkeypatch.setattr(email_service, "_get_org_branding", _with_logo("http://insecure.acme.test/logo.png"))
    html = email_service.render_email("document_assigned.html", context, organization_id=1).html
    assert "insecure.acme.test" not in html

    # a caller's context can never override the Zoiko HR logo
    html = email_service.render_email(
        "document_assigned.html", {**context, "logo_src": "https://evil.test/x.png"}, organization_id=1
    ).html
    assert "evil.test" not in html


# ── Brand ─────────────────────────────────────────────────────────────────


def test_no_zoiko_one_branding(rendered):
    for label, _, _, out in rendered:
        for part in (out.subject, out.html, out.text):
            assert "zoiko one" not in part.lower(), label
            assert "zoikoone" not in part.lower(), label
            assert "#FF6B00".lower() not in part.lower(), label


def test_no_zoiko_one_in_email_source():
    paths = _template_files() + glob.glob(os.path.join(TEMPLATE_DIR, "_layouts", "*.html"))
    paths.append(email_service.__file__)
    for path in paths:
        with open(path, encoding="utf-8") as f:
            source = f.read().lower()
        assert "zoiko one" not in source and "zoikoone" not in source, path
        assert "zoikoone_logo" not in source and "logo.png\"" not in source, path


def test_footer_identity_and_no_do_not_reply(rendered):
    for label, _, _, out in rendered:
        assert "Zoiko Tech Inc., a Zoiko Group company" in out.html, label
        assert 'href="https://zoikohr.com/contact"' in out.html, label
        assert "You are receiving" in out.text, label
        assert "do not reply" not in out.html.lower(), label
        # class A–D mail never carries an unsubscribe link
        assert "unsubscribe" not in out.html.lower(), label


def test_unsubscribe_link_only_for_class_e():
    context = {"subject": "s", "first_name": "Sam", "cycle_name": "Q3",
               "action_url": "https://app.zoikohr.com/x"}
    html = email_service.render_email(
        "performance_review_submitted.html",
        {**context, "delivery_class": "E", "unsubscribe_url": "https://app.zoikohr.com/prefs"},
    ).html
    assert "Manage email preferences or unsubscribe" in html
    html = email_service.render_email(
        "performance_review_submitted.html",
        {**context, "delivery_class": "A", "unsubscribe_url": "https://app.zoikohr.com/prefs"},
    ).html
    assert "unsubscribe" not in html.lower()


def _luminance(hex_colour):
    hex_colour = hex_colour.lstrip("#")
    channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast(a, b):
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def test_palette_meets_wcag_contrast():
    primary = email_service.PALETTE["primary"]
    assert _contrast("#ffffff", primary) >= 4.5  # button label on button
    assert _contrast(primary, "#ffffff") >= 3.0  # button against the card
    assert _contrast(primary, "#eef2f6") >= 3.0  # button against the page
    for body_text in ("#0f172a", "#1f2937", "#4b5563"):
        assert _contrast(body_text, "#ffffff") >= 4.5
        assert _contrast(body_text, "#f3f6f9") >= 4.5
    for tone in email_service.BADGE_TONES.values():
        assert _contrast(tone["fg"], tone["bg"]) >= 4.5
        assert _contrast(tone["dark_fg"], tone["dark_bg"]) >= 4.5
    for dark_text in ("#f9fafb", "#e5e7eb", "#cbd5e1"):
        assert _contrast(dark_text, "#111827") >= 4.5


# ── Mobile / client safety ────────────────────────────────────────────────


def test_head_meta_and_client_hooks(rendered):
    required = (
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light dark">',
        '<meta name="supported-color-schemes" content="light dark">',
        '<meta name="x-apple-disable-message-reformatting">',
        "<o:OfficeDocumentSettings>",
        "@media screen and (max-width: 600px)",
        "@media (prefers-color-scheme: dark)",
        "[data-ogsc]",
        "[data-ogsb]",
        ".zhr-logo { width: 150px !important;",
        ".stack { display: block !important; width: 100% !important;",
        ".px { padding-left: 20px !important; padding-right: 20px !important; }",
        "max-width:600px",
    )
    for label, _, _, out in rendered:
        for snippet in required:
            assert snippet in out.html, f"{label}: missing {snippet!r}"


def test_bulletproof_buttons(rendered):
    for label, _, _, out in rendered:
        ctas = re.findall(r'<a class="btn-link" href="([^"]+)"', out.html)
        vml = re.findall(r'<v:roundrect [^>]*href="([^"]+)"', out.html)
        assert ctas == vml, f"{label}: every CTA needs a VML twin"
        for td in re.findall(r'<td align="center" bgcolor="#06508d" style="([^"]*)"', out.html):
            assert "background-color:#06508d" in td, label
        # >=44px tap target: 14px + 20px line-height + 14px
        for style in re.findall(r'<a class="btn-link"[^>]*style="([^"]*)"', out.html):
            assert "padding:14px 28px" in style and "line-height:20px" in style, label


def test_no_fragile_css_or_emoji(rendered):
    for label, _, _, out in rendered:
        assert "linear-gradient" not in out.html, label
        assert ":hover" not in out.html and "transition" not in out.html, label
        assert "box-shadow" not in out.html, label
        assert not EMOJI_RE.search(out.html), f"{label}: emoji in body"
        assert not EMOJI_RE.search(out.subject), f"{label}: emoji in subject"


def test_badge_status_also_in_body_text(rendered):
    for label, _, _, out in rendered:
        match = re.search(r'<span class="badge-\w+"[^>]*>([^<]+)</span>', out.html)
        if not match:
            continue
        badge = match.group(1).strip().lower()
        body_text = email_service._html_to_text(out.html.replace(match.group(0), "")).lower()
        assert badge in body_text, f"{label}: badge {badge!r} not stated in the body"


def test_preheader_hidden_with_spacer(rendered):
    for label, _, _, out in rendered:
        body = out.html.split("<body", 1)[1]
        assert re.search(r'^[^>]*>\s*<div style="display:none;[^"]*">[^<]+</div>\s*<div style="display:none;[^"]*">(&zwnj;&nbsp;)+</div>', body), label


def test_lang_and_dir_follow_locale():
    context = {"subject": "s", "first_name": "Sam", "cycle_name": "Q3", "action_url": "https://app.zoikohr.com/x"}
    html = email_service.render_email("performance_review_submitted.html", {**context, "locale": "ar_SA"}).html
    assert '<html lang="ar-SA" dir="rtl"' in html
    html = email_service.render_email("performance_review_submitted.html", context).html
    assert '<html lang="en" dir="ltr"' in html


# ── Escaping, strictness, plain text ──────────────────────────────────────


def test_values_are_html_escaped():
    html = email_service.render_email("document_assigned.html", {
        "subject": "s", "first_name": "<script>alert(1)</script>", "document_name": 'A "B" & C',
        "due_at_local": "Oct 1", "action_url": "https://app.zoikohr.com/docs?a=1&b=2",
    }).html
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "A &#34;B&#34; &amp; C" in html
    assert 'href="https://app.zoikohr.com/docs?a=1&amp;b=2"' in html


def test_missing_variable_fails_loudly(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "_log_email_delivery", lambda **kw: sent.append(kw))
    ok = email_service.send_approval_email("a@b.test", "document_assigned.html", {"subject": "s", "first_name": "x"})
    assert ok is False
    assert sent[-1]["status"] == "failed"
    assert sent[-1]["error_message"].startswith("render_error")


def test_missing_template_fails_loudly_without_fallback(monkeypatch):
    import smtplib

    logged = []
    monkeypatch.setattr(email_service, "_log_email_delivery", lambda **kw: logged.append(kw))
    monkeypatch.setattr(smtplib, "SMTP_SSL", lambda *a, **k: pytest.fail("must not send"))
    monkeypatch.setattr(smtplib, "SMTP", lambda *a, **k: pytest.fail("must not send"))
    assert email_service.send_approval_email("a@b.test", "does_not_exist.html", {"subject": "s"}) is False
    assert logged[-1]["error_message"] == "template_missing"


def test_plain_text_part_is_clean(rendered):
    for label, _, _, out in rendered:
        assert "{" not in out.text and "}" not in out.text, f"{label}: CSS/template leak in text"
        assert "&zwnj;" not in out.text and "‌" not in out.text, label
        assert "<" not in out.text, label
        for href in re.findall(r'<a class="btn-link" href="([^"]+)"', out.html):
            assert href.replace("&amp;", "&") in out.text, f"{label}: CTA link missing from text"
        heading = re.search(r'<h1[^>]*>(.*?)</h1>', out.html, re.S).group(1)
        assert email_service._html_to_text(heading) in out.text, label
        # the button label must not appear twice (VML block is dropped)
        for button_label in re.findall(r'<a class="btn-link"[^>]*>([^<]+)</a>', out.html):
            assert out.text.count(f"{button_label}:") == 1, label


# ── MIME structure ────────────────────────────────────────────────────────


def _send_and_capture(monkeypatch, **kwargs):
    import smtplib
    from unittest.mock import MagicMock

    server = MagicMock()
    server.__enter__.return_value = server
    monkeypatch.setattr(smtplib, "SMTP_SSL", lambda *a, **k: server)
    monkeypatch.setattr(smtplib, "SMTP", lambda *a, **k: server)
    monkeypatch.setattr(email_service, "_log_email_delivery", lambda **kw: None)
    monkeypatch.setattr(email_service, "_get_smtp_settings", lambda db=None: {
        "host": "smtp.test", "port": "465", "username": "", "password": "",
        "from_email": "notifications@zoikohr.test", "use_tls": "true",
    })
    assert email_service.send_approval_email(**kwargs) is True
    raw = server.sendmail.call_args[0][2]
    return email.message_from_string(raw)


def test_cid_inline_logo_mode(monkeypatch):
    monkeypatch.setattr(settings, "HR_EMAIL_INLINE_LOGO", True)
    msg = _send_and_capture(
        monkeypatch, email="a@b.test", template_name="performance_review_submitted.html",
        context={"subject": "s", "first_name": "Sam", "cycle_name": "Q3", "action_url": "https://app.zoikohr.com/x"},
    )
    assert msg.get_content_type() == "multipart/alternative"
    related = msg.get_payload()[1]
    assert related.get_content_type() == "multipart/related"
    html_part, *images = related.get_payload()
    assert 'src="cid:zoikohr-logo"' in html_part.get_payload(decode=True).decode()
    assert {img["Content-ID"] for img in images} == {"<zoikohr-logo>", "<zoikohr-logo-white>"}


def test_pdf_attachment_uses_multipart_mixed(monkeypatch):
    msg = _send_and_capture(
        monkeypatch, email="a@b.test", template_name="performance_review_submitted.html",
        context={"subject": "s", "first_name": "Sam", "cycle_name": "Q3", "action_url": "https://app.zoikohr.com/x"},
        attachments=[("inv.pdf", b"%PDF-1.4")],
    )
    assert msg.get_content_type() == "multipart/mixed"
    alternative, pdf = msg.get_payload()
    assert alternative.get_content_type() == "multipart/alternative"
    assert [p.get_content_type() for p in alternative.get_payload()] == ["text/plain", "text/html"]
    assert pdf.get_filename() == "inv.pdf"
    assert msg["From"] == "Zoiko HR <notifications@zoikohr.test>"
