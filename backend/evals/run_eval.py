"""
evals/run_eval.py — run the copilot evaluation (M1-15). From backend/:

    python evals/run_eval.py                       # offline layer: routing only, no model, no database (also in CI)
    python evals/run_eval.py --live                # live layer: asks a running backend, scores the real answers
    python evals/run_eval.py --live --base-url http://127.0.0.1:8000 --only nav-emp-apply-leave
    python evals/run_eval.py --save-baseline       # record this run's scores as the baseline (commit baseline.json)

Live accounts: one sign-in per role, from evals/accounts.local.json (git-ignored; copy accounts.example.json) or the
EVAL_ACCOUNTS environment variable (same JSON). Use a LOCAL or staging backend with test accounts, never production
customers: every case creates a real conversation.

Results: evals/results/<layer>-<UTC time>.json (git-ignored) with every case's checks and the answer it got.
Exit code 1 when a score drops more than 3 points below the baseline.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import time

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from evals import scoring  # noqa: E402

ACCOUNTS_FILE = scoring.EVALS / "accounts.local.json"
RESULTS = scoring.EVALS / "results"


def _accounts() -> dict:
    raw = os.environ.get("EVAL_ACCOUNTS") or (ACCOUNTS_FILE.read_text(encoding="utf-8") if ACCOUNTS_FILE.exists() else "")
    if not raw:
        sys.exit("No live accounts: copy evals/accounts.example.json to evals/accounts.local.json (or set EVAL_ACCOUNTS).")
    return json.loads(raw)


class LiveClient:
    def __init__(self, base_url: str, accounts: dict, timeout: float = 90.0):
        import httpx
        self.http = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout)
        self.accounts = accounts
        self.tokens: dict[str, str] = {}

    def _token(self, role: str) -> str:
        if role not in self.tokens:
            acct = self.accounts.get(role)
            if not acct:
                raise RuntimeError(f"no account for role {role!r} in the live accounts")
            r = self.http.post("/auth/login", json={"email": acct["email"], "password": acct["password"]})
            r.raise_for_status()
            self.tokens[role] = r.json()["access_token"]
        return self.tokens[role]

    def ask(self, role: str, question: str) -> dict:
        """One fresh conversation per question, so no case sees another's history."""
        headers = {"Authorization": f"Bearer {self._token(role)}"}
        conv = self.http.post("/assistant/conversations", json={"title": "eval"}, headers=headers)
        conv.raise_for_status()
        turn = self.http.post(f"/assistant/conversations/{conv.json()['id']}/turns", json={"text": question},
                              headers=headers)
        turn.raise_for_status()
        data = turn.json()
        if data.get("status") == "generating":
            data = self._stream(data["id"], headers) or data
        return data

    def _stream(self, turn_id: int, headers: dict) -> dict | None:
        event, final = None, None
        with self.http.stream("GET", f"/assistant/turns/{turn_id}/stream", headers=headers) as r:
            for line in r.iter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:") and event == "turn.completed":
                    final = json.loads(line[5:])
        return final


def run(layer: str, cases: list[dict], base_url: str | None) -> list[scoring.CaseResult]:
    results = []
    client = LiveClient(base_url, _accounts()) if layer == "live" else None
    for i, case in enumerate(cases, 1):
        if layer == "offline":
            results.append(scoring.run_offline(case))
            continue
        started = time.monotonic()
        try:
            turn = client.ask(case["role"], case["q"])
            res = scoring.check_live(case, turn)
        except Exception as exc:                                 # noqa: BLE001 — a failed call is a failed case
            res = scoring.CaseResult(case["id"], case["category"], {"answered": False}, {"error": repr(exc)[:300]})
        res.detail["seconds"] = round(time.monotonic() - started, 1)
        results.append(res)
        print(f"[{i}/{len(cases)}] {'PASS' if res.passed else 'FAIL'} {case['id']}")
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description="Copilot evaluation harness (M1-15)")
    ap.add_argument("--live", action="store_true", help="ask a running backend (default: offline routing layer)")
    ap.add_argument("--base-url", default=os.environ.get("EVAL_BASE_URL", "http://127.0.0.1:8000"))
    ap.add_argument("--only", nargs="*", help="case ids (or id prefixes) to run")
    ap.add_argument("--save-baseline", action="store_true", help="store this run's scores as the baseline")
    ap.add_argument("--rescore", metavar="RESULTS_JSON",
                    help="re-score the answers saved in a live results file (after changing checks), no model calls")
    args = ap.parse_args()

    layer = "live" if (args.live or args.rescore) else "offline"
    cases = scoring.load_cases()
    if args.only:
        cases = [c for c in cases if any(c["id"].startswith(p) for p in args.only)]
    if args.rescore:
        saved = {c["id"]: c["detail"] for c in json.loads(pathlib.Path(args.rescore).read_text(encoding="utf-8"))["cases"]}
        results = [scoring.check_live(c, {"answer_text": saved[c["id"]].get("answer", ""),
                                          "answer_type": saved[c["id"]].get("answer_type"),
                                          "intent": saved[c["id"]].get("intent"),
                                          "sources": [None] * int(saved[c["id"]].get("sources") or 0)})
                   for c in cases if c["id"] in saved]
    else:
        results = run(layer, cases, args.base_url)
    summary = scoring.score(results)

    RESULTS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RESULTS / f"{layer}-{stamp}.json"
    out.write_text(json.dumps({"layer": layer, "summary": summary,
                               "cases": [r.__dict__ for r in results]}, indent=2, default=str), encoding="utf-8")

    print(f"\n{layer.upper()} — overall {summary['overall']}  ({summary['cases']} cases, {len(summary['failed'])} failed)")
    for dim, value in summary["dimensions"].items():
        print(f"  {dim:<22} {value}")
    for r in results:
        if not r.passed:
            failed = [d for d, ok in r.checks.items() if not ok]
            print(f"  FAIL {r.id}: {', '.join(failed)}  {json.dumps({k: v for k, v in r.detail.items() if k != 'answer'})[:200]}")
    print(f"Results: {out}")

    if args.save_baseline:
        if args.only:
            sys.exit("Refusing to save a baseline from a partial run (--only).")
        data = json.loads(scoring.BASELINE_FILE.read_text(encoding="utf-8")) if scoring.BASELINE_FILE.exists() else {}
        data[layer] = {"overall": summary["overall"], "dimensions": summary["dimensions"], "cases": summary["cases"],
                       "recorded": stamp}
        scoring.BASELINE_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"Baseline saved for {layer}.")
        return

    problems = [] if args.only else scoring.compare(summary, scoring.load_baseline(layer))
    for p in problems:
        print(f"::error::{p}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
