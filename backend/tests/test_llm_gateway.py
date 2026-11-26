"""
tests/test_llm_gateway.py
--------------------------
M1-11: the LLM provider gateway. Only llm_providers.py imports a provider SDK, the provider recorded on each model
run comes from the gateway (not a hardcoded string), and HR_LLM_PROVIDER=groq (the default) changes nothing.
"""
import pathlib
import re

import pytest

from app.config import settings
from app.modules.assistant import llm_client, llm_providers

APP = pathlib.Path(__file__).resolve().parents[1] / "app"
PROVIDER_SDK_IMPORT = re.compile(r"^\s*(from|import)\s+(groq|openai|anthropic)\b", re.MULTILINE)


def test_only_the_gateway_imports_a_provider_sdk():
    offenders = [str(p.relative_to(APP)) for p in APP.rglob("*.py")
                 if p.name != "llm_providers.py" and PROVIDER_SDK_IMPORT.search(p.read_text(encoding="utf-8"))]
    assert offenders == []


def test_no_hardcoded_provider_names_on_model_runs():
    src = (APP / "modules" / "assistant" / "orchestration_service.py").read_text(encoding="utf-8")
    assert 'provider="groq"' not in src


def test_groq_is_the_default_provider():
    assert llm_providers.provider_name() == "groq"
    assert llm_client.ModelRunResult("x", None, None, 1).provider == "groq"


def test_an_unknown_provider_is_refused(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "nope")
    with pytest.raises(RuntimeError, match="HR_LLM_PROVIDER"):
        llm_providers.provider_name()


def test_calls_go_through_the_configured_provider(monkeypatch):
    calls = []

    class _Completions:
        def create(self, **kwargs):
            calls.append(kwargs["model"])
            msg = type("M", (), {"content": "hi"})()
            return type("C", (), {"choices": [type("Ch", (), {"message": msg})()], "usage": None})()

    class _Fake:
        name = "fake"
        def client(self):
            return type("Cl", (), {"chat": type("Ch", (), {"completions": _Completions()})()})()

    monkeypatch.setattr(llm_providers, "get_provider", lambda: _Fake())
    result = llm_client.generate([{"role": "user", "content": "hello"}], model="m1")
    assert result.text == "hi" and calls == ["m1"]


def test_a_missing_groq_key_fails_clearly(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    with pytest.raises(RuntimeError, match="HR_GROQ_API_KEY"):
        llm_providers.GroqProvider().client()
