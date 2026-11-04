// Generated documents (template engine): every document produced from a template, with its approval steps, signatures,
// timeline and preview, and the actions HR / managers can take on it. `?id=<documentId>` opens a document directly.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BadgeCheck, Ban, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileStack, Gavel, Layers, Lock, RefreshCw,
  Send, ShieldCheck, Unlock, Wrench, X, XCircle,
} from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import SandboxedHtmlPreview from "../../../../components/documents/SandboxedHtmlPreview";
import { useAuth } from "../../../../context/AuthContext";
import {
  approveGeneratedDocument, bulkGenerateDocuments, cancelGeneratedDocument, correctGeneratedDocument, downloadGeneratedDocument,
  getDocumentTimeline, getGeneratedDocument, issueGeneratedDocument, listGeneratedDocuments, listTemplateFamilies, listTemplates,
  previewGeneratedDocument, reasonText, rejectGeneratedDocument, releaseLegalHold, setLegalHold,
} from "../../../../service/docTemplatesService";
import {
  Card, DOCUMENT_STATUSES, EmployeePicker, ErrorBanner, ExportButtons, PrimaryButton, ReasonModal, SecondaryButton, StatusChip, Toast,
  fmtDate, fmtDateTime, inputCls, useToast,
} from "./docUi";

const PER_PAGE = 25;
const CANCELLABLE = ["REQUESTED", "CONTEXT_VALIDATED", "RENDERED_DRAFT", "PENDING_APPROVAL", "HUMAN_APPROVED", "ISSUED"];
const CORRECTABLE = ["ISSUED", "ACKNOWLEDGED", "EXECUTED", "DECLINED", "EXPIRED"];
const EXECUTION_TEXT = {
  NONE: "No action by the recipient",
  ACKNOWLEDGE: "Recipient acknowledges",
  SIGN_EMPLOYEE: "Employee signs",
  SIGN_BOTH: "Employee and employer sign",
  SIGN_CANDIDATE: "Candidate signs",
};
const STEP_KIND_TEXT = { APPROVER: "Approver", HR_APPROVER: "HR approver", SIGNATORY: "Authorised signatory" };
const PARTY_TEXT = { employee: "Employee", employer: "Employer", candidate: "Candidate" };

// Human message for an action failure, including the structured engine codes.
function actionError(e) {
  if (e?.code === "VARIANT_NO_LONGER_ACTIVE") return "The template was withdrawn: cancel this draft and generate again.";
  if (e?.code === "SEPARATION_OF_DUTIES") return e.detail?.message || "Someone else has to take this step (separation of duties).";
  return e?.message || "The action failed.";
}

const humanize = (s) => (s ? String(s).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—");

// ── list ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function GeneratedDocumentsPage() {
  const { user } = useAuth();
  const isHr = ["admin", "hr_admin", "super_admin"].includes(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("id");

  const [filters, setFilters] = useState({ status: "", family: "", template: "", search: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: PER_PAGE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [families, setFamilies] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { ...filters, page, per_page: PER_PAGE };
    if (filters.date_from) params.date_from = `${filters.date_from}T00:00:00`;
    if (filters.date_to) params.date_to = `${filters.date_to}T23:59:59`;
    return listGeneratedDocuments(params)
      .then((res) => setData(res || { items: [], total: 0 }))
      .catch((e) => setError(e.message || "Could not load documents."))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isHr) return;
    listTemplates({ per_page: 600 }).then((r) => setTemplates(r?.items || [])).catch(() => setTemplates([]));
    listTemplateFamilies().then((r) => setFamilies(r?.items || [])).catch(() => setFamilies([]));
  }, [isHr]);

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const openDoc = (id) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("id", String(id)); return n; });
  const closeDoc = () => setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("id"); return n; });

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.per_page || PER_PAGE)));
  const templateOptions = useMemo(
    () => templates.filter((t) => !filters.family || t.family_id === filters.family).map((t) => ({ value: t.canonical_id, label: `${t.canonical_id} · ${t.title}` })),
    [templates, filters.family],
  );

  return (
    <HRPage
      title="Generated documents"
      subtitle="Documents produced from templates: review, approve, issue and track them."
      actions={
        <div className="flex flex-wrap gap-2">
          <SecondaryButton icon={RefreshCw} onClick={load}>Refresh</SecondaryButton>
          {isHr && <PrimaryButton icon={Layers} onClick={() => setBulkOpen(true)}>Bulk generate</PrimaryButton>}
        </div>
      }
    >
      <div className="space-y-4">
        <section aria-label="Filters" className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="gd-search" className="mb-1 block text-xs font-semibold text-slate-600">Search</label>
            <input id="gd-search" type="search" className={inputCls} placeholder="Number, title or recipient" value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)} />
          </div>
          <div>
            <label htmlFor="gd-status" className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
            <select id="gd-status" className={inputCls} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(DOCUMENT_STATUSES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="gd-family" className="mb-1 block text-xs font-semibold text-slate-600">Family</label>
            <select id="gd-family" className={inputCls} value={filters.family} onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value, template: "" }))}>
              <option value="">All families</option>
              {families.map((f) => <option key={f.family_id} value={f.family_id}>{f.family_id} · {f.name}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="gd-template" className="mb-1 block text-xs font-semibold text-slate-600">Template</label>
            {templateOptions.length ? (
              <select id="gd-template" className={inputCls} value={filters.template} onChange={(e) => setFilter("template", e.target.value)}>
                <option value="">All templates</option>
                {templateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id="gd-template" className={inputCls} placeholder="Template id, e.g. HR-EMP-001" value={filters.template}
                onChange={(e) => setFilter("template", e.target.value.trim().toUpperCase())} />
            )}
          </div>
          <div>
            <label htmlFor="gd-from" className="mb-1 block text-xs font-semibold text-slate-600">Created from</label>
            <input id="gd-from" type="date" className={inputCls} value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
          </div>
          <div>
            <label htmlFor="gd-to" className="mb-1 block text-xs font-semibold text-slate-600">Created to</label>
            <input id="gd-to" type="date" className={inputCls} value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
          </div>
          <div className="flex items-end">
            <SecondaryButton icon={X} onClick={() => { setFilters({ status: "", family: "", template: "", search: "", date_from: "", date_to: "" }); setPage(1); }}>
              Clear filters
            </SecondaryButton>
          </div>
        </section>

        <ErrorBanner error={error} />

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-busy={loading}>
              <caption className="sr-only">Generated documents</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Document</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Recipient</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Template</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Approval</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading documents…</td></tr>
                )}
                {!loading && data.items.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No documents match these filters.</td></tr>
                )}
                {!loading && data.items.map((d) => (
                  <tr
                    key={d.id}
                    tabIndex={0}
                    onClick={() => openDoc(d.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDoc(d.id); } }}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-slate-50 focus:bg-blue-50 focus:outline-none ${String(d.id) === openId ? "bg-blue-50/60" : ""}`}
                    aria-label={`Open ${d.document_number || d.title}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{d.title}</p>
                      <p className="text-xs text-slate-600">{d.document_number || `#${d.id}`}{d.legal_hold ? " · Legal hold" : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{d.recipient_name || "—"}<span className="block text-xs text-slate-600">{humanize(d.subject_type)}</span></td>
                    <td className="px-4 py-3 text-slate-800">{d.canonical_id}{d.variant_version ? <span className="block text-xs text-slate-600">v{d.variant_version}</span> : null}</td>
                    <td className="px-4 py-3"><StatusChip status={d.status} /></td>
                    <td className="px-4 py-3 text-slate-800">{d.approval_policy || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">{fmtDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm text-slate-700">
            <span>{data.total || 0} document{data.total === 1 ? "" : "s"} · page {data.page || page} of {totalPages}</span>
            <div className="flex gap-2">
              <SecondaryButton icon={ChevronLeft} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
              <SecondaryButton disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></SecondaryButton>
            </div>
          </nav>
        </div>
      </div>

      {openId && (
        <DocumentDrawer
          key={openId}
          id={openId}
          isHr={isHr}
          onClose={closeDoc}
          onChanged={load}
          onOpenDoc={openDoc}
          showToast={showToast}
        />
      )}

      {isHr && (
        <BulkGenerateModal open={bulkOpen} onClose={() => setBulkOpen(false)} templates={templates} onOpenDoc={(id) => { setBulkOpen(false); openDoc(id); }} onDone={load} />
      )}

      <Toast toast={toast} />
    </HRPage>
  );
}

// ── document drawer ───────────────────────────────────────────────────────────────────────────────────────────────────
const TABS = [["summary", "Summary"], ["approvals", "Approvals & signatures"], ["timeline", "Timeline"], ["preview", "Preview"]];

function DocumentDrawer({ id, isHr, onClose, onChanged, onOpenDoc, showToast }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("summary");
  const [timeline, setTimeline] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [prompt, setPrompt] = useState(null); // {kind}
  const [busy, setBusy] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return getGeneratedDocument(id)
      .then(setDoc)
      .catch((e) => setError(e.message || "Could not load the document."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !prompt) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, prompt]);

  useEffect(() => {
    if (tab === "timeline" && timeline === null) {
      getDocumentTimeline(id).then((r) => setTimeline(r?.items || [])).catch(() => setTimeline([]));
    }
    if (tab === "preview" && preview === null && !previewError) {
      previewGeneratedDocument(id).then((r) => setPreview(r?.html || "")).catch((e) => setPreviewError(e.message || "Preview is not available."));
    }
  }, [tab, id, timeline, preview, previewError]);

  const afterChange = async (message) => {
    showToast("success", message);
    setTimeline(null);
    setPreview(null);
    await reload();
    onChanged();
  };

  const runSimple = async (kind, fn, message) => {
    setBusy(kind);
    try {
      await fn();
      await afterChange(message);
    } catch (e) {
      showToast("error", actionError(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async (original) => {
    setBusy(original ? "dl-original" : "dl");
    try { await downloadGeneratedDocument(id, { original }); } catch (e) { showToast("error", actionError(e)); } finally { setBusy(null); }
  };

  // prompt-based actions; throwing keeps the modal open with the error shown
  const PROMPTS = {
    approve: { title: "Approve document", label: "Comment", required: false, confirm: "Approve",
      run: async (t) => { await approveGeneratedDocument(id, t || null); await afterChange("Approved."); } },
    reject: { title: "Reject document", label: "Comment", required: true, confirm: "Reject", danger: true,
      description: "The requester will see your comment.",
      run: async (t) => { await rejectGeneratedDocument(id, t); await afterChange("Rejected."); } },
    cancel: { title: "Cancel document", label: "Reason", required: true, confirm: "Cancel document", danger: true,
      description: doc?.status === "ISSUED" ? "The recipient will no longer be able to act on it." : undefined,
      run: async (t) => { await cancelGeneratedDocument(id, t); await afterChange("Document cancelled."); } },
    correct: { title: "Correct document", label: "What needs correcting", required: true, confirm: "Create correction",
      description: "This creates a new draft that replaces this document once issued. The original stays on record.",
      run: async (t) => {
        const created = await correctGeneratedDocument(id, t);
        showToast("success", "Correction draft created.");
        onChanged();
        if (created?.id) onOpenDoc(created.id);
      } },
    hold: { title: "Place on legal hold", label: "Reason", required: true, confirm: "Place on hold", danger: true,
      description: "Nothing can be changed, cancelled or deleted while the hold is in place.",
      run: async (t) => { await setLegalHold(id, t); await afterChange("Legal hold set."); } },
  };
  const active = prompt ? PROMPTS[prompt] : null;
  const submitPrompt = async (text) => {
    try { await active.run(text); setPrompt(null); } catch (e) { throw new Error(actionError(e)); }
  };

  const s = doc?.status;
  const canIssue = doc && ((s === "RENDERED_DRAFT" && doc.approval_policy === "L1") || s === "HUMAN_APPROVED");
  const hasSignatures = (doc?.signatures || []).some((x) => x.signed_at || x.decision);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="gd-drawer-title">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{doc?.document_number || `Document #${id}`}</p>
            <h2 id="gd-drawer-title" className="truncate text-lg font-bold text-slate-900">{doc?.title || "Loading…"}</h2>
            {doc && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusChip status={doc.status} />
                {doc.legal_hold && doc.status !== "LEGAL_HOLD" && <StatusChip status="LEGAL_HOLD" />}
                {isHr && doc.tenant_approved_template && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Organization-approved template
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close document" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {doc && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3">
            {s === "PENDING_APPROVAL" && (
              <>
                <PrimaryButton icon={CheckCircle2} onClick={() => setPrompt("approve")}>Approve</PrimaryButton>
                <SecondaryButton tone="danger" icon={XCircle} onClick={() => setPrompt("reject")}>Reject</SecondaryButton>
              </>
            )}
            {canIssue && (
              <PrimaryButton icon={Send} loading={busy === "issue"} onClick={() => runSimple("issue", () => issueGeneratedDocument(id), "Document issued.")}>Issue</PrimaryButton>
            )}
            {CORRECTABLE.includes(s) && <SecondaryButton icon={Wrench} onClick={() => setPrompt("correct")}>Correct</SecondaryButton>}
            {CANCELLABLE.includes(s) && !doc.legal_hold && <SecondaryButton tone="danger" icon={Ban} onClick={() => setPrompt("cancel")}>Cancel</SecondaryButton>}
            {isHr && (doc.legal_hold || s === "LEGAL_HOLD" ? (
              <SecondaryButton icon={Unlock} loading={busy === "release"} onClick={() => runSimple("release", () => releaseLegalHold(id), "Legal hold released.")}>Release legal hold</SecondaryButton>
            ) : (
              <SecondaryButton icon={Lock} onClick={() => setPrompt("hold")}>Legal hold</SecondaryButton>
            ))}
            {doc.pdf_sha256 && (
              <SecondaryButton icon={Download} loading={busy === "dl"} onClick={() => download(false)}>{doc.executed ? "Download signed" : "Download"}</SecondaryButton>
            )}
            {doc.executed && (
              <SecondaryButton icon={Download} loading={busy === "dl-original"} onClick={() => download(true)}>Download original (unsigned)</SecondaryButton>
            )}
          </div>
        )}

        <div role="tablist" aria-label="Document sections" className="flex gap-1 overflow-x-auto border-b border-gray-100 px-5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`gd-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`gd-panel-${key}`}
              type="button"
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div id={`gd-panel-${tab}`} role="tabpanel" aria-labelledby={`gd-tab-${tab}`} className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !doc && <p className="text-sm text-slate-600">Loading…</p>}
          <ErrorBanner error={error} />
          {doc && tab === "summary" && <SummaryTab doc={doc} isHr={isHr} hasSignatures={hasSignatures} onOpenDoc={onOpenDoc} showToast={showToast} />}
          {doc && tab === "approvals" && <ApprovalsTab doc={doc} />}
          {tab === "timeline" && <TimelineTab items={timeline} />}
          {tab === "preview" && (
            previewError ? <ErrorBanner error={previewError} /> : preview === null ? <p className="text-sm text-slate-600">Loading preview…</p> : <SandboxedHtmlPreview html={preview} height={720} title={`Preview of ${doc?.title || "document"}`} />
          )}
        </div>
      </div>

      <ReasonModal
        open={Boolean(active)}
        title={active?.title}
        description={active?.description}
        label={active?.label}
        required={active?.required}
        confirmLabel={active?.confirm}
        danger={active?.danger}
        onSubmit={submitPrompt}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
}

function KV({ rows }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-slate-600">{k}</dt>
          <dd className="break-words text-slate-900">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryTab({ doc, isHr, hasSignatures, onOpenDoc, showToast }) {
  const docLink = (otherId, text) => (
    <button type="button" onClick={() => onOpenDoc(otherId)} className="font-semibold text-blue-700 underline-offset-2 hover:underline">{text} #{otherId}</button>
  );
  return (
    <div className="space-y-4">
      <Card title="Document">
        <KV rows={[
          ["Recipient", doc.recipient_name],
          ["Subject", `${humanize(doc.subject_type)} #${doc.subject_id}`],
          ["Template", `${doc.canonical_id}${doc.variant_version ? ` · version ${doc.variant_version}` : ""}`],
          ["Kind", humanize(doc.kind)],
          ["Recipient action", EXECUTION_TEXT[doc.execution_mode] || doc.execution_mode],
          ["Approval policy", doc.approval_policy],
          ["Language", doc.language],
          ["Legal risk", humanize(doc.legal_risk)],
          ["Sensitivity", humanize(doc.sensitivity)],
          ["Source", doc.source_ref],
          doc.delivered_via ? ["Delivered via", humanize(doc.delivered_via)] : null,
        ]} />
      </Card>
      <Card title="Dates">
        <KV rows={[
          ["Created", fmtDateTime(doc.created_at)],
          ["Status changed", fmtDateTime(doc.status_changed_at)],
          ["Issued", doc.issued_at ? fmtDateTime(doc.issued_at) : "Not issued"],
          ["Viewed by recipient", doc.viewed_at ? fmtDateTime(doc.viewed_at) : "Not yet"],
          ["Due by", doc.due_by ? fmtDate(doc.due_by) : "—"],
          ["Expires", doc.expires_at ? fmtDateTime(doc.expires_at) : "—"],
          ["Retain until", doc.retention_until ? fmtDate(doc.retention_until) : "—"],
        ]} />
      </Card>
      {(doc.corrects_document_id || doc.corrected_by_document_id) && (
        <Card title="Corrections">
          <KV rows={[
            doc.corrects_document_id ? ["Corrects", docLink(doc.corrects_document_id, "Document")] : null,
            doc.corrected_by_document_id ? ["Corrected by", docLink(doc.corrected_by_document_id, "Document")] : null,
          ]} />
        </Card>
      )}
      <Card title="Integrity">
        <KV rows={[
          ["Document fingerprint", doc.pdf_sha256 ? <code className="text-xs">{doc.pdf_sha256}</code> : "Not rendered yet"],
          doc.executed_pdf_sha256 ? ["Signed copy fingerprint", <code key="e" className="text-xs">{doc.executed_pdf_sha256}</code>] : null,
          doc.decision_receipt_id ? ["Decision receipt", `#${doc.decision_receipt_id}`] : null,
        ]} />
      </Card>
      {isHr && (
        <Card title="Governance records">
          <ul className="space-y-3 text-sm">
            <GovRecord label="HR-DOC-008 Generation instruction" report="generation" doc={doc}
              path={`/hr/generated-documents/governance/generation-instructions/${doc.id}`} filename={`HR-DOC-008-${doc.document_number || doc.id}`} showToast={showToast} />
            {doc.approval_policy !== "L1" && (
              <GovRecord label="HR-DOC-010 Workflow approval" report="workflow" doc={doc}
                path={`/hr/generated-documents/governance/workflow-approvals/${doc.id}`} filename={`HR-DOC-010-${doc.document_number || doc.id}`} showToast={showToast} />
            )}
            {hasSignatures && (
              <GovRecord label="HR-DOC-012 Signature evidence" report="signatures" doc={doc}
                path={`/hr/generated-documents/governance/signature-evidence/${doc.id}`} filename={`HR-DOC-012-${doc.document_number || doc.id}`} showToast={showToast} />
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function GovRecord({ label, report, doc, path, filename, showToast }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <Link to={`/zoiko-hr/documents/governance?report=${report}&document=${doc.id}`} className="inline-flex items-center gap-1.5 font-semibold text-blue-700 underline-offset-2 hover:underline">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {label}
      </Link>
      <ExportButtons path={path} filename={filename} formats={["pdf"]} size="sm" onError={(m) => showToast("error", m)} />
    </li>
  );
}

function ApprovalsTab({ doc }) {
  const steps = doc.approval_steps || [];
  const sigs = doc.signatures || [];
  const required = doc.required_parties || [];
  return (
    <div className="space-y-4">
      <Card title={`Approval steps (${doc.approval_policy || "—"})`}>
        {steps.length === 0 ? (
          <p className="text-sm text-slate-600">{doc.approval_policy === "L1" ? "No approval needed: HR can issue this document directly." : "No approval steps recorded."}</p>
        ) : (
          <ol className="space-y-2">
            {steps.map((st) => (
              <li key={st.step_order} className="rounded-lg border border-gray-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">Step {st.step_order}: {STEP_KIND_TEXT[st.step_kind] || st.step_kind}</p>
                  <StatusChip status={st.decision} />
                </div>
                <p className="mt-1 text-xs text-slate-600">Who can decide: {(st.required_roles || []).map(humanize).join(", ") || "—"}</p>
                {st.approver_id && <p className="text-xs text-slate-600">Decided by user #{st.approver_id}{st.decided_at ? ` on ${fmtDateTime(st.decided_at)}` : ""}</p>}
                {st.comment && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-800">“{st.comment}”</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card title="Signatures">
        {required.length === 0 && sigs.length === 0 ? (
          <p className="text-sm text-slate-600">{EXECUTION_TEXT[doc.execution_mode] || "No signatures required."}</p>
        ) : (
          <ul className="space-y-2">
            {(required.length ? required : sigs.map((x) => x.party)).map((party) => {
              const sig = sigs.find((x) => x.party === party);
              return (
                <li key={party} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 p-3 text-sm">
                  <span className="font-semibold text-slate-900">{PARTY_TEXT[party] || humanize(party)}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {sig?.signed_at && <span>{fmtDateTime(sig.signed_at)}{sig.method ? ` · ${humanize(sig.method)}` : ""}</span>}
                    <StatusChip status={sig ? sig.decision || "SIGNED" : "PENDING"} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TimelineTab({ items }) {
  if (items === null) return <p className="text-sm text-slate-600">Loading timeline…</p>;
  if (!items.length) return <p className="text-sm text-slate-600">No events recorded yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-gray-200 pl-5">
      {items.map((ev, i) => {
        const detail = ev.detail && typeof ev.detail === "object" ? Object.entries(ev.detail).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];
        return (
          <li key={i} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600" aria-hidden="true" />
            <div className="rounded-lg border border-gray-100 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{humanize(ev.event_type)}</p>
                <time className="text-xs text-slate-600" dateTime={ev.created_at}>{fmtDateTime(ev.created_at)}</time>
              </div>
              <p className="text-xs text-slate-600">{humanize(ev.actor_type)}{ev.actor_id ? ` #${ev.actor_id}` : ""}</p>
              {typeof ev.detail === "string" && <p className="mt-1 text-xs text-slate-800">{ev.detail}</p>}
              {detail.length > 0 && (
                <p className="mt-1 break-all text-xs text-slate-700">{detail.map(([k, v]) => `${humanize(k)}: ${v}`).join(" · ")}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── bulk generate ─────────────────────────────────────────────────────────────────────────────────────────────────────
function BulkGenerateModal({ open, onClose, templates, onOpenDoc, onDone }) {
  const [canonicalId, setCanonicalId] = useState("");
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null);

  useEffect(() => {
    if (open) { setCanonicalId(""); setSelected({}); setError(null); setRun(null); setBusy(false); }
  }, [open]);

  const options = useMemo(
    () => templates.filter((t) => t.implemented && t.available && !t.engine_record && t.output_mode !== "POLICY"),
    [templates],
  );
  const names = selected;

  const submit = async () => {
    const ids = Object.keys(selected).map(Number);
    if (!canonicalId) { setError("Choose a template."); return; }
    if (!ids.length) { setError("Choose at least one employee."); return; }
    setBusy(true); setError(null);
    try {
      const res = await bulkGenerateDocuments({ canonical_id: canonicalId, subject_type: "employee", subject_ids: ids, language: "en" });
      setRun(res);
      onDone();
    } catch (e) {
      setError(actionError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Bulk generate"
      description="Create drafts of one template for many employees. Drafts are not issued: review and issue them afterwards."
      icon={FileStack}
      size="xl"
      footer={
        run ? (
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        ) : (
          <>
            <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
            <PrimaryButton icon={Layers} loading={busy} onClick={submit}>Generate {Object.keys(selected).length || ""} draft{Object.keys(selected).length === 1 ? "" : "s"}</PrimaryButton>
          </>
        )
      }
    >
      {!run ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="bulk-template" className="mb-1.5 block text-sm font-medium text-slate-700">Template</label>
            <select id="bulk-template" className={inputCls} value={canonicalId} onChange={(e) => setCanonicalId(e.target.value)}>
              <option value="">Choose a template…</option>
              {options.map((t) => <option key={t.canonical_id} value={t.canonical_id}>{t.canonical_id} · {t.title}</option>)}
            </select>
            {options.length === 0 && <p className="mt-1 text-xs text-slate-600">No templates are available yet. Release a template version first.</p>}
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Employees (up to 200)</legend>
            <EmployeePicker value={selected} onChange={setSelected} idPrefix="bulk-emp" max={200} />
          </fieldset>
          <ErrorBanner error={error} />
        </div>
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm text-slate-800">
            <strong>{run.generated}</strong> draft{run.generated === 1 ? "" : "s"} created, <strong>{run.blocked}</strong> blocked.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Bulk generation results</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2">Employee</th>
                  <th scope="col" className="px-3 py-2">Result</th>
                  <th scope="col" className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {(run.results || []).map((r) => (
                  <tr key={r.subject_id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 text-slate-900">{names[r.subject_id] || `Employee #${r.subject_id}`}</td>
                    <td className="px-3 py-2">{r.document_id ? <StatusChip status="GENERATED" /> : <StatusChip status={r.outcome === "ALLOW" ? "BLOCKED" : r.outcome} />}</td>
                    <td className="px-3 py-2 text-xs text-slate-800">
                      {r.document_id ? (
                        <button type="button" onClick={() => onOpenDoc(r.document_id)} className="inline-flex items-center gap-1 font-semibold text-blue-700 underline-offset-2 hover:underline">
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Open draft #{r.document_id}
                        </button>
                      ) : (
                        <ul className="list-disc space-y-0.5 pl-4">
                          {(r.reasons || []).map((c) => <li key={c}>{reasonText(c)}</li>)}
                          {(r.missing_fields || []).filter((f) => !(r.reasons || []).includes(`MISSING_FIELD:${f}`)).map((f) => <li key={f}>Missing information: {f}</li>)}
                          {!(r.reasons || []).length && !(r.missing_fields || []).length && <li>{r.message || "Not generated."}</li>}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-600"><Gavel className="h-3.5 w-3.5" aria-hidden="true" /> Drafts still need approval and issuing from this page.</p>
        </div>
      )}
    </Modal>
  );
}
