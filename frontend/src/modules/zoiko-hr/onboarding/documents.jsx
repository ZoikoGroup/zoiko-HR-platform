/*
 * Onboarding › Documents — request, collect and review new hires' onboarding documents, in the Recruitment look:
 * KPI row, status chips, filters, a document table, a right-hand detail panel (preview, download, approve, reject) and
 * slide-over forms for uploading, requesting and rejecting. Every number is counted from the loaded documents, except the
 * "Needs review" trend, which comes from the onboarding insights.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Eye, FileCheck2, FileText, FileUp, FileX2, Files, Hourglass, Inbox, Send, ThumbsUp,
  Trash2, Upload, X } from "lucide-react";
import OnboardingLayout from "./OnboardingLayout";
import {
  Avatar, Card, ChipTabs, DetailPanel, DetailSection, EmptyState, FilterSelect, KpiCard, KpiGrid, Pagination, PersonCell,
  PrimaryButton, QuickAction, SearchInput, SecondaryButton, StatusPill, Table, WithDetail, relativeTime, shortDate, td, useInsights,
} from "../recruitment/ui";
import {
  getOnboardingDocuments,
  createOnboardingDocument,
  updateOnboardingDocument,
  deleteOnboardingDocument,
  getOnboardingRecords,
  getOnboardingDocumentFile,
  requestOnboardingDocuments,
} from "../../../service/hrService";
import { MAX_FILE_MB, validateUploadForm, serverUploadErrors, fileSizeText, extensionOf } from "../../../utils/onboardingDocForm";

export const CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "offer_letter", label: "Signed offer letter" },
  { value: "nda", label: "Signed NDA" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

export const STATUSES = [
  { value: "requested", label: "Requested (waiting for new hire)", short: "Requested", cls: "bg-blue-100 text-blue-800", tone: "blue" },
  { value: "pending", label: "Needs review", short: "Needs review", cls: "bg-yellow-100 text-yellow-800", tone: "amber" },
  { value: "approved", label: "Approved", short: "Approved", cls: "bg-green-100 text-green-800", tone: "green" },
  { value: "rejected", label: "Rejected", short: "Rejected", cls: "bg-red-100 text-red-800", tone: "red" },
];

// HR uploads accept this narrower set (the shared form rules allow more types).
export const UPLOAD_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];

export function validateHrUpload(form) {
  const errors = validateUploadForm(form);
  if (!errors.file && form.file && !UPLOAD_EXTENSIONS.includes(extensionOf(form.file.name))) {
    errors.file = `${extensionOf(form.file.name) || "This"} file type is not allowed. Use a PDF, JPG, PNG or Word (DOC/DOCX) file.`;
  }
  return errors;
}

const CATEGORY_TONE = {
  id_proof: "blue", offer_letter: "violet", nda: "amber", education_certificates: "teal", experience_letters: "teal",
  bank_details: "green", other: "gray",
};

const INACTIVE_HIRE_STATUSES = ["completed", "cancelled"];
const INITIAL_UPLOAD_FORM = { title: "", category: "", file: null, onboarding_record_id: "" };
const STATUS_ICON = { requested: Hourglass, pending: Inbox, approved: CheckCircle2, rejected: FileX2 };

const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const fieldCls = (bad) => `w-full rounded-xl border ${bad ? "border-rose-300" : "border-gray-200"} bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

const statusOf = (doc) => doc.status || "pending";
const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || value || "—";

function DocStatus({ status }) {
  const st = STATUSES.find((s) => s.value === status);
  return <StatusPill tone={st?.tone || "gray"} icon={STATUS_ICON[status]}>{st?.short || status}</StatusPill>;
}

/** Right-hand slide-over that holds a form (upload, request, reject). */
function SlideOver({ title, subtitle, icon: Icon, onClose, children, width = "sm:max-w-[520px]" }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:rounded-l-2xl ${width}`}>
        <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-4 py-4 text-white sm:rounded-tl-2xl sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15" aria-hidden="true">
                <Icon className="h-5 w-5 text-blue-300" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {subtitle && <p className="break-words text-sm text-slate-300">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function SlideOverFooter({ children }) {
  return <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">{children}</div>;
}

/** Loads the document's file and shows it inline when the browser can (PDF, images). */
function FilePreview({ doc }) {
  const [state, setState] = useState({ url: "", type: "", name: "", error: "", loading: true });
  useEffect(() => {
    let live = true;
    let url = "";
    setState({ url: "", type: "", name: "", error: "", loading: true });
    getOnboardingDocumentFile(doc.id)
      .then((res) => {
        if (!live) return;
        if (!res?.blob || typeof URL.createObjectURL !== "function") { setState({ url: "", type: "", name: res?.filename || "", error: "", loading: false }); return; }
        url = URL.createObjectURL(res.blob);
        setState({ url, type: res.blob.type || "", name: res.filename || "", error: "", loading: false });
      })
      .catch((e) => live && setState({ url: "", type: "", name: "", error: e?.message || "The file could not be loaded.", loading: false }));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [doc.id]);

  const box = "grid h-56 place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500";
  if (state.loading) return <div className={box}><span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-b-transparent" aria-label="Loading preview" /></div>;
  if (state.error) return <div className={box}>{state.error}</div>;
  const ext = extensionOf(state.name || "");
  const isImage = state.type.startsWith("image/") || [".png", ".jpg", ".jpeg"].includes(ext);
  const isPdf = state.type === "application/pdf" || ext === ".pdf";
  if (state.url && isImage) return <img src={state.url} alt={doc.title} className="max-h-80 w-full rounded-xl border border-gray-200 object-contain" />;
  if (state.url && isPdf) return <iframe src={state.url} title={`Preview of ${doc.title}`} className="h-80 w-full rounded-xl border border-gray-200" />;
  return <div className={box}>No inline preview for this file type{state.name ? ` (${state.name})` : ""}. Use Download.</div>;
}

export default function OnboardingDocuments() {
  const insights = useInsights("onboarding");
  const [documents, setDocuments] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedId, setSelectedId] = useState(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadForm, setUploadForm] = useState({ ...INITIAL_UPLOAD_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [rejectError, setRejectError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);   // changing it empties the file box
  const [busyId, setBusyId] = useState(null);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestHire, setRequestHire] = useState("");
  const [requestCategories, setRequestCategories] = useState([]);
  const [requestError, setRequestError] = useState("");
  const [requesting, setRequesting] = useState(false);

  const fetchDocuments = async (recordId) => {
    setLoading(true);
    try {
      const data = await getOnboardingDocuments(recordId || undefined);
      setDocuments(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      setRecords(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    } catch {
      // non-critical
    }
  };

  const refresh = async () => {
    await fetchDocuments(recordFilter);
    insights.reload();
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    fetchDocuments(recordFilter);
  }, [recordFilter]);

  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter, recordFilter]);

  const showSuccess = (text) => {
    setError(null);
    setSuccess(text);
    setTimeout(() => setSuccess((s) => (s === text ? "" : s)), 5000);
  };
  const showError = (text) => {
    setSuccess("");
    setError(text);
  };

  const activeHires = records.filter((r) => !INACTIVE_HIRE_STATUSES.includes(r.status));

  const statusCounts = useMemo(() => STATUSES.reduce((acc, s) => {
    acc[s.value] = documents.filter((d) => statusOf(d) === s.value).length;
    return acc;
  }, {}), [documents]);

  const recordName = (id) => {
    if (!id) return "";
    const r = records.find((x) => x.id === id || x.id === Number(id));
    return r?.candidate_name || `New hire #${id}`;
  };
  const recordOf = (id) => records.find((x) => x.id === id || x.id === Number(id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => (!categoryFilter || d.category === categoryFilter)
      && (!statusFilter || statusOf(d) === statusFilter)
      && (!q || [d.title, categoryLabel(d.category), recordName(d.onboarding_new_hire_id)].some((v) => String(v || "").toLowerCase().includes(q))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, categoryFilter, statusFilter, search, records]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = documents.find((d) => d.id === selectedId) || null;

  const resetUploadForm = () => {
    setUploadForm({ ...INITIAL_UPLOAD_FORM });
    setFormErrors({});
    setFileInputKey((k) => k + 1);
  };

  // typing or choosing in a field clears that field's message
  const setUploadField = (key, value) => {
    setUploadForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };

  const validateUpload = () => {
    const errors = validateHrUpload(uploadForm);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const fetchFile = async (doc) => {
    setBusyId(doc.id);
    try {
      return await getOnboardingDocumentFile(doc.id);
    } catch (err) {
      showError(err.message || "The file could not be loaded.");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const handleView = async (doc) => {
    const res = await fetchFile(doc);
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      showError("The browser blocked the new tab. Use Download instead.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleDownload = async (doc) => {
    const res = await fetchFile(doc);
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename || doc.title;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openUpload = (prefillHire = "") => {
    resetUploadForm();
    if (prefillHire) setUploadForm({ ...INITIAL_UPLOAD_FORM, onboarding_record_id: String(prefillHire) });
    setShowUploadModal(true);
  };
  const closeUpload = () => { setShowUploadModal(false); resetUploadForm(); };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!validateUpload()) return;
    setSubmitting(true);
    const fillsRequest = uploadForm.onboarding_record_id
      && documents.some((d) => String(d.onboarding_new_hire_id) === String(uploadForm.onboarding_record_id)
        && d.category === uploadForm.category && ["requested", "rejected"].includes(d.status));
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title.trim().replace(/\s+/g, " "));
      fd.append("category", uploadForm.category);
      fd.append("file", uploadForm.file);
      if (uploadForm.onboarding_record_id) {
        fd.append("onboarding_record_id", uploadForm.onboarding_record_id);
      }
      await createOnboardingDocument(fd);
      setShowUploadModal(false);
      resetUploadForm();
      showSuccess(fillsRequest ? "Document uploaded. It fills the open request and is ready for review." : "Document uploaded.");
      await refresh();
    } catch (err) {
      const fields = serverUploadErrors(err?.validation ?? err?.detail);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || "The document could not be uploaded. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (doc) => {
    setBusyId(doc.id);
    try {
      await updateOnboardingDocument(doc.id, { status: "approved" });
      showSuccess(`"${doc.title}" approved.`);
      await refresh();
    } catch (err) {
      showError(err.message || "Failed to approve document");
    } finally {
      setBusyId(null);
    }
  };

  const openRejectModal = (doc) => {
    setRejectTarget(doc);
    setRejectionReason("");
    setRejectError("");
    setShowRejectModal(true);
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setRejectTarget(null);
    setRejectionReason("");
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) { setRejectError("Enter a reason, so the person knows what to fix."); return; }
    setSubmitting(true);
    try {
      await updateOnboardingDocument(rejectTarget.id, {
        status: "rejected",
        rejection_reason: rejectionReason.trim(),
      });
      const who = rejectTarget.onboarding_new_hire_id ? recordName(rejectTarget.onboarding_new_hire_id) : "";
      showSuccess(`"${rejectTarget.title}" rejected.${who ? ` ${who} was emailed to upload it again.` : ""}`);
      closeRejectModal();
      await refresh();
    } catch (err) {
      setRejectError(err.message || "Failed to reject document");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    setBusyId(doc.id);
    try {
      await deleteOnboardingDocument(doc.id);
      if (selectedId === doc.id) setSelectedId(null);
      showSuccess("Document deleted.");
      await refresh();
    } catch (err) {
      showError(err.message || "Failed to delete document");
    } finally {
      setBusyId(null);
    }
  };

  const openRequestModal = (prefillHire) => {
    const hire = prefillHire || recordFilter;
    setRequestHire(hire && activeHires.some((r) => String(r.id) === String(hire)) ? String(hire) : "");
    setRequestCategories([]);
    setRequestError("");
    setShowRequestModal(true);
  };

  const toggleRequestCategory = (value) => {
    setRequestError("");
    setRequestCategories((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!requestHire) { setRequestError("Choose a new hire."); return; }
    if (requestCategories.length === 0) { setRequestError("Choose at least one document."); return; }
    setRequesting(true);
    try {
      const created = await requestOnboardingDocuments(Number(requestHire), requestCategories);
      const n = Array.isArray(created) ? created.length : requestCategories.length;
      setShowRequestModal(false);
      showSuccess(`Requested ${n} document(s); ${recordName(Number(requestHire))} was emailed.`);
      await refresh();
    } catch (err) {
      setRequestError(err.message || "The documents could not be requested.");
    } finally {
      setRequesting(false);
    }
  };

  // ── KPIs: counted from the loaded documents; "Needs review" uses the insights trend when the whole list is loaded ──
  const k = insights.data?.kpis || {};
  const pendingKpi = !recordFilter && k.documents_pending ? { ...k.documents_pending, value: statusCounts.pending } : { value: statusCounts.pending };
  const kpiLoading = loading && documents.length === 0;

  const layout = (body) => (
    <OnboardingLayout title="Onboarding Documents" subtitle="Request, collect and review new hires' onboarding documents."
      actions={(
        <>
          <SecondaryButton icon={Send} onClick={() => openRequestModal()}>Request documents from a new hire</SecondaryButton>
          <PrimaryButton icon={Upload} onClick={() => openUpload()}>Upload Document</PrimaryButton>
        </>
      )}>
      {body}
    </OnboardingLayout>
  );

  if (loading && documents.length === 0 && !error) {
    return layout(
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading documents...</span>
      </div>
    );
  }

  const statusTabs = [
    { value: "", label: "All", count: documents.length },
    ...STATUSES.map((s) => ({ value: s.value, label: s.short, count: statusCounts[s.value] || 0 })),
  ];

  const rowActions = (doc) => {
    const status = statusOf(doc);
    const busy = busyId === doc.id;
    const stop = (fn) => (e) => { e.stopPropagation(); fn(doc); };
    const btn = "rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50";
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {doc.file_url && (
          <>
            <button type="button" onClick={stop(handleView)} disabled={busy} className={`${btn} text-blue-600 hover:bg-blue-50`}>View</button>
            <button type="button" onClick={stop(handleDownload)} disabled={busy} className={`${btn} text-blue-600 hover:bg-blue-50`}>Download</button>
          </>
        )}
        {status === "pending" && (
          <button type="button" onClick={stop(handleApprove)} disabled={busy} className={`${btn} text-emerald-700 hover:bg-emerald-50`}>Approve</button>
        )}
        {(status === "pending" || status === "approved") && (
          <button type="button" onClick={stop(openRejectModal)} disabled={busy} className={`${btn} text-rose-600 hover:bg-rose-50`}>Reject</button>
        )}
        <button type="button" onClick={stop(handleDelete)} disabled={busy} className={`${btn} text-gray-400 hover:bg-gray-100 hover:text-rose-600`}>Delete</button>
      </div>
    );
  };

  const detail = selected ? (() => {
    const status = statusOf(selected);
    const busy = busyId === selected.id;
    const hire = recordOf(selected.onboarding_new_hire_id);
    const hireName = selected.onboarding_new_hire_id ? recordName(selected.onboarding_new_hire_id) : "";
    const siblings = selected.onboarding_new_hire_id
      ? documents.filter((d) => d.id !== selected.id && String(d.onboarding_new_hire_id) === String(selected.onboarding_new_hire_id)) : [];
    return (
      <DetailPanel title="Document details" onClose={() => setSelectedId(null)}
        header={(
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><FileText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-gray-900">{selected.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <DocStatus status={status} />
                <StatusPill tone={CATEGORY_TONE[selected.category] || "gray"}>{categoryLabel(selected.category)}</StatusPill>
              </div>
            </div>
          </div>
        )}>
        <DetailSection title="Quick Actions">
          <div className="flex flex-wrap gap-2">
            <QuickAction icon={Eye} label="Open" disabled={!selected.file_url || busy} onClick={() => handleView(selected)} />
            <QuickAction icon={Download} label="Download" disabled={!selected.file_url || busy} onClick={() => handleDownload(selected)} />
            <QuickAction icon={ThumbsUp} label="Approve" tone="primary" disabled={status !== "pending" || busy} onClick={() => handleApprove(selected)} />
            <QuickAction icon={FileX2} label="Reject" tone="danger" disabled={!(status === "pending" || status === "approved") || busy} onClick={() => openRejectModal(selected)} />
          </div>
        </DetailSection>

        <DetailSection title="Preview">
          {selected.file_url ? <FilePreview key={selected.id} doc={selected} /> : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              Not uploaded yet{hireName ? ` — waiting for ${hireName}.` : "."}
            </div>
          )}
        </DetailSection>

        {status === "rejected" && selected.rejection_reason && (
          <DetailSection title="Rejection reason">
            <p className="break-words rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{selected.rejection_reason}</p>
          </DetailSection>
        )}

        <DetailSection title="Details">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">New hire</dt>
            <dd className="min-w-0">{hireName ? <PersonCell name={hireName} sub={[hire?.position, hire?.email].filter(Boolean).join(" · ") || undefined} /> : "—"}</dd>
            <dt className="text-gray-500">Category</dt><dd className="text-gray-800">{categoryLabel(selected.category)}</dd>
            <dt className="text-gray-500">Created</dt><dd className="text-gray-800">{shortDate(selected.created_at)}</dd>
            <dt className="text-gray-500">Last updated</dt>
            <dd className="text-gray-800">{selected.updated_at ? `${shortDate(selected.updated_at)} · ${relativeTime(selected.updated_at)}` : "—"}</dd>
          </dl>
        </DetailSection>

        {hireName && (
          <DetailSection title={`Other documents for ${hireName}`}
            action={activeHires.some((r) => String(r.id) === String(selected.onboarding_new_hire_id))
              ? <button type="button" onClick={() => openRequestModal(String(selected.onboarding_new_hire_id))} className="text-xs font-medium text-blue-600 hover:text-blue-800">Request more</button>
              : null}>
            {siblings.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
              <ul className="space-y-1.5">
                {siblings.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => setSelectedId(d.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50">
                      <span className="min-w-0 truncate text-gray-800">{d.title}</span>
                      <DocStatus status={statusOf(d)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4">
          <button type="button" onClick={() => handleDelete(selected)} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />Delete document
          </button>
        </div>
      </DetailPanel>
    );
  })() : null;

  return layout(
    <>
      <div className="space-y-6">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="flex min-w-0 items-start gap-2 break-words"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        {success && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span className="flex min-w-0 items-start gap-2 break-words"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</span>
            <button onClick={() => setSuccess("")} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold text-green-600 hover:text-green-800">&times;</button>
          </div>
        )}

        <KpiGrid cols={5}>
          <div data-testid="count-pending"><KpiCard label="Needs Review" icon={Inbox} tone="amber" kpi={pendingKpi} loading={kpiLoading} /></div>
          <div data-testid="count-requested"><KpiCard label="Awaiting Upload" icon={Hourglass} tone="blue" kpi={{ value: statusCounts.requested }} loading={kpiLoading} /></div>
          <div data-testid="count-approved"><KpiCard label="Approved" icon={FileCheck2} tone="green" kpi={{ value: statusCounts.approved }} loading={kpiLoading} /></div>
          <div data-testid="count-rejected"><KpiCard label="Rejected" icon={FileX2} tone="red" kpi={{ value: statusCounts.rejected }} loading={kpiLoading} /></div>
          <div data-testid="count-total"><KpiCard label="Total Documents" icon={Files} tone="violet" kpi={{ value: documents.length }} loading={kpiLoading} /></div>
        </KpiGrid>

        <WithDetail detail={detail}>
          <Card bodyClass="p-0">
            <div className="space-y-4 border-b border-gray-100 px-5 py-4">
              <ChipTabs label="Document status" tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} />
              <div className="flex flex-wrap items-end gap-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Search title, category or new hire…" label="Search documents" />
                <FilterSelect label="New hire" value={recordFilter} onChange={setRecordFilter} allLabel="All new hires"
                  options={records.map((r) => ({ value: String(r.id), label: r.candidate_name || `New hire #${r.id}` }))} />
                <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} allLabel="All categories" options={CATEGORIES} />
                <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} allLabel="All statuses"
                  options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
              </div>
            </div>

            {filtered.length === 0 && !loading ? (
              <EmptyState icon={FileUp} title={documents.length === 0 ? "No documents yet" : "No documents match the selected filters."}>
                {documents.length === 0 ? "Upload one or request documents from a new hire." : null}
              </EmptyState>
            ) : (
              <>
                <Table columns={[{ label: "Document" }, { label: "Category" }, { label: "New hire" }, { label: "Uploaded" }, { label: "Status" },
                  { label: "Actions", className: "text-right" }]}>
                  {pageRows.map((doc) => {
                    const status = statusOf(doc);
                    const hireName = recordName(doc.onboarding_new_hire_id);
                    const isSel = selectedId === doc.id;
                    return (
                      <tr key={doc.id} onClick={() => setSelectedId(doc.id)} className={`cursor-pointer transition-colors ${isSel ? "bg-blue-50/60" : "hover:bg-gray-50"}`}>
                        <td className={td}>
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500" aria-hidden="true"><FileText className="h-4 w-4" /></span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(doc.id); }} aria-pressed={isSel}
                              className="min-w-0 max-w-[16rem] break-words text-left font-medium text-gray-900 hover:text-blue-600">{doc.title}</button>
                          </div>
                        </td>
                        <td className={td}><StatusPill tone={CATEGORY_TONE[doc.category] || "gray"}>{categoryLabel(doc.category)}</StatusPill></td>
                        <td className={td}>
                          {hireName ? (
                            <div className="flex items-center gap-2"><Avatar name={hireName} size="sm" /><span className="truncate">{hireName}</span></div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          {doc.file_url ? (
                            <span title={doc.updated_at || doc.created_at || undefined}>{doc.updated_at || doc.created_at ? shortDate(doc.updated_at || doc.created_at) : "—"}</span>
                          ) : <span className="text-gray-400">Not uploaded</span>}
                        </td>
                        <td className={td}>
                          <DocStatus status={status} />
                          {status === "rejected" && doc.rejection_reason ? (
                            <p className="mt-1 max-w-[220px] break-words text-xs text-gray-500">{doc.rejection_reason}</p>
                          ) : null}
                        </td>
                        <td className={`${td} text-right`}>{rowActions(doc)}</td>
                      </tr>
                    );
                  })}
                </Table>
                <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
              </>
            )}
          </Card>
        </WithDetail>
      </div>

      {/* Upload */}
      {showUploadModal && (
        <SlideOver title="Upload Document" subtitle="Add a file for a new hire, or one that belongs to no one yet." icon={Upload} onClose={closeUpload}>
          <form noValidate onSubmit={handleUpload} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              {formErrors.submit && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-600">{formErrors.submit}</div>
              )}
              <div>
                <label htmlFor="od-title" className={labelCls}>Title <span className="text-rose-500">*</span></label>
                <input id="od-title" type="text" value={uploadForm.title} maxLength={200} aria-invalid={!!formErrors.title}
                  onChange={(e) => setUploadField("title", e.target.value)} className={fieldCls(formErrors.title)} />
                {formErrors.title && <p role="alert" className="mt-1 text-xs text-rose-600">{formErrors.title}</p>}
              </div>
              <div>
                <label htmlFor="od-category" className={labelCls}>Category <span className="text-rose-500">*</span></label>
                <select id="od-category" value={uploadForm.category} aria-invalid={!!formErrors.category}
                  onChange={(e) => setUploadField("category", e.target.value)} className={fieldCls(formErrors.category)}>
                  <option value="">Select category...</option>
                  {CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
                {formErrors.category && <p role="alert" className="mt-1 text-xs text-rose-600">{formErrors.category}</p>}
              </div>
              <div>
                <label htmlFor="od-record" className={labelCls}>New hire</label>
                <select id="od-record" value={uploadForm.onboarding_record_id}
                  onChange={(e) => setUploadField("onboarding_record_id", e.target.value)} className={fieldCls(false)}>
                  <option value="">None</option>
                  {records.map((r) => <option key={r.id} value={r.id}>{r.candidate_name || `New hire #${r.id}`}</option>)}
                </select>
                {formErrors.onboarding_record_id && <p role="alert" className="mt-1 text-xs text-rose-600">{formErrors.onboarding_record_id}</p>}
                <p className="mt-1 text-xs text-gray-500">If this new hire has an open request for the same category, the upload fills that request.</p>
              </div>
              <div>
                <label htmlFor="od-file" className={labelCls}>File <span className="text-rose-500">*</span></label>
                <input id="od-file" key={fileInputKey} type="file" accept={UPLOAD_EXTENSIONS.join(",")} aria-invalid={!!formErrors.file}
                  onChange={(e) => setUploadField("file", e.target.files?.[0] || null)} className={fieldCls(formErrors.file)} />
                {uploadForm.file && !formErrors.file ? <p className="mt-1 break-all text-xs text-gray-500">{uploadForm.file.name} ({fileSizeText(uploadForm.file.size)})</p> : null}
                {!uploadForm.file && !formErrors.file ? <p className="mt-1 text-xs text-gray-500">PDF, JPG, PNG, DOC or DOCX. Up to {MAX_FILE_MB} MB.</p> : null}
                {formErrors.file && <p role="alert" className="mt-1 text-xs text-rose-600">{formErrors.file}</p>}
              </div>
            </div>
            <SlideOverFooter>
              <SecondaryButton onClick={closeUpload}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={submitting}>{submitting ? "Uploading..." : "Upload"}</PrimaryButton>
            </SlideOverFooter>
          </form>
        </SlideOver>
      )}

      {/* Request documents */}
      {showRequestModal && (
        <SlideOver title="Request documents" subtitle="The new hire is emailed a link to upload these through their pre-onboarding page." icon={Send}
          onClose={() => setShowRequestModal(false)}>
          <form noValidate onSubmit={handleRequest} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              {requestError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-600">{requestError}</div>}
              <div>
                <label htmlFor="req-hire" className={labelCls}>New hire <span className="text-rose-500">*</span></label>
                <select id="req-hire" value={requestHire} onChange={(e) => { setRequestHire(e.target.value); setRequestError(""); }} className={fieldCls(false)}>
                  <option value="">Choose a new hire...</option>
                  {activeHires.map((r) => (
                    <option key={r.id} value={r.id}>{r.candidate_name || `New hire #${r.id}`}{r.email ? ` (${r.email})` : ""}</option>
                  ))}
                </select>
                {activeHires.length === 0 && <p className="mt-1 text-xs text-gray-500">There are no active new hires.</p>}
              </div>
              <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
                <legend className="px-1 text-sm font-medium text-gray-700">Documents to request <span className="text-rose-500">*</span></legend>
                <div className="space-y-1">
                  {CATEGORIES.map((cat) => (
                    <label key={cat.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-gray-700 hover:bg-gray-50">
                      <input type="checkbox" checked={requestCategories.includes(cat.value)} onChange={() => toggleRequestCategory(cat.value)} className="rounded border-gray-300" />
                      {cat.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <SlideOverFooter>
              <SecondaryButton onClick={() => setShowRequestModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={requesting}>{requesting ? "Sending..." : "Send request"}</PrimaryButton>
            </SlideOverFooter>
          </form>
        </SlideOver>
      )}

      {/* Reject with a reason */}
      {showRejectModal && rejectTarget && (
        <SlideOver title="Reject Document" icon={FileX2} onClose={closeRejectModal}
          subtitle={`${rejectTarget.title}${rejectTarget.onboarding_new_hire_id ? ` (${recordName(rejectTarget.onboarding_new_hire_id)})` : ""}`}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            <p className="break-words text-sm text-gray-600">
              Rejecting: <span className="font-medium text-gray-800">{rejectTarget.title}</span>
              {rejectTarget.onboarding_new_hire_id ? ` (${recordName(rejectTarget.onboarding_new_hire_id)})` : ""}
            </p>
            <div>
              <label htmlFor="od-reject-reason" className={labelCls}>Rejection Reason <span className="text-rose-500">*</span></label>
              <textarea id="od-reject-reason" rows={4} value={rejectionReason} maxLength={1000}
                onChange={(e) => { setRejectionReason(e.target.value); setRejectError(""); }}
                placeholder="Provide a reason for rejection..." className={fieldCls(rejectError)} />
              {rejectError ? <p role="alert" className="mt-1 text-xs text-rose-600">{rejectError}</p> : null}
              {rejectTarget.onboarding_new_hire_id ? (
                <p className="mt-1 text-xs text-gray-500">The new hire is emailed this reason and asked to upload the document again.</p>
              ) : null}
            </div>
          </div>
          <SlideOverFooter>
            <SecondaryButton onClick={closeRejectModal}>Cancel</SecondaryButton>
            <button type="button" onClick={handleReject} disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">
              Reject
            </button>
          </SlideOverFooter>
        </SlideOver>
      )}
    </>
  );
}
