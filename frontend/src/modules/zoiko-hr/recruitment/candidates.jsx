import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Users, Plus, Search, AlertCircle, Mail, Phone, MapPin, Calendar, Briefcase, ExternalLink, ArrowLeft, ChevronLeft, ChevronRight, Edit2, Trash2, Clock, User, UserPlus, X, Upload, CloudUpload, Sparkles, FileText, Loader2, CheckCircle2, Settings } from "lucide-react";
import { Avatar, Card, KpiCard, KpiGrid, PersonCell, PrimaryButton, RecruitmentLayout, SecondaryButton, StatusPill, th, useInsights } from "./ui";
import { getCandidates, getCandidateById, createCandidate, updateCandidate, deleteCandidate, updateCandidateStatus, getRequisitions, parseCV } from "../../../service/hrService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { validateCandidateForm, serverFieldErrors, candidatePayload } from "../../../utils/candidateForm";
import { PHONE_MAX_LENGTH } from "../../../utils/phone";
import { experienceText, sourceLabel, shown, candidateCsv, candidateTimeline } from "../../../utils/candidateDisplay";
import { bulkRejectCandidates, getCandidateDocumentsStatus, sendCandidatePrivacyNotice } from "../../../service/recruitmentDocumentsService";
import RecruitmentPrivacySettings from "./PrivacySettings";

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return formatDateUtil(dateStr); }
  catch { return dateStr; }
}

function daysAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Today";
    if (diff === 1) return "1d ago";
    return `${diff}d ago`;
  } catch { return ""; }
}

function StatusBadge({ status }) {
  const m = { applied: "bg-blue-100 text-blue-800", new: "bg-blue-100 text-blue-800", screening: "bg-blue-100 text-blue-800", interview: "bg-blue-100 text-blue-800", interviewed: "bg-blue-100 text-blue-800", offer: "bg-blue-100 text-blue-800", offered: "bg-blue-100 text-blue-800", hired: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

const PAGE_SIZE = 10;

// Mirrors the server's CANDIDATE_TRANSITIONS: hired is final, a rejected candidate can only be reopened as applied.
const NEXT_STAGES = {
  applied: ["screening", "interview", "offer", "rejected"],
  screening: ["applied", "interview", "offer", "rejected"],
  interview: ["screening", "offer", "rejected"],
  offer: ["interview", "hired", "rejected"],
  hired: [],
  rejected: ["applied"],
};
const STAGE_LABEL = { applied: "Applied", screening: "Screening", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected" };
// Moving to these stages emails the candidate.
const EMAILED_STAGES = { screening: "The candidate is emailed that their application is under review.", rejected: "The candidate is emailed that they were not selected." };

// stage pill look and the label HR knows the stage by
const STAGE_TONE = { applied: "blue", screening: "violet", interview: "amber", offer: "teal", hired: "green", rejected: "red" };

// ── Add / Edit candidate form ───────────────────────────────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: "", email: "", phone: "", position: "", status: "applied", source: "referral", location: "", experience: "", resume_link: "", notes: "", requisition_id: "" };
// the order fields appear in the panel: the first one with a problem gets the focus
const FIELD_ORDER = ["name", "email", "phone", "requisition_id", "position", "status", "source", "location", "experience", "resume_link", "notes"];
const FIELD_IDS = { name: "cand-name", email: "cand-email", phone: "cand-phone", requisition_id: "cand-req", position: "cand-position", status: "cand-status", source: "cand-source", location: "cand-location", experience: "cand-exp", resume_link: "cand-resume", notes: "cand-notes" };
const CV_ACCEPT_RE = /\.(pdf|docx?|txt)$/i;
const SOURCE_OPTIONS = [
  { value: "referral", label: "Referral" }, { value: "linkedin", label: "LinkedIn" }, { value: "indeed", label: "Indeed" },
  { value: "company_website", label: "Company Website" }, { value: "recruiter", label: "Recruiter" }, { value: "other", label: "Other" },
];

const inputCls = (error) => `block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20" : "border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-blue-500/20"}`;

function Spinner({ className = "" }) {
  return <Loader2 aria-hidden="true" className={`${className} animate-spin`} />;
}

function CvBadge() {
  return <StatusPill tone="teal" icon={Sparkles}>From CV</StatusPill>;
}

function FormSection({ icon: Icon, title, helper, children }) {
  const headingId = `cand-sec-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0A1128]/5 text-[#111A33]"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-gray-900">{title}</h3>
          {helper ? <p className="mt-0.5 text-xs text-gray-500">{helper}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Label, control, then the field's message (or its helper text). */
function Field({ id, label, required, hint, error, badge, extra, hideLabel, children }) {
  return (
    <div className="min-w-0">
      <div className={hideLabel ? "sr-only" : "mb-1.5 flex min-h-[22px] items-center justify-between gap-2"}>
        <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}{required ? <span className="text-red-500" aria-hidden="true"> *</span> : null}</label>
        {badge}
      </div>
      {children}
      {error
        ? <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-medium text-rose-600"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /><span>{error}</span></p>
        : hint ? <p id={`${id}-hint`} className={`mt-1.5 text-xs text-gray-500 ${hideLabel ? "text-right" : ""}`}>{hint}</p> : null}
      {extra}
    </div>
  );
}

export default function Candidates() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [candidates, setCandidates] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);          // the page could not load: replaces the page
  const [notice, setNotice] = useState("");           // an action failed (delete, status): a banner, the page stays
  const [errors, setErrors] = useState({});           // field-level messages inside the Add / Edit dialog
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [requisitionFilter, setRequisitionFilter] = useState(searchParams.get("requisition_id") || "");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [cvParsing, setCvParsing] = useState(false);
  const [cvError, setCvError] = useState("");
  const [cvFileName, setCvFileName] = useState("");   // the CV last read into the open form
  const [cvFilled, setCvFilled] = useState({});       // { field: true } for values that came from that CV
  const [dragOver, setDragOver] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const initialFormRef = useRef("");
  const [privacyStatus, setPrivacyStatus] = useState(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [rowPrivacy, setRowPrivacy] = useState({});
  const [rowPrivacyBusy, setRowPrivacyBusy] = useState({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const candInsights = useInsights("candidates");
  const candKpis = candInsights.data?.kpis || {};

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    if (id) {
      // the privacy-notice status is secondary: the profile shows without waiting for it
      getCandidateDocumentsStatus(id).then(setPrivacyStatus, () => setPrivacyStatus(null));
      Promise.all([
        getCandidateById(id),
        getRequisitions({ per_page: 100 }).catch(() => ({ items: [] })),
      ]).then(([d, reqs]) => {
        if (!d) { setError("Candidate not found"); return; }
        setCandidate(d);
        setRequisitions(Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || []);
      }).catch((err) => {
        console.error("Candidate load error:", err);
        setError("Failed to load candidate.");
      }).finally(() => setLoading(false));
    } else {
      Promise.all([
        getCandidates({ per_page: 100 }),
        getRequisitions({ per_page: 100 }).catch(() => ({ items: [] })),
      ]).then(([d, reqs]) => {
        setCandidates(Array.isArray(d) ? d : d?.items || d?.data || []);
        setRequisitions(Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || []);
      }).catch((err) => {
        console.error("Candidates load error:", err);
        setError("Failed to load candidates.");
      }).finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // the stage counts follow every change to the list (add, edit, delete, status change, bulk rejection)
  const listSignature = candidates.map((c) => `${c.id}:${c.status}`).join(",");
  const reloadCandInsights = candInsights.reload;
  const firstSignature = useRef(true);
  useEffect(() => {
    if (firstSignature.current) { firstSignature.current = false; return; }
    reloadCandInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSignature]);

  const filtered = candidates.filter((c) => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.email?.toLowerCase().includes(search.toLowerCase()) && !c.position?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (requisitionFilter && String(c.requisition_id) !== String(requisitionFilter)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const eligiblePageIds = paged.filter((c) => c.status !== "hired" && c.status !== "rejected").map((c) => c.id);
  const pageFullySelected = eligiblePageIds.length > 0 && eligiblePageIds.every((candId) => selectedCandidateIds.includes(candId));

  const sources = [...new Set(candidates.map((c) => c.source).filter(Boolean))];

  // ── Add / Edit candidate panel ───────────────────────────────────────────────────────────────────────────────────
  const openPanel = (item, values, filled = {}) => {
    returnFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    setEditItem(item);
    setForm(values);
    initialFormRef.current = JSON.stringify(item ? values : EMPTY_FORM);
    setCvFilled(filled);
    setErrors({}); setSaveError(""); setShowModal(true);
  };

  const openCreate = () => {
    setCvError(""); setCvFileName("");
    openPanel(null, { ...EMPTY_FORM });
  };

  const openEdit = (c) => {
    setCvError(""); setCvFileName("");
    openPanel(c, { name: c.name || "", email: c.email || "", phone: c.phone || "", position: c.position || "", status: c.status || "applied", source: c.source || "referral", location: c.location || "", experience: c.experience ?? "", resume_link: c.resume_link || "", notes: c.notes || "", requisition_id: c.requisition_id ? String(c.requisition_id) : "" });
  };

  const closePanel = () => {
    setShowModal(false);
    setDragOver(false);
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    if (back && typeof back.focus === "function" && document.contains(back)) setTimeout(() => back.focus(), 0);
  };

  const formDirty = showModal && JSON.stringify(form) !== initialFormRef.current;
  const requestClose = () => {
    if (saving) return;
    if (formDirty && !window.confirm("Discard the details you entered for this candidate?")) return;
    closePanel();
  };

  // Only the values the parser actually read are used, and only those get the "From CV" badge.
  const fillFromParsed = (base, parsed, fileName) => {
    const next = { ...base };
    const filled = {};
    for (const key of ["name", "email", "phone", "position", "location"]) {
      const v = parsed?.[key];
      if (v != null && String(v).trim() !== "") { next[key] = String(v).trim(); filled[key] = true; }
    }
    if (parsed?.experience != null && String(parsed.experience).trim() !== "") {
      next.experience = String(parsed.experience); filled.experience = true;
    }
    if (parsed?.resume_text && !String(next.notes || "").trim()) next.notes = `Imported from CV: ${fileName}`;
    return { next, filled };
  };

  const cvFileInputRef = useRef(null);
  const panelCvInputRef = useRef(null);
  // fresh: the page's "Import CV" button (starts a new candidate); otherwise the drop zone inside the open panel.
  const importCV = async (file, { fresh }) => {
    if (!file) return;
    if (!CV_ACCEPT_RE.test(file.name || "")) {
      setCvError("Upload a PDF, Word (.doc, .docx) or plain-text CV.");
      return;
    }
    setCvParsing(true);
    setCvError("");
    setCvFileName(file.name);
    try {
      const parsed = await parseCV(file);
      if (fresh) {
        const { next, filled } = fillFromParsed(EMPTY_FORM, parsed, file.name);
        openPanel(null, next, filled);
      } else {
        const { next, filled } = fillFromParsed(form, parsed, file.name);
        setForm(next);
        setCvFilled(filled);
        setErrors((prev) => {
          const out = { ...prev };
          for (const key of Object.keys(filled)) delete out[key];
          return out;
        });
      }
    } catch (err) {
      console.error("CV parse error:", err);
      setCvError(err?.response?.data?.detail || err.message || "Failed to parse CV. Please fill details manually.");
    } finally {
      setCvParsing(false);
      if (cvFileInputRef.current) cvFileInputRef.current.value = "";
      if (panelCvInputRef.current) panelCvInputRef.current.value = "";
    }
  };
  const handleImportCV = (e) => importCV(e.target.files?.[0], { fresh: true });

  // typing in a field clears that field's message (and its "From CV" badge: the value is now the person's own)
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setCvFilled((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  };

  const focusFirstInvalid = (found) => {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    setTimeout(() => {
      const el = document.getElementById(FIELD_IDS[first]);
      if (el && typeof el.focus === "function") el.focus();
    }, 0);
  };

  const handleRequisitionSelect = (reqId) => {
    const req = requisitions.find((r) => String(r.id) === String(reqId));
    setForm((prev) => ({ ...prev, requisition_id: reqId, position: prev.position || req?.title || prev.position }));
    setErrors((prev) => ({ ...prev, requisition_id: undefined, position: undefined }));
  };

  const handleSave = async () => {
    if (saving) return;
    const found = validateCandidateForm(form);
    setErrors(found);
    setSaveError("");
    if (Object.keys(found).length) { focusFirstInvalid(found); return; }
    setSaving(true);
    try {
      const payload = candidatePayload(form);
      if (editItem) {
        await updateCandidate(editItem.id, payload);
      } else {
        await createCandidate(payload);
      }
      closePanel();
      setNotice("");
      load();
    } catch (err) {
      // the server's refusal is shown next to the field it is about; anything else stays in the dialog
      const fields = serverFieldErrors(err?.validation);
      if (Object.keys(fields).length) { setErrors(fields); focusFirstInvalid(fields); }
      else setSaveError(err?.message || "The candidate could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // open panel: lock the page scroll, slide in, focus the first field
  useEffect(() => {
    if (!showModal) { setPanelEntered(false); return undefined; }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      setPanelEntered(true);
      const el = document.getElementById("cand-name");
      if (el && !panelRef.current?.contains(document.activeElement)) el.focus();
    }, 10);
    return () => { clearTimeout(t); document.body.style.overflow = prevOverflow; };
  }, [showModal]);

  const onPanelKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); requestClose(); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); return; }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const emailKey = String(form.email || "").trim().toLowerCase();
  const duplicateCandidate = showModal && emailKey
    ? candidates.find((c) => String(c.email || "").trim().toLowerCase() === emailKey && (!editItem || c.id !== editItem.id))
    : null;
  const duplicateMeta = duplicateCandidate
    ? [duplicateCandidate.position, STAGE_LABEL[duplicateCandidate.status] || duplicateCandidate.status].filter(Boolean).join(", ")
    : "";
  const selectedRequisition = form.requisition_id ? requisitions.find((r) => String(r.id) === String(form.requisition_id)) : null;
  const cvFilledCount = Object.values(cvFilled).filter(Boolean).length;
  const handleDelete = async (candId) => {
    if (!window.confirm("Delete this candidate?")) return;
    try {
      await deleteCandidate(candId);
      if (id) navigate("/zoiko-hr/recruitment/candidates");
      else load();
    } catch (err) {
      console.error("Delete candidate error:", err);
      setNotice(err.message || "Failed to delete candidate.");
    }
  };

  const handleStatusUpdate = async (candId, status) => {
    const warn = status === "hired"
      ? "Mark this candidate hired? This is final and starts onboarding. (Accepting their offer does this automatically.)"
      : EMAILED_STAGES[status] ? `${EMAILED_STAGES[status]} Continue?` : null;
    if (warn && !window.confirm(warn)) return;
    try {
      await updateCandidateStatus(candId, { status });
      setNotice("");
      load();
    } catch (err) {
      console.error("Status update error:", err);
      setNotice(err.message || "Failed to update status.");
    }
  };

  const loadPrivacyStatus = async (candId) => {
    setRowPrivacyBusy((prev) => ({ ...prev, [candId]: true }));
    try {
      const result = await getCandidateDocumentsStatus(candId);
      setRowPrivacy((prev) => ({ ...prev, [candId]: result }));
    } catch (err) {
      setNotice(err?.message || "Candidate privacy status could not be loaded.");
    } finally {
      setRowPrivacyBusy((prev) => ({ ...prev, [candId]: false }));
    }
  };

  const resendPrivacyNotice = async (candId) => {
    setPrivacyBusy(true);
    setNotice("");
    try {
      await sendCandidatePrivacyNotice(candId);
      const updated = await getCandidateDocumentsStatus(candId);
      setPrivacyStatus(updated);
      setRowPrivacy((prev) => ({ ...prev, [candId]: updated }));
      setNotice("Privacy notice issued to the candidate.");
    } catch (err) {
      setNotice(err?.message || "Privacy notice could not be issued.");
    } finally {
      setPrivacyBusy(false);
    }
  };

  const toggleSelected = (candId) => setSelectedCandidateIds((prev) =>
    prev.includes(candId) ? prev.filter((idValue) => idValue !== candId) : [...prev, candId]);

  const previewBulkRejection = async () => {
    if (!selectedCandidateIds.length) return;
    setBulkBusy(true);
    setNotice("");
    try {
      const notes = bulkNotes.trim()
        ? Object.fromEntries(selectedCandidateIds.map((candId) => [String(candId), bulkNotes.trim()]))
        : {};
      setBulkPreview(await bulkRejectCandidates(selectedCandidateIds, notes, true));
    } catch (err) {
      setNotice(err?.message || "Bulk rejection preview could not be loaded.");
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkRejection = async () => {
    if (!bulkPreview) return;
    setBulkBusy(true);
    try {
      const notes = bulkNotes.trim()
        ? Object.fromEntries(selectedCandidateIds.map((candId) => [String(candId), bulkNotes.trim()]))
        : {};
      const result = await bulkRejectCandidates(selectedCandidateIds, notes, false);
      const rejected = result?.results?.filter((row) => row.outcome === "REJECTED").length || 0;
      setNotice(`${rejected} candidate${rejected === 1 ? "" : "s"} rejected.`);
      setBulkPreview(null);
      setSelectedCandidateIds([]);
      setBulkNotes("");
      load();
    } catch (err) {
      setNotice(err?.message || "Bulk rejection could not be completed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    const headers = ["Name", "Email", "Phone", "Position", "Requisition", "Status", "Source", "Applied", "Location", "Experience"];
    const rows = filtered.map((c) => [c.name, c.email, c.phone, c.position, c.requisition_title || "", c.status, sourceLabel(c.source, ""), formatDate(c.applied_at || c.created_at), c.location, c.experience]);
    const csv = candidateCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "candidates.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fromCv = (key) => (cvFilled[key] ? <CvBadge /> : null);
  const sourceOptions = SOURCE_OPTIONS.some((o) => o.value === form.source) || !form.source
    ? SOURCE_OPTIONS
    : [...SOURCE_OPTIONS, { value: form.source, label: sourceLabel(form.source, form.source) }];
  const stageOptions = editItem
    ? [editItem.status, ...(NEXT_STAGES[editItem.status] || [])].filter(Boolean)
    : ["applied", "screening", "interview", "offer"];
  const reqOptions = requisitions.filter((r) => r.status === "open" || String(r.id) === String(form.requisition_id));

  const modalJsx = showModal ? (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" onClick={requestClose}
        className={`absolute inset-0 bg-[#0A1128]/50 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${panelEntered ? "opacity-100" : "opacity-0"}`} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cand-form-title" aria-describedby="cand-form-subtitle" onKeyDown={onPanelKeyDown}
        className={`relative flex h-full w-full flex-col bg-gray-50 shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none sm:max-w-[640px] sm:rounded-l-2xl sm:overflow-hidden ${panelEntered ? "translate-x-0" : "translate-x-full"}`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex min-h-0 flex-1 flex-col">
          {/* sticky header */}
          <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-5 py-4 text-white sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {editItem
                  ? <Avatar name={form.name || editItem.name} size="md" className="ring-white/20" />
                  : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/15"><UserPlus className="h-4 w-4" /></span>}
                <div className="min-w-0">
                  <h2 id="cand-form-title" className="text-lg font-semibold leading-tight">{editItem ? "Edit candidate" : "Add candidate"}</h2>
                  <p id="cand-form-subtitle" className="mt-0.5 truncate text-xs text-blue-100/70">
                    {editItem
                      ? `${editItem.name || "Candidate"}${editItem.applied_at || editItem.created_at ? ` · applied ${formatDate(editItem.applied_at || editItem.created_at)}` : ""}`
                      : "Add an applicant to the pipeline. Import a CV to fill in what it contains."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editItem?.status ? <StatusPill tone={STAGE_TONE[editItem.status] || "gray"}>{STAGE_LABEL[editItem.status] || editItem.status}</StatusPill> : null}
                <button type="button" onClick={requestClose} disabled={saving} aria-label="Close"
                  className="rounded-lg p-1.5 text-blue-100/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"><X className="h-5 w-5" /></button>
              </div>
            </div>
          </header>

          {/* scrolling body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <fieldset disabled={saving} className="min-w-0 space-y-5">
              {!editItem ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); if (!cvParsing) setDragOver(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!cvParsing) importCV(e.dataTransfer?.files?.[0], { fresh: false }); }}
                  className={`rounded-2xl border-2 border-dashed transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : cvError ? "border-amber-300 bg-amber-50/60" : cvFileName && !cvParsing && cvFilledCount ? "border-emerald-300 bg-emerald-50/50" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"}`}>
                  <input ref={panelCvInputRef} id="cand-cv-file" type="file" accept=".pdf,.docx,.doc,.txt" className="sr-only"
                    onChange={(e) => importCV(e.target.files?.[0], { fresh: false })} disabled={cvParsing || saving} />
                  <label htmlFor="cand-cv-file" className={`flex cursor-pointer items-center gap-4 px-4 py-4 ${cvParsing ? "pointer-events-none" : ""}`}>
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${cvFileName && !cvParsing && cvFilledCount && !cvError ? "bg-emerald-100 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                      {cvParsing ? <Loader2 className="h-5 w-5 animate-spin" /> : cvFileName && cvFilledCount && !cvError ? <CheckCircle2 className="h-5 w-5" /> : <CloudUpload className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">Import from CV</span>
                      <span className="mt-0.5 block text-xs text-gray-500 break-words" aria-live="polite">
                        {cvParsing ? `Reading ${cvFileName}…`
                          : cvError ? cvError
                          : cvFileName && cvFilledCount ? `Filled ${cvFilledCount} field${cvFilledCount === 1 ? "" : "s"} from ${cvFileName}. Check them below.`
                          : cvFileName ? `Nothing could be read from ${cvFileName}. Fill in the details below.`
                          : "Drag & drop a PDF, Word or text file here, or click to browse."}
                      </span>
                    </span>
                    {!cvParsing ? <span className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm">{cvFileName ? "Replace" : "Browse"}</span> : null}
                  </label>
                </div>
              ) : null}

              <FormSection icon={User} title="Contact" helper="How the recruiting team reaches the candidate.">
                <Field id="cand-name" label="Full name" required error={errors.name} badge={fromCv("name")}>
                  <input id="cand-name" value={form.name} maxLength={150} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? "cand-name-error" : undefined}
                    onChange={(e) => setField("name", e.target.value)} className={inputCls(errors.name)} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="cand-email" label="Email" required error={errors.email} badge={fromCv("email")}
                    hint={duplicateCandidate ? null : "Used for status updates and interview invites."}
                    extra={!errors.email && duplicateCandidate ? (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          {duplicateCandidate.name || "Another candidate"} already uses this email{duplicateMeta ? ` (${duplicateMeta})` : ""}.{" "}
                          <NavLink to={`/zoiko-hr/recruitment/candidates/${duplicateCandidate.id}`} className="font-medium underline">View profile</NavLink>
                        </span>
                      </p>
                    ) : null}>
                    <input id="cand-email" type="email" value={form.email} maxLength={255} autoComplete="off" aria-invalid={!!errors.email} aria-describedby={errors.email ? "cand-email-error" : "cand-email-hint"}
                      onChange={(e) => setField("email", e.target.value)} className={inputCls(errors.email)} />
                  </Field>
                  <Field id="cand-phone" label="Phone" error={errors.phone} badge={fromCv("phone")} hint="10-digit number, country code optional.">
                    <input id="cand-phone" type="tel" value={form.phone} maxLength={PHONE_MAX_LENGTH} placeholder="+91 9876543210" autoComplete="off" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "cand-phone-error" : "cand-phone-hint"}
                      onChange={(e) => setField("phone", e.target.value)} className={inputCls(errors.phone)} />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={Briefcase} title="Application" helper="The role they applied for and where they came from.">
                <Field id="cand-req" label="Job requisition" error={errors.requisition_id}
                  hint={reqOptions.length ? "Linking a requisition fills the position if it is empty." : "There are no open requisitions to link."}>
                  <select id="cand-req" value={form.requisition_id} onChange={(e) => handleRequisitionSelect(e.target.value)} aria-describedby={errors.requisition_id ? "cand-req-error" : "cand-req-hint"} className={inputCls(errors.requisition_id)}>
                    <option value="">No requisition linked</option>
                    {reqOptions.map((r) => <option key={r.id} value={r.id}>{r.title}{r.department ? ` — ${r.department}` : ""}{r.status !== "open" ? ` · ${r.status}` : ""}</option>)}
                  </select>
                </Field>
                {selectedRequisition ? (
                  <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-blue-600 ring-1 ring-blue-100"><Briefcase className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{selectedRequisition.title}</p>
                      <p className="truncate text-xs text-gray-500">{[selectedRequisition.department, selectedRequisition.location].filter(Boolean).join(" · ") || "No department set"}</p>
                    </div>
                    {selectedRequisition.status ? <StatusPill tone={selectedRequisition.status === "open" ? "green" : "gray"}>{String(selectedRequisition.status).replace(/_/g, " ")}</StatusPill> : null}
                  </div>
                ) : null}
                <Field id="cand-position" label="Position" required error={errors.position} badge={fromCv("position")}>
                  <input id="cand-position" value={form.position} maxLength={150} autoComplete="off" aria-invalid={!!errors.position} aria-describedby={errors.position ? "cand-position-error" : undefined}
                    onChange={(e) => setField("position", e.target.value)} className={inputCls(errors.position)} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="cand-status" label="Status" error={errors.status}
                    hint={editItem ? (stageOptions.length > 1 ? "Only the moves the pipeline allows are listed." : "This stage can no longer change.") : "New candidates usually start at Applied."}>
                    <select id="cand-status" value={form.status} onChange={(e) => setField("status", e.target.value)} aria-describedby={errors.status ? "cand-status-error" : "cand-status-hint"} className={inputCls(errors.status)}>
                      {stageOptions.map((st) => <option key={st} value={st}>{STAGE_LABEL[st] || st}</option>)}
                    </select>
                  </Field>
                  <Field id="cand-source" label="Source" error={errors.source}>
                    <select id="cand-source" value={form.source} onChange={(e) => setField("source", e.target.value)} aria-describedby={errors.source ? "cand-source-error" : undefined} className={inputCls(errors.source)}>
                      {sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={MapPin} title="Profile" helper="Background that helps the hiring team shortlist.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="cand-location" label="Location" error={errors.location} badge={fromCv("location")}>
                    <input id="cand-location" value={form.location} maxLength={150} autoComplete="off" aria-invalid={!!errors.location} aria-describedby={errors.location ? "cand-location-error" : undefined}
                      onChange={(e) => setField("location", e.target.value)} className={inputCls(errors.location)} />
                  </Field>
                  <Field id="cand-exp" label="Experience" error={errors.experience} badge={fromCv("experience")} hint="Whole years, 0–60.">
                    <div className="relative">
                      <input id="cand-exp" type="number" inputMode="numeric" min={0} max={60} step={1} value={form.experience} aria-invalid={!!errors.experience} aria-describedby={errors.experience ? "cand-exp-error" : "cand-exp-hint"}
                        onChange={(e) => setField("experience", e.target.value)} className={`${inputCls(errors.experience)} pr-14`} />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">years</span>
                    </div>
                  </Field>
                </div>
                <Field id="cand-resume" label="Resume / portfolio link" error={errors.resume_link} hint="A link the team can open, starting with https://">
                  <div className="relative">
                    <input id="cand-resume" type="url" value={form.resume_link} maxLength={500} placeholder="https://" autoComplete="off" aria-invalid={!!errors.resume_link} aria-describedby={errors.resume_link ? "cand-resume-error" : "cand-resume-hint"}
                      onChange={(e) => setField("resume_link", e.target.value)} className={`${inputCls(errors.resume_link)} ${/^https?:\/\/\S+\.\S+/i.test(form.resume_link) ? "pr-16" : ""}`} />
                    {/^https?:\/\/\S+\.\S+/i.test(form.resume_link) ? (
                      <a href={form.resume_link.trim()} target="_blank" rel="noopener noreferrer" className="absolute inset-y-0 right-2 my-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-blue-600 hover:bg-blue-50">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </Field>
              </FormSection>

              <FormSection icon={FileText} title="Notes" helper="Visible to the recruiting team only.">
                <Field id="cand-notes" label="Notes" error={errors.notes} hideLabel
                  hint={`${String(form.notes || "").length}/5000`}>
                  <textarea id="cand-notes" value={form.notes} maxLength={5000} rows={4} aria-invalid={!!errors.notes} aria-describedby={errors.notes ? "cand-notes-error" : "cand-notes-hint"}
                    onChange={(e) => setField("notes", e.target.value)} className={`${inputCls(errors.notes)} resize-y`} />
                </Field>
              </FormSection>
            </fieldset>
          </div>

          {/* sticky footer */}
          <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            {saveError ? <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{saveError}</span></p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                <span className="text-red-500">*</span> Required
                <span className="hidden sm:inline"> · <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-sans text-[11px]">Ctrl</kbd>+<kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-sans text-[11px]">Enter</kbd> to save · <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-sans text-[11px]">Esc</kbd> to close</span>
              </p>
              <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                <SecondaryButton onClick={requestClose} disabled={saving}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" icon={saving ? Spinner : undefined} disabled={saving || cvParsing} aria-busy={saving || undefined}>
                  {saving ? "Saving..." : editItem ? "Update" : "Add"}
                </PrimaryButton>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  ) : null;

  if (loading) return <RecruitmentLayout title="Candidates" subtitle="Manage applicant pool"><div className="p-6 text-gray-400">Loading...</div></RecruitmentLayout>;

  if (error) return <RecruitmentLayout title="Candidates" subtitle="Manage applicant pool"><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Try Again</button></div></div></RecruitmentLayout>;

  if (id && candidate) {
    const act = candidateTimeline(candidate);
    return (
      <RecruitmentLayout title="Candidate Profile" subtitle="Applicant details and activity">
        <div className="space-y-6">
          {notice ? (
          <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        ) : null}
        {cvError ? (
          <div role="alert" className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{cvError}</span>
            <button onClick={() => setCvError("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-amber-500 hover:text-amber-800 text-lg">&times;</button>
          </div>
        ) : null}
          <div className="flex items-center gap-3">
            <NavLink to="/zoiko-hr/recruitment/candidates" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />Back to Candidates</NavLink>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="w-14 h-14 shrink-0 rounded-full bg-blue-100 flex items-center justify-center"><User className="w-7 h-7 text-blue-600" /></div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 break-words">{candidate.name}</h2>
                  <p className="text-sm text-gray-500 break-words">{candidate.position || "No position specified"}</p>
                  {candidate.requisition_title && (
                    <p className="text-xs text-blue-600 mt-0.5 break-words">Applying for requisition: {candidate.requisition_title}</p>
                  )}
                </div>
              </div>
              <StatusBadge status={candidate.status} />
            </div>
            {candidate.onboarding_new_hire_id && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm text-green-700 font-medium">✓ Onboarding started for this candidate</span>
                <NavLink to="/zoiko-hr/onboarding/new-hires" className="text-sm text-green-700 underline hover:text-green-900">View in Onboarding →</NavLink>
              </div>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {[
                { icon: Mail, label: "Email", value: candidate.email ? <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline break-all">{candidate.email}</a> : "Not provided" },
                { icon: Phone, label: "Phone", value: shown(candidate.phone, "Not provided") },
                { icon: MapPin, label: "Location", value: shown(candidate.location, "Not provided") },
                { icon: Briefcase, label: "Experience", value: experienceText(candidate.experience, "Not provided") },
                { icon: ExternalLink, label: "Source", value: sourceLabel(candidate.source, "Not provided") },
                { icon: Calendar, label: "Applied", value: formatDate(candidate.applied_at || candidate.created_at) },
                { icon: ExternalLink, label: "Resume", value: candidate.resume_link ? <a href={candidate.resume_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">View resume</a> : "Not provided" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2 text-gray-700">
                  <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0"><dt className="text-xs text-gray-400">{label}</dt><dd className="font-medium break-words">{value}</dd></div>
                </div>
              ))}
            </dl>
            {candidate.notes ? (
              <div className="mt-4 text-sm"><p className="text-xs text-gray-400 mb-1">Notes</p><p className="text-gray-700 whitespace-pre-wrap break-words">{candidate.notes}</p></div>
            ) : null}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Status Update</h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white">{STAGE_LABEL[candidate.status] || candidate.status}</span>
                {(NEXT_STAGES[candidate.status] || []).map((st) => (
                  <button key={st} onClick={() => handleStatusUpdate(candidate.id, st)} title={EMAILED_STAGES[st] || ""}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${st === "rejected" ? "bg-red-50 text-red-700 hover:bg-red-100" : st === "hired" ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    → {STAGE_LABEL[st]}
                  </button>
                ))}
              </div>
              {candidate.status === "hired" && <p className="mt-2 text-xs text-gray-400">Hired{candidate.hired_at ? ` on ${formatDate(candidate.hired_at)}` : ""}. Onboarding has started; the stage can no longer change.</p>}
              <p className="mt-2 text-xs text-gray-400">Moving to Screening or Rejected emails the candidate. Scheduling an interview moves them to Interview; sending an offer moves them to Offer.</p>
            </div>
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Candidate privacy notice</h3>
                  {privacyStatus?.privacy_notice_sent_at
                    ? <p className="mt-1 text-xs text-green-700">Issued {formatDate(privacyStatus.privacy_notice_sent_at)}</p>
                    : <p className="mt-1 text-xs text-gray-500">No issued privacy notice is recorded.</p>}
                </div>
                <button type="button" onClick={() => resendPrivacyNotice(candidate.id)} disabled={privacyBusy} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                  {privacyBusy ? "Issuing…" : "Issue / resend notice"}
                </button>
              </div>
              {privacyStatus?.privacy_notice_blocked && <p className="mt-2 text-xs text-amber-700">Notice not available: {(privacyStatus.privacy_notice_blocked.reasons || []).join(", ") || privacyStatus.privacy_notice_blocked.outcome}</p>}
              {(privacyStatus?.documents || []).filter((doc) => doc.canonical_id === "HR-HIR-004").map((doc) => (
                <p key={doc.id} className="mt-2 text-xs text-gray-500">Document status: {doc.status?.replace(/_/g, " ")}{doc.document_number ? ` · ${doc.document_number}` : ""}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => openEdit(candidate)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
              <button onClick={() => handleDelete(candidate.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Activity Timeline</h3>
            {act.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No activity recorded</div>
            ) : (
              <div className="space-y-3">
                {act.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                    <div className="shrink-0 p-1.5 rounded-full bg-blue-100"><Clock className="w-3.5 h-3.5 text-blue-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 break-words">{a.description || a.message || a.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(a.date || a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {modalJsx}
      </RecruitmentLayout>
    );
  }

  return (
    <RecruitmentLayout title="Candidates" subtitle="Review, screen, and move applicants through every hiring stage."
      actions={<>
        <SecondaryButton icon={Settings} onClick={() => setShowPrivacySettings((value) => !value)} aria-expanded={showPrivacySettings}>Privacy settings</SecondaryButton>
        <SecondaryButton icon={FileText} onClick={exportCsv}>Export CSV</SecondaryButton>
        <input ref={cvFileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleImportCV} className="hidden" id="cv-import-input" />
        <label htmlFor="cv-import-input"
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 ${cvParsing ? "pointer-events-none opacity-50" : ""}`}>
          {cvParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {cvParsing ? "Parsing CV..." : "Import CV"}
        </label>
        <PrimaryButton icon={Plus} onClick={openCreate}>Add Candidate</PrimaryButton>
      </>}>
      <div className="space-y-6">
        {notice ? (
          <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        ) : null}
        {cvError ? (
          <div role="alert" className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{cvError}</span>
            <button onClick={() => setCvError("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-amber-500 hover:text-amber-800 text-lg">&times;</button>
          </div>
        ) : null}
        <KpiGrid cols={6}>
          <KpiCard label="Total Candidates" icon={Users} tone="blue" kpi={candKpis.total} loading={candInsights.loading && !candInsights.data} />
          <KpiCard label="In Pipeline" icon={Clock} tone="violet" kpi={candKpis.active} loading={candInsights.loading && !candInsights.data} />
          <KpiCard label="Interviewing" icon={Calendar} tone="amber" kpi={candKpis.interview} loading={candInsights.loading && !candInsights.data} />
          <KpiCard label="Offer Stage" icon={FileText} tone="teal" kpi={candKpis.offer} loading={candInsights.loading && !candInsights.data} />
          <KpiCard label="Hired" icon={CheckCircle2} tone="green" kpi={candKpis.hired} loading={candInsights.loading && !candInsights.data} />
          <KpiCard label="Rejected" icon={X} tone="red" kpi={candKpis.rejected} loading={candInsights.loading && !candInsights.data} />
        </KpiGrid>

        {showPrivacySettings && <RecruitmentPrivacySettings embedded />}

        {selectedCandidateIds.length > 0 && (
          <section className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="min-w-[14rem] flex-1">
              <p className="text-sm font-semibold text-amber-900">{selectedCandidateIds.length} candidate(s) selected</p>
              <label className="mt-2 block text-xs font-medium text-amber-900">Optional reviewed note for final-stage offer rejections
                <textarea value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="button" onClick={previewBulkRejection} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50">
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Preview bulk rejection
            </button>
            <button type="button" onClick={() => { setSelectedCandidateIds([]); setBulkNotes(""); }} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100">Clear selection</button>
          </section>
        )}

        <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search candidates..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm sm:w-auto">
            <option value="">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="screening">Screening</option>
            <option value="interview">Interviewed</option>
            <option value="offer">Offered</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm sm:w-auto">
            <option value="">All Sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={requisitionFilter} onChange={(e) => { setRequisitionFilter(e.target.value); setPage(1); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm sm:w-auto">
            <option value="">All Requisitions</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto border-t border-gray-100">
          <table className="min-w-full text-left">
            <thead className="bg-gray-50/60 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-3 font-medium">
                  <input type="checkbox" aria-label="Select candidates on this page" checked={pageFullySelected} disabled={!eligiblePageIds.length}
                    onChange={(e) => setSelectedCandidateIds((prev) => e.target.checked
                      ? [...new Set([...prev, ...eligiblePageIds])]
                      : prev.filter((candId) => !eligiblePageIds.includes(candId)))} />
                </th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold hidden sm:table-cell">Email</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">Phone</th>
                <th className="px-3 py-3 font-semibold">Position</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">Location</th>
                <th className="px-3 py-3 font-semibold hidden xl:table-cell">Exp</th>
                <th className="px-3 py-3 font-semibold hidden xl:table-cell">Requisition</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Applied</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">Source</th>
                <th className="px-3 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-gray-100 text-sm hover:bg-blue-50/40" onClick={() => navigate(`/zoiko-hr/recruitment/candidates/${c.id}`)}>
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${c.name} for bulk rejection`} disabled={c.status === "hired" || c.status === "rejected"} checked={selectedCandidateIds.includes(c.id)} onChange={() => toggleSelected(c.id)} />
                  </td>
                  <td className="px-3 py-3"><PersonCell name={c.name} /></td>
                  <td className="hidden max-w-[220px] truncate px-3 py-3 text-gray-500 sm:table-cell" title={c.email || ""}>{c.email || "-"}</td>
                  <td className="hidden lg:table-cell px-2 sm:px-3 py-3 text-gray-500 whitespace-nowrap">{shown(c.phone)}</td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-gray-500" title={c.position || ""}>{c.position || "-"}</td>
                  <td className="hidden max-w-[160px] truncate px-3 py-3 text-gray-500 lg:table-cell" title={shown(c.location)}>{shown(c.location)}</td>
                  <td className="hidden xl:table-cell px-2 sm:px-3 py-3 text-gray-500 whitespace-nowrap">{experienceText(c.experience)}</td>
                  <td className="hidden max-w-[160px] truncate px-3 py-3 text-gray-500 xl:table-cell" title={c.requisition_title || ""}>{c.requisition_title || "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusPill tone={STAGE_TONE[c.status] || "gray"}>{STAGE_LABEL[c.status] || c.status}</StatusPill>
                      {c.onboarding_new_hire_id && (
                        <span title="Onboarding started" className="text-green-600 text-xs font-medium">✓ Onboarding</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{daysAgo(c.applied_at || c.created_at)}</td>
                  <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{sourceLabel(c.source)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button type="button" title="Load privacy notice status" aria-label={`Privacy notice status for ${c.name}`} onClick={(e) => { e.stopPropagation(); loadPrivacyStatus(c.id); }} className="p-1.5 text-gray-400 hover:text-emerald-600">
                        {rowPrivacyBusy[c.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {rowPrivacy[c.id] && <p className="mt-1 text-[10px] text-gray-500">{rowPrivacy[c.id].privacy_notice_sent_at ? `Notice issued ${formatDate(rowPrivacy[c.id].privacy_notice_sent_at)}` : "No issued notice"}</p>}
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-400">No candidates found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-sm">
          <span className="text-gray-500">{filtered.length} total candidate(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        </Card>
      </div>

      {modalJsx}
      {bulkPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="bulk-reject-title" className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <h2 id="bulk-reject-title" className="text-lg font-semibold text-gray-900">Review bulk rejection</h2>
            <p className="mt-1 text-sm text-gray-500">Review the server preflight results before confirming these candidate status changes.</p>
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {(bulkPreview.results || []).map((result) => (
                <li key={result.candidate_id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-gray-100 p-3 text-sm">
                  <span className="font-medium text-gray-900">{result.name || candidates.find((c) => String(c.id) === String(result.candidate_id))?.name || `Candidate #${result.candidate_id}`}</span>
                  <span className={`font-semibold ${result.outcome === "ALLOW" ? "text-green-700" : result.outcome === "SKIPPED" || result.outcome === "NOT_FOUND" ? "text-gray-500" : "text-amber-700"}`}>{result.outcome}</span>
                  {result.reason && <span className="basis-full text-xs text-gray-500">{result.reason}</span>}
                  {result.reasons?.length > 0 && <span className="basis-full text-xs text-gray-500">{result.reasons.join(", ")}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />Confirming rejects eligible candidates. Candidates skipped or not found will remain unchanged.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setBulkPreview(null)} disabled={bulkBusy} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={confirmBulkRejection} disabled={bulkBusy || !(bulkPreview.results || []).some((result) => !["SKIPPED", "NOT_FOUND"].includes(result.outcome))} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm rejection
              </button>
            </div>
          </section>
        </div>
      )}
    </RecruitmentLayout>
  );
}
