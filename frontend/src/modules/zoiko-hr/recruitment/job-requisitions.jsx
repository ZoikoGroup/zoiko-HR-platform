import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Plus, Briefcase, FileClock, Users, UserCheck, PauseCircle, MoreHorizontal, Eye, Edit2, Send, XCircle, Trash2, ShieldCheck,
  AlertCircle, CheckCircle2, X, Loader2, Building2, MapPin, UserRound, Flag, CalendarDays, Wallet, Download, Pause, Play, ThumbsDown,
  Search, FileText,
} from "lucide-react";
import {
  getRequisitions, createRequisition, updateRequisition, deleteRequisition, approveRequisition, rejectRequisition, submitRequisition,
  holdRequisition, resumeRequisition, closeRequisition, getCandidates,
} from "../../../service/hrService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { getRequisitionAuthorization } from "../../../service/recruitmentDocumentsService";
import { getEmployees } from "../../../service/employee";
import {
  RecruitmentLayout, PrimaryButton, SecondaryButton, QuickAction, KpiCard, KpiGrid, Card, StatusPill, Avatar, SearchInput, FilterSelect,
  UnderlineTabs, ChipTabs, Table, td, EmptyState, Pagination, DetailPanel, WithDetail, DetailSection, relativeTime, shortDate, money, useInsights,
} from "./ui";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try { return formatDateUtil(dateStr); }
  catch { return dateStr; }
}

const STATUS = {
  draft: { label: "Draft", tone: "gray" },
  pending: { label: "Pending Approval", tone: "amber" },
  open: { label: "Open", tone: "green" },
  on_hold: { label: "On Hold", tone: "violet" },
  closed: { label: "Closed", tone: "red" },
};
const PRIORITY = {
  low: { label: "Low", tone: "gray" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};
const STATUS_TABS = [
  { value: "", label: "All", key: "all" },
  { value: "draft", label: "Drafts", key: "draft" },
  { value: "pending", label: "Pending Approval", key: "pending" },
  { value: "open", label: "Open", key: "open" },
  { value: "on_hold", label: "On Hold", key: "on_hold" },
  { value: "closed", label: "Closed", key: "closed" },
];
const EMPTY_FORM = { title: "", department: "", location: "", openings: 1, priority: "medium", description: "", requirements: "",
  hiring_manager_id: "", employment_type: "", budget_min: "", budget_max: "", currency: "", target_start_date: "" };
// the employment types the requisition API accepts (input choices, not displayed data)
const EMPLOYMENT_TYPES = [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Fixed-term / contract"],
  ["internship", "Internship"], ["freelance", "Freelance"]];
const personName = (e) => e.full_name || e.fullName || `${e.first_name || e.firstName || ""} ${e.last_name || e.lastName || ""}`.trim() || e.email;
const humanize = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
const reqCode = (r) => `REQ-${String(r.id).padStart(4, "0")}`;

function RequisitionStatus({ status }) {
  const s = STATUS[status] || { label: humanize(status) || "—", tone: "gray" };
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

function ageDays(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/** Which workflow actions a requisition allows in its current status (the backend enforces the same transitions). */
function allowed(r) {
  return {
    submit: r.status === "draft",
    approve: r.status === "draft" || r.status === "pending",
    reject: r.status === "draft" || r.status === "pending",
    hold: r.status === "open",
    resume: r.status === "on_hold",
    close: r.status === "open" || r.status === "on_hold",
    edit: r.status !== "closed",
    remove: !r.candidate_count,
  };
}

/** "…" row menu, rendered fixed so the table's horizontal scroll container doesn't clip it. */
function RowMenu({ requisition, busy, onView, items }) {
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
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Actions for ${requisition.title}`} onClick={toggle}
        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && (
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg">
          <button type="button" role="menuitem" onClick={run(onView)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
            <Eye className="h-4 w-4 text-gray-400" /> View details
          </button>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" title={it.title} disabled={busy} onClick={run(it.onClick)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40 ${it.danger ? "text-rose-600" : "text-gray-700"}`}>
              <it.icon className={`h-4 w-4 ${it.danger ? "text-rose-500" : "text-gray-400"}`} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
            {s.when && <p className="text-xs text-gray-500">{formatDate(s.when)}{relativeTime(s.when) ? ` · ${relativeTime(s.when)}` : ""}</p>}
            {s.note && <p className="mt-1 break-words text-xs text-gray-600">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RequisitionDetail({ r, managerName, onClose, onEdit, onAuthorization, actions, busy }) {
  const [tab, setTab] = useState("overview");
  const [fullDesc, setFullDesc] = useState(false);
  const [cands, setCands] = useState({ items: null, loading: false, error: "" });
  useEffect(() => { setTab("overview"); setFullDesc(false); setCands({ items: null, loading: false, error: "" }); }, [r.id]);
  useEffect(() => {
    if (tab !== "candidates" || cands.items || cands.loading) return;
    let live = true;
    setCands({ items: null, loading: true, error: "" });
    getCandidates({ requisition_id: r.id, per_page: 50 })
      .then((res) => live && setCands({ items: Array.isArray(res) ? res : res?.items || res?.data || [], loading: false, error: "" }))
      .catch((e) => live && setCands({ items: [], loading: false, error: e?.message || "Candidates could not be loaded." }));
    return () => { live = false; };
  }, [tab, r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const can = allowed(r);
  const pr = PRIORITY[r.priority] || PRIORITY.medium;
  const subParts = [r.employment_type && humanize(r.employment_type), r.department].filter(Boolean);
  const desc = r.description || "";
  const longDesc = desc.length > 220;
  const bMin = r.budget_min != null ? Number(r.budget_min) : null;
  const bMax = r.budget_max != null ? Number(r.budget_max) : null;
  const budgetText = bMin != null && bMax != null ? `${money(bMin, r.currency)} – ${money(bMax, r.currency)}`
    : bMin != null ? `From ${money(bMin, r.currency)}` : bMax != null ? `Up to ${money(bMax, r.currency)}` : null;
  const openings = r.openings || 0;
  const costText = openings && (bMin != null || bMax != null)
    ? (bMin != null && bMax != null && bMin !== bMax ? `${money(bMin * openings, r.currency)} – ${money(bMax * openings, r.currency)}` : money((bMax ?? bMin) * openings, r.currency))
    : null;

  const approval = [
    { title: "Requisition created", when: r.created_at, done: true },
    { title: r.status === "draft" ? "Not yet submitted for approval" : "Submitted for approval", done: r.status !== "draft" },
    r.status === "pending" ? { title: "Awaiting an organization admin's decision" }
      : r.status === "draft" ? { title: "Approval decision", note: "Waiting for the draft to be submitted" }
      : ["open", "on_hold"].includes(r.status) ? { title: "Approved", when: r.decided_at, done: true, note: r.decision_comment }
      : { title: r.decided_at ? "Decision recorded, requisition now closed" : "Closed", when: r.decided_at, done: true, note: r.decision_comment },
  ];
  const activity = [
    { title: "Created", when: r.created_at, done: true },
    r.decided_at && { title: "Approval decision", when: r.decided_at, done: true, note: r.decision_comment },
    r.updated_at && r.updated_at !== r.created_at && { title: `Last updated · now ${STATUS[r.status]?.label || humanize(r.status)}`, when: r.updated_at, done: true },
  ].filter(Boolean);

  const header = (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">{reqCode(r)}</span>
        <RequisitionStatus status={r.status} />
      </div>
      <h2 className="mt-1.5 break-words text-lg font-bold text-gray-900">{r.title}</h2>
      {subParts.length > 0 && <p className="text-sm text-gray-500">{subParts.join(" · ")}</p>}
    </div>
  );

  return (
    <DetailPanel title={`Requisition ${r.title}`} header={header} onClose={onClose}>
      <UnderlineTabs label="Requisition details" value={tab} onChange={setTab}
        tabs={[{ value: "overview", label: "Overview" }, { value: "approval", label: "Approval Chain" },
          { value: "candidates", label: `Candidates (${r.candidate_count ?? 0})` }, { value: "activity", label: "Activity" }]} />
      <div className="mt-4">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 p-4">
              <InfoItem icon={Building2} label="Department">{r.department || "—"}</InfoItem>
              <InfoItem icon={MapPin} label="Location">{r.location || "—"}</InfoItem>
              <InfoItem icon={UserRound} label="Hiring Manager">{managerName || "—"}</InfoItem>
              <InfoItem icon={Users} label="Openings">{r.openings ?? "—"}{r.filled ? <span className="ml-1 text-xs font-normal text-gray-500">({r.filled} filled)</span> : null}</InfoItem>
              <InfoItem icon={Flag} label="Priority"><StatusPill tone={pr.tone}>{pr.label}</StatusPill></InfoItem>
              <InfoItem icon={CalendarDays} label="Target Start Date">{r.target_start_date ? shortDate(r.target_start_date) : "—"}</InfoItem>
            </div>
            <DetailSection title="Job Description">
              {desc ? (
                <>
                  <p className="whitespace-pre-line break-words text-sm text-gray-600">{fullDesc || !longDesc ? desc : `${desc.slice(0, 220).trimEnd()}…`}</p>
                  {(longDesc || r.requirements) && (
                    <button type="button" onClick={() => setFullDesc((v) => !v)} className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                      {fullDesc ? "Show less" : "View full description →"}
                    </button>
                  )}
                </>
              ) : <p className="text-sm text-gray-400">No description provided.</p>}
              {fullDesc && r.requirements && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Requirements</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-600">{r.requirements}</p>
                </div>
              )}
            </DetailSection>
            <DetailSection title="Compensation & Budget">
              <div className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><Wallet className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{budgetText || "—"}</p>
                    <p className="text-xs text-gray-500">{budgetText ? `Budget range${r.currency ? ` (${r.currency})` : ""}` : "No budget recorded"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
                  <span className="text-gray-500">Budgeted Headcount Cost</span>
                  <span className="font-semibold text-gray-900">{costText || "—"}{costText && <span className="ml-1 text-xs font-normal text-gray-500">({openings} opening{openings === 1 ? "" : "s"})</span>}</span>
                </div>
              </div>
            </DetailSection>
          </>
        )}
        {tab === "approval" && <Timeline steps={approval} />}
        {tab === "candidates" && (
          <div>
            {cands.loading && <p role="status" className="py-6 text-center text-sm text-gray-500">Loading candidates…</p>}
            {cands.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{cands.error}</p>}
            {cands.items && !cands.items.length && !cands.error && <EmptyState icon={Users} title="No candidates yet" />}
            {cands.items?.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {cands.items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{c.name || "—"}</p>
                        {c.email && <p className="truncate text-xs text-gray-500">{c.email}</p>}
                      </div>
                    </div>
                    {c.status && <StatusPill tone="blue">{humanize(c.status)}</StatusPill>}
                  </li>
                ))}
              </ul>
            )}
            <NavLink to={`/zoiko-hr/recruitment/candidates?requisition_id=${r.id}`} className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-800">
              Open in Candidates →
            </NavLink>
          </div>
        )}
        {tab === "activity" && <Timeline steps={activity} />}
      </div>

      <DetailSection title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          <QuickAction icon={Eye} label="View" title="View the hiring authorization record" onClick={() => onAuthorization(r)} />
          {can.edit && <QuickAction icon={Edit2} label="Edit" onClick={() => onEdit(r)} />}
          {can.submit && <QuickAction icon={Send} label="Submit" disabled={busy} onClick={actions.submit} />}
          {can.approve && <QuickAction icon={CheckCircle2} label="Publish" tone="primary" title="Approve and open for candidates" disabled={busy} onClick={actions.approve} />}
          {can.reject && <QuickAction icon={ThumbsDown} label="Reject" tone="danger" disabled={busy} onClick={actions.reject} />}
          {can.hold && <QuickAction icon={Pause} label="Hold" disabled={busy} onClick={actions.hold} />}
          {can.resume && <QuickAction icon={Play} label="Resume" disabled={busy} onClick={actions.resume} />}
          {can.close && <QuickAction icon={XCircle} label="Close" disabled={busy} onClick={actions.close} />}
        </div>
      </DetailSection>
    </DetailPanel>
  );
}

// ── create / edit requisition: right-hand slide-over ────────────────────────────────────────────────────────────────
// Field limits mirror RequisitionCreate / RequisitionUpdate on the backend.
const LIMITS = { title: 200, department: 100, location: 150, description: 10000, requirements: 10000, openings: 1000 };
const FORM_FIELDS = ["title", "department", "employment_type", "priority", "openings", "location", "target_start_date",
  "hiring_manager_id", "budget_min", "budget_max", "currency", "description", "requirements"];
const FIELD_IDS = { title: "req-title", department: "req-department", location: "req-location", openings: "req-openings", priority: "req-priority",
  description: "req-description", requirements: "req-requirements", hiring_manager_id: "req-manager", employment_type: "req-type",
  budget_min: "req-budget-min", budget_max: "req-budget-max", currency: "req-currency", target_start_date: "req-start" };
const inputCls = (bad) => `w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 ${
  bad ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-gray-200 focus:border-blue-400 focus:ring-blue-100"}`;

function formFromRequisition(r) {
  if (!r) return { ...EMPTY_FORM };
  return { title: r.title || "", department: r.department || "", location: r.location || "", openings: r.openings || 1, priority: r.priority || "medium",
    description: r.description || "", requirements: r.requirements || "",
    hiring_manager_id: r.hiring_manager_id ? String(r.hiring_manager_id) : "", employment_type: r.employment_type || "",
    budget_min: r.budget_min ?? "", budget_max: r.budget_max ?? "", currency: r.currency || "", target_start_date: (r.target_start_date || "").slice(0, 10) };
}

/** Client-side checks; returns { field: message } (empty when the form can be sent). */
function validateRequisition(form, filled = 0) {
  const e = {};
  if (!form.title.trim()) e.title = "Give the role a title.";
  else if (form.title.trim().length > LIMITS.title) e.title = `Keep the title within ${LIMITS.title} characters.`;
  if (!form.department.trim()) e.department = "Choose or type the department that is hiring.";
  else if (form.department.trim().length > LIMITS.department) e.department = `Keep the department within ${LIMITS.department} characters.`;
  if (form.location.trim().length > LIMITS.location) e.location = `Keep the location within ${LIMITS.location} characters.`;
  const openings = Number(form.openings);
  if (form.openings === "" || !Number.isInteger(openings) || openings < 1) e.openings = "Openings must be a whole number of at least 1.";
  else if (openings > LIMITS.openings) e.openings = `At most ${LIMITS.openings} openings per requisition.`;
  else if (filled && openings < filled) e.openings = `${filled} position${filled === 1 ? " is" : "s are"} already filled, so openings cannot go below ${filled}.`;
  const bMin = form.budget_min === "" ? null : Number(form.budget_min);
  const bMax = form.budget_max === "" ? null : Number(form.budget_max);
  if (bMin != null && (Number.isNaN(bMin) || bMin < 0)) e.budget_min = "Budget amounts must be positive numbers.";
  if (bMax != null && (Number.isNaN(bMax) || bMax < 0)) e.budget_max = "Budget amounts must be positive numbers.";
  if (!e.budget_min && !e.budget_max && bMin != null && bMax != null && bMin > bMax) e.budget_max = "The budget maximum cannot be below the minimum.";
  if ((bMin != null || bMax != null) && !/^[A-Za-z]{3}$/.test(form.currency.trim())) e.currency = "Give the budget's currency as a 3-letter code, e.g. INR or USD.";
  else if (form.currency.trim() && !/^[A-Za-z]{3}$/.test(form.currency.trim())) e.currency = "Use a 3-letter ISO currency code.";
  if (form.description.length > LIMITS.description) e.description = `Keep the description within ${LIMITS.description.toLocaleString()} characters.`;
  if (form.requirements.length > LIMITS.requirements) e.requirements = `Keep the requirements within ${LIMITS.requirements.toLocaleString()} characters.`;
  return e;
}

/** The request body the requisition API takes (same shape for create and update). */
function requisitionPayload(form) {
  const bMin = form.budget_min === "" ? null : Number(form.budget_min);
  const bMax = form.budget_max === "" ? null : Number(form.budget_max);
  return {
    hiring_manager_id: form.hiring_manager_id ? Number(form.hiring_manager_id) : null,
    employment_type: form.employment_type || null,
    budget_min: bMin,
    budget_max: bMax,
    currency: form.currency.trim() ? form.currency.trim().toUpperCase() : null,
    target_start_date: form.target_start_date || null,
    title: form.title.trim(),
    department: form.department.trim(),
    location: form.location.trim() || null,
    openings: Number(form.openings),
    priority: form.priority,
    description: form.description.trim() || null,
    requirements: form.requirements.trim() || null,
  };
}

/** Plain wording for FastAPI/pydantic validation text. */
function humanizeServerMsg(msg, ctx = {}) {
  const m = String(msg || "").replace(/^Value error,\s*/i, "").trim();
  if (!m) return "This value was not accepted.";
  if (/field required/i.test(m)) return "This field is required.";
  let x = m.match(/at most (\d+) characters?/i);
  if (x) return `Keep this within ${x[1]} characters.`;
  x = m.match(/at least (\d+) characters?/i);
  if (x) return `Enter at least ${x[1]} characters.`;
  x = m.match(/greater than or equal to ([\d.]+)/i);
  if (x) return `Must be ${x[1]} or more.`;
  x = m.match(/less than or equal to ([\d.]+)/i);
  if (x) return `Must be ${x[1]} or less.`;
  if (/valid (integer|number|decimal)/i.test(m)) return "Enter a number.";
  if (/valid date/i.test(m)) return "Enter a valid date.";
  if (/digits/i.test(m)) return ctx?.max_digits ? `Use at most ${ctx.max_digits} digits.` : "That amount has too many digits.";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Field-level messages from an API error, when the API names the field (FastAPI validation `loc`, or a `field` in the detail). */
function serverFieldErrors(err) {
  const out = {};
  for (const v of Array.isArray(err?.validation) ? err.validation : []) {
    const field = [...(v?.loc || [])].reverse().find((p) => FORM_FIELDS.includes(p));
    if (field && !out[field]) out[field] = humanizeServerMsg(v.msg, v.ctx);
  }
  const named = err?.detail?.field;
  if (named && FORM_FIELDS.includes(named) && !out[named]) out[named] = err.detail.message || err.message;
  return out;
}

function Field({ id, label, required, error, hint, counter, children, className = "" }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}{required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {counter}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1 text-xs text-rose-600"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</p>
      ) : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function Counter({ value, max }) {
  const n = String(value || "").length;
  const tone = n > max ? "text-rose-600" : n > max * 0.9 ? "text-amber-600" : "text-gray-400";
  return <span className={`text-xs tabular-nums ${tone}`} aria-live="polite">{n.toLocaleString()} / {max.toLocaleString()}</span>;
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

/** Searchable hiring-manager picker (combobox + listbox) over the organization's active people. */
function ManagerPicker({ value, onChange, people, loading, error, describedBy }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const selected = people.find((p) => String(p.id) === String(value)) || null;
  const q = query.trim().toLowerCase();
  const matches = (q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.sub || "").toLowerCase().includes(q)) : people).slice(0, 50);
  const choose = (p) => { onChange(p ? String(p.id) : ""); setOpen(false); setQuery(""); };
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (matches[active]) choose(matches[active]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(""); }
  };
  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {selected && !open ? <Avatar name={selected.name} size="xs" className="ring-0" /> : <Search className="ml-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />}
        </span>
        <input id="req-manager" role="combobox" aria-expanded={open} aria-controls="req-manager-list" aria-autocomplete="list" autoComplete="off"
          aria-activedescendant={open && matches[active] ? `req-manager-opt-${matches[active].id}` : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          value={open ? query : selected?.name || ""}
          placeholder={loading ? "Loading people…" : selected ? "" : "Search people by name"}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setQuery(""); }, 120)}
          onKeyDown={onKeyDown}
          className={`${inputCls(error)} pl-10 ${selected ? "pr-10" : ""}`} />
        {selected && (
          <button type="button" onClick={() => choose(null)} aria-label="Clear hiring manager"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        )}
      </div>
      {open && (
        <ul id="req-manager-list" ref={listRef} role="listbox" aria-label="Hiring manager"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {loading ? <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading people…</li>
            : matches.length === 0 ? <li className="px-3 py-2.5 text-sm text-gray-500">{people.length ? `No one matches “${query.trim()}”.` : "No active people were found."}</li>
            : matches.map((p, i) => (
              <li key={p.id} id={`req-manager-opt-${p.id}`} data-index={i} role="option" aria-selected={String(p.id) === String(value)}
                onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-blue-50" : ""}`}>
                <Avatar name={p.name} size="sm" className="ring-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                  {p.sub && <span className="block truncate text-xs text-gray-500">{p.sub}</span>}
                </span>
                {String(p.id) === String(value) && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function RequisitionFormPanel({ editItem, people, peopleLoading, departments, locations, currencies, onClose, onSubmit }) {
  const initial = useMemo(() => formFromRequisition(editItem), [editItem]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [banner, setBanner] = useState(null);
  const [savingAs, setSavingAs] = useState(null); // "draft" | "submit" | "update" while a request is in flight
  const [shown, setShown] = useState(false);
  const panelRef = useRef(null);
  const filled = editItem?.filled || 0;
  const saving = savingAs != null;
  const dirty = useMemo(() => FORM_FIELDS.some((k) => String(form[k] ?? "") !== String(initial[k] ?? "")), [form, initial]);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    const next = { ...form, [key]: value };
    setForm(next);
    if (attempted) setErrors(validateRequisition(next, filled));
    else if (errors[key]) setErrors((er) => { const { [key]: _drop, ...rest } = er; return rest; });
  };

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved changes to this requisition?")) return;
    onClose();
  }, [saving, dirty, onClose]);

  // focus in on open, back to the opener on close; lock the page scroll behind the panel
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => document.getElementById("req-title")?.focus(), 60);
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

  const focusFirst = (errs) => {
    const key = FORM_FIELDS.find((k) => errs[k]);
    const el = key && document.getElementById(FIELD_IDS[key]);
    if (el) { el.focus(); el.scrollIntoView?.({ block: "center", behavior: "smooth" }); }
  };

  const save = async (mode) => {
    setBanner(null);
    setAttempted(true);
    const errs = validateRequisition(form, filled);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const n = Object.keys(errs).length;
      setBanner(`${n} field${n === 1 ? " needs" : "s need"} attention before this can be saved.`);
      focusFirst(errs);
      return;
    }
    setSavingAs(mode);
    try {
      await onSubmit(requisitionPayload(form), mode === "submit");
    } catch (err) {
      const fieldErrs = serverFieldErrors(err);
      if (Object.keys(fieldErrs).length) {
        setErrors(fieldErrs);
        setBanner("The server did not accept some values. Check the highlighted fields.");
        focusFirst(fieldErrs);
      } else {
        setBanner(err?.message || "Failed to save requisition.");
      }
      setSavingAs(null);
    }
  };

  const describe = (key, hint) => (errors[key] ? `${FIELD_IDS[key]}-error` : hint ? `${FIELD_IDS[key]}-hint` : undefined);
  const aria = (key, hint) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": describe(key, hint) });

  // live headcount budget = openings × per-year range
  const openingsN = Number(form.openings);
  const bMin = form.budget_min === "" ? null : Number(form.budget_min);
  const bMax = form.budget_max === "" ? null : Number(form.budget_max);
  const cur = /^[A-Za-z]{3}$/.test(form.currency.trim()) ? form.currency.trim().toUpperCase() : "";
  const amount = (n) => (cur ? money(n, cur) : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const okNum = (n) => n != null && !Number.isNaN(n) && n >= 0;
  const haveOpenings = Number.isInteger(openingsN) && openingsN >= 1;
  const totalMin = haveOpenings && okNum(bMin) ? bMin * openingsN : null;
  const totalMax = haveOpenings && okNum(bMax) ? bMax * openingsN : null;
  const headcountText = totalMin != null && totalMax != null
    ? (totalMin === totalMax ? amount(totalMin) : `${amount(totalMin)} – ${amount(totalMax)}`)
    : totalMin != null ? `From ${amount(totalMin)}` : totalMax != null ? `Up to ${amount(totalMax)}` : null;

  const selectedManager = people.find((p) => String(p.id) === String(form.hiring_manager_id));
  const title = editItem ? "Edit requisition" : "New requisition";
  const spin = (mode) => (savingAs === mode ? Loader2 : undefined);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" onClick={requestClose}
        className={`absolute inset-0 bg-[#0A1128]/50 backdrop-blur-[2px] transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="requisition-form-title" aria-describedby="requisition-form-subtitle"
        className={`relative flex h-full w-full flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-out sm:max-w-[640px] sm:rounded-l-3xl sm:overflow-hidden ${shown ? "translate-x-0" : "translate-x-full"}`}>
        {/* sticky header */}
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#0A1128] via-[#0E1734] to-[#111A33] px-5 py-4 text-white sm:px-6 sm:py-5">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:grid" aria-hidden="true">
              {editItem ? <Edit2 className="h-5 w-5 text-blue-300" /> : <Briefcase className="h-5 w-5 text-blue-300" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="requisition-form-title" className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
                {editItem && <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 ring-1 ring-white/15">{reqCode(editItem)}</span>}
                {editItem && <RequisitionStatus status={editItem.status} />}
              </div>
              <p id="requisition-form-subtitle" className="mt-1 text-sm text-slate-300">
                {editItem
                  ? (editItem.title ? `Changes to “${editItem.title}” apply as soon as you update.` : "Changes apply as soon as you update.")
                  : "Describe the position you need to fill. It opens for candidates once an organization admin approves it."}
              </p>
            </div>
            <button type="button" onClick={requestClose} aria-label="Close form" disabled={saving}
              className="-mr-1 rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40"><X className="h-5 w-5" /></button>
          </div>
        </header>

        {/* scrolling body */}
        <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {banner && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{banner}</span>
                <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="-m-1 rounded-lg p-1 text-rose-400 hover:bg-rose-100"><X className="h-4 w-4" /></button>
              </div>
            )}

            <FormSection icon={Briefcase} title="Role" helper="What the position is, who it reports into and how many people you need.">
              <Field id="req-title" label="Title" required error={errors.title} counter={<Counter value={form.title} max={LIMITS.title} />}>
                <input id="req-title" value={form.title} onChange={set("title")} maxLength={LIMITS.title + 50} autoComplete="off"
                  {...aria("title")} className={inputCls(errors.title)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="req-department" label="Department" required error={errors.department}
                  hint={departments.length ? "Pick from the list or type a new one." : undefined}>
                  <input id="req-department" list="req-department-options" value={form.department} onChange={set("department")} autoComplete="off"
                    {...aria("department", departments.length)} className={inputCls(errors.department)} />
                  <datalist id="req-department-options">{departments.map((d) => <option key={d} value={d} />)}</datalist>
                </Field>
                <Field id="req-type" label="Employment type" error={errors.employment_type}>
                  <select id="req-type" value={form.employment_type} onChange={set("employment_type")} {...aria("employment_type")} className={inputCls(errors.employment_type)}>
                    <option value="">Not set</option>
                    {EMPLOYMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field id="req-priority" label="Priority" error={errors.priority}>
                  <select id="req-priority" value={form.priority} onChange={set("priority")} {...aria("priority")} className={inputCls(errors.priority)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </Field>
                <Field id="req-openings" label={`Openings${filled ? ` (${filled} filled)` : ""}`} required error={errors.openings}
                  hint={filled ? `Cannot go below the ${filled} already filled.` : undefined}>
                  <input id="req-openings" type="number" inputMode="numeric" min={Math.max(1, filled)} max={LIMITS.openings} step="1" value={form.openings}
                    onChange={set("openings")} {...aria("openings", filled)} className={inputCls(errors.openings)} />
                </Field>
              </div>
            </FormSection>

            <FormSection icon={MapPin} title="Location & timing" helper="Where the hire will work and when you would like them to start.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="req-location" label="Location" error={errors.location}
                  hint={locations.length ? "Pick a location already in use or type a new one." : undefined}>
                  <input id="req-location" list="req-location-options" value={form.location} onChange={set("location")} autoComplete="off"
                    {...aria("location", locations.length)} className={inputCls(errors.location)} />
                  <datalist id="req-location-options">{locations.map((l) => <option key={l} value={l} />)}</datalist>
                </Field>
                <Field id="req-start" label="Target start date" error={errors.target_start_date}>
                  <input id="req-start" type="date" value={form.target_start_date} onChange={set("target_start_date")}
                    {...aria("target_start_date")} className={inputCls(errors.target_start_date)} />
                </Field>
              </div>
            </FormSection>

            <FormSection icon={UserRound} title="Hiring team" helper="The person who owns this hire and signs off on candidates.">
              <Field id="req-manager" label="Hiring manager" error={errors.hiring_manager_id}
                hint={selectedManager ? undefined : "Optional. Search the organization's active people."}>
                <ManagerPicker value={form.hiring_manager_id} onChange={set("hiring_manager_id")} people={people} loading={peopleLoading}
                  error={errors.hiring_manager_id} describedBy={describe("hiring_manager_id", !selectedManager)} />
              </Field>
              {selectedManager && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                  <Avatar name={selectedManager.name} size="md" className="ring-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{selectedManager.name}</p>
                    <p className="truncate text-xs text-gray-500">{selectedManager.sub || "Hiring manager"}</p>
                  </div>
                  <StatusPill tone="blue" icon={UserCheck}>Hiring manager</StatusPill>
                </div>
              )}
            </FormSection>

            <FormSection icon={Wallet} title="Budget" helper="Yearly pay range per hire. Leave blank if the budget is not set yet.">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_120px]">
                <Field id="req-budget-min" label="Budget from (per year)" error={errors.budget_min}>
                  <input id="req-budget-min" type="number" inputMode="decimal" min="0" step="any" value={form.budget_min} onChange={set("budget_min")}
                    {...aria("budget_min")} className={inputCls(errors.budget_min)} />
                </Field>
                <Field id="req-budget-max" label="Budget to (per year)" error={errors.budget_max}>
                  <input id="req-budget-max" type="number" inputMode="decimal" min="0" step="any" value={form.budget_max} onChange={set("budget_max")}
                    {...aria("budget_max")} className={inputCls(errors.budget_max)} />
                </Field>
                <Field id="req-currency" label="Currency" error={errors.currency} required={form.budget_min !== "" || form.budget_max !== ""} className="col-span-2 sm:col-span-1">
                  <input id="req-currency" list={currencies.length ? "req-currency-options" : undefined} maxLength={3} value={form.currency}
                    onChange={(e) => set("currency")(e.target.value.toUpperCase())} placeholder="ISO code" autoComplete="off"
                    {...aria("currency")} className={`${inputCls(errors.currency)} uppercase`} />
                  {currencies.length > 0 && <datalist id="req-currency-options">{currencies.map((c) => <option key={c} value={c} />)}</datalist>}
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-gray-200" aria-live="polite">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Headcount budget</p>
                  <p className="text-xs text-gray-500">{haveOpenings ? `${openingsN} opening${openingsN === 1 ? "" : "s"} × yearly range` : "Openings × yearly range"}</p>
                </div>
                <p className={`text-right text-sm font-semibold tabular-nums ${headcountText ? "text-gray-900" : "text-gray-400"}`}>
                  {headcountText ? <>{headcountText}{!cur && <span className="block text-xs font-normal text-amber-600">Add a currency</span>}</> : "Enter a range to see the total"}
                </p>
              </div>
            </FormSection>

            <FormSection icon={FileText} title="Description" helper="Shown to candidates on the posting. Be specific about the work and what success looks like.">
              <Field id="req-description" label="Description" error={errors.description} counter={<Counter value={form.description} max={LIMITS.description} />}>
                <textarea id="req-description" value={form.description} onChange={set("description")} rows={6}
                  {...aria("description")} className={`${inputCls(errors.description)} resize-y leading-relaxed`} />
              </Field>
              <Field id="req-requirements" label="Requirements" error={errors.requirements} counter={<Counter value={form.requirements} max={LIMITS.requirements} />}>
                <textarea id="req-requirements" value={form.requirements} onChange={set("requirements")} rows={5}
                  {...aria("requirements")} className={`${inputCls(errors.requirements)} resize-y leading-relaxed`} />
              </Field>
            </FormSection>
          </div>

          {/* sticky footer */}
          <footer className="shrink-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                {dirty ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />Unsaved changes</span>
                  : <><span className="text-rose-500" aria-hidden="true">*</span> Required fields</>}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <SecondaryButton onClick={requestClose} disabled={saving}>Cancel</SecondaryButton>
                {editItem ? (
                  <PrimaryButton disabled={saving} onClick={() => save("update")} icon={spin("update")} className={savingAs === "update" ? "[&>svg]:animate-spin" : ""}>Update</PrimaryButton>
                ) : (
                  <>
                    <SecondaryButton disabled={saving} onClick={() => save("draft")} icon={spin("draft")} className={savingAs === "draft" ? "[&>svg]:animate-spin" : ""}>Save as draft</SecondaryButton>
                    <PrimaryButton disabled={saving} onClick={() => save("submit")} icon={spin("submit")} className={savingAs === "submit" ? "[&>svg]:animate-spin" : ""}>Submit for approval</PrimaryButton>
                  </>
                )}
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default function JobRequisitions() {
  const insights = useInsights("requisitions");
  const ins = insights.data;
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [orgDepartments, setOrgDepartments] = useState([]);
  const loadPeople = () => {
    if (people.length || peopleLoading) return;
    setPeopleLoading(true);
    getEmployees({ per_page: 200, include_all_roles: true, status: "active" })
      .then((d) => setPeople((Array.isArray(d) ? d : d?.items || []).map((e) => ({ id: e.id, name: personName(e),
        sub: [e.job_title || e.jobTitle, e.department?.name || e.department_name || e.departmentName].filter(Boolean).join(" · ") }))
        .filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setPeople([]))
      .finally(() => setPeopleLoading(false));
  };
  // The organization's real departments, as suggestions (loaded lazily so the page works where hrService lacks the call).
  const loadDepartments = () => {
    if (orgDepartments.length) return;
    import("../../../service/hrService")
      .then((m) => (typeof m.getDepartments === "function" ? m.getDepartments() : null))
      .then((res) => {
        const raw = res?.data?.data ?? res?.data?.items ?? res?.data ?? res ?? [];
        const list = (Array.isArray(raw) ? raw : raw?.items || [])
          .filter((d) => d && d.is_active !== false && d.status !== "inactive")
          .map((d) => (typeof d === "string" ? d : d.name || d.department_name || d.title)).filter(Boolean);
        setOrgDepartments(list);
      })
      .catch(() => setOrgDepartments([]));
  };
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [authorizationFor, setAuthorizationFor] = useState(null);
  const [authorizationData, setAuthorizationData] = useState(null);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [authorizationError, setAuthorizationError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRequisitions({ per_page: 100 }).then((reqs) => {
      const list = Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || [];
      setRequisitions(list);
    }).catch((err) => {
      console.error("Requisitions load error:", err);
      setError(err.message || "Failed to load requisitions data.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); insights.reload(); };

  const managerNames = useMemo(() => Object.fromEntries((ins?.hiring_managers || []).map((m) => [String(m.id), m.name])), [ins]);
  const depts = ins?.departments?.length ? ins.departments : [...new Set(requisitions.map((r) => r.department).filter(Boolean))].sort();
  const locs = ins?.locations?.length ? ins.locations : [...new Set(requisitions.map((r) => r.location).filter(Boolean))].sort();
  const managers = (ins?.hiring_managers || []).map((m) => ({ value: String(m.id), label: m.name }));
  const counts = ins?.status_counts;
  // Filter options come from the data: statuses the organization actually has, priorities present on loaded requisitions.
  const statusOptions = [...new Set([...Object.keys(counts || {}).filter((k) => k !== "all" && counts[k] > 0), ...requisitions.map((r) => r.status)].filter(Boolean))]
    .map((v) => ({ value: v, label: STATUS[v]?.label || humanize(v) }));
  const priorityOptions = [...new Set(requisitions.map((r) => r.priority || "medium"))]
    .sort((a, b) => Object.keys(PRIORITY).indexOf(a) - Object.keys(PRIORITY).indexOf(b))
    .map((v) => ({ value: v, label: PRIORITY[v]?.label || humanize(v) }));

  const filteredReqs = requisitions.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !r.title?.toLowerCase().includes(q) && !r.department?.toLowerCase().includes(q) && !reqCode(r).toLowerCase().includes(q)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (deptFilter && r.department !== deptFilter) return false;
    if (locFilter && r.location !== locFilter) return false;
    if (managerFilter && String(r.hiring_manager_id ?? "") !== managerFilter) return false;
    if (priorityFilter && (r.priority || "medium") !== priorityFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredReqs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filteredReqs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const detail = requisitions.find((r) => r.id === detailId) || null;
  const f = (setter) => (v) => { setter(v); setPage(1); };

  const openCreate = () => { setEditItem(null); loadPeople(); loadDepartments(); setShowModal(true); };
  const openEdit = (r) => { setEditItem(r); loadPeople(); loadDepartments(); setShowModal(true); };

  // Suggestions for the form: only values the organization really has (departments, requisitions, insights).
  const uniqSorted = (xs) => [...new Map(xs.filter(Boolean).map((x) => [String(x).trim().toLowerCase(), String(x).trim()])).values()]
    .filter(Boolean).sort((a, b) => a.localeCompare(b));
  const deptSuggestions = useMemo(() => uniqSorted([...orgDepartments, ...(ins?.departments || []), ...requisitions.map((r) => r.department)]),
    [orgDepartments, ins, requisitions]);
  const locSuggestions = useMemo(() => uniqSorted([...(ins?.locations || []), ...requisitions.map((r) => r.location)]), [ins, requisitions]);
  const currencySuggestions = useMemo(() => uniqSorted(requisitions.map((r) => r.currency && String(r.currency).toUpperCase())), [requisitions]);
  // The current hiring manager stays pickable even when they are not in the active-people list.
  const formPeople = useMemo(() => {
    const id = editItem?.hiring_manager_id;
    if (!id || people.some((p) => String(p.id) === String(id))) return people;
    const name = editItem.hiring_manager_name || managerNames[String(id)];
    return name ? [{ id, name, sub: "" }, ...people] : people;
  }, [people, editItem, managerNames]);

  // submitForApproval: create as "pending" (admins are emailed) instead of a draft.
  // The panel validates and builds the payload; errors are rethrown so it can show them beside the fields.
  const handleSave = async (payload, submitForApproval = false) => {
    if (editItem) {
      await updateRequisition(editItem.id, payload);
      setNotice("Requisition updated.");
    } else {
      await createRequisition({ ...payload, status: submitForApproval ? "pending" : "draft" });
      setNotice(submitForApproval ? "Requisition submitted. Organization admins were emailed for approval." : "Requisition saved as a draft.");
    }
    setShowModal(false);
    refresh();
  };

  const act = async (r, fn, ok, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(r.id);
    setActionError(null);
    try {
      await fn(r.id);
      setNotice(ok);
      if (fn === deleteRequisition && detailId === r.id) setDetailId(null);
      refresh();
    } catch (err) {
      setActionError(err.message || "The action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (r) => ({
    submit: () => act(r, submitRequisition, "Submitted for approval. Admins were emailed."),
    approve: () => act(r, approveRequisition, "Requisition approved and open for candidates."),
    reject: () => act(r, rejectRequisition, "Requisition rejected.", "Reject this requisition?"),
    hold: () => act(r, holdRequisition, "Requisition put on hold."),
    resume: () => act(r, resumeRequisition, "Requisition reopened."),
    close: () => act(r, closeRequisition, "Requisition closed.", "Close this requisition? It will stop accepting candidates."),
    remove: () => act(r, deleteRequisition, "Requisition deleted.", "Delete this requisition permanently?"),
  });

  const menuItems = (r) => {
    const can = allowed(r);
    const a = actionsFor(r);
    return [
      { label: "Authorization", icon: ShieldCheck, onClick: () => showAuthorization(r) },
      can.submit && { label: "Submit", icon: Send, onClick: a.submit },
      can.approve && { label: "Approve", icon: CheckCircle2, onClick: a.approve },
      can.reject && { label: "Reject", icon: ThumbsDown, onClick: a.reject, danger: true },
      can.hold && { label: "Hold", icon: Pause, onClick: a.hold },
      can.resume && { label: "Resume", icon: Play, onClick: a.resume },
      can.close && { label: "Close", icon: XCircle, onClick: a.close },
      can.edit && { label: "Edit", title: "Edit", icon: Edit2, onClick: () => openEdit(r) },
      can.remove && { label: "Delete", title: "Delete", icon: Trash2, onClick: a.remove, danger: true },
    ].filter(Boolean);
  };

  const showAuthorization = async (requisition) => {
    setAuthorizationFor(requisition);
    setAuthorizationData(null);
    setAuthorizationError("");
    setAuthorizationBusy(true);
    try {
      setAuthorizationData(await getRequisitionAuthorization(requisition.id));
    } catch (e) {
      setAuthorizationError(e?.message || "Authorization record could not be loaded.");
    } finally {
      setAuthorizationBusy(false);
    }
  };

  // Exports the ticked rows when any are selected, otherwise everything matching the current filters.
  const exportCsv = () => {
    const source = selected.size ? filteredReqs.filter((r) => selected.has(r.id)) : filteredReqs;
    const headers = ["Requisition ID", "Title", "Department", "Hiring Manager", "Location", "Status", "Priority", "Openings", "Filled", "Candidates", "Created"];
    const rows = source.map((r) => [reqCode(r), r.title, r.department, managerNames[String(r.hiring_manager_id)] || "", r.location, r.status, r.priority, r.openings, r.filled || 0, r.candidate_count || 0, formatDate(r.created_at)]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "requisitions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const pageIds = paged.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id)));
    return n;
  });
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const layoutProps = {
    title: "Job Requisitions",
    subtitle: "Create, approve, publish, and track hiring requests across the organization.",
  };

  if (loading && requisitions.length === 0) return <RecruitmentLayout {...layoutProps}><div className="p-6 text-gray-400">Loading...</div></RecruitmentLayout>;
  if (error && requisitions.length === 0) return (
    <RecruitmentLayout {...layoutProps}>
      <div className="p-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-600"><AlertCircle className="h-5 w-5" />{error}</div>
        <div className="mt-4"><PrimaryButton onClick={load}>Try Again</PrimaryButton></div>
      </div>
    </RecruitmentLayout>
  );

  const kpis = ins?.kpis || {};
  const columns = [
    { label: <input type="checkbox" aria-label="Select all requisitions on this page" checked={allOnPage} onChange={togglePage} className="h-4 w-4 rounded border-gray-300" />, className: "w-10" },
    { label: "Requisition ID" }, { label: "Job Title" }, { label: "Department" }, { label: "Hiring Manager" }, { label: "Location", className: "hidden md:table-cell" },
    { label: "Openings" }, { label: "Candidates" }, { label: "Status" }, { label: "Age", className: "hidden xl:table-cell" },
    { label: "Created", className: "hidden 2xl:table-cell" }, { label: "Actions", className: "text-right" },
  ];

  return (
    <RecruitmentLayout {...layoutProps}
      actions={<>
        <SecondaryButton icon={Download} onClick={exportCsv}>Export CSV</SecondaryButton>
        <PrimaryButton icon={Plus} onClick={openCreate}>New Requisition</PrimaryButton>
      </>}>
      <div className="space-y-6">
        {actionError && (
          <div role="alert" className="flex items-center gap-2 break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
            <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-center gap-2 break-words rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
            <button onClick={() => setNotice(null)} aria-label="Dismiss message" className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}

        <KpiGrid cols={5}>
          <KpiCard label="Open Requisitions" icon={Briefcase} tone="blue" kpi={kpis.open} loading={insights.loading} />
          <KpiCard label="Pending Approval" icon={FileClock} tone="amber" kpi={kpis.pending_approval} loading={insights.loading} />
          <KpiCard label="Positions to Fill" icon={Users} tone="violet" kpi={kpis.positions_to_fill} loading={insights.loading} />
          <KpiCard label="Filled This Month" icon={UserCheck} tone="green" kpi={kpis.filled_this_month} loading={insights.loading} />
          <KpiCard label="On Hold" icon={PauseCircle} tone="pink" kpi={kpis.on_hold} loading={insights.loading} />
        </KpiGrid>
        {insights.error && <p className="text-xs text-gray-400">Summary figures are unavailable right now: {insights.error}</p>}

        <WithDetail detail={detail && (
          <RequisitionDetail r={detail} managerName={managerNames[String(detail.hiring_manager_id)]} busy={busyId === detail.id}
            onClose={() => setDetailId(null)} onEdit={openEdit} onAuthorization={showAuthorization} actions={actionsFor(detail)} />
        )}>
          <Card bodyClass="p-0">
            <div className="space-y-4 p-4 sm:p-5">
              <ChipTabs label="Requisition status" value={statusFilter} onChange={f(setStatusFilter)}
                tabs={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, count: counts ? counts[t.key] ?? 0 : undefined }))} />
              <div className="flex flex-wrap items-end gap-3">
                <SearchInput value={search} onChange={f(setSearch)} placeholder="Search requisitions by title, ID, or department…" label="Search requisitions" />
                <FilterSelect label="Department" allLabel="All Departments" value={deptFilter} onChange={f(setDeptFilter)} options={depts} />
                <FilterSelect label="Hiring Manager" allLabel="All Hiring Managers" value={managerFilter} onChange={f(setManagerFilter)} options={managers} />
                <FilterSelect label="Location" allLabel="All Locations" value={locFilter} onChange={f(setLocFilter)} options={locs} />
                <FilterSelect label="Status" allLabel="All Statuses" value={statusFilter} onChange={f(setStatusFilter)} options={statusOptions} />
                <FilterSelect label="Priority" allLabel="All Priorities" value={priorityFilter} onChange={f(setPriorityFilter)} options={priorityOptions} />
              </div>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  {selected.size} selected
                  <button type="button" onClick={exportCsv} className="font-medium hover:underline">Export selected</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="font-medium hover:underline">Clear selection</button>
                </div>
              )}
            </div>
            <Table columns={columns}
              empty={paged.length === 0 && <EmptyState icon={Briefcase} title="No requisitions found">Try a different filter, or create a new requisition.</EmptyState>}>
              {paged.map((r) => {
                const pr = PRIORITY[r.priority] || PRIORITY.medium;
                const manager = managerNames[String(r.hiring_manager_id)];
                const age = ageDays(r.created_at);
                const active = detailId === r.id;
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} tabIndex={0} aria-selected={active}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setDetailId(r.id); }}
                    className={`cursor-pointer focus:outline-none focus-visible:bg-blue-50/60 ${active ? "bg-blue-50/60" : "hover:bg-gray-50"}`}>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="h-4 w-4 rounded border-gray-300" />
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs text-gray-600`}>{reqCode(r)}</td>
                    <td className={`${td} min-w-[11rem]`}>
                      <p className="break-words font-medium text-blue-700">{r.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        <span className={`font-medium ${pr.tone === "red" ? "text-rose-600" : pr.tone === "amber" ? "text-amber-600" : ""}`}>{pr.label} priority</span>
                        {r.employment_type && <span>· {humanize(r.employment_type)}</span>}
                      </p>
                    </td>
                    <td className={td}>{r.department || "—"}</td>
                    <td className={td}>
                      {manager ? <span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={manager} size="xs" />{manager}</span> : "—"}
                    </td>
                    <td className={`${td} hidden md:table-cell`}>{r.location || "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>{r.openings ?? "—"}{r.filled ? <span className="text-xs text-gray-400"> ({r.filled} filled)</span> : null}</td>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <NavLink to={`/zoiko-hr/recruitment/candidates?requisition_id=${r.id}`} className="whitespace-nowrap font-medium text-blue-600 hover:text-blue-800">
                        {r.candidate_count ?? 0} candidate{(r.candidate_count ?? 0) === 1 ? "" : "s"}
                      </NavLink>
                    </td>
                    <td className={td}><RequisitionStatus status={r.status} /></td>
                    <td className={`${td} hidden whitespace-nowrap xl:table-cell`}>{age == null ? "—" : `${age} day${age === 1 ? "" : "s"}`}</td>
                    <td className={`${td} hidden whitespace-nowrap text-xs text-gray-500 2xl:table-cell`}>{formatDate(r.created_at)}</td>
                    <td className={td}>
                      <RowMenu requisition={r} busy={busyId === r.id} onView={() => setDetailId(r.id)} items={menuItems(r)} />
                    </td>
                  </tr>
                );
              })}
            </Table>
            {filteredReqs.length > 0 && (
              <>
                <p className="px-4 pt-3 text-xs text-gray-500">
                  Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredReqs.length)} of {filteredReqs.length} requisition{filteredReqs.length === 1 ? "" : "s"}
                </p>
                <Pagination page={safePage} pageSize={pageSize} total={filteredReqs.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
              </>
            )}
          </Card>
        </WithDetail>
      </div>

      {authorizationFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="authorization-title" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="authorization-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><ShieldCheck className="h-5 w-5 text-blue-600" /> Hiring authorization</h2>
                <p className="mt-1 text-sm text-gray-500">{authorizationFor.title} · {authorizationFor.department}</p>
              </div>
              <button type="button" onClick={() => setAuthorizationFor(null)} aria-label="Close authorization record" className="-m-1.5 p-1.5"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            {authorizationBusy && <p role="status" className="py-8 text-center text-sm text-gray-500">Loading authorization record…</p>}
            {authorizationError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{authorizationError}</p>}
            {authorizationData && (
              <>
                <p className="mt-4 text-sm text-gray-600">Requisition status: <strong className="capitalize text-gray-900">{authorizationFor.status?.replace(/_/g, " ")}</strong></p>
                <h3 className="mt-4 text-sm font-semibold text-gray-900">Authorization documents</h3>
                {authorizationData.documents?.length ? (
                  <ul className="mt-2 space-y-2">
                    {authorizationData.documents.map((doc) => (
                      <li key={doc.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-gray-800">{doc.title || doc.document_number || doc.canonical_id}</span>
                          <StatusPill tone="blue">{doc.status?.replace(/_/g, " ")}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{doc.canonical_id}{doc.document_number ? ` · ${doc.document_number}` : ""}{doc.issued_at ? ` · issued ${formatDate(doc.issued_at)}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No authorization record has been issued for this requisition yet.</p>}
                {authorizationData.blocked?.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-amber-800">Record generation blocked</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                      {authorizationData.blocked.map((item, index) => <li key={`${item.canonical_id}-${index}`}>{item.canonical_id}: {(item.reasons || []).join(", ") || item.outcome}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
            <div className="mt-5 flex justify-end"><SecondaryButton onClick={() => setAuthorizationFor(null)}>Close</SecondaryButton></div>
          </section>
        </div>
      )}

      {showModal && (
        <RequisitionFormPanel key={editItem ? `edit-${editItem.id}` : "new"} editItem={editItem} people={formPeople} peopleLoading={peopleLoading}
          departments={deptSuggestions} locations={locSuggestions} currencies={currencySuggestions}
          onClose={() => setShowModal(false)} onSubmit={handleSave} />
      )}
    </RecruitmentLayout>
  );
}
