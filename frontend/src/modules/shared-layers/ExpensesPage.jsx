import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Building2, CreditCard, Plus, TrendingUp } from "lucide-react";
import { expensesService, formatMoney } from "../../service/expensesService";
import { getOrganizations } from "../../service/documentsService";
import { Btn, Card, ErrorNote, Field, Modal, Spinner, StatusPill, SuperAdminOnly, fmt, inputCls, useAction } from "./integrationsUi";

const PAGE_SIZE = 15;
const STATUSES = ["all", "pending", "approved", "paid", "rejected"];
const EMPTY_FILTERS = { organization_id: "", status: "all", category: "", date_from: "", date_to: "", min_amount: "", max_amount: "" };
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A section that loads on its own and shows its own error + retry. */
function useSection(loader, deps) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const load = useCallback(async () => {
    setState((p) => ({ ...p, loading: true, error: "" }));
    try {
      setState({ data: await loader(), error: "", loading: false });
    } catch (e) {
      setState((p) => ({ data: p.data, error: e?.message || "Failed to load.", loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function SectionError({ message, onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600" role="alert">
      <span>{message}</span>
      <Btn onClick={onRetry}>Retry</Btn>
    </div>
  );
}

function SummaryCards({ filters }) {
  const params = {};
  ["organization_id", "category", "date_from", "date_to"].forEach((k) => {
    if (filters[k]) params[k] = k.startsWith("date_") ? new Date(filters[k]).toISOString() : filters[k];
  });
  const { data, error, loading, reload } = useSection(() => expensesService.summary(params), [JSON.stringify(params)]);
  if (error && !data) return <SectionError message={`Summary: ${error}`} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  const currencies = Object.keys(data.totals);
  const cards = [["Claimed", "claimed"], ["Pending", "pending"], ["Approved", "approved"], ["Paid", "paid"], ["Rejected", "rejected"]];
  if (currencies.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">No expense claims in this period.</p>;
  }
  return (
    <div className="space-y-3">
      {currencies.map((cur) => (
        <div key={cur} className="grid gap-3 md:grid-cols-5" aria-label={`Totals in ${cur}`}>
          {cards.map(([label, key]) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label} · {cur}</p>
              <p className="mt-1 text-xl font-bold text-slate-800">{formatMoney(data.totals[cur][key], cur)}</p>
            </div>
          ))}
        </div>
      ))}
      {currencies.length > 1 ? <p className="text-[11px] text-slate-400">Totals are shown per currency and are never added across currencies.</p> : null}
    </div>
  );
}

const BREAKDOWN_ROWS = [["Claimed", "claimed"], ["Pending", "pending"], ["Approved", "approved"], ["Paid", "paid"], ["Rejected", "rejected"]];

/** One card per organization: that organization's own totals, never mixed with another's. */
function OrganizationBreakdown({ filters, selected, onSelect }) {
  const params = {};
  ["category", "date_from", "date_to"].forEach((k) => {
    if (filters[k]) params[k] = k.startsWith("date_") ? new Date(filters[k]).toISOString() : filters[k];
  });
  const { data, error, loading, reload } = useSection(() => expensesService.byOrganization(params), [JSON.stringify(params)]);
  const orgCount = data?.organizations.length;
  return (
    <Card title={orgCount ? `Expenses by Organization (${orgCount})` : "Expenses by Organization"} icon={Building2}
      action={selected ? <Btn onClick={() => onSelect("")}>Show all organizations</Btn> : null}>
      {error && !data ? <SectionError message={`Organizations: ${error}`} onRetry={reload} /> : loading && !data ? <Spinner /> : orgCount === 0 ? (
        <p className="text-sm text-slate-500">There are no organizations on the platform yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.organizations.map((o) => {
            const currencies = Object.keys(o.totals);
            const active = String(o.organization_id) === String(selected);
            return (
              <button key={o.organization_id} type="button" onClick={() => onSelect(active ? "" : String(o.organization_id))}
                aria-pressed={active} aria-label={`${o.organization_name} expenses`}
                className={`rounded-2xl border p-4 text-left shadow-sm transition ${active ? "border-[#3B82F6] bg-blue-50/50 ring-1 ring-[#3B82F6]" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">{o.organization_name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {o.claim_count} claim{o.claim_count === 1 ? "" : "s"}
                  </span>
                </div>
                {currencies.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">No expense claims{Object.keys(params).length ? " for this filter" : " yet"}.</p>
                ) : currencies.map((cur) => (
                  <dl key={cur} className="mt-3 space-y-1 text-xs" aria-label={`${o.organization_name} totals in ${cur}`}>
                    {currencies.length > 1 ? <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{cur}</dt> : null}
                    {BREAKDOWN_ROWS.map(([label, key]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className={`font-semibold ${key === "claimed" ? "text-slate-900" : "text-slate-700"}`}>{formatMoney(o.totals[cur][key], cur)}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ClaimDetail({ id, onClose }) {
  const { data, error } = useSection(() => expensesService.claim(id), [id]);
  return (
    <Modal title={`Claim #${id}`} onClose={onClose}>
      <ErrorNote message={error} />
      {!data ? (error ? null : <Spinner />) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-800">{formatMoney(data.amount, data.currency)}</span>
            <StatusPill status={capital(data.status)} />
          </div>
          <dl className="space-y-2">
            {[["Employee", `${data.employee_name} (${data.employee_email})`], ["Organization", data.organization_name],
              ["Category", data.category], ["Description", data.description || "—"], ["Submitted", fmt(data.submitted_at)],
              ["Approved", fmt(data.approved_at)], ["Paid", fmt(data.reimbursed_at)], ["Approver", data.approver || "—"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-slate-400">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
            ))}
          </dl>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">Receipts</p>
            {data.receipt_url || data.receipts.length ? (
              <ul className="space-y-1 text-xs">
                {data.receipt_url ? <li><a className="text-blue-600 hover:underline" href={data.receipt_url} target="_blank" rel="noopener noreferrer">Attached receipt</a></li> : null}
                {data.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.vendor} · {r.receipt_number} · {formatMoney(r.amount, data.currency)}{r.verified ? " · verified" : ""}</span>
                    {r.url ? <a className="text-blue-600 hover:underline" href={r.url} target="_blank" rel="noopener noreferrer">Open</a> : <span className="text-slate-400">no file link</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">No receipt attached.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function BudgetDialog({ orgs, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ organization_id: "", name: "", category: "", period_start: today, period_end: today, currency: "USD", allocated_amount: "" });
  const { pending, error, run } = useAction();
  async function submit(e) {
    e.preventDefault();
    const saved = await run(() => expensesService.createBudget({
      ...form, organization_id: Number(form.organization_id), category: form.category || null, currency: form.currency.toUpperCase(),
    }));
    if (saved) onSaved();
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add Budget" onClose={pending ? () => {} : onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <Field label="Organization">
          <select className={inputCls} required value={form.organization_id} onChange={set("organization_id")}>
            <option value="">Select an organization…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Name"><input className={inputCls} required maxLength={150} value={form.name} onChange={set("name")} /></Field>
        <Field label="Category (optional)" hint="Leave blank to count every category."><input className={inputCls} maxLength={100} value={form.category} onChange={set("category")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period start"><input className={inputCls} type="date" required value={form.period_start} onChange={set("period_start")} /></Field>
          <Field label="Period end"><input className={inputCls} type="date" required value={form.period_end} onChange={set("period_end")} /></Field>
          <Field label="Currency"><input className={inputCls} required minLength={3} maxLength={3} value={form.currency} onChange={set("currency")} /></Field>
          <Field label="Allocated amount"><input className={inputCls} type="number" step="0.01" min="0.01" required value={form.allocated_amount} onChange={set("allocated_amount")} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save budget"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function Budgets({ orgs, organizationId }) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data, error, loading, reload } = useSection(() => expensesService.budgets(params), [organizationId]);
  const [adding, setAdding] = useState(false);
  const archive = useAction();

  async function archiveBudget(b) {
    if (await archive.run(() => expensesService.archiveBudget(b.id))) reload();
  }

  return (
    <Card title="Operational Budgets" icon={TrendingUp} action={<Btn onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add Budget</Btn>}>
      <ErrorNote message={archive.error} />
      {error && !data ? <SectionError message={`Budgets: ${error}`} onRetry={reload} /> : loading && !data ? <Spinner /> : data.budgets.length === 0 ? (
        <p className="text-sm text-slate-500">No budgets configured.</p>
      ) : (
        <div className="space-y-3">
          {data.budgets.map((b) => (
            <div key={b.id} className={`rounded-2xl border p-3 ${b.over_budget ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">{b.name}</p>
                  <p className="text-[10px] text-slate-400">{b.organization_name} · {b.category || "All categories"} · {b.period_start} → {b.period_end}</p>
                </div>
                <div className="flex items-center gap-2">
                  {b.over_budget ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Over budget</span> : null}
                  <Btn onClick={() => archiveBudget(b)} disabled={archive.pending}>Archive</Btn>
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.min(100, b.utilization_pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-2 ${b.over_budget ? "bg-red-500" : b.utilization_pct >= 80 ? "bg-amber-500" : "bg-[#3B82F6]"}`} style={{ width: `${Math.min(100, b.utilization_pct)}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{formatMoney(b.spent, b.currency)} of {formatMoney(b.allocated, b.currency)} ({b.utilization_pct}%)</span>
                <span className={b.over_budget ? "font-semibold text-red-600" : ""}>{b.over_budget ? "Over by " : "Remaining "}{formatMoney(String(Math.abs(Number(b.remaining))), b.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding ? <BudgetDialog orgs={orgs} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} /> : null}
    </Card>
  );
}

export default function ExpensesPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [orgs, setOrgs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    getOrganizations().then((r) => setOrgs(r.organizations || [])).catch(() => setOrgs([]));
    expensesService.categories().then((r) => setCategories(r.categories || [])).catch(() => setCategories([]));
  }, []);

  const params = { page, page_size: PAGE_SIZE };
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== "all") params[k] = k.startsWith("date_") ? new Date(v).toISOString() : v;
  });
  if (filters.status !== "all") params.status = filters.status;
  const claims = useSection(() => expensesService.claims(params), [JSON.stringify(params)]);

  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };
  const hasCriteria = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const pages = claims.data ? Math.max(1, Math.ceil(claims.data.total / PAGE_SIZE)) : 1;

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader title="Expenses" description="Employee expense claims and operational budgets across all organizations." />

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Overall · {filters.organization_id ? (orgs.find((o) => String(o.id) === String(filters.organization_id))?.name || "Selected organization") : "All organizations"}
          </h3>
          <SummaryCards filters={filters} />
        </div>

        <OrganizationBreakdown filters={filters} selected={filters.organization_id} onSelect={(id) => setFilter("organization_id", id)} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Cost Claims" icon={CreditCard}>
              <div className="mb-4 grid gap-2 md:grid-cols-4">
                <select className={inputCls} aria-label="Organization" value={filters.organization_id} onChange={(e) => setFilter("organization_id", e.target.value)}>
                  <option value="">All organizations</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select className={inputCls} aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "Any status" : capital(s)}</option>)}
                </select>
                <select className={inputCls} aria-label="Category" value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className={inputCls} type="number" min="0" step="0.01" aria-label="Minimum amount" placeholder="Min amount" value={filters.min_amount} onChange={(e) => setFilter("min_amount", e.target.value)} />
                <input className={inputCls} type="number" min="0" step="0.01" aria-label="Maximum amount" placeholder="Max amount" value={filters.max_amount} onChange={(e) => setFilter("max_amount", e.target.value)} />
                <input className={inputCls} type="date" aria-label="Submitted from" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
                <input className={inputCls} type="date" aria-label="Submitted to" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
                {hasCriteria ? <Btn onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Clear filters</Btn> : null}
              </div>

              {claims.error && !claims.data ? <SectionError message={`Claims: ${claims.error}`} onRetry={claims.reload} /> : claims.loading && !claims.data ? <Spinner /> : claims.data.claims.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">{hasCriteria ? "No expense claims match your filters." : "No expense claims yet."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-3">Claim</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {claims.data.claims.map((c) => (
                        <tr key={c.id} className="cursor-pointer text-sm hover:bg-slate-50/50" onClick={() => setDetail(c.id)}>
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-800">{c.category}{c.has_receipt ? " 📎" : ""}</p>
                            <p className="text-[10px] text-slate-400">{fmt(c.submitted_at)}</p>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{c.organization_name}</td>
                          <td className="px-3 py-3 text-slate-600">{c.employee_name}</td>
                          <td className="px-3 py-3 font-bold text-slate-800">{formatMoney(c.amount, c.currency)}</td>
                          <td className="px-3 py-3"><StatusPill status={capital(c.status)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                    <span>Page {page} of {pages} · {claims.data.total} claim{claims.data.total === 1 ? "" : "s"}</span>
                    <div className="flex gap-2">
                      <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
                      <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Budgets orgs={orgs} organizationId={filters.organization_id} />
        </div>

        {detail ? <ClaimDetail id={detail} onClose={() => setDetail(null)} /> : null}
      </div>
    </SuperAdminOnly>
  );
}
