import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Clock, AlertCircle, Plus, X, Edit2, Trash2, Video, MapPin, Star, CheckCircle2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getInterviews, createInterview, updateInterview, updateInterviewFeedback, deleteInterview, getCandidates } from "../../../service/hrService";
import { getEmployees } from "../../../service/employee";
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

const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
const TIME_ZONES = (() => {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return [BROWSER_TZ, "UTC"].filter(Boolean); }
})();
const TYPE_OPTIONS = [
  ["phone", "Phone screen"], ["video", "Video call"], ["in_person", "In person"], ["technical", "Technical"], ["panel", "Panel"], ["hr", "HR round"],
];
const initForm = {
  candidate_id: "", candidate_name: "", position: "", interview_type: "video", interview_date: "", start_time: "", end_time: "",
  timezone: BROWSER_TZ, meeting_link: "", location: "", interviewer_id: "", interviewer: "", status: "scheduled", notes: "", notify: true,
};
const personName = (e) => e.full_name || `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.email;

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
  const [candidates, setCandidates] = useState([]);
  const [people, setPeople] = useState([]);
  const [success, setSuccess] = useState("");
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({ feedback: "", rating: 0, complete: true });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getInterviews({ per_page: 100 }),
      getCandidates({ per_page: 100 }).catch(() => ({ items: [] })),
      getEmployees({ per_page: 200, include_all_roles: true, status: "active" }).catch(() => ({ items: [] })),
    ]).then(([d, c, e]) => {
      const list = Array.isArray(d) ? d : d?.items || d?.data || [];
      // upcoming first (soonest at the top), then past interviews, most recent first
      const today = new Date().toISOString().slice(0, 10);
      list.sort((a, b) => {
        const fa = (a.interview_date || "") >= today, fb = (b.interview_date || "") >= today;
        if (fa !== fb) return fa ? -1 : 1;
        const ka = `${a.interview_date || ""} ${a.start_time || ""}`, kb = `${b.interview_date || ""} ${b.start_time || ""}`;
        return fa ? ka.localeCompare(kb) : kb.localeCompare(ka);
      });
      setInterviews(list);
      setCandidates((Array.isArray(c) ? c : c?.items || []).filter((x) => x.status !== "hired" && x.status !== "rejected"));
      setPeople(Array.isArray(e) ? e : e?.items || e?.employees || []);
    }).catch((err) => {
      setError(err.message || "Failed to load interview data.");
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

  const emailedText = (n) => (n ? ` ${n} email${n === 1 ? "" : "s"} sent.` : "");

  const changeStatus = async (interview, action) => {
    if (action.status === "scheduled") {          // reschedule: pick the new date and time first
      openEdit(interview, { status: "scheduled" });
      return;
    }
    if (action.confirm && !window.confirm(`${action.confirm} The candidate and interviewer are emailed.`)) return;
    setNotice("");
    try {
      const r = await updateInterview(interview.id, { status: action.status });
      setSuccess(`Interview ${STATUS_LABELS[action.status]?.toLowerCase() || action.status}.${emailedText(r?.emails_sent)}`);
    } catch (err) {
      setNotice(err?.message || "The status could not be changed.");
    }
    load();
  };

  const handleDelete = async (iv) => {
    if (!window.confirm("Delete this interview? No email is sent; cancel it instead to tell the candidate.")) return;
    try {
      await deleteInterview(iv.id);
      setSuccess("Interview deleted.");
      load();
    } catch (err) {
      setNotice(err?.message || "The interview could not be deleted.");
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

  const openCreate = () => { setEditItem(null); setForm({ ...initForm }); setErrors({}); setSaveError(""); setShowModal(true); };
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };
  const fieldError = (name) => (errors[name] ? <p role="alert" className="text-xs text-red-600 mt-1">{errors[name]}</p> : null);
  const inputClass = (name) => `w-full border rounded-lg px-3 py-2 text-sm ${errors[name] ? "border-red-400" : "border-gray-200"}`;
  const openEdit = (e, override = {}) => {
    setEditItem(e);
    setForm({
      ...initForm,
      candidate_id: e.candidate_id ? String(e.candidate_id) : "",
      candidate_name: e.candidate_name || "",
      position: e.position || "",
      interview_type: e.interview_type || "video",
      interview_date: e.interview_date ? String(e.interview_date).split("T")[0] : "",
      start_time: e.start_time || "",
      end_time: e.end_time || "",
      timezone: e.timezone || BROWSER_TZ,
      meeting_link: e.meeting_link || "",
      location: e.location || "",
      interviewer_id: e.interviewer_id ? String(e.interviewer_id) : "",
      interviewer: e.interviewer || "",
      status: e.status || "scheduled",
      notes: e.notes || "",
      ...override,
    });
    setErrors({}); setSaveError("");
    setShowModal(true);
  };

  const pickCandidate = (id) => {
    const c = candidates.find((x) => String(x.id) === String(id));
    setForm((prev) => ({ ...prev, candidate_id: id, candidate_name: c ? c.name : prev.candidate_name, position: c ? c.position : prev.position }));
    setErrors((prev) => ({ ...prev, candidate_name: undefined, position: undefined }));
  };

  const handleSave = async () => {
    const found = validateInterviewForm(form);
    setErrors(found);
    setSaveError("");
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const payload = {
        candidate_id: form.candidate_id ? Number(form.candidate_id) : null,
        candidate_name: form.candidate_name.trim() || null,
        position: form.position.trim() || null,
        interview_type: form.interview_type,
        interview_date: form.interview_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        timezone: form.timezone || null,
        meeting_link: form.meeting_link.trim() || null,
        location: form.location.trim() || null,
        interviewer_id: form.interviewer_id ? Number(form.interviewer_id) : null,
        interviewer: form.interviewer_id ? null : (form.interviewer.trim() || null),
        notes: form.notes.trim() || null,
        notify: form.notify,
      };
      let r;
      if (editItem) {
        // the status is sent only when it was changed, so saving details never touches it
        if (form.status !== (editItem.status || "scheduled")) payload.status = form.status;
        r = await updateInterview(editItem.id, payload);
      } else {
        r = await createInterview(payload);
      }
      setShowModal(false);
      setNotice("");
      setSuccess(`${editItem ? "Interview updated." : "Interview scheduled."}${emailedText(r?.emails_sent)}`);
      load();
    } catch (err) {
      setSaveError(err?.message || "The interview could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openFeedback = (iv) => {
    setFeedbackFor(iv);
    setFeedbackForm({ feedback: iv.feedback || "", rating: iv.rating || 0, complete: iv.status !== "completed" });
  };

  const saveFeedback = async () => {
    try {
      const body = { feedback: feedbackForm.feedback.trim() || null, rating: feedbackForm.rating || null };
      if (feedbackForm.complete && feedbackFor.status !== "completed") body.status = "completed";
      await updateInterviewFeedback(feedbackFor.id, body);
      setFeedbackFor(null);
      setSuccess("Feedback saved.");
      load();
    } catch (err) {
      setNotice(err.message || "Failed to save feedback.");
    }
  };

  if (loading && interviews.length === 0) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  if (error && interviews.length === 0) return <HRPage title="Interviews" subtitle="Pipeline and schedule management"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Try Again</button></div></div></HRPage>;

  return (
    <HRPage title="Interviews" subtitle="Pipeline and schedule management">
      <SubNav />
      <div className="space-y-6">
        {notice ? (
          <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss" className="shrink-0 -my-1 px-2 py-0.5 text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        ) : null}
        {success ? (
          <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm font-medium rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{success}</span>
            <button onClick={() => setSuccess("")} aria-label="Dismiss" className="ml-auto shrink-0 -my-1 px-2 py-0.5 text-green-600 hover:text-green-800 text-lg">&times;</button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            <button onClick={() => { setTab("pipeline"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "pipeline" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Pipeline</button>
            <button onClick={() => { setTab("schedule"); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "schedule" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Schedule</button>
          </div>
          {(tab === "schedule" || tab === "pipeline") && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Schedule Interview
            </button>
          )}
        </div>

        {tab === "pipeline" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const cards = pipeline[stage] || [];
              return (
                <div key={stage} className="min-w-0 bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage.replace(/_/g, " ")}</h3>
                    <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[100px]">
                    {cards.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No interviews</p>
                    ) : (
                      cards.map((c) => (
                        <div key={c.id} className="min-w-0 bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.candidate_name || `Candidate #${c.id}`}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{c.position || "-"}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {c.interview_type && <TypeBadge type={c.interview_type} />}
                            {c.interview_date && <span className="text-xs text-gray-400">{formatDate(c.interview_date)}{c.start_time ? ` ${c.start_time}` : ""}</span>}
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
              <div className="relative w-full sm:flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search events..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value="">All Types</option>
                {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[620px] md:min-w-[900px] text-left">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    {["Candidate", "Position", "Type", "Assignee", "Date / Time", "Status", ""].map((h) => (
                      <th key={h} className={`px-3 py-3 font-medium whitespace-nowrap ${h === "Position" || h === "Assignee" ? "hidden md:table-cell" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                      <td className="px-3 py-3 font-medium text-gray-900 min-w-[8rem] break-words">
                        {e.candidate_name || "-"}
                        {!e.candidate_id && <span title="Not linked to a candidate record: the candidate is not emailed" className="ml-1 text-xs text-amber-500">⚠</span>}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-gray-500">{e.position || "-"}</td>
                      <td className="px-3 py-3"><TypeBadge type={e.interview_type} /></td>
                      <td className="hidden md:table-cell px-3 py-3 text-gray-500">{e.interviewer || "-"}</td>
                      <td className="px-3 py-3 min-w-[9rem]">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3 shrink-0" />
                          {e.interview_date ? formatDate(e.interview_date) : "-"}
                          {e.start_time && <span>{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>}
                          {e.timezone && <span className="text-gray-400">({e.timezone})</span>}
                        </div>
                        {e.meeting_link && <a href={e.meeting_link} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-blue-600 hover:underline"><Video className="h-3 w-3" /> Join link</a>}
                        {e.location && <div className="mt-0.5 flex items-center gap-1 break-words text-xs text-gray-400"><MapPin className="h-3 w-3 shrink-0" />{e.location}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${e.status === "completed" ? "bg-green-100 text-green-800" : e.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{STATUS_LABELS[e.status] || e.status || "Scheduled"}</span>
                      </td>
                      <td className="px-3 py-3 min-w-[10rem]">
                        <div className="flex flex-wrap gap-2 items-center">
                          <button title="Edit" onClick={() => openEdit(e)} className="-m-1 p-1.5 text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button title="Delete" onClick={() => handleDelete(e)} className="-m-1 p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          {e.status !== "cancelled" && (
                            <button onClick={() => openFeedback(e)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                              Feedback{e.rating ? <span className="flex items-center text-amber-500"><Star className="h-3 w-3 fill-current" />{e.rating}</span> : null}
                            </button>
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

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <form noValidate onSubmit={(ev) => { ev.preventDefault(); handleSave(); }} className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Interview" : "Schedule Interview"}</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Close" className="-m-1.5 p-1.5"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Fields marked <span className="text-red-500">*</span> are required.</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="iv-cand" className="text-xs text-gray-500 font-medium">Candidate</label>
                <select id="iv-cand" value={form.candidate_id} onChange={(e) => pickCandidate(e.target.value)} className={inputClass("candidate_id")}>
                  <option value="">Not in the candidate list (enter the name)</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.position} ({c.email})</option>)}
                  {editItem?.candidate_id && !candidates.some((c) => String(c.id) === String(editItem.candidate_id)) && <option value={editItem.candidate_id}>{editItem.candidate_name}</option>}
                </select>
                {!form.candidate_id && <p className="text-[11px] text-amber-600 mt-1">Pick a candidate to email them the invitation.</p>}
              </div>
              {!form.candidate_id && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="iv-type" className="text-xs text-gray-500 font-medium">Type</label>
                  <select id="iv-type" value={form.interview_type} onChange={(e) => setField("interview_type", e.target.value)} className={inputClass("interview_type")}>
                    {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="iv-date" className="text-xs text-gray-500 font-medium">Date <span className="text-red-500">*</span></label>
                  <input id="iv-date" type="date" min={editItem ? undefined : new Date().toISOString().slice(0, 10)} value={form.interview_date} aria-invalid={!!errors.interview_date} onChange={(e) => setField("interview_date", e.target.value)} className={inputClass("interview_date")} />
                  {fieldError("interview_date")}
                </div>
                <div>
                  <label htmlFor="iv-time" className="text-xs text-gray-500 font-medium">Start</label>
                  <input id="iv-time" type="time" value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} className={inputClass("start_time")} />
                </div>
                <div>
                  <label htmlFor="iv-end" className="text-xs text-gray-500 font-medium">End</label>
                  <input id="iv-end" type="time" value={form.end_time} onChange={(e) => setField("end_time", e.target.value)} className={inputClass("end_time")} />
                  {fieldError("end_time")}
                </div>
              </div>
              <div>
                <label htmlFor="iv-tz" className="text-xs text-gray-500 font-medium">Time zone</label>
                <select id="iv-tz" value={form.timezone} onChange={(e) => setField("timezone", e.target.value)} className={inputClass("timezone")}>
                  <option value="">Not specified</option>
                  {TIME_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="iv-link" className="text-xs text-gray-500 font-medium">Meeting link</label>
                  <input id="iv-link" type="url" placeholder="https://meet.google.com/..." value={form.meeting_link} onChange={(e) => setField("meeting_link", e.target.value)} className={inputClass("meeting_link")} />
                  {fieldError("meeting_link")}
                </div>
                <div>
                  <label htmlFor="iv-loc" className="text-xs text-gray-500 font-medium">Location</label>
                  <input id="iv-loc" maxLength={255} placeholder="Office / room (in person)" value={form.location} onChange={(e) => setField("location", e.target.value)} className={inputClass("location")} />
                </div>
              </div>
              <div>
                <label htmlFor="iv-interviewer" className="text-xs text-gray-500 font-medium">Interviewer</label>
                <select id="iv-interviewer" value={form.interviewer_id} onChange={(e) => setField("interviewer_id", e.target.value)} className={inputClass("interviewer_id")}>
                  <option value="">Someone outside the system (type the name)</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.email ? ` (${p.email})` : ""}</option>)}
                </select>
                {!form.interviewer_id && (
                  <input aria-label="Interviewer name" value={form.interviewer} maxLength={150} placeholder="Interviewer name" onChange={(e) => setField("interviewer", e.target.value)} className={`${inputClass("interviewer")} mt-2`} />
                )}
                {fieldError("interviewer")}
              </div>
              <div>
                <label htmlFor="iv-notes" className="text-xs text-gray-500 font-medium">Internal notes</label>
                <textarea id="iv-notes" value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={inputClass("notes")} rows={2} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={form.notify} onChange={(e) => setField("notify", e.target.checked)} />
                Email the candidate and interviewer {editItem ? "if the date, time or status changes" : "a calendar invitation"}
              </label>
            </div>
            {saveError ? <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving..." : editItem ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}

      {feedbackFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-2 mb-4">
              <h2 className="min-w-0 break-words text-lg font-semibold">Feedback · {feedbackFor.candidate_name}</h2>
              <button type="button" onClick={() => setFeedbackFor(null)} aria-label="Close" className="shrink-0 -m-1.5 p-1.5"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <label className="text-xs text-gray-500 font-medium">Rating</label>
            <div className="mt-1 mb-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setFeedbackForm({ ...feedbackForm, rating: n === feedbackForm.rating ? 0 : n })}>
                  <Star className={`h-6 w-6 ${n <= feedbackForm.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            <label htmlFor="fb-text" className="text-xs text-gray-500 font-medium">Feedback</label>
            <textarea id="fb-text" rows={4} maxLength={5000} value={feedbackForm.feedback} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            {feedbackFor.status !== "completed" && (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={feedbackForm.complete} onChange={(e) => setFeedbackForm({ ...feedbackForm, complete: e.target.checked })} /> Mark the interview completed
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button type="button" onClick={() => setFeedbackFor(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveFeedback} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save feedback</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
