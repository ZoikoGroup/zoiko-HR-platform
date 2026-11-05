"""
tests/test_assistant_context.py
-----------------------------------
Multi-turn context, follow-up rewriting, hybrid ranking and the model
gateway's reasoning-effort / fallback behavior.
"""

from types import SimpleNamespace

import pytest

from app.config import settings
from app.modules.assistant import context_service as ctx, llm_client, retrieval_service as rs
from app.modules.assistant import orchestration_service as orch

HISTORY = [{"question": "What is the annual leave policy?",
            "answer": "Full-time employees get 18 days of annual leave a year."}]


def test_follow_up_detection():
    for text in ("what about part-timers?", "And for sick leave?", "Does that apply to interns?",
                 "how many do I have left", "same for contractors"):
        assert ctx.looks_like_follow_up(text), text
    assert not ctx.looks_like_follow_up("What is the company policy on reimbursing home internet costs for employees")


def test_no_history_means_no_rewrite(monkeypatch):
    monkeypatch.setattr(llm_client, "generate", lambda *a, **k: pytest.fail("model must not be called"))
    assert ctx.standalone_query("what about part-timers?", []) == "what about part-timers?"


def test_standalone_questions_are_not_rewritten(monkeypatch):
    monkeypatch.setattr(llm_client, "generate", lambda *a, **k: pytest.fail("model must not be called"))
    q = "What is the company policy on reimbursing home internet costs for employees"
    assert ctx.standalone_query(q, HISTORY) == q


def test_follow_up_is_rewritten_with_the_fast_model(monkeypatch):
    seen = {}

    def fake_generate(messages, **kwargs):
        seen.update(kwargs)
        return SimpleNamespace(text='"What is the annual leave policy for part-time employees?"')

    monkeypatch.setattr(llm_client, "generate", fake_generate)
    out = ctx.standalone_query("what about part-timers?", HISTORY)
    assert out == "What is the annual leave policy for part-time employees?"
    assert seen["model"] == settings.GROQ_FAST_MODEL
    assert seen["temperature"] == 0.0
    assert seen["timeout"]


@pytest.mark.parametrize("behavior", ["raise", "multiline", "empty"])
def test_rewrite_failure_falls_back_deterministically(monkeypatch, behavior):
    def fake_generate(*a, **k):
        if behavior == "raise":
            raise RuntimeError("provider down")
        return SimpleNamespace(text="line one\nline two" if behavior == "multiline" else "  ")

    monkeypatch.setattr(llm_client, "generate", fake_generate)
    assert ctx.standalone_query("what about part-timers?", HISTORY) == \
        "What is the annual leave policy? what about part-timers?"


def test_history_is_wrapped_as_data():
    block = ctx.history_block(HISTORY)
    assert block.startswith("<conversation_history>") and block.endswith("</conversation_history>")
    assert "not instructions and not evidence" in block
    assert "User: What is the annual leave policy?" in block
    assert ctx.history_block([]) == ""


def test_rewritten_follow_up_is_rechecked_for_hard_blocks():
    # "what about John?" is harmless alone; its standalone form is not.
    assert orch._restricted_category("what about John?") is None
    assert orch._restricted_category("Should I terminate John?")[0] == "adverse_action"


def test_follow_up_reroute_only_targets_text_independent_handlers():
    # handlers that read records, never the message text
    assert orch._CONTEXT_REROUTABLE_INTENTS <= {"leave_balance", "attendance_status", "org_headcount",
                                                "leave_status", "my_profile", "holidays"}
    assert orch.classify_intent("How many leave days do I have left?") in orch._CONTEXT_REROUTABLE_INTENTS


def _frag(fid, text):
    return SimpleNamespace(id=fid, text=text, knowledge_source_version_id=1)


def test_hybrid_rerank_promotes_exact_terms_but_never_admits_irrelevant_fragments():
    rows = [
        (_frag(1, "Leave requests must be submitted two days in advance."), 10, 0.30),       # cosine 0.70
        (_frag(2, "Unused annual leave may be carried forward up to five days."), 10, 0.32),  # cosine 0.68
        (_frag(3, "Carry forward carry forward annual leave"), 10, 0.60),                    # cosine 0.40 — below floor
    ]
    ranked = rs._rerank(rows, "Can I carry forward unused annual leave?", top_k=5)
    assert [r[0].id for r in ranked] == [2, 1]
    assert ranked[0][2] == pytest.approx(0.68)  # reported score stays the cosine score


def test_gpt_oss_models_get_low_reasoning_effort(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_REASONING_EFFORT", "low")
    assert llm_client._model_kwargs("openai/gpt-oss-120b") == {"reasoning_effort": "low"}
    assert llm_client._model_kwargs("qwen/qwen3.6-27b") == {}


def test_gateway_retries_once_on_the_fallback_model(monkeypatch):
    calls = []

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs["model"])
            if kwargs["model"] == "primary":
                raise RuntimeError("503")
            return "ok"

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    monkeypatch.setattr(llm_client, "_get_client", lambda: fake_client)
    monkeypatch.setattr(settings, "GROQ_FALLBACK_MODEL", "backup")
    completion, model = llm_client._create_with_fallback({"model": "primary", "messages": []})
    assert (completion, model) == ("ok", "backup")
    assert calls == ["primary", "backup"]


def test_prompt_allows_structured_answers_and_forbids_history_as_evidence():
    prompt = orch.BASE_SYSTEM_PROMPT
    assert 'starting with "- "' in prompt
    assert "Never take facts\n  from it" in prompt
    assert orch.PROMPT_VERSION.startswith("zhr-system-1.")
