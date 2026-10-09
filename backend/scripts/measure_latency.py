"""Measure per-request latency against a running backend.

Baseline tool for the phase-1 performance work. With HR_LOG_QUERY_STATS=true on
the server, every response carries X-Query-Count / X-DB-Time / X-Pool-Checkouts
headers, so this script reads those directly instead of parsing logs.

What it reports:
  * the raw SELECT 1 round-trip time to Neon (min/median/p95 over 20 runs) —
    the network cost every DB query pays before any SQL runs;
  * for each endpoint: median total_ms, median queries, median db_ms, median
    pool checkouts over 5 calls (as a super admin and as an org admin/HR admin).

Credentials are NEVER hardcoded: pass them on the CLI or via the env vars
HR_MEASURE_SA_EMAIL / HR_MEASURE_SA_PASSWORD / HR_MEASURE_ORG_EMAIL /
HR_MEASURE_ORG_PASSWORD.

Usage:
    HR_LOG_QUERY_STATS=true uvicorn app.main:app --port 8000   # server side
    python scripts/measure_latency.py \\
        --super-admin sa@zoikohr.com --super-admin-password '...' \\
        --org-admin admin@acme.com --org-admin-password '...'
"""

import argparse
import math
import os
import sys
import time

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import url as sa_url

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BACKEND_DIR, ".env"), override=False)

N_RUNS = 5
N_SELECT1 = 20


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def percentile(xs, p):
    xs = sorted(xs)
    if not xs:
        return 0.0
    k = (len(xs) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    if lo == hi:
        return xs[int(k)]
    return xs[lo] * (hi - k) + xs[hi] * (k - lo)


def select1_roundtrip():
    raw = os.getenv("HR_DATABASE_URL", "").strip()
    if not raw:
        print("SELECT 1: skipped (HR_DATABASE_URL not set)")
        return None
    parsed = sa_url.make_url(raw)
    # Neon requires TLS; default to require when the URL does not say otherwise.
    if parsed.get_backend_name() not in ("sqlite",) and not parsed.query.get("sslmode"):
        parsed = parsed.set(query={**parsed.query, "sslmode": "require"})
    engine = create_engine(parsed, pool_pre_ping=False)
    conn = engine.connect()
    try:
        conn.execute(text("SELECT 1"))  # warm the TLS/auth handshake
        times = []
        for _ in range(N_SELECT1):
            t = time.perf_counter()
            conn.execute(text("SELECT 1"))
            times.append((time.perf_counter() - t) * 1000)
    finally:
        conn.close()
        engine.dispose()
    return {
        "min_ms": min(times),
        "median_ms": median(times),
        "p95_ms": percentile(times, 0.95),
    }


class Session:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")
        self.http = requests.Session()

    def call(self, method, path, *, params=None, json=None, headers=None, retries=6):
        url = f"{self.base}{path}"
        for attempt in range(retries):
            t = time.perf_counter()
            try:
                resp = self.http.request(method, url, params=params, json=json, headers=headers, timeout=120)
                elapsed = (time.perf_counter() - t) * 1000
            except requests.RequestException as exc:
                print(f"    ! request error on {method} {path}: {exc}")
                time.sleep(2)
                continue
            if resp.status_code == 429 and attempt < retries - 1:
                print(f"    ! 429 rate-limited on {path}; sleeping 6s before retry")
                time.sleep(6)
                continue
            return resp, elapsed
        return None, None


def measure(sess: Session, label, method, path, *, params=None, json=None, headers=None):
    rows = []
    for _ in range(N_RUNS):
        resp, elapsed = sess.call(method, path, params=params, json=json, headers=headers)
        if resp is None:
            print(f"{label:46s}  ERROR (no response)")
            return None
        row = {
            "status": resp.status_code,
            "total_ms": elapsed,
            "queries": int(resp.headers.get("X-Query-Count") or 0),
            "db_ms": float(resp.headers.get("X-DB-Time") or 0),
            "checkouts": int(resp.headers.get("X-Pool-Checkouts") or 0),
        }
        rows.append(row)
    return {
        "status": rows[0]["status"],
        "total_ms": median(r["total_ms"] for r in rows),
        "queries": median(r["queries"] for r in rows),
        "db_ms": median(r["db_ms"] for r in rows),
        "checkouts": median(r["checkouts"] for r in rows),
    }


def measure_many(sess: Session, items, auth_headers):
    out = {}
    for label, method, path, params in items:
        m = measure(sess, label, method, path, params=params, headers=auth_headers)
        out[label] = m
        if m:
            print(f"{label:46s} status={m['status']:<3} total_ms={m['total_ms']:8.1f} "
                  f"queries={m['queries']:4.0f} db_ms={m['db_ms']:9.1f} checkouts={m['checkouts']}")
        sys.stdout.flush()
    return out


def login(sess: Session, email, password):
    resp, elapsed = sess.call("POST", "/auth/login", json={"email": email, "password": password})
    if resp is None or resp.status_code != 200:
        print(f"LOGIN FAILED for {email}: status={getattr(resp, 'status_code', None)} {getattr(resp, 'text', '')[:200]}")
        sys.exit(2)
    return resp.json()


SA_ENDPOINTS = [
    ("command-center overview", "GET", "/super-admin/command-center/overview", {"days": 30}),
    ("command-center attention", "GET", "/super-admin/command-center/attention", None),
    ("command-center customer-health", "GET", "/super-admin/command-center/customer-health", None),
    ("command-center commercial-health", "GET", "/super-admin/command-center/commercial-health", {"days": 30}),
    ("command-center lifecycle", "GET", "/super-admin/command-center/lifecycle", None),
    ("command-center platform-health", "GET", "/super-admin/command-center/platform-health", None),
    ("command-center security", "GET", "/super-admin/command-center/security", {"days": 30}),
    ("command-center audit-logs(8)", "GET", "/super-admin/audit-logs", {"limit": 8}),
    ("org list", "GET", "/super-admin/organizations", {"page": 1, "page_size": 20, "deleted": "active"}),
    ("billing plans", "GET", "/billing/plans", None),
    ("billing discounts", "GET", "/billing/discounts", None),
    ("billing delinquency", "GET", "/billing/delinquency", None),
    ("refunds list", "GET", "/billing/refunds", {"page": 1, "page_size": 20}),
    ("refunds summary", "GET", "/billing/refunds/summary", None),
    ("audit-log list(50)", "GET", "/super-admin/audit-logs", {"page": 1, "page_size": 50}),
]

ORG_ENDPOINTS = [
    ("trivial /auth/me", "GET", "/auth/me", None),
    ("employees list", "GET", "/hr/employee-management/employees", {"page": 1, "per_page": 10}),
    ("hr dashboard stats", "GET", "/hr/dashboard/stats", None),
    ("hr employees", "GET", "/hr/employees", None),
    ("hr departments", "GET", "/hr/departments", None),
    ("hr attendance dashboard", "GET", "/hr/attendance/dashboard", None),
    ("hr leaves dashboard", "GET", "/hr/leaves/dashboard", None),
    ("hr compensation dashboard", "GET", "/hr/compensation/dashboard", None),
    ("hr performance dashboard", "GET", "/hr/performance/dashboard", None),
    ("hr organization", "GET", "/hr/organization", None),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default=os.getenv("HR_MEASURE_BASE_URL", "http://localhost:8000"))
    ap.add_argument("--super-admin", default=os.getenv("HR_MEASURE_SA_EMAIL"))
    ap.add_argument("--super-admin-password", default=os.getenv("HR_MEASURE_SA_PASSWORD"))
    ap.add_argument("--org-admin", default=os.getenv("HR_MEASURE_ORG_EMAIL"))
    ap.add_argument("--org-admin-password", default=os.getenv("HR_MEASURE_ORG_PASSWORD"))
    ap.add_argument("--super-admin-token", default=os.getenv("HR_MEASURE_SA_TOKEN"),
                    help="already-issued JWT; skips the login step")
    ap.add_argument("--org-admin-token", default=os.getenv("HR_MEASURE_ORG_TOKEN"),
                    help="already-issued JWT; skips the login step")
    ap.add_argument("--no-select1", action="store_true", help="skip the SELECT 1 round-trip probe")
    args = ap.parse_args()

    if not args.no_select1:
        rt = select1_roundtrip()
        if rt:
            print(f"SELECT 1 round-trip (Neon, {N_SELECT1} warm runs): min={rt['min_ms']:.1f}ms "
                  f"median={rt['median_ms']:.1f}ms p95={rt['p95_ms']:.1f}ms")
    else:
        print("SELECT 1 round-trip: skipped (--no-select1)")

    sess = Session(args.base_url)

    if args.org_admin_token or (args.org_admin and args.org_admin_password):
        print(f"\n== org admin: {args.org_admin or '<token>'}")
        if args.org_admin_token:
            tokens = {"access_token": args.org_admin_token}
            refresh = None
            measured_login = None
        else:
            tokens = login(sess, args.org_admin, args.org_admin_password)
            refresh = tokens.get("refresh_token")
            measured_login = measure(sess, "auth login", "POST", "/auth/login",
                                     json={"email": args.org_admin, "password": args.org_admin_password})
        org_headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        if measured_login:
            m = measured_login
            print(f"{'auth login':46s} status={m['status']:<3} total_ms={m['total_ms']:8.1f} "
                  f"queries={m['queries']:4.0f} db_ms={m['db_ms']:9.1f} checkouts={m['checkouts']}")
        if refresh:
            m = measure(sess, "auth refresh", "POST", "/auth/refresh", json={"refresh_token": refresh})
            print(f"{'auth refresh':46s} status={m['status']:<3} total_ms={m['total_ms']:8.1f} "
                  f"queries={m['queries']:4.0f} db_ms={m['db_ms']:9.1f} checkouts={m['checkouts']}")

        measure_many(sess, ORG_ENDPOINTS, org_headers)

        # Resolve one employee id for the profile call (not measured).
        resp, _ = sess.call("GET", "/hr/employee-management/employees",
                            params={"page": 1, "per_page": 10}, headers=org_headers)
        emp_id = None
        if resp is not None and resp.status_code == 200:
            data = resp.json()
            items = data.get("employees") or data.get("items") or []
            if items:
                emp_id = items[0].get("id")
        if emp_id:
            m = measure(sess, "employee profile", "GET", f"/hr/employee-management/employees/{emp_id}",
                        headers=org_headers)
            print(f"{'employee profile':46s} status={m['status']:<3} total_ms={m['total_ms']:8.1f} "
                  f"queries={m['queries']:4.0f} db_ms={m['db_ms']:9.1f} checkouts={m['checkouts']}")
        else:
            print(f"{'employee profile':46s}  ERROR (no employee found in list)")

    if args.super_admin_token or (args.super_admin and args.super_admin_password):
        print(f"\n== super admin: {args.super_admin or '<token>'}")
        if args.super_admin_token:
            tokens = {"access_token": args.super_admin_token}
        else:
            tokens = login(sess, args.super_admin, args.super_admin_password)
            m = measure(sess, "auth login", "POST", "/auth/login",
                        json={"email": args.super_admin, "password": args.super_admin_password})
            print(f"{'auth login':46s} status={m['status']:<3} total_ms={m['total_ms']:8.1f} "
                  f"queries={m['queries']:4.0f} db_ms={m['db_ms']:9.1f} checkouts={m['checkouts']}")
        sa_headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        measure_many(sess, SA_ENDPOINTS, sa_headers)

    print("\ndone")


if __name__ == "__main__":
    main()