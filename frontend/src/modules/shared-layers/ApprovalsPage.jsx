import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Award, Check, CheckCircle2, Clock, X, XCircle } from "lucide-react";
import { approvalsService } from "../../service/approvalsService";
import { getOrganizations } from "../../service/documentsService";
import { Btn, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction } from "./integrationsUi";

const PAGE_SIZE = 15;
const range = (a) => (a.start_date === a.end_date ? a.start_date : `${a.start_date} → ${a.end_date}`);
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function DecisionDialog({ item, mode, onClose, onDone }) {
  const [comment, setComment] = useState("");
  const { pending, error, run } = useAction();
  const approve = mode === "approve";

  async function submit(e) {
    e.preventDefault();
    const res = await run(() => (approve ? approvalsService.approveLeave(item.id, comment) : approvalsService.rejectLeave(item.id, comment)));
    if (res) onDone(res, mode);
  }

  return (
    <Modal title={approve ? "Approve leave request?" : "Reject leave request?"} onClose={pending ? () => {} : onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <p className="mb-3 text-sm text-slate-600">
          {item.employee_name} ({item.organization_name}) · {capital(item.leave_type)} leave · {range(item)} · {item.days} day{item.days === 1 ? "" : "s"}
        </p>
        <Field label={approve ? "Comment (optional)" : "Reason for rejection (required)"}>
          <textarea className={inputCls} rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} required={!approve} />
        </Field>
        <p className="text-[11px] text-slate-400">The employee is notified and leave balances are updated exactly as in the organization portal. The decision is written to the audit log.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone={approve ? "primary" : "danger"} type="submit" disabled={pending || (!approve && !comment.trim())}>
            {pending ? "Saving…" : approve ? "Approve" : "Reject"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function DetailDialog({ item, onClose }) {
  const rows = [
    ["Employee", `${item.employee_name} (${item.employee_email})`], ["Organization", item.organization_name],
    ["Type", `${capital(item.leave_type)} leave`], ["Dates", `${range(item)} (${item.days} day${item.days === 1 ? "" : "s"})`],
    ["Reason", item.reason || "—"], ["Submitted", fmt(item.submitted_at)], ["Status", capital(item.status)],
    ["Current approver", item.current_approver || "—"], ["Decided by", item.reviewed_by ? `${item.reviewed_by} · ${fmt(item.reviewed_at)}` : "—"],
  ];
  return (
    <Modal title={`Leave request #${item.id}`} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4"><dt className="text-slate-400">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
        ))}
      </dl>
    </Modal>
  );
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState(null);
  const [recent, setRecent] = useState([]);
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [filters, setFilters] = useState({ organization_id: "", q: "", date_from: "", date_to: "" });
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    getOrganizations().then((r) => setOrgs(r.organizations || [])).catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setFilters((p) => ({ ...p, q: qInput.trim() })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    const params = { page, page_size: PAGE_SIZE };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = k.startsWith("date_") ? new Date(v).toISOString() : v; });
    const orgOnly = filters.organization_id ? { organization_id: filters.organization_id } : undefined;
    try {
      const [list, sum, decided] = await Promise.all([
        approvalsService.list({ ...params, status: "pending" }),
        approvalsService.summary(orgOnly),
        approvalsService.list({ ...orgOnly, status: "all", page: 1, page_size: 5 }),
      ]);
      setPending(list);
      setSummary(sum);
      setRecent((decided.approvals || []).filter((a) => a.status !== "pending"));
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load approvals.");
      setPending((p) => p || { approvals: [], total: 0 });
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const pages = pending ? Math.max(1, Math.ceil(pending.total / PAGE_SIZE)) : 1;
  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };
  const hasCriteria = Object.values(filters).some(Boolean);

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Approvals" description="Leave requests awaiting a decision across all organizations." />
        {notice ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div> : null}
        <ErrorNote message={error} />

        <div className="grid gap-4 md:grid-cols-3">
          {[["Pending", summary?.pending], ["Approved this month", summary?.approved_this_month], ["Rejected this month", summary?.rejected_this_month]].map(([label, n]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{n ?? "—"}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Clock className="h-5 w-5 text-amber-500" /> Pending Approvals</h3>
            <div className="grid gap-2 md:grid-cols-4">
              <select className={inputCls} aria-label="Organization" value={filters.organization_id} onChange={(e) => setFilter("organization_id", e.target.value)}>
                <option value="">All organizations</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input className={inputCls} type="search" aria-label="Search employee" placeholder="Search employee…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
              <input className={inputCls} type="date" aria-label="Submitted from" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
              <input className={inputCls} type="date" aria-label="Submitted to" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
            </div>

            {pending === null ? <Spinner /> : pending.approvals.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <p>{hasCriteria ? "No pending approvals match your filters." : "No pending approvals."}</p>
                {hasCriteria ? (
                  <Btn className="mt-3" onClick={() => { setQInput(""); setFilters({ organization_id: "", q: "", date_from: "", date_to: "" }); setPage(1); }}>Clear filters</Btn>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {pending.approvals.map((a) => (
                  <div key={`${a.request_type}-${a.id}`} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">Leave Request</span>
                        <span className="font-mono text-[10px] text-slate-400">#{a.id}</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{a.organization_name}</span>
                      </div>
                      <p className="text-sm font-semibold leading-snug text-slate-800">
                        {capital(a.leave_type)} leave · {range(a)} · {a.days} day{a.days === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {a.employee_name} · submitted {fmt(a.submitted_at)} · with {a.current_approver}
                      </p>
                      {a.reason ? <p className="mt-1 text-[11px] text-slate-500">“{a.reason}”</p> : null}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Btn onClick={() => setDetail(a)}>Details</Btn>
                      <button type="button" aria-label={`Approve leave request ${a.id}`} onClick={() => setDecision({ item: a, mode: "approve" })}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-500 hover:text-white">
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label={`Reject leave request ${a.id}`} onClick={() => setDecision({ item: a, mode: "reject" })}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 transition hover:bg-red-500 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                  <span>Page {page} of {pages} · {pending.total} pending</span>
                  <div className="flex gap-2">
                    <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
                    <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800"><Award className="h-5 w-5 text-[#3B82F6]" /> Recent Decisions</h3>
            {recent.length === 0 ? <p className="text-sm text-slate-500">No decisions yet.</p> : (
              <div className="space-y-3">
                {recent.map((p) => (
                  <button key={p.id} type="button" onClick={() => setDetail(p)} className="flex w-full gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left hover:bg-slate-100">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${p.status === "approved" ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-red-100 bg-red-50 text-red-500"}`}>
                      {p.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">{capital(p.leave_type)} leave · {p.employee_name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{p.organization_name}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><StatusPill status={p.status} /> {fmt(p.reviewed_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-6 text-center text-[10px] font-semibold text-slate-400">Decisions are recorded in the audit log</p>
          </div>
        </div>

        {decision ? (
          <DecisionDialog item={decision.item} mode={decision.mode} onClose={() => setDecision(null)}
            onDone={(res, mode) => { setDecision(null); setNotice(`Leave request #${res.id} ${mode === "approve" ? "approved" : "rejected"}.`); load(); }} />
        ) : null}
        {detail ? <DetailDialog item={detail} onClose={() => setDetail(null)} /> : null}
      </div>
    </SuperAdminOnly>
  );
}
