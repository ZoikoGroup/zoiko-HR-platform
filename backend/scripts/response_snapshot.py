"""Response-equivalence check for performance rewrites.

    python scripts/response_snapshot.py capture before.json --base-url ... (credentials as measure_latency.py)
    python scripts/response_snapshot.py compare before.json --base-url ...

capture: calls every endpoint in measure_latency.py's matrix (and the N+1 page sizes) and stores status + JSON body.
compare: calls them again and reports every endpoint whose body differs. Volatile fields (timestamps generated "now",
detected_at for live signals, request ids) are normalised before comparing.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import measure_latency as ml  # noqa: E402

_VOLATILE_KEYS = {"generated_at", "computed_at_now", "request_id", "correlation_id", "server_time"}
_NOW_LIKE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def _normalise(obj, key=None):
    if isinstance(obj, dict):
        return {k: _normalise(v, k) for k, v in obj.items() if k not in _VOLATILE_KEYS}
    if isinstance(obj, list):
        return [_normalise(v) for v in obj]
    if key == "detected_at" and isinstance(obj, str) and _NOW_LIKE.match(obj):
        return obj[:16]          # live signals stamp "now"; minute precision is stable across a capture/compare pair
    return obj


def _targets(sess, sa_headers, org_headers):
    out = []
    ids = {}
    if org_headers:
        resp, _ = sess.call("GET", "/hr/employee-management/employees", params={"page": 1, "per_page": 10}, headers=org_headers)
        items = (resp.json().get("employees") or resp.json().get("items") or []) if resp is not None and resp.ok else []
        if items:
            ids["emp_id"] = items[min(5, len(items) - 1)]["id"]
        out += [("org", *e) for e in ml._fill(ml.ORG_ENDPOINTS, ids)]
        out += [("org", f"{label} @{n}", "GET", path, {**params, size: n})
                for who, label, path, size, params in ml.SCALING if who == "org" for n in (10, 100)]
    if sa_headers:
        resp, _ = sess.call("GET", "/super-admin/organizations", params={"page": 1, "page_size": 1}, headers=sa_headers)
        orgs = (resp.json().get("organizations") or []) if resp is not None and resp.ok else []
        if orgs:
            ids["org_id"] = orgs[0]["id"]
        out += [("sa", *e) for e in ml._fill(ml.SA_ENDPOINTS, ids)]
        out += [("sa", f"{label} @{n}", "GET", path, {**params, size: n})
                for who, label, path, size, params in ml.SCALING if who == "sa" for n in (10, 100)]
    return out


def run(sess, sa_headers, org_headers):
    result = {}
    for who, label, method, path, params in _targets(sess, sa_headers, org_headers):
        hdr = sa_headers if who == "sa" else org_headers
        resp, _ = sess.call(method, path, params=params, headers=hdr)
        if resp is None:
            continue
        try:
            body = resp.json()
        except ValueError:
            body = resp.text
        result[f"{who}:{label}"] = {"status": resp.status_code, "body": _normalise(body)}
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["capture", "compare"])
    ap.add_argument("file")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--super-admin")
    ap.add_argument("--super-admin-password")
    ap.add_argument("--org-admin")
    ap.add_argument("--org-admin-password")
    a = ap.parse_args()
    sess = ml.Session(a.base_url)
    # Signing in writes audit-log / login-activity rows, which would show up as differences in the audit views. The
    # capture signs in once and stores the tokens; compare reuses them, so it writes nothing.
    tokens = {}
    if a.mode == "compare":
        tokens = json.load(open(a.file, encoding="utf-8")).get("__tokens__", {})
    if a.super_admin and "sa" not in tokens:
        tokens["sa"] = ml.login(sess, a.super_admin, a.super_admin_password)["access_token"]
    if a.org_admin and "org" not in tokens:
        tokens["org"] = ml.login(sess, a.org_admin, a.org_admin_password)["access_token"]
    sa = {"Authorization": f"Bearer {tokens['sa']}"} if "sa" in tokens else None
    org = {"Authorization": f"Bearer {tokens['org']}"} if "org" in tokens else None
    now = run(sess, sa, org)
    if a.mode == "capture":
        now["__tokens__"] = tokens
        json.dump(now, open(a.file, "w", encoding="utf-8"), indent=1, default=str, sort_keys=True)
        print(f"captured {len(now)} responses -> {a.file}")
        return
    before = json.load(open(a.file, encoding="utf-8"))
    before.pop("__tokens__", None)
    diffs = [k for k in before if k in now and json.dumps(before[k], sort_keys=True, default=str) != json.dumps(now[k], sort_keys=True, default=str)]
    missing = [k for k in before if k not in now]
    print(f"compared {len(before)} responses: {len(diffs)} differ, {len(missing)} missing")
    for k in diffs:
        print("  DIFF", k)
    sys.exit(1 if diffs or missing else 0)


if __name__ == "__main__":
    main()
