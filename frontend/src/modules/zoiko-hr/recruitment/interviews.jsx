import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Search, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, User, Clock, AlertCircle, Plus, X, Edit2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getInterviews, createInterview, updateInterview, updateInterviewFeedback } from "../../../service/hrService";

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
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

function TypeBadge({ type }) {
  const m = { phone: "bg-blue-100 text-blue-800", video: "bg-purple-100 text-purple-800", in_person: "bg-green-100 text-green-800", "in-person": "bg-green-100 text-green-800" };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${m[type] || "bg-gray-100 text-gray-800"}`}>{type?.replace(/_/g, " ")}</span>;
}

const PIPELINE_STAGES = ["scheduled", "in_progress", "completed", "cancelled"];

const PAGE_SIZE = 8;

const initForm = { candidate_name: "", position: "", interview_type: "video", interview_date: "", start_time: "", interviewer: "", status: "scheduled", feedback: "" };

export default function Interviews() {
  const [tab, setTab] = useState("pipeline");
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...initForm });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getInterviews({ per_page: 100 }).then((d) => {
      setInterviews(Array.isArray(d) ? d : d?.items || d?.data || []);
    }).catch((err) => {
      console.error("Interviews load error:", err);
      setError("Failed to load interview data.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const pipeline = {};
  PIPELINE_STAGES.forEach((s) => { pipeline[s] = []; });
  interviews.forEach((item) => {
    const stage = item.status || "scheduled";
    if (!pipeline[stage]) pipeline[stage] = [];
    pipeline[stage].push(item);
  });

  const moveCandidate = async (interviewId, fromStage, direction) => {
    const idx = PIPELINE_STAGES.indexOf(fromStage);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return;
    const newStage = PIPELINE_STAGES[newIdx];
    try {
      await updateInterview(interviewId, { status: newStage });
      load();
    } catch (err) {
      console.error("Move error:", err);
    }
  };

  const filteredSchedule = interviews.filter((e) => {
    if (search && !e.candidate_name?.toLowerCase().includes(search.toLowerCase()) && !e.position?.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && e.interview_type !== typeFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSchedule.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredSchedule.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => { setEditItem(null); setForm({ ...initForm }); setShowModal(true); };
  const openEdit = (e) => {
    setEditItem(e);
    setForm({
      candidate_name: e.candidate_name || "",
      position: e.position || "",
      interview_type: e.interview_type || "video",
      interview_date: e.interview_date ? e.interview_date.split("T")[0] : "",
      start_time: e.start_time || "",
      interviewer: e.interviewer || "",
      status: e.status || "scheduled",
      feedback: e.feedback || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        candidate_name: form.candidate_name,
        position: form.position,
        interview_type: form.interview_type,
        interview_date: form.interview_date,
        start_time: form.start_time,
        interviewer: form.interviewer,
        status: form.status,
        feedback: form.feedback,
      };
      if (editItem) {
        await updateInterview(editItem.id, payload);
      } else {
        await createInterview(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      console.error("Save interview error:", err);
      setError(err.message || "Failed to save interview.");
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this interview?")) return;
    try {
      await updateInterview(id, { status: "cancelled" });
      load();
    } catch (err) {
      console.error("Cancel interview error:", err);
      setError(err.message || "Failed to cancel interview.");
    }
  };

  const handleAddFeedback = async (id) => {
    const feedback = window.prompt("Enter feedback:");
    if (!feedback) return;
    try {
      await updateInterviewFeedback(id, { feedback });
      load();
    } catch (err) {
      console.error("Feedback error:", err);
      setError(err.message || "Failed to add feedback.");
    }
  };

  if (loading) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  if (error) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm">Try Again</button></div></div></HRPage>;

  return (
    <HRPage title="Interviews" subtitle="Pipeline and schedule management">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <button onClick={() => { setTab("pipeline"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "pipeline" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Pipeline</button>
            <button onClick={() => { setTab("schedule"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "schedule" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Schedule</button>
          </div>
          {tab === "schedule" && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Schedule Interview
            </button>
          )}
        </div>

        {tab === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const cards = pipeline[stage] || [];
              return (
                <div key={stage} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage.replace(/_/g, " ")}</h3>
                    <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[100px]">
                    {cards.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No interviews</p>
                    ) : (
                      cards.map((c) => (
                        <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.candidate_name || `Candidate #${c.id}`}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{c.position || "-"}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            {c.interview_type && <TypeBadge type={c.interview_type} />}
                            {c.interview_date && <span className="text-xs text-gray-400">{formatDate(c.interview_date)}</span>}
                          </div>
                          {c.feedback && <p className="text-xs text-gray-500 mt-1 italic truncate">"{c.feedback}"</p>}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                            <button onClick={() => moveCandidate(c.id, stage, -1)} disabled={PIPELINE_STAGES.indexOf(stage) === 0} className="text-xs text-gray-400 hover:text-orange-600 disabled:opacity-20 p-1"><ChevronLeft className="w-3.5 h-3.5" /></button>
                            <span className="text-[10px] text-gray-300">move</span>
                            <button onClick={() => moveCandidate(c.id, stage, 1)} disabled={PIPELINE_STAGES.indexOf(stage) === PIPELINE_STAGES.length - 1} className="text-xs text-gray-400 hover:text-orange-600 disabled:opacity-20 p-1"><ChevronRightIcon className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "schedule" && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search events..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="">All Types</option>
                <option value="phone">Phone Screen</option>
                <option value="video">Video</option>
                <option value="in_person">In-Person</option>
              </select>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    {["Candidate", "Position", "Type", "Assignee", "Date / Time", "Status", ""].map((h) => (
                      <th key={h} className="px-3 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                      <td className="px-3 py-3 font-medium text-gray-900">{e.candidate_name || "-"}</td>
                      <td className="px-3 py-3 text-gray-500">{e.position || "-"}</td>
                      <td className="px-3 py-3"><TypeBadge type={e.interview_type} /></td>
                      <td className="px-3 py-3 text-gray-500">{e.interviewer || "-"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {e.interview_date ? formatDate(e.interview_date) : "-"}
                          {e.start_time && <span>{e.start_time}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${e.status === "completed" ? "bg-green-100 text-green-800" : e.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{e.status || "scheduled"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2 items-center">
                          <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-orange-600"><Edit2 className="w-4 h-4" /></button>
                          {e.status !== "cancelled" && e.status !== "completed" && (
                            <>
                              <button onClick={() => handleCancel(e.id)} className="text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                              <button onClick={() => handleAddFeedback(e.id)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Feedback</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No events found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{filteredSchedule.length} total event(s)</span>
              <div className="flex items-center gap-2">
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Interview" : "Schedule Interview"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Candidate Name</label>
                  <input value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Position</label>
                  <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Type</label>
                  <select value={form.interview_type} onChange={(e) => setForm({ ...form, interview_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="phone">Phone Screen</option>
                    <option value="video">Video</option>
                    <option value="in_person">In-Person</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Date</label>
                  <input type="date" value={form.interview_date} onChange={(e) => setForm({ ...form, interview_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Start Time</label>
                  <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Interviewer</label>
                <input value={form.interviewer} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Feedback</label>
                <textarea value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700">{editItem ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
