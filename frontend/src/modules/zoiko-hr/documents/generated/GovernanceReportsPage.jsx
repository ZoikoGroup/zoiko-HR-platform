// Governance reports (HR-DOC family): the records the template engine keeps about itself, viewable here and exportable as
// CSV or PDF for auditors. The open tab is kept in `?report=`; id-based reports read `?document=`, `?variant=`,
// `?distribution=` or `?id=` so other pages can deep-link to a specific record.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Search, XCircle } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import {
  governanceAcknowledgement, governanceAcknowledgements, governanceApprovals, governanceDistribution, governanceExpiries,
  governanceGenerationInstruction, governanceGenerationInstructions, governanceRegister, governanceSignatureEvidence,
  governanceSupersession, governanceSupersessions, governanceVersions, governanceWorkflowApproval, listPolicyDistributions, reasonText,
  resolveExpiryItem,
} from "../../../../service/docTemplatesService";
import {
  Card, ErrorBanner, ExportButtons, PrimaryButton, RecordView, SecondaryButton, StatusChip, Toast, fmtDate, fmtDateTime, inputCls, useToast,
} from "./docUi";

const BASE = "/hr/generated-documents/governance";

const REPORTS = [
  { key: "register", label: "Template register", hr: "HR-DOC-001",
    text: "HR-DOC-001 lists every template in the catalogue with its released versions, jurisdiction packs and availability for your organization." },
  { key: "approvals", label: "Approvals", hr: "HR-DOC-003 / 010",
    text: "HR-DOC-003 is the legal approval record kept when your organization approves its own template version. HR-DOC-010 records the approvals of individual documents (L2 / L3 policies)." },
  { key: "versions", label: "Version history", hr: "HR-DOC-004",
    text: "HR-DOC-004 is the version history of one template version: who authored, reviewed and released each version and why it changed. Enter a template version (variant) id." },
  { key: "generation", label: "Generation instructions", hr: "HR-DOC-008",
    text: "HR-DOC-008 is the decision receipt written every time a document was requested: the checks the engine ran, the outcome and the reasons. Pick a row or enter a document id." },
  { key: "workflow", label: "Workflow approvals", hr: "HR-DOC-010",
    text: "HR-DOC-010 is the approval record of one document: every approval step, who decided, when, and their comments. Enter a document id." },
  { key: "signatures", label: "Signature evidence", hr: "HR-DOC-012",
    text: "HR-DOC-012 is the signature certificate of one document: each signer, the method, verification, time, IP address and the fingerprint of what was signed. Enter a document id." },
  { key: "acknowledgements", label: "Acknowledgements", hr: "HR-DOC-013",
    text: "HR-DOC-013 is the evidence that an employee acknowledged a document: the exact wording they agreed to and the fingerprint of the document." },
  { key: "distributions", label: "Policy distributions", hr: "HR-DOC-014",
    text: "HR-DOC-014 is the record of a policy distribution: the audience, the version sent, and each recipient's status." },
  { key: "expiries", label: "Expiries", hr: "HR-DOC-016",
    text: "HR-DOC-016 tracks documents and template versions that expire, and what was done about each one (renewed or waived)." },
  { key: "supersessions", label: "Supersessions", hr: "HR-DOC-018",
    text: "HR-DOC-018 records each time a template version replaced another: the reason, what happened to documents in progress and which issued documents stayed unchanged." },
];

const humanize = (s) => (s ? String(s).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—");

export default function GovernanceReportsPage() {
  const [params, setParams] = useSearchParams();
  const report = REPORTS.some((r) => r.key === params.get("report")) ? params.get("report") : "register";
  const current = REPORTS.find((r) => r.key === report);
  const [toast, showToast] = useToast();

  const setParam = useCallback((updates) => setParams((p) => {
    const n = new URLSearchParams(p);
    Object.entries(updates).forEach(([k, v]) => (v === null || v === undefined || v === "" ? n.delete(k) : n.set(k, String(v))));
    return n;
  }), [setParams]);
  const selectTab = (key) => setParams(new URLSearchParams({ report: key }));
  const onError = (m) => showToast("error", m);

  const onTabKey = (e, idx) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = REPORTS[(idx + (e.key === "ArrowRight" ? 1 : REPORTS.length - 1)) % REPORTS.length];
    selectTab(next.key);
    document.getElementById(`gov-tab-${next.key}`)?.focus();
  };

  const props = { params, setParam, onError, showToast };

  return (
    <HRPage title="Document governance" subtitle="Audit records produced by the document template engine. View them here or export as CSV / PDF.">
      <div className="space-y-4">
        <div role="tablist" aria-label="Governance reports" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
          {REPORTS.map((r, idx) => (
            <button
              key={r.key}
              id={`gov-tab-${r.key}`}
              role="tab"
              type="button"
              aria-selected={report === r.key}
              aria-controls="gov-panel"
              tabIndex={report === r.key ? 0 : -1}
              onClick={() => selectTab(r.key)}
              onKeyDown={(e) => onTabKey(e, idx)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${report === r.key ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <section id="gov-panel" role="tabpanel" aria-labelledby={`gov-tab-${report}`} className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-800">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-800">{current.hr}</p>
            <p className="mt-0.5">{current.text}</p>
          </div>

          {report === "register" && <RegisterReport {...props} />}
          {report === "approvals" && <ApprovalsReport {...props} />}
          {report === "versions" && (
            <IdRecord {...props} paramKey="variant" label="Template version (variant) id"
              fetcher={governanceVersions} pathFor={(id) => `${BASE}/versions?variant_id=${id}`} filenameFor={(id) => `HR-DOC-004-variant-${id}`} />
          )}
          {report === "generation" && <GenerationReport {...props} />}
          {report === "workflow" && (
            <IdRecord {...props} paramKey="document" label="Document id"
              fetcher={governanceWorkflowApproval} pathFor={(id) => `${BASE}/workflow-approvals/${id}`} filenameFor={(id) => `HR-DOC-010-document-${id}`} />
          )}
          {report === "signatures" && (
            <IdRecord {...props} paramKey="document" label="Document id"
              fetcher={governanceSignatureEvidence} pathFor={(id) => `${BASE}/signature-evidence/${id}`} filenameFor={(id) => `HR-DOC-012-document-${id}`} />
          )}
          {report === "acknowledgements" && <AcknowledgementsReport {...props} />}
          {report === "distributions" && <DistributionsReport {...props} />}
          {report === "expiries" && <ExpiriesReport {...props} />}
          {report === "supersessions" && <SupersessionsReport {...props} />}
        </section>
      </div>
      <Toast toast={toast} />
    </HRPage>
  );
}

// ── shared ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(() => {
    const p = fn();
    if (!p) { setData(null); setError(null); return; }
    setLoading(true); setError(null);
    p.then(setData).catch((e) => { setData(null); setError(e.message || "Could not load."); }).finally(() => setLoading(false));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { data, loading, error, reload: run };
}

function Pager({ data, page, setPage }) {
  if (!data || !data.total || data.total <= (data.per_page || 25)) return null;
  const pages = Math.ceil(data.total / (data.per_page || 25));
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm text-slate-700">
      <span>{data.total} records · page {page} of {pages}</span>
      <div className="flex gap-2">
        <SecondaryButton icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</SecondaryButton>
        <SecondaryButton disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></SecondaryButton>
      </div>
    </nav>
  );
}

function Table({ caption, columns, rows, empty = "No records yet.", onRowClick, rowKey = (r) => r.id, selectedKey }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
          <tr>{columns.map(([key, label]) => <th key={key} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-600">{empty}</td></tr>}
          {rows.map((r) => {
            const key = rowKey(r);
            return (
              <tr
                key={key}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
                className={`border-t border-gray-100 align-top ${onRowClick ? "cursor-pointer hover:bg-slate-50 focus:bg-blue-50 focus:outline-none" : ""} ${selectedKey !== undefined && String(selectedKey) === String(key) ? "bg-blue-50/60" : ""}`}
              >
                {columns.map(([k, , render]) => <td key={k} className="px-3 py-2.5 text-slate-800">{render ? render(r) : r[k] ?? "—"}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordPanel({ title, data, loading, error, path, filename, onError }) {
  if (!path) return null;
  return (
    <Card title={title} actions={<ExportButtons path={path} filename={filename} onError={onError} size="sm" />}>
      {loading && <p className="text-sm text-slate-600">Loading record…</p>}
      <ErrorBanner error={error} />
      {!loading && data && <RecordView record={data} />}
    </Card>
  );
}

// A report that needs an id: an input kept in the query string, then the record and its export buttons.
function IdRecord({ params, setParam, onError, paramKey, label, fetcher, pathFor, filenameFor, title }) {
  const id = params.get(paramKey) || "";
  const [draft, setDraft] = useState(id);
  useEffect(() => { setDraft(id); }, [id]);
  const { data, loading, error } = useLoad(() => (id ? fetcher(id) : null), [id]);
  const inputId = `gov-${paramKey}-input`;
  const submit = (e) => { e.preventDefault(); setParam({ [paramKey]: draft.trim() }); };
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
          <input id={inputId} inputMode="numeric" pattern="[0-9]*" className={`${inputCls} w-48`} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))} />
        </div>
        <PrimaryButton type="submit" icon={Search} disabled={!draft.trim()}>Show record</PrimaryButton>
      </form>
      {id ? (
        <RecordPanel title={title || `Record for ${label.toLowerCase()} ${id}`} data={data} loading={loading} error={error} path={pathFor(id)} filename={filenameFor(id)} onError={onError} />
      ) : (
        <p className="text-sm text-slate-600">Enter an id to view the record.</p>
      )}
    </div>
  );
}

// ── HR-DOC-001 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function RegisterReport({ onError }) {
  const { data, loading, error, reload } = useLoad(() => governanceRegister(), []);
  return (
    <Card
      title="Template register"
      actions={
        <div className="flex flex-wrap gap-2">
          <SecondaryButton icon={RefreshCw} onClick={reload} className="px-2.5 py-1 text-xs">Refresh</SecondaryButton>
          <ExportButtons path={`${BASE}/register`} filename="HR-DOC-001-template-register" onError={onError} size="sm" />
        </div>
      }
    >
      {loading && <p className="text-sm text-slate-600">Loading…</p>}
      <ErrorBanner error={error} />
      {data && <RecordView record={data} />}
    </Card>
  );
}

// ── HR-DOC-003 / 010 ──────────────────────────────────────────────────────────────────────────────────────────────────
function ApprovalsReport({ setParam, onError }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad(() => governanceApprovals({ page, per_page: 25 }), [page]);
  const templ = data?.template_approvals || [];
  const docs = data?.document_approvals || { items: [], total: 0 };
  return (
    <div className="space-y-4">
      <ErrorBanner error={error} />
      {loading && <p className="text-sm text-slate-600">Loading…</p>}
      <Card title="HR-DOC-003 · Template version approvals">
        <Table
          caption="Template version approval records"
          rows={templ}
          empty="Your organization has not approved any template version of its own."
          columns={[
            ["variant_id", "Template version", (r) => `#${r.variant_id}`],
            ["reviewer_name", "Approved by", (r) => r.reviewer_name || (r.reviewer_id ? `User #${r.reviewer_id}` : "—")],
            ["created_at", "Approved", (r) => fmtDateTime(r.created_at)],
            ["record_sha256", "Record fingerprint", (r) => (r.record_sha256 ? <code className="text-xs">{r.record_sha256.slice(0, 16)}…</code> : "—")],
            ["export", "Record", (r) => (
              <ExportButtons path={`${BASE}/approvals/${r.id}`} filename={`HR-DOC-003-${r.variant_id}`} formats={["pdf"]} size="sm" onError={onError} />
            )],
          ]}
        />
      </Card>
      <Card title="HR-DOC-010 · Document approvals (L2 / L3)">
        <Table
          caption="Documents that needed approval"
          rows={docs.items || []}
          rowKey={(r) => r.document_id}
          empty="No document has needed approval yet."
          onRowClick={(r) => setParam({ report: "workflow", document: r.document_id })}
          columns={[
            ["document_number", "Document", (r) => <><span className="font-semibold">{r.title}</span><span className="block text-xs text-slate-600">{r.document_number}</span></>],
            ["approval_policy", "Policy"],
            ["status", "Status", (r) => <StatusChip status={r.status} />],
            ["open", "", () => <span className="text-xs font-semibold text-blue-700">View approval record</span>],
          ]}
        />
        <Pager data={docs} page={page} setPage={setPage} />
      </Card>
    </div>
  );
}

// ── HR-DOC-008 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function GenerationReport(props) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad(() => governanceGenerationInstructions({ page, per_page: 25 }), [page]);
  const selected = props.params.get("document");
  return (
    <div className="space-y-4">
      <IdRecord {...props} paramKey="document" label="Document id"
        fetcher={governanceGenerationInstruction} pathFor={(id) => `${BASE}/generation-instructions/${id}`} filenameFor={(id) => `HR-DOC-008-document-${id}`} />
      <Card title="All generation requests">
        <ErrorBanner error={error} />
        {loading ? <p className="text-sm text-slate-600">Loading…</p> : (
          <Table
            caption="Generation requests"
            rows={data?.items || []}
            rowKey={(r) => r.receipt_id}
            selectedKey={selected ? (data?.items || []).find((r) => String(r.document_id) === selected)?.receipt_id : undefined}
            onRowClick={(r) => (r.document_id ? props.setParam({ document: r.document_id }) : props.onError("This request was blocked, so no document (and no per-document record) exists."))}
            columns={[
              ["receipt_id", "Receipt", (r) => `#${r.receipt_id}`],
              ["canonical_id", "Template"],
              ["outcome", "Outcome", (r) => <StatusChip status={r.outcome} />],
              ["reasons", "Reasons", (r) => (r.reasons?.length ? <ul className="list-disc pl-4 text-xs">{r.reasons.map((c) => <li key={c}>{reasonText(c)}</li>)}</ul> : "—")],
              ["document_id", "Document", (r) => (r.document_id ? `#${r.document_id}` : "None")],
              ["requested_by", "Requested by", (r) => (r.requested_by ? `User #${r.requested_by}` : "—")],
              ["created_at", "When", (r) => fmtDateTime(r.created_at)],
            ]}
          />
        )}
        <Pager data={data} page={page} setPage={setPage} />
      </Card>
    </div>
  );
}

// ── HR-DOC-013 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function AcknowledgementsReport({ params, setParam, onError }) {
  const [page, setPage] = useState(1);
  const docFilter = params.get("document") || "";
  const [draft, setDraft] = useState(docFilter);
  useEffect(() => { setDraft(docFilter); }, [docFilter]);
  const ackId = params.get("id");
  const list = useLoad(() => governanceAcknowledgements({ document_id: docFilter || undefined, page, per_page: 25 }), [docFilter, page]);
  const record = useLoad(() => (ackId ? governanceAcknowledgement(ackId) : null), [ackId]);
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setParam({ document: draft.trim(), id: null }); }} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="gov-ack-doc" className="mb-1 block text-xs font-semibold text-slate-600">Filter by document id</label>
          <input id="gov-ack-doc" inputMode="numeric" className={`${inputCls} w-48`} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))} />
        </div>
        <PrimaryButton type="submit" icon={Search}>Apply</PrimaryButton>
      </form>
      <Card title="Acknowledgements">
        <ErrorBanner error={list.error} />
        {list.loading ? <p className="text-sm text-slate-600">Loading…</p> : (
          <Table
            caption="Acknowledgements"
            rows={list.data?.items || []}
            selectedKey={ackId}
            onRowClick={(r) => setParam({ id: r.id })}
            columns={[
              ["id", "Record", (r) => `#${r.id}`],
              ["document_id", "Document", (r) => `#${r.document_id}`],
              ["employee_id", "Employee", (r) => `#${r.employee_id}`],
              ["acknowledged_at", "Acknowledged", (r) => fmtDateTime(r.acknowledged_at)],
              ["text_version", "Wording version"],
              ["document_sha256", "Document fingerprint", (r) => (r.document_sha256 ? <code className="text-xs">{r.document_sha256.slice(0, 16)}…</code> : "—")],
            ]}
          />
        )}
        <Pager data={list.data} page={page} setPage={setPage} />
      </Card>
      {ackId && (
        <RecordPanel title={`HR-DOC-013 record #${ackId}`} {...record} path={`${BASE}/acknowledgements/${ackId}`} filename={`HR-DOC-013-${ackId}`} onError={onError} />
      )}
    </div>
  );
}

// ── HR-DOC-014 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function DistributionsReport({ params, setParam, onError }) {
  const id = params.get("distribution") || "";
  const list = useLoad(() => listPolicyDistributions({ per_page: 100 }), []);
  const record = useLoad(() => (id ? governanceDistribution(id) : null), [id]);
  const items = (list.data?.items || []).filter((d) => d.status !== "DRAFT");
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="gov-dist" className="mb-1 block text-xs font-semibold text-slate-600">Distribution</label>
        <select id="gov-dist" className={`${inputCls} max-w-md`} value={id} onChange={(e) => setParam({ distribution: e.target.value })}>
          <option value="">Choose a published distribution…</option>
          {items.map((d) => <option key={d.id} value={d.id}>#{d.id} · {d.title} ({humanize(d.status)})</option>)}
          {id && !items.some((d) => String(d.id) === id) && <option value={id}>#{id}</option>}
        </select>
        <ErrorBanner error={list.error} className="mt-2" />
      </div>
      {id ? (
        <RecordPanel title={`HR-DOC-014 record for distribution #${id}`} {...record} path={`${BASE}/distributions/${id}`} filename={`HR-DOC-014-${id}`} onError={onError} />
      ) : (
        <p className="text-sm text-slate-600">Choose a distribution to view its record.</p>
      )}
    </div>
  );
}

// ── HR-DOC-016 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ExpiriesReport({ onError, showToast }) {
  const [status, setStatus] = useState("OPEN");
  const { data, loading, error, reload } = useLoad(() => governanceExpiries({ status: status || undefined }), [status]);
  const [resolving, setResolving] = useState(null); // {item, status}

  const quick = async (item, next) => {
    try {
      await resolveExpiryItem(item.id, { status: next, note: null });
      showToast("success", next === "OPEN" ? "Reopened." : "Marked as renewed.");
      reload();
    } catch (e) {
      showToast("error", e.message || "Could not update.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="gov-exp-status" className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
          <select id="gov-exp-status" className={`${inputCls} w-44`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="RENEWED">Renewed</option>
            <option value="WAIVED">Waived</option>
          </select>
        </div>
        <ExportButtons path={`${BASE}/expiries`} filename="HR-DOC-016-expiries" onError={onError} />
      </div>
      <ErrorBanner error={error} />
      {loading ? <p className="text-sm text-slate-600">Loading…</p> : (
        <Table
          caption="Expiry items"
          rows={data?.items || []}
          empty="Nothing is expiring."
          columns={[
            ["title", "Item", (r) => <><span className="font-semibold">{r.title}</span><span className="block text-xs text-slate-600">{humanize(r.item_type)} #{r.ref_id}</span></>],
            ["expiry_date", "Expires", (r) => fmtDate(r.expiry_date)],
            ["action_required", "Action required", (r) => r.action_required || "—"],
            ["owner_employee_id", "Owner", (r) => (r.owner_employee_id ? `Employee #${r.owner_employee_id}` : "—")],
            ["status", "Status", (r) => (
              <div>
                <StatusChip status={r.status} />
                {r.resolution_note && <p className="mt-1 max-w-xs whitespace-normal text-xs text-slate-600">“{r.resolution_note}”</p>}
                {r.resolved_at && <p className="text-xs text-slate-600">{fmtDateTime(r.resolved_at)}</p>}
              </div>
            )],
            ["actions", "Actions", (r) => (
              <div className="flex flex-wrap gap-1.5">
                {r.status === "OPEN" ? (
                  <>
                    <SecondaryButton className="px-2.5 py-1 text-xs" icon={CheckCircle2} onClick={() => quick(r, "RENEWED")}>Renewed</SecondaryButton>
                    <SecondaryButton className="px-2.5 py-1 text-xs" icon={XCircle} onClick={() => setResolving(r)}>Waive</SecondaryButton>
                  </>
                ) : (
                  <SecondaryButton className="px-2.5 py-1 text-xs" icon={RotateCcw} onClick={() => quick(r, "OPEN")}>Reopen</SecondaryButton>
                )}
              </div>
            )],
          ]}
        />
      )}
      <WaiveModal item={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); showToast("success", "Waived."); reload(); }} />
    </div>
  );
}

function WaiveModal({ item, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setNote(""); setBusy(false); setError(null); }, [item]);
  const submit = async () => {
    if (!note.trim()) { setError("Give a reason for waiving."); return; }
    setBusy(true); setError(null);
    try { await resolveExpiryItem(item.id, { status: "WAIVED", note: note.trim() }); onDone(); } catch (e) { setError(e.message || "Could not update."); setBusy(false); }
  };
  return (
    <Modal
      open={Boolean(item)}
      onClose={busy ? undefined : onClose}
      title="Waive expiry"
      description={item?.title}
      size="md"
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton loading={busy} onClick={submit}>Waive</PrimaryButton></>}
    >
      <label htmlFor="gov-waive-note" className="mb-1.5 block text-sm font-medium text-slate-700">Reason <span className="text-red-600">(required)</span></label>
      <textarea id="gov-waive-note" rows={4} maxLength={2000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBanner error={error} className="mt-3" />
    </Modal>
  );
}

// ── HR-DOC-018 ────────────────────────────────────────────────────────────────────────────────────────────────────────
function SupersessionsReport({ params, setParam, onError }) {
  const id = params.get("id");
  const list = useLoad(() => governanceSupersessions(), []);
  const record = useLoad(() => (id ? governanceSupersession(id) : null), [id]);
  return (
    <div className="space-y-4">
      <ErrorBanner error={list.error} />
      {list.loading ? <p className="text-sm text-slate-600">Loading…</p> : (
        <Table
          caption="Supersessions"
          rows={list.data?.items || []}
          empty="No template version has replaced another yet."
          selectedKey={id}
          onRowClick={(r) => setParam({ id: r.id })}
          columns={[
            ["canonical_id", "Template"],
            ["versions", "Change", (r) => `v${r.old_version ?? "?"} → ${r.new_version != null ? `v${r.new_version}` : "withdrawn"}`],
            ["action", "Action", (r) => humanize(r.action)],
            ["reason", "Reason", (r) => <span className="block max-w-xs whitespace-normal">{r.reason || "—"}</span>],
            ["effective_at", "Effective", (r) => fmtDateTime(r.effective_at)],
            ["affected_in_progress", "In progress affected", (r) => r.affected_in_progress ?? 0],
            ["issued_unchanged", "Issued documents unchanged", (r) => (r.issued_unchanged ? "Yes" : "No")],
          ]}
        />
      )}
      {id && (
        <RecordPanel title={`HR-DOC-018 record #${id}`} {...record} path={`${BASE}/supersessions/${id}`} filename={`HR-DOC-018-${id}`} onError={onError} />
      )}
    </div>
  );
}
