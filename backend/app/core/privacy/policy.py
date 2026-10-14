"""The central policy decision point (ZHR-PRIV-001 A05, A07, E02, E03, E06, E07, E09).

Every data-plane access is meant to pass through authorize(). The rules, in order:

  1. Default DENY. ALLOW only on a complete positive match.
  2. Any error inside the policy -> DENY with POLICY_ERROR and an alert (fail closed).
  3. Unknown resource type, unknown action, unclassified field, missing tenant, malformed subject -> DENY.
  4. PLATFORM subjects (super admin) are denied for every tenant data-plane resource and every classification above
     PLATFORM_META / TENANT_AGGREGATE. The one place a time-limited, tenant-approved support grant could change that is
     `_evaluate_support_grant`, which denies today (Prompt 2 implements it).
  5. TENANT subjects need a membership in the resource's tenant, then a role that allows the ACTION, then a role that
     allows each field's classification. Fields the role may not see are MASKED, never returned.
  6. Actions never imply each other: read does not give export, download, print or update.
  7. AI agents act with the calling user's scope and never their own.

The decision carries POLICY_VERSION. Bump it on every rule change.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Iterable, Optional

from app.core.privacy import classification as cls
from app.core.privacy.classification import Level
from app.core.privacy.context import PLATFORM, SERVICE, TENANT, correlation_id

POLICY_VERSION = "2026-10-14.1"
AI = "AI"

logger = logging.getLogger("zoiko.privacy")
decision_logger = logging.getLogger("zoiko.privacy.decision")

ACTIONS = frozenset({"list", "read", "search", "count", "create", "update", "delete", "approve", "export", "download", "print", "bulk_read", "impersonate"})
READ_ACTIONS = frozenset({"list", "read", "search", "count", "bulk_read"})
MASK = "••••"

# Reason codes are non-sensitive: they say WHY, never WHAT.
NO_TENANT_MEMBERSHIP = "NO_TENANT_MEMBERSHIP"
PLATFORM_DATA_PLANE_DENIED = "PLATFORM_DATA_PLANE_DENIED"
FIELD_CLASSIFICATION_DENIED = "FIELD_CLASSIFICATION_DENIED"
UNCLASSIFIED_FIELD = "UNCLASSIFIED_FIELD"
UNKNOWN_RESOURCE = "UNKNOWN_RESOURCE"
UNKNOWN_ACTION = "UNKNOWN_ACTION"
ACTION_NOT_PERMITTED = "ACTION_NOT_PERMITTED"
SCOPE_NOT_PERMITTED = "SCOPE_NOT_PERMITTED"
IMPERSONATION_DENIED = "IMPERSONATION_DENIED"
POLICY_ERROR = "POLICY_ERROR"
BAD_SUBJECT = "BAD_SUBJECT"
AUDIENCE_DENIED = "AUDIENCE_DENIED"
AI_NO_CALLER = "AI_NO_CALLER"
ALLOWED = "ALLOWED"


class Role(str, Enum):
    TENANT_OWNER = "TENANT_OWNER"
    TENANT_ADMIN = "TENANT_ADMIN"
    HR_MANAGER = "HR_MANAGER"
    PAYROLL_ADMIN = "PAYROLL_ADMIN"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"
    AGENCY_DELEGATE = "AGENCY_DELEGATE"
    BILLING_ADMIN = "BILLING_ADMIN"          # org-scoped billing authority only (no people data)
    PLATFORM_ADMIN = "PLATFORM_ADMIN"        # the super admin role: control plane only


# existing role string (employee.role) -> policy role
ROLE_MAP = {
    "super_admin": Role.PLATFORM_ADMIN,
    "admin": Role.TENANT_ADMIN,
    "hr_admin": Role.HR_MANAGER,
    "billing_admin": Role.BILLING_ADMIN,
    "manager": Role.MANAGER,
    "employee": Role.EMPLOYEE,
}

ALL_ACTIONS_BUT_IMPERSONATE = ACTIONS - {"impersonate"}
_NON_SECRET = frozenset(l for l in Level if l != Level.SECRET)
_BASIC_AND_BELOW = frozenset({Level.PLATFORM_META, Level.TENANT_AGGREGATE, Level.PERSONAL_BASIC})


@dataclass(frozen=True)
class RoleGrant:
    actions: frozenset
    levels: frozenset                 # classifications this role may see (others are masked)
    scope: str                        # "tenant" | "reports" | "self" | "departments" | "none"


GRANTS: dict[Role, RoleGrant] = {
    Role.TENANT_OWNER: RoleGrant(ALL_ACTIONS_BUT_IMPERSONATE, _NON_SECRET, "tenant"),
    Role.TENANT_ADMIN: RoleGrant(ALL_ACTIONS_BUT_IMPERSONATE, _NON_SECRET, "tenant"),
    # HR admins keep the access they have today (employee records include pay fields). Flagged for a human decision in
    # docs/privacy/roles_matrix.md: separate HR from finance by giving HR_MANAGER only the _BASIC/CONFIDENTIAL levels.
    Role.HR_MANAGER: RoleGrant(ALL_ACTIONS_BUT_IMPERSONATE, _NON_SECRET, "tenant"),
    Role.PAYROLL_ADMIN: RoleGrant(frozenset({"list", "read", "search", "count", "update", "export", "download", "print"}),
                                  frozenset({Level.PLATFORM_META, Level.TENANT_AGGREGATE, Level.PERSONAL_BASIC, Level.FINANCIAL}), "tenant"),
    # a manager sees their reports' people and leave/attendance records (CONFIDENTIAL), never pay (FINANCIAL) or cases (SPECIAL_CATEGORY)
    Role.MANAGER: RoleGrant(frozenset({"list", "read", "search", "count", "approve"}), _BASIC_AND_BELOW | {Level.PERSONAL_CONFIDENTIAL}, "reports"),
    Role.EMPLOYEE: RoleGrant(frozenset({"read", "update", "download", "print", "create"}), _NON_SECRET, "self"),
    Role.AGENCY_DELEGATE: RoleGrant(frozenset({"list", "read", "search"}), _BASIC_AND_BELOW, "departments"),
    Role.BILLING_ADMIN: RoleGrant(frozenset({"list", "read", "update", "create"}), frozenset({Level.PLATFORM_META, Level.TENANT_AGGREGATE}), "tenant"),
}


@dataclass(frozen=True)
class Subject:
    actor_id: Optional[int]
    plane: str
    roles: frozenset = frozenset()
    tenant_ids: frozenset = frozenset()
    person_id: Optional[int] = None                 # the human behind the account
    mfa_verified_at: Optional[float] = None
    session_id: Optional[str] = None
    grant: Optional[object] = None                  # active support grant (Prompt 2)
    report_ids: frozenset = frozenset()             # employee ids that report (directly or indirectly) to this subject
    department_ids: frozenset = frozenset()         # departments an AGENCY_DELEGATE / delegate is limited to
    on_behalf_of: Optional["Subject"] = None        # an AI agent's calling user
    service_scopes: frozenset = frozenset()         # SERVICE identities: "<resource>:<action>" scopes


@dataclass(frozen=True)
class Resource:
    type: str                                       # a tenant table name, e.g. "employees"
    tenant_id: Optional[int]
    entity_id: Optional[int] = None
    department_id: Optional[int] = None
    jurisdiction: Optional[str] = None
    owner_id: Optional[int] = None                  # the employee the record is about
    classification: Optional[Level] = None          # overrides the table default when set


@dataclass(frozen=True)
class Context:
    source: str = "web"                             # web | api | job | ai | integration
    token_audience: Optional[str] = None
    now: Optional[float] = None
    region: Optional[str] = None


@dataclass(frozen=True)
class Decision:
    allow: bool
    reason_code: str
    allowed_fields: tuple = ()
    masked_fields: tuple = ()
    policy_version: str = POLICY_VERSION

    def __bool__(self):
        return self.allow


def deny(reason: str) -> Decision:
    return Decision(False, reason)


# ── audit sink ──────────────────────────────────────────────────────────────────────────────────────────────────────
class AuditSink:
    """Receives decision events. Never receives field values. Prompt 2 replaces the default with the immutable store."""

    def emit(self, event: dict) -> None:  # pragma: no cover - interface
        raise NotImplementedError


class LoggingAuditSink(AuditSink):
    def emit(self, event: dict) -> None:
        decision_logger.info("decision %s", event)


_sink: AuditSink = LoggingAuditSink()
_recent: list[dict] = []          # a small in-memory tail used by tests and the health page; not a store
_RECENT_MAX = 500


def set_audit_sink(sink: AuditSink) -> AuditSink:
    global _sink
    prior, _sink = _sink, sink
    return prior


def recent_decisions() -> list[dict]:
    return list(_recent)


def _emit(subject: Optional[Subject], action: str, resource: Optional[Resource], decision: Decision) -> None:
    try:
        level = None
        if resource is not None:
            base = cls.table_default(resource.type)
            level = base.value if base != cls.UNCLASSIFIED else cls.UNCLASSIFIED
        high = level is not None and level != cls.UNCLASSIFIED and cls.rank(level) > cls.rank(Level.PERSONAL_BASIC)
        if decision.allow and not high:
            return                                    # allows on BASIC-or-below data are not individually recorded
        event = {
            "actor_id": subject.actor_id if subject else None,
            "plane": subject.plane if subject else None,
            "tenant_id": resource.tenant_id if resource else None,
            "action": action,
            "resource_class": level,
            "resource_type": resource.type if resource else None,
            "decision": "ALLOW" if decision.allow else "DENY",
            "reason": decision.reason_code,
            "policy_version": decision.policy_version,
            "correlation_id": correlation_id(),
            "ts": time.time(),
        }
        _recent.append(event)
        del _recent[:-_RECENT_MAX]
        _sink.emit(event)
    except Exception:  # an audit failure must not turn a DENY into an ALLOW, nor crash the request
        logger.exception("privacy decision event could not be recorded")


# ── support grants (Prompt 2) ───────────────────────────────────────────────────────────────────────────────────────
def _evaluate_support_grant(subject: Subject, action: str, resource: Resource, fields: Iterable[str], context: Context) -> Optional[Decision]:
    """THE hook for time-limited, tenant-approved support grants. Returns None (no grant applies) today.

    Prompt 2 implements it: it must return an allow Decision only for a grant that is active, approved by the tenant,
    bound to this actor and this resource scope, within its action and field limits, and with fresh MFA. Anything else
    returns None and the platform denial below stands."""
    return None


# ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _table_columns(table: str) -> list[str]:
    from app.database import Base
    t = Base.metadata.tables.get(table)
    return [c.name for c in t.c] if t is not None else []


def _levels(resource: Resource, fields: Optional[Iterable[str]]):
    """({field: Level}, error_reason|None). Unknown column or unclassified table/field -> error."""
    base = cls.table_default(resource.type)
    if base == cls.UNCLASSIFIED:
        return {}, UNKNOWN_RESOURCE
    names = list(fields) if fields is not None else _table_columns(resource.type)
    known = set(_table_columns(resource.type))
    out = {}
    for name in names:
        if known and name not in known:
            return {}, UNCLASSIFIED_FIELD                       # a field the registry has never heard of
        c = cls.classify(resource.type, name)
        if c == cls.UNCLASSIFIED:
            return {}, UNCLASSIFIED_FIELD
        out[name] = Level(c)
    if resource.classification is not None:
        out = {k: (v if cls.rank(v) >= cls.rank(resource.classification) else resource.classification) for k, v in out.items()}
    return out, None


def _roles_of(subject: Subject) -> list[Role]:
    out = []
    for r in subject.roles:
        try:
            out.append(r if isinstance(r, Role) else Role(r))
        except ValueError:
            continue
    return out


def _in_scope(grant: RoleGrant, subject: Subject, resource: Resource) -> bool:
    if grant.scope == "tenant":
        return True
    if grant.scope == "self":
        return resource.owner_id is not None and resource.owner_id == subject.person_id
    if grant.scope == "reports":
        who = resource.owner_id if resource.owner_id is not None else resource.entity_id
        return who is not None and (who in subject.report_ids or who == subject.person_id)
    if grant.scope == "departments":
        return resource.department_id is not None and resource.department_id in subject.department_ids
    return False


# ── the entry point ─────────────────────────────────────────────────────────────────────────────────────────────────
def authorize(subject: Subject, action: str, resource: Resource, fields: Optional[Iterable[str]] = None, context: Optional[Context] = None) -> Decision:
    """The one question every data-plane access asks. Never raises: an error is a DENY."""
    try:
        decision = _authorize(subject, action, resource, fields, context or Context())
    except Exception:
        logger.error("ALERT privacy policy raised; denying (fail closed)", exc_info=True)
        decision = deny(POLICY_ERROR)
    _emit(subject, action, resource if isinstance(resource, Resource) else None, decision)
    return decision


def _authorize(subject, action, resource, fields, context) -> Decision:
    if not isinstance(subject, Subject) or not isinstance(resource, Resource) or not isinstance(context, Context):
        return deny(BAD_SUBJECT)
    if action not in ACTIONS:
        return deny(UNKNOWN_ACTION)
    if action == "impersonate":
        return deny(IMPERSONATION_DENIED)                                  # nobody can impersonate anyone

    # AI agents have no scope of their own: they are exactly the person who called them.
    if subject.plane == AI:
        caller = subject.on_behalf_of
        if caller is None or caller.plane == AI:
            return deny(AI_NO_CALLER)
        return _authorize(caller, action, resource, fields, Context(source="ai", token_audience=context.token_audience, now=context.now, region=context.region))

    levels, err = _levels(resource, None if fields is None else list(fields))
    if err:
        return deny(err)
    field_names = tuple(levels)

    if subject.plane == PLATFORM:
        return _platform(subject, action, resource, levels, field_names, context)
    if subject.plane == SERVICE:
        return _service(subject, action, resource, levels, field_names, context)
    if subject.plane != TENANT:
        return deny(BAD_SUBJECT)
    return _tenant(subject, action, resource, levels, field_names)


def _platform(subject, action, resource, levels, field_names, context) -> Decision:
    granted = _evaluate_support_grant(subject, action, resource, field_names, context)
    if granted is not None:
        return granted
    base = cls.table_default(resource.type)
    visible = [f for f, l in levels.items() if l in cls.PLATFORM_VISIBLE]
    if base in cls.PLATFORM_VISIBLE and action in READ_ACTIONS and len(visible) == len(levels):
        return Decision(True, ALLOWED, tuple(visible), ())
    # Everything else, including `count` over identifiable people and any field above PLATFORM_META/TENANT_AGGREGATE.
    return deny(PLATFORM_DATA_PLANE_DENIED if base not in cls.PLATFORM_VISIBLE else FIELD_CLASSIFICATION_DENIED)


def _service(subject, action, resource, levels, field_names, context) -> Decision:
    if context.token_audience != "zoiko-hr":
        return deny(AUDIENCE_DENIED)                                       # a ZoikoTime/Payroll token is not a Zoiko HR token
    if resource.tenant_id is None or resource.tenant_id not in subject.tenant_ids:
        return deny(NO_TENANT_MEMBERSHIP)
    if f"{resource.type}:{action}" not in subject.service_scopes:
        return deny(SCOPE_NOT_PERMITTED)
    return Decision(True, ALLOWED, field_names, ())


# What every member of an organization may read about their colleagues and the organization (the company directory and the
# shared reference data), whatever their role. These are the existing behaviours of the company directory and of Mira's
# department-directory and headcount answers, written down so they are explicit and audited rather than implied.
PEER_DIRECTORY_FIELDS = frozenset({"first_name", "last_name", "job_title", "department_id", "designation_id"})
ORG_WIDE_READABLE = frozenset({"departments", "designations", "holidays", "leave_type_configs", "knowledge_sources", "organization_configs"})
MEMBER_ROLES = frozenset({Role.TENANT_OWNER, Role.TENANT_ADMIN, Role.HR_MANAGER, Role.PAYROLL_ADMIN, Role.MANAGER, Role.EMPLOYEE, Role.AGENCY_DELEGATE})


def _org_wide(subject, action, resource, levels, field_names) -> Optional[Decision]:
    if not any(r in MEMBER_ROLES for r in _roles_of(subject)):
        return None
    if resource.type in ORG_WIDE_READABLE and action in ("list", "read", "search"):
        keep = tuple(f for f in field_names if levels[f] in (Level.PLATFORM_META, Level.PERSONAL_BASIC, Level.TENANT_FILE))
        if keep:
            return Decision(True, ALLOWED, keep, tuple(f for f in field_names if f not in keep))
    if resource.type == "employees" and action in ("list", "read", "search") and field_names and set(field_names) <= PEER_DIRECTORY_FIELDS:
        return Decision(True, ALLOWED, field_names, ())
    if resource.type == "employees" and action == "count" and not field_names:
        return Decision(True, ALLOWED, (), ())                                 # a headcount is an aggregate, not a person
    return None


def _tenant(subject, action, resource, levels, field_names) -> Decision:
    if resource.tenant_id is None or resource.tenant_id not in subject.tenant_ids:
        return deny(NO_TENANT_MEMBERSHIP)
    best: Optional[Decision] = None
    saw_role = False
    for role in _roles_of(subject):
        grant = GRANTS.get(role)
        if grant is None:
            continue
        saw_role = True
        if action not in grant.actions:
            continue
        if not _in_scope(grant, subject, resource):
            continue
        allowed = tuple(f for f in field_names if levels[f] in grant.levels)
        masked = tuple(f for f in field_names if levels[f] not in grant.levels)
        if not allowed and field_names:
            continue
        candidate = Decision(True, ALLOWED, allowed, masked)
        if best is None or len(candidate.allowed_fields) > len(best.allowed_fields):
            best = candidate
    if best is not None:
        return best
    if not saw_role:
        return deny(NO_TENANT_MEMBERSHIP)
    shared = _org_wide(subject, action, resource, levels, field_names)
    if shared is not None:
        return shared
    # a role exists but none permits this action / scope / any requested field
    only_fields = any(action in GRANTS[r].actions and _in_scope(GRANTS[r], subject, resource) for r in _roles_of(subject) if r in GRANTS)
    return deny(FIELD_CLASSIFICATION_DENIED if only_fields else (SCOPE_NOT_PERMITTED if any(action in GRANTS[r].actions for r in _roles_of(subject) if r in GRANTS) else ACTION_NOT_PERMITTED))


# ── building a Subject from the signed-in employee ──────────────────────────────────────────────────────────────────
def subject_for_user(user, *, session_id: Optional[str] = None, mfa_verified_at: Optional[float] = None, report_ids=(), department_ids=()) -> Subject:
    """The Subject for an authenticated Employee row. The tenant comes only from the account (never the request)."""
    role = getattr(user.role, "value", str(user.role))
    pol_role = ROLE_MAP.get(role)
    if pol_role is None:
        return Subject(actor_id=getattr(user, "id", None), plane=TENANT, roles=frozenset(), tenant_ids=frozenset())
    if pol_role == Role.PLATFORM_ADMIN:
        return Subject(actor_id=user.id, plane=PLATFORM, roles=frozenset({pol_role}), tenant_ids=frozenset(), person_id=user.id,
                       mfa_verified_at=mfa_verified_at, session_id=session_id)
    tenants = frozenset({user.organization_id}) if getattr(user, "organization_id", None) is not None else frozenset()
    return Subject(actor_id=user.id, plane=TENANT, roles=frozenset({pol_role}), tenant_ids=tenants, person_id=user.id,
                   mfa_verified_at=mfa_verified_at, session_id=session_id, report_ids=frozenset(report_ids), department_ids=frozenset(department_ids))


# ── applying a decision to data (the serializer mixin's core) ───────────────────────────────────────────────────────
def apply_decision(data: dict, decision: Decision) -> dict:
    """Keep allowed fields, mask the fields the role may not see, drop everything the policy never named. Returns a new dict."""
    if not decision.allow:
        return {}
    out = {}
    for k, v in data.items():
        if k in decision.allowed_fields:
            out[k] = v
        elif k in decision.masked_fields:
            out[k] = MASK
    if decision.masked_fields:
        out["redacted"] = sorted(set(decision.masked_fields) & set(data))
    return out


def record_platform_route_denial(actor_id, path: str) -> None:
    """A platform identity was turned away from a data-plane route (the HTTP-layer twin of authorize()'s platform denial)."""
    try:
        from app.core.privacy.routes import classify_route
        event = {"actor_id": actor_id, "plane": PLATFORM, "tenant_id": None, "action": "route", "resource_class": classify_route(path),
                 "resource_type": "route", "decision": "DENY", "reason": PLATFORM_DATA_PLANE_DENIED, "policy_version": POLICY_VERSION,
                 "correlation_id": correlation_id()}
        _recent.append(event)
        del _recent[:-_RECENT_MAX]
        _sink.emit(event)
    except Exception:
        logger.exception("privacy route denial could not be recorded")
