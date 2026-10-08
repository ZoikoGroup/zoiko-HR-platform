import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Plus, AlertCircle, ChevronRight, Briefcase, Filter } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import StatCard from "../../../../components/employee/StatCard";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { getLeaveBalances, getLeaveRequests } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { useAutoRefresh } from "../../../../utils/useAutoRefresh";
import ContactHRDialog from "../../../../components/employee/ContactHRDialog";
import { formatLeaveType, leaveTypeAccent, leaveTypeColor } from "../../../../utils/leaveTypeUtils";

function formatLeaveDate(dateStr) {
  if (!dateStr) return "-";
  return formatDate(dateStr);
}

export default function MyLeaveDashboard() {
  const navigate = useNavigate();
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [showContactHR, setShowContactHR] = useState(false);
  const mounted = useRef(true);

  const load = async ({ silent = false } = {}) => {
    const employeeId = getStoredUser()?.id;
    if (!employeeId) {
      if (mounted.current) {
        setError("User not found. Please log in again.");
        setLoading(false);
      }
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [balancesRes, historyRes] = await Promise.all([getLeaveBalances(employeeId), getLeaveRequests(employeeId)]);
      if (!mounted.current) return;
      setBalances(Array.isArray(balancesRes) ? balancesRes : []);
      const list = Array.isArray(historyRes) ? [...historyRes] : [];
      list.sort((a, b) => {
        const da = a.created_at || a.appliedOn || a.start_date;
        const db = b.created_at || b.appliedOn || b.start_date;
        const diff = new Date(db || 0) - new Date(da || 0);
        return diff || (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      setHistory(list);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      // a failed background refresh keeps what is on screen; only the first load shows the error
      if (mounted.current && !silent) setError(err.message || "Failed to load leave data");
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, []);

  useAutoRefresh(load);

  const leaveTypes = useMemo(() => {
    // Balances are stored per year: show the current year's allocation when it exists,
    // so last year's rows never sit next to this year's cards.
    const thisYear = new Date().getFullYear();
    const currentYearRows = balances.filter((b) => !b.year || b.year === thisYear);
    const rows = currentYearRows.length ? currentYearRows : balances;
    return rows.map((b) => {
      const raw = b.leave_type || b.type || "";
      return {
        type: formatLeaveType(raw),
        total: b.total_days || b.total || 0,
        used: b.used_days || b.used || 0,
        remaining: b.remaining_days ?? b.remaining ?? ((b.total_days || b.total || 0) - (b.used_days || b.used || 0)),
        color: leaveTypeColor(raw),
        accent: leaveTypeAccent(raw),
      };
    });
  }, [balances]);

  const filteredHistory = useMemo(
    () =>
      history.filter((r) => activeTab === "all" || (r.status || "").toLowerCase() === activeTab),
    [history, activeTab]
  );

  const pendingCount = history.filter((r) => (r.status || "").toLowerCase() === "pending").length;

  if (loading) {
    return (
      <EmployeePageShell title="My Leave" subtitle="View your leave balances, active requests, and complete history.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="My Leave" subtitle="View your leave balances, active requests, and complete history.">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      </EmployeePageShell>
    );
  }

  const hasBalances = leaveTypes.length > 0;
  const defaultContactHRTopic = hasBalances ? "Leave request question" : "Leave balance not set up";

  return (
    <EmployeePageShell
      title="My Leave"
      subtitle="View your leave balances, active requests, and complete history."
      actions={
        <button
          onClick={() => navigate("/employee/leaves/apply")}
          className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-200 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Apply for Leave
        </button>
      }
    >
      {/* Leave Balance Metrics / Empty State Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {hasBalances ? (
          <>
            {leaveTypes.map((l) => (
              <StatCard
                key={l.type}
                label={l.type}
                value={l.remaining}
                sub={`of ${l.total} days remaining`}
                accentColor={l.accent}
              />
            ))}
          </>
        ) : (
          <div className="md:col-span-3 relative overflow-hidden bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="p-4 rounded-2xl bg-orange-50 dark:bg-slate-800/80 border border-orange-100 dark:border-slate-700/50 text-orange-500 shrink-0">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Leave Balances Configured</h3>
                <span className="text-[10px] bg-orange-500/10 text-orange-400 font-semibold px-2 py-0.5 rounded-full border border-orange-500/20">
                  Setup Needed
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Your leave allocation has not been initialized yet. Please reach out to your HR administrator to set up your annual leave quota.
              </p>
              <button
                onClick={() => setShowContactHR(true)}
                className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors pt-2 inline-flex items-center gap-1"
              >
                Contact HR Department <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Pending Applications Stat - shown only when there are balances or history */}
        {(hasBalances || history.length > 0) && (
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pending Requests</span>
              <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{pendingCount}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Awaiting manager approval, of {history.length} request{history.length === 1 ? "" : "s"}</div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 h-full rounded-full" style={{ width: `${history.length ? Math.round((pendingCount / history.length) * 100) : 0}%` }}></div>
            </div>
          </div>
        )}
      </div>

      {/* Leave History Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl space-y-6 overflow-hidden">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 p-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Leave History</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Track previous requests and live status
              {updatedAt ? ` \u00b7 updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
              {" "}
              <button type="button" onClick={() => load({ silent: true })} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">Refresh</button>
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {["all", "pending", "approved", "rejected"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    activeTab === tab
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History List */}
        <div className="p-6 space-y-3">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
              <p className="text-lg font-medium dark:text-slate-300">
                {activeTab === "all" ? "No leave history" : `No ${activeTab} requests`}
              </p>
            </div>
          ) : (
            filteredHistory.map((request, index) => (
              <div
                key={request.id || index}
                className="group relative bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-600 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="flex items-start md:items-center gap-4 pl-2">
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500">
                    <Briefcase className="w-5 h-5" style={{ color: leaveTypeColor(request.leave_type || request.type) }} />
                  </div>

                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">{formatLeaveType(request.leave_type || request.type)}</h4>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {request.id || `LR-${index + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        {formatLeaveDate(request.start_date)} &rarr; {formatLeaveDate(request.end_date)}
                      </span>
                      <span>•</span>
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {request.days || 1} day(s)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side status and action */}
                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-slate-200 dark:border-slate-700 pt-3 md:pt-0">
                  <div className="text-right">
                    <EmployeeStatusBadge status={request.status} />
                    {request.reviewed_at && (request.status === "approved" || request.status === "rejected") ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {request.status === "approved" ? "Approved" : "Rejected"}{request.reviewer_name || (request.approved_by && request.approved_by !== "-" ? request.approved_by : "") ? ` by ${request.reviewer_name || request.approved_by}` : ""} on {formatLeaveDate(request.reviewed_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ContactHRDialog
        isOpen={showContactHR}
        onClose={() => setShowContactHR(false)}
        defaultTopic={defaultContactHRTopic}
        onSuccess={() => {}}
      />
    </EmployeePageShell>
  );
}