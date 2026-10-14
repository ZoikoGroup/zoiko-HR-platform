# Language-model data flow (Mira)

| Item | Value |
|---|---|
| Provider | Groq (`modules/assistant/llm_client.py`), model `HR_GROQ_MODEL` (default `openai/gpt-oss-120b`) |
| Embeddings | `fastembed` (`BAAI/bge-small-en-v1.5`) run locally, not sent to a provider |
| What is sent | the system prompt, the person's question, and retrieved policy passages from THEIR organization's published knowledge base (`retrieval_service.retrieve` filters by organization) |
| What is NOT sent | pay, bank, tax, health or case values: no tool feeds FINANCIAL or SPECIAL_CATEGORY fields into a prompt (`tests/privacy/test_llm_dataflow.py` checks every registered tool). Leave balances, attendance and the company directory are answered by code from the database, not by the model |
| Scrubbing before sending | `core/privacy/redact.scrub_messages` on every call (`generate`, `stream`, `stream_text_and_metadata`): tokens, keys, e-mail addresses, IBAN, card, tax and national ids |
| Who can use it | the signed-in person, with their own rights (`assistant/tool_registry.py` + `authorize`); a platform identity gets 404 from every assistant route |
| Injection | a prompt (or text inside an attached document) cannot change who the caller is: the decision is made from the signed account |
| Logging | prompts and completions are stored in the assistant tables (`chat_turns`, `chat_responses`, classified PERSONAL_CONFIDENTIAL) under the organization's retention rules (`retention_service.py`); log lines pass through the redacting filter |
| Provider retention | **not recorded in the repository.** The provider's retention and training settings for this API key must be confirmed in the provider account and written here: `retention: ______  training on inputs: ______  confirmed by ______ on ______` |
| Approval for sensitive content | none given. Sending FINANCIAL or SPECIAL_CATEGORY content to the provider requires a documented decision before any tool is allowed to do it |
