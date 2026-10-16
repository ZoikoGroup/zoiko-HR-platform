import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Search, ChevronLeft, ChevronRight, MapPin, Building2, Clock, Users, AlertCircle, X, Edit2, Trash2, CheckCircle2, Loader2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getRequisitions, createRequisition, updateRequisition, deleteRequisition, approveRequisition, rejectRequisition, submitRequisition, holdRequisition, resumeRequisition, closeRequisition } from "../../../service/hrService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/recruitment" },
  { label: "Job Requisitions", href: "/zoiko-hr/recruitment/job-requisitions" },
  { label: "Candidates", href: "/zoiko-hr/recruitment/candidates" },
  { label: "Interviews", href: "/zoiko-hr/recruitment/interviews" },
  { label: "Offer Management", href: "/zoiko-hr/recruitment/offers" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/recruitment"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}


function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return formatDateUtil(dateStr); }
  catch { return dateStr; }
}

function StatusBadge({ status }) {
  const m = { draft: "bg-gray-100 text-gray-800", pending: "bg-yellow-100 text-yellow-800", open: "bg-green-100 text-green-800", closed: "bg-gray-100 text-gray-500", on_hold: "bg-orange-100 text-orange-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

const PAGE_SIZE = 8;
const PRIORITY_STYLE = { low: "bg-gray-100 text-gray-600", medium: "bg-blue-50 text-blue-700", high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700" };
const EMPTY_FORM = { title: "", department: "", location: "", openings: 1, priority: "medium", description: "", requirements: "" };

export default function JobRequisitions() {
  const [tab, setTab] = useState("requisitions");
  const [requisitions, setRequisitions] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRequisitions({ per_page: 100 }).then((reqs) => {
      const list = Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || [];
      setRequisitions(list);
      setPositions(list.filter((r) => r.status === "open"));
    }).catch((err) => {
      console.error("Requisitions load error:", err);
      setError(err.message || "Failed to load requisitions data.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const depts = [...new Set([...requisitions, ...positions].map((r) => r.department).filter(Boolean))];
  const locs = [...new Set(positions.map((p) => p.location).filter(Boolean))];

  const filteredReqs = requisitions.filter((r) => {
    if (search && !r.title?.toLowerCase().includes(search.toLowerCase()) && !r.department?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (deptFilter && r.department !== deptFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredReqs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredReqs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filteredPositions = positions.filter((p) => {
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase()) && !p.department?.toLowerCase().includes(search.toLowerCase())) return false;
    if (deptFilter && p.department !== deptFilter) return false;
    if (locFilter && p.location !== locFilter) return false;
    return true;
  });

  const openCreate = () => { setEditItem(null); setForm({ ...EMPTY_FORM }); setFormError(null); setShowModal(true); };
  const openEdit = (r) => {
    setEditItem(r);
    setForm({ title: r.title, department: r.department || "", location: r.location || "", openings: r.openings || 1, priority: r.priority || "medium", description: r.description || "", requirements: r.requirements || "" });
    setFormError(null);
    setShowModal(true);
  };

  // submitForApproval: create as "pending" (admins are emailed) instead of a draft.
  const handleSave = async (submitForApproval = false) => {
    setFormError(null);
    if (!form.title.trim() || !form.department.trim()) {
      setFormError("Title and department are required.");
      return;
    }
    const openings = Number(form.openings);
    if (!Number.isInteger(openings) || openings < 1) {
      setFormError("Openings must be a whole number of at least 1.");
      return;
    }
    const payload = {
      title: form.title.trim(),
      department: form.department.trim(),
      location: form.location.trim() || null,
      openings,
      priority: form.priority,
      description: form.description.trim() || null,
      requirements: form.requirements.trim() || null,
    };
    setSaving(true);
    try {
      if (editItem) {
        await updateRequisition(editItem.id, payload);
        setNotice("Requisition updated.");
      } else {
        await createRequisition({ ...payload, status: submitForApproval ? "pending" : "draft" });
        setNotice(submitForApproval ? "Requisition submitted. Organization admins were emailed for approval." : "Requisition saved as a draft.");
      }
      setShowModal(false);
      load();
    } catch (err) {
      setFormError(err.message || "Failed to save requisition.");
    } finally {
      setSaving(false);
    }
  };

  const act = async (r, fn, ok, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(r.id);
    setActionError(null);
    try {
      await fn(r.id);
      setNotice(ok);
      load();
    } catch (err) {
      setActionError(err.message || "The action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const headers = ["Title", "Department", "Location", "Status", "Openings", "Filled", "Candidates", "Created"];
    const rows = filteredReqs.map((r) => [r.title, r.department, r.location, r.status, r.openings, r.filled || 0, r.candidate_count || 0, formatDate(r.created_at)]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${c || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "requisitions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && requisitions.length === 0) return <HRPage title="Job Requisitions" subtitle="Manage hiring requests and open positions"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;
  if (error && requisitions.length === 0) return <HRPage title="Job Requisitions" subtitle="Manage hiring requests and open positions"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm">Try Again</button></div></div></HRPage>;

  return (
    <HRPage title="Job Requisitions" subtitle="Manage hiring requests and open positions">
      <SubNav />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            <button onClick={() => { setTab("requisitions"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "requisitions" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Requisitions</button>
            <button onClick={() => { setTab("positions"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "positions" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Open Positions</button>
          </div>
          {tab === "requisitions" && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</button>
              <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> New Requisition
              </button>
            </div>
          )}
        </div>

        {actionError && (
          <div className="flex items-center gap-2 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
            <button onClick={() => setActionError(null)} className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 break-words rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
            <button onClick={() => setNotice(null)} className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
          </div>
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20">
            <option value="">All Departments</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {tab === "requisitions" && (
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="on_hold">On Hold</option>
            </select>
          )}
          {tab === "positions" && (
            <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">All Locations</option>
              {locs.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>

        {tab === "requisitions" && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[640px] md:min-w-[860px] text-left">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    {["Title", "Department", "Location", "Status", "Filled / Openings", "Candidates", "Created", ""].map((h) => (
                      <th key={h} className={`px-3 py-3 font-medium whitespace-nowrap ${h === "Location" || h === "Created" ? "hidden md:table-cell" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                      <td className="px-3 py-3 font-medium text-gray-900 min-w-[10rem] break-words">
                        {r.title}
                        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLE[r.priority] || PRIORITY_STYLE.medium}`}>{r.priority || "medium"}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-500"><div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 shrink-0" />{r.department || "-"}</div></td>
                      <td className="hidden md:table-cell px-3 py-3 text-gray-500"><div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" />{r.location || "-"}</div></td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${(r.filled || 0) >= (r.openings || 1) ? "bg-green-500" : "bg-orange-500"}`} style={{ width: `${Math.min(100, ((r.filled || 0) / (r.openings || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{r.filled || 0} / {r.openings || 1}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <NavLink to={`/zoiko-hr/recruitment/candidates?requisition_id=${r.id}`} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                          {r.candidate_count ?? 0} candidate{(r.candidate_count ?? 0) === 1 ? "" : "s"}
                        </NavLink>
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-3 py-3 min-w-[9rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                            {r.status === "draft" && <button disabled={busyId === r.id} onClick={() => act(r, submitRequisition, "Submitted for approval. Admins were emailed.")} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Submit</button>}
                            {(r.status === "draft" || r.status === "pending") && <button disabled={busyId === r.id} onClick={() => act(r, approveRequisition, "Requisition approved and open for candidates.")} className="text-xs text-green-600 hover:text-green-800 font-medium">Approve</button>}
                            {(r.status === "draft" || r.status === "pending") && <button disabled={busyId === r.id} onClick={() => act(r, rejectRequisition, "Requisition rejected.", "Reject this requisition?")} className="text-xs text-red-600 hover:text-red-800 font-medium">Reject</button>}
                            {r.status === "open" && <button disabled={busyId === r.id} onClick={() => act(r, holdRequisition, "Requisition put on hold.")} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Hold</button>}
                            {r.status === "on_hold" && <button disabled={busyId === r.id} onClick={() => act(r, resumeRequisition, "Requisition reopened.")} className="text-xs text-green-600 hover:text-green-800 font-medium">Resume</button>}
                            {(r.status === "open" || r.status === "on_hold") && <button disabled={busyId === r.id} onClick={() => act(r, closeRequisition, "Requisition closed.", "Close this requisition? It will stop accepting candidates.")} className="text-xs text-gray-600 hover:text-gray-800 font-medium">Close</button>}
                            {r.status !== "closed" && <button title="Edit" onClick={() => openEdit(r)} className="-m-1 p-1.5 text-gray-400 hover:text-orange-600"><Edit2 className="w-4 h-4" /></button>}
                            {!r.candidate_count && <button title="Delete" disabled={busyId === r.id} onClick={() => act(r, deleteRequisition, "Requisition deleted.", "Delete this requisition permanently?")} className="-m-1 p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No requisitions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-gray-500">{filteredReqs.length} total requisition(s)</span>
              <div className="flex items-center gap-2">
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}

        {tab === "positions" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPositions.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400">No open positions found</div>
            ) : (
              filteredPositions.map((p) => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="min-w-0 break-words font-semibold text-gray-900">{p.title}</h3>
                    <StatusBadge status={p.status || "open"} />
                  </div>
                  <div className="space-y-2 text-sm text-gray-500">
                    <div className="flex min-w-0 items-center gap-2 break-words"><Building2 className="w-3.5 h-3.5 shrink-0" />{p.department || "-"}</div>
                    <div className="flex min-w-0 items-center gap-2 break-words"><MapPin className="w-3.5 h-3.5 shrink-0" />{p.location || "-"}</div>
                    <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" />{p.filled || 0} / {p.openings || 1} filled</div>
                    {p.created_at && <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Posted {formatDate(p.created_at)}</div>}
                  </div>
                  <NavLink to={`/zoiko-hr/recruitment/candidates?requisition_id=${p.id}`} className="mt-3 inline-block text-xs text-orange-600 hover:text-orange-800 font-medium">
                    {p.candidate_count ?? 0} candidate{(p.candidate_count ?? 0) === 1 ? "" : "s"} →
                  </NavLink>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Requisition" : "New Requisition"}</h2>
              <button onClick={() => setShowModal(false)} className="-m-1.5 p-1.5"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Department</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Location</label>
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Openings{editItem?.filled ? ` (${editItem.filled} filled)` : ""}</label>
                  <input type="number" min={Math.max(1, editItem?.filled || 0)} value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Requirements</label>
                <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            {formError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            {!editItem && <p className="mt-3 text-xs text-gray-400">A requisition opens for candidates only after an organization admin approves it.</p>}
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              {editItem ? (
                <button disabled={saving} onClick={() => handleSave(false)} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">Update</button>
              ) : (
                <>
                  <button disabled={saving} onClick={() => handleSave(false)} className="px-4 py-2 text-sm text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 disabled:opacity-50">Save as draft</button>
                  <button disabled={saving} onClick={() => handleSave(true)} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">Submit for approval</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
