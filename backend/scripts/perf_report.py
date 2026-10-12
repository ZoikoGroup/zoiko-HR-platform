"""Turn measure_latency.py --json output into markdown tables.

    python scripts/perf_report.py before.json                 # one baseline table
    python scripts/perf_report.py before.json after.json      # before/after comparison
"""
import json
import sys


def _rows(data):
    for who in ("sa", "org"):
        for label, m in (data.get(who) or {}).items():
            if m:
                yield who, label, m


def single(data):
    out = ["| who | endpoint | status | median ms | queries | DB ms | flag |", "|---|---|---|---|---|---|---|"]
    scaling = data.get("scaling") or {}
    for who, label, m in _rows(data):
        flags = []
        if m["total_ms"] > 300:
            flags.append(">300 ms")
        s = scaling.get(label.split("(")[0].strip())
        if s and s["grows"] >= 3:
            flags.append("N+1")
        out.append(f"| {who} | {label} | {m['status']} | {m['total_ms']:.1f} | {m['queries']:.0f} | {m['db_ms']:.1f} | {', '.join(flags)} |")
    if scaling:
        out += ["", "| list endpoint | queries @10 rows | queries @100 rows | grows by |", "|---|---|---|---|"]
        for label, s in scaling.items():
            out.append(f"| {label} | {s['small']['queries']:.0f} | {s['large']['queries']:.0f} | {s['grows']:.0f}{' (N+1)' if s['grows'] >= 3 else ''} |")
    return "\n".join(out)


def compare(before, after):
    out = ["| who | endpoint | ms before → after | queries before → after | DB ms before → after |", "|---|---|---|---|---|"]
    a_idx = {(w, l): m for w, l, m in _rows(after)}
    for who, label, b in _rows(before):
        a = a_idx.get((who, label))
        if not a:
            continue
        out.append(f"| {who} | {label} | {b['total_ms']:.1f} → {a['total_ms']:.1f} | {b['queries']:.0f} → {a['queries']:.0f} | "
                   f"{b['db_ms']:.1f} → {a['db_ms']:.1f} |")
    bs, as_ = before.get("scaling") or {}, after.get("scaling") or {}
    if bs and as_:
        out += ["", "| list endpoint | queries @10 → @100, before | after |", "|---|---|---|"]
        for label, s in bs.items():
            t = as_.get(label)
            if t:
                out.append(f"| {label} | {s['small']['queries']:.0f} → {s['large']['queries']:.0f} | "
                           f"{t['small']['queries']:.0f} → {t['large']['queries']:.0f} |")
    return "\n".join(out)


if __name__ == "__main__":
    docs = [json.load(open(p, encoding="utf-8")) for p in sys.argv[1:]]
    print(single(docs[0]) if len(docs) == 1 else compare(docs[0], docs[1]))
