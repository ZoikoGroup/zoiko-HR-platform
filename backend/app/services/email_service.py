"""
Email service for sending approval workflow notifications and Billing module emails.
Templates are stored in app/email_templates/ as HTML files.
Uses SMTP settings from PlatformSetting table (falls back to app.config.settings).
The SMTP password is read only from app.config.settings (.env), never from the DB.
"""

import os
import re
import html as _html
import ssl
import smtplib
import logging
import certifi
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

logger = logging.getLogger("zoiko")

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "email_templates")

_IF_BLOCK_RE = re.compile(r"\{\{#if (\w+)\}\}(.*?)\{\{/if\}\}", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


def _load_template(name: str) -> str:
    """Load an HTML email template from the templates directory."""
    path = os.path.join(TEMPLATE_DIR, name)
    if not os.path.exists(path):
        logger.warning(f"Email template not found: {path}")
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _render_template(template: str, context: dict) -> str:
    """Template renderer: evaluates {{#if key}}...{{/if}} conditional blocks
    (rendered only when context[key] is truthy), then replaces {{key}} with
    the corresponding context value.
    """
    def _eval_if(match):
        key, inner = match.group(1), match.group(2)
        return inner if context.get(key) else ""

    result = _IF_BLOCK_RE.sub(_eval_if, template)
    for key, value in context.items():
        if value is None:
            value = ""
        result = result.replace("{{" + key + "}}", str(value))
    return result


def _html_to_text(html: str) -> str:
    """Small HTML->text conversion used for the multipart 'alternative' plain-text part."""
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", html)
    text = _TAG_RE.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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
    "company_name": "Zoiko One",
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
            company_name = (row.organization_name or row.display_name or "").strip() if row else ""
            if not company_name:
                company_name = _BRANDING_DEFAULTS["company_name"]

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
    """Send an email via SMTP.

    attachments: optional list of (filename, bytes) tuples, attached as
    application/pdf parts.

    from_email_override / from_display_name_override: optional per-org
    "From" identity override (e.g. from Payroll's PayrollEmailSettings).
    Sent through this same shared SMTP connection — not a separate mail
    server. None (the default) preserves the existing platform-wide
    behavior for every current caller.
    template_body: optional raw HTML body that overrides the on-disk
    template. Used by billing flows whose org-level BillingConfiguration
    supplies a custom template (e.g. dunning_email_template /
    final_notice_template) — the branding/context rendering and SMTP
    delivery path stay identical.
    """
    if template_body is not None:
        template = template_body
    else:
        template = _load_template(template_name)
    if not template:
        logger.warning(f"Cannot send email to {email}: template {template_name} not found")
        return False

    branding = _get_org_branding(organization_id, db=db)
    full_context = {**branding, **context}
    body = _render_template(template, full_context)
    smtp = _get_smtp_settings(db=db)

    subject = context.get("subject", "Zoiko One — Notification")
    # Subjects may carry template placeholders (e.g. {{company_name}} resolved
    # from the merged branding context). Render them against full_context so the
    # org identity resolves without a second branding lookup. Existing subjects
    # that contain no "{{" pass through unchanged.
    if "{{" in subject:
        subject = _render_template(subject, full_context)
    # Envelope sender (MAIL FROM) always stays the authenticated SMTP account —
    # most relays (incl. this one) reject or misdeliver mail whose envelope
    # sender doesn't match the logged-in account, and it keeps SPF aligned.
    # from_email_override only changes the visible "From" header, so a tenant
    # can look like the sender to recipients without new SMTP credentials.
    envelope_from = smtp["from_email"]
    header_from = from_email_override or envelope_from
    to_email = email
    sender_name = from_display_name_override or full_context.get("company_name") or "Zoiko One"
    reply_to = full_context.get("support_email")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{header_from}>"
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to
    # "alternative" parts are attached least-preferred first: plain text, then HTML.
    msg.attach(MIMEText(_html_to_text(body), "plain", "utf-8"))
    msg.attach(MIMEText(body, "html", "utf-8"))

    if attachments:
        for filename, data in attachments:
            part = MIMEApplication(data, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

    try:
        port = int(smtp["port"])
        use_tls = str(smtp.get("use_tls", "true")).strip().lower() in ("1", "true", "yes")
        # Use certifi's CA bundle rather than the OS trust store: on several
        # deployment hosts (minimal containers, some Windows setups) the OS
        # store is missing the issuer chain for the SMTP host's certificate,
        # causing CERTIFICATE_VERIFY_FAILED on every send. That exception was
        # being caught below and swallowed to `False`, so invoices looked
        # "sent" while every email silently failed.
        context_ssl = ssl.create_default_context(cafile=certifi.where())

        if use_tls and port != 465:
            # STARTTLS (e.g. port 587): plain connection, then upgrade to TLS.
            with smtplib.SMTP(smtp["host"], port, timeout=30) as server:
                server.starttls(context=context_ssl)
                if smtp["username"] and smtp["password"]:
                    server.login(smtp["username"], smtp["password"])
                server.sendmail(envelope_from, to_email, msg.as_string())
        else:
            # Implicit TLS (e.g. port 465).
            with smtplib.SMTP_SSL(smtp["host"], port, context=context_ssl, timeout=30) as server:
                if smtp["username"] and smtp["password"]:
                    server.login(smtp["username"], smtp["password"])
                server.sendmail(envelope_from, to_email, msg.as_string())

        logger.info(f"[email] Sent to {to_email} | template={template_name}")
        return True
    except Exception as e:
        logger.error(f"[email] Failed to send to {to_email} | template={template_name} | error={e}")
        return False


def send_registration_received(email: str, org_name: str, db=None):
    return send_approval_email(email, "registration_received.html", {
        "subject": f"Registration Received — {org_name} | Zoiko One",
        "organization_name": org_name,
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


LOGIN_URL = "https://zoikoone.com/login"


def send_approved(email: str, org_name: str, login_url: str = LOGIN_URL, db=None):
    return send_approval_email(email, "approved.html", {
        "subject": f"Registration Approved — {org_name} | Zoiko One",
        "organization_name": org_name,
        "login_url": login_url,
    }, db=db)


def send_rejected(email: str, org_name: str, reason: str, db=None):
    return send_approval_email(email, "rejected.html", {
        "subject": f"Registration Rejected — {org_name} | Zoiko One",
        "organization_name": org_name,
        "reason": reason,
    }, db=db)


def send_suspended(email: str, org_name: str, db=None):
    return send_approval_email(email, "suspended.html", {
        "subject": f"Account Suspended — {org_name} | Zoiko One",
        "organization_name": org_name,
    }, db=db)


def send_reactivated(email: str, org_name: str, login_url: str = LOGIN_URL, db=None):
    return send_approval_email(email, "reactivated.html", {
        "subject": f"Account Reactivated — {org_name} | Zoiko One",
        "organization_name": org_name,
        "login_url": login_url,
    }, db=db)


def send_password_reset(email: str, temp_password: str, first_name: str, db=None, organization_id=None):
    return send_approval_email(email, "password_reset.html", {
        "subject": "Password Reset — {{company_name}}",
        "first_name": first_name,
        "temporary_password": temp_password,
        "login_url": LOGIN_URL,
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
        "login_url": LOGIN_URL,
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
        "line_items_html": _render_quote_items_html(line_items, currency),
        "totals_html": _render_invoice_totals_html(subtotal, tax_amount, amount_paid, balance_due, currency),
    }, db=db, organization_id=organization_id, attachments=attachments)


# ── Billing Module Emails ────────────────────────────────────────────────


def _render_quote_items_html(line_items, currency: str = "USD") -> str:
    """Render the quotation line-item rows as email-safe HTML. Values arrive
    pre-formatted from the billing service — the template derives nothing."""
    rows = []
    for item in line_items or []:
        desc = _html.escape(str(item.get("description") or ""))
        qty = _html.escape(str(item.get("quantity") or ""))
        rate = _html.escape(str(item.get("unit_price") or ""))
        amount = _html.escape(str(item.get("total_amount") or ""))
        cell = (
            'padding:9px 0;border-top:1px solid #eaeef2;'
            'font-size:13px;color:#1f2328;vertical-align:top;'
        )
        right = cell + 'text-align:right;white-space:nowrap;'
        rows.append(
            f'<tr>'
            f'<td style="{cell}">{desc}</td>'
            f'<td style="{right}">{qty}</td>'
            f'<td style="{right}">{rate}</td>'
            f'<td style="{right}">{amount}</td>'
            f'</tr>'
        )
    return "".join(rows)


def _render_quote_totals_html(subtotal, discount_amount, tax_amount, total_amount, currency: str = "USD") -> str:
    """Render the quote totals block (subtotal / discount / tax / total) as
    email-safe HTML — matches the blue invoice totals layout."""
    money_cell = 'text-align:right;white-space:nowrap;'
    row = (
        '<td style="padding:4px 0;font-size:13px;color:#57606a;">{label}</td>'
        '<td style="padding:4px 0;font-size:13px;color:#57606a;{money_cell}">{value}</td>'
    )
    rows = []
    line_items = [("Subtotal", subtotal)]
    if discount_amount:
        line_items.append(("Discount", discount_amount))
    line_items.append(("Tax", tax_amount))
    for label, value in line_items:
        rows.append(
            "<tr>" + row.format(label=_html.escape(str(label)), value=_html.escape(str(value or "")), money_cell=money_cell) + "</tr>"
        )
    rows.append(
        f"<tr>"
        '<td style="border-top:1px solid #E2E8F0;margin-top:4px;padding:10px 0 0;'
        'font-size:15px;font-weight:700;color:#2563EB;">'
        f"Total ({_html.escape(str(currency or ''))})</td>"
        '<td style="border-top:1px solid #E2E8F0;margin-top:4px;padding:10px 0 0;'
        'font-size:15px;font-weight:700;color:#2563EB;' + money_cell + '">'
        f"{_html.escape(str(total_amount or ''))}</td>"
        f"</tr>"
    )
    return "".join(rows)


def _render_invoice_totals_html(subtotal, tax_amount, amount_paid, balance_due, currency: str = "USD") -> str:
    """Render the invoice totals block (subtotal / tax / amount paid / balance
    due) as email-safe HTML — matches the ZB-INV-006 preview layout."""
    money_cell = 'text-align:right;white-space:nowrap;'
    row = (
        '<td style="padding:4px 0;font-size:13px;color:#57606a;">{label}</td>'
        '<td style="padding:4px 0;font-size:13px;color:#57606a;{money_cell}">{value}</td>'
    )
    rows = []
    for label, value in (
        ("Subtotal", subtotal),
        ("Tax", tax_amount),
        ("Amount paid", amount_paid),
    ):
        rows.append(
            "<tr>" + row.format(label=_html.escape(str(label)), value=_html.escape(str(value or "")), money_cell=money_cell) + "</tr>"
        )
    rows.append(
        f"<tr>"
        '<td style="border-top:1px solid #E2E8F0;margin-top:4px;padding:10px 0 0;'
        'font-size:15px;font-weight:700;color:#2563EB;">'
        f"Balance due ({_html.escape(str(currency or ''))})</td>"
        '<td style="border-top:1px solid #E2E8F0;margin-top:4px;padding:10px 0 0;'
        'font-size:15px;font-weight:700;color:#2563EB;' + money_cell + '">'
        f"{_html.escape(str(balance_due or ''))}</td>"
        f"</tr>"
    )
    return "".join(rows)


def send_quote_email(
    email: str,
    customer_name: str,
    quote_number: str,
    issue_date: str,
    valid_until: str,
    total_amount: str,
    currency: str = "USD",
    status: str = "Sent",
    notes: str = "",
    recipient_first_name: str = "",
    line_items: list = None,
    subtotal: str = "",
    discount_amount: str = "",
    tax_amount: str = "",
    reference: str = "",
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
) -> bool:
    attachments = [(pdf_filename or f"{quote_number}.pdf", pdf_bytes)] if pdf_bytes else None
    return send_approval_email(email, "quote_sent.html", {
        "subject": f"Estimate {quote_number} from {{{{company_name}}}}",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "recipient_first_name": recipient_first_name or customer_name,
        "quote_number": quote_number,
        "issue_date": issue_date,
        "valid_until": valid_until,
        "total_amount": total_amount,
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "currency": currency,
        "status": status,
        "reference": reference,
        "notes": notes,
        "line_items_html": _render_quote_items_html(line_items, currency),
        "totals_html": _render_quote_totals_html(subtotal, discount_amount, tax_amount, total_amount, currency),
    }, db=db, organization_id=organization_id, attachments=attachments)


def send_dunning_reminder_email(
    email: str,
    customer_name: str,
    invoice_number: str,
    days_overdue: str,
    overdue_amount: str,
    currency: str = "USD",
    late_fee: str = "0",
    organization_id=None,
    db=None,
    template_name: str = "dunning_reminder.html",
    custom_body: str = None,
    subject_override: str = None,
) -> bool:
    return send_approval_email(email, template_name, {
        "subject": subject_override or f"Collection workflow started for invoice {invoice_number}",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "invoice_number": invoice_number,
        "days_overdue": days_overdue,
        "overdue_amount": overdue_amount,
        "currency": currency,
        "late_fee": late_fee,
    }, db=db, organization_id=organization_id, template_body=custom_body)


def send_contract_activated_email(
    email: str,
    customer_name: str,
    contract_number: str,
    start_date: str,
    end_date: str,
    total_amount: str,
    currency: str = "USD",
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "contract_activated.html", {
        "subject": f"Contract {contract_number} activated",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "contract_number": contract_number,
        "start_date": start_date,
        "end_date": end_date,
        "total_amount": total_amount,
        "currency": currency,
    }, db=db, organization_id=organization_id)


def send_contract_renewed_email(
    email: str,
    customer_name: str,
    contract_number: str,
    new_end_date: str,
    total_amount: str,
    currency: str = "USD",
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "contract_renewed.html", {
        "subject": f"Contract {contract_number} renewed",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "contract_number": contract_number,
        "new_end_date": new_end_date,
        "total_amount": total_amount,
        "currency": currency,
    }, db=db, organization_id=organization_id)


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
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "subscription_number": subscription_number,
        "plan_name": plan_name,
        "term_start": term_start,
        "term_end": term_end,
        "amount": amount,
        "currency": currency,
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
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "subscription_number": subscription_number,
        "plan_name": plan_name,
        "days_overdue": days_overdue,
        "overdue_amount": overdue_amount,
        "currency": currency,
    }, db=db, organization_id=organization_id)


def send_collections_notice_email(
    email: str,
    customer_name: str,
    invoice_number: str,
    days_overdue: str,
    overdue_amount: str,
    currency: str = "USD",
    late_fee: str = "0",
    organization_id=None,
    db=None,
    custom_body: str = None,
) -> bool:
    """Final-stage notice used when a debt is escalated to collections. Uses
    the same invoice-friendly reminder layout as dunning (optionally
    overridden by BillingConfiguration.final_notice_template) but under a
    clear 'collections' subject."""
    return send_approval_email(email, "dunning_reminder.html", {
        "subject": f"Collection workflow started for invoice {invoice_number}",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "invoice_number": invoice_number,
        "days_overdue": days_overdue,
        "overdue_amount": overdue_amount,
        "currency": currency,
        "late_fee": late_fee,
    }, db=db, organization_id=organization_id, template_body=custom_body)


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
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "payment_number": payment_number,
        "payment_date": payment_date,
        "amount": amount,
        "currency": currency,
        "payment_method": payment_method,
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
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "refund_number": refund_number,
        "refund_date": refund_date,
        "amount": amount,
        "currency": currency,
        "reason": reason,
    }, db=db, organization_id=organization_id, attachments=attachments)


def send_write_off_email(
    email: str,
    customer_name: str,
    write_off_number: str,
    write_off_date: str,
    amount: str,
    currency: str = "USD",
    reason: str = "",
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
) -> bool:
    attachments = [(pdf_filename or f"{write_off_number}.pdf", pdf_bytes)] if pdf_bytes else None
    return send_approval_email(email, "write_off_executed.html", {
        "subject": f"Write-off decision recorded for {customer_name}",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "write_off_number": write_off_number,
        "write_off_date": write_off_date,
        "amount": amount,
        "currency": currency,
        "reason": reason,
    }, db=db, organization_id=organization_id, attachments=attachments)


# ── Payroll Module Emails ────────────────────────────────────────────────


def _resolve_payroll_send_identity(organization_id, db=None):
    """Look up this org's PayrollEmailSettings from-identity override, if
    any. Returns (from_email, from_display_name), both None when the org
    hasn't configured one (i.e. keep using the platform default)."""
    if not organization_id:
        return None, None
    try:
        from app.modules.payroll.mail.service import resolve_send_identity

        own_session = False
        if db is None:
            from app.database import SessionLocal
            db = SessionLocal()
            own_session = True
        try:
            return resolve_send_identity(db, organization_id)
        finally:
            if own_session:
                db.close()
    except Exception as e:
        logger.warning(f"[email] Could not resolve payroll send identity for org={organization_id}: {e}")
        return None, None


def send_payslip_ready_email(
    email: str,
    employee_name: str,
    pay_period: str,
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
) -> bool:
    from_email, from_display_name = _resolve_payroll_send_identity(organization_id, db=db)
    attachments = [(pdf_filename or "payslip.pdf", pdf_bytes)] if pdf_bytes else None
    return send_approval_email(email, "payslip_ready.html", {
        "subject": f"Your Payslip is Ready — {pay_period} | Zoiko One",
        "employee_name": employee_name,
        "pay_period": pay_period,
    }, db=db, organization_id=organization_id, attachments=attachments,
        from_email_override=from_email, from_display_name_override=from_display_name)


def send_payroll_run_approved_email(
    email: str,
    employee_name: str,
    pay_period: str,
    organization_id=None,
    db=None,
) -> bool:
    from_email, from_display_name = _resolve_payroll_send_identity(organization_id, db=db)
    return send_approval_email(email, "payroll_run_approved.html", {
        "subject": f"Payroll Approved — {pay_period} | Zoiko One",
        "employee_name": employee_name,
        "pay_period": pay_period,
    }, db=db, organization_id=organization_id,
        from_email_override=from_email, from_display_name_override=from_display_name)


def send_update_form_invite_email(
    email: str,
    employee_name: str,
    form_name: str,
    form_link: str,
    expires_at_display: str,
    organization_id=None,
    db=None,
) -> bool:
    """"Send Template" — email an employee a no-login link to fill in a
    data-collection form. Reuses the same SMTP send path as every other
    payroll email; only the template and context differ."""
    from_email, from_display_name = _resolve_payroll_send_identity(organization_id, db=db)
    return send_approval_email(email, "update_form_invite.html", {
        "subject": f"{form_name} — Action Requested | Zoiko One",
        "employee_name": employee_name,
        "form_name": form_name,
        "form_link": form_link,
        "expires_at": expires_at_display,
    }, db=db, organization_id=organization_id,
        from_email_override=from_email, from_display_name_override=from_display_name)


def send_leave_request_received_email(
    email: str,
    employee_name: str,
    start_date: str,
    end_date: str,
    request_code: str,
    organization_id=None,
    db=None,
) -> bool:
    from_email, from_display_name = _resolve_payroll_send_identity(organization_id, db=db)
    return send_approval_email(email, "leave_request_received.html", {
        "subject": f"Leave Request Received — {request_code} | Zoiko One",
        "employee_name": employee_name,
        "start_date": start_date,
        "end_date": end_date,
        "request_code": request_code,
    }, db=db, organization_id=organization_id,
        from_email_override=from_email, from_display_name_override=from_display_name)


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
    from app.config import settings
    login_url = f"{settings.FRONTEND_URL.rstrip('/')}/login"
    return send_approval_email(email, "welcome.html", {
        "subject": f"Welcome to {{{{company_name}}}} — Your Account Is Ready",
        "employee_name": employee_name,
        "first_name": first_name or employee_name,
        "workspace_name": workspace_name,
        "temporary_password": temporary_password,
        "login_url": login_url,
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
        "action_url": action_url,
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_account_activated_email(
    email: str,
    first_name: str,
    workspace_name: str,
    login_url: str = LOGIN_URL,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_account_activated.html", {
        "subject": "Your Zoiko HR account is ready",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "login_url": login_url,
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
        "action_url": action_url,
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_password_changed_email(
    email: str,
    first_name: str,
    event_time_local: str,
    timezone: str,
    action_url: str = LOGIN_URL,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_password_changed.html", {
        "subject": "Your Zoiko HR password was changed",
        "first_name": first_name,
        "event_time_local": event_time_local,
        "timezone": timezone,
        "action_url": action_url,
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_account_locked_email(
    email: str,
    first_name: str,
    action_url: str = LOGIN_URL,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_account_locked.html", {
        "subject": "Your Zoiko HR account has been locked",
        "first_name": first_name,
        "action_url": action_url,
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_access_removed_email(
    email: str,
    first_name: str,
    workspace_name: str,
    effective_date_local: str,
    action_url: str = LOGIN_URL,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_access_removed.html", {
        "subject": "Your Zoiko HR workspace access ended",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "effective_date_local": effective_date_local,
        "action_url": action_url,
        "support_email": "",
    }, db=db, organization_id=organization_id, from_display_name_override=SECURITY_SENDER)


def send_org_admin_access_changed_email(
    email: str,
    first_name: str,
    workspace_name: str,
    effective_date_local: str,
    action_url: str = LOGIN_URL,
    organization_id=None,
    db=None,
) -> bool:
    return send_approval_email(email, "org_admin_access_changed.html", {
        "subject": "Your Zoiko HR access has changed",
        "first_name": first_name,
        "workspace_name": workspace_name,
        "effective_date_local": effective_date_local,
        "action_url": action_url,
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
        "status": status,
        "status_label": status_label,
        "message": _ACCOUNT_STATUS_MESSAGES.get(
            status,
            "Your account status has been updated by your organization administrator.",
        ),
        "login_url": LOGIN_URL if status == "activated" else "",
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
    }, db=db, organization_id=organization_id)


def send_credit_note_email(
    email: str,
    customer_name: str,
    credit_note_number: str,
    issue_date: str,
    total_amount: str,
    currency: str = "USD",
    reason: str = "",
    organization_id=None,
    db=None,
    pdf_bytes: bytes = None,
    pdf_filename: str = None,
) -> bool:
    attachments = [(pdf_filename or f"{credit_note_number}.pdf", pdf_bytes)] if pdf_bytes else None
    return send_approval_email(email, "credit_note_issued.html", {
        "subject": f"Credit note {credit_note_number} from {{{{company_name}}}}",
        "login_url": LOGIN_URL,
        "customer_name": customer_name,
        "credit_note_number": credit_note_number,
        "issue_date": issue_date,
        "total_amount": total_amount,
        "currency": currency,
        "reason": reason,
    }, db=db, organization_id=organization_id, attachments=attachments)
