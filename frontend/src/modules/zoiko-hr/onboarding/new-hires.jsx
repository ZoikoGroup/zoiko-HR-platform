import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingRecords, createOnboardingRecord, updateOnboardingRecord, deleteOnboardingRecord,
  getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  getOnboardingDocuments, getOnboardingChecklistAssignments, sendOnboardingPortalInvite,
  requestOnboardingDocuments, getOnboardingProgress, getDepartments,
} from "../../../service/hrService";
import { getEmployees } from "../../../service/employee";
import { formatDate } from "../../../utils/dateTime";
import OnboardingFormsReview from "./OnboardingFormsReview";
import ProbationScheduleForm from "./ProbationScheduleForm";

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

function SubNav() {
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

const STATUS_COLORS = {
  offer_sent: "bg-blue-100 text-blue-800",
  offer_accepted: "bg-emerald-100 text-emerald-800",
  pre_joining: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_OPTIONS = [
  { value: "offer_sent", label: "Offer Sent" },
  { value: "offer_accepted", label: "Offer Accepted" },
  { value: "pre_joining", label: "Pre-Joining" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
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

const JOINING_STATUS_OPTIONS = [
  { value: "not_joined", label: "Not Joined" },
  { value: "joined", label: "Joined" },
  { value: "no_show", label: "No Show" },
  { value: "deferred", label: "Deferred" },
];

const JOINING_STATUS_COLORS = {
  not_joined: "bg-gray-100 text-gray-600",
  joined: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-700",
  deferred: "bg-amber-100 text-amber-700",
};

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
  requested: { label: "Waiting for new hire", cls: "bg-gray-100 text-gray-600" },
  pending: { label: "Needs review", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
};

const PROFILE_FIELDS = [
  ["address", "Address"], ["city", "City"], ["state", "State"], ["country", "Country"], ["postal_code", "Postal code"],
  ["emergency_contact_name", "Emergency contact"], ["emergency_contact_relation", "Relation"], ["emergency_contact_phone", "Emergency phone"],
];

const ITEMS_PER_PAGE = 10;

const initialForm = {
  candidate_name: "",
  email: "",
  phone: "",
  position: "",
  department_id: "",
  manager_id: "",
  joining_date: "",
  notes: "",
  employment_type: "",
  status: "offer_accepted",
  start_onboarding: true,
};

const asList = (data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
const employeeName = (e) => e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || e.email || `#${e.id}`;
const statusLabel = (s) => STATUS_OPTIONS.find((o) => o.value === s)?.label || s;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function NewHires() {
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
  const [joiningStatusFilter, setJoiningStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", due_date: "" });
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

  const toggleRecordView = async () => {
    const showAll = !showAllRecords;
    setShowAllRecords(showAll);
    setCurrentPage(1);
    await fetchRecords(!showAll);
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
  }, []);

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

  const handleToggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setNewTask({ title: "", description: "", due_date: "" });
      fetchPanel(id);
    }
  };

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

  const filtered = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.candidate_name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.position?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    if (departmentFilter) result = result.filter((r) => String(r.department_id) === departmentFilter);
    if (joiningStatusFilter) result = result.filter((r) => (r.joining_status || "not_joined") === joiningStatusFilter);
    return result;
  }, [records, search, statusFilter, departmentFilter, joiningStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const resetForm = () => {
    setFormData({ ...initialForm });
    setFormErrors({});
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (record) => {
    setEditId(record.id);
    setFormData({
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
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errors = {};
    if (!formData.candidate_name.trim()) errors.candidate_name = "Name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errors.email = "Invalid email";
    if (!formData.position.trim()) errors.position = "Position is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
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
      setShowModal(false);
      resetForm();
      await fetchRecords();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save record" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record, newStatus) => {
    if (newStatus === "cancelled" && !window.confirm(`Cancel onboarding for ${record.candidate_name}?`)) return;
    setBusyId(record.id);
    try {
      await updateOnboardingRecord(record.id, { status: newStatus });
      flash(`${record.candidate_name} moved to ${statusLabel(newStatus)}.`);
      await fetchRecords();
    } catch (err) {
      fail(err, "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleJoiningStatusChange = async (record, value) => {
    try {
      await updateOnboardingRecord(record.id, { joining_status: value });
      flash(`Joining status for ${record.candidate_name} updated.`);
      await fetchRecords();
    } catch (err) {
      fail(err, "Failed to update joining status");
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`Delete the onboarding record for ${record.candidate_name}?`)) return;
    try {
      await deleteOnboardingRecord(record.id);
      if (expandedId === record.id) setExpandedId(null);
      flash(`${record.candidate_name} deleted.`);
      await fetchRecords();
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
      else flash("Pre-onboarding link created, but the email could not be sent. Copy the link below and share it.");
      if (expandedId !== record.id) handleToggleExpand(record.id);
      await fetchRecords();
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
      if (expandedId === record.id) fetchPanel(record.id);
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
      await fetchRecords();
    } catch (err) {
      setCompletion((c) => c && { ...c, submitting: false, error: err.message || "Failed to complete onboarding" });
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await updateOnboardingTask(task.id, { completed: !task.completed });
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      fail(err, "Failed to update task");
    }
  };

  const handleAddTask = async (recordId) => {
    if (!newTask.title.trim()) return;
    try {
      await createOnboardingTask({
        onboarding_new_hire_id: recordId,
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        due_date: newTask.due_date || null,
      });
      setNewTask({ title: "", description: "", due_date: "" });
      flash("Task added.");
      fetchTasks(recordId);
    } catch (err) {
      fail(err, "Failed to add task");
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteOnboardingTask(taskId);
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      fail(err, "Failed to delete task");
    }
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = ["Candidate Name", "Email", "Phone", "Position", "Department", "Manager", "Employment Type", "Status", "Joining Date", "Joining Status", "Notes"];
      const rows = filtered.map((r) => [
        r.candidate_name || "",
        r.email || "",
        r.phone || "",
        r.position || "",
        r.department_name || "",
        r.manager_name || "",
        EMPLOYMENT_TYPES.find((t) => t.value === r.employment_type)?.label || "",
        statusLabel(r.status) || "",
        r.joining_date || "",
        JOINING_STATUS_OPTIONS.find((s) => s.value === (r.joining_status || "not_joined"))?.label || "Not Joined",
        r.notes || "",
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

  const stats = useMemo(() => {
    const counts = {};
    STATUS_OPTIONS.forEach((s) => { counts[s.value] = 0; });
    records.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return { total: records.length, ...counts };
  }, [records]);

  if (loading && records.length === 0) {
    return (
      <HRPage title="New Hires" subtitle="Accepted-offer candidates and their onboarding progress. Switch to All Onboarding to view other records.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading new hires...</span>
        </div>
      </HRPage>
    );
  }

  const linkLine = (r) => {
    if (!r.portal_invited_at) return "Pre-onboarding link not sent yet";
    const expired = r.portal_expires_at && new Date(r.portal_expires_at) < new Date();
    return `Link sent ${formatDate(r.portal_invited_at)}${r.portal_expires_at ? ` · ${expired ? "expired" : "valid until"} ${formatDate(r.portal_expires_at)}` : ""}`;
  };

  const renderPanel = (rec) => {
    if (!rec) return null;
    const readOnly = rec.status === "completed";
    const active = ACTIVE_STATUSES.includes(rec.status);
    const recordTasks = tasks[rec.id] || [];
    const recordDocs = docs[rec.id] || [];
    const recordChecklists = checklists[rec.id] || [];
    const profile = rec.profile_details || {};
    const hasProfile = PROFILE_FIELDS.some(([k]) => profile[k]);
    const link = links[rec.id];
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-gray-700 break-words">{rec.candidate_name}</h4>
            <p className="text-xs text-gray-500 break-words">
              {rec.position}{rec.department_name ? ` · ${rec.department_name}` : ""}{rec.manager_name ? ` · Manager: ${rec.manager_name}` : ""}
              {rec.employment_type ? ` · ${EMPLOYMENT_TYPES.find((t) => t.value === rec.employment_type)?.label || rec.employment_type}` : ""}
            </p>
            {readOnly && (
              <p className="text-xs text-green-700 mt-1">
                Onboarding completed{rec.completed_at ? ` on ${formatDate(rec.completed_at)}` : ""}. Employee account created{rec.employee_id ? ` (employee #${rec.employee_id})` : ""}. This record is read-only.
              </p>
            )}
            {rec.notes && <p className="text-xs text-gray-500 mt-1 break-words">Notes: {rec.notes}</p>}
          </div>
          {active && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setDocRequest({ record: rec, categories: [] })} className="border border-gray-200 hover:bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg">Request documents</button>
              <button onClick={() => handleSendLink(rec)} disabled={busyId === rec.id} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                {busyId === rec.id ? "Sending..." : rec.portal_invited_at ? "Resend pre-onboarding link" : "Send pre-onboarding link"}
              </button>
            </div>
          )}
        </div>

        {active && (
          <div className="bg-white rounded-lg border border-gray-100 px-3 sm:px-4 py-3">
            <p className="text-xs text-gray-600 break-words">{linkLine(rec)}</p>
            {link?.url && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input readOnly value={link.url} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[16rem] border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-gray-50" />
                <button onClick={() => handleCopy(link.url)} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded shrink-0">Copy</button>
              </div>
            )}
          </div>
        )}

        {panelLoading ? (
          <div className="text-xs text-gray-400">Loading details...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
              <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Details entered by the new hire</h5>
              {!hasProfile ? (
                <p className="text-xs text-gray-400">Nothing submitted yet.</p>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {rec.phone && (<><dt className="text-gray-400">Phone</dt><dd className="text-gray-700 break-words">{rec.phone}</dd></>)}
                  {PROFILE_FIELDS.filter(([k]) => profile[k]).map(([k, label]) => (
                    <div key={k} className="contents">
                      <dt className="text-gray-400">{label}</dt>
                      <dd className="text-gray-700 break-words">{profile[k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
              <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Documents</h5>
              {recordDocs.length === 0 ? (
                <p className="text-xs text-gray-400">No documents requested.</p>
              ) : (
                <ul className="space-y-1">
                  {recordDocs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-gray-700 min-w-0 break-words">{d.title}</span>
                      <span className={`whitespace-nowrap px-2 py-0.5 rounded-full font-medium ${DOC_STATUS[d.status]?.cls || "bg-gray-100 text-gray-600"}`}>{DOC_STATUS[d.status]?.label || d.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
              <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Checklists</h5>
              {recordChecklists.length === 0 ? (
                <p className="text-xs text-gray-400">No checklists assigned.</p>
              ) : (
                <ul className="space-y-1">
                  {recordChecklists.map((c) => {
                    const items = c.items || [];
                    const done = items.filter((i) => i.completed).length;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-gray-700 min-w-0 break-words">{c.name}</span>
                        <span className={done === items.length && items.length ? "text-green-600 font-medium" : "text-gray-500"}>{done}/{items.length} done</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
              <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Pre-boarding tasks</h5>
              {recordTasks.length === 0 ? (
                <p className="text-xs text-gray-400">No pre-boarding tasks yet.</p>
              ) : (
                <ul className="space-y-1 mb-2">
                  {recordTasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={!!t.completed} disabled={readOnly} onChange={() => handleToggleTask(t)} className="rounded border-gray-300 mt-1" />
                      <div className="min-w-0 break-words">
                        <span className={t.completed ? "line-through text-gray-400" : "text-gray-700"}>{t.title}</span>
                        {t.due_date && <span className="text-xs text-gray-400 ml-2">due {formatDate(t.due_date)}</span>}
                        {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
                      </div>
                      {!readOnly && <button onClick={() => handleDeleteTask(t.id)} className="text-red-400 hover:text-red-600 text-xs ml-auto p-1.5 -my-1.5 shrink-0">&times;</button>}
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="New task..."
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(rec.id); } }}
                      className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} className="flex-1 sm:flex-none min-w-0 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => handleAddTask(rec.id)} disabled={!newTask.title.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs px-3 py-1 rounded font-medium">Add</button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {!panelLoading && (
          <div className="space-y-4">
            <OnboardingFormsReview hireId={rec.id} />
            {rec.employee_id && (
              <ProbationScheduleForm employeeId={rec.employee_id} reviewers={employees} onScheduled={fetchRecords} />
            )}
          </div>
        )}
      </div>
    );
  };

  const progress = completion?.progress;

  return (
    <HRPage title="New Hires" subtitle="Accepted-offer candidates and their onboarding progress. Switch to All Onboarding to view other records.">
      <SubNav />

      {(error || loadError) && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{error || loadError}</span>
          <button onClick={() => { setError(null); setLoadError(null); }} className="text-red-500 hover:text-red-700 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          {STATUS_OPTIONS.map((s) => (
            <div key={s.value} className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
              <p className="text-xs text-gray-400 truncate">{s.label}</p>
              <p className={`text-lg font-bold ${s.value === "cancelled" ? "text-red-600" : s.value === "completed" ? "text-green-600" : "text-blue-600"}`}>
                {stats[s.value] || 0}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <input
              type="text"
              placeholder="Search by name, email, position..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:max-w-xs sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name || `Dept #${d.id}`}</option>
              ))}
            </select>
            <select
              value={joiningStatusFilter}
              onChange={(e) => { setJoiningStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Joining Status</option>
              {JOINING_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
              className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button onClick={toggleRecordView} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {showAllRecords ? "Accepted Offers Only" : "All Onboarding"}
            </button>
            {showAllRecords && <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + New Onboarding
            </button>}
          </div>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">
              {records.length === 0 ? (showAllRecords ? "No new hire records yet." : "No candidates have accepted an offer yet.") : "No records match your search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="w-8 px-2 py-3"></th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Candidate</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Position</th>
                    <th className="hidden md:table-cell text-left px-3 py-3 font-semibold text-gray-600">Department</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining Date</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining Status</th>
                    <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r) => {
                    const completed = r.status === "completed";
                    const next = (STATUS_FLOW[r.status] || []).filter((s) => s !== "completed");
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${expandedId === r.id ? "bg-blue-50/30" : ""}`}>
                        <td className="px-2 py-3">
                          <button onClick={() => handleToggleExpand(r.id)} className="text-gray-400 hover:text-gray-600 text-xs p-1.5" aria-label="Show details">
                            {expandedId === r.id ? "▼" : "▶"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <button onClick={() => handleToggleExpand(r.id)} className="font-medium text-gray-800 hover:text-blue-600 text-left">{r.candidate_name}</button>
                            {["offer_accepted", "pre_joining"].includes(r.status) && (
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={(event) => { event.stopPropagation(); handleStatusChange(r, "in_progress"); }}
                                className="whitespace-nowrap rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50"
                                aria-label={`Start onboarding for ${r.candidate_name}`}
                              >
                                {busyId === r.id ? "Starting…" : "Start Onboarding"}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 break-all">{r.email}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{r.position}</td>
                        <td className="hidden md:table-cell px-3 py-3 text-gray-500">{r.department_name || "-"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ""}`}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.joining_date ? formatDate(r.joining_date) : "-"}</td>
                        <td className="px-3 py-3">
                          <select
                            value={r.joining_status || "not_joined"}
                            disabled={completed}
                            onChange={(e) => handleJoiningStatusChange(r, e.target.value)}
                            className={`text-xs rounded px-1 py-0.5 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-70 ${JOINING_STATUS_COLORS[r.joining_status || "not_joined"] || ""}`}
                          >
                            {JOINING_STATUS_OPTIONS.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {!completed && <button onClick={() => openEdit(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>}
                            {r.status === "in_progress" && (
                              <button onClick={() => openCompletion(r)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium px-1 whitespace-nowrap">
                                Complete onboarding
                              </button>
                            )}
                            {next.map((ns) => (
                              <button
                                key={ns}
                                disabled={busyId === r.id}
                                onClick={() => handleStatusChange(r, ns)}
                                className={`text-xs px-1 font-medium whitespace-nowrap disabled:opacity-40 ${ns === "cancelled" ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"}`}
                              >
                                {transitionLabel(r.status, ns)}
                              </button>
                            ))}
                            {!completed && <button onClick={() => handleDelete(r)} className="text-red-400 hover:text-red-600 text-xs px-1">Del</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {expandedId && (
              <div className="border-t border-gray-100 bg-gray-50 px-3 sm:px-6 py-4">
                {renderPanel(records.find((r) => r.id === expandedId))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex flex-wrap justify-between items-center gap-2 px-3 sm:px-6 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {safePage} of {totalPages}</span>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-xs border rounded ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editId ? "Edit Onboarding" : "New Onboarding"}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Name *</label>
                  <input type="text" value={formData.candidate_name} onChange={(e) => setFormData({ ...formData, candidate_name: e.target.value })} className={`w-full border ${formErrors.candidate_name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.candidate_name && <p className="text-red-500 text-xs mt-1">{formErrors.candidate_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={`w-full border ${formErrors.email ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                  <input type="text" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} className={`w-full border ${formErrors.position ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.position && <p className="text-red-500 text-xs mt-1">{formErrors.position}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name || `Dept #${d.id}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                  <select value={formData.manager_id} onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select manager</option>
                    {formData.manager_id && !employees.some((e) => String(e.id) === formData.manager_id) && (
                      <option value={formData.manager_id}>{records.find((r) => r.id === editId)?.manager_name || `Employee #${formData.manager_id}`}</option>
                    )}
                    {employees.map((e) => (
                      <option key={e.id} value={String(e.id)}>{employeeName(e)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select value={formData.employment_type} onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Not set</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                  <input type="date" value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {!editId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Starting Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {CREATE_STATUSES.map((s) => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-gray-700 pb-2">
                    <input type="checkbox" checked={formData.start_onboarding} onChange={(e) => setFormData({ ...formData, start_onboarding: e.target.checked })} className="rounded border-gray-300 mt-0.5" />
                    <span>Start onboarding now<span className="block text-xs text-gray-400">Applies Settings: checklists, document requests and emails the pre-onboarding link.</span></span>
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {docRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Request documents</h2>
              <button onClick={() => setDocRequest(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <div className="p-4 sm:p-6 space-y-3">
              <p className="text-sm text-gray-500 break-words">Choose what {docRequest.record.candidate_name} should upload. They will be emailed.</p>
              {DOCUMENT_CATEGORIES.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={docRequest.categories.includes(c.value)}
                    onChange={(e) => setDocRequest({
                      ...docRequest,
                      categories: e.target.checked ? [...docRequest.categories, c.value] : docRequest.categories.filter((v) => v !== c.value),
                    })}
                  />
                  {c.label}
                </label>
              ))}
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button onClick={() => setDocRequest(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={submitDocRequest} disabled={!docRequest.categories.length || docRequest.submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium">
                  {docRequest.submitting ? "Requesting..." : "Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {completion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Complete onboarding</h2>
              <button onClick={() => setCompletion(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-600 break-words">
                Completing creates the employee account for <span className="font-medium">{completion.record.candidate_name}</span> and emails the login details to {completion.record.email}.
              </p>
              {completion.error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 rounded">{completion.error}</div>}
              {completion.loading ? (
                <div className="text-sm text-gray-400">Checking progress...</div>
              ) : progress && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-center">
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-400">Checklist</p>
                      <p className="text-sm font-bold text-gray-800">{progress.checklist_done}/{progress.checklist_total}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-400">Docs approved</p>
                      <p className="text-sm font-bold text-gray-800">{progress.documents_approved}/{progress.documents_total}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2">
                      <p className="text-xs text-gray-400">Orientation</p>
                      <p className="text-sm font-bold text-gray-800">{progress.orientation_attended}/{progress.orientation_sessions}</p>
                    </div>
                  </div>
                  {progress.blockers?.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                      <p className="font-medium mb-1">Not ready yet:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {progress.blockers.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-green-700">Everything required is done.</p>
                  )}
                </>
              )}
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button onClick={() => setCompletion(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
                {!completion.loading && (progress?.blockers?.length > 0 || !progress ? (
                  <button onClick={() => submitCompletion(true)} disabled={completion.submitting} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg font-medium">
                    {completion.submitting ? "Completing..." : "Complete anyway"}
                  </button>
                ) : (
                  <button onClick={() => submitCompletion(false)} disabled={completion.submitting} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg font-medium">
                    {completion.submitting ? "Completing..." : "Complete onboarding"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
