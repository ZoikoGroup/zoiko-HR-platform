/*
 * Onboarding → New Hires, in the Recruitment design (recruitment/ui.jsx): KPI row from the onboarding insights, status chips,
 * filters, the new-hire table with checklist progress and alerts, a right-hand detail panel and a slide-over add/edit form.
 * Every figure comes from the records API or GET /hr/recruitment/insights?section=onboarding; nothing is invented.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, Briefcase, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, Copy,
  Download, Edit2, Eye, FileClock, FileText, Link2, ListChecks, Loader2, Mail, MoreHorizontal, Phone, Play, Plus, RotateCcw, Send,
  StickyNote, Trash2, UserCheck, UserPlus, UserRound, UserX, X, XCircle,
} from "lucide-react";
import OnboardingLayout from "./OnboardingLayout";
import {
  Avatar, Card, ChipTabs, DetailPanel, DetailSection, EmptyState, FilterSelect, KpiCard, KpiGrid, Pagination, PersonCell, PrimaryButton,
  QuickAction, SearchInput, SecondaryButton, StatusPill, Table, UnderlineTabs, WithDetail, relativeTime, td, useInsights,
} from "../recruitment/ui";
import {
  getOnboardingRecords, createOnboardingRecord, updateOnboardingRecord, deleteOnboardingRecord,
  getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  getOnboardingDocuments, getOnboardingChecklistAssignments, sendOnboardingPortalInvite,
  requestOnboardingDocuments, getOnboardingProgress, getDepartments, getOnboardingActivities,
} from "../../../service/hrService";
import { getEmployees } from "../../../service/employee";
import { formatDate } from "../../../utils/dateTime";
import OnboardingFormsReview from "./OnboardingFormsReview";
import ProbationScheduleForm from "./ProbationScheduleForm";

const STATUS_OPTIONS = [
  { value: "offer_sent", label: "Offer Sent", tone: "blue" },
  { value: "offer_accepted", label: "Offer Accepted", tone: "teal" },
  { value: "pre_joining", label: "Pre-Joining", tone: "violet" },
  { value: "in_progress", label: "In Progress", tone: "amber" },
  { value: "completed", label: "Completed", tone: "green" },
  { value: "cancelled", label: "Cancelled", tone: "red" },
];

// Mirrors the server's allowed transitions. "completed" is reached only through "Complete onboarding".
const STATUS_FLOW = {
  offer_sent: ["offer_accepted", "cancelled"],
  offer_accepted: ["pre_joining", "in_progress", "cancelled"],
  pre_joining: ["offer_accepted", "in_progress", "cancelled"],
  in_progress: ["pre_joining", "completed", "cancelled"],
  completed: [],
  cancelled: ["offer_accepted"],
};

const ACTIVE_STATUSES = ["offer_sent", "offer_accepted", "pre_joining", "in_progress"];
const CREATE_STATUSES = ["offer_sent", "offer_accepted", "pre_joining", "in_progress"];

const transitionLabel = (from, to) => {
  if (to === "cancelled") return "Cancel";
  if (to === "offer_accepted") return from === "cancelled" ? "Reopen" : from === "offer_sent" ? "Accept offer" : "Back to Offer Accepted";
  if (to === "pre_joining") return from === "in_progress" ? "Back to Pre-Joining" : "Pre-Join";
  if (to === "in_progress") return "Start onboarding";
  return to;
};
const transitionIcon = (to) => (to === "cancelled" ? XCircle : to === "in_progress" ? Play : to === "offer_accepted" ? RotateCcw : CalendarClock);

const JOINING_STATUS_OPTIONS = [
  { value: "not_joined", label: "Not Joined", tone: "gray" },
  { value: "joined", label: "Joined", tone: "green" },
  { value: "no_show", label: "No Show", tone: "red" },
  { value: "deferred", label: "Deferred", tone: "amber" },
];

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
];

const DOCUMENT_CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "offer_letter", label: "Signed offer letter" },
  { value: "nda", label: "Signed NDA" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

const DOC_STATUS = {
  requested: { label: "Waiting for new hire", tone: "gray" },
  pending: { label: "Needs review", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

const PROFILE_FIELDS = [
  ["address", "Address"], ["city", "City"], ["state", "State"], ["country", "Country"], ["postal_code", "Postal code"],
  ["emergency_contact_name", "Emergency contact"], ["emergency_contact_relation", "Relation"], ["emergency_contact_phone", "Emergency phone"],
];

const initialForm = {
  candidate_name: "", email: "", phone: "", position: "", department_id: "", manager_id: "", joining_date: "", notes: "",
  employment_type: "", status: "offer_accepted", start_onboarding: true,
};
const FORM_FIELDS = Object.keys(initialForm);
// Column limits on OnboardingNewHire.
const LIMITS = { candidate_name: 150, email: 255, phone: 50, position: 150 };
const FIELD_IDS = { candidate_name: "nh-name", email: "nh-email", phone: "nh-phone", position: "nh-position" };

const asList = (data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
const employeeName = (e) => e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || e.email || `#${e.id}`;
const statusMeta = (s) => STATUS_OPTIONS.find((o) => o.value === s) || { value: s, label: s || "—", tone: "gray" };
const statusLabel = (s) => statusMeta(s).label;
const joiningMeta = (s) => JOINING_STATUS_OPTIONS.find((o) => o.value === (s || "not_joined")) || JOINING_STATUS_OPTIONS[0];
const employmentLabel = (v) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label || v || "";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Whole days from today to a YYYY-MM-DD date, in local time (negative = past). */
function daysUntil(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function joiningRelative(value) {
  const n = daysUntil(value);
  if (n == null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
const monthKey = (value) => (/^\d{4}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 7) : "");
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};
const portalExpired = (r) => !!(r.portal_expires_at && new Date(r.portal_expires_at) < new Date());

// ── small pieces ────────────────────────────────────────────────────────────────────────────────────────────────────
function HireStatus({ status }) {
  const m = statusMeta(status);
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

function JoiningPill({ status }) {
  const m = joiningMeta(status);
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

function ProgressBar({ progress, name }) {
  if (!progress || progress.pct == null) return <span className="whitespace-nowrap text-xs text-gray-400">No checklist</span>;
  const pct = Math.max(0, Math.min(100, progress.pct));
  const color = pct >= 100 ? "bg-emerald-500" : progress.overdue ? "bg-rose-500" : "bg-blue-500";
  return (
    <div className="min-w-[110px]">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-gray-700">{pct}%</span>
        <span className="text-gray-400">{progress.done}/{progress.items}</span>
      </div>
      <div role="progressbar" aria-label={`Checklist progress for ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function alertsFor(r, p) {
  const out = [];
  if (p?.overdue) out.push({ key: "overdue", icon: AlertTriangle, tone: "text-rose-600 bg-rose-50 ring-rose-200", n: p.overdue, text: `${p.overdue} overdue checklist item${p.overdue === 1 ? "" : "s"}` });
  if (p?.pending_documents) out.push({ key: "docs", icon: FileClock, tone: "text-amber-700 bg-amber-50 ring-amber-200", n: p.pending_documents, text: `${p.pending_documents} document${p.pending_documents === 1 ? "" : "s"} pending review` });
  if (p?.open_tasks) out.push({ key: "tasks", icon: ListChecks, tone: "text-gray-600 bg-gray-100 ring-gray-200", n: p.open_tasks, text: `${p.open_tasks} open pre-boarding task${p.open_tasks === 1 ? "" : "s"}` });
  if (ACTIVE_STATUSES.includes(r.status) && r.portal_invited_at && portalExpired(r)) out.push({ key: "link", icon: Link2, tone: "text-rose-600 bg-rose-50 ring-rose-200", text: "Pre-onboarding link expired" });
  return out;
}

function Alerts({ items }) {
  if (!items.length) return <span className="text-gray-400">—</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Alerts">
      {items.map((a) => (
        <li key={a.key} title={a.text} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${a.tone}`}>
          <a.icon className="h-3.5 w-3.5" aria-hidden="true" />{a.n != null && a.n}<span className="sr-only">{a.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** "…" row menu, rendered fixed so the table's horizontal scroll container doesn't clip it. */
function RowMenu({ name, busy, onView, items }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null); };
    const esc = (e) => { if (e.key === "Escape") setPos(null); };
    const hide = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);
  const toggle = (e) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  const run = (fn) => (e) => { e.stopPropagation(); setPos(null); fn(); };
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Actions for ${name}`} onClick={toggle}
        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && (
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg">
          <button type="button" role="menuitem" onClick={run(onView)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
            <Eye className="h-4 w-4 text-gray-400" /> View details
          </button>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={busy} onClick={run(it.onClick)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 ${it.danger ? "text-rose-600" : "text-gray-700"}`}>
              <it.icon className={`h-4 w-4 ${it.danger ? "text-rose-500" : "text-gray-400"}`} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function InfoItem({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-gray-900">{children}</div>
      </div>
    </div>
  );
}

function Timeline({ steps }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.done ? "bg-emerald-500" : s.failed ? "bg-rose-500" : "bg-gray-300"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{s.title}</p>
            {s.when && <p className="text-xs text-gray-500">{formatDate(s.when)}{s.rel ? ` · ${s.rel}` : relativeTime(s.when) ? ` · ${relativeTime(s.when)}` : ""}</p>}
            {s.note && <p className="mt-1 break-words text-xs text-gray-600">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, tone = "text-gray-900" }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-gray-100">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/** Centered dialog: Esc closes, focus moves in on open and back to the opener on close. */
function Dialog({ id, title, onClose, children, footer, busy }) {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const t = setTimeout(() => ref.current?.querySelector("input, button:not([aria-label='Close dialog']), select, textarea")?.focus(), 30);
    return () => {
      clearTimeout(t);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented && !busy) { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1128]/50 p-3 backdrop-blur-[2px] sm:p-4" onClick={busy ? undefined : onClose}>
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 id={id} className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </section>
    </div>
  );
}

// ── create / edit new hire: right-hand slide-over ───────────────────────────────────────────────────────────────────
const inputCls = (bad) => `w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 ${
  bad ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-gray-200 focus:border-blue-400 focus:ring-blue-100"}`;

function Field({ id, label, required, error, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1 text-xs text-rose-600"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</p>
      ) : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function FormSection({ icon: Icon, title, helper, children }) {
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100" aria-hidden="true"><Icon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{helper}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function validateHire(form) {
  const errors = {};
  if (!form.candidate_name.trim()) errors.candidate_name = "Name is required";
  else if (form.candidate_name.trim().length > LIMITS.candidate_name) errors.candidate_name = `Keep the name under ${LIMITS.candidate_name} characters`;
  if (!form.email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Invalid email";
  if (form.phone.trim().length > LIMITS.phone) errors.phone = `Keep the phone under ${LIMITS.phone} characters`;
  if (!form.position.trim()) errors.position = "Position is required";
  else if (form.position.trim().length > LIMITS.position) errors.position = `Keep the position under ${LIMITS.position} characters`;
  return errors;
}

function formFromRecord(record) {
  if (!record) return { ...initialForm };
  return {
    ...initialForm,
    candidate_name: record.candidate_name || "",
    email: record.email || "",
    phone: record.phone || "",
    position: record.position || "",
    department_id: record.department_id ? String(record.department_id) : "",
    manager_id: record.manager_id ? String(record.manager_id) : "",
    joining_date: record.joining_date || "",
    notes: record.notes || "",
    employment_type: record.employment_type || "",
  };
}

function NewHireFormPanel({ editRecord, departments, employees, onClose, onSubmit }) {
  const initial = useMemo(() => formFromRecord(editRecord), [editRecord]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef(null);
  const dirty = useMemo(() => FORM_FIELDS.some((k) => String(form[k] ?? "") !== String(initial[k] ?? "")), [form, initial]);

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    const next = { ...form, [key]: value };
    setForm(next);
    if (attempted) setErrors(validateHire(next));
    else if (errors[key]) setErrors((er) => { const { [key]: _drop, ...rest } = er; return rest; });
  };

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved changes to this new hire?")) return;
    onClose();
  }, [saving, dirty, onClose]);

  // focus in on open, back to the opener on close; lock the page scroll behind the panel
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => document.getElementById("nh-name")?.focus(), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);

  // Esc closes (with a discard prompt); Tab stays inside the panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); requestClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const save = async (e) => {
    e?.preventDefault();
    setBanner(null);
    setAttempted(true);
    const errs = validateHire(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const n = Object.keys(errs).length;
      setBanner(`${n} field${n === 1 ? " needs" : "s need"} attention before this can be saved.`);
      const key = ["candidate_name", "email", "phone", "position"].find((k) => errs[k]);
      const el = key && document.getElementById(FIELD_IDS[key]);
      if (el) { el.focus(); el.scrollIntoView?.({ block: "center", behavior: "smooth" }); }
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setBanner(err?.message || "Failed to save record");
      setSaving(false);
    }
  };

  const aria = (key, hint) => ({ "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${FIELD_IDS[key]}-error` : hint ? `${FIELD_IDS[key]}-hint` : undefined });
  const editManagerMissing = form.manager_id && !employees.some((e) => String(e.id) === form.manager_id);
  const title = editRecord ? "Edit new hire" : "New hire";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" onClick={requestClose}
        className={`absolute inset-0 bg-[#0A1128]/50 backdrop-blur-[2px] transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="new-hire-form-title" aria-describedby="new-hire-form-subtitle"
        className={`relative flex h-full w-full flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-out sm:max-w-[640px] sm:overflow-hidden sm:rounded-l-3xl ${shown ? "translate-x-0" : "translate-x-full"}`}>
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#0A1128] via-[#0E1734] to-[#111A33] px-5 py-4 text-white sm:px-6 sm:py-5">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:grid" aria-hidden="true">
              {editRecord ? <Edit2 className="h-5 w-5 text-blue-300" /> : <UserPlus className="h-5 w-5 text-blue-300" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="new-hire-form-title" className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
                {editRecord && <HireStatus status={editRecord.status} />}
              </div>
              <p id="new-hire-form-subtitle" className="mt-1 text-sm text-slate-300">
                {editRecord
                  ? `Changes to ${editRecord.candidate_name || "this new hire"} apply as soon as you update.`
                  : "Add someone who is joining. Starting onboarding applies your Settings: checklists, document requests and the pre-onboarding email."}
              </p>
            </div>
            <button type="button" onClick={requestClose} aria-label="Close form" disabled={saving}
              className="-mr-1 rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <form noValidate onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {banner && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 break-words">{banner}</span>
                <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="-m-1 rounded-lg p-1 text-rose-400 hover:bg-rose-100"><X className="h-4 w-4" /></button>
              </div>
            )}

            <FormSection icon={UserRound} title="Personal details" helper="How to reach the new hire. The pre-onboarding link and login details go to this email.">
              <Field id="nh-name" label="Candidate name" required error={errors.candidate_name}>
                <input id="nh-name" value={form.candidate_name} onChange={set("candidate_name")} maxLength={LIMITS.candidate_name + 20} autoComplete="off"
                  {...aria("candidate_name")} className={inputCls(errors.candidate_name)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="nh-email" label="Email" required error={errors.email}>
                  <input id="nh-email" type="email" value={form.email} onChange={set("email")} maxLength={LIMITS.email} autoComplete="off"
                    {...aria("email")} className={inputCls(errors.email)} />
                </Field>
                <Field id="nh-phone" label="Phone" error={errors.phone}>
                  <input id="nh-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={LIMITS.phone + 10} autoComplete="off"
                    {...aria("phone")} className={inputCls(errors.phone)} />
                </Field>
              </div>
            </FormSection>

            <FormSection icon={Briefcase} title="Role" helper="The position they are joining, the team and who they report to.">
              <Field id="nh-position" label="Position" required error={errors.position}>
                <input id="nh-position" value={form.position} onChange={set("position")} maxLength={LIMITS.position + 20} autoComplete="off"
                  {...aria("position")} className={inputCls(errors.position)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="nh-department" label="Department">
                  <select id="nh-department" value={form.department_id} onChange={set("department_id")} className={inputCls(false)}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d.id} value={String(d.id)}>{d.name || `Dept #${d.id}`}</option>)}
                  </select>
                </Field>
                <Field id="nh-manager" label="Manager" hint={employees.length ? undefined : "No active employees were loaded."}>
                  <select id="nh-manager" value={form.manager_id} onChange={set("manager_id")} className={inputCls(false)}>
                    <option value="">Select manager</option>
                    {editManagerMissing && <option value={form.manager_id}>{editRecord?.manager_name || `Employee #${form.manager_id}`}</option>}
                    {employees.map((e) => <option key={e.id} value={String(e.id)}>{employeeName(e)}</option>)}
                  </select>
                </Field>
                <Field id="nh-type" label="Employment type">
                  <select id="nh-type" value={form.employment_type} onChange={set("employment_type")} className={inputCls(false)}>
                    <option value="">Not set</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field id="nh-joining" label="Joining date">
                  <input id="nh-joining" type="date" value={form.joining_date} onChange={set("joining_date")} className={inputCls(false)} />
                </Field>
              </div>
            </FormSection>

            {!editRecord && (
              <FormSection icon={ClipboardCheck} title="Onboarding start" helper="Where the record starts and whether onboarding kicks off right away.">
                <Field id="nh-status" label="Starting status">
                  <select id="nh-status" value={form.status} onChange={set("status")} className={inputCls(false)}>
                    {CREATE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </Field>
                <label htmlFor="nh-start" className="flex items-start gap-3 rounded-xl border border-gray-200 bg-slate-50 px-3.5 py-3 text-sm text-gray-700">
                  <input id="nh-start" type="checkbox" checked={form.start_onboarding} onChange={set("start_onboarding")} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                  <span>Start onboarding now<span className="block text-xs text-gray-500">Applies Settings: checklists, document requests and emails the pre-onboarding link.</span></span>
                </label>
              </FormSection>
            )}

            <FormSection icon={StickyNote} title="Notes" helper="Internal notes for HR. The new hire does not see them.">
              <Field id="nh-notes" label="Notes">
                <textarea id="nh-notes" rows={3} value={form.notes} onChange={set("notes")} className={`${inputCls(false)} resize-y leading-relaxed`} />
              </Field>
            </FormSection>
          </div>

          <footer className="shrink-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                {dirty ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />Unsaved changes</span>
                  : <><span className="text-rose-500" aria-hidden="true">*</span> Required fields</>}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <SecondaryButton onClick={requestClose} disabled={saving}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={saving} icon={saving ? Loader2 : undefined} className={saving ? "[&>svg]:animate-spin" : ""}>
                  {saving ? "Saving..." : editRecord ? "Update" : "Create"}
                </PrimaryButton>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ── right-hand detail panel ─────────────────────────────────────────────────────────────────────────────────────────
function HireDetail({ rec, progress, panel, link, busy, employees, act, onClose }) {
  const [tab, setTab] = useState("overview");
  const [log, setLog] = useState({ items: null, loading: false, error: "" });
  const [newTask, setNewTask] = useState({ title: "", description: "", due_date: "" });
  useEffect(() => { setTab("overview"); setLog({ items: null, loading: false, error: "" }); setNewTask({ title: "", description: "", due_date: "" }); }, [rec.id]);
  useEffect(() => {
    if (tab !== "timeline" || log.items || log.loading) return undefined;
    let live = true;
    setLog({ items: null, loading: true, error: "" });
    getOnboardingActivities(200)
      .then((res) => live && setLog({ items: asList(res).filter((a) => a.onboarding_new_hire_id === rec.id), loading: false, error: "" }))
      .catch((e) => live && setLog({ items: [], loading: false, error: e?.message || "Activity could not be loaded." }));
    return () => { live = false; };
  }, [tab, rec.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = rec.status === "completed";
  const active = ACTIVE_STATUSES.includes(rec.status);
  const recordTasks = panel.tasks || [];
  const recordDocs = panel.docs || [];
  const recordChecklists = panel.checklists || [];
  const profile = rec.profile_details || {};
  const hasProfile = PROFILE_FIELDS.some(([k]) => profile[k]);
  const next = (STATUS_FLOW[rec.status] || []).filter((s) => s !== "completed");
  const expired = portalExpired(rec);
  const joinRel = joiningRelative(rec.joining_date);

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    if (await act.addTask(rec.id, newTask)) setNewTask({ title: "", description: "", due_date: "" });
  };

  const milestones = [
    { title: "Record created", when: rec.created_at, done: true, note: rec.created_by ? `By ${rec.created_by}` : undefined },
    rec.portal_invited_at
      ? { title: "Pre-onboarding link sent", when: rec.portal_invited_at, done: true, note: rec.portal_expires_at ? `${expired ? "Expired" : "Valid until"} ${formatDate(rec.portal_expires_at)}` : undefined }
      : { title: "Pre-onboarding link not sent yet" },
    rec.joining_date
      ? { title: `Joining date · ${joiningMeta(rec.joining_status).label}`, when: rec.joining_date, rel: joinRel, done: rec.joining_status === "joined", failed: rec.joining_status === "no_show" }
      : { title: "Joining date not set" },
    rec.status === "completed"
      ? { title: "Onboarding completed", when: rec.completed_at, done: true, note: rec.employee_id ? `Employee account #${rec.employee_id} created` : "Employee account created" }
      : rec.status === "cancelled" ? { title: "Onboarding cancelled", failed: true } : { title: `Now ${statusLabel(rec.status)}` },
  ];

  const header = (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar name={rec.candidate_name} size="lg" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><HireStatus status={rec.status} /><JoiningPill status={rec.joining_status} /></div>
        <h2 className="mt-1.5 break-words text-lg font-bold text-gray-900">{rec.candidate_name}</h2>
        <p className="break-words text-sm text-gray-500">{[rec.position, rec.department_name].filter(Boolean).join(" · ") || "—"}</p>
      </div>
    </div>
  );

  return (
    <DetailPanel title={`New hire ${rec.candidate_name}`} header={header} onClose={onClose}>
      <UnderlineTabs label="New hire details" value={tab} onChange={setTab}
        tabs={[{ value: "overview", label: "Overview" }, { value: "checklist", label: "Checklist & Tasks" },
          { value: "forms", label: "Forms" }, { value: "timeline", label: "Timeline" }]} />
      <div className="mt-4">
        {tab === "overview" && (
          <>
            {readOnly && (
              <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Onboarding completed{rec.completed_at ? ` on ${formatDate(rec.completed_at)}` : ""}. Employee account created{rec.employee_id ? ` (employee #${rec.employee_id})` : ""}. This record is read-only.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 p-4">
              <InfoItem icon={Mail} label="Email"><span className="break-all">{rec.email || "—"}</span></InfoItem>
              <InfoItem icon={Phone} label="Phone">{rec.phone || "—"}</InfoItem>
              <InfoItem icon={Building2} label="Department">{rec.department_name || "—"}</InfoItem>
              <InfoItem icon={UserRound} label="Manager">{rec.manager_name || "—"}</InfoItem>
              <InfoItem icon={Briefcase} label="Employment type">{employmentLabel(rec.employment_type) || "—"}</InfoItem>
              <InfoItem icon={CalendarDays} label="Joining date">
                {rec.joining_date ? formatDate(rec.joining_date) : "—"}
                {joinRel && <span className="block text-xs font-normal text-gray-500">{joinRel}</span>}
              </InfoItem>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`joining-${rec.id}`} className="text-sm text-gray-600">Joining status</label>
              <select id={`joining-${rec.id}`} value={rec.joining_status || "not_joined"} disabled={readOnly} onChange={(e) => act.joining(rec, e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-70">
                {JOINING_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {rec.notes && <p className="mt-3 break-words rounded-xl bg-slate-50 px-3 py-2 text-xs text-gray-600">Notes: {rec.notes}</p>}

            <DetailSection title="Onboarding progress">
              {progress ? (
                <>
                  <ProgressBar progress={progress} name={rec.candidate_name} />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat label="Overdue items" value={progress.overdue} tone={progress.overdue ? "text-rose-600" : "text-gray-900"} />
                    <Stat label="Open tasks" value={progress.open_tasks} />
                    <Stat label="Docs pending" value={progress.pending_documents} tone={progress.pending_documents ? "text-amber-700" : "text-gray-900"} />
                  </div>
                </>
              ) : <p className="text-sm text-gray-400">Progress figures are not available.</p>}
            </DetailSection>

            <DetailSection title="Portal invitation">
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!rec.portal_invited_at ? <StatusPill tone="gray">Not sent</StatusPill>
                    : expired ? <StatusPill tone="red">Link expired</StatusPill> : <StatusPill tone="green" icon={CheckCircle2}>Link active</StatusPill>}
                </div>
                <p className="mt-2 break-words text-xs text-gray-600">
                  {!rec.portal_invited_at ? "Pre-onboarding link not sent yet"
                    : `Link sent ${formatDate(rec.portal_invited_at)}${rec.portal_expires_at ? ` · ${expired ? "expired" : "valid until"} ${formatDate(rec.portal_expires_at)}` : ""}`}
                </p>
                {link?.url && (
                  <div className="mt-2 flex items-center gap-2">
                    <input readOnly aria-label="Pre-onboarding link" value={link.url} onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700" />
                    <button type="button" onClick={() => act.copy(link.url)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <Copy className="h-3.5 w-3.5" />Copy
                    </button>
                  </div>
                )}
                {active && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => act.sendLink(rec)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" />{busy ? "Sending..." : rec.portal_invited_at ? "Resend pre-onboarding link" : "Send pre-onboarding link"}
                    </button>
                    <button type="button" onClick={() => act.requestDocs(rec)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <FileText className="h-3.5 w-3.5" />Request documents
                    </button>
                  </div>
                )}
              </div>
            </DetailSection>

            <DetailSection title="Profile details entered by the new hire">
              {!hasProfile ? <p className="text-sm text-gray-400">No profile details are available here. Submitted onboarding forms are in the Forms tab.</p> : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {PROFILE_FIELDS.filter(([k]) => profile[k]).map(([k, label]) => (
                    <div key={k} className="contents">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="break-words text-gray-800">{profile[k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </DetailSection>
          </>
        )}

        {tab === "checklist" && (
          panel.loading ? <p role="status" className="py-6 text-center text-sm text-gray-500">Loading details...</p> : (
            <>
              <DetailSection title="Checklists">
                {recordChecklists.length === 0 ? <p className="text-sm text-gray-400">No checklists assigned.</p> : (
                  <ul className="divide-y divide-gray-100">
                    {recordChecklists.map((c) => {
                      const items = c.items || [];
                      const done = items.filter((i) => i.completed).length;
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 break-words text-gray-800">{c.name}</span>
                          <span className={`whitespace-nowrap text-xs ${done === items.length && items.length ? "font-medium text-emerald-600" : "text-gray-500"}`}>{done}/{items.length} done</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </DetailSection>

              <DetailSection title="Documents" action={active && (
                <button type="button" onClick={() => act.requestDocs(rec)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Request documents</button>
              )}>
                {recordDocs.length === 0 ? <p className="text-sm text-gray-400">No documents requested.</p> : (
                  <ul className="divide-y divide-gray-100">
                    {recordDocs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 break-words text-gray-800">{d.title}</span>
                        <StatusPill tone={DOC_STATUS[d.status]?.tone || "gray"}>{DOC_STATUS[d.status]?.label || d.status || "—"}</StatusPill>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              <DetailSection title="Pre-boarding tasks">
                {recordTasks.length === 0 ? <p className="mb-2 text-sm text-gray-400">No pre-boarding tasks yet.</p> : (
                  <ul className="mb-3 space-y-2">
                    {recordTasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" aria-label={`Complete ${t.title}`} checked={!!t.completed} disabled={readOnly} onChange={() => act.toggleTask(t)} className="mt-1 h-4 w-4 rounded border-gray-300" />
                        <div className="min-w-0 flex-1 break-words">
                          <span className={t.completed ? "text-gray-400 line-through" : "text-gray-800"}>{t.title}</span>
                          {t.due_date && <span className="ml-2 text-xs text-gray-400">due {formatDate(t.due_date)}</span>}
                          {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                        </div>
                        {!readOnly && (
                          <button type="button" onClick={() => act.deleteTask(t.id)} aria-label={`Delete task ${t.title}`} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!readOnly && (
                  <div className="space-y-2 rounded-xl border border-dashed border-gray-200 p-3">
                    <input type="text" aria-label="New task title" placeholder="New task..." value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                      className={inputCls(false).replace("py-2.5", "py-1.5")} />
                    <input type="text" aria-label="New task description" placeholder="Description (optional)" value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} className={inputCls(false).replace("py-2.5", "py-1.5")} />
                    <div className="flex items-center gap-2">
                      <input type="date" aria-label="New task due date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                        className={`${inputCls(false).replace("py-2.5", "py-1.5")} flex-1`} />
                      <button type="button" onClick={addTask} disabled={!newTask.title.trim()}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        <Plus className="h-3.5 w-3.5" />Add
                      </button>
                    </div>
                  </div>
                )}
              </DetailSection>
            </>
          )
        )}

        {tab === "forms" && (
          <div className="space-y-4">
            <OnboardingFormsReview hireId={rec.id} />
            {rec.employee_id && (
              <ProbationScheduleForm employeeId={rec.employee_id} reviewers={employees} onScheduled={act.refresh} />
            )}
          </div>
        )}

        {tab === "timeline" && (
          <>
            <DetailSection title="Milestones"><Timeline steps={milestones} /></DetailSection>
            <DetailSection title="Activity log">
              {log.loading && <p role="status" className="text-sm text-gray-500">Loading activity...</p>}
              {log.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{log.error}</p>}
              {log.items && !log.items.length && !log.error && <p className="text-sm text-gray-400">No activity recorded for this new hire in the recent log.</p>}
              {log.items?.length > 0 && (
                <Timeline steps={log.items.map((a) => ({ title: a.action, when: a.created_at, note: a.description, done: true }))} />
              )}
            </DetailSection>
          </>
        )}
      </div>

      <DetailSection title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          {!readOnly && <QuickAction icon={Edit2} label="Edit" onClick={() => act.edit(rec)} />}
          {active && <QuickAction icon={Send} label={rec.portal_invited_at ? "Resend link" : "Invite"} title="Send the pre-onboarding portal link" disabled={busy} onClick={() => act.sendLink(rec)} />}
          {!readOnly && rec.status !== "cancelled" && rec.joining_status !== "joined" && (
            <QuickAction icon={UserCheck} label="Mark joined" disabled={busy} onClick={() => act.joining(rec, "joined")} />
          )}
          {rec.status === "in_progress" && <QuickAction icon={CheckCircle2} label="Complete" tone="primary" title="Complete onboarding" onClick={() => act.complete(rec)} />}
          {next.map((ns) => (
            <QuickAction key={ns} icon={transitionIcon(ns)} label={transitionLabel(rec.status, ns)} tone={ns === "cancelled" ? "danger" : ns === "in_progress" ? "primary" : "default"}
              disabled={busy} onClick={() => act.status(rec, ns)} />
          ))}
          {!readOnly && <QuickAction icon={Trash2} label="Delete" tone="danger" onClick={() => act.remove(rec)} />}
        </div>
      </DetailSection>
    </DetailPanel>
  );
}

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function NewHires() {
  const insights = useInsights("onboarding");
  const [records, setRecords] = useState([]);
  const [departmentList, setDepartmentList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState({});
  const [docs, setDocs] = useState({});
  const [checklists, setChecklists] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [joiningStatusFilter, setJoiningStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formFor, setFormFor] = useState(null); // null = closed, {} = new, {record} = edit
  const [detailId, setDetailId] = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [links, setLinks] = useState({});
  const [docRequest, setDocRequest] = useState(null); // { record, categories: [] }
  const [completion, setCompletion] = useState(null); // { record, progress, loading, error, submitting }

  const flash = (msg) => { setError(null); setSuccess(msg); };
  const fail = (err, fallback) => { setSuccess(null); setError(err?.message || fallback); };

  const fetchRecords = async (acceptedOfferOnly = !showAllRecords) => {
    try {
      const data = await getOnboardingRecords({ accepted_offer_only: acceptedOfferOnly });
      setRecords(asList(data));
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Failed to load onboarding records");
    }
  };
  // after any change: the list and the insight figures (KPIs, stage counts, per-hire progress)
  const refresh = async () => { await fetchRecords(); insights.reload(); };

  const setView = async (all) => {
    if (all === showAllRecords) return;
    setShowAllRecords(all);
    setCurrentPage(1);
    await fetchRecords(!all);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [, deps, emps] = await Promise.allSettled([
        fetchRecords(),
        getDepartments(),
        getEmployees({ per_page: 200, include_all_roles: true, status: "active" }),
      ]);
      if (!mounted) return;
      if (deps.status === "fulfilled") {
        const d = deps.value?.data?.data || deps.value?.data || deps.value || [];
        setDepartmentList(asList(d));
      }
      if (emps.status === "fulfilled") setEmployees(asList(emps.value));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = async (recordId) => {
    try {
      const data = await getOnboardingTasks(recordId);
      setTasks((prev) => ({ ...prev, [recordId]: asList(data) }));
    } catch {
      setTasks((prev) => ({ ...prev, [recordId]: [] }));
    }
  };

  const fetchPanel = async (recordId) => {
    setPanelLoading(true);
    const [, d, c] = await Promise.allSettled([
      fetchTasks(recordId),
      getOnboardingDocuments(recordId),
      getOnboardingChecklistAssignments(recordId),
    ]);
    setDocs((prev) => ({ ...prev, [recordId]: d.status === "fulfilled" ? asList(d.value) : [] }));
    setChecklists((prev) => ({ ...prev, [recordId]: c.status === "fulfilled" ? asList(c.value) : [] }));
    setPanelLoading(false);
  };

  const openDetail = (id) => {
    if (detailId === id) return;
    setDetailId(id);
    fetchPanel(id);
  };

  // all departments for the form; the filter only offers the ones present in the loaded list
  const departments = useMemo(() => {
    if (departmentList.length) return departmentList.map((d) => ({ id: d.id, name: d.name || d.department_name }));
    const seen = new Set();
    const depts = [];
    records.forEach((r) => {
      if (r.department_id && !seen.has(r.department_id)) {
        seen.add(r.department_id);
        depts.push({ id: r.department_id, name: r.department_name || "" });
      }
    });
    return depts;
  }, [departmentList, records]);

  const filterOptions = useMemo(() => {
    const dept = new Map(), mgr = new Map(), months = new Set();
    records.forEach((r) => {
      if (r.department_id) dept.set(String(r.department_id), r.department_name || departments.find((d) => d.id === r.department_id)?.name || `Dept #${r.department_id}`);
      if (r.manager_id) mgr.set(String(r.manager_id), r.manager_name || `Employee #${r.manager_id}`);
      const m = monthKey(r.joining_date);
      if (m) months.add(m);
    });
    const sorted = (map) => [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    return {
      departments: sorted(dept),
      managers: sorted(mgr),
      months: [...months].sort().map((m) => ({ value: m, label: monthLabel(m) })),
    };
  }, [records, departments]);

  const baseFiltered = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.candidate_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.position?.toLowerCase().includes(q));
    }
    if (departmentFilter) result = result.filter((r) => String(r.department_id) === departmentFilter);
    if (managerFilter) result = result.filter((r) => String(r.manager_id) === managerFilter);
    if (monthFilter) result = result.filter((r) => monthKey(r.joining_date) === monthFilter);
    if (joiningStatusFilter) result = result.filter((r) => (r.joining_status || "not_joined") === joiningStatusFilter);
    return result;
  }, [records, search, departmentFilter, managerFilter, monthFilter, joiningStatusFilter]);

  const filtered = useMemo(() => (statusFilter ? baseFiltered.filter((r) => r.status === statusFilter) : baseFiltered), [baseFiltered, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const f = (setter) => (v) => { setter(v); setCurrentPage(1); };

  const submitForm = async (formData) => {
    const editId = formFor?.record?.id;
    const payload = {
      candidate_name: formData.candidate_name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || null,
      position: formData.position.trim(),
      department_id: formData.department_id ? Number(formData.department_id) : null,
      manager_id: formData.manager_id ? Number(formData.manager_id) : null,
      joining_date: formData.joining_date || null,
      notes: formData.notes.trim() || null,
      employment_type: formData.employment_type || null,
    };
    if (editId) {
      await updateOnboardingRecord(editId, payload);
      flash(`${payload.candidate_name} updated.`);
    } else {
      await createOnboardingRecord({ ...payload, status: formData.status, start_onboarding: formData.start_onboarding });
      flash(formData.start_onboarding
        ? `${payload.candidate_name} added. Onboarding started and the pre-onboarding link was emailed.`
        : `${payload.candidate_name} added.`);
    }
    setFormFor(null);
    await refresh();
  };

  const handleStatusChange = async (record, newStatus) => {
    if (newStatus === "cancelled" && !window.confirm(`Cancel onboarding for ${record.candidate_name}?`)) return;
    setBusyId(record.id);
    try {
      await updateOnboardingRecord(record.id, { status: newStatus });
      flash(`${record.candidate_name} moved to ${statusLabel(newStatus)}.`);
      await refresh();
    } catch (err) {
      fail(err, "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleJoiningStatusChange = async (record, value) => {
    setBusyId(record.id);
    try {
      await updateOnboardingRecord(record.id, { joining_status: value });
      flash(`Joining status for ${record.candidate_name} updated.`);
      await refresh();
    } catch (err) {
      fail(err, "Failed to update joining status");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`Delete the onboarding record for ${record.candidate_name}?`)) return;
    try {
      await deleteOnboardingRecord(record.id);
      if (detailId === record.id) setDetailId(null);
      flash(`${record.candidate_name} deleted.`);
      await refresh();
    } catch (err) {
      fail(err, "Failed to delete record");
    }
  };

  const handleSendLink = async (record) => {
    setBusyId(record.id);
    try {
      const res = await sendOnboardingPortalInvite(record.id);
      setLinks((prev) => ({ ...prev, [record.id]: res }));
      if (res?.email_sent) flash(`Pre-onboarding link emailed to ${record.email}.`);
      else flash("Pre-onboarding link created, but the email could not be sent. Copy the link in the details panel and share it.");
      openDetail(record.id);
      await refresh();
    } catch (err) {
      fail(err, "Failed to send the pre-onboarding link");
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (url) => {
    if (await copyText(url)) flash("Link copied.");
    else fail(null, "Could not copy automatically. Select the link and copy it.");
  };

  const submitDocRequest = async () => {
    if (!docRequest?.categories.length) return;
    const { record, categories } = docRequest;
    setDocRequest({ ...docRequest, submitting: true });
    try {
      await requestOnboardingDocuments(record.id, categories);
      setDocRequest(null);
      flash(`${categories.length} document(s) requested from ${record.candidate_name}. They have been emailed.`);
      if (detailId === record.id) fetchPanel(record.id);
      insights.reload();
    } catch (err) {
      setDocRequest(null);
      fail(err, "Failed to request documents");
    }
  };

  const openCompletion = async (record) => {
    setCompletion({ record, progress: null, loading: true, error: null, submitting: false });
    try {
      const progress = await getOnboardingProgress(record.id);
      setCompletion((c) => c && { ...c, progress, loading: false });
    } catch (err) {
      setCompletion((c) => c && { ...c, loading: false, error: err.message || "Failed to load progress" });
    }
  };

  const submitCompletion = async (force) => {
    const { record } = completion;
    const msg = force
      ? `Complete onboarding for ${record.candidate_name} even though some items are open? This creates their employee account.`
      : `Complete onboarding for ${record.candidate_name}? This creates their employee account and emails the login details.`;
    if (!window.confirm(msg)) return;
    setCompletion((c) => ({ ...c, submitting: true, error: null }));
    try {
      await updateOnboardingRecord(record.id, force ? { status: "completed", force_complete: true } : { status: "completed" });
      setCompletion(null);
      flash(`Onboarding completed for ${record.candidate_name}. Their employee account was created and the login details were emailed to ${record.email}.`);
      await refresh();
    } catch (err) {
      setCompletion((c) => c && { ...c, submitting: false, error: err.message || "Failed to complete onboarding" });
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await updateOnboardingTask(task.id, { completed: !task.completed });
      if (detailId) fetchTasks(detailId);
      insights.reload();
    } catch (err) {
      fail(err, "Failed to update task");
    }
  };

  const handleAddTask = async (recordId, newTask) => {
    if (!newTask.title.trim()) return false;
    try {
      await createOnboardingTask({
        onboarding_new_hire_id: recordId,
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        due_date: newTask.due_date || null,
      });
      flash("Task added.");
      fetchTasks(recordId);
      insights.reload();
      return true;
    } catch (err) {
      fail(err, "Failed to add task");
      return false;
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteOnboardingTask(taskId);
      if (detailId) fetchTasks(detailId);
      insights.reload();
    } catch (err) {
      fail(err, "Failed to delete task");
    }
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = ["Candidate Name", "Email", "Phone", "Position", "Department", "Manager", "Employment Type", "Status", "Joining Date", "Joining Status", "Notes"];
      const rows = filtered.map((r) => [
        r.candidate_name || "", r.email || "", r.phone || "", r.position || "", r.department_name || "", r.manager_name || "",
        EMPLOYMENT_TYPES.find((t) => t.value === r.employment_type)?.label || "", statusLabel(r.status) || "", r.joining_date || "",
        joiningMeta(r.joining_status).label, r.notes || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `new-hires-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err, "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const act = {
    edit: (record) => setFormFor({ record }),
    status: handleStatusChange,
    joining: handleJoiningStatusChange,
    complete: openCompletion,
    remove: handleDelete,
    sendLink: handleSendLink,
    copy: handleCopy,
    requestDocs: (record) => setDocRequest({ record, categories: [] }),
    toggleTask: handleToggleTask,
    addTask: handleAddTask,
    deleteTask: handleDeleteTask,
    refresh,
  };

  const menuItems = (r) => {
    const completed = r.status === "completed";
    const active = ACTIVE_STATUSES.includes(r.status);
    const next = (STATUS_FLOW[r.status] || []).filter((s) => s !== "completed");
    return [
      !completed && { label: "Edit", icon: Edit2, onClick: () => act.edit(r) },
      active && { label: r.portal_invited_at ? "Resend pre-onboarding link" : "Send pre-onboarding link", icon: Send, onClick: () => handleSendLink(r) },
      active && { label: "Request documents", icon: FileText, onClick: () => act.requestDocs(r) },
      !completed && r.status !== "cancelled" && r.joining_status !== "joined" && { label: "Mark joined", icon: UserCheck, onClick: () => handleJoiningStatusChange(r, "joined") },
      !completed && r.status !== "cancelled" && r.joining_status !== "no_show" && { label: "Mark no-show", icon: UserX, onClick: () => handleJoiningStatusChange(r, "no_show") },
      r.status === "in_progress" && { label: "Complete onboarding", icon: CheckCircle2, onClick: () => openCompletion(r) },
      ...next.map((ns) => ({ label: transitionLabel(r.status, ns), icon: transitionIcon(ns), danger: ns === "cancelled", onClick: () => handleStatusChange(r, ns) })),
      !completed && { label: "Delete", icon: Trash2, danger: true, onClick: () => handleDelete(r) },
    ].filter(Boolean);
  };

  const layoutProps = {
    title: "New Hires",
    subtitle: "Accepted-offer candidates and their onboarding progress. Switch to All Onboarding to view other records.",
  };

  if (loading && records.length === 0) {
    return (
      <OnboardingLayout {...layoutProps}>
        <div role="status" className="flex items-center justify-center gap-3 py-20 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />Loading new hires...
        </div>
      </OnboardingLayout>
    );
  }

  const ins = insights.data;
  const kpis = ins?.kpis || {};
  const progressMap = ins?.progress || {};
  const progressOf = (id) => progressMap[String(id)] ?? progressMap[id] ?? null;

  // status chips: the insight stages (org-wide) match the "All Onboarding" list; the accepted-offers view counts what it shows
  const localCounts = {};
  baseFiltered.forEach((r) => { localCounts[r.status] = (localCounts[r.status] || 0) + 1; });
  const filtersOn = !!(search.trim() || departmentFilter || managerFilter || monthFilter || joiningStatusFilter);
  const useStages = showAllRecords && !filtersOn && Array.isArray(ins?.stages);
  const stageTabs = (Array.isArray(ins?.stages) ? ins.stages : STATUS_OPTIONS.filter((s) => s.value !== "pre_joining").map((s) => ({ key: s.value, label: s.label })))
    .map((s) => ({ value: s.key, label: s.label, count: useStages ? s.count : localCounts[s.key] || 0 }));
  // pre-joining is a real status the insight stages leave out; offer its chip only when such records are loaded
  if (records.some((r) => r.status === "pre_joining")) {
    const at = stageTabs.findIndex((t) => t.value === "in_progress");
    stageTabs.splice(at < 0 ? stageTabs.length : at, 0, { value: "pre_joining", label: "Pre-joining", count: localCounts.pre_joining || 0 });
  }
  const tabs = [{ value: "", label: "All", count: baseFiltered.length }, ...stageTabs];

  const detail = records.find((r) => r.id === detailId) || null;
  const progress = completion?.progress;
  const columns = [
    { label: "New Hire" }, { label: "Position" }, { label: "Department", className: "hidden md:table-cell" }, { label: "Manager", className: "hidden lg:table-cell" },
    { label: "Joining Date" }, { label: "Status" }, { label: "Checklist" }, { label: "Alerts" }, { label: "Actions", className: "text-right" },
  ];
  const fmtPct = (v) => `${v}%`;

  return (
    <OnboardingLayout {...layoutProps}
      actions={<>
        <SecondaryButton icon={Download} onClick={handleExport} disabled={exporting || filtered.length === 0}>{exporting ? "Exporting..." : "Export CSV"}</SecondaryButton>
        {showAllRecords && <PrimaryButton icon={Plus} onClick={() => setFormFor({})}>New Onboarding</PrimaryButton>}
      </>}>
      <div className="space-y-6">
        {(error || loadError) && (
          <div role="alert" className="flex items-start gap-2 break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0 flex-1">{error || loadError}</span>
            <button type="button" onClick={() => { setError(null); setLoadError(null); }} aria-label="Dismiss error" className="-m-1 shrink-0 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}
        {success && (
          <div role="status" className="flex items-start gap-2 break-words rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0 flex-1">{success}</span>
            <button type="button" onClick={() => setSuccess(null)} aria-label="Dismiss message" className="-m-1 shrink-0 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}

        <KpiGrid cols={6}>
          <KpiCard label="Active New Hires" icon={UserPlus} tone="blue" kpi={kpis.active_new_hires} loading={insights.loading} />
          <KpiCard label="Joining This Month" icon={CalendarDays} tone="violet" kpi={kpis.joining_this_month} loading={insights.loading} />
          <KpiCard label="Pre-boarding Tasks Open" icon={ClipboardList} tone="amber" kpi={kpis.preboarding_open} loading={insights.loading} />
          <KpiCard label="Documents Pending" icon={FileClock} tone="pink" kpi={kpis.documents_pending} loading={insights.loading} />
          <KpiCard label="Checklist Completion" icon={ListChecks} tone="teal" kpi={kpis.checklist_completion} format={fmtPct} loading={insights.loading} />
          <KpiCard label="Completed This Month" icon={CheckCircle2} tone="green" kpi={kpis.completed} loading={insights.loading} />
        </KpiGrid>
        {insights.error && <p className="text-xs text-gray-400">Summary figures are unavailable right now: {insights.error}</p>}

        <WithDetail detail={detail && (
          <HireDetail rec={detail} progress={progressOf(detail.id)} link={links[detail.id]} busy={busyId === detail.id} employees={employees} act={act}
            panel={{ loading: panelLoading, tasks: tasks[detail.id], docs: docs[detail.id], checklists: checklists[detail.id] }}
            onClose={() => setDetailId(null)} />
        )}>
          <Card bodyClass="p-0">
            <div className="space-y-4 p-4 sm:p-5">
              <UnderlineTabs label="Records shown" value={showAllRecords ? "all" : "accepted"} onChange={(v) => setView(v === "all")}
                tabs={[{ value: "accepted", label: "Accepted Offers" }, { value: "all", label: "All Onboarding" }]} />
              <ChipTabs label="New hire status" value={statusFilter} onChange={f(setStatusFilter)} tabs={tabs} />
              <div className="flex flex-wrap items-end gap-3">
                <SearchInput value={search} onChange={f(setSearch)} placeholder="Search by name, email, position..." label="Search new hires" />
                <FilterSelect label="Department" allLabel="All Departments" value={departmentFilter} onChange={f(setDepartmentFilter)} options={filterOptions.departments} />
                <FilterSelect label="Manager" allLabel="All Managers" value={managerFilter} onChange={f(setManagerFilter)} options={filterOptions.managers} />
                <FilterSelect label="Joining month" allLabel="All Months" value={monthFilter} onChange={f(setMonthFilter)} options={filterOptions.months} />
                <FilterSelect label="Joining status" allLabel="All Joining Status" value={joiningStatusFilter} onChange={f(setJoiningStatusFilter)}
                  options={JOINING_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))} />
              </div>
            </div>
            <Table columns={columns}
              empty={filtered.length === 0 && (
                <EmptyState icon={UserPlus} title={records.length === 0 ? (showAllRecords ? "No new hire records yet." : "No candidates have accepted an offer yet.") : "No records match your search."}>
                  {records.length === 0 && !showAllRecords ? "Switch to All Onboarding to see every onboarding record." : records.length ? "Try a different filter." : null}
                </EmptyState>
              )}>
              {paginated.map((r) => {
                const p = progressOf(r.id);
                const isActive = detailId === r.id;
                const rel = joiningRelative(r.joining_date);
                const canStart = ["offer_accepted", "pre_joining"].includes(r.status);
                return (
                  <tr key={r.id} onClick={() => openDetail(r.id)} tabIndex={0} aria-selected={isActive}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) openDetail(r.id); }}
                    className={`cursor-pointer focus:outline-none focus-visible:bg-blue-50/60 ${isActive ? "bg-blue-50/60" : "hover:bg-gray-50"}`}>
                    <td className={`${td} min-w-[13rem]`}><PersonCell name={r.candidate_name} sub={r.email} /></td>
                    <td className={td}>
                      <p className="break-words text-gray-800">{r.position || "—"}</p>
                      {r.employment_type && <p className="text-xs text-gray-500">{employmentLabel(r.employment_type)}</p>}
                    </td>
                    <td className={`${td} hidden md:table-cell`}>{r.department_name || "—"}</td>
                    <td className={`${td} hidden lg:table-cell`}>
                      {r.manager_name ? <span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={r.manager_name} size="xs" />{r.manager_name}</span> : "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <p>{r.joining_date ? formatDate(r.joining_date) : "—"}</p>
                      <p className="text-xs text-gray-500">{[rel, r.joining_status && r.joining_status !== "not_joined" ? joiningMeta(r.joining_status).label : ""].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className={td}><HireStatus status={r.status} /></td>
                    <td className={td}><ProgressBar progress={p} name={r.candidate_name} /></td>
                    <td className={td}><Alerts items={alertsFor(r, p)} /></td>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                        {canStart && (
                          <button type="button" disabled={busyId === r.id} onClick={() => handleStatusChange(r, "in_progress")}
                            aria-label={`Start onboarding for ${r.candidate_name}`}
                            className="whitespace-nowrap rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50">
                            {busyId === r.id ? "Starting…" : "Start Onboarding"}
                          </button>
                        )}
                        <RowMenu name={r.candidate_name} busy={busyId === r.id} onView={() => openDetail(r.id)} items={menuItems(r)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {filtered.length > 0 && (
              <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onPage={setCurrentPage} onPageSize={(n) => { setPageSize(n); setCurrentPage(1); }} />
            )}
          </Card>
        </WithDetail>
      </div>

      {formFor && (
        <NewHireFormPanel editRecord={formFor.record || null} departments={departments} employees={employees}
          onClose={() => setFormFor(null)} onSubmit={submitForm} />
      )}

      {docRequest && (
        <Dialog id="doc-request-title" title="Request documents" busy={docRequest.submitting} onClose={() => setDocRequest(null)}
          footer={<>
            <SecondaryButton onClick={() => setDocRequest(null)} disabled={docRequest.submitting}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitDocRequest} disabled={!docRequest.categories.length || docRequest.submitting}>{docRequest.submitting ? "Requesting..." : "Request"}</PrimaryButton>
          </>}>
          <p className="break-words text-sm text-gray-500">Choose what {docRequest.record.candidate_name} should upload. They will be emailed.</p>
          <div className="space-y-2">
            {DOCUMENT_CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={docRequest.categories.includes(c.value)}
                  onChange={(e) => setDocRequest({
                    ...docRequest,
                    categories: e.target.checked ? [...docRequest.categories, c.value] : docRequest.categories.filter((v) => v !== c.value),
                  })} />
                {c.label}
              </label>
            ))}
          </div>
        </Dialog>
      )}

      {completion && (
        <Dialog id="completion-title" title="Complete onboarding" busy={completion.submitting} onClose={() => setCompletion(null)}
          footer={<>
            <SecondaryButton onClick={() => setCompletion(null)} disabled={completion.submitting}>Close</SecondaryButton>
            {!completion.loading && (progress?.blockers?.length > 0 || !progress ? (
              <button type="button" onClick={() => submitCompletion(true)} disabled={completion.submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50">
                {completion.submitting ? "Completing..." : "Complete anyway"}
              </button>
            ) : (
              <button type="button" onClick={() => submitCompletion(false)} disabled={completion.submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {completion.submitting ? "Completing..." : "Complete onboarding"}
              </button>
            ))}
          </>}>
          <p className="break-words text-sm text-gray-600">
            Completing creates the employee account for <span className="font-medium">{completion.record.candidate_name}</span> and emails the login details to {completion.record.email}.
          </p>
          {completion.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">{completion.error}</div>}
          {completion.loading ? <p role="status" className="text-sm text-gray-400">Checking progress...</p> : progress && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Checklist" value={`${progress.checklist_done}/${progress.checklist_total}`} />
                <Stat label="Docs approved" value={`${progress.documents_approved}/${progress.documents_total}`} />
                <Stat label="Orientation" value={`${progress.orientation_attended}/${progress.orientation_sessions}`} />
              </div>
              {progress.blockers?.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p className="mb-1 font-medium">Not ready yet:</p>
                  <ul className="list-disc space-y-0.5 pl-5">{progress.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              ) : <p className="text-sm text-emerald-700">Everything required is done.</p>}
            </>
          )}
        </Dialog>
      )}
    </OnboardingLayout>
  );
}
