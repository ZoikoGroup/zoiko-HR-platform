"""
modules/assistant/policy_domains.py
--------------------------------------
Domain-aware handling for policy questions, per the seven chatbot
engineering wireframes in docs/new_docs (Attendance & Leave, Benefits &
Compensation, Expense Reimbursement, Remote Work, Onboarding & Offboarding,
Employee Handbook & Code of Conduct, Compliance & Jurisdiction).

Every one of those specs makes the same split: deterministic services own
entitlements, amounts, approvals and legal applicability; the assistant only
EXPLAINS approved policy, with a fixed answer shape, a per-domain "never"
list, and a risk ladder that ends in a hard stop for decision requests. This
module encodes the chatbot-facing half of that:

- classify(): which HR policy domain a free-text question is about (keyword
  scoring, no model call — same doctrine as orchestration.classify_intent).
- assess(): the question's risk tier inside that domain —
    PERSONAL   own transactional record ("what is my salary") → answered
               deterministically with the screen that holds it, never a RAG
               guess (Benefits R2, Onboarding R2, Expense E0).
    PROTECTED  protected-rights context (medical, pregnancy, pay discussion,
               whistleblowing...) → generation runs with a data-minimising,
               no-"you have no right" clause (Leave L2, Handbook L2).
    DISPUTE    asks for adjudication ("was my dismissal lawful?") → generation
               runs but may only give policy + routes, never a verdict
               (Leave L3, Benefits R4, Onboarding R4, Compliance R3/R4).
- decision_block(): requests for an adverse or approval decision the specs
  forbid the assistant from making (Leave L4, Benefits R5, Expense E5,
  Remote Work 30.1, Onboarding R5, Compliance R5). Checked before routing,
  alongside risk_classification's hard blocks.

Nothing here holds statutory values, caps, rates or durations — the specs'
red lines forbid hard-coding them in prompts. Those must come from the
tenant's approved knowledge sources (retrieval) or a deterministic service.
"""

import re
from dataclasses import dataclass, field

PERSONAL = "personal"
PROTECTED = "protected"
DISPUTE = "dispute"


def _re(*parts: str) -> re.Pattern:
    return re.compile("|".join(parts), re.IGNORECASE)


@dataclass(frozen=True)
class PolicyDomain:
    key: str
    label: str
    cues: tuple[re.Pattern, ...]
    # What the model must never do in this domain (spec "Never" lists).
    never: tuple[str, ...]
    # Shown when the tenant has no approved content for the question.
    no_content: str
    # (pattern, deterministic answer) for the employee's own records.
    personal: tuple[tuple[re.Pattern, str], ...] = field(default_factory=tuple)


DOMAINS: tuple[PolicyDomain, ...] = (
    PolicyDomain(
        key="leave_attendance",
        label="leave and attendance",
        cues=(
            _re(r"\bleaves?\b", r"\btime[- ]off\b", r"\bdays?\s+off\b", r"\bholidays?\b", r"\bvacation\b"),
            _re(r"\bsick\w*\b", r"\bmedical\s+leave\b", r"\bill(ness)?\b", r"\babsen\w*\b", r"\bno[- ]show\b"),
            _re(r"\bmaternity\b", r"\bpaternity\b", r"\bparental\b", r"\badoption\b", r"\bpregnan\w*\b", r"\bneonatal\b"),
            _re(r"\bbereavement\b", r"\bcompassionate\b", r"\bcarer'?s?\b", r"\bcaregiver\b", r"\bjury\b", r"\bmilitary\b"),
            _re(r"\battendance\b", r"\blate\s+(mark|coming|arrival)s?\b", r"\btardiness\b", r"\bcasual\s+leave\b", r"\bunpaid\s+leave\b"),
        ),
        never=(
            "invent or calculate an entitlement, duration, balance or statutory pay amount",
            "promise approval, or deny or rule out protected leave",
            "tell the employee they have no right to time off when the policy evidence is silent or incomplete",
            "ask for or speculate about a diagnosis, pregnancy, disability or other health detail",
            "suggest attendance points, warnings or discipline for an absence",
        ),
        no_content=(
            "I don't have approved leave and attendance policy content for your organization yet, so I won't guess "
            "entitlements, durations or pay. Ask me for your leave balance, use Leaves → Apply Leave to request "
            "time off, or choose 'Talk to HR'."
        ),
    ),
    PolicyDomain(
        key="benefits_compensation",
        label="benefits and compensation",
        cues=(
            _re(r"\bsalar\w*\b", r"\bwages?\b", r"\bpay\b", r"\bpaid\b", r"\bpayroll\b", r"\bcompensation\b", r"\bctc\b"),
            _re(r"\bbonus\w*\b", r"\bincentive\w*\b", r"\bcommission\w*\b", r"\braise\b", r"\bincrement\w*\b", r"\bhike\b"),
            _re(r"\bbenefits?\b", r"\binsurance\b", r"\bhealth\s+(plan|cover\w*)\b", r"\bmedical\s+(plan|cover\w*)\b", r"\bdental\b"),
            _re(r"\bpension\b", r"\bretirement\b", r"\b401\s*k\b", r"\bprovident\s+fund\b", r"\bgratuity\b", r"\bpf\b"),
            _re(r"\bequity\b", r"\bstock\s+options?\b", r"\brsus?\b", r"\besop\b", r"\bpay\s+(band|grade|scale|range)s?\b", r"\bovertime\b"),
        ),
        never=(
            "invent a salary range, contribution rate, bonus formula, benefit or eligibility rule",
            "reveal or compare another employee's pay, benefit election or equity",
            "say a pay difference is lawful or unlawful",
            "tell employees they may not discuss their pay — pay-discussion restrictions are often unlawful",
            "treat a discretionary benefit as guaranteed unless the policy evidence says so",
            "calculate tax, pension or social-security amounts, or give investment advice on equity or retirement assets",
        ),
        no_content=(
            "I don't have approved benefits and compensation policy content for your organization yet, so I won't "
            "guess pay rules, rates or eligibility. Your own payslips are under Documents → Payslips; for anything "
            "else, choose 'Talk to HR'."
        ),
        personal=(
            (_re(r"\b(what('s| is)|how much is|show( me)?|tell me)\s+my\s+(salary|pay|ctc|wage|net pay|gross pay|take[- ]home)\b",
                 r"\bhow much (do|will) i (get paid|earn|make)\b"),
             "I don't read individual pay records in chat. Your pay details are on your payslips under "
             "Documents → Payslips (/employee/documents/payslips). For a question about a specific payment, "
             "choose 'Talk to HR'."),
            (_re(r"\b(which|what)\s+(benefit|health|insurance|medical|pension)\s*(plan)?s?\s+(did i|have i)\s+(choose|chose|select|enrol)\w*\b",
                 r"\bmy\s+(benefit|insurance|pension)\s+(election|enrol+ment|selection)s?\b"),
             "I can't see individual benefit elections in chat. Your HR team can confirm what you're enrolled in — "
             "choose 'Talk to HR'."),
        ),
    ),
    PolicyDomain(
        key="expense_reimbursement",
        label="expenses and reimbursement",
        cues=(
            _re(r"\bexpens\w*\b", r"\breimburs\w*\b", r"\breceipts?\b", r"\binvoices?\b"),
            _re(r"\bper\s*diem\b", r"\bmileage\b", r"\bdaily\s+allowance\b", r"\btravel\s+(claim|allowance|policy|booking)s?\b"),
            _re(r"\bcorporate\s+card\b", r"\bcompany\s+card\b", r"\bclaim\s+(for|back)\b", r"\bout[- ]of[- ]pocket\b"),
        ),
        never=(
            "invent a reimbursement right, cap, mileage rate, per diem or tax rate",
            "approve or reject a claim or an exception",
            "call anyone fraudulent or dishonest, or recommend discipline for a policy breach",
            "say an expense is tax-free unless the policy evidence explicitly says so",
            "infer business purpose from a receipt alone",
        ),
        no_content=(
            "I don't have approved expense policy content for your organization yet, so I won't guess caps, rates "
            "or receipt rules. You can submit and track claims under Expenses (/employee/travel/expenses), or "
            "choose 'Talk to HR'."
        ),
        personal=(
            (_re(r"\b(status|where)\b.{0,30}\bmy\b.{0,20}\b(expense|claim|reimbursement)s?\b",
                 r"\bmy\b.{0,20}\b(expense|claim|reimbursement)s?\b.{0,30}\b(status|approved|paid|pending|rejected)\b",
                 r"\b(has|have|was|were)\s+my\b.{0,20}\b(expense|claim|reimbursement)s?\b"),
             "You can see the status of each of your claims under Expenses (/employee/travel/expenses). If a claim "
             "looks stuck, choose 'Talk to HR'."),
        ),
    ),
    PolicyDomain(
        key="remote_work",
        label="remote and hybrid work",
        cues=(
            _re(r"\bremote(ly)?\b", r"\bwork(ing)?\s+from\s+home\b", r"\bwfh\b", r"\bhybrid\b", r"\btelework\w*\b"),
            _re(r"\bhome\s+office\b", r"\bflexible\s+work\w*\b", r"\bflexi[- ]?work\w*\b", r"\bwork(ing)?\s+(from\s+)?abroad\b"),
            _re(r"\bwork(ing)?\s+from\s+(another|a different|other)\s+(country|state|city|location)\b", r"\bdigital\s+nomad\b",
                r"\bworkation\b", r"\bin[- ]office\s+days?\b", r"\breturn\s+to\s+(the\s+)?office\b"),
        ),
        never=(
            "approve or deny a remote-work arrangement — only the request workflow can",
            "invent a flexible-work right, deadline or cross-border day limit",
            "decide tax residence, permanent establishment, social-security or immigration status",
            "suggest concealing a work location, working on a visitor/tourist visa, or relying on a VPN",
            "say an employee may start working from a new country before HR has approved it",
        ),
        no_content=(
            "I don't have approved remote-work policy content for your organization yet, so I won't guess what's "
            "allowed. Please don't start working from a new location — especially another country — until HR "
            "has approved it. Choose 'Talk to HR' to ask about your arrangement."
        ),
    ),
    PolicyDomain(
        key="onboarding_offboarding",
        label="onboarding and offboarding",
        cues=(
            _re(r"\bonboard\w*\b", r"\bnew\s+hires?\b", r"\bnew\s+joiners?\b", r"\bjoining\b", r"\bfirst\s+(day|week)\b",
                r"\binduction\b", r"\borientation\b", r"\bprobation\w*\b"),
            _re(r"\boffboard\w*\b", r"\bresign\w*\b", r"\bnotice\s+period\b", r"\bexit\s+(process|interview|formalit\w*)\b",
                r"\blast\s+(working\s+)?day\b", r"\brelieving\s+letter\b", r"\bexperience\s+letter\b"),
            _re(r"\bfinal\s+(pay|paycheck|settlement|salary)\b", r"\bfull\s+and\s+final\b", r"\bseverance\b",
                r"\bterminat\w*\b", r"\bdismiss\w*\b", r"\bredundan\w*\b", r"\blaid\s+off\b", r"\blayoffs?\b"),
            _re(r"\breturn\w*\s+(my\s+)?(laptop|assets?|equipment|id\s+card)\b", r"\bbackground\s+(check|verification)\b",
                r"\bright\s+to\s+work\b", r"\bwork\s+authori[sz]ation\b"),
        ),
        never=(
            "calculate final pay, notice period, severance or work-authorization outcomes",
            "say whether a termination is lawful, unlawful or 'for cause'",
            "recommend redundancy selection, discipline or any adverse action",
            "reveal investigation or legal-review status",
        ),
        no_content=(
            "I don't have approved onboarding and offboarding content for your organization yet, so I won't guess "
            "notice periods, final pay or documents. Onboarding documents are under Onboarding → Documents "
            "(/zoiko-hr/onboarding/documents); for exit questions choose 'Talk to HR'."
        ),
        personal=(
            (_re(r"\b(have|did)\s+i\s+(complete|finish)\w*\b.{0,20}\bonboarding\b", r"\bmy\s+onboarding\s+(tasks?|status|progress|checklist)\b",
                 r"\bwhat\s+(onboarding\s+)?tasks\s+do\s+i\s+have\b"),
             "Your onboarding documents and their status are under Onboarding → Documents "
             "(/zoiko-hr/onboarding/documents). If something there looks wrong, choose 'Talk to HR'."),
            (_re(r"\bwhen\b.{0,30}\bmy\s+(final\s+(pay|paycheck|settlement|salary)|full\s+and\s+final)\b",
                 r"\bhow\s+much\b.{0,30}\bmy\s+(final\s+(pay|settlement)|severance|full\s+and\s+final)\b"),
             "I can't calculate or confirm final pay in chat — the timing and amount depend on your location and "
             "your payroll record. Choose 'Talk to HR' and the team will confirm it for you."),
        ),
    ),
    PolicyDomain(
        key="handbook_conduct",
        label="the employee handbook and code of conduct",
        cues=(
            _re(r"\bcode\s+of\s+(conduct|ethics)\b", r"\bhandbook\b", r"\bconduct\b", r"\bethic\w*\b", r"\bdress\s+code\b"),
            _re(r"\bgifts?\b", r"\bhospitality\b", r"\bconflicts?\s+of\s+interest\b", r"\bbriber\w*\b", r"\bcorruption\b",
                r"\bmoonlight\w*\b", r"\bside\s+(job|business|gig)\b", r"\boutside\s+employment\b"),
            _re(r"\bharass\w*\b", r"\bbull(y|ying|ied)\b", r"\bdiscriminat\w*\b", r"\bwhistle\s*-?blow\w*\b", r"\bspeak[- ]up\b",
                r"\bgrievance\w*\b", r"\bmisconduct\b", r"\bdisciplinary\b"),
            _re(r"\bsocial\s+media\b", r"\bconfidential\w*\b", r"\bacceptable\s+use\b", r"\bdrugs?\b", r"\balcohol\b",
                r"\bworkplace\s+(behaviou?r|relationships?)\b"),
        ),
        never=(
            "make a finding that conduct is or is not harassment, discrimination, retaliation or misconduct",
            "recommend discipline or dismissal as an outcome",
            "promise anonymity or absolute confidentiality",
            "state a blanket ban on discussing pay, raising complaints, union activity or reporting to a regulator",
            "say handbook text is or is not contractual unless the policy evidence says so",
        ),
        no_content=(
            "I don't have approved handbook or code-of-conduct content for your organization yet, so I won't guess "
            "what the rules are. Company policies are under Documents → Company Documents "
            "(/employee/documents/company); to raise a concern, choose 'Talk to HR'."
        ),
    ),
    PolicyDomain(
        key="compliance_jurisdiction",
        label="compliance and local employment rules",
        cues=(
            _re(r"\bcomplian\w*\b", r"\bjurisdiction\w*\b", r"\bregulat\w*\b", r"\bstatutor\w*\b", r"\blabou?r\s+laws?\b",
                r"\bemployment\s+laws?\b", r"\blegal\s+requirements?\b"),
            _re(r"\b(apply|applies)\s+to\s+(me|my\s+(location|country|state|office))\b", r"\bin\s+my\s+(country|state|location)\b",
                r"\blocal\s+(laws?|rules|policy|policies)\b"),
            _re(r"\bgdpr\b", r"\bdata\s+protection\b", r"\bmonitor\w*\b", r"\bsurveillance\b", r"\bunions?\b",
                r"\bworks\s+council\b", r"\bcollective\s+(bargaining|agreement)\b", r"\bworkplace\s+(rights\s+)?notices?\b"),
            _re(r"\bhealth\s+and\s+safety\b", r"\bworkplace\s+(injur\w*|safety|hazards?)\b", r"\bwork(ing)?\s+hours\b",
                r"\brest\s+breaks?\b", r"\bminimum\s+wage\b"),
        ),
        never=(
            "decide which jurisdiction's law applies, or that something is legal or illegal",
            "give individualized legal advice or strategy for a dispute, regulator or litigation",
            "approve monitoring, surveillance or automated decisions about workers",
            "discourage union activity, safety reporting, whistleblowing or other protected activity",
        ),
        no_content=(
            "I don't have approved compliance content for your location yet, so I won't guess which rules apply — "
            "local law differs by country, state and employer. Company policies are under Documents → Company "
            "Documents (/employee/documents/company), or choose 'Talk to HR' for a confirmed answer."
        ),
    ),
)

_BY_KEY = {d.key: d for d in DOMAINS}


def get(key: str | None) -> PolicyDomain | None:
    return _BY_KEY.get(key) if key else None


def classify(text: str) -> PolicyDomain | None:
    """The domain whose cue groups match the most; ties go to the earlier
    domain in DOMAINS. None when nothing matches — the general policy path
    still runs, just without a domain clause."""
    best, best_score = None, 0
    for domain in DOMAINS:
        score = sum(1 for cue in domain.cues if cue.search(text))
        if score > best_score:
            best, best_score = domain, score
    return best


# ── Risk tiers ────────────────────────────────────────────────────────────────
# Protected-rights review triggers (Leave 34.3, Handbook 13.3, Compliance 18):
# generation still runs, but under a data-minimising, rights-preserving clause.
_PROTECTED_RE = _re(
    r"\bsick\w*\b", r"\bmedical\b", r"\bill(ness)?\b", r"\bhospital\w*\b", r"\bsurgery\b", r"\bmental\s+health\b",
    r"\bdisabilit\w*\b", r"\baccommodat\w*\b", r"\bpregnan\w*\b", r"\bmaternity\b", r"\bmiscarriage\b",
    r"\bbereavement\b", r"\bpassed\s+away\b", r"\bfuneral\b", r"\bcarer'?s?\b", r"\bcaregiv\w*\b",
    r"\bdomestic\s+(violence|abuse)\b", r"\bstalk\w*\b", r"\bmilitary\b", r"\bjury\b", r"\breligio\w*\b",
    r"\bunions?\b", r"\bwhistle\s*-?blow\w*\b", r"\binjur\w*\b", r"\bunsafe\b",
    r"\b(discuss|share|talk about|disclose)\b.{0,20}\b(my\s+)?(pay|salary|wages?)\b",
    r"\bno\s+(sick|leave)\s+(days?|balance)\s+left\b", r"\bout\s+of\s+(sick|leave)\b", r"\b(exhausted|used up)\b.{0,20}\b(leave|sick)\b",
)
# Requests for a verdict the assistant may not give (Leave L3, Benefits R4,
# Onboarding R4, Handbook L3, Compliance R3/R4/R6).
_DISPUTE_RE = _re(
    r"\b(was|is)\s+(my|the|this|their|his|her)\s+(dismissal|termination|firing|layoff|redundancy)\s+(lawful|legal|unlawful|illegal|fair|unfair|valid)\b",
    r"\b(wrongful|unfair|constructive)\s+(dismissal|termination)\b", r"\bwrongfully\s+(fired|terminated|dismissed)\b",
    r"\b(am\s+i|was\s+i|are\s+we)\s+(being\s+)?(underpaid|discriminated|harassed|treated\s+unfairly|retaliated)\b",
    r"\bunderpaid\s+because\b", r"\bcan\s+(they|my\s+(manager|employer|company))\s+(legally\s+)?(fire|deny|refuse|cut|reduce|withhold)\b",
    r"\b(denied|refused|rejected)\s+my\s+(leave|claim|reimbursement|request|raise|bonus)\b.{0,30}\b(fair|legal|allowed|right)\b",
)


@dataclass(frozen=True)
class Assessment:
    domain: PolicyDomain | None
    tier: str | None = None
    personal_answer: str | None = None


def assess(text: str) -> Assessment:
    # Own-record patterns are specific enough to win over keyword scoring
    # ("my final pay" is an offboarding record even though "pay" also scores
    # for compensation).
    for candidate in DOMAINS:
        for pattern, answer in candidate.personal:
            if pattern.search(text):
                return Assessment(candidate, PERSONAL, answer)
    domain = classify(text)
    if _DISPUTE_RE.search(text):
        return Assessment(domain, DISPUTE)
    if domain and _PROTECTED_RE.search(text):
        return Assessment(domain, PROTECTED)
    return Assessment(domain)


# ── Decision hard blocks ──────────────────────────────────────────────────────
# Each is a request for a decision every spec reserves to an authorized human
# workflow. Deliberately narrow: the employee's own process questions ("how
# do I resign?", "can I claim a monitor?") must never match.
_DECISION_BLOCKS = (
    ("adverse_action", _re(
        r"\bshould\s+(i|we)\s+(terminate|dismiss|sack|lay\s*off|suspend|demote|discipline|make\s+\w+\s+redundant)\b",
        r"\b(who|which\s+(employee|person|people|staff)\w*)\s+(should|to)\s+(i\s+|we\s+)?(terminate|dismiss|lay\s*off|make\s+redundant|let\s+go)\b",
        r"\b(recommend|suggest)\w*\s+(terminating|dismissing|disciplining|suspending|demoting|laying\s+off)\b",
        r"\b(give|issue|add)\w*\b.{0,30}\b(warning|points?|penalt\w*|write[- ]?up)\b.{0,40}\b(for|because)\b.{0,20}\b(sick|leave|absen\w*|maternity|pregnan\w*|medical)\b",
        r"\b(deny|reject|refuse)\b.{0,20}\b(his|her|their|this\s+employee'?s?)\b.{0,20}\b(maternity|paternity|parental|sick|medical|bereavement|protected)\s+leave\b",
     ),
     "I can't recommend or make disciplinary, dismissal, redundancy or leave-denial decisions — those need "
     "your organization's authorized HR process and human judgment, and protected leave or accommodation "
     "checks have to happen first. I can explain the relevant policy or process steps, or connect you with HR."),
    ("pay_decision", _re(
        r"\b(what|how\s+much)\b.{0,25}\b(raise|increment|hike|bonus|salary\s+increase|pay\s+rise)\b.{0,25}\bshould\s+(i|we)\s+(give|offer|award|pay)\b",
        r"\bshould\s+(i|we)\s+(give|offer|award)\b.{0,30}\b(raise|increment|hike|bonus|pay\s+rise)\b",
     ),
     "I can't recommend pay, raise or bonus amounts for an employee — compensation decisions go through your "
     "organization's approved review process. I can explain the compensation policy, or connect you with HR."),
    ("expense_decision", _re(
        r"\b(approve|reject|decline)\s+(my|this|his|her|their)\s+(expense|claim|reimbursement)s?\b",
        r"\bis\s+(he|she|they|this\s+(employee|person|claim))\s+(committing\s+)?(fraud\w*|cheating|faking)\b",
        r"\b(is|are)\s+(this|these|his|her|their)\s+(receipts?|claims?|expenses?)\s+(fake|fraudulent|forged)\b",
     ),
     "I can't approve, reject or judge expense claims, or decide whether anyone acted dishonestly — that's "
     "handled by the authorized approval and review workflow. Claims are under Expenses "
     "(/employee/travel/expenses), or I can connect you with HR."),
    ("location_concealment", _re(
        r"\b(hide|conceal|mask|fake)\b.{0,30}\b(my\s+)?(location|ip|where\s+i\s+(am|work))\b",
        r"\bwithout\s+(telling|informing|letting)\b.{0,30}\b(hr|my\s+(manager|employer|company))\b.{0,40}\b(abroad|another\s+country|overseas|remote)\b",
        r"\b(abroad|another\s+country|overseas)\b.{0,40}\bwithout\s+(telling|informing|letting)\b.{0,20}\b(hr|my\s+(manager|employer|company))\b",
        r"\bvpn\b.{0,40}\b(so|without)\b.{0,30}\b(know|notice|find\s+out|detect|tell)\b",
        r"\b(tourist|visitor)\s+visa\b.{0,40}\bwork\w*\b", r"\bwork\w*\b.{0,40}\b(tourist|visitor)\s+visa\b",
     ),
     "I can't help with working from a location your employer hasn't approved, or with hiding where you work — "
     "it can create serious tax, immigration and security problems for you. Please raise a remote-work request "
     "or choose 'Talk to HR' to check what's possible."),
    ("covert_monitoring", _re(
        r"\b(secretly|covertly|without\s+(them|their|employees?)\s+knowing)\b.{0,40}\b(monitor|track|record|watch|read)\w*\b",
        r"\b(monitor|track|record|watch|read)\w*\b.{0,40}\b(secretly|covertly|without\s+(them|their|employees?)\s+knowing)\b",
     ),
     "I can't advise on monitoring people without their knowledge — workplace monitoring has strict, "
     "location-specific rules and needs your organization's approved privacy assessment. I can point you to "
     "the monitoring policy, or connect you with HR."),
)


def decision_block(text: str) -> tuple[str, str] | None:
    """(category, fixed safe message) for a forbidden decision request."""
    for category, pattern, message in _DECISION_BLOCKS:
        if pattern.search(text):
            return category, message
    return None


# ── Prompt clauses ────────────────────────────────────────────────────────────
_PROTECTED_CLAUSE = """
[PROTECTED RIGHTS]
- This question touches a protected-rights area (health, family, pregnancy, disability, bereavement, safety,
  pay discussion, union or reporting activity). Use only the minimum personal detail needed; never ask for or
  speculate about a diagnosis or other sensitive detail.
- Never state that the employee has no right to time off, pay or protection when the evidence is silent or
  incomplete. If an ordinary balance or option seems unavailable, say that other statutory, accommodation or
  unpaid options may exist and that HR can check them.
- Never state or imply a blanket ban on discussing pay, raising concerns, union activity or reporting to a
  regulator.
"""

_DISPUTE_CLAUSE = """
[DISPUTE BOUNDARY]
- The user is asking for a verdict on a dispute (lawfulness, fairness, discrimination, underpayment). Do not
  give one, and do not say the concern is or is not valid. Explain only what the evidence says about the
  relevant policy and the process or reporting routes, and recommend 'Talk to HR' for a review.
"""


def prompt_clause(assessment: Assessment) -> str:
    """Extra system-prompt text for a domain-classified policy question."""
    parts = []
    domain = assessment.domain
    if domain:
        never = "\n".join(f"  - {rule}" for rule in domain.never)
        parts.append(f"""
[POLICY DOMAIN: {domain.label.upper()}]
- This is a {domain.label} question. You explain approved policy only; entitlements, amounts, approvals and
  legal applicability are decided by the platform's workflows and HR, not by you.
- Never:
{never}
- Answer shape: give the direct answer first. Then, only where the evidence states them, name the policy it
  comes from and who it applies to (location, entity or employee group) or its effective date, and note when it
  is employer policy rather than law or when local rules may differ. Finish with one short next step (the
  screen to use, or 'Talk to HR').
""")
    if assessment.tier == PROTECTED:
        parts.append(_PROTECTED_CLAUSE)
    elif assessment.tier == DISPUTE:
        parts.append(_DISPUTE_CLAUSE)
    return "".join(parts)


def no_content_message(assessment: Assessment) -> str | None:
    """Domain-specific fallback when retrieval finds no approved content.
    The leave case with a protected trigger follows Leave spec 33.2: running
    out of a balance must never read as "you can't take time off"."""
    domain = assessment.domain
    if not domain:
        return None
    message = domain.no_content
    if domain.key == "leave_attendance" and assessment.tier == PROTECTED:
        message += (
            " If you need time off for a health, family or other protected reason, HR can check every option "
            "open to you — an empty balance doesn't necessarily mean you can't take the time."
        )
    elif assessment.tier == DISPUTE:
        message += " For a concern about how something was handled, HR can review it with you."
    return message
