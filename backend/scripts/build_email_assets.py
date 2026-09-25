"""
Build the raster Zoiko HR logo assets used in transactional email.

Email clients don't render SVG (and Gmail strips base64 data: URIs), so the
header logo is served as a PNG from HR_EMAIL_ASSET_BASE_URL. This script
regenerates those PNGs from the canonical SVG so they stay reproducible:

    python scripts/build_email_assets.py

Outputs (written to both locations):
  - frontend/public/email/          -> served publicly at {FRONTEND_URL}/email/
  - backend/app/email_templates/assets/  -> used for optional CID inline mode

  zoikohr-logo-email@2x.png        360px wide, full colour, for light backgrounds
  zoikohr-logo-email-white@2x.png  360px wide, reversed for dark headers /
                                   dark mode (see VARIANTS)

Requires the dev-only `resvg-py` and `pillow` packages
(see scripts/requirements-email-tools.txt).
"""

import io
import os
import re
import sys

from PIL import Image
import resvg_py

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE_SVG = os.path.join(ROOT, "frontend", "public", "zoikohr-logo-svg.svg")
OUTPUT_DIRS = [
    os.path.join(ROOT, "frontend", "public", "email"),
    os.path.join(ROOT, "backend", "app", "email_templates", "assets"),
]

WIDTH_PX = 360  # displayed at 180px -> 2x for high-DPI screens
MAX_BYTES = 15 * 1024

# Colour substitutions per variant, applied simultaneously (so swaps work).
# The reversed variant can't just recolour the #303030 wordmark: the "ZOIKO"
# letterforms are #06508d navy, which is illegible on a dark header. It swaps
# navy <-> white (the white strokes inside the "O" icon become navy) and turns
# the #303030 trademark white.
VARIANTS = {
    "zoikohr-logo-email@2x.png": {},
    "zoikohr-logo-email-white@2x.png": {
        "#303030": "#FFFFFF",
        "#06508d": "#FFFFFF",
        "#fff": "#06508d",
    },
}


def _render(svg: str) -> bytes:
    png = bytes(resvg_py.svg_to_bytes(svg_string=svg, width=WIDTH_PX))
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    # Palette-quantise with alpha to keep the file well under MAX_BYTES while
    # preserving transparency on both light and dark backgrounds.
    quantised = img.quantize(colors=128, method=Image.Quantize.FASTOCTREE)
    out = io.BytesIO()
    quantised.save(out, format="PNG", optimize=True)
    return out.getvalue()


def main() -> int:
    with open(SOURCE_SVG, "r", encoding="utf-8") as f:
        source = f.read()

    for name, recolour in VARIANTS.items():
        svg = source
        placeholders = {old: f"__ZHR_COLOUR_{i}__" for i, old in enumerate(recolour)}
        for old, token in placeholders.items():
            svg = re.sub(re.escape(old) + r"(?![0-9a-fA-F])", token, svg)
        for old, token in placeholders.items():
            svg = svg.replace(token, recolour[old])
        data = _render(svg)
        if len(data) > MAX_BYTES:
            print(f"ERROR: {name} is {len(data)} bytes (> {MAX_BYTES})", file=sys.stderr)
            return 1
        for out_dir in OUTPUT_DIRS:
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, name), "wb") as f:
                f.write(data)
        w, h = Image.open(io.BytesIO(data)).size
        print(f"{name}: {w}x{h}, {len(data)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
