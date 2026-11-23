/*
 * My Exit: the person's own resignation / exit in one folder of five tabs. The tabs appear as they become relevant:
 * with no exit only Resign; Exit Status once there is a case; Exit Tasks once it is approved; Exit Interview once HR
 * sent it; Exit Documents once a letter is issued. GET /hr/me/offboarding is loaded once and shared with the tab.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { ClipboardCheck, Clock, FileSignature, FileText, Loader2, LogOut, MessageSquareText } from "lucide-react";
import { getMyExit, errorMessage } from "../../../../../service/offboardingService";

const MyExitContext = createContext(null);
export const useMyExit = () => useContext(MyExitContext);

export const EXIT_TABS = [
  { key: "resign", label: "Resign", href: "/employee/ess/exit/resign", icon: FileSignature },
  { key: "status", label: "Exit Status", href: "/employee/ess/exit/status", icon: Clock },
  { key: "tasks", label: "Exit Tasks", href: "/employee/ess/exit/tasks", icon: ClipboardCheck },
  { key: "interview", label: "Exit Interview", href: "/employee/ess/exit/interview", icon: MessageSquareText },
  { key: "documents", label: "Exit Documents", href: "/employee/ess/exit/documents", icon: FileText },
];

/** Which tabs the person sees for this state of their exit. */
export function visibleTabs(data) {
  const c = data?.case;
  const s = data?.summary || {};
  const keys = new Set(["resign"]);
  if (c) keys.add("status");
  if (c && ["approved", "exited", "closed"].includes(c.status)) keys.add("tasks");
  if (c && s.interview_status && s.interview_status !== "not_sent") keys.add("interview");
  if (c && (s.documents || 0) > 0) keys.add("documents");
  return EXIT_TABS.filter((t) => keys.has(t.key));
}

export const STATUS_LOOK = {
  submitted: ["Submitted — waiting for a decision", "bg-amber-50 text-amber-800 ring-amber-200"],
  serving_notice: ["Approved — serving notice", "bg-blue-50 text-blue-800 ring-blue-200"],
  garden_leave: ["Approved — garden leave", "bg-blue-50 text-blue-800 ring-blue-200"],
  withdrawal_requested: ["Withdrawal requested", "bg-amber-50 text-amber-800 ring-amber-200"],
  approved: ["Approved", "bg-blue-50 text-blue-800 ring-blue-200"],
  exited: ["Left the organisation", "bg-slate-100 text-slate-700 ring-slate-200"],
  closed: ["Completed", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
  rejected: ["Not accepted", "bg-red-50 text-red-800 ring-red-200"],
  withdrawn: ["Withdrawn", "bg-slate-100 text-slate-700 ring-slate-200"],
  cancelled: ["Cancelled", "bg-slate-100 text-slate-700 ring-slate-200"],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS_LOOK[status] || [String(status || "").replace(/_/g, " "), "bg-slate-100 text-slate-700 ring-slate-200"];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{label}</span>;
}

export default function MyExitLayout({ tab, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const reload = useCallback(async () => {
    setError(null);
    try {
      setData(await getMyExit());
    } catch (e) {
      setError(errorMessage(e, "Your exit details could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const tabs = visibleTabs(data);
  const current = tabs.find((t) => t.key === tab);
  let redirect = null;
  if (!loading && !error && data && !current) {
    redirect = data.case ? "/employee/ess/exit/status" : "/employee/ess/exit/resign";
    if (redirect === location.pathname) redirect = null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100" aria-hidden="true">
            <LogOut size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Exit</h1>
            <p className="text-sm text-slate-600">Your resignation, notice, exit tasks, interview and documents.</p>
          </div>
        </header>
        <nav aria-label="My Exit sections" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink key={t.key} to={t.href}
                className={({ isActive }) => `inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-medium ${
                  isActive ? "bg-white text-blue-700 ring-1 ring-inset ring-slate-200" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>
                <Icon size={16} aria-hidden="true" />{t.label}
              </NavLink>
            );
          })}
        </nav>
        {redirect && <Navigate to={redirect} replace />}
        {loading ? (
          <p role="status" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading your exit details…
          </p>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error} <button type="button" onClick={reload} className="ml-2 font-semibold underline">Try again</button>
          </div>
        ) : current ? (
          <MyExitContext.Provider value={{ data, reload }}>{children}</MyExitContext.Provider>
        ) : null}
      </div>
    </div>
  );
}
