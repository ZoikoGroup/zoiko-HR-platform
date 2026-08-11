import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingRecords, updateOnboardingRecord, getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask } from "../../../service/hrService";

const PRE_STATUSES = ["offer_sent", "offer_accepted", "pre_joining"];

const STATUS_BADGES = {
  offer_sent: "bg-blue-100 text-blue-800",
  offer_accepted: "bg-indigo-100 text-indigo-800",
  pre_joining: "bg-purple-100 text-purple-800",
};

const STATUS_LABELS = {
  offer_sent: "Offer Sent",
  offer_accepted: "Offer Accepted",
  pre_joining: "Pre-Joining",
};

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

export default function PreOnboarding() {
  const [records, setRecords] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [sendingId, setSendingId] = useState(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOnboardingRecords();
      const arr = Array.isArray(data) ? data : [];
      setRecords(arr.filter((r) => PRE_STATUSES.includes(r.status)));
    } catch (err) {
      setError(err.message || "Failed to load pre-onboarding records");
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

  const showAction = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const handleSendOffer = async (record) => {
    setSendingId(record.id);
    try {
      await updateOnboardingRecord(record.id, { status: "offer_sent" });
      showAction("success", `Offer letter sent to ${record.candidate_name}`);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to send offer letter");
    } finally {
      setSendingId(null);
    }
  };

  const handleAcceptOffer = async (record) => {
    try {
      await updateOnboardingRecord(record.id, { status: "offer_accepted" });
      showAction("success", `${record.candidate_name} accepted the offer`);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to accept offer");
    }
  };

  const handleMoveToPreJoining = async (record) => {
    try {
      await updateOnboardingRecord(record.id, { status: "pre_joining" });
      showAction("success", `${record.candidate_name} moved to Pre-Joining`);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to move to pre-joining");
    }
  };

  const handleCompletePreJoining = async (record) => {
    try {
      await updateOnboardingRecord(record.id, { status: "in_progress" });
      showAction("success", `${record.candidate_name} completed pre-joining`);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to complete pre-joining");
    }
  };

  const handleToggleTask = async (taskId, currentCompleted) => {
    try {
      await updateOnboardingTask(taskId, { completed: !currentCompleted });
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      showAction("error", err.message || "Failed to update task");
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
      showAction("error", err.message || "Failed to add task");
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteOnboardingTask(taskId);
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      showAction("error", err.message || "Failed to delete task");
    }
  };

  const handleCancel = async (record) => {
    try {
      await updateOnboardingRecord(record.id, { status: "cancelled" });
      showAction("success", `Onboarding cancelled for ${record.candidate_name}`);
      await fetchRecords();
    } catch (err) {
      showAction("error", err.message || "Failed to cancel");
    }
  };

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
    return result;
  }, [records, search, statusFilter]);

  const stats = useMemo(() => {
    const counts = { offer_sent: 0, offer_accepted: 0, pre_joining: 0 };
    records.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });
    return { total: records.length, ...counts };
  }, [records]);

  if (loading && records.length === 0) {
    return (
      <HRPage title="Pre-Onboarding" subtitle="Manage offer letters, acceptances, and pre-joining tasks.">
        <OnboardingSubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading pre-onboarding records...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Pre-Onboarding" subtitle="Manage offer letters, acceptances, and pre-joining tasks.">
      <OnboardingSubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {actionMsg.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg flex justify-between items-center ${
          actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg({ type: "", text: "" })} className="font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total Pre-Onboarding</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Offer Sent</p>
            <p className="text-lg font-bold text-blue-600">{stats.offer_sent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Offer Accepted</p>
            <p className="text-lg font-bold text-indigo-600">{stats.offer_accepted}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Pre-Joining</p>
            <p className="text-lg font-bold text-purple-600">{stats.pre_joining}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name, email, position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {PRE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">
              {records.length === 0 ? "No pre-onboarding records yet." : "No records match your search."}
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
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining</th>
                    <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => (
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
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[r.status] || ""}`}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">{r.joining_date || "-"}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {r.status === "offer_sent" && (
                            <>
                              <button
                                onClick={() => handleAcceptOffer(r)}
                                className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-1"
                              >
                                Accept Offer
                              </button>
                              <button
                                onClick={() => handleCancel(r)}
                                className="text-red-400 hover:text-red-600 text-xs px-1"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {r.status === "offer_accepted" && (
                            <>
                              <button
                                onClick={() => handleMoveToPreJoining(r)}
                                className="text-purple-600 hover:text-purple-800 text-xs font-medium px-1"
                              >
                                Start Pre-Joining
                              </button>
                              <button
                                onClick={() => handleCancel(r)}
                                className="text-red-400 hover:text-red-600 text-xs px-1"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {r.status === "pre_joining" && (
                            <>
                              <button
                                onClick={() => handleCompletePreJoining(r)}
                                className="text-green-600 hover:text-green-800 text-xs font-medium px-1"
                              >
                                Complete Pre-Joining
                              </button>
                              <button
                                onClick={() => handleCancel(r)}
                                className="text-red-400 hover:text-red-600 text-xs px-1"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {!r.status || r.status === "new" ? (
                            <button
                              onClick={() => handleSendOffer(r)}
                              disabled={sendingId === r.id}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                            >
                              {sendingId === r.id ? "Sending..." : "Send Offer Letter"}
                            </button>
                          ) : null}
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
                      <h4 className="text-sm font-bold text-gray-700">Pre-Onboarding Checklist for {rec?.candidate_name}</h4>
                      {tasksLoading ? (
                        <div className="text-xs text-gray-400">Loading tasks...</div>
                      ) : recordTasks.length === 0 ? (
                        <div className="text-xs text-gray-400">No checklist items yet. Add one below.</div>
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
                      {rec?.status === "pre_joining" && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add pre-joining task..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(expandedId); } }}
                            className="border border-gray-200 rounded px-2 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button onClick={() => handleAddTask(expandedId)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded font-medium">Add</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </HRPage>
  );
}
