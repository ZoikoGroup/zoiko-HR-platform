"""
Email service for sending approval workflow notifications and Billing module emails.
Templates are Jinja2 files in app/email_templates/ that all extend
_layouts/base.html (shared Zoiko HR header/logo, mobile-safe layout, footer).
Rendering uses autoescape + StrictUndefined: values are HTML-escaped and a
missing variable fails the send loudly instead of rendering a blank field.
Uses SMTP settings from PlatformSetting table (falls back to app.config.settings).
The SMTP password is read only from app.config.settings (.env), never from the DB.
"""

import os
import re
import html as _html
import ssl
import smtplib
import logging
from dataclasses import dataclass
from urllib.parse import urlparse

import certifi
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateNotFound
from markupsafe import Markup

from app.config import settings as _app_settings

logger = logging.getLogger("zoiko")

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "email_templates")

# Production app host. Used as the logo asset host when FRONTEND_URL is not a
# public https origin (local dev), so emails never embed localhost images.
PRODUCTION_APP_URL = "https://app.zoikohr.com"

# Raster logo assets built by scripts/build_email_assets.py. Aspect ratio of
# the source SVG is 5241.58:895.85 -> 180x31 display size (360px @2x file).
LOGO_FILE = "zoikohr-logo-email@2x.png"
LOGO_DARK_FILE = "zoikohr-logo-email-white@2x.png"
_LOGO_CIDS = {LOGO_FILE: "zoikohr-logo", LOGO_DARK_FILE: "zoikohr-logo-white"}

# Zoiko HR brand palette (from the logo). White text on primary is 8.3:1 and
# primary on white is 8.3:1 — both clear WCAG 2.2 AA for text (4.5:1) and
# non-text/button (3:1). Accents are decorative only (never carry text).
PALETTE = {
    "primary": "#06508d",
    "accent_cyan": "#4bc5d4",
    "accent_gold": "#eec23b",
}

FONT_STACK = Markup("-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif")

# Inline styles for body copy in child templates (style="{{ S.p }}"). Kept
# inline because many clients strip or ignore <style>.
EMAIL_STYLES = {
    "h1": Markup(f"margin:0 0 16px 0;font-family:{FONT_STACK};font-size:24px;line-height:30px;font-weight:700;color:#0f172a;"),
    "p": Markup(f"margin:0 0 16px 0;font-family:{FONT_STACK};font-size:16px;line-height:24px;color:#1f2937;"),
    "muted": Markup(f"margin:0 0 16px 0;font-family:{FONT_STACK};font-size:14px;line-height:21px;color:#4b5563;"),
    "strong": Markup("color:#0f172a;font-weight:700;"),
    "link": Markup(f"color:{PALETTE['primary']};text-decoration:underline;"),
}

# Badge / notice tones: fg on bg is >= 4.5:1 in both light and dark schemes.
BADGE_TONES = {
    "success": {"fg": "#065f46", "bg": "#d1fae5", "border": "#6ee7b7", "dark_fg": "#6ee7b7", "dark_bg": "#064e3b"},
    "warning": {"fg": "#92400e", "bg": "#fef3c7", "border": "#fcd34d", "dark_fg": "#fcd34d", "dark_bg": "#78350f"},
    "danger": {"fg": "#991b1b", "bg": "#fee2e2", "border": "#fca5a5", "dark_fg": "#fca5a5", "dark_bg": "#7f1d1d"},
    "info": {"fg": "#06508d", "bg": "#e0f2fe", "border": "#7dd3fc", "dark_fg": "#7dd3fc", "dark_bg": "#0c4a6e"},
    "neutral": {"fg": "#374151", "bg": "#f3f4f6", "border": "#d1d5db", "dark_fg": "#e5e7eb", "dark_bg": "#374151"},
}

_RTL_LANGUAGES = {"ar", "he", "fa", "ur", "yi", "ps", "sd", "ug", "dv", "ku"}

_jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=True,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
_jinja_env.globals.update(
    S=EMAIL_STYLES,
    PALETTE=PALETTE,
    BADGE_TONES=BADGE_TONES,
    FONT_STACK=FONT_STACK,
)

# Subjects are plain text (a mail header), so no HTML escaping — but still
# strict, so a missing variable can't silently produce a broken subject.
_subject_env = Environment(autoescape=False, undefined=StrictUndefined)

_TAG_RE = re.compile(r"<[^>]+>")


class EmailTemplateMissing(Exception):
    """Raised when a template file does not exist (logged as template_missing)."""


@dataclass
class RenderedEmail:
    subject: str
    html: str
    text: str
    inline_images: tuple = ()  # (cid, filename) pairs when CID logo mode is on
    branding: dict = None


def _frontend_url() -> str:
    return (getattr(_app_settings, "FRONTEND_URL", "") or "").strip().rstrip("/")


def _login_url() -> str:
    """Login link for emails, derived from FRONTEND_URL (never a hardcoded
    third-party host)."""
    base = _frontend_url()
    return f"{base}/login" if base else f"{PRODUCTION_APP_URL}/login"


# Kept for importers (e.g. employee router); resolved from FRONTEND_URL.
LOGIN_URL = _login_url()


def _safe_https_url(url) -> str:
    """Return `url` only if it is an absolute https URL with a host, else ""."""
    url = (url or "").strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return ""
    return url


def email_asset_base() -> str:
    """Absolute public HTTPS base URL for email image assets. SVG, data: URIs
    and relative paths are never used (Gmail strips data URIs; clients don't
    render SVG)."""
    configured = (getattr(_app_settings, "HR_EMAIL_ASSET_BASE_URL", "") or "").strip().rstrip("/")
    if configured:
        if not _safe_https_url(configured):
            logger.warning("[email] HR_EMAIL_ASSET_BASE_URL is not an absolute https URL: %s", configured)
        return configured
    frontend = _frontend_url()
    if _safe_https_url(frontend):
        return f"{frontend}/email"
    return f"{PRODUCTION_APP_URL}/email"


def _layout_context(branding: dict, context: dict) -> dict:
    """Variables owned by the base layout. Applied last so a caller's context
    can never replace the Zoiko HR logo (§5.2 immutable identity)."""
    inline_logo = bool(getattr(_app_settings, "HR_EMAIL_INLINE_LOGO", False))
    base = email_asset_base()

    def _logo(filename):
        return f"cid:{_LOGO_CIDS[filename]}" if inline_logo else f"{base}/{filename}"

    locale = str(context.get("locale") or "en").replace("_", "-")
    primary_lang = locale.split("-")[0].lower()
    return {
        "asset_base": base,
        "logo_src": _logo(LOGO_FILE),
        "logo_dark_src": _logo(LOGO_DARK_FILE),
        "cobrand_logo_url": _safe_https_url(branding.get("logo_url")),
        "tenant_name": branding.get("tenant_name", ""),
        "support_url": _safe_https_url(getattr(_app_settings, "HR_EMAIL_SUPPORT_URL", "")) or "https://zoikohr.com/contact",
        "lang": locale,
        "dir": "rtl" if primary_lang in _RTL_LANGUAGES else "ltr",
        "delivery_class": str(context.get("delivery_class") or "A").upper(),
        "unsubscribe_url": _safe_https_url(context.get("unsubscribe_url")),
    }


def _render_subject(subject: str, context: dict) -> str:
    if "{{" in subject or "{%" in subject:
        subject = _subject_env.from_string(subject).render(context)
    # A subject is a single header line: collapse any whitespace/newlines.
    return re.sub(r"\s+", " ", subject).strip()


def _html_to_text(html: str) -> str:
    """HTML -> plain-text for the multipart 'alternative' part. Drops <head>,
    comments (incl. MSO/VML blocks, so buttons aren't duplicated) and hidden
    blocks (preheader, spacer, dark-mode logo); keeps link targets."""
    text = re.sub(r"(?is)<head\b.*?</head>", "", html)
    text = re.sub(r"(?s)<!--.*?-->", "", text)
    text = re.sub(r'(?is)<div\b[^>]*style="display:none[^"]*"[^>]*>.*?</div>', "", text)
    text = re.sub(r"(?is)<img\b[^>]*>", "", text)

    def _link(match):
        href, label = match.group(1), _TAG_RE.sub("", match.group(2)).strip()
        if not label or label == href or href.startswith("mailto:"):
            return label or href
        return f"{label}: {href}"

    text = re.sub(r'(?is)<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>', _link, text)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>|</h[1-6]>", "\n", text)
    text = _TAG_RE.sub("", text)
    text = _html.unescape(text)
    text = text.replace("‌", "").replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def render_email(
    template_name: str,
    context: dict,
    organization_id=None,
    db=None,
    template_body: str = None,
) -> RenderedEmail:
    """Render subject, HTML and plain-text parts for a template.

    Raises EmailTemplateMissing if the template file doesn't exist, and
    jinja2 UndefinedError if the template references a variable the caller
    didn't supply."""
    branding = _get_org_branding(organization_id, db=db)
    full_context = {**branding, **context}
    full_context.update(_layout_context(branding, context))

    try:
        if template_body is not None:
            template = _jinja_env.from_string(template_body)
        else:
            template = _jinja_env.get_template(template_name)
    except TemplateNotFound as e:
        raise EmailTemplateMissing(template_name) from e

    subject = _render_subject(context.get("subject", "Zoiko HR notification"), full_context)
    html_body = template.render(**full_context)
    inline = ()
    if full_context["logo_src"].startswith("cid:"):
        inline = tuple((cid, filename) for filename, cid in _LOGO_CIDS.items())
    return RenderedEmail(
        subject=subject, html=html_body, text=_html_to_text(html_body),
        inline_images=inline, branding=branding,
    )


def _get_smtp_settings(db=None) -> dict:
    """Read SMTP settings from PlatformSetting table. Returns dict with keys:
    host, port, username, password, from_email, use_tls.
    Falls back to app.config.settings (environment-configured) if the DB is
    unavailable or the platform_settings rows aren't populated.
    The SMTP password is NEVER read from the DB — it comes exclusively from
    app.config.settings (i.e. the .env file / environment).
    """
    from app.config import settings as _settings
    defaults = {
        "host": _settings.SMTP_HOST,
        "port": _settings.SMTP_PORT,
        "username": _settings.SMTP_USERNAME,
        "password": _settings.SMTP_PASSWORD,
        "from_email": _settings.SMTP_FROM_EMAIL,
        "use_tls": _settings.SMTP_USE_TLS,
    }
    try:
        from app.modules.super_admin.models import PlatformSetting

        own_session = False
        if db is None:
            from app.database import SessionLocal
            db = SessionLocal()
            own_session = True
        try:
            settings = db.query(PlatformSetting).filter(
                PlatformSetting.category == "email"
            ).all()
            mapping = {s.key: s.value for s in settings if s.value}
            return {
                "host": mapping.get("smtp_host", defaults["host"]),
                "port": mapping.get("smtp_port", defaults["port"]),
                "username": mapping.get("smtp_username", defaults["username"]),
                "password": defaults["password"],
                "from_email": mapping.get("smtp_from_email", defaults["from_email"]),
                "use_tls": mapping.get("smtp_use_tls", defaults["use_tls"]),
            }
        finally:
            if own_session:
                db.close()
    except Exception as e:
        logger.warning(f"[email] Could not load SMTP settings from DB, using defaults: {e}")
        return defaults


_BRANDING_DEFAULTS = {
    "company_name": "Zoiko HR",
    "tenant_name": "",
    "support_email": "",
    "website": "",
    "logo_url": "",
    "invoice_footer": "",
    "legal_entity": "",
    "billing_address": "",
    "billing_phone": "",
}


def _get_org_branding(organization_id=None, db=None) -> dict:
    """Look up HR Organization branding for organization_id and return the
    template-context branding fields, with safe fallbacks. Returns the
    platform defaults if organization_id is None or the lookup fails.
    `tenant_name` is the organization's own name ("" when there is none);
    `company_name` falls back to "Zoiko HR".
    """
    if not organization_id:
        return dict(_BRANDING_DEFAULTS)
    try:
        own_session = False
        if db is None:
            from app.database import SessionLocal
            db = SessionLocal()
            own_session = True
        try:
            from app.modules.hr.models import Organization
            row = db.query(Organization).filter(Organization.id == organization_id).first()
            tenant_name = (row.organization_name or row.display_name or "").strip() if row else ""
            company_name = tenant_name or _BRANDING_DEFAULTS["company_name"]

            reg_parts = []
            legal_entity = company_name
            if reg_parts:
                legal_entity = f"{company_name} — {', '.join(reg_parts)}"

            addr_parts = [
                row.address, row.city, row.state, row.country,
            ] if row else []
            billing_address = ", ".join(p for p in addr_parts if p)

            return {
                "company_name": company_name,
                "tenant_name": tenant_name,
                "support_email": "",
                "website": row.website or "" if row else "",
                "logo_url": row.logo_url or "" if row else "",
                "invoice_footer": "",
                "legal_entity": legal_entity,
                "billing_address": billing_address,
                "billing_phone": "",
            }
        finally:
            if own_session:
                db.close()
    except Exception as e:
        logger.warning(f"[email] Could not load org branding for organization_id={organization_id}: {e}")
        return dict(_BRANDING_DEFAULTS)


def _log_email_delivery(
    email: str,
    template_name: str,
    subject: str,
    status: str,
    error_message: str = None,
    organization_id: int = None,
    context_data: dict = None,
    db=None,
):
    """Write an EmailDeliveryLog row to the database for delivery audit evidence."""
    try:
        own_session = False
        if db is None:
            from app.database import SessionLocal
            db = SessionLocal()
            own_session = True
        try:
            from app.modules.super_admin.models import EmailDeliveryLog
            log_row = EmailDeliveryLog(
                organization_id=organization_id,
                recipient_email=email,
                template_name=template_name,
                subject=subject[:300] if subject else None,
                status=status,
                error_message=error_message[:1000] if error_message else None,
                context_data={k: str(v) for k, v in (context_data or {}).items() if k not in ("password", "token")},
            )
            db.add(log_row)
            db.commit()
        finally:
            if own_session:
                db.close()
    except Exception as e:
        logger.warning(f"[email] Failed to write EmailDeliveryLog: {e}")


def _build_message(rendered: RenderedEmail, attachments=None) -> MIMEMultipart:
    """multipart/alternative(text, html) — wrapped in multipart/related when
    the logo is CID-inlined, and in multipart/mixed when there are PDFs."""
    alternative = MIMEMultipart("alternative")
    alternative.attach(MIMEText(rendered.text, "plain", "utf-8"))
    html_part = MIMEText(rendered.html, "html", "utf-8")
    if rendered.inline_images:
        related = MIMEMultipart("related")
        related.attach(html_part)
        for cid, filename in rendered.inline_images:
            with open(os.path.join(TEMPLATE_DIR, "assets", filename), "rb") as f:
                image = MIMEImage(f.read(), _subtype="png")
            image.add_header("Content-ID", f"<{cid}>")
            image.add_header("Content-Disposition", "inline", filename=filename)
            related.attach(image)
        alternative.attach(related)
    else:
        alternative.attach(html_part)

    if not attachments:
        return alternative
    mixed = MIMEMultipart("mixed")
    mixed.attach(alternative)
    for filename, data in attachments:
        part = MIMEApplication(data, _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=filename)
        mixed.attach(part)
    return mixed


def send_approval_email(
    email: str,
    template_name: str,
    context: dict,
    db=None,
    organization_id=None,
    attachments=None,
    from_email_override=None,
    from_display_name_override=None,
    template_body: str = None,
) -> bool:
    """Send an email via SMTP with delivery audit logging.

    A missing template or an unrendered variable fails the send (logged and
    recorded as `failed`) — no fallback HTML is ever sent in its place.
    """
    try:
        rendered = render_email(template_name, context, organization_id=organization_id, db=db, template_body=template_body)
    except Exception as e:
        reason = "template_missing" if isinstance(e, EmailTemplateMissing) else f"render_error: {e}"
        logger.error(f"[email] Not sent to {email} | template={template_name} | {reason}")
        _log_email_delivery(
            email=email,
            template_name=template_name,
            subject=context.get("subject"),
            status="failed",
            error_message=reason,
            organization_id=organization_id,
            context_data=context,
            db=db,
        )
        return False

    subject = rendered.subject
    branding = rendered.branding or {}
    smtp = _get_smtp_settings(db=db)

    envelope_from = smtp["from_email"]
    header_from = from_email_override or envelope_from
    to_email = email
    sender_name = from_display_name_override or branding.get("company_name") or "Zoiko HR"
    reply_to = context.get("support_email") or branding.get("support_email")

    msg = _build_message(rendered, attachments)
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{header_from}>"
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to

    try:
        port = int(smtp["port"])
        use_tls = str(smtp.get("use_tls", "true")).strip().lower() in ("1", "true", "yes")
        context_ssl = ssl.create_default_context(cafile=certifi.where())

        if use_tls and port != 465:
            with smtplib.SMTP(smtp["host"], port, timeout=30) as server:
                server.starttls(context=context_ssl)
                if smtp["username"] and smtp["password"]:
                    server.login(smtp["username"], smtp["password"])
                server.sendmail(envelope_from, to_email, msg.as_string())
        else:
            with smtplib.SMTP_SSL(smtp["host"], port, context=context_ssl, timeout=30) as server:
                if smtp["username"] and smtp["password"]:
                    server.login(smtp["username"], smtp["password"])
                server.sendmail(envelope_from, to_email, msg.as_string())

        logger.info(f"[email] Sent to {to_email} | template={template_name}")
        _log_email_delivery(
            email=to_email,
            template_name=template_name,
            subject=subject,
            status="sent",
            organization_id=organization_id,
            context_data=context,
            db=db,
        )
        return True
    except Exception as e:
        logger.error(f"[email] Failed to send to {to_email} | template={template_name} | error={e}")
        _log_email_delivery(
            email=to_email,
            template_name=template_name,
            subject=subject,
            status="failed",
            error_message=str(e),
            organization_id=organization_id,
            context_data=context,
            db=db,
        )
        return False



def send_registration_received(email: str, org_name: str, login_url: str = None, db=None):
    return send_approval_email(email, "registration_received.html", {
        "subject": f"Welcome to Zoiko HR — {org_name}",
        "organization_name": org_name,
        "action_url": login_url or _login_url(),
    }, db=db)


def send_new_organization_created(
    email: str,
    recipient_first_name: str,
    organization_name: str,
    created_at_local: str,
    timezone: str,
    creator_name: str,
    management_url: str,
    db=None,
):
    """Notify a Super Admin that a new organization was created on the platform."""
    return send_approval_email(email, "new_organization_created.html", {
        "subject": f"New Organization Created — {organization_name} | Zoiko HR",
        "recipient_first_name": recipient_first_name,
        "organization_name": organization_name,
        "created_at_local": created_at_local,
        "timezone": timezone,
        "creator_name": creator_name,
        "authenticated_organization_management_page_url": management_url,
    }, db=db)


def send_hr_ticket_created(
    email: str,
    employee_name: str,
    ticket_reference: str,
    issue_summary: str,
    organization_name: str,
    tickets_url: str,
    db=None,
    organization_id=None,
):
    """Notify one org admin that a new HR Assistant support ticket was
    raised. Called once per admin — send_approval_email doesn't support
    multiple recipients, and a per-admin failure (bad address, etc.)
    shouldn't stop the others from being notified."""
    return send_approval_email(email, "hr_ticket_created.html", {
        "subject": f"New HR Support Ticket {ticket_reference} | Zoiko HR",
        "employee_name": employee_name,
        "ticket_reference": ticket_reference,
        "issue_summary": issue_summary,
        "organization_name": organization_name,
        "tickets_url": tickets_url,
    }, db=db, organization_id=organization_id)


def send_leave_request_submitted(
    email: str,
    first_name: str,
    request_reference: str,
    leave_period_display: str,
    leave_request_url: str,
    db=None,
):
    """Notify the employee that their leave request was submitted."""
    return send_approval_email(email, "leave_request_submitted.html", {
        "subject": f"Leave Request {request_reference} Submitted | Zoiko HR",
        "first_name": first_name,
        "request_reference": request_reference,
        "leave_period_display": leave_period_display,
        "leave_request_url": leave_request_url,
    }, db=db)


def send_leave_approved(
    email: str,
    first_name: str,
    request_reference: str,
    leave_period_display: str,
    leave_request_url: str,
    workspace_name: str,
    db=None,
    organization_id=None,
):
    """Notify the employee that their leave request was approved."""
    return send_approval_email(email, "leave_approved.html", {
        "subject": f"Leave Request {request_reference} Approved | Zoiko HR",
        "first_name": first_name,
        "request_reference": request_reference,
        "leave_period_display": leave_period_display,
        "leave_request_url": leave_request_url,
        "workspace_name": workspace_name,
    }, db=db, organization_id=organization_id)


def send_leave_rejected(
    email: str,
    first_name: str,
    request_reference: str,
    leave_request_url: str,
    db=None,
    organization_id=None,
):
    """Notify the employee that their leave request was declined."""
    return send_approval_email(email, "leave_rejected.html", {
        "subject": f"Leave Request {request_reference} Declined | Zoiko HR",
        "first_name": first_name,
        "request_reference": request_reference,
        "leave_request_url": leave_request_url,
    }, db=db, organization_id=organization_id)


def send_approved(
    email: str,
    org_name: str,
    recipient_first_name: str = "",
    login_url: str = None,
    db=None,
    organization_id=None,
):
    return send_approval_email(email, "approved.html", {
        "subject": f"Registration Approved — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "first_name": recipient_first_name or "there",
        "login_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_rejected(
    email: str,
    org_name: str,
    reason: str = "",
    recipient_first_name: str = "",
    action_url: str = None,
    db=None,
    organization_id=None,
):
    return send_approval_email(email, "rejected.html", {
        "subject": f"Registration Rejected — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "first_name": recipient_first_name or "there",
        "reason": reason,
        "action_url": action_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_suspended(
    email: str,
    org_name: str,
    recipient_first_name: str = "",
    action_url: str = None,
    db=None,
    organization_id=None,
):
    return send_approval_email(email, "suspended.html", {
        "subject": f"Account Suspended — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "first_name": recipient_first_name or "there",
        "action_url": action_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_reactivated(
    email: str,
    org_name: str,
    recipient_first_name: str = "",
    event_time_local: str = "",
    timezone: str = "UTC",
    login_url: str = None,
    db=None,
    organization_id=None,
):
    return send_approval_email(email, "reactivated.html", {
        "subject": f"Account Reactivated — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "first_name": recipient_first_name or "there",
        "event_time_local": event_time_local,
        "timezone": timezone,
        "login_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_password_reset(email: str, temp_password: str, first_name: str, db=None, organization_id=None):
    return send_approval_email(email, "password_reset.html", {
        "subject": "Password Reset — {{company_name}}",
        "first_name": first_name,
        "temporary_password": temp_password,
        "login_url": _login_url(),
    }, db=db, organization_id=organization_id)


# ── Registration Quotation Workflow ─────────────────────────────────────────
# quote_sent.html / quote_accepted.html use the simple {{action_url}} +
# {{first_name}} + {{organization_name}} style (single info card, single CTA).

def send_quotation_proposal_email(
    email: str,
    recipient_first_name: str,
    organization_name: str,
    plan_name: str,
    amount_display: str,
    valid_until_display: str,
    decision_url: str,
    db=None,
    organization_id=None,
) -> bool:
    return send_approval_email(email, "quote_sent.html", {
        "subject": f"Your Zoiko HR Quotation for {organization_name}",
        "first_name": recipient_first_name,
        "organization_name": organization_name,
        "plan_name": plan_name,
        "amount": amount_display,
        "proposal_expiry_date": valid_until_display,
        "action_url": decision_url,
    }, db=db, organization_id=organization_id)


def send_quotation_accepted_email(
    email: str,
    recipient_first_name: str,
    organization_name: str,
    quote_number: str,
    amount_display: str,
    audience: str = "registrant",
    db=None,
    organization_id=None,
) -> bool:
    """audience: 'registrant' or 'super_admin' — only changes the message
    wording (branched in the template)."""
    return send_approval_email(email, "quote_accepted.html", {
        "subject": f"Quotation {quote_number} Accepted — {organization_name}",
        "first_name": recipient_first_name,
        "organization_name": organization_name,
        "quote_number": quote_number,
        "amount": amount_display,
        "audience": "super_admin" if audience == "super_admin" else "registrant",
    }, db=db, organization_id=organization_id)


def send_quotation_invoice_email(
    email: str,
    recipient_first_name: str,
    organization_name: str,
    invoice_number: str,
    amount_display: str,
    currency: str,
    due_date_display: str,
    pay_url: str = None,
    db=None,
    organization_id=None,
) -> bool:
    return send_approval_email(email, "invoice_sent.html", {
        "subject": f"Invoice {invoice_number} from {{{{company_name}}}}",
        "first_name": recipient_first_name,
        "organization_name": organization_name,
        "invoice_number": invoice_number,
        "currency": currency,
        "amount": amount_display.replace(f"{currency} ", ""),
        "payment_due_date": due_date_display,
        "action_url": pay_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_invoice_email(
    email: str,
    customer_name: str,
    invoice_number: str,
    issue_date: str,
    due_date: str,
    total_amount: str,
    currency: str = "USD",
    status: str = "Issued",
    balance_due: str = "",
    notes: str = "",
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
    recipient_first_name: str = "",
    line_items: list = None,
    subtotal: str = "",
    tax_amount: str = "",
    amount_paid: str = "",
    reference: str = "",
) -> bool:
    attachments = [(pdf_filename or f"{invoice_number}.pdf", pdf_bytes)] if pdf_bytes else None
    balance_due = balance_due or total_amount
    return send_approval_email(email, "invoice_sent.html", {
        "subject": f"Invoice {invoice_number} from {{{{company_name}}}} — {currency} {balance_due} due {due_date}",
        "login_url": _login_url(),
        "customer_name": customer_name,
        "recipient_first_name": recipient_first_name or customer_name,
        "invoice_number": invoice_number,
        "issue_date": issue_date,
        "due_date": due_date,
        "total_amount": total_amount,
        "currency": currency,
        "status": status,
        "balance_due": balance_due,
        "amount_paid": amount_paid,
        "reference": reference,
        "notes": notes,
        # invoice_sent.html variables (shared with send_quotation_invoice_email)
        "first_name": recipient_first_name or customer_name,
        "organization_name": customer_name,
        "amount": balance_due,
        "payment_due_date": due_date,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id, attachments=attachments)


# ── Billing Module Emails ────────────────────────────────────────────────


def send_subscription_renewed_email(
    email: str,
    customer_name: str,
    subscription_number: str,
    plan_name: str,
    term_start: str,
    term_end: str,
    amount: str,
    currency: str = "USD",
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "subscription_renewed.html", {
        "subject": f"Your {plan_name} subscription was renewed",
        "login_url": _login_url(),
        "customer_name": customer_name,
        "subscription_number": subscription_number,
        "plan_name": plan_name,
        "term_start": term_start,
        "term_end": term_end,
        "amount": amount,
        "currency": currency,
        # subscription_renewed.html variables
        "first_name": customer_name,
        "organization_name": customer_name,
        "effective_date_local": term_start,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id)


def send_past_due_notice_email(
    email: str,
    customer_name: str,
    subscription_number: str,
    plan_name: str,
    days_overdue: str,
    overdue_amount: str,
    currency: str = "USD",
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "past_due_notice.html", {
        "subject": f"Invoice {subscription_number} is overdue",
        "login_url": _login_url(),
        "customer_name": customer_name,
        "subscription_number": subscription_number,
        "plan_name": plan_name,
        "days_overdue": days_overdue,
        "overdue_amount": overdue_amount,
        "currency": currency,
        # past_due_notice.html variables
        "first_name": customer_name,
        "organization_name": customer_name,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id)


def send_payment_receipt_email(
    email: str,
    customer_name: str,
    payment_number: str,
    payment_date: str,
    amount: str,
    currency: str = "USD",
    payment_method: str = "",
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "payment_received.html", {
        "subject": f"Payment received by {{{{company_name}}}}",
        "login_url": _login_url(),
        "customer_name": customer_name,
        "payment_number": payment_number,
        "payment_date": payment_date,
        "amount": amount,
        "currency": currency,
        "payment_method": payment_method,
        # payment_received.html variables
        "first_name": customer_name,
        "invoice_number": payment_number,
        "payment_date_local": payment_date,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id)


def send_refund_email(
    email: str,
    customer_name: str,
    refund_number: str,
    refund_date: str,
    amount: str,
    currency: str = "USD",
    reason: str = "",
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
) -> bool:
    attachments = [(pdf_filename or f"{refund_number}.pdf", pdf_bytes)] if pdf_bytes else None
    return send_approval_email(email, "refund_processed.html", {
        "subject": f"Your refund from {{{{company_name}}}} is complete",
        "login_url": _login_url(),
        "customer_name": customer_name,
        "refund_number": refund_number,
        "refund_date": refund_date,
        "amount": amount,
        "currency": currency,
        "reason": reason,
        # refund_processed.html variables
        "first_name": customer_name,
        "organization_name": customer_name,
        "refund_id": refund_number,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id, attachments=attachments)


# ── Employee / HR Module Emails ──────────────────────────────────────────────


def send_employee_welcome_email(
    email: str,
    employee_name: str = "",
    temporary_password: str = "",
    first_name: str = None,
    workspace_name: str = None,
    organization_id=None,
    db=None,
) -> bool:
    if not workspace_name:
        workspace_name = _get_org_branding(organization_id, db=db).get("company_name") or ""
    return send_approval_email(email, "welcome.html", {
        "subject": f"Welcome to {{{{company_name}}}} — Your Account Is Ready",
        "employee_name": employee_name,
        "first_name": first_name or employee_name,
        "workspace_name": workspace_name,
        "temporary_password": temporary_password,
        "login_url": _login_url(),
    }, db=db, organization_id=organization_id)


# ── Org Admin Security Emails (Rule C: dedicated "Zoiko HR Security" sender) ─


SECURITY_SENDER = "Zoiko HR Security"


def send_org_admin_invite_email(
    email: str,
    first_name: str,
    inviter_name: str,
    workspace_name: str,
    expires_at_local: str,
    timezone: str,
    action_url: str,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_invite.html", {
        "subject": "You have been invited to {{workspace_name}}",
        "first_name": first_name,
        "inviter_name": inviter_name,
        "workspace_name": workspace_name,
        "expires_at_local": expires_at_local,
        "timezone": timezone,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_account_activated_email(
    email: str,
    first_name: str,
    workspace_name: str,
    login_url: str = None,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_account_activated.html", {
        "subject": "Your Zoiko HR account is ready",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "login_url": login_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_password_reset_email(
    email: str,
    first_name: str,
    expires_at_local: str,
    timezone: str,
    action_url: str,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_password_reset.html", {
        "subject": "Reset your Zoiko HR password",
        "first_name": first_name,
        "expires_at_local": expires_at_local,
        "timezone": timezone,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_password_changed_email(
    email: str,
    first_name: str,
    event_time_local: str,
    timezone: str,
    action_url: str = None,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_password_changed.html", {
        "subject": "Your Zoiko HR password was changed",
        "first_name": first_name,
        "event_time_local": event_time_local,
        "timezone": timezone,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_account_locked_email(
    email: str,
    first_name: str,
    action_url: str = None,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_account_locked.html", {
        "subject": "Your Zoiko HR account has been locked",
        "first_name": first_name,
        "email": email,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_access_removed_email(
    email: str,
    first_name: str,
    workspace_name: str,
    effective_date_local: str,
    action_url: str = None,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_access_removed.html", {
        "subject": "Your Zoiko HR workspace access ended",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "effective_date_local": effective_date_local,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_access_changed_email(
    email: str,
    first_name: str,
    workspace_name: str,
    effective_date_local: str,
    action_url: str = None,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_access_changed.html", {
        "subject": "Your Zoiko HR access has changed",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "effective_date_local": effective_date_local,
        "action_url": action_url or _login_url(),
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


_ACCOUNT_STATUS_MESSAGES = {
    "activated": "Your account has been activated and you can now log in to the platform.",
    "deactivated": "Your account has been deactivated. If you believe this is an error, please contact your organization administrator.",
    "suspended": "Your account has been suspended. If you believe this is an error, please contact your organization administrator.",
    "archived": "Your account has been archived and is no longer active. Please contact your organization administrator for details.",
}


def send_employee_account_status_email(
    email: str,
    employee_name: str,
    status: str,
    organization_id=None,
    db=None,
) -> bool:
    status_label = {
        "activated": "Activated",
        "deactivated": "Deactivated",
        "suspended": "Suspended",
        "archived": "Archived",
    }.get(status, status.title())
    return send_approval_email(email, "account_status.html", {
        "subject": f"Your Account Has Been {status_label} — {{{{company_name}}}}",
        "employee_name": employee_name,
        "first_name": employee_name,
        "status": status,
        "status_label": status_label,
        "message": _ACCOUNT_STATUS_MESSAGES.get(
            status,
            "Your account status has been updated by your organization administrator.",
        ),
        "action_url": _login_url() if status == "activated" else "",
    }, db=db, organization_id=organization_id)


_EMPLOYEE_LIFECYCLE_LABELS = {
    "confirmation": ("Probation Confirmed", "Your probation period has been successfully completed and your employment has been confirmed."),
    "promotion": ("Congratulations on Your Promotion", "You have been promoted within the organization."),
    "transfer": ("Transfer Processed", "Your transfer within the organization has been processed."),
    "resignation": ("Resignation Acknowledged", "Your resignation has been recorded."),
    "exit": ("Offboarding Notice", "Your exit from the organization has been processed."),
}


def send_employee_lifecycle_email(
    email: str,
    employee_name: str,
    event_type: str,
    effective_date: str = "",
    details: str = "",
    organization_id=None,
    db=None,
) -> bool:
    label, message = _EMPLOYEE_LIFECYCLE_LABELS.get(
        event_type, (event_type.title(), "Your employee record has been updated.")
    )
    return send_approval_email(email, "employee_lifecycle.html", {
        "subject": f"{label} — {{{{company_name}}}}",
        "employee_name": employee_name,
        "event_type": event_type,
        "event_label": label,
        "message": message,
        "effective_date": effective_date or "",
        "details": details or "",
        "first_name": employee_name,
        "action_url": _login_url(),
    }, db=db, organization_id=organization_id)


# ── Delinquency Notices & Support Access (Section 10 G1–G5, Section 18 O3) ──

# G4 recipient roles: Organization Owner + Billing Contact + Billing Admin
# receive delinquency notices. Enterprise also routes to an assigned Customer
# Success / Account Executive. Normal HR admins/employees are never sent
# financial amounts or billing terms.
_BILLING_RECIPIENT_ROLES = ("billing_admin",)
_OWNER_ROLE = "super_admin"


def _role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def resolve_billing_recipients(db, organization_id: int) -> list[str]:
    """G4: resolve the deduplicated authorized billing recipients for an org:
    the Organization Owner (highest-privilege super_admin, else earliest active
    admin) plus every active Billing Admin. Returns unique emails in stable
    order. Never includes normal HR admins/employees."""
    from app.modules.hr.models import Organization
    from app.modules.employee.models import Employee, UserRole

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        return []

    employees = (
        db.query(Employee)
        .filter(
            Employee.organization_id == organization_id,
            Employee.is_active == True,  # noqa: E712
        )
        .order_by(Employee.created_at.asc())
        .all()
    )

    recipients: list[str] = []
    seen: set[str] = set()

    def _add(email):
        if email and email not in seen:
            seen.add(email)
            recipients.append(email)

    owner = next((e for e in employees if _role_value(e.role) == _OWNER_ROLE), None)
    if owner is None:
        owner = next((e for e in employees if _role_value(e.role) in ("admin", "hr_admin")), None)
    if owner is not None:
        _add(owner.email or owner.work_email)

    for e in employees:
        if _role_value(e.role) in _BILLING_RECIPIENT_ROLES:
            _add(e.email or e.work_email)

    return recipients


def is_enterprise_org(db, organization_id: int) -> bool:
    from app.modules.billing.models import BillingSubscription, PlanCode

    sub = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.organization_id == organization_id)
        .first()
    )
    return bool(sub and sub.plan_code == PlanCode.ENTERPRISE)


def _delinquency_billing_ops_email() -> str:
    """Internal Zoiko HR Billing Operations mailbox for Enterprise CS/AE routing.
    Falls back to the platform support/sender email; configurable via env."""
    try:
        from app.config import settings

        return getattr(settings, "BILLING_OPS_EMAIL", None) or getattr(settings, "SMTP_FROM_EMAIL", "")
    except Exception:
        return ""


DELINQUENCY_STAGE_TEMPLATES = {
    "DAY_10_RESTRICT": ("delinquency_day10.html", "Payment Overdue — Action Required | {{company_name}}"),
    "DAY_20_RESTRICT": ("delinquency_day20.html", "Controlled Service Restriction Applied | {{company_name}}"),
    "DAY_45_TERMINATION": ("delinquency_day45.html", "Termination & Closure Notice | {{company_name}}"),
    "RECOVERED": ("delinquency_recovered.html", "Payment Recovered — Service Restored | {{company_name}}"),
}


def build_delinquency_context(
    stage: str,
    customer_name: str,
    plan_name: str,
    subscription_number: str,
    days_overdue,
    currency: str,
    overdue_amount: str,
    login_url: str = None,
    export_url: str = "",
) -> tuple[str, dict]:
    """Return (template_name, context) for a delinquency stage notice."""
    template, subject = DELINQUENCY_STAGE_TEMPLATES.get(
        stage, ("delinquency_day10.html", "Payment Overdue | {{company_name}}")
    )

    retention_window_days = ""
    if stage == "DAY_45_TERMINATION":
        try:
            from app.modules.billing.delinquency_service import DEFAULT_RETENTION_HOLD_DAYS

            retention_window_days = str(DEFAULT_RETENTION_HOLD_DAYS)
        except Exception:
            retention_window_days = "90"

    login_url = login_url or _login_url()
    return template, {
        "subject": subject,
        "customer_name": customer_name,
        "plan_name": plan_name,
        "subscription_number": subscription_number,
        "days_overdue": str(days_overdue),
        "currency": currency,
        "overdue_amount": overdue_amount,
        "login_url": login_url,
        "export_url": export_url or login_url,
        "retention_window_days": retention_window_days,
    }


def send_delinquency_notice(db, organization_id: int, stage: str, days_overdue: int, amounts: dict | None = None, login_url: str = None, export_url: str = ""):
    """G4/O3: dispatch the correct delinquency notice to the authorized
    billing recipients for the org. `amounts` holds financial detail that is
    only ever rendered for authorized billing contacts (never HR admins)."""
    from app.modules.hr.models import Organization

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    customer_name = org.organization_name or org.display_name or "Your organization" if org else "Your organization"

    plan_name = ""
    subscription_number = ""
    currency = (amounts or {}).get("currency", "USD")
    overdue_amount = (amounts or {}).get("overdue_amount", "0.00")
    try:
        from app.modules.billing.models import BillingSubscription, BillingPlan

        sub = (
            db.query(BillingSubscription)
            .filter(BillingSubscription.organization_id == organization_id)
            .first()
        )
        if sub:
            subscription_number = f"SUB-{sub.id:05d}"
            if sub.plan_code:
                plan_name = str(sub.plan_code.value)
    except Exception:
        pass

    recipients = resolve_billing_recipients(db, organization_id)
    template, context = build_delinquency_context(
        stage,
        customer_name=customer_name,
        plan_name=plan_name,
        subscription_number=subscription_number,
        days_overdue=days_overdue,
        currency=currency,
        overdue_amount=overdue_amount,
        login_url=login_url,
        export_url=export_url,
    )

    sent = 0
    for email in recipients:
        if send_approval_email(email, template, dict(context), db=db, organization_id=organization_id):
            sent += 1

    # Enterprise → also route to assigned Customer Success / Account Executive
    # (fallback: internal Billing Operations mailbox).
    if is_enterprise_org(db, organization_id):
        cs_email = _delinquency_billing_ops_email()
        if cs_email:
            if send_approval_email(cs_email, template, dict(context), db=db, organization_id=organization_id):
                sent += 1

    return {"recipients": recipients, "sent": sent, "stage": stage}


# ── Evaluation milestone reminders (ZHR-COM-ENT-001 Section 8.1) ─────────────
# Sent once per evaluation to conversion_owner (single recipient, unlike the
# resolved billing-recipients list delinquency notices use). Copy constraint:
# none of these may state or imply an automatic charge — the evaluation
# simply ends if no plan is activated first.

def send_evaluation_7_days_remaining(
    email: str, org_name: str, evaluation_ends_at_display: str,
    login_url: str = None, db=None, organization_id=None,
):
    return send_approval_email(email, "evaluation_7_days_remaining.html", {
        "subject": f"7 Days Left in Your Evaluation — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "evaluation_ends_at": evaluation_ends_at_display,
        "login_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_evaluation_2_days_remaining(
    email: str, org_name: str, evaluation_ends_at_display: str,
    login_url: str = None, db=None, organization_id=None,
):
    return send_approval_email(email, "evaluation_2_days_remaining.html", {
        "subject": f"Only 2 Days Left in Your Evaluation — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "evaluation_ends_at": evaluation_ends_at_display,
        "login_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_evaluation_expired(
    email: str, org_name: str, evaluation_ends_at_display: str,
    login_url: str = None, db=None, organization_id=None,
):
    return send_approval_email(email, "evaluation_expired.html", {
        "subject": f"Your Evaluation Has Ended — {org_name} | Zoiko HR",
        "organization_name": org_name,
        "evaluation_ends_at": evaluation_ends_at_display,
        "login_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_support_access_granted_email(
    organization_id: int,
    recipient_email: str,
    grant_duration_hours: int,
    expires_at: str,
    db=None,
):
    """Internal Billing Operations notice that a time-bounded support-access
    grant was issued for an org. Kept minimal — no financial data."""
    try:
        from app.config import settings

        login_url = f"{settings.FRONTEND_URL.rstrip('/')}/super-admin/organizations/{organization_id}" if getattr(settings, "FRONTEND_URL", None) else _login_url()
    except Exception:
        login_url = _login_url()
    return send_approval_email(recipient_email, "support_access_granted.html", {
        "subject": f"Support Access Granted — Org {organization_id} | Zoiko HR",
        "organization_id": str(organization_id),
        "grant_duration_hours": str(grant_duration_hours),
        "expires_at": expires_at,
        "support_url": login_url,
    }, db=db, organization_id=organization_id)


def send_evaluation_started_email(
    email: str, org_name: str, evaluation_end_date: str,
    login_url: str = None, db=None, organization_id=None,
):
    """ZHR-COM-009 Evaluation workspace activated."""
    return send_approval_email(email, "evaluation_started.html", {
        "subject": f"Your Zoiko HR evaluation workspace is ready — {org_name}",
        "organization_name": org_name,
        "evaluation_end_date": evaluation_end_date,
        "action_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_evaluation_halfway_email(
    email: str, org_name: str, evaluation_end_date: str,
    login_url: str = None, db=None, organization_id=None,
):
    """ZHR-COM-010 Evaluation midpoint review."""
    return send_approval_email(email, "evaluation_halfway.html", {
        "subject": f"Zoiko HR evaluation midpoint review — {org_name}",
        "organization_name": org_name,
        "evaluation_end_date": evaluation_end_date,
        "action_url": login_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_document_assigned_email(
    email: str, first_name: str, document_name: str, due_at_local: str,
    action_url: str = None, db=None, organization_id=None,
):
    """ZHR-DOC-001 / ZHR-DOC-007 Document requested/available."""
    return send_approval_email(email, "document_assigned.html", {
        "subject": "A document is required in Zoiko HR",
        "first_name": first_name,
        "document_name": document_name,
        "due_at_local": due_at_local,
        "action_url": action_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_performance_review_assigned_email(
    email: str, first_name: str, cycle_name: str, due_at_local: str,
    action_url: str = None, db=None, organization_id=None,
):
    """ZHR-PER-001 / ZHR-PER-004 Performance review assigned."""
    return send_approval_email(email, "performance_review_assigned.html", {
        "subject": f"Performance review action required — {cycle_name}",
        "first_name": first_name,
        "cycle_name": cycle_name,
        "due_at_local": due_at_local,
        "action_url": action_url or _login_url(),
    }, db=db, organization_id=organization_id)


def send_performance_review_submitted_email(
    email: str, first_name: str, cycle_name: str,
    action_url: str = None, db=None, organization_id=None,
):
    """ZHR-PER-003 Performance review submitted."""
    return send_approval_email(email, "performance_review_submitted.html", {
        "subject": f"Your performance review was submitted — {cycle_name}",
        "first_name": first_name,
        "cycle_name": cycle_name,
        "action_url": action_url or _login_url(),
    }, db=db, organization_id=organization_id)

