"""Generate docs/templates/field_registry.md from app/modules/doc_templates/fields.py.

    python scripts/doc_templates_field_registry.py          # write the file
    python scripts/doc_templates_field_registry.py --check  # exit 1 when the committed file is out of date

tests/doc_templates/test_dt_docs.py fails when the committed file differs from the generated one.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

OUT = Path(__file__).resolve().parents[2] / "docs" / "templates" / "field_registry.md"


def render() -> str:
    from app.modules.doc_templates import fields
    lines = [
        "# Field registry (generated)",
        "",
        "Generated from `backend/app/modules/doc_templates/fields.py` by `scripts/doc_templates_field_registry.py`. Do not edit by hand.",
        "",
        "Only these keys may appear as `{{key}}` placeholders. An unknown key is rejected when a variant or clause is saved.",
        "Engine-only keys are bound by governance records (HR-DOC family) and are not offered in the template editor.",
        "",
        "| Key | Label | Type | Classification | Engine-only |",
        "|---|---|---|---|---|",
    ]
    for f in sorted(fields.REGISTRY.values(), key=lambda f: f.key):
        lines.append(f"| `{f.key}` | {f.label} | {f.type} | {f.classification.value} | {'yes' if f.system_only else ''} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        sys.exit(0 if current == text else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
