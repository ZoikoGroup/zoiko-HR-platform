"""Documents module (ZHR-DOCS-ARCH-001): employee document containers, company documents with access rules, the approval
workflow and the documents automation layer.

Layering rules (§3.2): routers -> services -> models. Only `permissions` knows role strings, only `access_resolver` decides
company-document visibility, only `lifecycle.apply_transition` changes a version's status, only `storage_service` touches
files, and domain events leave through `automation.events.emit` inside the business transaction.
"""
