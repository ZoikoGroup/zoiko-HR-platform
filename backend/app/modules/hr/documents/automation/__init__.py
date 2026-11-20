"""Documents automation layer (ZHR-DOCS-ARCH-001 Part IV).

Driven by the existing infrastructure: domain events go out through `integrations.events.emit_event` (in the business
transaction), the integrations worker tick executes due `automation_runs`, and scheduled jobs register next to the
doc_templates jobs on the background leader. No queue product is added.
"""
