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
import OfferPackagePanel from "./OfferPackagePanel";
import { MAX_FILE_MB, validateUploadForm, serverUploadErrors, fileSizeText, extensionOf } from "../../../utils/onboardingDocForm";

// The 10 offer-package documents are generated and issued from the Offer package panel, never requested as uploads.
export const PACKAGE_CATEGORIES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "job_description", label: "Job Description" },
  { value: "daily_kpi", label: "Daily Key Performance Indicators" },
  { value: "nda", label: "Non-Disclosure Agreement" },
  { value: "employment_contract", label: "Employment Contract" },
  { value: "exclusivity_affidavit", label: "Affidavit of Employment Exclusivity" },
  { value: "self_disclosure", label: "Voluntary Self-Disclosure Form" },
  { value: "job_application", label: "Job Application Form" },
  { value: "daily_work_report", label: "Daily Work Report (DWR)" },
  { value: "velocity_report", label: "Project Velocity Report" },
];

export const UPLOAD_CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

export const CATEGORIES = [...PACKAGE_CATEGORIES, ...UPLOAD_CATEGORIES];

export const STATUSES = [
  { value: "requested", label: "Requested (waiting for new hire)", short: "Requested", cls: "bg-blue-100 text-blue-800", tone: "blue" },
  { value: "pending", label: "Needs review", short: "Needs review", cls: "bg-yellow-100 text-yellow-800", tone: "amber" },
  { value: "approved", label: "Approved", short: "Approved", cls: "bg-green-100 text-green-800", tone: "green" },
  { value: "rejected", label: "Rejected", short: "Rejected", cls: "bg-red-100 text-red-800", tone: "red" },
  { value: "available", label: "Sent – no action needed", short: "Sent", cls: "bg-slate-100 text-slate-700", tone: "gray" },
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
  offer_letter: "violet",
  job_description: "sky",
  daily_kpi: "indigo",
  nda: "amber",
  employment_contract: "purple",
  exclusivity_affidavit: "rose",
  self_disclosure: "orange",
  job_application: "cyan",
  daily_work_report: "emerald",
  velocity_report: "blue",
  id_proof: "blue",
  education_certificates: "teal",
  experience_letters: "teal",
  bank_details: "green",
  other: "gray",
};

const INACTIVE_HIRE_STATUSES = ["completed", "cancelled"];
const INITIAL_UPLOAD_FORM = { title: "", category: "", file: null, onboarding_record_id: "" };
const STATUS_ICON = { requested: Hourglass, pending: Inbox, approved: CheckCircle2, rejected: FileX2, available: FileCheck2 };

const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const fieldCls = (bad) => `w-full rounded-xl border ${bad ? "border-rose-300" : "border-gray-200"} bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

const statusOf = (doc) => doc.status || "pending";
// Signed, acknowledged, voluntary and information package documents are completed by the new hire, never reviewed by HR.
const reviewable = (doc) => !["SIGN", "ACKNOWLEDGE", "INFO", "VOLUNTARY"].includes(doc?.package_mode);
const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || value || "—";

function DocStatus({ status, doc }) {
  if (doc?.requires_signature) {
    if (status === "approved" || doc.signing_status === "EXECUTED") {
      return <StatusPill tone="green" icon={CheckCircle2}>E-Signed</StatusPill>;
    }
    if (doc.signing_status === "DECLINED") return <StatusPill tone="red" icon={FileX2}>Declined</StatusPill>;
    if (status === "requested") {
      return <StatusPill tone="blue" icon={Hourglass}>Awaiting signature</StatusPill>;
    }
  }
  if (doc?.package_mode === "ACKNOWLEDGE") {
    if (status === "approved") return <StatusPill tone="green" icon={CheckCircle2}>Acknowledged</StatusPill>;
    if (status === "requested") return <StatusPill tone="blue" icon={Hourglass}>Awaiting acknowledgement</StatusPill>;
  }
  if (doc?.package_mode === "VOLUNTARY" && status === "available") {
    return <StatusPill tone="gray" icon={FileCheck2}>Sent – voluntary</StatusPill>;
  }
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
  const [openHire, setOpenHire] = useState(null);          // new hire id, or "none" for documents not linked to anyone
  const [previewId, setPreviewId] = useState(null);

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
  const [busyHireId, setBusyHireId] = useState(null);

  const [showPackageModal, setShowPackageModal] = useState(false);
  const [packageHireId, setPackageHireId] = useState("");

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

  // every "Offer package" entry point opens the package panel, which shows readiness before anything is sent
  const handleSendPackage = (hireId) => openSendPackageModal(hireId);

  const openSendPackageModal = (prefillHire = "") => {
    const hire = prefillHire || recordFilter;
    setPackageHireId(hire && activeHires.some((r) => String(r.id) === String(hire)) ? String(hire) : (activeHires[0]?.id ? String(activeHires[0].id) : ""));
    setShowPackageModal(true);
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
          <PrimaryButton icon={Send} onClick={() => openSendPackageModal()}>Send 10 Onboarding Docs</PrimaryButton>
          <SecondaryButton icon={Send} onClick={() => openRequestModal()}>Request documents from a new hire</SecondaryButton>
          <SecondaryButton icon={Upload} onClick={() => openUpload()}>Upload Document</SecondaryButton>
        </>
      )}>
      {body}
    </OnboardingLayout>
  );

  // only the very first load replaces the page; a refresh while a panel is open must not unmount it
  if (loading && documents.length === 0 && !error && !showPackageModal && !showUploadModal && !showRequestModal) {
    return layout(
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading documents...</span>
      </div>
    );
  }

  // ── one row per employee ────────────────────────────────────────────────────────────────────────────────────────
  const docsOf = (hireKey) => documents.filter((d) => (hireKey === "none" ? !d.onboarding_new_hire_id
    : String(d.onboarding_new_hire_id) === String(hireKey)));
  const summaryOf = (docs) => {
    const pkgCats = new Set(PACKAGE_CATEGORIES.map((c) => c.value));
    return {
      packageSent: new Set(docs.filter((d) => pkgCats.has(d.category)).map((d) => d.category)).size,
      toSign: docs.filter((d) => d.requires_signature && d.status === "requested").length,
      toAck: docs.filter((d) => d.package_mode === "ACKNOWLEDGE" && d.status === "requested").length,
      toUpload: docs.filter((d) => !d.requires_signature && d.package_mode !== "ACKNOWLEDGE" && ["requested", "rejected"].includes(d.status)).length,
      review: docs.filter((d) => d.status === "pending").length,
      done: docs.filter((d) => ["approved", "available"].includes(d.status)).length,
      total: docs.length,
      last: docs.map((d) => d.updated_at || d.created_at).filter(Boolean).sort().at(-1),
    };
  };
  // (a plain computation, not a hook: this runs after the page's early "loading" return)
  const employees = (() => {
    const ids = new Set(documents.map((d) => (d.onboarding_new_hire_id ? String(d.onboarding_new_hire_id) : "none")));
    activeHires.forEach((r) => ids.add(String(r.id)));          // active hires appear even before anything is sent
    return [...ids].map((key) => {
      const rec = key === "none" ? null : recordOf(key);
      return { key, rec, name: key === "none" ? "Not linked to a new hire" : (rec?.candidate_name || `New hire #${key}`) };
    }).sort((a, b) => (a.key === "none") - (b.key === "none") || a.name.localeCompare(b.name));
  })();
  const visibleEmployees = employees.filter((e) => {
    const docs = docsOf(e.key);
    const q = search.trim().toLowerCase();
    if (q && ![e.name, e.rec?.email, e.rec?.position, ...docs.map((d) => d.title)].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (statusFilter && !docs.some((d) => statusOf(d) === statusFilter)) return false;
    if (categoryFilter && !docs.some((d) => d.category === categoryFilter)) return false;
    if (recordFilter && e.key !== String(recordFilter)) return false;
    return true;
  });
  const employeeRows = visibleEmployees.slice((page - 1) * pageSize, page * pageSize);

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
        {reviewable(doc) && status === "pending" && (
          <button type="button" onClick={stop(handleApprove)} disabled={busy} className={`${btn} text-emerald-700 hover:bg-emerald-50`}>Approve</button>
        )}
        {reviewable(doc) && (status === "pending" || status === "approved") && (
          <button type="button" onClick={stop(openRejectModal)} disabled={busy} className={`${btn} text-rose-600 hover:bg-rose-50`}>Reject</button>
        )}
        <button type="button" onClick={stop(handleDelete)} disabled={busy} className={`${btn} text-gray-400 hover:bg-gray-100 hover:text-rose-600`}>Delete</button>
      </div>
    );
  };

  const summaryPills = (sum) => (
    <div className="flex flex-wrap gap-1.5">
      {sum.review > 0 && <StatusPill tone="amber" icon={Inbox}>{sum.review} to review</StatusPill>}
      {sum.toSign > 0 && <StatusPill tone="blue" icon={Hourglass}>{sum.toSign} to sign</StatusPill>}
      {sum.toAck > 0 && <StatusPill tone="blue" icon={Hourglass}>{sum.toAck} to acknowledge</StatusPill>}
      {sum.toUpload > 0 && <StatusPill tone="violet" icon={FileUp}>{sum.toUpload} to upload</StatusPill>}
      {sum.done > 0 && <StatusPill tone="green" icon={CheckCircle2}>{sum.done} done</StatusPill>}
      {sum.total === 0 && <span className="text-xs text-gray-400">No documents yet</span>}
    </div>
  );

  const docRow = (doc, category, key) => {
    if (!doc) {
      return (
        <li key={key} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm text-gray-500"><FileText className="h-4 w-4 shrink-0 text-gray-300" />{categoryLabel(category)}</span>
          <span className="text-xs text-gray-400">Not sent yet</span>
        </li>
      );
    }
    const open = previewId === doc.id;
    return (
      <li key={key} data-testid="doc-row" className={`rounded-xl border bg-white transition ${open ? "border-blue-200 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}>
        <div role="button" tabIndex={0} onClick={() => setPreviewId(open ? null : doc.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewId(open ? null : doc.id); } }}
          aria-expanded={open} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600" aria-hidden="true"><FileText className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-gray-900">{doc.title}</p>
              <p className="text-xs text-gray-500">
                {[categoryLabel(doc.category) !== doc.title ? categoryLabel(doc.category) : null,
                  doc.updated_at || doc.created_at ? shortDate(doc.updated_at || doc.created_at) : null].filter(Boolean).join(" · ")}
                {!doc.file_url && !doc.requires_signature ? " · Not uploaded" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DocStatus status={statusOf(doc)} doc={doc} />
            {rowActions(doc)}
          </div>
        </div>
        {statusOf(doc) === "rejected" && doc.rejection_reason && (
          <p className="mx-3 mb-2 break-words rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">Rejected: {doc.rejection_reason}</p>
        )}
        {open && (
          <div className="border-t border-gray-100 px-3 py-3">
            {doc.file_url ? <FilePreview doc={doc} /> : (
              <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </li>
    );
  };

  const employeePanel = openHire ? (() => {
    const isNone = openHire === "none";
    const rec = isNone ? null : recordOf(openHire);
    const docs = docsOf(openHire);
    const sum = summaryOf(docs);
    const pkgDocs = Object.fromEntries(docs.filter((d) => PACKAGE_CATEGORIES.some((c) => c.value === d.category)).map((d) => [d.category, d]));
    const others = docs.filter((d) => !PACKAGE_CATEGORIES.some((c) => c.value === d.category));
    const active = rec && activeHires.some((r) => String(r.id) === String(rec.id));
    return (
      <SlideOver title={isNone ? "Documents not linked to a new hire" : (rec?.candidate_name || "New hire")}
        subtitle={isNone ? "Uploaded without choosing a new hire." : [rec?.position, rec?.email].filter(Boolean).join(" · ")}
        icon={Files} width="sm:max-w-[820px]" onClose={() => { setOpenHire(null); setPreviewId(null); }}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {!isNone && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              {summaryPills(sum)}
              {active && (
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton icon={Send} onClick={() => openRequestModal(String(rec.id))}>Request documents</SecondaryButton>
                  <PrimaryButton icon={Send} onClick={() => openSendPackageModal(String(rec.id))}>Send 10 Onboarding Docs</PrimaryButton>
                </div>
              )}
            </div>
          )}
          {!isNone && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Onboarding package <span className="font-normal text-gray-500">({sum.packageSent} of 10 sent)</span></h3>
              <ol className="space-y-2">
                {PACKAGE_CATEGORIES.map((c) => docRow(pkgDocs[c.value], c.value, c.value))}
              </ol>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">{isNone ? "Documents" : "Other documents"} <span className="font-normal text-gray-500">({others.length})</span></h3>
            {others.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">None.</p> : (
              <ul className="space-y-2">{others.map((d) => docRow(d, d.category, d.id))}</ul>
            )}
          </section>
        </div>
      </SlideOver>
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

        <Card bodyClass="p-0">
          <div className="space-y-4 border-b border-gray-100 px-5 py-4">
            <ChipTabs label="Document status" tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} />
            <div className="flex flex-wrap items-end gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search employee or document…" label="Search employees" />
              <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} allLabel="All categories" options={CATEGORIES} />
              <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} allLabel="All statuses"
                options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            </div>
          </div>

          {visibleEmployees.length === 0 && !loading ? (
            <EmptyState icon={FileUp} title={employees.length === 0 ? "No new hires yet" : "No employees match the selected filters."}>
              {employees.length === 0 ? "Add a new hire, then send them the 10 onboarding documents." : null}
            </EmptyState>
          ) : (
            <>
              <Table columns={[{ label: "Employee" }, { label: "Onboarding package" }, { label: "Where things stand" }, { label: "Last update" },
                { label: "", className: "text-right" }]}>
                {employeeRows.map((e) => {
                  const docs = docsOf(e.key);
                  const sum = summaryOf(docs);
                  return (
                    <tr key={e.key} data-testid="employee-row" onClick={() => { setOpenHire(e.key); setPreviewId(null); }}
                      className="cursor-pointer transition-colors hover:bg-gray-50">
                      <td className={td}>
                        {e.key === "none" ? <span className="font-medium text-gray-700">{e.name}</span>
                          : <PersonCell name={e.name} sub={[e.rec?.position, e.rec?.email].filter(Boolean).join(" · ") || undefined} />}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {e.key === "none" ? <span className="text-gray-400">—</span> : (
                          <div className="w-32">
                            <p className="text-xs font-medium text-gray-700">{sum.packageSent} of 10 sent</p>
                            <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                              <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${sum.packageSent * 10}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className={td}>{summaryPills(sum)}</td>
                      <td className={`${td} whitespace-nowrap text-gray-500`}>{sum.last ? relativeTime(sum.last) : "—"}</td>
                      <td className={`${td} text-right`}>
                        <button type="button" onClick={(ev) => { ev.stopPropagation(); setOpenHire(e.key); setPreviewId(null); }}
                          aria-label={`View documents of ${e.name}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                          <Eye className="h-3.5 w-3.5" />View documents
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
              <Pagination page={page} pageSize={pageSize} total={visibleEmployees.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </Card>
        {employeePanel}
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
                  {UPLOAD_CATEGORIES.map((cat) => (
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

      {/* Offer package: readiness, missing data, previews and sending */}
      {showPackageModal && (
        <SlideOver
          title="Send 10 Onboarding Docs"
          subtitle="Offer letter, job description, KPIs, NDA, contract, affidavit, self-disclosure, application, DWR and velocity report. Only documents that are ready are sent."
          icon={Send}
          width="sm:max-w-[640px]"
          onClose={() => setShowPackageModal(false)}
        >
          <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
            <label htmlFor="pkg-hire" className={labelCls}>New hire</label>
            <select id="pkg-hire" value={packageHireId} onChange={(e) => setPackageHireId(e.target.value)} className={fieldCls(false)}>
              <option value="">Choose a new hire...</option>
              {activeHires.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.candidate_name || `New hire #${r.id}`}{r.position ? ` — ${r.position}` : ""}{r.email ? ` (${r.email})` : ""}
                </option>
              ))}
            </select>
            {activeHires.length === 0 && <p className="mt-1 text-xs text-gray-500">There are no active new hires.</p>}
          </div>
          {packageHireId ? (
            <OfferPackagePanel
              key={packageHireId}
              hireId={Number(packageHireId)}
              footer={SlideOverFooter}
              onError={showError}
              onSent={async (res) => { if (res?.issued?.length) { showSuccess(res.message); await refresh(); } }}
            />
          ) : (
            <div className="flex-1 px-6 py-10 text-center text-sm text-gray-500">Choose a new hire to see their package.</div>
          )}
        </SlideOver>
      )}
    </>
  );
}
