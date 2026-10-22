import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingRecords, updateOnboardingRecord, getOnboardingTasks, createOnboardingTask, updateOnboardingTask,
  deleteOnboardingTask, getOnboardingDocuments, sendOnboardingPortalInvite, requestOnboardingDocuments,
} from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";

const PRE_STATUSES = ["offer_accepted", "pre_joining"];

const STATUS_BADGES = {
  offer_accepted: "bg-emerald-100 text-emerald-800",
  pre_joining: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS = {
  offer_accepted: "Offer Accepted",
  pre_joining: "Pre-Joining",
};

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

const asList = (data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);

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
  if (!r.portal_invited_at) return { text: "Not sent", cls: "text-gray-400" };
  const expired = r.portal_expires_at && new Date(r.portal_expires_at) < new Date();
  if (expired) return { text: `Sent ${formatDate(r.portal_invited_at)} · expired ${formatDate(r.portal_expires_at)}`, cls: "text-red-500" };
  return { text: `Sent ${formatDate(r.portal_invited_at)}${r.portal_expires_at ? ` · valid until ${formatDate(r.portal_expires_at)}` : ""}`, cls: "text-gray-600" };
}

export default function PreOnboarding() {
  const [records, setRecords] = useState([]);
  const [tasks, setTasks] = useState({});
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", due_date: "" });
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [busyId, setBusyId] = useState(null);
  const [links, setLinks] = useState({});
  const [docRequest, setDocRequest] = useState(null);

  const showAction = (type, text) => setActionMsg({ type, text });

  const fetchDocs = async (list) => {
    const results = await Promise.allSettled(list.map((r) => getOnboardingDocuments(r.id)));
    const next = {};
    list.forEach((r, i) => { next[r.id] = results[i].status === "fulfilled" ? asList(results[i].value) : []; });
    setDocs((prev) => ({ ...prev, ...next }));
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      const arr = asList(data).filter((r) => PRE_STATUSES.includes(r.status));
      setRecords(arr);
      setError(null);
      fetchDocs(arr);
    } catch (err) {
      setError(err.message || "Failed to load pre-onboarding records");
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchRecords();
      setLoading(false);
    })();
  }, []);

  const fetchTasks = async (recordId) => {
    setTasksLoading(true);
    try {
      const data = await getOnboardingTasks(recordId);
      setTasks((prev) => ({ ...prev, [recordId]: asList(data) }));
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
      setNewTask({ title: "", description: "", due_date: "" });
      fetchTasks(id);
    }
  };

  const changeStatus = async (record, status, message) => {
    if (status === "cancelled" && !window.confirm(`Cancel onboarding for ${record.candidate_name}?`)) return;
    setBusyId(record.id);
    try {
      await updateOnboardingRecord(record.id, { status });
      showAction("success", message);
      if (expandedId === record.id && !PRE_STATUSES.includes(status)) setExpandedId(null);
      await fetchRecords();
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
      if (expandedId !== record.id) handleToggleExpand(record.id);
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
    } catch (err) {
      showAction("error", err.message || "Failed to request documents");
    } finally {
      setDocRequest(null);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await updateOnboardingTask(task.id, { completed: !task.completed });
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      showAction("error", err.message || "Failed to update task");
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
      showAction("success", "Task added.");
      fetchTasks(recordId);
    } catch (err) {
      showAction("error", err.message || "Failed to add task");
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteOnboardingTask(taskId);
      if (expandedId) fetchTasks(expandedId);
    } catch (err) {
      showAction("error", err.message || "Failed to delete task");
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
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    return result;
  }, [records, search, statusFilter]);

  const stats = useMemo(() => {
    const s = { total: records.length, offer_accepted: 0, pre_joining: 0, linkSent: 0, toReview: 0 };
    records.forEach((r) => {
      if (s[r.status] !== undefined) s[r.status]++;
      if (r.portal_invited_at) s.linkSent++;
      s.toReview += docCounts(docs[r.id] || []).review;
    });
    return s;
  }, [records, docs]);

  if (loading && records.length === 0) {
    return (
      <HRPage title="Pre-Onboarding" subtitle="Track pre-onboarding links, requested documents and pre-joining tasks.">
        <OnboardingSubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading pre-onboarding records...</span>
        </div>
      </HRPage>
    );
  }

  const renderPanel = (rec) => {
    if (!rec) return null;
    const recordTasks = tasks[rec.id] || [];
    const recordDocs = docs[rec.id] || [];
    const link = links[rec.id];
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-gray-700 break-words">Pre-onboarding for {rec.candidate_name}</h4>
        {link?.url && (
          <div className="bg-white rounded-lg border border-gray-100 px-3 sm:px-4 py-3">
            <p className="text-xs text-gray-500 mb-2 break-words">Pre-onboarding link{link.expires_at ? ` (valid until ${formatDate(link.expires_at)})` : ""}:</p>
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={link.url} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[16rem] border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-gray-50" />
              <button onClick={() => handleCopy(link.url)} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded shrink-0">Copy</button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
            <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Documents</h5>
            {recordDocs.length === 0 ? (
              <p className="text-xs text-gray-400">No documents requested yet.</p>
            ) : (
              <ul className="space-y-1">
                {recordDocs.map((d) => (
                  <li key={d.id} className="text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-gray-700 min-w-0 break-words">{d.title}</span>
                      <span className={`whitespace-nowrap px-2 py-0.5 rounded-full font-medium ${DOC_STATUS[d.status]?.cls || "bg-gray-100 text-gray-600"}`}>{DOC_STATUS[d.status]?.label || d.status}</span>
                    </div>
                    {d.status === "rejected" && d.rejection_reason && <p className="text-red-500 mt-0.5 break-words">{d.rejection_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
            {recordDocs.some((d) => d.status === "pending") && (
              <NavLink to="/zoiko-hr/onboarding/documents" className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">Review uploads in Documents</NavLink>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-4 py-3">
            <h5 className="text-xs font-bold text-gray-600 uppercase mb-2">Pre-boarding tasks</h5>
            {tasksLoading ? (
              <div className="text-xs text-gray-400">Loading tasks...</div>
            ) : recordTasks.length === 0 ? (
              <div className="text-xs text-gray-400">No tasks yet. Add one below.</div>
            ) : (
              <ul className="space-y-1 mb-2">
                {recordTasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={!!t.completed} onChange={() => handleToggleTask(t)} className="rounded border-gray-300 mt-1" />
                    <div className="min-w-0 break-words">
                      <span className={t.completed ? "line-through text-gray-400" : "text-gray-700"}>{t.title}</span>
                      {t.due_date && <span className="text-xs text-gray-400 ml-2">due {formatDate(t.due_date)}</span>}
                      {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
                    </div>
                    <button onClick={() => handleDeleteTask(t.id)} className="text-red-400 hover:text-red-600 text-xs ml-auto p-1.5 -my-1.5 shrink-0">&times;</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Add pre-boarding task..."
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
          </div>
        </div>
      </div>
    );
  };

  return (
    <HRPage title="Pre-Onboarding" subtitle="Track pre-onboarding links, requested documents and pre-joining tasks.">
      <OnboardingSubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      {actionMsg.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg flex justify-between items-start gap-3 ${
          actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <span className="min-w-0 break-words">{actionMsg.text}</span>
          <button onClick={() => setActionMsg({ type: "", text: "" })} className="font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400 truncate">Total Pre-Onboarding</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Offer Accepted</p>
            <p className="text-lg font-bold text-emerald-600">{stats.offer_accepted}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Pre-Joining</p>
            <p className="text-lg font-bold text-blue-600">{stats.pre_joining}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Link Sent</p>
            <p className="text-lg font-bold text-blue-600">{stats.linkSent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400 truncate">Documents to Review</p>
            <p className="text-lg font-bold text-amber-600">{stats.toReview}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <input
              type="text"
              placeholder="Search by name, email, position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:max-w-xs sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              {records.length === 0 ? "Nobody is in pre-onboarding right now." : "No records match your search."}
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
                    <th className="hidden md:table-cell text-left px-3 py-3 font-semibold text-gray-600">Position</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Joining</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Pre-onboarding Link</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600">Documents</th>
                    <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => {
                    const ls = linkStatus(r);
                    const dc = docCounts(docs[r.id] || []);
                    const busy = busyId === r.id;
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${expandedId === r.id ? "bg-blue-50/30" : ""}`}>
                        <td className="px-2 py-3">
                          <button onClick={() => handleToggleExpand(r.id)} className="text-gray-400 hover:text-gray-600 text-xs p-1.5" aria-label="Show details">
                            {expandedId === r.id ? "▼" : "▶"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => handleToggleExpand(r.id)} className="font-medium text-gray-800 hover:text-blue-600 text-left">{r.candidate_name}</button>
                          <p className="text-xs text-gray-400 break-all">{r.email}</p>
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 text-gray-700">{r.position}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[r.status] || ""}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.joining_date ? formatDate(r.joining_date) : "-"}</td>
                        <td className={`px-3 py-3 text-xs min-w-[9rem] ${ls.cls}`}>{ls.text}</td>
                        <td className="px-3 py-3 text-xs text-gray-600 min-w-[10rem]">
                          {dc.total === 0 ? (
                            <span className="text-gray-400">None requested</span>
                          ) : (
                            <span>
                              {dc.total} requested · {dc.waiting} awaiting upload · <span className={dc.review ? "text-amber-600 font-medium" : ""}>{dc.review} to review</span> · <span className="text-green-600">{dc.approved} approved</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <button onClick={() => handleSendLink(r)} disabled={busy} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1 whitespace-nowrap disabled:opacity-40">
                              {r.portal_invited_at ? "Resend link" : "Send link"}
                            </button>
                            <button onClick={() => setDocRequest({ record: r, categories: [] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1 whitespace-nowrap">
                              Request documents
                            </button>
                            {r.status === "offer_accepted" && (
                              <button onClick={() => changeStatus(r, "pre_joining", `${r.candidate_name} moved to Pre-Joining.`)} disabled={busy} className="text-green-600 hover:text-green-800 text-xs font-medium px-1 whitespace-nowrap disabled:opacity-40">
                                Move to Pre-Joining
                              </button>
                            )}
                            <button onClick={() => changeStatus(r, "in_progress", `${r.candidate_name} moved to In Progress.`)} disabled={busy} className="text-green-600 hover:text-green-800 text-xs font-medium px-1 whitespace-nowrap disabled:opacity-40">
                              Move to In Progress
                            </button>
                            <button onClick={() => changeStatus(r, "cancelled", `Onboarding cancelled for ${r.candidate_name}.`)} disabled={busy} className="text-red-400 hover:text-red-600 text-xs px-1 disabled:opacity-40">
                              Cancel
                            </button>
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
          </div>
        )}
      </div>

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
    </HRPage>
  );
}
