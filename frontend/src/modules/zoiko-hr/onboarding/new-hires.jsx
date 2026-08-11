import { useState, useEffect, useMemo } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingRecords, createOnboardingRecord, updateOnboardingRecord, deleteOnboardingRecord, getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask } from "../../../service/hrService";

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
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
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
  offer_accepted: "bg-indigo-100 text-indigo-800",
  pre_joining: "bg-purple-100 text-purple-800",
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

const STATUS_FLOW = {
  offer_sent: ["offer_accepted", "cancelled"],
  offer_accepted: ["pre_joining", "cancelled"],
  pre_joining: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
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
  deferred: "bg-orange-100 text-orange-700",
};

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
};

export default function NewHires() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [joiningStatusFilter, setJoiningStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [exporting, setExporting] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOnboardingRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load onboarding records");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchTasks = async (recordId) => {
    setTasksLoading(true);
    try {
      const data = await getOnboardingTasks(recordId);
      setTasks((prev) => ({ ...prev, [recordId]: Array.isArray(data) ? data : [] }));
    } catch {
      setTasks((prev) => ({ ...prev, [recordId]: [] }));
    } finally {
      setTasksLoading(false);
    }
  };

  const handleToggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!tasks[id]) fetchTasks(id);
    }
  };

  const departments = useMemo(() => {
    const seen = new Set();
    const depts = [];
    records.forEach((r) => {
      const key = r.department_id;
      const name = r.department_name || r.department || "";
      if (key && !seen.has(key)) {
        seen.add(key);
        depts.push({ id: key, name });
      }
    });
    return depts;
  }, [records]);

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
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (departmentFilter) {
      result = result.filter((r) => String(r.department_id) === departmentFilter);
    }
    if (joiningStatusFilter) {
      result = result.filter((r) => (r.joining_status || "not_joined") === joiningStatusFilter);
    }
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
      candidate_name: record.candidate_name || "",
      email: record.email || "",
      phone: record.phone || "",
      position: record.position || "",
      department_id: record.department_id ? String(record.department_id) : "",
      manager_id: record.manager_id ? String(record.manager_id) : "",
      joining_date: record.joining_date || "",
      notes: record.notes || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errors = {};
    if (!formData.candidate_name.trim()) errors.candidate_name = "Name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
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
      };
      if (editId) {
        await updateOnboardingRecord(editId, payload);
      } else {
        await createOnboardingRecord(payload);
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

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateOnboardingRecord(id, { status: newStatus });
      await fetchRecords();
    } catch (err) {
      setError(err.message || "Failed to update status");
    }
  };

  const handleJoiningStatusChange = async (id, newJoiningStatus) => {
    try {
      await updateOnboardingRecord(id, { joining_status: newJoiningStatus });
      await fetchRecords();
    } catch (err) {
      setError(err.message || "Failed to update joining status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this onboarding record?")) return;
    try {
      await deleteOnboardingRecord(id);
      await fetchRecords();
    } catch (err) {
      setError(err.message || "Failed to delete record");
    }
  };

  const handleConvertToEmployee = async (record) => {
    if (!window.confirm(`Convert ${record.candidate_name} to an employee?`)) return;
    try {
      await updateOnboardingRecord(record.id, {
        status: "completed",
        joining_status: "joined",
      });
      setError(null);
      await fetchRecords();
    } catch (err) {
      setError(err.message || "Failed to convert to employee");
    }
  };

  const handleToggleTask = async (taskId, currentCompleted) => {
    try {
      await updateOnboardingTask(taskId, { completed: !currentCompleted });
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      setError(err.message || "Failed to update task");
    }
  };

  const handleAddTask = async (recordId) => {
    if (!newTaskTitle.trim()) return;
    try {
      await createOnboardingTask({
        employee_id: recordId,
        title: newTaskTitle.trim(),
      });
      setNewTaskTitle("");
      fetchTasks(recordId);
    } catch (err) {
      setError(err.message || "Failed to add task");
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteOnboardingTask(taskId);
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      setError(err.message || "Failed to delete task");
    }
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = ["Candidate Name", "Email", "Phone", "Position", "Department", "Status", "Joining Date", "Joining Status", "Notes"];
      const rows = filtered.map((r) => [
        r.candidate_name || "",
        r.email || "",
        r.phone || "",
        r.position || "",
        r.department_name || r.department || "",
        STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status || "",
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
      setError(err.message || "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const stats = useMemo(() => {
    const total = records.length;
    const counts = {};
    STATUS_OPTIONS.forEach((s) => { counts[s.value] = 0; });
    records.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return { total, ...counts };
  }, [records]);

  const nextStatuses = (current) => STATUS_FLOW[current] || [];

  if (loading && records.length === 0) {
    return (
      <HRPage title="New Hires" subtitle="Manage new hire onboarding records.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading new hires...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="New Hires" subtitle="Manage new hire onboarding records.">
      <SubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
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
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-lg font-bold ${s.value === "cancelled" ? "text-red-600" : s.value === "completed" ? "text-green-600" : "text-blue-600"}`}>
                {stats[s.value] || 0}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name, email, position..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name || `Dept #${d.id}`}</option>
              ))}
            </select>
            <select
              value={joiningStatusFilter}
              onChange={(e) => { setJoiningStatusFilter(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Joining Status</option>
              {JOINING_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
              className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + New Onboarding
            </button>
          </div>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">
              {records.length === 0 ? "No new hire records yet." : "No records match your search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="w-8 px-2 py-3"></th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Candidate</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Email</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Position</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Department</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining Date</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining Status</th>
                    <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-3">
                        <button
                          onClick={() => handleToggleExpand(r.id)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          {expandedId === r.id ? "\u25BC" : "\u25B6"}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">{r.candidate_name}</td>
                      <td className="px-3 py-3 text-gray-500">{r.email}</td>
                      <td className="px-3 py-3 text-gray-700">{r.position}</td>
                      <td className="px-3 py-3 text-gray-500">{r.department_name || r.department || "-"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ""}`}>
                          {STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">{r.joining_date || "-"}</td>
                      <td className="px-3 py-3">
                        <select
                          value={r.joining_status || "not_joined"}
                          onChange={(e) => handleJoiningStatusChange(r.id, e.target.value)}
                          className={`text-xs rounded px-1 py-0.5 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 ${JOINING_STATUS_COLORS[r.joining_status || "not_joined"] || ""}`}
                        >
                          {JOINING_STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button onClick={() => openEdit(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>
                          {r.status === "in_progress" && (
                            <button onClick={() => handleConvertToEmployee(r)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium px-1 whitespace-nowrap">
                              Convert to Employee
                            </button>
                          )}
                          {nextStatuses(r.status).map((ns) => (
                            <button
                              key={ns}
                              onClick={() => handleStatusChange(r.id, ns)}
                              className={`text-xs px-1 font-medium ${
                                ns === "cancelled" ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"
                              }`}
                            >
                              {ns === "offer_accepted" ? "Accept" :
                               ns === "pre_joining" ? "Pre-Join" :
                               ns === "in_progress" ? "Start" :
                               ns === "completed" ? "Complete" :
                               ns === "cancelled" ? "Cancel" : ns}
                            </button>
                          ))}
                          <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 text-xs px-1">Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expandedId && (
              <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                {(() => {
                  const rec = records.find((r) => r.id === expandedId);
                  const recordTasks = tasks[expandedId] || [];
                  return (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-gray-700">Checklist for {rec?.candidate_name}</h4>
                      {tasksLoading ? (
                        <div className="text-xs text-gray-400">Loading tasks...</div>
                      ) : recordTasks.length === 0 ? (
                        <div className="text-xs text-gray-400">No checklist items yet.</div>
                      ) : (
                        <ul className="space-y-1">
                          {recordTasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={t.completed}
                                onChange={() => handleToggleTask(t.id, t.completed)}
                                className="rounded border-gray-300"
                              />
                              <span className={t.completed ? "line-through text-gray-400" : "text-gray-700"}>{t.title}</span>
                              {t.due_date && <span className="text-xs text-gray-400">due {t.due_date}</span>}
                              <button onClick={() => handleDeleteTask(t.id)} className="text-red-400 hover:text-red-600 text-xs ml-auto">&times;</button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="New checklist item..."
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(expandedId); } }}
                          className="border border-gray-200 rounded px-2 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => handleAddTask(expandedId)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded font-medium">Add</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {safePage} of {totalPages}</span>
                <div className="flex gap-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editId ? "Edit Onboarding" : "New Onboarding"}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dept ID</label>
                  <input type="number" min="1" value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager ID</label>
                  <input type="number" min="1" value={formData.manager_id} onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                  <input type="date" value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
