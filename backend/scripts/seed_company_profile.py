"""
Load an organisation's onboarding-package data (Company Profile, Engagement / Role Profiles, clause wording) from a JSON file.

    python scripts/seed_company_profile.py --org-id 12                     # apply scripts/seed_data/zoiko_industries.json
    python scripts/seed_company_profile.py --org-id 12 --dry-run           # print the differences, change nothing
    python scripts/seed_company_profile.py --org-id 12 --file other.json

Idempotent: running it twice changes nothing the second time. Values go through the same validation as the Settings screens,
so an invalid value stops the run before anything is written. Every change is audited like a Settings save (actor: system).
Organisation-specific wording lives in the JSON — never in platform code.
"""
import argparse
import json
import os
import sys
from types import SimpleNamespace

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

DEFAULT_FILE = os.path.join(BACKEND, "scripts", "seed_data", "zoiko_industries.json")


def _diff(label: str, before: dict, after: dict) -> list[str]:
    lines = []
    for key in sorted(set(before) | set(after)):
        if key.startswith("_") or key == "slug":
            continue
        if before.get(key) != after.get(key):
            lines.append(f"  {label}.{key}: {before.get(key)!r} -> {after.get(key)!r}")
    return lines


def plan(db, org_id: int, data: dict) -> list[str]:
    """The changes applying `data` would make, one line each (empty: nothing to do)."""
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_profiles as PR
    out = []
    profile = CP.get_profile(db, org_id)
    out += _diff("company", {k: profile.get(k) for k in data.get("company", {})}, data.get("company", {}))
    engagements = {p["slug"]: p for p in PR.engagement_profiles(db, org_id)}
    for e in data.get("engagement_profiles", []):
        cur = engagements.get(e["slug"], {})
        out += _diff(f"engagement[{e['slug']}]", {k: cur.get(k) for k in e}, e)
    roles = {p["slug"]: p for p in PR.role_profiles(db, org_id)}
    for r in data.get("role_profiles", []):
        cur = roles.get(r["slug"], {})
        out += _diff(f"role[{r['slug']}]", {k: cur.get(k) for k in r}, r)
    clauses = P.get_config(db, org_id).get("clauses") or {}
    for key, val in (data.get("clauses") or {}).items():
        cur = clauses.get(key) or {}
        want = {"text": val.get("text", ""), "counsel_reference": val.get("counsel_reference", ""),
                "not_applicable": bool(val.get("not_applicable"))}
        out += _diff(f"clause[{key}]", {k: cur.get(k) for k in want}, want)
    return out


def apply(db, org_id: int, data: dict) -> list[str]:
    from app.modules.hr import company_profile as CP
    from app.modules.hr import onboarding_package as P
    from app.modules.hr import onboarding_profiles as PR
    changes = plan(db, org_id, data)
    if not changes:
        return []
    actor = SimpleNamespace(id=None, organization_id=org_id, first_name="System", last_name="Seed", role="system")
    if data.get("company"):
        CP.save_profile(db, actor, data["company"])
    for e in data.get("engagement_profiles", []):
        PR.save_engagement(db, actor, e["slug"], {k: v for k, v in e.items() if k != "slug"})
    for r in data.get("role_profiles", []):
        PR.save_role(db, actor, r["slug"], {k: v for k, v in r.items() if k != "slug"})
    if data.get("clauses"):
        P.save_config(db, actor, {"clauses": data["clauses"]})
    return changes


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org-id", type=int, required=True)
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    with open(args.file, encoding="utf-8") as f:
        data = json.load(f)
    from app.database import SessionLocal
    from app.modules.hr.models import Organization
    db = SessionLocal()
    try:
        org = db.get(Organization, args.org_id)
        if org is None:
            print(f"Organisation {args.org_id} not found.", file=sys.stderr)
            return 2
        changes = plan(db, args.org_id, data) if args.dry_run else apply(db, args.org_id, data)
        verb = "Would change" if args.dry_run else "Changed"
        print(f"{verb} {len(changes)} value(s) for organisation {args.org_id} ({org.organization_name or org.display_name}):")
        print("\n".join(changes) if changes else "  nothing — already up to date")
        for note in data.get("_pending", []):
            print(f"PENDING: {note}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
