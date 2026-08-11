import { useState, useEffect } from "react";
import {
  FileText, Clock, AlertTriangle, CheckCircle, XCircle, TrendingUp,
  RefreshCw, CalendarClock, Users, Ban
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import HRPage from "../../../components/HRPage";
import { getDocuments, getDocumentDashboardStats } from "../../../service/hrService";

const STATUS_META = {
  pending:  { label: "Pending",  bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500"  },
  approved: { label: "Approved", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", bg: "bg-rose-50",    text: "text-rose-700",   border: "border-rose-200",   dot: "bg-rose-500"   },
  expired:  { label: "Expired",  bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-200",  dot: "bg-slate-400"  },
};
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};
const CAT_COLORS = {
  company:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  employee: "bg-violet-50 text-violet-700 border-violet-200",
  contract: "bg-cyan-50 text-cyan-700 border-cyan-200",
  policy:   "bg-teal-50 text-teal-700 border-teal-200",
};
const CategoryPill = ({ category }) => {
  const cls = CAT_COLORS[category?.toLowerCase()] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${cls}`}>
      {category || "other"}
    </span>
  );
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const PIE_COLORS = { pending: "#f59e0b", approved: "#10b981", rejected: "#f43f5e", expired: "#94a3b8" };

export default function DocumentsDashboard() {
  const [docs, setDocs]       = useState([]);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getDocuments().then(res => { const raw = res?.data; setDocs(Array.isArray(raw) ? raw : (raw?.items || raw?.data || [])); }),
      getDocumentDashboardStats().then(res => setStats(res?.data)),
    ])
      .catch(() => setError("Could not load document stats. Check your connection."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const total    = docs.length;
  const pending  = docs.filter(d => d.status === "pending").length;
  const approved = docs.filter(d => d.status === "approved").length;
  const rejected = docs.filter(d => d.status === "rejected").length;
  const expired  = docs.filter(d => d.status === "expired").length;
  const rate     = total ? Math.round((approved / total) * 100) : 0;

  const pieData = [
    { name: "Pending",  value: pending,  color: PIE_COLORS.pending  },
    { name: "Approved", value: approved, color: PIE_COLORS.approved },
    { name: "Rejected", value: rejected, color: PIE_COLORS.rejected },
    { name: "Expired",  value: expired,  color: PIE_COLORS.expired  },
  ].filter(d => d.value > 0);

  const catCounts = docs.reduce((acc, d) => {
    const c = d.category || "other"; acc[c] = (acc[c] || 0) + 1; return acc;
  }, {});
  const categories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  const recent = [...docs]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 6);

  const expiring = stats?.expiring_soon || [];

  const statCards = [
    { label: "Total Documents", value: total,    Icon: FileText,      bg: "bg-indigo-50",  text: "text-indigo-600",  border: "border-l-4 border-indigo-500"  },
    { label: "Pending Review",  value: pending,  Icon: Clock,         bg: "bg-amber-50",   text: "text-amber-600",   border: "border-l-4 border-amber-500"   },
    { label: "Approved",        value: approved, Icon: CheckCircle,   bg: "bg-emerald-50", text: "text-emerald-600", border: "border-l-4 border-emerald-500" },
    { label: "Rejected",        value: rejected, Icon: XCircle,       bg: "bg-rose-50",    text: "text-rose-600",    border: "border-l-4 border-rose-500"    },
    { label: "Expired",         value: expired,  Icon: Ban,           bg: "bg-slate-100",  text: "text-slate-500",   border: "border-l-4 border-slate-400"   },
    { label: "Completion Rate",
      value: `${rate}%`,
      Icon: TrendingUp, bg: "bg-blue-50", text: "text-blue-600", border: "border-l-4 border-blue-500" },
  ];

  return (
    <HRPage title="Documents Overview">
      <div className="space-y-8 pb-10">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Document Control</p>
            <h2 className="text-2xl font-bold">Documents Overview</h2>
            <p className="text-sm text-indigo-200 mt-1">
              {total} documents across {categories.length} {categories.length === 1 ? "category" : "categories"}.
              {pending > 0 && (
                <span className="ml-2 bg-white/20 rounded px-2 py-0.5 text-xs font-semibold">{pending} awaiting approval</span>
              )}
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-2 text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium">Loading document stats…</span>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-500 text-sm font-medium bg-rose-50 rounded-xl border border-rose-100 p-6">{error}</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {statCards.map(s => (
                <div key={s.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow ${s.border}`}>
                  <div className={`p-2 rounded-lg ${s.bg} w-fit mb-3`}><s.Icon className={`w-4 h-4 ${s.text}`} /></div>
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Expiring Soon Alert */}
            {expiring.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <h3 className="text-sm font-bold text-rose-800 uppercase tracking-wide">Expiring Soon — {expiring.length} document{expiring.length !== 1 ? "s" : ""}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {expiring.map(e => (
                    <div key={e.id} className="bg-white rounded-xl border border-rose-100 p-4 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {e.employee_name && <>{e.employee_name} · </>}
                          Expires {fmtDate(e.expiry_date)}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${e.days_remaining <= 7 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                        {e.days_remaining}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Recent documents */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Recently Added</h3>
                  <span className="text-xs text-slate-400">{recent.length} shown</span>
                </div>
                {recent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <span className="text-4xl mb-3">📂</span>
                    <p className="text-sm font-semibold text-slate-600">No documents yet</p>
                    <p className="text-xs text-slate-400 mt-1">Upload a document to see it here.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                      <tr>
                        <th className="text-left px-6 py-3 font-semibold">Name</th>
                        <th className="text-left px-6 py-3 font-semibold">Category</th>
                        <th className="text-left px-6 py-3 font-semibold">Status</th>
                        <th className="text-left px-6 py-3 font-semibold">Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recent.map(d => (
                        <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-800 truncate max-w-[160px]">{d.title}</td>
                          <td className="px-6 py-3"><CategoryPill category={d.category} /></td>
                          <td className="px-6 py-3"><StatusBadge status={d.status} /></td>
                          <td className="px-6 py-3 text-slate-400 text-xs">{fmtDate(d.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Right column: Pie chart + Categories */}
              <div className="space-y-6">
                {/* Status Pie Chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Status Breakdown</h3>
                  {pieData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend iconType="circle" iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Category breakdown */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">By Category</h3>
                  {categories.length === 0 ? (
                    <p className="text-sm text-slate-400">No categories yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {categories.map(([cat, count]) => {
                        const pct = total ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={cat}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="capitalize font-medium text-slate-700">{cat}</span>
                              <span className="text-slate-400">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </HRPage>
  );
}
