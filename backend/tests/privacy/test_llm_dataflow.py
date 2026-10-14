"""D07 / D06: what reaches the language-model provider."""
from app.core.privacy import redact
from app.modules.assistant import llm_client


def test_D07_identifiers_are_scrubbed_from_every_message_and_the_input_is_not_modified():
    messages = [
        {"role": "system", "content": "You answer HR policy questions."},
        {"role": "user", "content": "my login is jane@corp.example, token=abc123xyz789, IBAN GB82WEST12345698765432, PAN ABCDE1234F, CANARY-MEDICAL-A1; what is the carry forward rule?"},
    ]
    out = redact.scrub_messages(messages)
    text = " ".join(m["content"] for m in out)
    for raw in ("jane@corp.example", "abc123xyz789", "GB82WEST12345698765432", "ABCDE1234F", "CANARY-MEDICAL"):
        assert raw not in text, raw
    assert "carry forward rule" in text and out[0]["content"] == messages[0]["content"]
    assert "jane@corp.example" in messages[1]["content"], "the caller's list is untouched"
    assert redact.scrub_messages([{"role": "user", "content": None}]) == [{"role": "user", "content": None}]


def test_D07_the_gateway_sends_only_scrubbed_messages(monkeypatch):
    sent = {}

    class _Completions:
        def create(self, **kw):
            sent.update(kw)
            msg = type("M", (), {"content": "ok"})()
            return type("C", (), {"choices": [type("Ch", (), {"message": msg})()], "usage": None})()

    class _Client:
        chat = type("Chat", (), {"completions": _Completions()})()

    monkeypatch.setattr(llm_client, "_get_client", lambda: _Client())
    llm_client.generate([{"role": "user", "content": "email me at a.b@corp.example about CANARY-IBAN-A1-000111"}])
    body = str(sent["messages"])
    assert "a.b@corp.example" not in body and "CANARY-IBAN" not in body


def test_D07_no_assistant_tool_feeds_pay_or_case_data_into_a_prompt():
    from app.core.privacy import classification as cls
    from app.modules.assistant import tool_registry as reg
    for tool in reg.TOOLS.values():
        for field in tool.fields or ():
            level = cls.classify(tool.resource, field)
            assert level not in (cls.Level.FINANCIAL, cls.Level.SPECIAL_CATEGORY, cls.Level.SECRET, cls.Level.TENANT_BUSINESS_FINANCE), (tool.name, field, level)
