"""
evals/scoring.py — the copilot evaluation harness (M1-15): cases, checks and scores.

Two layers, one case file (evals/cases.json):

- OFFLINE (no model call, no database; runs in CI on every PR): the deterministic routing the answer depends on.
  Does the question reach the right intent, does a "where is" question resolve to the right screen for the asker's
  role, is a restricted request blocked before any model call, and is an invented screen name NOT matched to a real
  screen as if it existed.
- LIVE (calls a running backend and the real model; on demand, see run_eval.py): the answer itself. Does it name the
  right screen, is every "A → B" menu path it gives a real one, is a restricted request refused, and is a policy
  answer grounded in sources or clearly labelled as general guidance.

Each layer reports a score per dimension (0-100) and an overall score (the mean of the dimensions).
evals/baseline.json holds the recorded scores; a run more than MAX_DROP points below the baseline fails.
"""
from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass, field

EVALS = pathlib.Path(__file__).resolve().parent
CASES_FILE = EVALS / "cases.json"
BASELINE_FILE = EVALS / "baseline.json"
MAX_DROP = 3.0

ROLES = ("employee", "manager", "hr_admin", "admin")
CATEGORIES = ("navigation", "how_it_works", "policy", "refusal", "invented_screen", "product", "page_context")

# Dimensions. A case contributes to every dimension it has a check for.
SCREEN = "correct_screen"
INVENTED = "no_invented_screens"
REFUSAL = "correct_refusals"
GROUNDED = "groundedness"
ROUTING = "correct_routing"
PLAIN = "plain_language"


@dataclass
class CaseResult:
    id: str
    category: str
    checks: dict = field(default_factory=dict)     # dimension -> bool
    detail: dict = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return all(self.checks.values())


def load_cases(path: pathlib.Path = CASES_FILE) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    ids = [c["id"] for c in cases]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"duplicate case ids: {sorted(dupes)}")
    for c in cases:
        if c["category"] not in CATEGORIES or c["role"] not in ROLES:
            raise ValueError(f"case {c['id']}: unknown category or role")
    return cases


def score(results: list[CaseResult]) -> dict:
    dims: dict[str, list[bool]] = {}
    for r in results:
        for dim, ok in r.checks.items():
            dims.setdefault(dim, []).append(ok)
    scores = {d: round(100.0 * sum(v) / len(v), 1) for d, v in sorted(dims.items())}
    overall = round(sum(scores.values()) / len(scores), 1) if scores else 0.0
    return {"overall": overall, "dimensions": scores, "cases": len(results),
            "failed": [r.id for r in results if not r.passed]}


def compare(current: dict, baseline: dict | None, per_dimension: bool = True) -> list[str]:
    """Problems that fail the run: the overall score, or (per_dimension) any dimension, more than MAX_DROP below the
    baseline. The live layer compares the overall score only: a live dimension has ~20 cases, so one answer that
    varies between runs moves it ~5 points — noise, not a regression."""
    if not baseline:
        return []
    problems = []
    if current["overall"] < baseline["overall"] - MAX_DROP:
        problems.append(f"overall {current['overall']} is more than {MAX_DROP} below the baseline {baseline['overall']}")
    if not per_dimension:
        return problems
    for dim, base in baseline.get("dimensions", {}).items():
        now = current["dimensions"].get(dim)
        if now is not None and now < base - MAX_DROP:
            problems.append(f"{dim} {now} is more than {MAX_DROP} below the baseline {base}")
    return problems


def load_baseline(layer: str) -> dict | None:
    if not BASELINE_FILE.exists():
        return None
    return json.loads(BASELINE_FILE.read_text(encoding="utf-8")).get(layer)


# ── screens ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _screens() -> list[dict]:
    from app.modules.assistant import platform_guide
    return platform_guide.screens()


def screen_for(href: str) -> dict:
    for s in _screens():
        if s["href"] == href:
            return s
    raise ValueError(f"no screen with href {href} in platform_nav.json")


def _plain(text: str) -> str:
    """Curly apostrophes to straight ones, markdown bold markers removed."""
    return text.replace("’", "'").replace("‘", "'").replace("**", "").replace("__", "")


def _words(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9&]+", " ", text.lower()).split()


def known_segments() -> set[tuple[str, ...]]:
    known = {("zoiko", "hr")}
    for s in _screens():
        known.add(tuple(_words(s["section"])))
        for part in s["path"]:
            known.add(tuple(_words(part)))
    return known


_ARROW_PATH = re.compile(r"[^\n.;:()\[\]\"“”]*?(?:→|->)[^\n.;:()\[\]\"“”]*")


def menu_paths(answer: str) -> list[list[str]]:
    """Every "A → B → C" menu path written in the answer, as its segments."""
    return [[seg.strip() for seg in re.split(r"→|->", m.group(0))] for m in _ARROW_PATH.finditer(answer)]


def invented_segments(answer: str) -> list[str]:
    """Menu-path segments that aren't a real section or screen name. The first segment may carry leading words
    ("open Zoiko HR"), the last trailing ones ("Exit Cases to track it"), so those match on a suffix / prefix."""
    known = known_segments()
    bad = []
    for path in menu_paths(_plain(answer)):
        for i, seg in enumerate(path):
            words = _words(seg)
            if not words:
                continue
            first, last = i == 0, i == len(path) - 1
            # a sentence ran into the path, or two paths are joined ("… → New Exit and Zoiko HR → …"): only the
            # segment's edges can be menu names
            if len(words) > 5 or re.search(r"\b(and|or|then)\b|,", seg):
                first = last = True
            candidates = {tuple(words)}
            if first:
                candidates |= {tuple(words[k:]) for k in range(len(words))}
            if last:
                candidates |= {tuple(words[:k]) for k in range(1, len(words) + 1)}
            if first and last:
                candidates |= {tuple(words[a:b]) for a in range(len(words)) for b in range(a + 1, len(words) + 1)}
            if not candidates & known:
                bad.append(seg)
    return bad


_GENERIC_LEAVES = frozenset({"Dashboard", "Reports", "Settings", "Approvals", "Calendar", "Analytics", "Requests",
                             "List", "Documents", "Profile", "Expenses", "Courses", "Assessments"})


def _screen_names(screen: dict) -> set[str]:
    """How an answer might name a screen without its full path: its own title ("Exit Cases"), or module + title
    ("Leave Dashboard") when the title alone is generic."""
    path = screen["path"]
    names = set()
    if path[-1] not in _GENERIC_LEAVES:
        names.add(path[-1])
    if len(path) >= 2:
        names.add(f"{path[-2]} {path[-1]}")
    return names


def other_role_screen_names(answer: str, role: str) -> list[str]:
    """Screen names (Title Case, as menus write them) that exist only in OTHER roles' menus, e.g. "Leave Dashboard"
    in an employee's answer. Reported for review, not scored: "HR does this in Onboarding → New Hires" is a correct
    answer that names another role's screen on purpose."""
    screens = _screens()
    mine = set().union(*(_screen_names(s) | set(s["path"]) for s in screens if role in s["roles"]))
    theirs = set().union(*(_screen_names(s) for s in screens if role not in s["roles"])) - mine
    text = _plain(answer)
    return sorted(n for n in theirs if re.search(rf"(?<![\w]){re.escape(n)}(?![\w])", text))


# ── offline layer ────────────────────────────────────────────────────────────────────────────────────────────────────
def run_offline(case: dict) -> CaseResult:
    from app.modules.assistant import orchestration_service as orch, platform_guide

    r = CaseResult(case["id"], case["category"])
    q, role = case["q"], case["role"]
    block = orch._restricted_category(q)
    r.detail["blocked"] = block[0] if block else None

    if "restricted" in case:
        want = case["restricted"]
        ok = bool(block) == bool(want) and (not isinstance(want, str) or (block and block[0] == want))
        r.checks[REFUSAL] = bool(ok)
        if want:
            return r                                     # blocked before routing: nothing else runs
    elif block:
        r.checks[REFUSAL] = False                        # an ordinary question must never be blocked
        return r

    intent = orch.classify_intent(q)
    r.detail["intent"] = intent
    if "intent" in case:
        dim = ROUTING if case["category"] in ("policy", "product") else SCREEN
        r.checks[dim] = intent.startswith(case["intent"])

    if "screen" in case:
        screen, visible = platform_guide.find_screen(q, role)
        r.detail["screen"] = screen["href"] if screen else None
        r.checks[SCREEN] = r.checks.get(SCREEN, True) and bool(screen) and screen["href"] == case["screen"] and visible

    if case["category"] == "invented_screen":
        screen, _ = platform_guide.find_screen(q, role)
        r.detail["screen"] = screen["href"] if screen else None
        r.checks[INVENTED] = screen is None

    if "page_screen" in case:
        # M1-13: the open page resolves to the right screen, and only when it is in the asker's menu
        page = platform_guide.screen_for_route(case.get("page"), role)
        r.detail["page_screen"] = page["href"] if page else None
        r.checks[SCREEN] = r.checks.get(SCREEN, True) and r.detail["page_screen"] == case["page_screen"]
    return r


# ── live layer ───────────────────────────────────────────────────────────────────────────────────────────────────────
# An invented screen must be called out as not part of Zoiko HR ("Zoiko HR doesn't have a ... screen"), not talked
# around ("the Wellness Hub is typically provided by your employer ... if you can't find it, ask HR").
_NEGATION = re.compile(
    r"\b(doesn't|does not|don't|do not|isn't|is not|aren't|are not)\s+(currently\s+|yet\s+)?"
    r"(have|include|list|offer|exist|appear|available|part of|listed|built|a\s+(screen|page|feature|menu))\b"
    r"|\bno\s+(such\s+)?(screen|page|menu item|feature|module)\b"
    r"|\bthere(?: is|'s) no\b",
    re.IGNORECASE)
_GENERAL_LABEL = re.compile(r"(your organization )?hasn'?t published|general guidance", re.IGNORECASE)
_JARGON = re.compile(r"\b(available evidence|the evidence|documents provided|provided documents|provided context|"
                     r"the context (given|provided))\b", re.IGNORECASE)


def check_live(case: dict, turn: dict) -> CaseResult:
    """Score one answer (the TurnResponse JSON of the finished turn)."""
    r = CaseResult(case["id"], case["category"])
    answer = _plain(turn.get("answer_text") or "")
    answer_type = turn.get("answer_type")
    sources = turn.get("sources") or []
    r.detail.update(answer_type=answer_type, intent=turn.get("intent"), sources=len(sources), answer=answer)

    if "restricted" in case:
        refused = answer_type in ("restricted", "no_answer")
        r.checks[REFUSAL] = refused if case["restricted"] else not (answer_type == "restricted")
        if case["restricted"]:
            return r

    bad = invented_segments(answer)
    r.detail["invented_segments"] = bad
    r.checks[INVENTED] = not bad
    others = other_role_screen_names(answer, case["role"])
    if others:
        r.detail["warning_other_role_screens"] = others          # for review; see other_role_screen_names

    if "screen" in case:
        label = screen_for(case["screen"])["path"][-1]
        r.checks[SCREEN] = label.lower() in answer.lower()

    for group in case.get("mention", []):
        r.checks[SCREEN] = r.checks.get(SCREEN, True) and any(m.lower() in answer.lower() for m in group)

    avoid_hits = [a for a in case.get("avoid", []) if a.lower() in answer.lower()]
    if avoid_hits:
        r.detail["avoided_phrases_found"] = avoid_hits
        r.checks[INVENTED] = False

    if case["category"] == "invented_screen":
        r.checks[INVENTED] = r.checks[INVENTED] and bool(_NEGATION.search(answer))

    # internal words never reach the user ("isn't listed in the available evidence")
    jargon = _JARGON.findall(answer)
    if jargon:
        r.detail["jargon"] = jargon
    r.checks[PLAIN] = not jargon

    if case["category"] == "policy":
        # grounded = backed by sources; otherwise it must say it's general guidance, never pose as company policy
        label = _GENERAL_LABEL.search(answer)
        r.checks[GROUNDED] = (answer_type == "grounded" and bool(sources)) or bool(label) or answer_type == "no_answer"
        # no answer given twice: a "not covered" part followed by labelled guidance that repeats the same pointer
        # ("…open Attendance → Shifts & Work Policy…" in both). A one-line "not covered" lead-in is fine.
        if label and not sources:
            before, after = answer[:label.start()], answer[label.end():]
            ends = lambda text: {p[-1].strip().lower() for p in menu_paths(text) if p and p[-1].strip()}  # noqa: E731
            repeated = sorted(ends(before) & ends(after))
            if repeated:
                r.detail["repeated_before_and_after_general_guidance"] = repeated
                r.checks[GROUNDED] = False
    if case["category"] in ("product", "invented_screen"):
        r.checks[GROUNDED] = not _GENERAL_LABEL.search(answer)      # a question about the app isn't a missing policy
    if case["category"] == "invented_screen" and answer_type == "no_answer":
        r.detail["labelled_no_reliable_answer"] = True              # a definite "no such screen" isn't a dead end
        r.checks[GROUNDED] = False
    return r
