/*
 * Orientation Sessions — the Onboarding shell with the Recruitment look: KPI row from the loaded sessions and attendees,
 * Upcoming / Calendar / Past views, session cards with presenter and attendee avatars, attendance marking, slide-over form.
 */
import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle, CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, History,
  LayoutList, Loader2, MapPin, Pencil, Plus, Trash2, UserCheck, Users, Video, X,
} from "lucide-react";
import { getOnboardingOrientationSessions, createOnboardingOrientationSession, updateOnboardingOrientationSession, deleteOnboardingOrientationSession, getOnboardingOrientationAttendees, createOnboardingOrientationAttendee, updateOnboardingOrientationAttendee, deleteOnboardingOrientationAttendee, getOnboardingRecords } from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import { SESSION_STATUSES, validateSessionForm, sessionPayload, serverSessionErrors, todayIso } from "../../../utils/orientationForm";
import {
  Avatar, AvatarStack, Card, EmptyState, FilterSelect, KpiCard, KpiGrid, PrimaryButton, SearchInput, SecondaryButton, SegmentTabs, StatusPill,
} from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

const ATTENDANCE_TONE = { pending: "amber", attended: "green", absent: "red", excused: "gray" };

const ATTENDANCE_LABELS = {
  pending: "Pending",
  attended: "Attended",
  absent: "Absent",
  excused: "Excused",
};

const SESSION_TONE = { scheduled: "blue", completed: "green", cancelled: "red" };
const SESSION_LABEL = Object.fromEntries(SESSION_STATUSES.map((s) => [s.value, s.label]));

const INACTIVE_HIRE = new Set(["completed", "cancelled"]);
const sessionDay = (session) => (session?.date ? String(session.date).slice(0, 10) : "");
const sessionKey = (session) => session.id || session._id;

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
function fmtTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return t || "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
// Monday-to-Sunday week containing `today`
function weekOf(today) {
  const d = parseDay(today);
  const start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return [isoDay(start), isoDay(end)];
}

const fieldBase = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

function SessionStatus({ status }) {
  const s = status || "scheduled";
  return <StatusPill tone={SESSION_TONE[s] || "gray"}>{SESSION_LABEL[s] || s}</StatusPill>;
}

function DateTile({ day }) {
  if (!day) return <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gray-100 text-xs font-medium text-gray-500">TBD</span>;
  const d = parseDay(day);
  return (
    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-50 text-blue-700" aria-hidden="true">
      <span className="text-[10px] font-semibold uppercase tracking-wide">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="text-xl font-bold leading-none">{d.getDate()}</span>
    </span>
  );
}

// ── calendar view ─────────────────────────────────────────────────────────────────────────────────────────────────
function CalendarView({ sessions, today, onOpen }) {
  const [month, setMonth] = useState(() => { const d = parseDay(today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = {};
    sessions.forEach((s) => { const d = sessionDay(s); if (d) (m[d] = m[d] || []).push(s); });
    Object.values(m).forEach((list) => list.sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))));
    return m;
  }, [sessions]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const weekdays = cells.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));
  const inMonth = sessions.filter((s) => sessionDay(s).startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}`)).length;
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <Card title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      action={
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">{inMonth} session{inMonth === 1 ? "" : "s"}</span>
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { const d = parseDay(today); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm hover:bg-gray-50">Today</button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
          {weekdays.map((w) => <div key={w} className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-500">{w}</div>)}
          {cells.map((d) => {
            const key = isoDay(d);
            const list = byDay[key] || [];
            const other = d.getMonth() !== month.getMonth();
            return (
              <div key={key} className={`min-h-[96px] p-1.5 ${other ? "bg-gray-50/70" : "bg-white"}`}>
                <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${key === today ? "bg-blue-600 font-semibold text-white" : other ? "text-gray-400" : "text-gray-700"}`}>{d.getDate()}</span>
                <div className="mt-1 space-y-1">
                  {list.slice(0, 3).map((s) => (
                    <button key={sessionKey(s)} type="button" onClick={() => onOpen(s)} title={[s.title, s.presenter].filter(Boolean).join(" · ")}
                      className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium ${s.status === "cancelled" ? "bg-gray-100 text-gray-400 line-through" : s.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                      {s.time ? `${fmtTime(s.time)} ` : ""}{s.title || "—"}
                    </button>
                  ))}
                  {list.length > 3 && <span className="block px-1.5 text-[11px] text-gray-500">+{list.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

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
  const [tab, setTab] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const fieldError = (name) => (formErrors[name] ? <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{formErrors[name]}</p> : null);
  const boxClass = (name) => `${fieldBase} ${formErrors[name] ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-gray-200 focus:border-blue-400 focus:ring-blue-100"}`;

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
      // the server's refusal appears under its own field; the panel stays open so nothing typed is lost
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
  const needsWrapUp = past.filter((ses) => (ses.status || "scheduled") === "scheduled");

  // ── numbers from the loaded sessions and attendees ──────────────────────────────────────────────────────────────
  const allAttendees = Object.values(attendees).flat();
  const countStatus = (s) => allAttendees.filter((a) => a.status === s).length;
  const live = (ses) => (ses.status || "scheduled") !== "cancelled";
  const [weekStart, weekEnd] = weekOf(today);
  const monthPrefix = today.slice(0, 7);
  const kpi = {
    upcoming: upcoming.filter((s) => (s.status || "scheduled") === "scheduled").length,
    thisWeek: sessions.filter((s) => live(s) && sessionDay(s) >= weekStart && sessionDay(s) <= weekEnd).length,
    monthAttendees: sessions.filter((s) => live(s) && sessionDay(s).startsWith(monthPrefix))
      .reduce((n, s) => n + (attendees[sessionKey(s)] || []).length, 0),
  };
  const recorded = countStatus("attended") + countStatus("absent");
  kpi.attendedRate = recorded ? Math.round((countStatus("attended") / recorded) * 100) : null;

  const layout = (body) => (
    <OnboardingLayout title="Orientation Sessions" subtitle="Schedule and manage onboarding orientation sessions."
      actions={<PrimaryButton icon={Plus} onClick={() => { resetForm(); setShowForm(true); }}>New Session</PrimaryButton>}>
      {body}
    </OnboardingLayout>
  );

  if (!loaded && !loading && error) {
    return layout(
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-rose-700">
        <p className="inline-flex items-center gap-2 break-words text-sm font-medium"><AlertCircle className="h-5 w-5" />{error}</p>
        <div className="mt-4"><PrimaryButton onClick={fetchAll}>Retry</PrimaryButton></div>
      </div>
    );
  }

  if (loading && !loaded) {
    return layout(
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-2xl bg-white" />
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading orientation sessions...</div>
      </div>
    );
  }

  const openFromCalendar = (session) => {
    setTab(sessionDay(session) < today ? "past" : "upcoming");
    setSearch("");
    setStatusFilter("");
    setExpandedSession(sessionKey(session));
    setSelectedRecord("");
  };

  const q = search.trim().toLowerCase();
  const matches = (ses) => (!statusFilter || (ses.status || "scheduled") === statusFilter)
    && (!q || [ses.title, ses.presenter, ses.location].filter(Boolean).join(" ").toLowerCase().includes(q));

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
    const names = sessionAttendees.map((a) => getRecordName(a.onboarding_new_hire_id));
    // attended / absent can be recorded on or after the session date, never for a cancelled session
    const markBlocked = status === "cancelled"
      ? "The session was cancelled; attendance cannot be recorded."
      : beforeDay ? `Attendance can be recorded on or after ${formatDate(day)}.` : "";

    return (
      <article key={sessionId} className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
          <DateTile day={day} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 break-words text-base font-semibold text-gray-900">{session.title}</h3>
              <SessionStatus status={status} />
              {day === today && <StatusPill tone="violet">Today</StatusPill>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{day ? formatDate(day) : "TBD"}{session.time ? ` at ${fmtTime(session.time)}` : ""}</span>
              {session.location && <span className="inline-flex min-w-0 items-center gap-1.5 break-words"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{session.location}</span>}
              {session.meeting_link && <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" aria-hidden="true" />Online</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={session.presenter || ""} size="sm" />
                <span className="min-w-0 text-sm">
                  <span className="block text-[11px] uppercase tracking-wide text-gray-400">Presenter</span>
                  <span className="block truncate font-medium text-gray-700">{session.presenter || "—"}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                {names.length > 0 && <AvatarStack names={names} max={4} />}
                <span className="text-xs text-gray-500">{sessionAttendees.length} attendee{sessionAttendees.length !== 1 ? "s" : ""}</span>
              </span>
              {completion.total > 0 && (
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="inline-block h-2 w-20 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                    <span className={`block h-full rounded-full ${completion.pct === 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${completion.pct}%` }} />
                  </span>
                  {completion.attended}/{completion.total} attended ({completion.pct}%)
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {session.meeting_link && isScheduled && (
              <a href={session.meeting_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
                <Video className="h-3.5 w-3.5" aria-hidden="true" />Join
              </a>
            )}
            <button type="button" onClick={() => handleEdit(session)} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit
            </button>
            <button type="button" onClick={() => handleDelete(sessionId)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete
            </button>
            <button type="button" onClick={() => handleToggleExpand(sessionId)} aria-label={isExpanded ? "Hide attendees" : "Show attendees"} aria-expanded={isExpanded}
              className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {isPast && isScheduled && (
          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 sm:mx-5">
            <span className="text-xs text-amber-800">This session's date has passed. Record attendance, then mark it completed.</span>
            <button type="button" onClick={() => handleMarkCompleted(session)} disabled={busyId === `s${sessionId}`}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:bg-amber-400">
              {busyId === `s${sessionId}` ? "Saving..." : "Mark completed"}
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="space-y-4 border-t border-gray-100 bg-gray-50/40 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">Attendees</h4>
              {!isScheduled ? (
                <span className="text-xs text-gray-400">New attendees can be added only to a scheduled session.</span>
              ) : availableRecords.length === 0 ? (
                <span className="text-xs text-gray-400">Every active new hire is already on this session.</span>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <select
                    value={selectedRecord}
                    onChange={(e) => setSelectedRecord(e.target.value)}
                    aria-label="New hire to add"
                    className="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-auto"
                  >
                    <option value="">Add attendee...</option>
                    {availableRecords.map((r) => (
                      <option key={r.id} value={r.id}>{r.candidate_name || r.name || `Record #${r.id}`}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={notifyAttendee} onChange={(e) => setNotifyAttendee(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    Email invitation
                  </label>
                  <button type="button" onClick={() => handleAddAttendee(sessionId)} disabled={addingAttendee || !selectedRecord}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {addingAttendee ? "Adding..." : "Add"}
                  </button>
                </div>
              )}
            </div>
            {sessionAttendees.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">No attendees added yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200/80 bg-white">
                {sessionAttendees.map((att) => {
                  const attId = att.id || att._id;
                  const busy = busyId === attId;
                  const markClass = "rounded-lg px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40";
                  const name = getRecordName(att.onboarding_new_hire_id);
                  return (
                    <li key={attId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Avatar name={name} size="sm" />
                        <span className="min-w-0 truncate text-sm font-medium text-gray-800">{name}</span>
                      </span>
                      <StatusPill tone={ATTENDANCE_TONE[att.status] || "gray"}>{ATTENDANCE_LABELS[att.status] || att.status}</StatusPill>
                      <div className="flex flex-wrap items-center gap-1">
                        {att.status !== "attended" && (
                          <button type="button" onClick={() => handleUpdateAttendance(attId, "attended")} disabled={busy || !!markBlocked} title={markBlocked || undefined}
                            className={`text-emerald-700 hover:bg-emerald-50 ${markClass}`}>
                            Mark Attended
                          </button>
                        )}
                        {att.status !== "absent" && (
                          <button type="button" onClick={() => handleUpdateAttendance(attId, "absent")} disabled={busy || !!markBlocked} title={markBlocked || undefined}
                            className={`text-rose-600 hover:bg-rose-50 ${markClass}`}>
                            Mark Absent
                          </button>
                        )}
                        {att.status !== "excused" && (
                          <button type="button" onClick={() => handleUpdateAttendance(attId, "excused")} disabled={busy}
                            className={`text-gray-600 hover:bg-gray-100 ${markClass}`}>
                            Excuse
                          </button>
                        )}
                        {att.status !== "pending" && (
                          <button type="button" onClick={() => handleUpdateAttendance(attId, "pending")} disabled={busy}
                            className={`text-amber-700 hover:bg-amber-50 ${markClass}`}>
                            Reset
                          </button>
                        )}
                        <button type="button" onClick={() => handleRemoveAttendee(attId)} aria-label="Remove attendee" title="Remove from session"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </article>
    );
  };

  const listView = (list, kind) => {
    const shown = list.filter(matches);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, presenter or location…" label="Search sessions" />
          <FilterSelect label="Session status" allLabel="All statuses" value={statusFilter} onChange={setStatusFilter} options={SESSION_STATUSES} />
        </div>
        {sessions.length === 0 ? (
          <Card><EmptyState icon={CalendarDays} title="No orientation sessions yet.">Use "New Session" to schedule one.</EmptyState></Card>
        ) : shown.length === 0 ? (
          <Card><EmptyState icon={kind === "past" ? History : CalendarClock} title={list.length ? "No sessions match" : kind === "past" ? "No past sessions." : "No upcoming sessions."}>
            {list.length ? "Try another search or status." : null}
          </EmptyState></Card>
        ) : (
          <div className="space-y-4">{shown.map(renderSession)}</div>
        )}
      </div>
    );
  };

  const TABS = [
    { value: "upcoming", label: `Upcoming (${upcoming.length})`, icon: LayoutList },
    { value: "calendar", label: "Calendar", icon: CalendarDays },
    { value: "past", label: `Past (${past.length})`, icon: History },
  ];

  const sideColumn = (
    <div className="space-y-6">
      <Card title="Attendance">
        <dl className="grid grid-cols-2 gap-3">
          {[["Total Attendees", allAttendees.length, "text-gray-900"], ["Attended", countStatus("attended"), "text-emerald-600"],
            ["Pending", countStatus("pending"), "text-amber-600"], ["Absent", countStatus("absent"), "text-rose-600"]].map(([label, n, cls]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className={`text-lg font-bold ${cls}`}>{n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-gray-400">Across all {sessions.length} session{sessions.length === 1 ? "" : "s"} loaded.</p>
      </Card>
      {tab !== "past" && (
        <Card title={`Needs wrap-up (${needsWrapUp.length})`}>
          {needsWrapUp.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing to wrap up">Past sessions still marked scheduled appear here.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {needsWrapUp.slice(0, 6).map((s) => (
                <li key={sessionKey(s)} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-500">{formatDate(sessionDay(s))} · {(attendees[sessionKey(s)] || []).length} attendee{(attendees[sessionKey(s)] || []).length === 1 ? "" : "s"}</p>
                  </div>
                  <button type="button" onClick={() => handleMarkCompleted(s)} disabled={busyId === `s${sessionKey(s)}`}
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:bg-amber-400">
                    {busyId === `s${sessionKey(s)}` ? "Saving..." : "Mark completed"}
                  </button>
                </li>
              ))}
              {needsWrapUp.length > 6 && <li><button type="button" onClick={() => setTab("past")} className="text-sm font-medium text-blue-600 hover:underline">View all in Past</button></li>}
            </ul>
          )}
        </Card>
      )}
    </div>
  );

  return layout(
    <>
      <div className="space-y-6">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:items-center">
            <span className="min-w-0 break-words">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold leading-none text-rose-500 hover:text-rose-700">&times;</button>
          </div>
        )}

        {actionMsg.text && (
          <div role={actionMsg.type === "success" ? "status" : "alert"} className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm sm:items-center ${
            actionMsg.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}>
            <span className="min-w-0 break-words">{actionMsg.text}</span>
            <button type="button" onClick={() => setActionMsg({ type: "", text: "" })} aria-label="Dismiss" className="-m-1.5 shrink-0 p-1.5 font-bold leading-none">&times;</button>
          </div>
        )}

        <KpiGrid cols={4}>
          <KpiCard label="Upcoming Sessions" icon={CalendarClock} tone="blue" kpi={{ value: kpi.upcoming }} />
          <KpiCard label="Attendees This Month" icon={Users} tone="green" kpi={{ value: kpi.monthAttendees }} />
          <KpiCard label="Attended Rate" icon={UserCheck} tone="violet" kpi={{ value: kpi.attendedRate }} format={(v) => `${v}%`} />
          <KpiCard label="Sessions This Week" icon={CalendarDays} tone="amber" kpi={{ value: kpi.thisWeek }} />
        </KpiGrid>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <SegmentTabs label="Orientation views" value={tab} onChange={setTab} tabs={TABS} />
            {tab === "upcoming" && listView(upcoming, "upcoming")}
            {tab === "calendar" && <CalendarView sessions={sessions} today={today} onOpen={openFromCalendar} />}
            {tab === "past" && listView(past, "past")}
          </div>
          <div className="min-w-0">{sideColumn}</div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={resetForm} />
          <div role="dialog" aria-modal="true" aria-labelledby="os-panel-title"
            className="relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-[560px] sm:rounded-l-2xl">
            <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-4 py-4 text-white sm:rounded-tl-2xl sm:px-6 sm:py-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15" aria-hidden="true">
                  {editingSession ? <CalendarClock className="h-5 w-5 text-blue-300" /> : <CalendarPlus className="h-5 w-5 text-blue-300" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="os-panel-title" className="break-words text-lg font-semibold tracking-tight">{editingSession ? "Edit Session" : "New Orientation Session"}</h2>
                  <p className="truncate text-sm text-slate-300">{editingSession ? editingSession.title : "Set the date, place and presenter."}</p>
                </div>
                <button type="button" onClick={resetForm} aria-label="Close" className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              {formErrors.submit && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formErrors.submit}</div>}
              <section className="space-y-4 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <label htmlFor="os-title" className={labelCls}>Title <span className="text-rose-500">*</span></label>
                  <input id="os-title" type="text" value={formTitle} maxLength={200} aria-invalid={!!formErrors.title}
                    onChange={edit(setFormTitle, "title")} placeholder="e.g. New Hire Orientation - June 2026" className={boxClass("title")} />
                  {fieldError("title")}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="os-date" className={labelCls}>Date <span className="text-rose-500">*</span></label>
                    <input id="os-date" type="date" value={formDate} min="2000-01-01" max="2100-12-31" aria-invalid={!!formErrors.date}
                      onChange={edit(setFormDate, "date")} className={boxClass("date")} />
                    {fieldError("date")}
                  </div>
                  <div>
                    <label htmlFor="os-time" className={labelCls}>Time</label>
                    <input id="os-time" type="time" value={formTime} aria-invalid={!!formErrors.time}
                      onChange={edit(setFormTime, "time")} className={boxClass("time")} />
                    {fieldError("time")}
                  </div>
                </div>
                {editingSession && (
                  <div>
                    <label htmlFor="os-status" className={labelCls}>Status</label>
                    <select id="os-status" value={formStatus} onChange={edit(setFormStatus, "status")} className={boxClass("status")}>
                      {SESSION_STATUSES.map((st) => <option key={st.value} value={st.value} disabled={st.value === "completed" && formDate > today && formStatus !== "completed"}>{st.label}{st.value === "completed" && formDate > today ? " (after the session date)" : ""}</option>)}
                    </select>
                    {fieldError("status")}
                  </div>
                )}
              </section>
              <section className="space-y-4 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <label htmlFor="os-location" className={labelCls}>Location</label>
                  <input id="os-location" type="text" value={formLocation} maxLength={200} aria-invalid={!!formErrors.location}
                    onChange={edit(setFormLocation, "location")} placeholder="e.g. Conference Room A" className={boxClass("location")} />
                  {fieldError("location")}
                </div>
                <div>
                  <label htmlFor="os-link" className={labelCls}>Meeting Link</label>
                  <input id="os-link" type="text" value={formMeetingLink} maxLength={500} aria-invalid={!!formErrors.meeting_link}
                    onChange={edit(setFormMeetingLink, "meeting_link")} placeholder="https://meet.google.com/..." className={boxClass("meeting_link")} />
                  {fieldError("meeting_link")}
                </div>
                <div>
                  <label htmlFor="os-presenter" className={labelCls}>Presenter</label>
                  <input id="os-presenter" type="text" value={formPresenter} maxLength={200} aria-invalid={!!formErrors.presenter}
                    onChange={edit(setFormPresenter, "presenter")} placeholder="e.g. Sarah Johnson" className={boxClass("presenter")} />
                  {fieldError("presenter")}
                </div>
              </section>
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:rounded-bl-2xl sm:px-6 sm:py-4">
              <SecondaryButton onClick={resetForm}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saving ? "Saving..." : editingSession ? "Update Session" : "Create Session"}
              </PrimaryButton>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
