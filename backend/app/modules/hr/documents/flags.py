"""Rollout switches of the documents refactor (ZHR-DOCS-ARCH-001 §18.1).

HR_DOCS_V2_FLAGS: unset or "all" = every flag on; "none" = every flag off; otherwise a comma list of the flags that are on
(e.g. "docs_v2_schema,docs_v2_employee_upload"). Read on every call, so an operator can switch a flag without a deploy of
code (a restart picks up the environment).
"""
import os

FLAGS = (
    "docs_v2_schema",
    "docs_v2_employee_upload",
    "docs_v2_admin_employee_docs",
    "docs_v2_company",
    "docs_v2_approvals",
    "docs_v2_employee_tabs",
    "docs_v2_secure_files",
)


def enabled_flags() -> frozenset[str]:
    raw = (os.environ.get("HR_DOCS_V2_FLAGS") or "all").strip().lower()
    if raw in ("", "all", "*"):
        return frozenset(FLAGS)
    if raw in ("none", "off", "0"):
        return frozenset()
    return frozenset(f.strip() for f in raw.split(",") if f.strip() in FLAGS)


def is_docs_v2(flag: str) -> bool:
    return flag in enabled_flags()
