# Copilot evaluation (M1-15)

A fixed set of questions with the expected behaviour (`cases.json`), and a runner that scores the assistant against it.

| Layer | What it checks | Model calls | When |
|---|---|---|---|
| **offline** | routing: intent, the screen a "where is" question resolves to for that role, restricted requests blocked before the model, invented screen names not matched to a real screen | none | every PR (CI: `tests/test_copilot_eval.py`) |
| **live** | the real answer: right screen named, every "A → B" menu path is real, refusals, policy answers grounded or labelled as general guidance, app questions not answered as "missing policy" | yes, via a running backend | on demand, before and after copilot changes |

Scores per dimension (0-100) and an overall score. A run more than **3 points** below `baseline.json` fails.

## Run it (from `backend/`)

```powershell
python evals/run_eval.py                                  # offline
python evals/run_eval.py --live --base-url http://127.0.0.1:8010
python evals/run_eval.py --live --only inv-                # just the invented-screen cases
python evals/run_eval.py --rescore evals/results/live-<time>.json   # re-score saved answers after changing checks
python evals/run_eval.py --save-baseline                  # (or with --live / --rescore) record a new baseline
```

For the live baseline's setup, load the platform guide into a second local organization and run the backend with
`HR_PLATFORM_KNOWLEDGE_ORG_ID` set to it (`python scripts/seed_platform_guide.py <owner_employee_id>`), as
production does. Without it, "What is Zoiko HR?" has nothing to answer from.

Live needs one sign-in per role: copy `accounts.example.json` to `accounts.local.json` (git-ignored). Use a local or
staging backend with test accounts, never production: each case creates a real conversation. Results go to
`results/` (git-ignored) with every answer, so a failure can be read, not guessed.

## Adding a case

Add it to `cases.json`. Run the offline layer; if it fails, decide whether the **expectation** is wrong (fix the case)
or the **assistant** is wrong (keep the case: it is a known gap, and the baseline records it). Re-save the baseline
only when a change is intended, and say why in the PR.

## Not done yet

- Results are saved as JSON files; the `copilot_eval_runs` table and the nightly run need the staging environment
  (M1-05, deferred).
- 63 cases so far; the target is 150.
