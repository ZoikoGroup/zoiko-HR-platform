/*
 * Onboarding › Pre-Onboarding — new hires before day one (offer accepted / pre-joining): their pre-onboarding link,
 * requested documents and pre-boarding tasks, in the Recruitment look: KPI row, a "New hires" and a "Tasks" view with
 * filters, a right-hand detail panel per new hire and a slide-over form for adding or editing a task.
 * Numbers are counted from the loaded tasks and documents; the open-task trend and checklist progress come from the
 * onboarding insights.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { AlertCircle, CalendarClock, CalendarPlus, CheckCircle2, ClipboardList, Copy, FileText, Link2, ListChecks, Pencil, Plus,
  RotateCcw, Send, Trash2, UserCheck, UserPlus, UserRoundX, Users, X } from "lucide-react";
import OnboardingLayout from "./OnboardingLayout";
import {
  Card, ChipTabs, DetailPanel, DetailSection, EmptyState, FilterSelect, KpiCard, KpiGrid, PersonCell, PrimaryButton, QuickAction,
  SearchInput, SecondaryButton, SegmentTabs, StatusPill, Table, WithDetail, relativeTime, td, useInsights,
} from "../recruitment/ui";
import {
  getOnboardingRecords, updateOnboardingRecord, getOnboardingTasks, createOnboardingTask, updateOnboardingTask,
  deleteOnboardingTask, getOnboardingDocuments, sendOnboardingPortalInvite, requestOnboardingDocuments,
} from "../../../service/hrService";
import { formatDate, parseDateOnly } from "../../../utils/dateTime";

const PRE_STATUSES = ["offer_accepted", "pre_joining"];

const STATUS_LABELS = {
  offer_accepted: "Offer Accepted",
  pre_joining: "Pre-Joining",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  offer_sent: "Offer Sent",
};
const STATUS_TONE = { offer_accepted: "green", pre_joining: "blue", in_progress: "violet", completed: "teal", cancelled: "gray", offer_sent: "amber" };

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

const DUE_SOON_DAYS = 3;
const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "soon", label: `Due in ${DUE_SOON_DAYS} days` },
  { value: "week", label: "Due in 7 days" },
  { value: "later", label: "Later" },
  { value: "none", label: "No due date" },
];
const VIEWS = [{ value: "hires", label: "New hires", icon: Users }, { value: "tasks", label: "Tasks", icon: ListChecks }];

const asList = (data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const fieldCls = (bad) => `w-full rounded-xl border ${bad ? "border-rose-300" : "border-gray-200"} bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

function docCounts(list) {
  const c = { total: list.length, waiting: 0, review: 0, approved: 0 };
  list.forEach((d) => {
    if (d.status === "approved") c.approved++;
    else if (d.status === "pending") c.review++;
    else c.waiting++; // requested or rejected: the new hire has to upload
  });
  return c;
}

function linkStatus(r) {
  if (!r.portal_invited_at) return { text: "Not sent", cls: "text-gray-400", tone: "gray", short: "Not sent" };
  const expired = r.portal_expires_at && new Date(r.portal_expires_at) < new Date();
  if (expired) return { text: `Sent ${formatDate(r.portal_invited_at)} · expired ${formatDate(r.portal_expires_at)}`, cls: "text-rose-600", tone: "red", short: "Expired" };
  return { text: `Sent ${formatDate(r.portal_invited_at)}${r.portal_expires_at ? ` · valid until ${formatDate(r.portal_expires_at)}` : ""}`, cls: "text-gray-600", tone: "green", short: "Sent" };
}

// ── dates: a due date is a calendar day ─────────────────────────────────────────────────────────────────────────────
function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysUntil(due) {
  const d = parseDateOnly(due) || (due ? new Date(due) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startOfToday()) / 86400000);
}
function dueBucket(task) {
  const n = daysUntil(task.due_date);
  if (n == null) return "none";
  if (task.completed) return "done";
  if (n < 0) return "overdue";
  if (n <= DUE_SOON_DAYS) return "soon";
  if (n <= 7) return "week";
  return "later";
}
function startOfWeek() {
  const d = startOfToday();
  const shift = (d.getDay() + 6) % 7; // Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift);
}

function DuePill({ task }) {
  if (!task.due_date) return <span className="text-gray-400">—</span>;
  const n = daysUntil(task.due_date);
  const date = formatDate(task.due_date);
  if (task.completed || n == null) return <StatusPill tone="gray">{date}</StatusPill>;
  if (n < 0) return <StatusPill tone="red" icon={CalendarClock}>{date} · {-n} day{n === -1 ? "" : "s"} overdue</StatusPill>;
  if (n === 0) return <StatusPill tone="amber" icon={CalendarClock}>Due today</StatusPill>;
  if (n <= DUE_SOON_DAYS) return <StatusPill tone="amber" icon={CalendarClock}>{date} · in {n} day{n === 1 ? "" : "s"}</StatusPill>;
  return <StatusPill tone="gray">{date}</StatusPill>;
}

function TaskProgress({ done, total }) {
  if (!total) return <span className="text-xs text-gray-400">No tasks</span>;
  const pct = Math.round((done * 100) / total);
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-center justify-between text-xs text-gray-600"><span>{done}/{total} done</span><span className="text-gray-400">{pct}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done">
        <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Right-hand slide-over that holds a form. */
function SlideOver({ title, subtitle, icon: Icon, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-[520px] sm:rounded-l-2xl">
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

const EMPTY_TASK_FORM = { title: "", description: "", due_date: "", recordId: "" };

export default function PreOnboarding() {
  const insights = useInsights("onboarding");
  const [allRecords, setAllRecords] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [busyId, setBusyId] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [links, setLinks] = useState({});
  const [docRequest, setDocRequest] = useState(null);
  const [taskForm, setTaskForm] = useState(null);   // { mode: "add"|"edit", task?, ...EMPTY_TASK_FORM, error, saving }

  const [view, setView] = useState("hires");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [taskTab, setTaskTab] = useState("open");
  const [hireFilter, setHireFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");

  const showAction = (type, text) => setActionMsg({ type, text });
  const records = useMemo(() => allRecords.filter((r) => PRE_STATUSES.includes(r.status)), [allRecords]);

  const fetchDocs = async (list) => {
    const results = await Promise.allSettled(list.map((r) => getOnboardingDocuments(r.id)));
    const next = {};
    list.forEach((r, i) => { next[r.id] = results[i].status === "fulfilled" ? asList(results[i].value) : []; });
    setDocs((prev) => ({ ...prev, ...next }));
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      const arr = asList(data);
      setAllRecords(arr);
      setError(null);
      fetchDocs(arr.filter((r) => PRE_STATUSES.includes(r.status)));
    } catch (err) {
      setError(err.message || "Failed to load pre-onboarding records");
    }
  };

  // every pre-boarding task of the organisation (the list the KPIs count)
  const fetchTasks = async () => {
    try {
      const data = await getOnboardingTasks();
      setAllTasks(asList(data));
    } catch (err) {
      showAction("error", err.message || "Failed to load pre-boarding tasks");
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchRecords(), fetchTasks()]);
      setLoading(false);
    })();
  }, []);

  const afterTaskChange = async () => {
    await fetchTasks();
    insights.reload();
  };

  const recordById = (id) => allRecords.find((r) => r.id === id || r.id === Number(id));
  const hireName = (id) => (id ? recordById(id)?.candidate_name || `New hire #${id}` : "");
  const tasksOf = (id) => allTasks.filter((t) => String(t.onboarding_new_hire_id) === String(id));

  const changeStatus = async (record, status, message) => {
    if (status === "cancelled" && !window.confirm(`Cancel onboarding for ${record.candidate_name}?`)) return;
    setBusyId(record.id);
    try {
      await updateOnboardingRecord(record.id, { status });
      showAction("success", message);
      if (selectedId === record.id && !PRE_STATUSES.includes(status)) setSelectedId(null);
      await fetchRecords();
      insights.reload();
    } catch (err) {
      showAction("error", err.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleSendLink = async (record) => {
    setBusyId(record.id);
    try {
      const res = await sendOnboardingPortalInvite(record.id);
      setLinks((prev) => ({ ...prev, [record.id]: res }));
      showAction("success", res?.email_sent
        ? `Pre-onboarding link emailed to ${record.email}.`
        : "Pre-onboarding link created, but the email could not be sent. Copy the link and share it.");
      setSelectedId(record.id);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to send the pre-onboarding link");
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      showAction("success", "Link copied.");
    } catch {
      showAction("error", "Could not copy automatically. Select the link and copy it.");
    }
  };

  const submitDocRequest = async () => {
    if (!docRequest?.categories.length) return;
    const { record, categories } = docRequest;
    setDocRequest({ ...docRequest, submitting: true });
    try {
      await requestOnboardingDocuments(record.id, categories);
      showAction("success", `${categories.length} document(s) requested from ${record.candidate_name}. They have been emailed.`);
      fetchDocs([record]);
      insights.reload();
    } catch (err) {
      showAction("error", err.message || "Failed to request documents");
    } finally {
      setDocRequest(null);
    }
  };

  const handleToggleTask = async (task) => {
    setBusyTaskId(task.id);
    try {
      await updateOnboardingTask(task.id, { completed: !task.completed });
      showAction("success", task.completed ? `"${task.title}" reopened.` : `"${task.title}" completed.`);
      await afterTaskChange();
    } catch (err) {
      showAction("error", err.message || "Failed to update task");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm("Delete this task?")) return;
    setBusyTaskId(task.id);
    try {
      await deleteOnboardingTask(task.id);
      showAction("success", "Task deleted.");
      await afterTaskChange();
    } catch (err) {
      showAction("error", err.message || "Failed to delete task");
    } finally {
      setBusyTaskId(null);
    }
  };

  const openAddTask = (recordId = "") => setTaskForm({ mode: "add", ...EMPTY_TASK_FORM, recordId: recordId ? String(recordId) : "", error: "", saving: false });
  const openEditTask = (task) => setTaskForm({
    mode: "edit", task, title: task.title || "", description: task.description || "", due_date: task.due_date || "",
    recordId: task.onboarding_new_hire_id ? String(task.onboarding_new_hire_id) : "", error: "", saving: false,
  });
  const setTaskField = (key, value) => setTaskForm((f) => ({ ...f, [key]: value, error: "" }));

  const submitTaskForm = async (e) => {
    e.preventDefault();
    const f = taskForm;
    if (!f.title.trim()) { setTaskForm({ ...f, error: "Enter a task title." }); return; }
    if (f.mode === "add" && !f.recordId) { setTaskForm({ ...f, error: "Choose the new hire this task is for." }); return; }
    setTaskForm({ ...f, saving: true, error: "" });
    try {
      if (f.mode === "add") {
        await createOnboardingTask({
          onboarding_new_hire_id: Number(f.recordId),
          title: f.title.trim(),
          description: f.description.trim() || null,
          due_date: f.due_date || null,
        });
        showAction("success", "Task added.");
      } else {
        await updateOnboardingTask(f.task.id, { title: f.title.trim(), description: f.description.trim() || null, due_date: f.due_date || null });
        showAction("success", "Task updated.");
      }
      setTaskForm(null);
      await afterTaskChange();
    } catch (err) {
      setTaskForm((cur) => (cur ? { ...cur, saving: false, error: err.message || "The task could not be saved." } : cur));
    }
  };

  // ── counts (all from loaded rows) ──
  const taskStats = useMemo(() => {
    const weekStart = startOfWeek().getTime();
    const open = allTasks.filter((t) => !t.completed);
    return {
      open: open.length,
      overdue: open.filter((t) => dueBucket(t) === "overdue").length,
      soon: open.filter((t) => dueBucket(t) === "soon").length,
      completed: allTasks.filter((t) => t.completed).length,
      completedWeek: allTasks.filter((t) => t.completed && t.completed_at && new Date(t.completed_at).getTime() >= weekStart).length,
      hiresWithOpen: new Set(open.map((t) => t.onboarding_new_hire_id).filter(Boolean)).size,
    };
  }, [allTasks]);

  const stats = useMemo(() => {
    const s = { total: records.length, offer_accepted: 0, pre_joining: 0, linkSent: 0, toReview: 0 };
    records.forEach((r) => {
      if (s[r.status] !== undefined) s[r.status]++;
      if (r.portal_invited_at) s.linkSent++;
      s.toReview += docCounts(docs[r.id] || []).review;
    });
    return s;
  }, [records, docs]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.candidate_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.position?.toLowerCase().includes(q));
    }
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    return result;
  }, [records, search, statusFilter]);

  const taskHires = useMemo(() => {
    const ids = new Set([...records.map((r) => r.id), ...allTasks.map((t) => t.onboarding_new_hire_id).filter(Boolean)]);
    return [...ids].map((id) => ({ value: String(id), label: hireName(id) })).sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, allTasks, allRecords]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = allTasks.filter((t) => {
      if (taskTab === "open" && t.completed) return false;
      if (taskTab === "overdue" && dueBucket(t) !== "overdue") return false;
      if (taskTab === "completed" && !t.completed) return false;
      if (hireFilter && String(t.onboarding_new_hire_id) !== hireFilter) return false;
      if (dueFilter) {
        const b = dueBucket(t);
        if (dueFilter === "week" ? !["soon", "week"].includes(b) : b !== dueFilter) return false;
      }
      return !q || [t.title, t.description, hireName(t.onboarding_new_hire_id)].some((v) => String(v || "").toLowerCase().includes(q));
    });
    // open first, then by due date (no date last)
    return rows.sort((a, b) => (a.completed - b.completed) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, taskTab, hireFilter, dueFilter, search, allRecords]);

  const k = insights.data?.kpis || {};
  const progress = insights.data?.progress || {};
  const kpiLoading = loading || tasksLoading;
  const openKpi = k.preboarding_open ? { ...k.preboarding_open, value: taskStats.open } : { value: taskStats.open };

  const layout = (body) => (
    <OnboardingLayout title="Pre-Onboarding" subtitle="Track pre-onboarding links, requested documents and pre-joining tasks."
      actions={<PrimaryButton icon={Plus} onClick={() => openAddTask(selectedId || "")}>Add Task</PrimaryButton>}>
      {body}
    </OnboardingLayout>
  );

  if (loading && allRecords.length === 0) {
    return layout(
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading pre-onboarding records...</span>
      </div>
    );
  }

  const selected = records.find((r) => r.id === selectedId) || null;

  // ── detail panel for one new hire ──
  const detail = selected ? (() => {
    const rec = selected;
    const recordTasks = tasksOf(rec.id).slice().sort((a, b) => (a.completed - b.completed) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
    const recordDocs = docs[rec.id] || [];
    const link = links[rec.id];
    const ls = linkStatus(rec);
    const busy = busyId === rec.id;
    const prog = progress[rec.id] || progress[String(rec.id)];
    const done = recordTasks.filter((t) => t.completed).length;
    return (
      <DetailPanel title={`Pre-onboarding for ${rec.candidate_name || "new hire"}`} onClose={() => setSelectedId(null)}
        header={(
          <div>
            <PersonCell name={rec.candidate_name} sub={[rec.position, rec.email].filter(Boolean).join(" · ") || undefined} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={STATUS_TONE[rec.status] || "gray"}>{STATUS_LABELS[rec.status] || rec.status}</StatusPill>
              <span className="text-xs text-gray-500">Joining {rec.joining_date ? formatDate(rec.joining_date) : "—"}</span>
            </div>
          </div>
        )}>
        <DetailSection title="Quick Actions">
          <div className="flex flex-wrap gap-2">
            <QuickAction icon={Send} label={rec.portal_invited_at ? "Resend link" : "Send link"} tone="primary" disabled={busy} onClick={() => handleSendLink(rec)} />
            <QuickAction icon={FileText} label="Request docs" onClick={() => setDocRequest({ record: rec, categories: [] })} />
            <QuickAction icon={Plus} label="Add task" onClick={() => openAddTask(rec.id)} />
            {rec.status === "offer_accepted" && (
              <QuickAction icon={UserCheck} label="Pre-Joining" disabled={busy} onClick={() => changeStatus(rec, "pre_joining", `${rec.candidate_name} moved to Pre-Joining.`)} />
            )}
            <QuickAction icon={UserPlus} label="In Progress" disabled={busy} onClick={() => changeStatus(rec, "in_progress", `${rec.candidate_name} moved to In Progress.`)} />
            <QuickAction icon={UserRoundX} label="Cancel" tone="danger" disabled={busy} onClick={() => changeStatus(rec, "cancelled", `Onboarding cancelled for ${rec.candidate_name}.`)} />
          </div>
        </DetailSection>

        <DetailSection title="Pre-onboarding link">
          <p className={`text-sm ${ls.cls}`}>{ls.text}</p>
          {link?.url && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 break-words text-xs text-gray-500">Link{link.expires_at ? ` (valid until ${formatDate(link.expires_at)})` : ""}:</p>
              <div className="flex items-center gap-2">
                <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Pre-onboarding link"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700" />
                <button type="button" onClick={() => handleCopy(link.url)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <Copy className="h-3.5 w-3.5" />Copy
                </button>
              </div>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Pre-boarding tasks" action={<button type="button" onClick={() => openAddTask(rec.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800">+ Add</button>}>
          <TaskProgress done={done} total={recordTasks.length} />
          {recordTasks.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {recordTasks.map((t) => (
                <li key={t.id} className="group flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-gray-50">
                  <input type="checkbox" checked={!!t.completed} disabled={busyTaskId === t.id} onChange={() => handleToggleTask(t)}
                    aria-label={`${t.completed ? "Reopen" : "Complete"} ${t.title}`} className="mt-1 rounded border-gray-300" />
                  <div className="min-w-0 flex-1 break-words">
                    <p className={`text-sm ${t.completed ? "text-gray-400 line-through" : "text-gray-800"}`}>{t.title}</p>
                    {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                    <div className="mt-1"><DuePill task={t} /></div>
                  </div>
                  <button type="button" onClick={() => openEditTask(t)} aria-label={`Edit ${t.title}`} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => handleDeleteTask(t)} aria-label={`Delete ${t.title}`} className="shrink-0 rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Documents" action={<button type="button" onClick={() => setDocRequest({ record: rec, categories: [] })} className="text-xs font-medium text-blue-600 hover:text-blue-800">Request</button>}>
          {recordDocs.length === 0 ? (
            <p className="text-sm text-gray-500">No documents requested yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recordDocs.map((d) => (
                <li key={d.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-gray-800">{d.title}</span>
                    <StatusPill tone={DOC_STATUS[d.status]?.tone || "gray"}>{DOC_STATUS[d.status]?.label || d.status}</StatusPill>
                  </div>
                  {d.status === "rejected" && d.rejection_reason && <p className="mt-0.5 break-words text-xs text-rose-600">{d.rejection_reason}</p>}
                </li>
              ))}
            </ul>
          )}
          {recordDocs.some((d) => d.status === "pending") && (
            <NavLink to="/zoiko-hr/onboarding/documents" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-800">Review uploads in Documents</NavLink>
          )}
        </DetailSection>

        {prog && prog.items > 0 && (
          <DetailSection title="Onboarding checklist">
            <TaskProgress done={prog.done} total={prog.items} />
            {prog.overdue > 0 && <p className="mt-1 text-xs text-rose-600">{prog.overdue} checklist item{prog.overdue === 1 ? "" : "s"} overdue</p>}
          </DetailSection>
        )}
      </DetailPanel>
    );
  })() : null;

  // ── new hires view ──
  const hiresView = (
    <Card bodyClass="p-0">
      <div className="space-y-4 border-b border-gray-100 px-5 py-4">
        <ChipTabs label="Pre-onboarding stage" value={statusFilter} onChange={setStatusFilter}
          tabs={[{ value: "", label: "All", count: stats.total }, ...PRE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: stats[s] }))]} />
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, position..." label="Search new hires" />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} allLabel="All Statuses"
            options={PRE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        </div>
        <p className="text-xs text-gray-500">
          <Link2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Link sent to {stats.linkSent} of {stats.total}
          <span className="mx-2 text-gray-300">·</span>
          <span className={stats.toReview ? "font-medium text-amber-700" : ""}>{stats.toReview} document{stats.toReview === 1 ? "" : "s"} to review</span>
        </p>
      </div>
      {filteredRecords.length === 0 && !loading ? (
        <EmptyState icon={Users} title={records.length === 0 ? "Nobody is in pre-onboarding right now." : "No records match your search."} />
      ) : (
        <Table columns={[{ label: "New hire" }, { label: "Position", className: "hidden md:table-cell" }, { label: "Status" }, { label: "Joining" },
          { label: "Pre-onboarding Link" }, { label: "Documents" }, { label: "Tasks" }, { label: "Actions", className: "text-right" }]}>
          {filteredRecords.map((r) => {
            const ls = linkStatus(r);
            const dc = docCounts(docs[r.id] || []);
            const rt = tasksOf(r.id);
            const busy = busyId === r.id;
            const isSel = selectedId === r.id;
            const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
            const btn = "whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40";
            const joinIn = daysUntil(r.joining_date);
            return (
              <tr key={r.id} onClick={() => setSelectedId(isSel ? null : r.id)} className={`cursor-pointer transition-colors ${isSel ? "bg-blue-50/60" : "hover:bg-gray-50"}`}>
                <td className={td}>
                  <button type="button" onClick={stop(() => setSelectedId(isSel ? null : r.id))} aria-label="Show details" aria-pressed={isSel} className="block text-left">
                    <PersonCell name={r.candidate_name} sub={r.email} />
                  </button>
                </td>
                <td className={`${td} hidden md:table-cell`}>{r.position || "—"}</td>
                <td className={td}><StatusPill tone={STATUS_TONE[r.status] || "gray"}>{STATUS_LABELS[r.status] || r.status}</StatusPill></td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.joining_date ? (
                    <>
                      <span>{formatDate(r.joining_date)}</span>
                      {joinIn != null && joinIn >= 0 && <p className="text-xs text-gray-400">{joinIn === 0 ? "today" : `in ${joinIn} day${joinIn === 1 ? "" : "s"}`}</p>}
                    </>
                  ) : "—"}
                </td>
                <td className={`${td} min-w-[9rem]`}>
                  <StatusPill tone={ls.tone}>{ls.short}</StatusPill>
                  {r.portal_invited_at && <p className={`mt-1 text-xs ${ls.cls}`} title={ls.text}>{relativeTime(r.portal_invited_at) || formatDate(r.portal_invited_at)}</p>}
                </td>
                <td className={`${td} min-w-[10rem] text-xs`}>
                  {dc.total === 0 ? <span className="text-gray-400">None requested</span> : (
                    <span>
                      {dc.total} requested · {dc.waiting} awaiting upload · <span className={dc.review ? "font-medium text-amber-600" : ""}>{dc.review} to review</span> · <span className="text-emerald-600">{dc.approved} approved</span>
                    </span>
                  )}
                </td>
                <td className={td}><TaskProgress done={rt.filter((t) => t.completed).length} total={rt.length} /></td>
                <td className={`${td} text-right`}>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button type="button" onClick={stop(() => handleSendLink(r))} disabled={busy} className={`${btn} text-blue-600 hover:bg-blue-50`}>
                      {r.portal_invited_at ? "Resend link" : "Send link"}
                    </button>
                    <button type="button" onClick={stop(() => setDocRequest({ record: r, categories: [] }))} className={`${btn} text-blue-600 hover:bg-blue-50`}>Request documents</button>
                    {r.status === "offer_accepted" && (
                      <button type="button" onClick={stop(() => changeStatus(r, "pre_joining", `${r.candidate_name} moved to Pre-Joining.`))} disabled={busy} className={`${btn} text-emerald-700 hover:bg-emerald-50`}>
                        Move to Pre-Joining
                      </button>
                    )}
                    <button type="button" onClick={stop(() => changeStatus(r, "in_progress", `${r.candidate_name} moved to In Progress.`))} disabled={busy} className={`${btn} text-emerald-700 hover:bg-emerald-50`}>
                      Move to In Progress
                    </button>
                    <button type="button" onClick={stop(() => changeStatus(r, "cancelled", `Onboarding cancelled for ${r.candidate_name}.`))} disabled={busy} className={`${btn} text-rose-500 hover:bg-rose-50`}>
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );

  // ── tasks view ──
  const tasksView = (
    <Card bodyClass="p-0">
      <div className="space-y-4 border-b border-gray-100 px-5 py-4">
        <ChipTabs label="Task status" value={taskTab} onChange={setTaskTab} tabs={[
          { value: "open", label: "Open", count: taskStats.open },
          { value: "overdue", label: "Overdue", count: taskStats.overdue },
          { value: "completed", label: "Completed", count: taskStats.completed },
          { value: "all", label: "All", count: allTasks.length },
        ]} />
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search task or new hire…" label="Search tasks" />
          <FilterSelect label="New hire" value={hireFilter} onChange={setHireFilter} allLabel="All new hires" options={taskHires} />
          <FilterSelect label="Due" value={dueFilter} onChange={setDueFilter} allLabel="Any due date" options={DUE_OPTIONS} />
        </div>
      </div>
      {tasksLoading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title={allTasks.length === 0 ? "No pre-boarding tasks yet." : "No tasks match these filters."}>
          {allTasks.length === 0 ? "Add one for a new hire with “Add Task”." : null}
        </EmptyState>
      ) : (
        <Table columns={[{ label: "Task" }, { label: "New hire" }, { label: "Due" }, { label: "Status" }, { label: "Actions", className: "text-right" }]}>
          {filteredTasks.map((t) => {
            const name = hireName(t.onboarding_new_hire_id);
            const rec = recordById(t.onboarding_new_hire_id);
            const inPre = rec && PRE_STATUSES.includes(rec.status);
            const busy = busyTaskId === t.id;
            const btn = "whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40";
            return (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className={`${td} max-w-[22rem]`}>
                  <p className={`break-words font-medium ${t.completed ? "text-gray-400 line-through" : "text-gray-900"}`}>{t.title}</p>
                  {t.description && <p className="break-words text-xs text-gray-500">{t.description}</p>}
                </td>
                <td className={td}>
                  {name ? (
                    inPre ? (
                      <button type="button" onClick={() => { setSelectedId(rec.id); }} className="text-left hover:text-blue-600">
                        <PersonCell name={name} sub={STATUS_LABELS[rec.status]} />
                      </button>
                    ) : <PersonCell name={name} sub={rec ? STATUS_LABELS[rec.status] || rec.status : undefined} />
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className={`${td} whitespace-nowrap`}><DuePill task={t} /></td>
                <td className={td}>
                  {t.completed ? (
                    <>
                      <StatusPill tone="green" icon={CheckCircle2}>Completed</StatusPill>
                      {t.completed_at && <p className="mt-1 text-xs text-gray-400" title={t.completed_at}>{relativeTime(t.completed_at)}</p>}
                    </>
                  ) : <StatusPill tone="blue">Open</StatusPill>}
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button type="button" onClick={() => handleToggleTask(t)} disabled={busy}
                      className={`${btn} inline-flex items-center gap-1 ${t.completed ? "text-gray-600 hover:bg-gray-100" : "text-emerald-700 hover:bg-emerald-50"}`}>
                      {t.completed ? <><RotateCcw className="h-3.5 w-3.5" />Reopen</> : <><CheckCircle2 className="h-3.5 w-3.5" />Complete</>}
                    </button>
                    <button type="button" onClick={() => openEditTask(t)} disabled={busy} className={`${btn} text-blue-600 hover:bg-blue-50`}>Edit</button>
                    <button type="button" onClick={() => handleDeleteTask(t)} disabled={busy} className={`${btn} text-gray-400 hover:bg-rose-50 hover:text-rose-600`}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );

  const taskFormHire = taskForm ? recordById(taskForm.recordId) : null;

  return layout(
    <>
      <div className="space-y-6">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="flex min-w-0 items-start gap-2 break-words"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        {actionMsg.text && (
          <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            actionMsg.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            <span className="min-w-0 break-words">{actionMsg.text}</span>
            <button onClick={() => setActionMsg({ type: "", text: "" })} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold">&times;</button>
          </div>
        )}

        <KpiGrid cols={4}>
          <KpiCard label="Open Pre-boarding Tasks" icon={ListChecks} tone="blue" kpi={openKpi} loading={kpiLoading} />
          <KpiCard label="Overdue Tasks" icon={CalendarClock} tone="red" kpi={{ value: taskStats.overdue }} loading={kpiLoading} />
          <KpiCard label="Completed This Week" icon={CheckCircle2} tone="green" kpi={{ value: taskStats.completedWeek }} loading={kpiLoading} />
          <KpiCard label="New Hires With Open Tasks" icon={Users} tone="violet" kpi={{ value: taskStats.hiresWithOpen }} loading={kpiLoading} />
        </KpiGrid>

        <WithDetail detail={detail}>
          <div className="space-y-4">
            <SegmentTabs label="Pre-onboarding views" value={view} onChange={setView} tabs={VIEWS} />
            {view === "hires" ? hiresView : tasksView}
          </div>
        </WithDetail>
      </div>

      {taskForm && (
        <SlideOver title={taskForm.mode === "add" ? "Add pre-boarding task" : "Edit pre-boarding task"} icon={taskForm.mode === "add" ? CalendarPlus : Pencil}
          subtitle={taskFormHire ? `For ${taskFormHire.candidate_name}` : "Choose the new hire, then describe the task."}
          onClose={() => !taskForm.saving && setTaskForm(null)}>
          <form noValidate onSubmit={submitTaskForm} className="flex min-h-0 flex-1 flex-col">
            <fieldset disabled={taskForm.saving} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              <legend className="sr-only">Task details</legend>
              {taskForm.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-600">{taskForm.error}</div>}
              <div>
                <label htmlFor="pt-hire" className={labelCls}>New hire <span className="text-rose-500">*</span></label>
                <select id="pt-hire" value={taskForm.recordId} disabled={taskForm.mode === "edit"} onChange={(e) => setTaskField("recordId", e.target.value)} className={fieldCls(false)}>
                  <option value="">Choose a new hire...</option>
                  {(taskForm.mode === "edit" && taskFormHire && !PRE_STATUSES.includes(taskFormHire.status) ? [taskFormHire, ...records] : records).map((r) => (
                    <option key={r.id} value={r.id}>{r.candidate_name || `New hire #${r.id}`}{r.position ? ` · ${r.position}` : ""}</option>
                  ))}
                </select>
                {taskForm.mode === "add" && records.length === 0 && <p className="mt-1 text-xs text-gray-500">Nobody is in pre-onboarding right now.</p>}
              </div>
              <div>
                <label htmlFor="pt-title" className={labelCls}>Title <span className="text-rose-500">*</span></label>
                <input id="pt-title" type="text" maxLength={200} value={taskForm.title} placeholder="Add pre-boarding task..."
                  onChange={(e) => setTaskField("title", e.target.value)} className={fieldCls(false)} autoFocus />
              </div>
              <div>
                <label htmlFor="pt-desc" className={labelCls}>Description</label>
                <textarea id="pt-desc" rows={3} value={taskForm.description} placeholder="Description (optional)"
                  onChange={(e) => setTaskField("description", e.target.value)} className={fieldCls(false)} />
              </div>
              <div>
                <label htmlFor="pt-due" className={labelCls}>Due date</label>
                <input id="pt-due" type="date" value={taskForm.due_date} onChange={(e) => setTaskField("due_date", e.target.value)} className={fieldCls(false)} />
                {taskFormHire?.joining_date && <p className="mt-1 text-xs text-gray-500">Joining {formatDate(taskFormHire.joining_date)}.</p>}
              </div>
            </fieldset>
            <SlideOverFooter>
              <SecondaryButton onClick={() => setTaskForm(null)} disabled={taskForm.saving}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={taskForm.saving || !taskForm.title.trim()}>
                {taskForm.saving ? "Saving..." : taskForm.mode === "add" ? "Add" : "Save"}
              </PrimaryButton>
            </SlideOverFooter>
          </form>
        </SlideOver>
      )}

      {docRequest && (
        <SlideOver title="Request documents" icon={FileText} onClose={() => !docRequest.submitting && setDocRequest(null)}
          subtitle={`Choose what ${docRequest.record.candidate_name} should upload. They will be emailed.`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
              <legend className="px-1 text-sm font-medium text-gray-700">Documents to request</legend>
              <div className="space-y-1">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <label key={c.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-gray-700 hover:bg-gray-50">
                    <input type="checkbox" className="rounded border-gray-300" checked={docRequest.categories.includes(c.value)}
                      onChange={(e) => setDocRequest({
                        ...docRequest,
                        categories: e.target.checked ? [...docRequest.categories, c.value] : docRequest.categories.filter((v) => v !== c.value),
                      })} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <SlideOverFooter>
            <SecondaryButton onClick={() => setDocRequest(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitDocRequest} disabled={!docRequest.categories.length || docRequest.submitting}>
              {docRequest.submitting ? "Requesting..." : "Request"}
            </PrimaryButton>
          </SlideOverFooter>
        </SlideOver>
      )}
    </>
  );
}
