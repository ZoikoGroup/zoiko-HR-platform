"""
tests/test_assistant_policy_domains.py
------------------------------------------
Domain classification, risk tiers and decision blocks for HR policy
questions (docs/new_docs chatbot engineering wireframes: Attendance & Leave,
Benefits & Compensation, Expense Reimbursement, Remote Work, Onboarding &
Offboarding, Handbook & Code of Conduct, Compliance & Jurisdiction).
"""

from app.modules.assistant import guardrails, policy_domains as pd
from app.modules.assistant import orchestration_service as orch


def _domain(text):
    d = pd.classify(text)
    return d.key if d else None


def test_questions_route_to_their_policy_domain():
    cases = {
        "What is the sick leave policy?": "leave_attendance",
        "How does maternity leave work here?": "leave_attendance",
        "Is bereavement leave paid?": "leave_attendance",
        "What benefits am I eligible for?": "benefits_compensation",
        "How are bonuses calculated?": "benefits_compensation",
        "Can I join the pension plan?": "benefits_compensation",
        "What receipts do I need for an expense claim?": "expense_reimbursement",
        "What is the mileage rate for travel?": "expense_reimbursement",
        "What is the work from home policy?": "remote_work",
        "Can I work from another country for a month?": "remote_work",
        "What is the onboarding process for new hires?": "onboarding_offboarding",
        "What is the notice period if I resign?": "onboarding_offboarding",
        "What does the code of conduct say about gifts?": "handbook_conduct",
        "Is there a dress code?": "handbook_conduct",
        "Which workplace policies apply to my location?": "compliance_jurisdiction",
        "What are the health and safety rules?": "compliance_jurisdiction",
    }
    for text, expected in cases.items():
        assert _domain(text) == expected, text


def test_unrelated_questions_have_no_domain():
    for text in ("What is Zoiko HR?", "Tell me a joke", "what's the weather"):
        assert pd.classify(text) is None, text


def test_classify_intent_is_unchanged_for_domain_questions():
    # Tool authorization keys off "policy_qa"; the domain suffix is added later.
    for text in ("What is the work from home policy?", "What does the code of conduct say about gifts?"):
        assert orch.classify_intent(text) == "policy_qa", text


def test_own_records_get_a_deterministic_pointer_not_a_rag_guess():
    for text, screen in (
        ("What is my salary?", "/employee/documents/payslips"),
        ("What's the status of my expense claim?", "/employee/travel/expenses"),
        ("Have I completed my onboarding?", "/zoiko-hr/onboarding/documents"),
    ):
        a = pd.assess(text)
        assert a.tier == pd.PERSONAL, text
        assert screen in a.personal_answer, text
    final_pay = pd.assess("When will I get my final pay?")
    assert final_pay.tier == pd.PERSONAL
    assert "Talk to HR" in final_pay.personal_answer


def test_protected_rights_context_is_flagged():
    for text in (
        "I'm sick and have no sick days left, can I take time off?",
        "Can I take leave for my father's funeral?",
        "Am I allowed to discuss my salary with coworkers?",
    ):
        assert pd.assess(text).tier == pd.PROTECTED, text


def test_dispute_questions_are_never_adjudicated():
    for text in (
        "Was my dismissal lawful?",
        "Am I being underpaid because I am a woman?",
        "I think this was wrongful termination",
    ):
        a = pd.assess(text)
        assert a.tier == pd.DISPUTE, text
        assert "[DISPUTE BOUNDARY]" in pd.prompt_clause(a)


def test_decision_requests_are_blocked():
    cases = {
        "Should I terminate this employee?": "adverse_action",
        "Who should we lay off this quarter?": "adverse_action",
        "Can I give him attendance points for being sick?": "adverse_action",
        "How much raise should I give Priya?": "pay_decision",
        "Approve my expense claim": "expense_decision",
        "Is she committing fraud with these receipts?": "expense_decision",
        "How can I hide my location while working from Spain?": "location_concealment",
        "Can I work on a tourist visa in Dubai?": "location_concealment",
        "How do we secretly monitor employees' chats?": "covert_monitoring",
    }
    for text, category in cases.items():
        block = pd.decision_block(text)
        assert block and block[0] == category, text


def test_ordinary_process_questions_are_not_blocked():
    for text in (
        "How do I resign?",
        "Can I claim a monitor I bought for remote work?",
        "What is the disciplinary process?",
        "Can I work from home on Fridays?",
        "What is the sick leave policy?",
        "How do I report harassment?",
    ):
        assert pd.decision_block(text) is None, text


def test_prompt_clause_carries_the_domain_never_list():
    clause = pd.prompt_clause(pd.assess("What is the expense policy for hotels?"))
    assert "[POLICY DOMAIN: EXPENSES AND REIMBURSEMENT]" in clause
    assert "approve or reject a claim" in clause
    assert pd.prompt_clause(pd.assess("What is Zoiko HR?")) == ""


def test_no_content_fallback_never_denies_protected_leave():
    msg = pd.no_content_message(pd.assess("I have no sick days left, can I take sick leave?"))
    assert "doesn't necessarily mean you can't take the time" in msg
    assert pd.no_content_message(pd.assess("What is Zoiko HR?")) is None


def test_no_domain_clause_text_hard_codes_statutory_values():
    # Red line in every spec: no statutory durations/rates/caps in prompts.
    import re
    for d in pd.DOMAINS:
        text = " ".join(d.never) + d.no_content
        assert not re.search(r"\b\d+\s*(days?|weeks?|months?|%|percent)\b", text), d.key


def test_domain_clause_headers_count_as_prompt_leaks():
    assert guardrails.check_output_disclosure("[POLICY DOMAIN: LEAVE AND ATTENDANCE] ...") == "prompt_leak"
    assert guardrails.check_output_disclosure("[PROTECTED RIGHTS] ...") == "prompt_leak"
