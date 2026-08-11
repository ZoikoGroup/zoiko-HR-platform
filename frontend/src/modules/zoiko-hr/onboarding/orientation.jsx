import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingOrientationSessions, createOnboardingOrientationSession, updateOnboardingOrientationSession, deleteOnboardingOrientationSession, getOnboardingOrientationAttendees, createOnboardingOrientationAttendee, updateOnboardingOrientationAttendee, deleteOnboardingOrientationAttendee, getOnboardingRecords } from "../../../service/hrService";

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

export default function Orientation() {
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [attendees, setAttendees] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formMeetingLink, setFormMeetingLink] = useState("");
  const [formPresenter, setFormPresenter] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedSession, setExpandedSession] = useState(null);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState("");
  const [addingAttendee, setAddingAttendee] = useState(false);

  const showAction = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const fetchSessions = async () => {
    setError(null);
    try {
      const data = await getOnboardingOrientationSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load orientation sessions");
      setSessions([]);
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

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchSessions(), fetchRecords()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAttendees = async (sessionId) => {
    setAttendeesLoading(true);
    try {
      const data = await getOnboardingOrientationAttendees(sessionId);
      setAttendees((prev) => ({ ...prev, [sessionId]: Array.isArray(data) ? data : [] }));
    } catch {
      setAttendees((prev) => ({ ...prev, [sessionId]: [] }));
    } finally {
      setAttendeesLoading(false);
    }
  };

  const handleToggleExpand = (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
      if (!attendees[sessionId]) fetchAttendees(sessionId);
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
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setFormTitle(session.title || "");
    setFormDate(session.date || "");
    setFormTime(session.time || "");
    setFormLocation(session.location || "");
    setFormMeetingLink(session.meeting_link || session.meetingLink || "");
    setFormPresenter(session.presenter || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      showAction("error", "Session title is required");
      return;
    }
    if (!formDate) {
      showAction("error", "Session date is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        date: formDate,
        time: formTime,
        location: formLocation.trim(),
        meeting_link: formMeetingLink.trim(),
        presenter: formPresenter.trim(),
      };
      if (editingSession) {
        await updateOnboardingOrientationSession(editingSession.id, payload);
        showAction("success", "Session updated successfully");
      } else {
        await createOnboardingOrientationSession(payload);
        showAction("success", "Session created successfully");
      }
      resetForm();
      await fetchSessions();
    } catch (err) {
      showAction("error", err.message || "Failed to save session");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sessionId) => {
    if (!window.confirm("Are you sure you want to delete this orientation session?")) return;
    try {
      await deleteOnboardingOrientationSession(sessionId);
      showAction("success", "Session deleted");
      setAttendees((prev) => { const n = { ...prev }; delete n[sessionId]; return n; });
      await fetchSessions();
    } catch (err) {
      showAction("error", err.message || "Failed to delete session");
    }
  };

  const handleAddAttendee = async (sessionId) => {
    if (!selectedRecord) return;
    setAddingAttendee(true);
    try {
      await createOnboardingOrientationAttendee({
        session_id: sessionId,
        onboarding_record_id: Number(selectedRecord),
        status: "pending",
      });
      setSelectedRecord("");
      showAction("success", "Attendee added to session");
      await fetchAttendees(sessionId);
    } catch (err) {
      showAction("error", err.message || "Failed to add attendee");
    } finally {
      setAddingAttendee(false);
    }
  };

  const handleUpdateAttendance = async (attendeeId, status) => {
    try {
      await updateOnboardingOrientationAttendee(attendeeId, { status });
      if (expandedSession) fetchAttendees(expandedSession);
    } catch (err) {
      showAction("error", err.message || "Failed to update attendance");
    }
  };

  const handleRemoveAttendee = async (attendeeId) => {
    if (!window.confirm("Remove this attendee from the session?")) return;
    try {
      await deleteOnboardingOrientationAttendee(attendeeId);
      if (expandedSession) fetchAttendees(expandedSession);
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

  const remainingRecords = (sessionId) => {
    const sessionAttendees = attendees[sessionId] || [];
    const assignedIds = new Set(
      sessionAttendees.map((a) => a.onboarding_new_hire_id).filter(Boolean)
    );
    return records.filter((r) => !assignedIds.has(r.id) && !assignedIds.has(Number(r.id)));
  };

  if (loading && sessions.length === 0) {
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

  return (
    <HRPage title="Orientation Sessions" subtitle="Schedule and manage onboarding orientation sessions.">
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

        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + New Session
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={resetForm}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">
                  {editingSession ? "Edit Session" : "New Orientation Session"}
                </h3>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. New Hire Orientation - June 2026"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Time</label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Conference Room A"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Meeting Link</label>
                  <input
                    type="url"
                    value={formMeetingLink}
                    onChange={(e) => setFormMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Presenter</label>
                  <input
                    type="text"
                    value={formPresenter}
                    onChange={(e) => setFormPresenter(e.target.value)}
                    placeholder="e.g. Sarah Johnson"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
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
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">No orientation sessions yet.</p>
            <p className="text-gray-400 text-sm mt-1">Click "+ New Session" to schedule one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const sessionId = session.id || session._id;
              const isExpanded = expandedSession === sessionId;
              const sessionAttendees = attendees[sessionId] || [];
              const completion = calcCompletion(sessionId);
              const availableRecords = remainingRecords(sessionId);

              return (
                <div key={sessionId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-800 truncate">{session.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <span className="text-sm text-gray-500">
                          {session.date ? new Date(session.date).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }) : "TBD"}
                          {session.time ? ` at ${session.time}` : ""}
                        </span>
                        {session.location && <span className="text-sm text-gray-400">{session.location}</span>}
                        {session.presenter && (
                          <span className="text-sm text-gray-400">
                            Presenter: <span className="font-medium text-gray-600">{session.presenter}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>{sessionAttendees.length} attendee{sessionAttendees.length !== 1 ? "s" : ""}</span>
                        {completion.total > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <span
                                className={`block h-full rounded-full ${
                                  completion.pct === 100 ? "bg-green-500" : "bg-blue-500"
                                }`}
                                style={{ width: `${completion.pct}%` }}
                              />
                            </span>
                            {completion.attended}/{completion.total} attended ({completion.pct}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {session.meeting_link && (
                        <a
                          href={session.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1"
                        >
                          Join
                        </a>
                      )}
                      <button
                        onClick={() => handleEdit(session)}
                        className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(sessionId)}
                        className="text-red-400 hover:text-red-600 text-xs px-2 py-1"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => handleToggleExpand(sessionId)}
                        className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1"
                      >
                        {isExpanded ? "\u25BC" : "\u25B6"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700">Attendees</h4>
                          {availableRecords.length > 0 && (
                            <div className="flex items-center gap-2">
                              <select
                                value={selectedRecord}
                                onChange={(e) => setSelectedRecord(e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Add attendee...</option>
                                {availableRecords.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.candidate_name || r.name || `Record #${r.id}`}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleAddAttendee(sessionId)}
                                disabled={addingAttendee || !selectedRecord}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs px-3 py-1 rounded font-medium transition-colors"
                              >
                                {addingAttendee ? "Adding..." : "Add"}
                              </button>
                            </div>
                          )}
                        </div>
                        {attendeesLoading ? (
                          <div className="text-xs text-gray-400 py-2">Loading attendees...</div>
                        ) : sessionAttendees.length === 0 ? (
                          <div className="text-xs text-gray-400 py-2">No attendees added yet.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-600 text-xs">Attendee</th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-600 text-xs">Status</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600 text-xs">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {sessionAttendees.map((att) => {
                                  const attId = att.id || att._id;
                                  const recordId = att.onboarding_new_hire_id;
                                  return (
                                    <tr key={attId} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-3 py-2 font-medium text-gray-800 text-sm">
                                        {getRecordName(recordId)}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ATTENDANCE_STATUS[att.status] || "text-gray-500"}`}>
                                          {ATTENDANCE_LABELS[att.status] || att.status}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          {att.status !== "attended" && (
                                            <button
                                              onClick={() => handleUpdateAttendance(attId, "attended")}
                                              className="text-green-600 hover:text-green-800 text-xs font-medium px-1"
                                            >
                                              Mark Attended
                                            </button>
                                          )}
                                          {att.status !== "absent" && (
                                            <button
                                              onClick={() => handleUpdateAttendance(attId, "absent")}
                                              className="text-red-400 hover:text-red-600 text-xs px-1"
                                            >
                                              Mark Absent
                                            </button>
                                          )}
                                          {att.status !== "excused" && (
                                            <button
                                              onClick={() => handleUpdateAttendance(attId, "excused")}
                                              className="text-gray-500 hover:text-gray-700 text-xs px-1"
                                            >
                                              Excuse
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleRemoveAttendee(attId)}
                                            className="text-red-400 hover:text-red-600 text-xs px-1"
                                          >
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
                        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                          <span className="text-sm text-gray-600">Completion Status</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">
                              {completion.attended}/{completion.total} attended
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                completion.pct === 100
                                  ? "bg-green-100 text-green-700"
                                  : completion.pct >= 50
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {completion.pct}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </HRPage>
  );
}
