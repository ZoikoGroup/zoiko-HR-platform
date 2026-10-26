"""
modules/billing/country_policy.py
---------------------------------
Which countries an organization's plan lets it operate in (employees' work country, offers and new hires, legal
entities). A Product decision, enforced here and called from every place those countries are written:

  Core        one country: the organization's registered country, which must be one of the five configured countries
  Advanced    the five configured countries
  Evaluation  the five configured countries (a trial previews Advanced)
  Enterprise  no limit (contract-priced, set per contract)
  no plan     no limit (nothing has been bought yet; same rule the other plan gates use for "not configured")

Existing records are never touched: callers check only a country that is being newly set or changed, so data from
before this rule (or from a downgrade) stays as it is and remains editable. A downgrade to Core is refused while
more than one country is in use (downgrade_blockers.check_country_blocker).
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.core import regions
from app.core.exceptions import BadRequestException

# The five countries the product is configured for (offer-letter starter packs, import templates): US, UK, India,
# Canada, Australia.
CONFIGURED_COUNTRIES: tuple[str, ...] = ("US", "GB", "IN", "CA", "AU")
_CONFIGURED = frozenset(CONFIGURED_COUNTRIES)


def code_of(value: Optional[str]) -> Optional[str]:
    """ISO-2 for a stored country value (a code, a name, or free text naming one), or None when it names none."""
    if not value:
        return None
    return regions.country_code_strict(value) or regions.country_code(value)


def configured_names() -> str:
    names = [regions.country_name(c) or c for c in CONFIGURED_COUNTRIES]
    return ", ".join(names[:-1]) + " and " + names[-1]


def _subscription(db: Session, organization_id: int):
    from app.modules.billing.models import BillingSubscription
    return db.query(BillingSubscription).filter(BillingSubscription.organization_id == organization_id).first()


def plan_of(db: Session, organization_id: int) -> Optional[str]:
    """'core' | 'advanced' | 'enterprise' | 'evaluation' | None (no plan yet)."""
    from app.modules.billing.models import SubscriptionStatus
    sub = _subscription(db, organization_id)
    if sub is None:
        return None
    if sub.status == SubscriptionStatus.EVALUATION:
        return "evaluation"
    code = getattr(sub.plan_code, "value", sub.plan_code)
    return str(code).lower() if code else None


def home_country(db: Session, organization_id: int) -> Optional[str]:
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return code_of(org.country) if org is not None else None


def allowed_countries(db: Session, organization_id: Optional[int], plan: Optional[str] = None) -> Optional[frozenset[str]]:
    """The ISO-2 codes the organization may use, or None for no limit. `plan` overrides the current plan (a downgrade
    target). Core with no (or an unconfigured) registered country allows nothing until the country is set."""
    if organization_id is None:
        return None
    plan = plan if plan is not None else plan_of(db, organization_id)
    if plan == "core":
        home = home_country(db, organization_id)
        return frozenset({home}) if home in _CONFIGURED else frozenset()
    if plan in ("advanced", "evaluation"):
        return _CONFIGURED
    return None


def _refusal(db: Session, organization_id: int, code: str, what: str) -> str:
    name = regions.country_name(code) or code
    plan = plan_of(db, organization_id)
    if plan == "core":
        home = home_country(db, organization_id)
        if home not in _CONFIGURED:
            return (f"{what} cannot be set to {name}. The Core plan covers one country, your organization's registered "
                    f"country, and that must be one of {configured_names()}. Set it in Organization settings, or upgrade "
                    f"to Advanced.")
        return (f"{what} cannot be set to {name}: your Core plan covers one country ({regions.country_name(home)}). "
                f"Upgrade to Advanced to work in {configured_names()}.")
    return (f"{what} cannot be set to {name}: your plan covers {configured_names()}. "
            f"Contact sales about Enterprise for other countries.")


def check_country(db: Session, organization_id: Optional[int], value: Optional[str], what: str = "The work country",
                  previous: Optional[str] = None) -> None:
    """Refuse a country the organization's plan does not include. Nothing to check when the value names no country,
    or when it is the same country as before (`previous`), so existing records stay editable."""
    code = code_of(value)
    if code is None or organization_id is None:
        return
    if previous is not None and code_of(previous) == code:
        return
    allowed = allowed_countries(db, organization_id)
    if allowed is not None and code not in allowed:
        raise BadRequestException(_refusal(db, organization_id, code, what))


def country_refusal(db: Session, organization_id: Optional[int], value: Optional[str], what: str = "The work country") -> Optional[str]:
    """check_country as a message (None = allowed), for per-row reporting such as an import."""
    try:
        check_country(db, organization_id, value, what)
    except BadRequestException as e:
        return e.message
    return None


def countries_in_use(db: Session, organization_id: int) -> set[str]:
    """Countries the organization currently uses: active employees' work country (or country), open offers, open new
    hires and legal entities."""
    from app.modules.employee.models import Employee
    from app.modules.hr.models import OnboardingNewHire, RecruitmentOffer

    used: set[str] = set()

    def add(values: Iterable):
        for v in values:
            c = code_of(v)
            if c:
                used.add(c)

    employees = db.query(Employee.work_country, Employee.country, Employee.status).filter(Employee.organization_id == organization_id).all()
    add((wc or c) for wc, c, status in employees if str(getattr(status, "value", status) or "").lower() not in _FORMER_STATUSES)
    offers = db.query(RecruitmentOffer.work_country, RecruitmentOffer.status).filter(RecruitmentOffer.organization_id == organization_id).all()
    add(wc for wc, status in offers if str(getattr(status, "value", status) or "").lower() not in _CLOSED_OFFER_STATUSES)
    hires = db.query(OnboardingNewHire.work_country, OnboardingNewHire.status).filter(
        OnboardingNewHire.organization_id == organization_id, OnboardingNewHire.is_deleted == False).all()  # noqa: E712
    add(wc for wc, status in hires if (status or "") not in ("completed", "cancelled"))
    try:
        from app.modules.doc_templates.models import EmployerEntity
        add(c for c, status in db.query(EmployerEntity.country, EmployerEntity.status)
            .filter(EmployerEntity.organization_id == organization_id).all() if (status or "active") == "active")
    except Exception:  # the entities table is optional on older databases
        pass
    return used


_FORMER_STATUSES = {"terminated", "resigned", "inactive", "deactivated", "archived"}
_CLOSED_OFFER_STATUSES = {"rejected", "withdrawn", "expired"}


def check_org_country_change(db: Session, organization_id: int, new_value: Optional[str]) -> None:
    """On Core the registered country IS the plan's one country, so changing it must not strand people in another
    country: the new country has to be a configured one and cover everything already in use."""
    if plan_of(db, organization_id) != "core":
        return
    new = code_of(new_value)
    if new is None or new == home_country(db, organization_id):
        return
    if new not in _CONFIGURED:
        raise BadRequestException(f"On the Core plan your organization's country must be one of {configured_names()}.")
    other = sorted(countries_in_use(db, organization_id) - {new})
    if other:
        names = ", ".join(regions.country_name(c) or c for c in other)
        raise BadRequestException(
            f"Your Core plan covers one country, and your organization already has people, offers or legal entities in "
            f"{names}. Move them first, or upgrade to Advanced.")


def downgrade_refusal(db: Session, organization_id: int, target_plan: str) -> Optional[str]:
    """Why the organization cannot move to `target_plan` with the countries it uses now (None = it can)."""
    allowed = allowed_countries(db, organization_id, plan=target_plan)
    if allowed is None:
        return None
    in_use = countries_in_use(db, organization_id)
    current = allowed_countries(db, organization_id)
    already_outside = set() if current is None else in_use - current
    # only what the move would newly strand: data already outside the current plan (from before this rule) does not
    # block a move, so an upgrade is never refused over it
    outside = sorted(in_use - allowed - already_outside)
    if target_plan == "core" and not allowed and in_use:
        return (f"The Core plan covers one country, your organization's registered country, which must be one of "
                f"{configured_names()}. Set the organization's country first.")
    if not outside:
        return None
    names = ", ".join(regions.country_name(c) or c for c in outside)
    if target_plan == "core":
        return (f"The Core plan covers one country ({regions.country_name(next(iter(allowed)))}), but your organization "
                f"has people, offers or legal entities in {names}.")
    return f"The {target_plan.title()} plan covers {configured_names()}, but your organization has people, offers or legal entities in {names}."
