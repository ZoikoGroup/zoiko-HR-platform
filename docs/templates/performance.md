# Template engine — performance and reliability

Measured on 2026-10-22 with `scripts/doc_templates_load_test.py` (synthetic data, SQLite file database, local document store,
Windows 11 developer laptop, single process, rendering in-line). Production runs on PostgreSQL with object storage; treat these
numbers as a lower bound for throughput and an upper bound for per-document overhead from the database driver.

| Scenario | Documents | Wall time (s) | p50 (ms) | p95 (ms) | max (ms) | SQL statements per document |
|---|---|---|---|---|---|---|
| Publish HR-POL-025 to 2000 employees | 2000 | 258.9 | 53 | 83 | 258 | 106.1 |
| Shift notices HR-TIM-003 for 500 people | 500 | 56.2 | 36 | 66 | 259 | 56.0 |

*Per-document time* is `service.generate` (preflight, field resolution, render to HTML and PDF, store, evidence). *Wall time* also
includes the up-front preflight of every recipient (publish checks everyone before anything is issued), delivery, in-app
notifications and the e-mail calls (captured, not sent, in the test).

## What is in place

* **Background rendering** for bulk runs and policy publications over 20 documents (`distribution.BACKGROUND_OVER`): the request
  returns at once; `GET /hr/generated-documents/bulk-runs/{id}` reports `progress` (`done`/`total`/`percent`), and a publication's
  `last_results` grows every 25 documents. Work runs on its own database session in a worker thread.
* **Caching**: fonts are registered once per process (`renderer._fonts`); letterhead data is built once per generation; field
  values are cached per generation context (`FieldContext.cached`).
* **Idempotency**: `Idempotency-Key` on `POST /hr/generated-documents/generate` returns the document a previous call with the same
  key created (unique per organization); on `/issue` a retried call returns the issued document instead of a conflict.
* **E-mail retries**: three immediate attempts per message; failures are logged by document id only and never fail the action.

## Observations and next steps

* About 100 SQL statements per policy document, most of them preflight lookups (pack, variant, clauses, entity, signatory) that
  are identical for every recipient of one publication. Caching the resolved pack/variant/clauses per publication would roughly
  halve the statements; not done in this release to keep each document's decision receipt independently computed.
* The 2,000-person publication spends about 40% of its wall time in the up-front preflight of every recipient. That is the price
  of the "publish never half-issues" rule and is acceptable for a background job.
* p95 stays under 100 ms per document; the maxima (≈ 260 ms) are first-document warm-up (font registration, template parsing).
* Re-run the load test against a staging PostgreSQL with the production document store before the first large tenant goes live
  (release gate R6).
