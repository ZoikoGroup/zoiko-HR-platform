"""
Render every email template with sample data and screenshot it.

    python scripts/preview_emails.py                 # HTML + screenshots
    python scripts/preview_emails.py --no-screenshots
    python scripts/preview_emails.py --out ./previews

Writes <out>/<template>.html (+ .txt plain-text part), <out>/index.html and,
unless --no-screenshots, <out>/screenshots/<template>@<width>[-dark|-noimg].png
at 320/375/414/600px (light), plus dark mode and images-off at 375px.
Default <out> is /tmp/email-previews (the system temp dir on Windows).

Logo requests are served from frontend/public/email/ so previews work before
the assets are deployed. Screenshots need the dev-only tools in
scripts/requirements-email-tools.txt (`python -m playwright install chromium`).
"""

import argparse
import html
import os
import sys
import tempfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.join(BACKEND, "tests"))

from app.services import email_service  # noqa: E402
from email_samples import collect_sample_calls  # noqa: E402

ASSET_DIR = os.path.join(os.path.dirname(BACKEND), "frontend", "public", "email")
WIDTHS = (320, 375, 414, 600)
DEFAULT_OUT = "/tmp/email-previews" if os.name != "nt" else os.path.join(tempfile.gettempdir(), "email-previews")


def _sample_branding(organization_id=None, db=None):
    branding = dict(email_service._BRANDING_DEFAULTS)
    if organization_id:
        branding.update(company_name="Acme Corp", tenant_name="Acme Corp")
    return branding


def render_all(out_dir):
    email_service._get_org_branding = _sample_branding
    os.makedirs(out_dir, exist_ok=True)
    rendered = []
    for label, template_name, context, org_id in collect_sample_calls():
        email = email_service.render_email(template_name, context, organization_id=org_id)
        stem = os.path.splitext(template_name)[0]
        if label.startswith("send_quotation_invoice"):
            stem += "__quotation"
        with open(os.path.join(out_dir, f"{stem}.html"), "w", encoding="utf-8") as f:
            f.write(email.html)
        with open(os.path.join(out_dir, f"{stem}.txt"), "w", encoding="utf-8") as f:
            f.write(f"Subject: {email.subject}\n\n{email.text}\n")
        rendered.append((stem, label, email.subject))
    return rendered


def write_index(out_dir, rendered, with_screens):
    rows = []
    for stem, label, subject in rendered:
        shots = ""
        if with_screens:
            shots = " ".join(
                f'<a href="screenshots/{stem}@{w}.png">{w}</a>' for w in WIDTHS
            ) + f' <a href="screenshots/{stem}@375-dark.png">dark</a> <a href="screenshots/{stem}@375-noimg.png">no-img</a>'
        rows.append(
            f"<tr><td><a href=\"{stem}.html\">{html.escape(stem)}</a></td>"
            f"<td>{html.escape(label)}</td><td>{html.escape(subject)}</td>"
            f"<td><a href=\"{stem}.txt\">text</a></td><td>{shots}</td></tr>"
        )
    page = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Zoiko HR email previews</title>"
        "<style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse}"
        "td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:14px}</style></head><body>"
        f"<h1>Zoiko HR email previews ({len(rendered)})</h1><table><tr><th>Template</th><th>Sender</th>"
        "<th>Subject</th><th>Plain text</th><th>Screenshots</th></tr>" + "".join(rows) + "</table></body></html>"
    )
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)


def screenshot_all(out_dir, rendered):
    from playwright.sync_api import sync_playwright

    shot_dir = os.path.join(out_dir, "screenshots")
    os.makedirs(shot_dir, exist_ok=True)

    def _serve_logo(route):
        name = route.request.url.rsplit("/", 1)[-1]
        path = os.path.join(ASSET_DIR, name)
        if os.path.exists(path):
            route.fulfill(path=path, content_type="image/png")
        else:
            route.abort()

    variants = [(w, "light", True, "") for w in WIDTHS] + [
        (375, "dark", True, "-dark"),
        (375, "light", False, "-noimg"),
    ]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, scheme, images, suffix in variants:
            page = browser.new_page(viewport={"width": width, "height": 800}, color_scheme=scheme)
            page.route("**/*.png", _serve_logo if images else (lambda route: route.abort()))
            for stem, _, _ in rendered:
                page.goto("file:///" + os.path.join(out_dir, f"{stem}.html").replace("\\", "/"))
                page.screenshot(path=os.path.join(shot_dir, f"{stem}@{width}{suffix}.png"), full_page=True)
            page.close()
        browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--no-screenshots", action="store_true")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    rendered = render_all(out_dir)
    with_screens = not args.no_screenshots
    if with_screens:
        screenshot_all(out_dir, rendered)
    write_index(out_dir, rendered, with_screens)
    print(f"Rendered {len(rendered)} emails -> {os.path.join(out_dir, 'index.html')}")


if __name__ == "__main__":
    main()
