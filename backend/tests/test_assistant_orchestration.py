"""
tests/test_assistant_orchestration.py
-----------------------------------------
Regression cases for deterministic intent routing. Added after a production
report: "hi" / "thank you" were falling through to the evidence-required
policy_qa contract, which has nothing to cite for small talk and produced a
scary "temporarily unavailable" reply instead of a normal greeting response.
"""

from app.modules.assistant import orchestration_service as orch


def test_greetings_route_to_chitchat():
    for text in ["hi", "Hi!", "hello", "hey", "Good morning", "good evening."]:
        assert orch.classify_intent(text) == "chitchat:greeting", text


def test_thanks_route_to_chitchat():
    for text in ["thanks", "thank you", "Thank you!", "thx", "much appreciated"]:
        assert orch.classify_intent(text) == "chitchat:thanks", text


def test_farewells_route_to_chitchat():
    for text in ["bye", "goodbye", "see you", "take care"]:
        assert orch.classify_intent(text) == "chitchat:farewell", text


def test_acknowledgements_route_to_chitchat():
    for text in ["ok", "okay", "cool", "great", "got it"]:
        assert orch.classify_intent(text) == "chitchat:ack", text


def test_chitchat_reply_exists_for_every_kind():
    for kind in ("greeting", "thanks", "ack", "farewell"):
        assert kind in orch._CHITCHAT_REPLIES
        assert orch._CHITCHAT_REPLIES[kind]


def test_real_questions_still_route_to_policy_qa_not_chitchat():
    # These share vocabulary with chitchat patterns but are real questions —
    # must not be misclassified just because they start similarly.
    assert orch.classify_intent("What is the annual leave policy?") == "policy_qa"
    assert orch.classify_intent("Hi, what is the sick leave policy?") == "policy_qa"
    assert orch.classify_intent("thanks for nothing, tell me the real policy") == "policy_qa"


def test_book_leave_and_balance_intents_unaffected_by_chitchat_patterns():
    assert orch.classify_intent("Book 2 days of annual leave") == "book_leave"
    assert orch.classify_intent("How many leave days do I have left?") == "leave_balance"
