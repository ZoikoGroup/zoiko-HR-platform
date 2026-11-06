"""
modules/assistant/platform_guide.py
--------------------------------------
What the assistant knows about the Zoiko HR platform itself: every screen in
the left menu, which roles see it, and how to find it.

The screen map (platform_nav.json) is generated from the frontend's own menu
and its role filter by scripts/export_platform_nav.mjs, so the assistant never
describes a screen that doesn't exist or points someone at one their menu
doesn't show. It powers two things:
- find_screen(): "where do I ...?" / "how do I open ...?" for any of the
  platform's screens (orchestration navigation_help), role-aware.
- guide_text(): the "Zoiko HR Platform Guide" knowledge document
  (scripts/seed_platform_guide.py), so open questions about modules and
  features ("does Zoiko HR have succession planning?") are answered and cited.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

_NAV_FILE = Path(__file__).with_name("platform_nav.json")
_ROLES = ("employee", "manager", "hr_admin", "admin")
_ROLE_NAMES = {"employee": "employees", "manager": "managers", "hr_admin": "HR admins", "admin": "organization admins"}

_WORD_RE = re.compile(r"[a-z0-9]+")
# Words that say "navigate" rather than what to find.
_IGNORED = frozenset(
    "where do does can could would should i we my me the a an to find go open see view get access is are page pages "
    "screen screens tab menu section option settings setting how in on of for this that which what please show "
    "check use using zoiko hr app platform module".split()
)
# Everyday words mapped to the words the menu actually uses.
_SYNONYMS = {
    "payslip": "payslips", "salary": "payslips", "slip": "payslips", "pay": "payslips",
    "leaves": "leave", "vacation": "leave", "holiday": "holidays", "off": "leave", "timeoff": "leave",
    "expense": "expenses", "reimbursement": "expenses", "reimburse": "expenses", "claim": "expenses", "claims": "expenses",
    "trip": "travel", "trips": "travel",
    "password": "security", "mfa": "security", "2fa": "security",
    "bank": "bank", "account": "bank",
    "policy": "policies", "handbook": "policies",
    "sign": "signature", "signing": "signature", "esign": "signature",
    "course": "courses", "training": "training", "trainings": "training",
    "appraisal": "appraisals", "review": "reviews", "goal": "goals", "kpi": "performance",
    "hiring": "recruitment", "candidate": "candidates", "job": "requisitions", "jobs": "requisitions", "interview": "interviews",
    "hire": "hires", "joiner": "hires", "joiners": "hires", "employee": "employees", "staff": "employees",
    "overtime": "overtime", "correction": "corrections", "shift": "shifts",
    "laptop": "assets", "asset": "assets", "equipment": "assets",
    "contract": "contracts", "offer": "offer", "tax": "tax",
    "department": "departments", "designation": "designations", "role": "designations",
    "ticket": "tickets", "support": "support", "knowledge": "knowledge", "assistant": "assistant",
    "invoice": "invoices", "plan": "plan", "billing": "billing", "subscription": "billing",
    "compensation": "compensation", "bonus": "compensation", "headcount": "headcount", "succession": "succession",
}


@lru_cache(maxsize=1)
def screens() -> list[dict]:
    return json.loads(_NAV_FILE.read_text(encoding="utf-8"))["screens"]


def _terms(text: str, synonyms: bool = False) -> set[str]:
    """Words of `text` (plus singular forms). Synonyms expand the QUESTION
    only — expanding menu labels too would turn "Salary Structures" into a
    payslip screen."""
    words = {w for w in _WORD_RE.findall(text.lower()) if w not in _IGNORED}
    if synonyms:
        words |= {_SYNONYMS.get(w, w) for w in words}
    # singular forms too, so "request" matches "Requests"
    return words | {w[:-1] for w in words if len(w) > 3 and w.endswith("s") and not w.endswith("ss")}


def _label(screen: dict) -> str:
    return " → ".join(screen["path"])


def visible_to(screen: dict, role: str | None) -> bool:
    return (role if role in _ROLES else "employee") in screen["roles"]


# Menu words too generic to identify a screen on their own ("How do I report harassment?" is not the Reports page).
_WEAK = frozenset("report reports dashboard request requests history list detail details management overview "
                  "analytic analytics structure my action change changes update updates edit add create new system "
                  "general".split())


def _score(terms: set[str], screen: dict) -> int:
    """Leaf-label matches count double; a word already in the parent trail
    ("Travel → Travel Requests") doesn't count again for the leaf; generic
    menu words count once and only alongside a specific match."""
    trail = _terms(" ".join(screen["path"][:-1]))
    leaf = _terms(screen["path"][-1]) - trail
    strong = 2 * len((terms & leaf) - _WEAK) + len((terms & trail) - _WEAK)
    return strong + len(terms & (leaf | trail) & _WEAK) if strong else 0


def find_screen(text: str, role: str | None = None, min_score: float = 2.0) -> tuple[dict | None, bool]:
    """Best screen for `text` as (screen, visible_to_role). The leaf label
    counts double so "apply leave" picks Leaves → Apply Leave over the Leave
    dashboard. Screens the role can see win ties. (None, False) below
    `min_score` — the caller then falls back to retrieval."""
    terms = _terms(text, synonyms=True)
    if not terms:
        return None, False
    best, best_key = None, None
    for screen in screens():
        score = _score(terms, screen)
        if not score:
            continue
        # prefer: higher score, visible to the asker, a specific page over a "Dashboard", shorter path
        key = (score, visible_to(screen, role), screen["path"][-1] != "Dashboard", -len(screen["path"]))
        if best_key is None or key > best_key:
            best, best_key = screen, key
    if best is None or best_key[0] < min_score:
        return None, False
    return best, visible_to(best, role)


def describe(screen: dict, visible: bool) -> str:
    """User-facing pointer to a screen."""
    if visible:
        return f"You'll find that under {_label(screen)} in the left menu — the path is {screen['href']}."
    who = ", ".join(_ROLE_NAMES[r] for r in _ROLES if r in screen["roles"])
    return (f"That's {_label(screen)} ({screen['href']}), which is available to {who} — it isn't in your menu. "
            "Ask your HR team, or choose 'Talk to HR' and they can help.")


def screens_for_prompt(text: str, role: str | None, limit: int = 3) -> list[str]:
    """A few screens relevant to `text` that the asker can open, for the
    general-guidance prompt (so the model names real screens only)."""
    terms = _terms(text, synonyms=True)
    scored = []
    for screen in screens():
        if not visible_to(screen, role):
            continue
        score = _score(terms, screen)
        if score:
            scored.append((score, _label(screen), screen["href"]))
    scored.sort(key=lambda s: -s[0])
    return [f"{label} ({href})" for _, label, href in scored[:limit]]


_MODULE_SUMMARIES = {
    "Dashboard": "an overview of the organization's HR activity",
    "Documents": "company and employee documents, approval workflows and e-signatures",
    "Departments": "the department list, structure and reports",
    "Designations": "job titles (designations), their structure and reports",
    "Leave": "leave requests and approvals, the team leave calendar and leave reports",
    "Attendance": "daily attendance records, shifts, holidays and attendance analytics",
    "Performance": "goals, reviews, appraisals and performance analytics",
    "Recruitment": "job requisitions, candidates, interviews and offers",
    "Onboarding": "new hires, onboarding documents, checklists and orientation",
    "Employee Management": "the employee directory, organization chart, employee lifecycle and reports",
    "Assets": "company assets, assignments, requests and maintenance",
    "Learning": "courses, training programs, assessments and certifications",
    "Compensation": "pay grades, salary structures, components, benefits and revisions",
    "ESS": "employee self-service: attendance, time requests, compensation, performance and settings",
    "Travel": "travel requests, approvals and travel expense claims",
    "Workforce Planning": "workforce plans, headcount, succession and job descriptions",
    "Profile": "your personal profile, bank details, assets, emergency contacts and security settings",
    "Leaves": "your leave balance, applying for leave, the leave calendar and your leave history",
}


def guide_text() -> str:
    """The 'Zoiko HR Platform Guide' knowledge document, built from the
    screen map: one block per module with its screens, paths and who sees them."""
    groups: dict[tuple, list[dict]] = {}
    for screen in screens():
        module = screen["path"][1] if screen["path"][0] == "Zoiko HR" and len(screen["path"]) > 2 else screen["path"][0]
        groups.setdefault((screen["section"], module), []).append(screen)

    parts = [
        "Zoiko HR Platform Guide",
        "This guide lists every area of the Zoiko HR platform, the screens in it, where to find them in the left menu, "
        "and which roles see them. Employees and managers use the My Workspace menu for their own records "
        "(profile, leave, documents, self-service, learning, travel). HR admins and organization admins manage the "
        "organization from the Zoiko HR product menu and the admin sections. The Zoiko HR Assistant (this chatbot) "
        "is available on every page from the button at the bottom right.",
    ]
    for (section, module), items in groups.items():
        roles = sorted({r for s in items for r in s["roles"]}, key=_ROLES.index)
        who = ", ".join(_ROLE_NAMES[r] for r in roles)
        summary = _MODULE_SUMMARIES.get(module)
        head = f"{module} ({section.title()} menu)" + (f" — {summary}" if summary else "")
        lines = [f"- {_label(s)}: {s['href']}" for s in items]
        parts.append(f"{head}. Available to {who}.\n" + "\n".join(lines))
    return "\n\n".join(parts)
