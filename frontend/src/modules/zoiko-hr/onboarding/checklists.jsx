import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
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

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];

function OnboardingSubNav() {
  return (
    <div className="hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const CATEGORIES = ["HR", "IT", "Manager", "Custom"];

const CATEGORY_COLORS = {
  HR: "bg-blue-100 text-blue-800",
  IT: "bg-emerald-100 text-emerald-800",
  Manager: "bg-[#0A1128]/10 text-[#0A1128]",
  Custom: "bg-amber-100 text-amber-800",
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
  event.preventDefault();
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

const CHECKLIST_STATUS = {
  pending: { label: "Pending", cls: "bg-gray-100 text-gray-700" },
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
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

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState([{ ...EMPTY_ITEM }]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [assignHire, setAssignHire] = useState("");
  const [assignTemplate, setAssignTemplate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [busyAssignment, setBusyAssignment] = useState(null);

  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [exceptionItem, setExceptionItem] = useState(null);
  const [exceptionForm, setExceptionForm] = useState({ reason: "", owner_id: "", due_date: "", blocked_action: "" });
  const [exceptionError, setExceptionError] = useState("");
  const [savingException, setSavingException] = useState(false);

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

  function getRecordName(recordId) {
    const rec = records.find((r) => r.id === recordId || r.id === Number(recordId));
    return rec ? rec.candidate_name || rec.name || `New hire #${recordId}` : `New hire #${recordId}`;
  }

  const employeeLabel = (id) => {
    const e = employees.find((x) => x.id === Number(id));
    return e ? employeeName(e) : "";
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
      await fetchAssignments();
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
    } catch (err) {
      showAction("error", err.message || "Failed to remove checklist");
    }
  };

  // The server updates items by id, so every item goes back with its id each time.
  const handleToggleItem = async (assignment, itemId) => {
    const items = (assignment.items || []).map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description ?? null,
      completed: i.id === itemId ? !i.completed : !!i.completed,
      due_offset_days: i.due_offset_days ?? null,
      assignee_employee_id: i.assignee_employee_id ?? null,
      due_date: i.due_date ?? null,
    }));
    setBusyAssignment(assignment.id);
    try {
      const updated = await updateOnboardingChecklistAssignment(assignment.id, { items });
      if (updated && updated.id) {
        setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        await fetchAssignments();
      }
    } catch (err) {
      showAction("error", err.message || "Failed to update item");
    } finally {
      setBusyAssignment(null);
    }
  };

  const getAssignmentsForTemplate = (templateId) => assignments.filter((a) => a.template_id === templateId);

  // Assigned checklists grouped by new hire
  const byHire = assignments.reduce((acc, a) => {
    const key = a.onboarding_new_hire_id ?? "none";
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});
  const hireIds = Object.keys(byHire);

  const templateAlreadyAssigned = (tplId) =>
    !!assignHire && assignments.some((a) => a.template_id === tplId && String(a.onboarding_new_hire_id) === String(assignHire));

  if (loading && templates.length === 0 && assignments.length === 0) {
    return (
      <HRPage title="Onboarding Checklists" subtitle="Create checklist templates and track each new hire's onboarding tasks.">
        <OnboardingSubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading checklists...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Checklists" subtitle="Create checklist templates and track each new hire's onboarding tasks.">
      <OnboardingSubNav />

      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      {actionMsg.text && (
        <div
          role={actionMsg.type === "error" ? "alert" : "status"}
          className={`mb-4 px-4 py-3 rounded-lg flex justify-between items-start gap-3 ${
            actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          <span className="min-w-0 break-words">{actionMsg.text}</span>
          <button onClick={() => setActionMsg({ type: "", text: "" })} aria-label="Dismiss" className="font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      {/* ── New hire checklists ── */}
      <section className="mb-10">
        <h2 className="text-base font-bold text-gray-800 mb-3">New hire checklists</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="assign-hire" className="block text-xs font-medium text-gray-600 mb-1">New hire</label>
            <select
              id="assign-hire"
              value={assignHire}
              onChange={(e) => setAssignHire(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a new hire...</option>
              {activeHires.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.candidate_name || r.name || `New hire #${r.id}`}
                  {r.joining_date ? ` (joins ${formatDate(r.joining_date)})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="assign-template" className="block text-xs font-medium text-gray-600 mb-1">Checklist template</label>
            <select
              id="assign-template"
              value={assignTemplate}
              onChange={(e) => setAssignTemplate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a template...</option>
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id} disabled={templateAlreadyAssigned(t.id)}>
                  {t.name} ({t.category}){templateAlreadyAssigned(t.id) ? " - already assigned" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAssign}
            disabled={assigning || !assignHire || !assignTemplate}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {assigning ? "Assigning..." : "Assign checklist"}
          </button>
          {activeHires.length === 0 && (
            <p className="w-full text-xs text-gray-400">There are no active new hires. Completed or cancelled hires cannot be given checklists.</p>
          )}
        </div>

        {hireIds.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">No checklists have been assigned yet.</p>
            <p className="text-gray-400 text-sm mt-1">Choose a new hire and a template above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hireIds.map((hid) => (
              <div key={hid} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-3 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                  <h3 className="text-sm font-bold text-gray-800 break-words">{hid === "none" ? "Unlinked" : getRecordName(Number(hid))}</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {byHire[hid].map((assn) => {
                    const items = assn.items || [];
                    const done = items.filter((i) => i.completed).length;
                    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
                    const st = CHECKLIST_STATUS[assn.status] || { label: assn.status || "Pending", cls: "bg-gray-100 text-gray-700" };
                    return (
                      <div key={assn.id} className="px-3 sm:px-5 py-4" data-testid={`assignment-${assn.id}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-gray-800 truncate min-w-0 max-w-full">{assn.name}</span>
                            {assn.category && (
                              <span className={`whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[assn.category] || "bg-gray-100 text-gray-800"}`}>
                                {assn.category}
                              </span>
                            )}
                            <span className={`whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
                              <span className="inline-block w-20 sm:w-24 shrink-0 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <span className={`block h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                              </span>
                              {done}/{items.length} done
                            </span>
                            <button onClick={() => handleUnassign(assn)} className="text-red-400 hover:text-red-600 text-xs py-1.5">Remove</button>
                          </div>
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-gray-400">This checklist has no items.</p>
                        ) : (
                          <ul className="space-y-1">
                            {items.map((item) => (
                              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm hover:bg-gray-50 rounded px-1 py-1">
                                <label className="flex items-center gap-2 cursor-pointer flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-[180px]">
                                  <input
                                    type="checkbox"
                                    checked={!!item.completed}
                                    disabled={busyAssignment === assn.id}
                                    onChange={() => handleToggleItem(assn, item.id)}
                                    className="rounded border-gray-300"
                                  />
                                  <span className={`min-w-0 break-words ${item.completed ? "line-through text-gray-400" : "text-gray-700"}`}>{item.title}</span>
                                </label>
                                <span className="text-xs text-gray-500 break-words">{item.assignee_name || employeeLabel(item.assignee_employee_id) || "No owner"}</span>
                                <span className="text-xs text-gray-500">{item.due_date ? `Due ${formatDate(item.due_date)}` : "No due date"}</span>
                                {isOverdue(item) && (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>
                                )}
                                {!item.completed && (
                                  <button type="button" onClick={() => openException(item)}
                                    className="min-h-8 rounded-md border border-amber-300 px-2 text-xs font-medium text-amber-800">
                                    {item.exception_reason ? "Edit exception" : "Record exception"}
                                  </button>
                                )}
                                {item.exception_reason && <span className="text-xs text-amber-700" title={item.exception_reason}>Exception recorded</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Templates ── */}
      <h2 className="text-base font-bold text-gray-800 mb-3">Checklist templates</h2>
      {exceptionItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="checklist-exception-title">
          <form onSubmit={saveException} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <div>
              <h2 id="checklist-exception-title" className="text-lg font-bold text-gray-900">Checklist exception</h2>
              <p className="mt-1 text-sm text-gray-500">{exceptionItem.title}</p>
            </div>
            {exceptionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{exceptionError}</p>}
            <div>
              <label htmlFor="exception-reason" className="block text-sm font-medium text-gray-700">Reason</label>
              <textarea id="exception-reason" required maxLength={2000} value={exceptionForm.reason}
                onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 p-3 text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="exception-owner" className="block text-sm font-medium text-gray-700">Exception owner</label>
                <select id="exception-owner" required value={exceptionForm.owner_id}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, owner_id: e.target.value })}
                  className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 px-3 text-sm">
                  <option value="">Choose an employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="exception-due" className="block text-sm font-medium text-gray-700">Due date</label>
                <input id="exception-due" type="date" required value={exceptionForm.due_date}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, due_date: e.target.value })}
                  className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="exception-blocked-action" className="block text-sm font-medium text-gray-700">Action blocked (optional)</label>
              <input id="exception-blocked-action" maxLength={300} value={exceptionForm.blocked_action}
                onChange={(e) => setExceptionForm({ ...exceptionForm, blocked_action: e.target.value })}
                className="mt-1 min-h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setExceptionItem(null)} className="min-h-10 rounded-lg border px-4 text-sm">Cancel</button>
              <button type="submit" disabled={savingException || !exceptionForm.reason.trim() || !exceptionForm.owner_id || !exceptionForm.due_date}
                className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
                {savingException ? "Saving…" : "Save exception"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === cat
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <p className="text-sm text-gray-500">
          {templates.length} template{templates.length !== 1 ? "s" : ""} in {activeTab}
        </p>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex justify-between items-center gap-3">
              <h3 className="text-lg font-bold text-gray-800 min-w-0 break-words">{editingTemplate ? "Edit Template" : `New ${activeTab} Template`}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5 shrink-0">&times;</button>
            </div>
            <div className="px-4 sm:px-6 py-4 space-y-4">
              {formError && <div role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 rounded">{formError}</div>}
              <div>
                <label htmlFor="tpl-name" className="block text-sm font-medium text-gray-600 mb-1">Template Name</label>
                <input
                  id="tpl-name"
                  type="text"
                  value={formName}
                  maxLength={200}
                  onChange={(e) => { setFormName(e.target.value); setFormError(""); }}
                  placeholder="e.g. New Hire IT Setup"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="tpl-desc" className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  id="tpl-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this checklist..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-600">Checklist Items</label>
                  <button onClick={handleAddItem} className="text-blue-600 hover:text-blue-800 text-xs font-medium py-1.5">+ Add Item</button>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Due dates are worked out from each new hire's joining date when the checklist is assigned. Owners are emailed their tasks.
                </p>
                <div className="space-y-3">
                  {formItems.map((item, idx) => (
                    <div key={item.id ?? `new-${idx}`} className="border border-gray-100 rounded-lg p-2 sm:p-3 flex gap-2 items-start" data-testid="template-item">
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          aria-label="Item title"
                          value={item.title}
                          maxLength={200}
                          onChange={(e) => handleItemChange(idx, "title", e.target.value)}
                          placeholder="Item title"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          aria-label="Owner"
                          value={item.assignee_employee_id}
                          onChange={(e) => handleItemChange(idx, "assignee_employee_id", e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">No owner</option>
                          {employees.map((e) => (
                            <option key={e.id} value={String(e.id)}>{employeeName(e)}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          aria-label="Item description"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Optional description"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-gray-500 shrink-0">Due</span>
                          <input
                            type="number"
                            aria-label="Due offset days"
                            min={0}
                            max={365}
                            step={1}
                            value={item.offsetDir === "on" ? "" : item.offsetDays}
                            disabled={item.offsetDir === "on"}
                            onChange={(e) => handleItemChange(idx, "offsetDays", e.target.value)}
                            placeholder="-"
                            className="w-16 shrink-0 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                          />
                          <select
                            aria-label="Due direction"
                            value={item.offsetDir}
                            onChange={(e) => handleItemChange(idx, "offsetDir", e.target.value)}
                            className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="before">days before start</option>
                            <option value="on">on start day</option>
                            <option value="after">days after start</option>
                          </select>
                        </div>
                      </div>
                      {formItems.length > 1 && (
                        <button onClick={() => handleRemoveItem(idx)} aria-label="Remove item" className="text-red-400 hover:text-red-600 text-sm p-1.5 shrink-0">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2">
              <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No {activeTab} checklist templates yet.</p>
          <p className="text-gray-400 text-sm mt-1">Click "+ New Template" to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((tpl) => {
            const tplId = tpl.id;
            const tplAssignments = getAssignmentsForTemplate(tplId);
            const isExpanded = expandedTemplate === tplId;
            const tplItems = tpl.items || [];
            return (
              <div key={tplId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-3 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-gray-800 truncate min-w-0">{tpl.name}</h3>
                      <span className={`shrink-0 whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tpl.category] || "bg-gray-100 text-gray-800"}`}>
                        {tpl.category || activeTab}
                      </span>
                    </div>
                    {tpl.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{tpl.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-400">
                      <span>{tplItems.length} item{tplItems.length !== 1 ? "s" : ""}</span>
                      <span>Assigned to {tplAssignments.length} new hire{tplAssignments.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button onClick={() => setAssignTemplate(String(tplId))} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1.5">Assign</button>
                    <button onClick={() => handleEdit(tpl)} className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1.5">Edit</button>
                    <button onClick={() => handleDelete(tplId)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1.5">Delete</button>
                    <button
                      onClick={() => setExpandedTemplate(isExpanded ? null : tplId)}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                      className="text-gray-400 hover:text-gray-600 text-xs p-1.5 sm:px-2"
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 sm:px-5 py-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Template Items</h4>
                    {tplItems.length === 0 ? (
                      <p className="text-xs text-gray-400">No items defined.</p>
                    ) : (
                      <ul className="space-y-1">
                        {tplItems.map((item) => (
                          <li key={item.id} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-gray-300 mt-0.5">&#8226;</span>
                            <div className="min-w-0 break-words">
                              <span>{item.title}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {[item.assignee_name || employeeLabel(item.assignee_employee_id), describeOffset(item.due_offset_days)].filter(Boolean).join(" · ")}
                              </span>
                              {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </HRPage>
  );
}
