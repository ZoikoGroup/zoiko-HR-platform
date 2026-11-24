"""Offboarding: one exit case per leaver, from resignation or HR-started exit to closure.

models   — the case and everything hanging off it (clearance tasks, asset returns, settlement, exit interview, documents,
           timeline) plus the organisation's offboarding settings and checklist templates.
service  — the case state machine and every rule (who may do what, when a case may close, what happens on the last day).
router   — HR/admin endpoints (/hr/offboarding), the person's own endpoints (/hr/me/offboarding) and the public
           exit-documents link (/public/offboarding).
jobs     — the nightly run: finish exits whose last working day has passed, remind owners of overdue tasks and open
           cases for fixed-term contracts that are ending.
"""
