import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, History, Inbox, RefreshCw, Shield, XCircle } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import ApprovalRow from "../components/ApprovalRow";
import DecisionDialog from "../components/DecisionDialog";
import FilePreviewDrawer from "../components/FilePreviewDrawer";
import CompanyFileDialog from "../components/CompanyFileDialog";
import { useUploadCompanyVersion } from "../hooks/useCompanyDocuments";
import PrecheckBadge from "../components/PrecheckBadge";
import AuditLogTab from "./AuditLogTab";
import Pager from "../components/Pager";
import {
  useApprovalList, useApprovalSummary, useApproveDocument, useBulkApprove, useRejectDocument, useRequestReupload, useReviewLock,
} from "../hooks/useApprovals";

const TABS = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "all", label: "All Documents", icon: Inbox },
  { key: "audit", label: "Audit Log", icon: History },
];
const STATUS_CHIPS = [["", "All"], ["pending_approval", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"],
  ["reupload_requested", "Re-upload requested"], ["expired", "Expired"]];

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Approval Workflow (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A4): the ONE place approve / reject / request-new-copy
 * decisions are made. Counts on the cards and the Pending tab come from the same server summary, the tab shows no count
 * until it is known, one loader per section, a real error with Retry, and a side panel that holds the review lock.
 */
export default function ApprovalWorkflowPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "pending";
  const status = params.get("status") || "";
  const itemParam = Number(params.get("item")) || null;
  const [search, setSearch] = useState(params.get("search") || "");
  const [source, setSource] = useState("");
  const [precheck, setPrecheck] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);      // { mode, item }
  const [replacing, setReplacing] = useState(null); // a company document whose file is missing: upload it again
  const [bulkResult, setBulkResult] = useState(null);
  const debouncedSearch = useDebounced(search);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null || v === "") next.delete(k); else next.set(k, String(v)); }
    setParams(next, { replace: true });
  };

  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, status, debouncedSearch, source, precheck]);

  const summary = useApprovalSummary();
  const filters = { tab: tab === "audit" ? "pending" : tab, status: tab === "all" ? status || undefined : undefined,
                    search: debouncedSearch || undefined, source: source || undefined,
                    precheck: tab === "pending" ? precheck || undefined : undefined, page, per_page: 25 };
  const list = useApprovalList(filters);
  const approve = useApproveDocument();
  const reject = useRejectDocument();
  const reupload = useRequestReupload();
  const bulk = useBulkApprove();
  const uploadVersion = useUploadCompanyVersion();

  const items = list.data?.items || [];
  const previewItem = useMemo(() => items.find((i) => i.document_id === itemParam) || null, [items, itemParam]);
  const lock = useReviewLock(previewItem?.status === "pending_approval" && previewItem?.can_decide ? previewItem.document_id : null);

  const pendingCount = summary.data?.awaiting_review;
  const tabs = TABS.map((t) => ({
    ...t, label: t.key === "pending" && typeof pendingCount === "number" ? `Pending (${pendingCount})` : t.label,
  }));

  const decide = async (values) => {
    const { mode, item } = dialog;
    const base = { documentId: item.document_id, versionId: item.version_id };
    if (mode === "approve") await approve.mutateAsync({ ...base, remark: values.remark });
    else if (mode === "reject") await reject.mutateAsync({ ...base, ...values });
    else await reupload.mutateAsync({ ...base, ...values });
    if (itemParam === item.document_id) set({ item: null });
  };

  const bulkApprove = async () => {
    const chosen = items.filter((i) => selected.has(i.document_id));
    const res = await bulk.mutateAsync({ items: chosen.map((i) => ({ documentId: i.document_id, versionId: i.version_id })) });
    const failed = (res?.results || []).filter((r) => !r.ok);
    setBulkResult({ approved: (res?.results || []).length - failed.length, failed });
    setSelected(new Set(failed.map((f) => f.document_id)));
  };

  const groups = useMemo(() => {
    if (!grouped) return null;
    const out = new Map();
    for (const i of items) {
      const key = i.employee?.name || "Company documents";
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(i);
    }
    return [...out.entries()];
  }, [grouped, items]);

  const cards = [
    { key: "awaiting_review", label: "Awaiting review", icon: Clock, tone: "text-amber-700 bg-amber-50", go: { tab: "pending", status: null } },
    { key: "approved", label: "Approved", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50", go: { tab: "all", status: "approved" } },
    { key: "rejected", label: "Rejected", icon: XCircle, tone: "text-rose-700 bg-rose-50", go: { tab: "all", status: "rejected" } },
    { key: "sla_breached", label: "Past review deadline", icon: AlertTriangle, tone: "text-orange-700 bg-orange-50", go: { tab: "pending", status: null } },
  ];

  const renderRow = (item) => (
    <ApprovalRow key={`${item.document_id}:${item.version_id}`} item={item} selectable={tab === "pending"}
      selected={selected.has(item.document_id)} active={item.document_id === itemParam}
      onSelect={(on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(item.document_id); else n.delete(item.document_id); return n; })}
      onPreview={() => set({ item: item.document_id })}
      onApprove={() => setDialog({ mode: "approve", item })}
      onReject={() => setDialog({ mode: "reject", item })}
      onReupload={() => setDialog({ mode: "reupload", item })} />
  );

  return (
    <OrganizationDocumentsLayout
      title="Approval Workflow"
      subtitle="Review submissions, record decisions and keep a clear history."
      actions={(
        <button type="button" onClick={() => { summary.refetch(); list.refetch(); }}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">
          <RefreshCw size={16} className={list.isFetching ? "animate-spin" : ""} aria-hidden="true" /> Refresh
        </button>
      )}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Shield size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
          <p className="text-sm text-blue-900">
            <strong>Approval chain: HR Admin → Org Admin.</strong> A decision by either completes the document. Nobody decides on a
            document they uploaded or that is about them.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <button key={c.key} type="button" onClick={() => set(c.go)}
              className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 text-left shadow-sm hover:shadow-md dark:border-[#334155] dark:bg-[#1e293b]">
              <span className={`rounded-xl p-2 ${c.tone}`}><c.icon size={18} aria-hidden="true" /></span>
              <span>
                <span className="block text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]" data-testid={`card-${c.key}`}>
                  {summary.isPending ? "—" : summary.data?.[c.key] ?? 0}
                </span>
                <span className="text-xs text-slate-500">{c.label}</span>
              </span>
            </button>
          ))}
        </div>

        <div role="tablist" aria-label="Approval views" className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200/80 bg-white p-2 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => set({ tab: t.key, status: null, item: null })}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <t.icon size={16} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "audit" ? <AuditLogTab /> : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[240px] flex-1">
                <span className="sr-only">Search by document, employee name or employee ID</span>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by document, employee name or ID…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </label>
              <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Employee and company</option><option value="employee">Employee uploads</option><option value="company">Company documents</option>
              </select>
              {tab === "pending" && (
                <select aria-label="Pre-checks" value={precheck} onChange={(e) => setPrecheck(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <option value="">Any pre-check result</option><option value="warn">With warnings</option><option value="pass">Passed</option>
                </select>
              )}
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by employee
              </label>
            </div>
            {tab === "all" && (
              <div role="tablist" aria-label="Status" className="flex flex-wrap gap-2">
                {STATUS_CHIPS.map(([v, l]) => (
                  <button key={v || "all"} type="button" role="tab" aria-selected={status === v} onClick={() => set({ status: v })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${status === v ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-slate-600"}`}>{l}</button>
                ))}
              </div>
            )}

            {tab === "pending" && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
                <span>{selected.size} selected</span>
                <button type="button" onClick={bulkApprove} disabled={bulk.isPending}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Approve selected</button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-blue-800 underline">Clear</button>
              </div>
            )}
            {bulkResult && (
              <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                Approved {bulkResult.approved}.
                {bulkResult.failed.length > 0 && <> Not approved: {bulkResult.failed.map((f) => f.detail).join(" ")}</>}
                <button type="button" onClick={() => setBulkResult(null)} className="ml-3 text-xs underline">Dismiss</button>
              </div>
            )}

            <div className={`grid gap-4 ${previewItem ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]" : ""}`}>
              <div>
                <SectionState query={list} label="Loading approvals"
                  empty={tab === "pending"
                    ? { title: "All caught up", message: "Nothing is waiting for your review." }
                    : { title: "No documents found", message: "Try another filter." }}
                  isEmpty={(d) => !d?.items?.length}>
                  {(data) => (
                    <>
                      {groups ? groups.map(([name, rows]) => (
                        <section key={name} className="mb-4">
                          <h3 className="mb-2 text-sm font-semibold text-slate-700">{name} <span className="text-slate-400">({rows.length})</span></h3>
                          <ul className="space-y-3">{rows.map(renderRow)}</ul>
                        </section>
                      )) : <ul className="space-y-3">{data.items.map(renderRow)}</ul>}
                      <div className="mt-3"><Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} /></div>
                    </>
                  )}
                </SectionState>
              </div>
              {previewItem && (
                <div className="flex h-[78vh] flex-col gap-3">
                  {lock.lockedBy && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{lock.lockedBy} is reviewing this document.</p>}
                  {previewItem.status === "pending_approval" && <PrecheckBadge precheck={previewItem.precheck} />}
                  <div className="min-h-0 flex-1">
                    <FilePreviewDrawer key={`${previewItem.document_id}:${previewItem.version_id}`} open inline documentId={previewItem.document_id}
                      title={previewItem.title} onClose={() => set({ item: null })}
                      missingActions={{
                        // employee documents: admins never upload for the person, they ask for a new copy (QA R1-17)
                        request_reupload: previewItem.scope === "employee" && (previewItem.can_decide || previewItem.status === "approved")
                          ? { label: "Ask for a new copy", onClick: () => setDialog({ mode: "reupload", item: previewItem }) } : undefined,
                        upload_version: previewItem.scope === "company"
                          ? { label: "Upload it again", onClick: () => setReplacing({ id: previewItem.document_id, title: previewItem.title }) } : undefined,
                      }} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CompanyFileDialog open={Boolean(replacing)} mode="version" document={replacing} onClose={() => setReplacing(null)}
        onSubmit={(v) => uploadVersion.mutateAsync({ ...v, changeNotes: v.changeNotes || "File uploaded again (it was missing on the server)" })
          .then(() => list.refetch())} />
      <DecisionDialog open={Boolean(dialog)} mode={dialog?.mode} item={dialog?.item || null} onSubmit={decide} onClose={() => setDialog(null)} />
    </OrganizationDocumentsLayout>
  );
}
