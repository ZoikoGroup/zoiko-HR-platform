"""Generated documentation stays in step with the code."""
import importlib.util
from pathlib import Path

from app.modules.doc_templates import blocks, fields, starters

ROOT = Path(__file__).resolve().parents[3]


def _script():
    spec = importlib.util.spec_from_file_location("dt_field_doc", ROOT / "backend" / "scripts" / "doc_templates_field_registry.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_generated_field_registry_doc_is_in_sync():
    mod = _script()
    assert (ROOT / "docs" / "templates" / "field_registry.md").read_text(encoding="utf-8") == mod.render(), \
        "run: python scripts/doc_templates_field_registry.py"


def test_every_field_has_a_classification_and_known_type():
    types = {"text", "date", "datetime", "money", "number", "list", "bool", "image", "signature", "rows"}
    for f in fields.REGISTRY.values():
        assert f.type in types, f.key
        assert f.classification is not None, f.key


def test_every_starter_is_valid_content():
    for cid, s in starters.STARTERS.items():
        assert blocks.validate_content(s["content"], s["field_contract"], s["clause_rules"]) == [], cid


def test_the_template_docs_exist():
    for name in ("00_discovery.md", "architecture.md", "release_modes.md", "field_registry.md", "operations.md"):
        assert (ROOT / "docs" / "templates" / name).exists(), name
