import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Search, ChevronLeft, ChevronRight, User, Clock, AlertCircle, Plus, X, Edit2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getInterviews, createInterview, updateInterview, updateInterviewFeedback } from "../../../service/hrService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { INTERVIEW_STATUSES, STATUS_LABELS, cardActions, statusOptions, validateInterviewForm } from "../../../utils/interviewFlow";

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
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
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

function TypeBadge({ type }) {
  const m = { phone: "bg-blue-100 text-blue-800", video: "bg-blue-100 text-blue-800", in_person: "bg-green-100 text-green-800", "in-person": "bg-green-100 text-green-800" };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${m[type] || "bg-gray-100 text-gray-800"}`}>{type?.replace(/_/g, " ")}</span>;
}

const PIPELINE_STAGES = INTERVIEW_STATUSES;

const PAGE_SIZE = 8;

const initForm = { candidate_name: "", position: "", interview_type: "video", interview_date: "", start_time: "", interviewer: "", status: "scheduled", feedback: "" };

export default function Interviews() {
  const [tab, setTab] = useState("pipeline");
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);       // the page could not load
  const [notice, setNotice] = useState("");        // an action failed: a banner, the page stays
  const [errors, setErrors] = useState({});        // field messages in the dialog
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
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

  const changeStatus = async (interview, action) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setNotice("");
    try {
      await updateInterview(interview.id, { status: action.status });
    } catch (err) {
      setNotice(err?.message || "The status could not be changed.");
    }
    load();
  };

  const filteredSchedule = interviews.filter((e) => {
    if (search && !e.candidate_name?.toLowerCase().includes(search.toLowerCase()) && !e.position?.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && e.interview_type !== typeFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSchedule.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredSchedule.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => { setEditItem(null); setForm({ ...initForm }); setErrors({}); setSaveError(""); setShowModal(true); };
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };
  const fieldError = (name) => (errors[name] ? <p role="alert" className="text-xs text-red-600 mt-1">{errors[name]}</p> : null);
  const inputClass = (name) => `w-full border rounded-lg px-3 py-2 text-sm ${errors[name] ? "border-red-400" : "border-gray-200"}`;
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
    setErrors({}); setSaveError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    const found = validateInterviewForm(form);
    setErrors(found);
    setSaveError("");
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const payload = {
        candidate_name: form.candidate_name.trim(),
        position: form.position.trim(),
        interview_type: form.interview_type,
        interview_date: form.interview_date,
        start_time: form.start_time || null,
        interviewer: form.interviewer.trim() || null,
        feedback: form.feedback.trim() || null,
      };
      if (editItem) {
        // the status is sent only when it was changed, so saving details never touches it
        if (form.status !== (editItem.status || "scheduled")) payload.status = form.status;
        await updateInterview(editItem.id, payload);
      } else {
        await createInterview(payload);
      }
      setShowModal(false);
      setNotice("");
      load();
    } catch (err) {
      setSaveError(err?.message || "The interview could not be saved. Please try again.");
    } finally {
      setSaving(false);
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
      setNotice(err.message || "Failed to add feedback.");
    }
  };

  if (loading) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  if (error) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Try Again</button></div></div></HRPage>;

  return (
    <HRPage title="Interviews" subtitle="Pipeline and schedule management">
      <SubNav />
      <div className="space-y-6">
        {notice ? (
          <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss" className="text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <button onClick={() => { setTab("pipeline"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "pipeline" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Pipeline</button>
            <button onClick={() => { setTab("schedule"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "schedule" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Schedule</button>
          </div>
          {tab === "schedule" && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
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
                          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
                            {cardActions(c.status || stage).map((act) => (
                              <button key={act.status} onClick={() => changeStatus(c, act)}
                                className={`text-xs px-2 py-1 rounded-md font-medium ${act.tone === "green" ? "bg-green-100 text-green-700 hover:bg-green-200" : act.tone === "red" ? "bg-red-50 text-red-600 hover:bg-red-100" : act.tone === "blue" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                {act.text}
                              </button>
                            ))}
                            {cardActions(c.status || stage).length === 0 ? <span className="text-[11px] text-gray-400">Final</span> : null}
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
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${e.status === "completed" ? "bg-green-100 text-green-800" : e.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{STATUS_LABELS[e.status] || e.status || "Scheduled"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2 items-center">
                          <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          {e.status !== "cancelled" && (
                            <button onClick={() => handleAddFeedback(e.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Feedback</button>
                          )}
                          {cardActions(e.status || "scheduled").map((act) => (
                            <button key={act.status} onClick={() => changeStatus(e, act)} className={`text-xs font-medium ${act.tone === "red" ? "text-red-600 hover:text-red-800" : act.tone === "green" ? "text-green-700 hover:text-green-900" : "text-gray-600 hover:text-gray-800"}`}>{act.text}</button>
                          ))}
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
          <form noValidate onSubmit={(ev) => { ev.preventDefault(); handleSave(); }} className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Interview" : "Schedule Interview"}</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Fields marked <span className="text-red-500">*</span> are required.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="iv-name" className="text-xs text-gray-500 font-medium">Candidate Name <span className="text-red-500">*</span></label>
                  <input id="iv-name" value={form.candidate_name} maxLength={150} aria-invalid={!!errors.candidate_name} onChange={(e) => setField("candidate_name", e.target.value)} className={inputClass("candidate_name")} />
                  {fieldError("candidate_name")}
                </div>
                <div>
                  <label htmlFor="iv-position" className="text-xs text-gray-500 font-medium">Position <span className="text-red-500">*</span></label>
                  <input id="iv-position" value={form.position} maxLength={150} aria-invalid={!!errors.position} onChange={(e) => setField("position", e.target.value)} className={inputClass("position")} />
                  {fieldError("position")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="iv-type" className="text-xs text-gray-500 font-medium">Type</label>
                  <select id="iv-type" value={form.interview_type} onChange={(e) => setField("interview_type", e.target.value)} className={inputClass("interview_type")}>
                    <option value="phone">Phone Screen</option>
                    <option value="video">Video</option>
                    <option value="in_person">In-Person</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="iv-status" className="text-xs text-gray-500 font-medium">Status</label>
                  {editItem ? (
                    <select id="iv-status" value={form.status} disabled={statusOptions(editItem.status).length === 1} onChange={(e) => setField("status", e.target.value)} className={inputClass("status")}>
                      {statusOptions(editItem.status).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <p id="iv-status" className="px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg border border-gray-100">Scheduled</p>
                  )}
                  {editItem && statusOptions(editItem.status).length === 1 ? <p className="text-[11px] text-gray-400 mt-1">A completed interview is final.</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="iv-date" className="text-xs text-gray-500 font-medium">Date <span className="text-red-500">*</span></label>
                  <input id="iv-date" type="date" value={form.interview_date} aria-invalid={!!errors.interview_date} onChange={(e) => setField("interview_date", e.target.value)} className={inputClass("interview_date")} />
                  {fieldError("interview_date")}
                </div>
                <div>
                  <label htmlFor="iv-time" className="text-xs text-gray-500 font-medium">Start Time</label>
                  <input id="iv-time" type="time" value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} className={inputClass("start_time")} />
                </div>
              </div>
              <div>
                <label htmlFor="iv-interviewer" className="text-xs text-gray-500 font-medium">Interviewer</label>
                <input id="iv-interviewer" value={form.interviewer} maxLength={150} onChange={(e) => setField("interviewer", e.target.value)} className={inputClass("interviewer")} />
                {fieldError("interviewer")}
              </div>
              <div>
                <label htmlFor="iv-feedback" className="text-xs text-gray-500 font-medium">Feedback</label>
                <textarea id="iv-feedback" value={form.feedback} onChange={(e) => setField("feedback", e.target.value)} className={inputClass("feedback")} rows={2} />
              </div>
            </div>
            {saveError ? <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p> : null}
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving..." : editItem ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </HRPage>
  );
}
