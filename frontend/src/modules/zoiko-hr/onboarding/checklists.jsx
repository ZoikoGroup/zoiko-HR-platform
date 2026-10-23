/*
 * Onboarding Checklists — the Onboarding shell with the Recruitment look: KPI row, each new hire's checklists as a card
 * with progress, item rows (owner, due, mandatory / blocked / exception markers, quick complete), templates by category,
 * and slide-over forms for assigning, editing checklists and items, templates and exceptions.
 */
import { useState, useEffect } from "react";
import {
  AlertCircle, AlertTriangle, Ban, CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList, Flag, Layers, ListChecks,
  Loader2, Pencil, Plus, ShieldAlert, Trash2, UserPlus, X,
} from "lucide-react";
import {
  getOnboardingChecklistTemplates,
  createOnboardingChecklistTemplate,
  updateOnboardingChecklistTemplate,
  deleteOnboardingChecklistTemplate,
  getOnboardingChecklistAssignments,
  createOnboardingChecklistAssignment,
  updateOnboardingChecklistAssignment,
  deleteOnboardingChecklistAssignment,
  getOnboardingRecords,
} from "../../../service/hrService";
import { getEmployees } from "../../../service/employee";
import { formatDate } from "../../../utils/dateTime";
import { errorMessage, setChecklistException } from "../../../service/onboardingPrompt2Service";
import {
  Avatar, Card, ChipTabs, EmptyState, FilterSelect, KpiCard, KpiGrid, PersonCell, PrimaryButton, SearchInput, SecondaryButton, StatusPill,
  UnderlineTabs, useInsights,
} from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

const CATEGORIES = ["HR", "IT", "Manager", "Custom"];
const CATEGORY_TONE = { HR: "blue", IT: "green", Manager: "violet", Custom: "amber" };

const CHECKLIST_STATUS = {
  pending: { label: "Pending", tone: "gray" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
};

const INACTIVE_HIRE_STATUSES = ["completed", "cancelled"];

// "Due" in the template editor: a number of days plus a direction, stored as a signed due_offset_days.
const EMPTY_ITEM = { id: undefined, title: "", description: "", assignee_employee_id: "", offsetDays: "", offsetDir: "after" };

export function offsetToForm(offset) {
  if (offset === null || offset === undefined || offset === "") return { offsetDays: "", offsetDir: "after" };
  const n = Number(offset);
  if (n === 0) return { offsetDays: "", offsetDir: "on" };
  return { offsetDays: String(Math.abs(n)), offsetDir: n < 0 ? "before" : "after" };
}

export function formToOffset(item) {
  if (item.offsetDir === "on") return 0;
  const raw = String(item.offsetDays ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return item.offsetDir === "before" ? -n : n;
}

export function describeOffset(offset) {
  if (offset === null || offset === undefined) return "";
  const n = Number(offset);
  if (n === 0) return "On start day";
  const days = `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;
  return n < 0 ? `${days} before start` : `${days} after start`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(item, today = todayIso()) {
  return !item.completed && !!item.due_date && String(item.due_date).slice(0, 10) < today;
}

const employeeName = (e) => e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || e.email || `Employee #${e.id}`;
const daysUntil = (day, today) => Math.round((new Date(`${String(day).slice(0, 10)}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);

// the server updates items by id, so every item goes back with its id each time
const itemPayload = (i) => ({
  id: i.id,
  title: i.title,
  description: i.description ?? null,
  completed: !!i.completed,
  due_offset_days: i.due_offset_days ?? null,
  assignee_employee_id: i.assignee_employee_id ?? null,
  due_date: i.due_date ?? null,
});

const fieldCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

/** Right-hand sheet with the navy header used by the Recruitment forms. */
function SlideOver({ id, icon: Icon = ClipboardCheck, title, subtitle, onClose, footer, children, wide = false, as = "div", onSubmit }) {
  const Body = as;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        className={`relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:rounded-l-2xl ${wide ? "sm:max-w-[720px]" : "sm:max-w-[560px]"}`}>
        <Body className="flex min-h-0 flex-1 flex-col" {...(onSubmit ? { onSubmit, noValidate: true } : {})}>
          <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-4 py-4 text-white sm:rounded-tl-2xl sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15" aria-hidden="true"><Icon className="h-5 w-5 text-blue-300" /></span>
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-title`} className="break-words text-lg font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="truncate text-sm text-slate-300">{subtitle}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:rounded-bl-2xl sm:px-6 sm:py-4">{footer}</footer>
        </Body>
      </div>
    </div>
  );
}

function Section({ children }) {
  return <section className="space-y-4 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">{children}</section>;
}

function FormError({ children }) {
  if (!children) return null;
  return <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{children}</p>;
}

function ProgressBar({ pct, className = "w-24" }) {
  return (
    <span className={`inline-block h-2 shrink-0 overflow-hidden rounded-full bg-gray-100 ${className}`} aria-hidden="true">
      <span className={`block h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function DuePill({ item, today }) {
  if (!item.due_date) return <span className="text-xs text-gray-400">No due date</span>;
  const text = `Due ${formatDate(item.due_date)}`;
  if (item.completed) return <StatusPill tone="gray">{text}</StatusPill>;
  if (isOverdue(item, today)) return <StatusPill tone="red" icon={AlertTriangle}>Overdue · {formatDate(item.due_date)}</StatusPill>;
  const left = daysUntil(item.due_date, today);
  return <StatusPill tone={left <= 3 ? "amber" : "gray"} icon={CalendarClock}>{text}</StatusPill>;
}

export default function OnboardingChecklists() {
  const [activeTab, setActiveTab] = useState("HR");
  const [templates, setTemplates] = useState([]);
  const [allTemplates, setAllTemplates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [view, setView] = useState("hires");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState([{ ...EMPTY_ITEM }]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [assignHire, setAssignHire] = useState("");
  const [assignTemplate, setAssignTemplate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [busyAssignment, setBusyAssignment] = useState(null);

  // edit a hire's checklist (name / description) and add or edit one of its items
  const [checklistEdit, setChecklistEdit] = useState(null);   // { assignment, name, description, error }
  const [itemEdit, setItemEdit] = useState(null);             // { assignment, item|null, title, description, owner, due, error }
  const [savingEdit, setSavingEdit] = useState(false);

  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [collapsedHires, setCollapsedHires] = useState({});
  const [exceptionItem, setExceptionItem] = useState(null);
  const [exceptionForm, setExceptionForm] = useState({ reason: "", owner_id: "", due_date: "", blocked_action: "" });
  const [exceptionError, setExceptionError] = useState("");
  const [savingException, setSavingException] = useState(false);

  const insights = useInsights("onboarding");
  const today = todayIso();

  const showAction = (type, text) => {
    setActionMsg({ type, text });
    if (type === "success") setTimeout(() => setActionMsg((m) => (m.text === text ? { type: "", text: "" } : m)), 4000);
  };

  const fetchTemplates = async () => {
    try {
      const data = await getOnboardingChecklistTemplates(activeTab);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load templates");
      setTemplates([]);
    }
  };

  const fetchAllTemplates = async () => {
    try {
      const data = await getOnboardingChecklistTemplates();
      setAllTemplates(Array.isArray(data) ? data : []);
    } catch {
      setAllTemplates([]);
    }
  };

  const fetchAssignments = async () => {
    try {
      const data = await getOnboardingChecklistAssignments();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load assigned checklists");
      setAssignments([]);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await getEmployees({ per_page: 200, include_all_roles: true, status: "active" });
      setEmployees(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchTemplates(), fetchAllTemplates(), fetchAssignments(), fetchRecords(), fetchEmployees()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const refreshTemplates = () => Promise.all([fetchTemplates(), fetchAllTemplates()]);

  const activeHires = records.filter((r) => !INACTIVE_HIRE_STATUSES.includes(r.status));

  function getRecord(recordId) {
    return records.find((r) => r.id === recordId || r.id === Number(recordId));
  }
  function getRecordName(recordId) {
    const rec = getRecord(recordId);
    return rec ? rec.candidate_name || rec.name || `New hire #${recordId}` : `New hire #${recordId}`;
  }

  const employeeLabel = (id) => {
    const e = employees.find((x) => x.id === Number(id));
    return e ? employeeName(e) : "";
  };

  // replaces one assignment in place after the server answers
  const applyUpdated = async (updated) => {
    if (updated && updated.id) setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    else await fetchAssignments();
    insights.reload();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormItems([{ ...EMPTY_ITEM }]);
    setFormError("");
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormName(template.name || "");
    setFormDescription(template.description || "");
    setFormItems(
      template.items && template.items.length > 0
        ? template.items.map((i) => ({
            id: i.id,
            title: i.title || "",
            description: i.description || "",
            assignee_employee_id: i.assignee_employee_id ? String(i.assignee_employee_id) : "",
            ...offsetToForm(i.due_offset_days),
          }))
        : [{ ...EMPTY_ITEM }]
    );
    setFormError("");
    setShowForm(true);
  };

  const handleAddItem = () => setFormItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const handleRemoveItem = (idx) => setFormItems((prev) => prev.filter((_, i) => i !== idx));
  const handleItemChange = (idx, field, value) => {
    setFormError("");
    setFormItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleSave = async () => {
    if (!formName.trim()) { setFormError("Template name is required."); return; }
    const validItems = formItems.filter((i) => i.title.trim());
    if (validItems.length === 0) { setFormError("Add at least one checklist item."); return; }
    for (const item of validItems) {
      if (item.offsetDir === "on") continue;
      const raw = String(item.offsetDays ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        setFormError(`"${item.title.trim()}": the due offset must be a whole number of days between 0 and 365.`);
        return;
      }
    }
    setSaving(true);
    try {
      const items = validItems.map((i) => {
        const out = {
          title: i.title.trim(),
          description: i.description.trim() || null,
          due_offset_days: formToOffset(i),
          assignee_employee_id: i.assignee_employee_id ? Number(i.assignee_employee_id) : null,
        };
        if (editingTemplate) {
          if (i.id) out.id = i.id;
          out.completed = false;
        }
        return out;
      });
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        category: editingTemplate?.category || activeTab,
        items,
      };
      if (editingTemplate) {
        await updateOnboardingChecklistTemplate(editingTemplate.id, payload);
        showAction("success", "Template updated.");
      } else {
        await createOnboardingChecklistTemplate(payload);
        showAction("success", "Template created.");
      }
      resetForm();
      await refreshTemplates();
    } catch (err) {
      setFormError(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteOnboardingChecklistTemplate(templateId);
      showAction("success", "Template deleted.");
      await refreshTemplates();
    } catch (err) {
      showAction("error", err.message || "Failed to delete template");
    }
  };

  const openAssign = ({ hire = "", template = "" } = {}) => {
    setAssignHire(hire ? String(hire) : "");
    setAssignTemplate(template ? String(template) : "");
    setShowAssign(true);
  };

  const handleAssign = async () => {
    if (!assignHire || !assignTemplate) return;
    setAssigning(true);
    try {
      await createOnboardingChecklistAssignment({
        onboarding_record_id: Number(assignHire),
        template_id: Number(assignTemplate),
      });
      const tpl = allTemplates.find((t) => String(t.id) === String(assignTemplate));
      showAction("success", `${tpl?.name || "Checklist"} assigned to ${getRecordName(Number(assignHire))}. Task owners have been emailed.`);
      setAssignTemplate("");
      setShowAssign(false);
      await fetchAssignments();
      insights.reload();
    } catch (err) {
      showAction("error", err.message || "Failed to assign checklist");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignment) => {
    if (!window.confirm(`Remove "${assignment.name}" from ${getRecordName(assignment.onboarding_new_hire_id)}?`)) return;
    try {
      await deleteOnboardingChecklistAssignment(assignment.id);
      showAction("success", "Checklist removed.");
      await fetchAssignments();
      insights.reload();
    } catch (err) {
      showAction("error", err.message || "Failed to remove checklist");
    }
  };

  const handleToggleItem = async (assignment, itemId) => {
    const items = (assignment.items || []).map((i) => ({ ...itemPayload(i), completed: i.id === itemId ? !i.completed : !!i.completed }));
    setBusyAssignment(assignment.id);
    try {
      await applyUpdated(await updateOnboardingChecklistAssignment(assignment.id, { items }));
    } catch (err) {
      showAction("error", err.message || "Failed to update item");
    } finally {
      setBusyAssignment(null);
    }
  };

  // ── checklist and item slide-overs ──────────────────────────────────────────────────────────────────────────────
  const openChecklistEdit = (assignment) => setChecklistEdit({ assignment, name: assignment.name || "", description: assignment.description || "", error: "" });
  const saveChecklistEdit = async () => {
    const { assignment, name, description } = checklistEdit;
    if (!name.trim()) { setChecklistEdit((c) => ({ ...c, error: "Checklist name is required." })); return; }
    setSavingEdit(true);
    try {
      await applyUpdated(await updateOnboardingChecklistAssignment(assignment.id, { name: name.trim(), description: description.trim() || null }));
      setChecklistEdit(null);
      showAction("success", "Checklist updated.");
    } catch (err) {
      setChecklistEdit((c) => ({ ...c, error: err.message || "The checklist could not be saved." }));
    } finally {
      setSavingEdit(false);
    }
  };

  const openItemEdit = (assignment, item = null) => setItemEdit({
    assignment, item,
    title: item?.title || "",
    description: item?.description || "",
    owner: item?.assignee_employee_id ? String(item.assignee_employee_id) : "",
    due: item?.due_date ? String(item.due_date).slice(0, 10) : "",
    error: "",
  });
  const saveItemEdit = async (remove = false) => {
    const { assignment, item, title, description, owner, due } = itemEdit;
    if (!remove && !title.trim()) { setItemEdit((c) => ({ ...c, error: "Item title is required." })); return; }
    if (remove && !window.confirm(`Remove "${item.title}" from this checklist?`)) return;
    const current = assignment.items || [];
    let items;
    if (remove) {
      items = current.filter((i) => i.id !== item.id).map(itemPayload);
    } else {
      const originalDue = item?.due_date ? String(item.due_date).slice(0, 10) : "";
      const edited = {
        title: title.trim(),
        description: description.trim() || null,
        assignee_employee_id: owner ? Number(owner) : null,
        due_date: due || null,
        // a due date typed here replaces the template's "days from start" rule, which would otherwise win
        due_offset_days: item && due === originalDue ? item.due_offset_days ?? null : null,
      };
      items = item
        ? current.map((i) => (i.id === item.id ? { ...itemPayload(i), ...edited } : itemPayload(i)))
        : [...current.map(itemPayload), { ...edited, completed: false }];
    }
    setSavingEdit(true);
    try {
      await applyUpdated(await updateOnboardingChecklistAssignment(assignment.id, { items }));
      setItemEdit(null);
      showAction("success", remove ? "Item removed." : item ? "Item updated." : "Item added. Its owner has been emailed if one was chosen.");
    } catch (err) {
      setItemEdit((c) => ({ ...c, error: err.message || "The item could not be saved." }));
    } finally {
      setSavingEdit(false);
    }
  };

  const openException = (item) => {
    setExceptionItem(item);
    setExceptionForm({
      reason: item.exception_reason || "",
      owner_id: String(item.exception_owner_id || ""),
      due_date: String(item.exception_due_date || "").slice(0, 10),
      blocked_action: item.blocked_action || "",
    });
    setExceptionError("");
  };

  const saveException = async (event) => {
    event?.preventDefault?.();
    if (!exceptionItem) return;
    setSavingException(true);
    setExceptionError("");
    try {
      const result = await setChecklistException(exceptionItem.id, {
        reason: exceptionForm.reason.trim(),
        owner_id: Number(exceptionForm.owner_id),
        due_date: exceptionForm.due_date,
        blocked_action: exceptionForm.blocked_action.trim() || null,
      });
      setAssignments((current) => current.map((assignment) => ({
        ...assignment,
        items: (assignment.items || []).map((item) => item.id === result.id ? { ...item, ...result } : item),
      })));
      setExceptionItem(null);
      showAction("success", "Checklist exception recorded.");
    } catch (err) {
      setExceptionError(errorMessage(err, "The exception could not be recorded."));
    } finally {
      setSavingException(false);
    }
  };

  const getAssignmentsForTemplate = (templateId) => assignments.filter((a) => a.template_id === templateId);

  const templateAlreadyAssigned = (tplId) =>
    !!assignHire && assignments.some((a) => a.template_id === tplId && String(a.onboarding_new_hire_id) === String(assignHire));

  // ── numbers from the loaded checklists (insights add the completion trend) ──────────────────────────────────────
  const allItems = assignments.flatMap((a) => a.items || []);
  const doneItems = allItems.filter((i) => i.completed).length;
  const overdueItems = allItems.filter((i) => isOverdue(i, today)).length;
  const completedLists = assignments.filter((a) => a.status === "completed").length;
  const openLists = assignments.length - completedLists;
  const completionKpi = { ...(insights.data?.kpis?.checklist_completion || {}), value: allItems.length ? Math.round((doneItems / allItems.length) * 100) : null };

  // assigned checklists grouped by new hire, filtered
  const q = search.trim().toLowerCase();
  const visibleAssignments = assignments.filter((a) => (!statusFilter || a.status === statusFilter)
    && (!q || `${a.name || ""} ${getRecordName(a.onboarding_new_hire_id)}`.toLowerCase().includes(q)));
  const byHire = visibleAssignments.reduce((acc, a) => {
    const key = a.onboarding_new_hire_id ?? "none";
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});
  const hireIds = Object.keys(byHire);

  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, allTemplates.filter((t) => (t.category || "HR") === c).length]));

  const layout = (body) => (
    <OnboardingLayout title="Onboarding Checklists" subtitle="Create checklist templates and track each new hire's onboarding tasks."
      actions={
        <>
          <SecondaryButton icon={Layers} onClick={() => { setView("templates"); resetForm(); setShowForm(true); }}>New Template</SecondaryButton>
          <PrimaryButton icon={UserPlus} onClick={() => openAssign()}>Assign Checklist</PrimaryButton>
        </>
      }>
      {body}
    </OnboardingLayout>
  );

  if (loading && templates.length === 0 && assignments.length === 0) {
    return layout(
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-2xl bg-white" />
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading checklists...</div>
      </div>
    );
  }

  const renderItem = (assn, item, idx) => {
    const owner = item.assignee_name || employeeLabel(item.assignee_employee_id);
    return (
      <li key={item.id ?? `new-${idx}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-50/60 sm:px-5">
        <label className="flex min-w-0 flex-1 basis-full cursor-pointer items-start gap-3 sm:basis-auto sm:min-w-[220px]">
          <input
            type="checkbox"
            checked={!!item.completed}
            disabled={busyAssignment === assn.id}
            onChange={() => handleToggleItem(assn, item.id)}
            aria-label={`Complete ${item.title}`}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
          />
          <span className="min-w-0">
            <span className={`block break-words text-sm ${item.completed ? "text-gray-400 line-through" : "font-medium text-gray-800"}`}>{item.title}</span>
            {item.description && <span className="block break-words text-xs text-gray-500">{item.description}</span>}
          </span>
        </label>
        <span className="flex min-w-0 items-center gap-2" title={owner ? `Owner: ${owner}` : "No owner"}>
          {owner ? <Avatar name={owner} size="xs" /> : <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-gray-100 text-[10px] text-gray-400" aria-hidden="true">—</span>}
          <span className="max-w-[10rem] truncate text-xs text-gray-600">{owner || "No owner"}</span>
        </span>
        <DuePill item={item} today={today} />
        {item.mandatory && <StatusPill tone="violet" icon={Flag}>Mandatory</StatusPill>}
        {item.blocked_action && <span title={item.blocked_action}><StatusPill tone="red" icon={Ban}>Blocks: {item.blocked_action}</StatusPill></span>}
        {item.exception_reason && <span title={item.exception_reason}><StatusPill tone="amber" icon={ShieldAlert}>Exception recorded</StatusPill></span>}
        <span className="ml-auto flex items-center gap-1">
          {!item.completed && (
            <button type="button" onClick={() => openException(item)}
              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
              {item.exception_reason ? "Edit exception" : "Record exception"}
            </button>
          )}
          <button type="button" onClick={() => openItemEdit(assn, item)} aria-label={`Edit item ${item.title}`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
        </span>
      </li>
    );
  };

  const hiresView = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search new hire or checklist…" label="Search checklists" />
        <FilterSelect label="Checklist status" allLabel="All statuses" value={statusFilter} onChange={setStatusFilter}
          options={Object.entries(CHECKLIST_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      {activeHires.length === 0 && (
        <p className="text-xs text-gray-400">There are no active new hires. Completed or cancelled hires cannot be given checklists.</p>
      )}
      {hireIds.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title={assignments.length ? "No checklists match" : "No checklists have been assigned yet."}>
            {assignments.length ? "Try another search or status." : "Use \"Assign Checklist\" to give a new hire a checklist from a template."}
          </EmptyState>
        </Card>
      ) : hireIds.map((hid) => {
        const lists = byHire[hid];
        const items = lists.flatMap((a) => a.items || []);
        const done = items.filter((i) => i.completed).length;
        const pct = items.length ? Math.round((done / items.length) * 100) : 0;
        const overdue = items.filter((i) => isOverdue(i, today)).length;
        const rec = hid === "none" ? null : getRecord(Number(hid));
        const name = hid === "none" ? "Unlinked" : getRecordName(Number(hid));
        const sub = [rec?.position, rec?.joining_date ? `Joins ${formatDate(rec.joining_date)}` : null].filter(Boolean).join(" · ");
        const collapsed = !!collapsedHires[hid];
        const canAssign = rec && !INACTIVE_HIRE_STATUSES.includes(rec.status);
        return (
          <section key={hid} className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm" aria-label={`Checklists for ${name}`}>
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1"><PersonCell name={name} sub={sub || null} /></div>
              <div className="flex items-center gap-3">
                <ProgressBar pct={pct} className="w-28 sm:w-40" />
                <span className="whitespace-nowrap text-sm font-semibold text-gray-800">{pct}%</span>
                <span className="whitespace-nowrap text-xs text-gray-500">{done}/{items.length} done</span>
              </div>
              {overdue > 0 && <StatusPill tone="red" icon={AlertTriangle}>{overdue} overdue</StatusPill>}
              <div className="flex items-center gap-1">
                {canAssign && (
                  <button type="button" onClick={() => openAssign({ hire: hid })} className="rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                    <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Assign</span>
                  </button>
                )}
                <button type="button" onClick={() => setCollapsedHires((c) => ({ ...c, [hid]: !collapsed }))} aria-expanded={!collapsed}
                  aria-label={collapsed ? `Show checklists for ${name}` : `Hide checklists for ${name}`}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                </button>
              </div>
            </div>
            {!collapsed && (
              <div className="divide-y divide-gray-100">
                {lists.map((assn) => {
                  const its = assn.items || [];
                  const d = its.filter((i) => i.completed).length;
                  const p = its.length ? Math.round((d / its.length) * 100) : 0;
                  const st = CHECKLIST_STATUS[assn.status] || { label: assn.status || "Pending", tone: "gray" };
                  return (
                    <div key={assn.id} data-testid={`assignment-${assn.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50/60 px-4 py-2.5 sm:px-5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <ListChecks className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                          <span className="min-w-0 max-w-full truncate text-sm font-semibold text-gray-900">{assn.name}</span>
                          {assn.category && <StatusPill tone={CATEGORY_TONE[assn.category] || "gray"}>{assn.category}</StatusPill>}
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-2 whitespace-nowrap text-xs text-gray-500"><ProgressBar pct={p} className="w-16" />{d}/{its.length}</span>
                          <button type="button" onClick={() => openItemEdit(assn)} className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">Add item</button>
                          <button type="button" onClick={() => openChecklistEdit(assn)} className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                          <button type="button" onClick={() => handleUnassign(assn)} className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Remove</button>
                        </div>
                      </div>
                      {assn.description && <p className="px-4 pt-2 text-xs text-gray-500 sm:px-5">{assn.description}</p>}
                      {its.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-gray-400 sm:px-5">This checklist has no items.</p>
                      ) : (
                        <ul className="divide-y divide-gray-50">{its.map((item, idx) => renderItem(assn, item, idx))}</ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  const templatesView = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipTabs label="Template category" value={activeTab} onChange={setActiveTab}
          tabs={CATEGORIES.map((c) => ({ value: c, label: c, count: categoryCounts[c] }))} />
        <PrimaryButton icon={Plus} onClick={() => { resetForm(); setShowForm(true); }}>New {activeTab} Template</PrimaryButton>
      </div>
      <p className="text-sm text-gray-500">{templates.length} template{templates.length !== 1 ? "s" : ""} in {activeTab}</p>
      {templates.length === 0 ? (
        <Card><EmptyState icon={Layers} title={`No ${activeTab} checklist templates yet.`}>Use "New {activeTab} Template" to create one.</EmptyState></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {templates.map((tpl) => {
            const tplId = tpl.id;
            const tplAssignments = getAssignmentsForTemplate(tplId);
            const isExpanded = expandedTemplate === tplId;
            const tplItems = tpl.items || [];
            return (
              <article key={tplId} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
                <div className="flex items-start gap-3 p-4 sm:p-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><ClipboardCheck className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate text-base font-semibold text-gray-900">{tpl.name}</h3>
                      <StatusPill tone={CATEGORY_TONE[tpl.category || activeTab] || "gray"}>{tpl.category || activeTab}</StatusPill>
                    </div>
                    {tpl.description && <p className="mt-0.5 truncate text-sm text-gray-500">{tpl.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{tplItems.length} item{tplItems.length !== 1 ? "s" : ""}</span>
                      <span>Assigned to {tplAssignments.length} new hire{tplAssignments.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-gray-100 px-4 py-2 sm:px-5">
                  <button type="button" onClick={() => openAssign({ template: tplId })} className="rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">Assign</button>
                  <button type="button" onClick={() => handleEdit(tpl)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                  <button type="button" onClick={() => handleDelete(tplId)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">Delete</button>
                  <button type="button" onClick={() => setExpandedTemplate(isExpanded ? null : tplId)} aria-label={isExpanded ? "Collapse" : "Expand"} aria-expanded={isExpanded}
                    className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-4 sm:px-5">
                    <h4 className="mb-2 text-sm font-semibold text-gray-900">Template Items</h4>
                    {tplItems.length === 0 ? (
                      <p className="text-xs text-gray-400">No items defined.</p>
                    ) : (
                      <ul className="space-y-2">
                        {tplItems.map((item) => {
                          const owner = item.assignee_name || employeeLabel(item.assignee_employee_id);
                          return (
                            <li key={item.id} className="flex items-start gap-2 text-sm text-gray-700">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                              <div className="min-w-0 flex-1 break-words">
                                <span>{item.title}</span>
                                {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                              </div>
                              <span className="shrink-0 text-right text-xs text-gray-400">{[owner, describeOffset(item.due_offset_days)].filter(Boolean).join(" · ")}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  return layout(
    <>
      <div className="space-y-6">
        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="min-w-0 break-words">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold text-rose-500 hover:text-rose-700">&times;</button>
          </div>
        )}

        {actionMsg.text && (
          <div
            role={actionMsg.type === "error" ? "alert" : "status"}
            className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
              actionMsg.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <span className="min-w-0 break-words">{actionMsg.text}</span>
            <button type="button" onClick={() => setActionMsg({ type: "", text: "" })} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold">&times;</button>
          </div>
        )}

        <KpiGrid cols={4}>
          <KpiCard label="Checklist Completion" icon={ClipboardCheck} tone="blue" kpi={completionKpi} format={(v) => `${v}%`} />
          <KpiCard label="Overdue Items" icon={AlertTriangle} tone="red" kpi={{ value: overdueItems }} />
          <KpiCard label="Checklists In Progress" icon={ListChecks} tone="amber" kpi={{ value: openLists }} />
          <KpiCard label="Completed" icon={CheckCircle2} tone="green" kpi={{ value: completedLists }} />
        </KpiGrid>

        <UnderlineTabs label="Checklist views" value={view} onChange={setView} tabs={[
          { value: "hires", label: "New hire checklists", count: assignments.length },
          { value: "templates", label: "Checklist templates", count: allTemplates.length },
        ]} />

        {view === "hires" ? hiresView : templatesView}
      </div>

      {/* assign a template to a new hire */}
      {showAssign && (
        <SlideOver id="assign" icon={UserPlus} title="Assign checklist" subtitle="Pick a new hire and a template; due dates follow the joining date."
          onClose={() => setShowAssign(false)}
          footer={<>
            <SecondaryButton onClick={() => setShowAssign(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAssign} disabled={assigning || !assignHire || !assignTemplate}>
              {assigning && <Loader2 className="h-4 w-4 animate-spin" />}{assigning ? "Assigning..." : "Assign checklist"}
            </PrimaryButton>
          </>}>
          <Section>
            <div>
              <label htmlFor="assign-hire" className={labelCls}>New hire</label>
              <select id="assign-hire" value={assignHire} onChange={(e) => setAssignHire(e.target.value)} className={fieldCls}>
                <option value="">Choose a new hire...</option>
                {activeHires.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.candidate_name || r.name || `New hire #${r.id}`}
                    {r.joining_date ? ` (joins ${formatDate(r.joining_date)})` : ""}
                  </option>
                ))}
              </select>
              {activeHires.length === 0 && <p className="mt-1 text-xs text-gray-400">There are no active new hires. Completed or cancelled hires cannot be given checklists.</p>}
            </div>
            <div>
              <label htmlFor="assign-template" className={labelCls}>Checklist template</label>
              <select id="assign-template" value={assignTemplate} onChange={(e) => setAssignTemplate(e.target.value)} className={fieldCls}>
                <option value="">Choose a template...</option>
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id} disabled={templateAlreadyAssigned(t.id)}>
                    {t.name} ({t.category}){templateAlreadyAssigned(t.id) ? " - already assigned" : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">Task owners are emailed their tasks when the checklist is assigned.</p>
          </Section>
        </SlideOver>
      )}

      {/* edit a new hire's checklist */}
      {checklistEdit && (
        <SlideOver id="checklist-edit" icon={ListChecks} title="Edit checklist" subtitle={getRecordName(checklistEdit.assignment.onboarding_new_hire_id)}
          onClose={() => setChecklistEdit(null)}
          footer={<>
            <SecondaryButton onClick={() => setChecklistEdit(null)} disabled={savingEdit}>Cancel</SecondaryButton>
            <PrimaryButton onClick={saveChecklistEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save checklist"}</PrimaryButton>
          </>}>
          <FormError>{checklistEdit.error}</FormError>
          <Section>
            <div>
              <label htmlFor="cl-name" className={labelCls}>Checklist name</label>
              <input id="cl-name" type="text" maxLength={200} value={checklistEdit.name}
                onChange={(e) => setChecklistEdit((c) => ({ ...c, name: e.target.value, error: "" }))} className={fieldCls} />
            </div>
            <div>
              <label htmlFor="cl-desc" className={labelCls}>Description</label>
              <textarea id="cl-desc" rows={3} value={checklistEdit.description}
                onChange={(e) => setChecklistEdit((c) => ({ ...c, description: e.target.value }))} className={fieldCls} />
            </div>
          </Section>
        </SlideOver>
      )}

      {/* add or edit one item of a new hire's checklist */}
      {itemEdit && (
        <SlideOver id="item-edit" icon={itemEdit.item ? Pencil : Plus} title={itemEdit.item ? "Edit item" : "Add item"}
          subtitle={`${itemEdit.assignment.name} · ${getRecordName(itemEdit.assignment.onboarding_new_hire_id)}`}
          onClose={() => setItemEdit(null)}
          footer={<>
            {itemEdit.item && (
              <button type="button" onClick={() => saveItemEdit(true)} disabled={savingEdit}
                className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />Remove item
              </button>
            )}
            <SecondaryButton onClick={() => setItemEdit(null)} disabled={savingEdit}>Cancel</SecondaryButton>
            <PrimaryButton onClick={() => saveItemEdit(false)} disabled={savingEdit}>{savingEdit ? "Saving..." : itemEdit.item ? "Save item" : "Add item"}</PrimaryButton>
          </>}>
          <FormError>{itemEdit.error}</FormError>
          <Section>
            <div>
              <label htmlFor="ci-title" className={labelCls}>Title <span className="text-rose-500">*</span></label>
              <input id="ci-title" type="text" maxLength={200} value={itemEdit.title}
                onChange={(e) => setItemEdit((c) => ({ ...c, title: e.target.value, error: "" }))} className={fieldCls} />
            </div>
            <div>
              <label htmlFor="ci-desc" className={labelCls}>Description</label>
              <textarea id="ci-desc" rows={2} value={itemEdit.description}
                onChange={(e) => setItemEdit((c) => ({ ...c, description: e.target.value }))} className={fieldCls} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ci-owner" className={labelCls}>Owner</label>
                <select id="ci-owner" value={itemEdit.owner} onChange={(e) => setItemEdit((c) => ({ ...c, owner: e.target.value }))} className={fieldCls}>
                  <option value="">No owner</option>
                  {employees.map((e) => <option key={e.id} value={String(e.id)}>{employeeName(e)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ci-due" className={labelCls}>Due date</label>
                <input id="ci-due" type="date" value={itemEdit.due} onChange={(e) => setItemEdit((c) => ({ ...c, due: e.target.value }))} className={fieldCls} />
              </div>
            </div>
            {itemEdit.item?.due_offset_days != null && (
              <p className="text-xs text-gray-500">From the template: {describeOffset(itemEdit.item.due_offset_days)}. Changing the date replaces that rule for this item.</p>
            )}
            <p className="text-xs text-gray-500">A newly chosen owner is emailed the task.</p>
          </Section>
        </SlideOver>
      )}

      {/* checklist exception */}
      {exceptionItem && (
        <SlideOver id="checklist-exception" icon={ShieldAlert} title="Checklist exception" subtitle={exceptionItem.title}
          onClose={() => setExceptionItem(null)} as="form" onSubmit={saveException}
          footer={<>
            <SecondaryButton onClick={() => setExceptionItem(null)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={savingException || !exceptionForm.reason.trim() || !exceptionForm.owner_id || !exceptionForm.due_date}>
              {savingException ? "Saving…" : "Save exception"}
            </PrimaryButton>
          </>}>
          <FormError>{exceptionError}</FormError>
          <Section>
            <div>
              <label htmlFor="exception-reason" className={labelCls}>Reason</label>
              <textarea id="exception-reason" required maxLength={2000} value={exceptionForm.reason}
                onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                className={`${fieldCls} min-h-20`} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="exception-owner" className={labelCls}>Exception owner</label>
                <select id="exception-owner" required value={exceptionForm.owner_id}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, owner_id: e.target.value })} className={fieldCls}>
                  <option value="">Choose an employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="exception-due" className={labelCls}>Due date</label>
                <input id="exception-due" type="date" required value={exceptionForm.due_date}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, due_date: e.target.value })} className={fieldCls} />
              </div>
            </div>
            <div>
              <label htmlFor="exception-blocked-action" className={labelCls}>Action blocked (optional)</label>
              <input id="exception-blocked-action" maxLength={300} value={exceptionForm.blocked_action}
                onChange={(e) => setExceptionForm({ ...exceptionForm, blocked_action: e.target.value })} className={fieldCls} />
            </div>
          </Section>
        </SlideOver>
      )}

      {/* create / edit template */}
      {showForm && (
        <SlideOver id="tpl" icon={Layers} wide title={editingTemplate ? "Edit Template" : `New ${activeTab} Template`}
          subtitle="Due dates are worked out from each new hire's joining date when the checklist is assigned."
          onClose={resetForm}
          footer={<>
            <SecondaryButton onClick={resetForm}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
            </PrimaryButton>
          </>}>
          <FormError>{formError}</FormError>
          <Section>
            <div>
              <label htmlFor="tpl-name" className={labelCls}>Template Name</label>
              <input id="tpl-name" type="text" value={formName} maxLength={200}
                onChange={(e) => { setFormName(e.target.value); setFormError(""); }}
                placeholder="e.g. New Hire IT Setup" className={fieldCls} />
            </div>
            <div>
              <label htmlFor="tpl-desc" className={labelCls}>Description</label>
              <textarea id="tpl-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of this checklist..." rows={2} className={fieldCls} />
            </div>
          </Section>
          <Section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Checklist Items</h3>
                <p className="text-xs text-gray-500">Owners are emailed their tasks.</p>
              </div>
              <button type="button" onClick={handleAddItem} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                <Plus className="h-3.5 w-3.5" />Add Item
              </button>
            </div>
            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div key={item.id ?? `new-${idx}`} className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50/40 p-3" data-testid="template-item">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <input type="text" aria-label="Item title" value={item.title} maxLength={200}
                      onChange={(e) => handleItemChange(idx, "title", e.target.value)} placeholder="Item title" className={fieldCls} />
                    <select aria-label="Owner" value={item.assignee_employee_id}
                      onChange={(e) => handleItemChange(idx, "assignee_employee_id", e.target.value)} className={fieldCls}>
                      <option value="">No owner</option>
                      {employees.map((e) => (
                        <option key={e.id} value={String(e.id)}>{employeeName(e)}</option>
                      ))}
                    </select>
                    <input type="text" aria-label="Item description" value={item.description}
                      onChange={(e) => handleItemChange(idx, "description", e.target.value)} placeholder="Optional description" className={fieldCls} />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-xs text-gray-500">Due</span>
                      <input type="number" aria-label="Due offset days" min={0} max={365} step={1}
                        value={item.offsetDir === "on" ? "" : item.offsetDays} disabled={item.offsetDir === "on"}
                        onChange={(e) => handleItemChange(idx, "offsetDays", e.target.value)} placeholder="-"
                        className={`${fieldCls} !w-20 shrink-0`} />
                      <select aria-label="Due direction" value={item.offsetDir}
                        onChange={(e) => handleItemChange(idx, "offsetDir", e.target.value)} className={`${fieldCls} min-w-0 flex-1`}>
                        <option value="before">days before start</option>
                        <option value="on">on start day</option>
                        <option value="after">days after start</option>
                      </select>
                    </div>
                  </div>
                  {formItems.length > 1 && (
                    <button type="button" onClick={() => handleRemoveItem(idx)} aria-label="Remove item" className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </SlideOver>
      )}
    </>
  );
}
