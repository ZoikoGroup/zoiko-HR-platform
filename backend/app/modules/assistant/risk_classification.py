"""
modules/assistant/risk_classification.py
--------------------------------------------
Deterministic intent/risk classification for restricted and high-risk HR
categories (AI Guardrail spec, Sections 8, 18, 19). Runs before any model
call — classification gates routing, so a low-confidence/no-match result
must never silently fall through to an ungrounded or higher-risk path.

Two response modes, per the spec's own permitted/not-permitted framing:
- HARD_BLOCK: never reaches generation. A fixed safe message is returned
  directly (self-harm, adverse-employment recommendations, third-party
  medical/disability inference — all high-precision, low-ambiguity patterns
  where a deterministic refusal is strictly safer than any model output).
- SOFT_FLAG: generation still runs (so the assistant stays useful for
  legitimate policy/process questions), but orchestration adds a stronger
  system-prompt clause and forces a supportive/boundary framing
  (sensitive workplace cases, professional-advice-seeking questions).

This is keyword/regex based, not an ML classifier — consistent with the
existing deterministic intent routing in orchestration_service.py, and
preferred by the spec's own doctrine ("prompts are not security boundaries";
deterministic controls over model reliance) wherever a pattern is
high-precision enough to encode directly.
"""

import re
from dataclasses import dataclass

HARD_BLOCK = "hard_block"
SOFT_FLAG = "soft_flag"

SELF_HARM_RE = re.compile(
    r"\b(suicid\w*|kill myself|end my life|self[- ]?harm|hurt myself|want to die|no reason to live|"
    r"don'?t want to (live|be here)(\s+anymore)?|not want(ing)? to live)\b",
    re.IGNORECASE,
)
ADVERSE_EMPLOYMENT_RE = re.compile(
    r"\b(who should i (fire|terminate|let go)|should i fire|recommend (firing|terminating)|"
    r"who (to|should i) (fire|let go)|help me decide who to (fire|terminate))\b",
    re.IGNORECASE,
)
MEDICAL_INFERENCE_RE = re.compile(
    r"\b(does .*(have|has) a (disability|medical condition)|diagnos\w*|"
    r"why is .*(always|often|constantly) (absent|sick|out)|"
    r"(infer|guess|figure out) .*(condition|illness|disability))\b",
    re.IGNORECASE,
)
PROFESSIONAL_ADVICE_RE = re.compile(
    r"\b(is (it|this) legal|should i sue|lawsuit|legal advice|sue (my|the) (employer|company)|"
    r"how much tax (should|do) i|tax advice|reduce my taxes|file a lawsuit)\b",
    re.IGNORECASE,
)
SENSITIVE_CASE_RE = re.compile(
    r"\b(harass\w*|discriminat\w*|retaliat\w*|hostile work environment|"
    r"report (a |an )?(complaint|grievance)|file a grievance|being bullied)\b",
    re.IGNORECASE,
)

SAFE_MESSAGES = {
    "self_harm": (
        "I'm really sorry you're going through this. If you or someone else may be in immediate danger, "
        "please contact your local emergency services right now. I can also connect you with HR for "
        "confidential support — would you like me to do that?"
    ),
    "disciplinary_recommendation": (
        "I can't recommend disciplinary or termination decisions — that requires human judgment and your "
        "organization's approved process. I can share the relevant policy or process steps, or connect you "
        "with HR."
    ),
    "medical_inference": (
        "I can't speculate about someone's medical condition or disability. If this is about an accommodation "
        "or attendance concern, I can point you to the approved process, or connect you with HR."
    ),
}

CATEGORY_HARD_BLOCK_PATTERNS = (
    ("self_harm", SELF_HARM_RE),
    ("disciplinary_recommendation", ADVERSE_EMPLOYMENT_RE),
    ("medical_inference", MEDICAL_INFERENCE_RE),
)
CATEGORY_SOFT_FLAG_PATTERNS = (
    ("professional_advice", PROFESSIONAL_ADVICE_RE),
    ("sensitive_case", SENSITIVE_CASE_RE),
)


@dataclass
class RiskClassification:
    category: str
    mode: str
    safe_message: str | None = None


def classify(text: str) -> RiskClassification | None:
    for category, pattern in CATEGORY_HARD_BLOCK_PATTERNS:
        if pattern.search(text):
            return RiskClassification(category, HARD_BLOCK, SAFE_MESSAGES[category])
    for category, pattern in CATEGORY_SOFT_FLAG_PATTERNS:
        if pattern.search(text):
            return RiskClassification(category, SOFT_FLAG)
    return None
