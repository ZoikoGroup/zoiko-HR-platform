import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingOrientationSessions, createOnboardingOrientationSession, updateOnboardingOrientationSession, deleteOnboardingOrientationSession, getOnboardingOrientationAttendees, createOnboardingOrientationAttendee, updateOnboardingOrientationAttendee, deleteOnboardingOrientationAttendee, getOnboardingRecords } from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import { SESSION_STATUSES, validateSessionForm, sessionPayload, serverSessionErrors, todayIso } from "../../../utils/orientationForm";

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

const ATTENDANCE_STATUS = {
  pending: "text-yellow-600 bg-yellow-50",
  attended: "text-green-600 bg-green-50",
  absent: "text-red-600 bg-red-50",
  excused: "text-gray-600 bg-gray-50",
};

const ATTENDANCE_LABELS = {
  pending: "Pending",
  attended: "Attended",
  absent: "Absent",
  excused: "Excused",
};

const INACTIVE_HIRE = new Set(["completed", "cancelled"]);
const sessionDay = (session) => (session?.date ? String(session.date).slice(0, 10) : "");
const sessionKey = (session) => session.id || session._id;

export default function Orientation() {
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [attendees, setAttendees] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formMeetingLink, setFormMeetingLink] = useState("");
  const [formPresenter, setFormPresenter] = useState("");
  const [formStatus, setFormStatus] = useState("scheduled");
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [expandedSession, setExpandedSession] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState("");
  const [addingAttendee, setAddingAttendee] = useState(false);
  const [notifyAttendee, setNotifyAttendee] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const today = todayIso();

  // success notes fade; errors stay until dismissed
  const showAction = (type, text) => {
    setActionMsg({ type, text });
    if (type === "success") setTimeout(() => setActionMsg((m) => (m.text === text ? { type: "", text: "" } : m)), 6000);
  };

  // sessions carry their attendees; the attendee list is fetched too so every session's counts are current
  const groupAttendees = (sessionList, list) => {
    const grouped = {};
    sessionList.forEach((ses) => { if (Array.isArray(ses.attendees)) grouped[sessionKey(ses)] = ses.attendees; });
    if (Array.isArray(list)) {
      const fromList = {};
      list.forEach((a) => { (fromList[a.session_id] = fromList[a.session_id] || []).push(a); });
      sessionList.forEach((ses) => { const id = sessionKey(ses); grouped[id] = fromList[id] || (Array.isArray(ses.attendees) ? ses.attendees : []); });
    }
    return grouped;
  };

  // reload sessions and attendees after a change; a failure here leaves the page as it was and says so
  const refresh = async () => {
    try {
      const [data, list] = await Promise.all([getOnboardingOrientationSessions(), getOnboardingOrientationAttendees().catch(() => null)]);
      const sessionList = Array.isArray(data) ? data : [];
      setSessions(sessionList);
      setAttendees(groupAttendees(sessionList, list));
    } catch (err) {
      showAction("error", `Saved, but the list could not be refreshed: ${err?.message || "please reload the page."}`);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, recs, list] = await Promise.all([
        getOnboardingOrientationSessions(),
        getOnboardingRecords(),
        getOnboardingOrientationAttendees().catch(() => null),
      ]);
      const sessionList = Array.isArray(data) ? data : [];
      setSessions(sessionList);
      setRecords(Array.isArray(recs) ? recs : Array.isArray(recs?.items) ? recs.items : []);
      setAttendees(groupAttendees(sessionList, list));
      setLoaded(true);
    } catch (err) {
      setError(err?.message || "Failed to load orientation sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleToggleExpand = (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
      setSelectedRecord("");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingSession(null);
    setFormTitle("");
    setFormDate("");
    setFormTime("");
    setFormLocation("");
    setFormMeetingLink("");
    setFormPresenter("");
    setFormStatus("scheduled");
    setFormErrors({});
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setFormTitle(session.title || "");
    setFormDate(session.date || "");
    setFormTime(session.time || "");
    setFormLocation(session.location || "");
    setFormMeetingLink(session.meeting_link || session.meetingLink || "");
    setFormPresenter(session.presenter || "");
    setFormStatus(session.status || "scheduled");
    setFormErrors({});
    setShowForm(true);
  };

  // typing in a field clears that field's message
  const edit = (setter, key) => (e) => {
    setter(e.target.value);
    setFormErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const fieldError = (name) => (formErrors[name] ? <p role="alert" className="text-xs text-red-600 mt-1">{formErrors[name]}</p> : null);
  const boxClass = (name) => `w-full border ${formErrors[name] ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;

  const handleSave = async () => {
    const values = { title: formTitle, date: formDate, time: formTime, location: formLocation, meeting_link: formMeetingLink, presenter: formPresenter, status: formStatus };
    const found = validateSessionForm(values, { originalDate: editingSession?.date ? String(editingSession.date).slice(0, 10) : null });
    if (editingSession && formStatus === "completed" && formDate && formDate > today && !found.date) {
      found.status = "A session can be marked completed only on or after its date.";
    }
    setFormErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const payload = sessionPayload(values, !!editingSession);
      if (editingSession) {
        await updateOnboardingOrientationSession(editingSession.id, payload);
        showAction("success", updateMessage(editingSession, payload));
      } else {
        await createOnboardingOrientationSession(payload);
        showAction("success", "Session created successfully");
      }
      resetForm();
      await refresh();
    } catch (err) {
      // the server's refusal appears under its own field; the dialog stays open so nothing typed is lost
      const fields = serverSessionErrors(err?.validation);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || "The session could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sessionId) => {
    if (!window.confirm("Are you sure you want to delete this orientation session?")) return;
    try {
      await deleteOnboardingOrientationSession(sessionId);
      showAction("success", "Session deleted");
      if (expandedSession === sessionId) setExpandedSession(null);
      await refresh();
    } catch (err) {
      showAction("error", err.message || "Failed to delete session");
    }
  };

  const handleAddAttendee = async (sessionId) => {
    if (!selectedRecord) return;
    setAddingAttendee(true);
    const name = getRecordName(Number(selectedRecord));
    try {
      await createOnboardingOrientationAttendee({
        session_id: sessionId,
        onboarding_record_id: Number(selectedRecord),
        notify: notifyAttendee,
      });
      setSelectedRecord("");
      showAction("success", notifyAttendee ? `${name} was added and emailed an invitation.` : `${name} was added to the session.`);
      await refresh();
    } catch (err) {
      showAction("error", err.message || "Failed to add attendee");
    } finally {
      setAddingAttendee(false);
    }
  };

  const handleUpdateAttendance = async (attendeeId, status) => {
    setBusyId(attendeeId);
    try {
      await updateOnboardingOrientationAttendee(attendeeId, { status });
      showAction("success", `Marked ${ATTENDANCE_LABELS[status] || status}.`);
      await refresh();
    } catch (err) {
      showAction("error", err.message || "Failed to update attendance");
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkCompleted = async (session) => {
    setBusyId(`s${sessionKey(session)}`);
    try {
      await updateOnboardingOrientationSession(sessionKey(session), { status: "completed" });
      showAction("success", `"${session.title}" marked completed.`);
      await refresh();
    } catch (err) {
      showAction("error", err.message || "The session could not be marked completed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveAttendee = async (attendeeId) => {
    if (!window.confirm("Remove this attendee from the session?")) return;
    try {
      await deleteOnboardingOrientationAttendee(attendeeId);
      showAction("success", "Attendee removed from the session.");
      await refresh();
    } catch (err) {
      showAction("error", err.message || "Failed to remove attendee");
    }
  };

  const getRecordName = (recordId) => {
    const rec = records.find((r) => r.id === recordId || r.id === Number(recordId));
    return rec ? rec.candidate_name || rec.name || `Record #${recordId}` : `Record #${recordId}`;
  };

  const calcCompletion = (sessionId) => {
    const sessionAttendees = attendees[sessionId] || [];
    if (sessionAttendees.length === 0) return { total: 0, attended: 0, pct: 0 };
    const attended = sessionAttendees.filter((a) => a.status === "attended").length;
    return {
      total: sessionAttendees.length,
      attended,
      pct: Math.round((attended / sessionAttendees.length) * 100),
    };
  };

  // only new hires still onboarding who are not already on this session
  const remainingRecords = (sessionId) => {
    const sessionAttendees = attendees[sessionId] || [];
    const assignedIds = new Set(sessionAttendees.map((a) => Number(a.onboarding_new_hire_id)).filter(Boolean));
    return records.filter((r) => !INACTIVE_HIRE.has(String(r.status || "").toLowerCase()) && !assignedIds.has(Number(r.id)));
  };

  // what the server emailed the attendees, so the success note can say so
  const updateMessage = (before, payload) => {
    const count = (attendees[sessionKey(before)] || []).length;
    const was = before.status || "scheduled";
    const now = payload.status || was;
    const norm = (v) => (v == null ? "" : String(v));
    if (count > 0) {
      if (now === "cancelled" && was !== "cancelled") return "Session cancelled. Attendees were emailed that it was cancelled.";
      if (was === "cancelled" && now === "scheduled") return "Session rescheduled. Attendees were emailed a new invitation.";
      const moved = ["time", "location", "meeting_link"].some((k) => norm(payload[k]) !== norm(before[k])) || norm(payload.date) !== sessionDay(before);
      if (was === "scheduled" && now === "scheduled" && moved) return "Session updated. Attendees were emailed the updated details.";
    }
    return "Session updated successfully";
  };

  const byWhen = (a, b) => (sessionDay(a) + (a.time || "")).localeCompare(sessionDay(b) + (b.time || ""));
  const upcoming = sessions.filter((ses) => sessionDay(ses) >= today).sort(byWhen);
  const past = sessions.filter((ses) => sessionDay(ses) < today).sort((a, b) => byWhen(b, a));

  if (!loaded && !loading && error) {
    return (
      <HRPage title="Orientation Sessions" subtitle="Schedule and manage onboarding orientation sessions.">
        <OnboardingSubNav />
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-6 text-center">
          <p className="text-sm font-medium break-words">{error}</p>
          <button onClick={fetchAll} className="mt-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg">Retry</button>
        </div>
      </HRPage>
    );
  }

  if (loading && !loaded) {
    return (
      <HRPage title="Orientation Sessions" subtitle="Schedule and manage onboarding orientation sessions.">
        <OnboardingSubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading orientation sessions...</span>
        </div>
      </HRPage>
    );
  }

  const renderSession = (session) => {
    const sessionId = sessionKey(session);
    const day = sessionDay(session);
    const isExpanded = expandedSession === sessionId;
    const sessionAttendees = attendees[sessionId] || [];
    const completion = calcCompletion(sessionId);
    const availableRecords = remainingRecords(sessionId);
    const status = session.status || "scheduled";
    const isScheduled = status === "scheduled";
    const isPast = day < today;
    const beforeDay = day > today;
    // attended / absent can be recorded on or after the session date, never for a cancelled session
    const markBlocked = status === "cancelled"
      ? "The session was cancelled; attendance cannot be recorded."
      : beforeDay ? `Attendance can be recorded on or after ${formatDate(day)}.` : "";

    return (
      <div key={sessionId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-800 break-words">
              {session.title}
              {status !== "scheduled" ? (
                <span className={`ml-2 align-middle text-xs font-medium px-2 py-0.5 rounded-full ${status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {status === "completed" ? "Completed" : "Cancelled"}
                </span>
              ) : null}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              <span className="text-sm text-gray-500">
                {day ? formatDate(day) : "TBD"}
                {session.time ? ` at ${session.time}` : ""}
              </span>
              {session.location && <span className="text-sm text-gray-400 min-w-0 break-words">{session.location}</span>}
              {session.presenter && (
                <span className="text-sm text-gray-400 min-w-0 break-words">
                  Presenter: <span className="font-medium text-gray-600">{session.presenter}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
              <span>{sessionAttendees.length} attendee{sessionAttendees.length !== 1 ? "s" : ""}</span>
              {completion.total > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <span className={`block h-full rounded-full ${completion.pct === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${completion.pct}%` }} />
                  </span>
                  {completion.attended}/{completion.total} attended ({completion.pct}%)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 shrink-0 -ml-2 sm:ml-0">
            {session.meeting_link && isScheduled && (
              <a href={session.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1.5">
                Join
              </a>
            )}
            <button onClick={() => handleEdit(session)} className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1.5">Edit</button>
            <button onClick={() => handleDelete(sessionId)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1.5">Delete</button>
            <button onClick={() => handleToggleExpand(sessionId)} aria-label={isExpanded ? "Hide attendees" : "Show attendees"} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5">
              {isExpanded ? "\u25BC" : "\u25B6"}
            </button>
          </div>
        </div>

        {isPast && isScheduled && (
          <div className="mx-4 sm:mx-5 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-amber-800">This session's date has passed. Record attendance, then mark it completed.</span>
            <button onClick={() => handleMarkCompleted(session)} disabled={busyId === `s${sessionId}`}
              className="text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 px-3 py-1.5 rounded">
              {busyId === `s${sessionId}` ? "Saving..." : "Mark completed"}
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="border-t border-gray-100 px-4 sm:px-5 py-4 space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-700">Attendees</h4>
                {!isScheduled ? (
                  <span className="text-xs text-gray-400">New attendees can be added only to a scheduled session.</span>
                ) : availableRecords.length === 0 ? (
                  <span className="text-xs text-gray-400">Every active new hire is already on this session.</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <select
                      value={selectedRecord}
                      onChange={(e) => setSelectedRecord(e.target.value)}
                      aria-label="New hire to add"
                      className="w-full sm:w-auto min-w-0 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Add attendee...</option>
                      {availableRecords.map((r) => (
                        <option key={r.id} value={r.id}>{r.candidate_name || r.name || `Record #${r.id}`}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" checked={notifyAttendee} onChange={(e) => setNotifyAttendee(e.target.checked)} className="rounded border-gray-300" />
                      Email invitation
                    </label>
                    <button
                      onClick={() => handleAddAttendee(sessionId)}
                      disabled={addingAttendee || !selectedRecord}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      {addingAttendee ? "Adding..." : "Add"}
                    </button>
                  </div>
                )}
              </div>
              {sessionAttendees.length === 0 ? (
                <div className="text-xs text-gray-400 py-2">No attendees added yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="block sm:table w-full text-sm">
                    <thead className="hidden sm:table-header-group bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600 text-xs">Attendee</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600 text-xs">Status</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-600 text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="block sm:table-row-group divide-y divide-gray-50">
                      {sessionAttendees.map((att) => {
                        const attId = att.id || att._id;
                        const busy = busyId === attId;
                        const markClass = "text-xs font-medium px-1.5 py-1 disabled:text-gray-300 disabled:cursor-not-allowed";
                        return (
                          <tr key={attId} className="flex flex-wrap items-center gap-x-2 py-2 sm:py-0 sm:table-row hover:bg-gray-50 transition-colors">
                            <td className="block sm:table-cell min-w-0 px-3 py-1 sm:py-2 font-medium text-gray-800 text-sm break-words">{getRecordName(att.onboarding_new_hire_id)}</td>
                            <td className="block sm:table-cell px-3 py-1 sm:py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ATTENDANCE_STATUS[att.status] || "text-gray-500"}`}>
                                {ATTENDANCE_LABELS[att.status] || att.status}
                              </span>
                            </td>
                            <td className="block sm:table-cell w-full sm:w-auto px-3 py-1 sm:py-2 sm:text-right">
                              <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1">
                                {att.status !== "attended" && (
                                  <button onClick={() => handleUpdateAttendance(attId, "attended")} disabled={busy || !!markBlocked} title={markBlocked || undefined}
                                    className={`text-green-600 hover:text-green-800 ${markClass}`}>
                                    Mark Attended
                                  </button>
                                )}
                                {att.status !== "absent" && (
                                  <button onClick={() => handleUpdateAttendance(attId, "absent")} disabled={busy || !!markBlocked} title={markBlocked || undefined}
                                    className={`text-red-400 hover:text-red-600 ${markClass}`}>
                                    Mark Absent
                                  </button>
                                )}
                                {att.status !== "excused" && (
                                  <button onClick={() => handleUpdateAttendance(attId, "excused")} disabled={busy}
                                    className={`text-gray-500 hover:text-gray-700 ${markClass}`}>
                                    Excuse
                                  </button>
                                )}
                                {att.status !== "pending" && (
                                  <button onClick={() => handleUpdateAttendance(attId, "pending")} disabled={busy}
                                    className={`text-yellow-600 hover:text-yellow-800 ${markClass}`}>
                                    Reset
                                  </button>
                                )}
                                <button onClick={() => handleRemoveAttendee(attId)} aria-label="Remove attendee" title="Remove from session"
                                  className="text-red-400 hover:text-red-600 text-sm leading-none p-1.5">
                                  &times;
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {completion.total > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-600">Completion Status</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{completion.attended}/{completion.total} attended</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    completion.pct === 100 ? "bg-green-100 text-green-700" : completion.pct >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                  }`}>
                    {completion.pct}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <HRPage title="Orientation Sessions" subtitle="Schedule and manage onboarding orientation sessions.">
      <OnboardingSubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-start sm:items-center gap-3">
          <span className="min-w-0 break-words">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 p-1.5 -m-1.5 leading-none text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {actionMsg.text && (
        <div role={actionMsg.type === "success" ? "status" : "alert"} className={`mb-4 px-4 py-3 rounded-lg flex justify-between items-start sm:items-center gap-3 ${
          actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <span className="min-w-0 break-words">{actionMsg.text}</span>
          <button onClick={() => setActionMsg({ type: "", text: "" })} className="shrink-0 p-1.5 -m-1.5 leading-none font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total Sessions</p>
            <p className="text-lg font-bold text-gray-800">{sessions.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total Attendees</p>
            <p className="text-lg font-bold text-blue-600">
              {Object.values(attendees).reduce((sum, arr) => sum + arr.length, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Attended</p>
            <p className="text-lg font-bold text-green-600">
              {Object.values(attendees).reduce((sum, arr) => sum + arr.filter((a) => a.status === "attended").length, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Pending</p>
            <p className="text-lg font-bold text-yellow-600">
              {Object.values(attendees).reduce((sum, arr) => sum + arr.filter((a) => a.status === "pending").length, 0)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2">
          <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + New Session
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-4" onClick={resetForm}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex justify-between items-center gap-3 shrink-0">
                <h3 className="text-lg font-bold text-gray-800 min-w-0 break-words">
                  {editingSession ? "Edit Session" : "New Orientation Session"}
                </h3>
                <button onClick={resetForm} className="shrink-0 p-1.5 -m-1.5 text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
                {formErrors.submit && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formErrors.submit}</div>}
                <div>
                  <label htmlFor="os-title" className="block text-sm font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
                  <input id="os-title" type="text" value={formTitle} maxLength={200} aria-invalid={!!formErrors.title}
                    onChange={edit(setFormTitle, "title")} placeholder="e.g. New Hire Orientation - June 2026" className={boxClass("title")} />
                  {fieldError("title")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="os-date" className="block text-sm font-medium text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
                    <input id="os-date" type="date" value={formDate} min="2000-01-01" max="2100-12-31" aria-invalid={!!formErrors.date}
                      onChange={edit(setFormDate, "date")} className={boxClass("date")} />
                    {fieldError("date")}
                  </div>
                  <div>
                    <label htmlFor="os-time" className="block text-sm font-medium text-gray-600 mb-1">Time</label>
                    <input id="os-time" type="time" value={formTime} aria-invalid={!!formErrors.time}
                      onChange={edit(setFormTime, "time")} className={boxClass("time")} />
                    {fieldError("time")}
                  </div>
                </div>
                {editingSession && (
                  <div>
                    <label htmlFor="os-status" className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                    <select id="os-status" value={formStatus} onChange={edit(setFormStatus, "status")} className={boxClass("status")}>
                      {SESSION_STATUSES.map((st) => <option key={st.value} value={st.value} disabled={st.value === "completed" && formDate > today && formStatus !== "completed"}>{st.label}{st.value === "completed" && formDate > today ? " (after the session date)" : ""}</option>)}
                    </select>
                    {fieldError("status")}
                  </div>
                )}
                <div>
                  <label htmlFor="os-location" className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                  <input id="os-location" type="text" value={formLocation} maxLength={200} aria-invalid={!!formErrors.location}
                    onChange={edit(setFormLocation, "location")} placeholder="e.g. Conference Room A" className={boxClass("location")} />
                  {fieldError("location")}
                </div>
                <div>
                  <label htmlFor="os-link" className="block text-sm font-medium text-gray-600 mb-1">Meeting Link</label>
                  <input id="os-link" type="text" value={formMeetingLink} maxLength={500} aria-invalid={!!formErrors.meeting_link}
                    onChange={edit(setFormMeetingLink, "meeting_link")} placeholder="https://meet.google.com/..." className={boxClass("meeting_link")} />
                  {fieldError("meeting_link")}
                </div>
                <div>
                  <label htmlFor="os-presenter" className="block text-sm font-medium text-gray-600 mb-1">Presenter</label>
                  <input id="os-presenter" type="text" value={formPresenter} maxLength={200} aria-invalid={!!formErrors.presenter}
                    onChange={edit(setFormPresenter, "presenter")} placeholder="e.g. Sarah Johnson" className={boxClass("presenter")} />
                  {fieldError("presenter")}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? "Saving..." : editingSession ? "Update Session" : "Create Session"}
                </button>
              </div>
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">No orientation sessions yet.</p>
            <p className="text-gray-400 text-sm mt-1">Click "+ New Session" to schedule one.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Upcoming ({upcoming.length})</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 px-4 sm:px-5 py-4">No upcoming sessions.</p>
              ) : (
                <div className="space-y-4">{upcoming.map(renderSession)}</div>
              )}
            </div>
            {past.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Past ({past.length})</h3>
                <div className="space-y-4">{past.map(renderSession)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </HRPage>
  );
}
