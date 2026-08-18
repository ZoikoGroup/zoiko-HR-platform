import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Users, ShieldAlert, UserCheck, UserCog,
  AlertTriangle, ChevronRight, CheckCircle2, Activity,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await superAdminService.getDashboardStats();
      setStats(data);
    } catch (e) {
      console.error("Failed to load dashboard", e);
      setError(e.message || "Unable to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  };

  const STATUS_META = {
    PENDING: { label: "Pending Review", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
    ACTIVE: { label: "Active", bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200/60", dot: "bg-emerald-500" },
    APPROVED: { label: "Approved", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60", dot: "bg-blue-500" },
    REJECTED: { label: "Rejected", bg: "bg-red-50", text: "text-red-600", border: "border-red-200/60", dot: "bg-red-500" },
    SUSPENDED: { label: "Suspended", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" },
    DEACTIVATED: { label: "Deactivated", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200/60", dot: "bg-blue-500" },
    ON_HOLD: { label: "On Hold", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200/60", dot: "bg-amber-500" },
  };

  const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status?.toUpperCase()] || { label: status, bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200/60", dot: "bg-slate-400" };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text} border ${meta.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const AVATAR_GRADIENTS = [
    "from-pink-500 to-rose-500",
    "from-amber-500 to-orange-500",
    "from-violet-500 to-indigo-500",
    "from-emerald-500 to-teal-500",
    "from-blue-500 to-cyan-500",
    "from-red-500 to-pink-500",
    "from-fuchsia-500 to-purple-500",
    "from-sky-500 to-blue-500",
  ];

  const getOrgAvatar = (name = "") => {
    const clean = name.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const initials = words.length > 1
      ? (words[0][0] + words[1][0])
      : clean.slice(0, 2);
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
    const gradient = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    return { initials: initials.toUpperCase(), gradient };
  };

  const totalPending = (stats?.total_organizations ?? 0) - (stats?.active_organizations ?? 0) - (stats?.suspended_organizations ?? 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="p-8 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <div className="h-8 w-48 bg-slate-100 rounded-xl animate-pulse" />
                <div className="h-4 w-72 bg-slate-100 rounded-lg animate-pulse mt-2" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5 bg-white border border-slate-200/80 rounded-3xl shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100" />
                  <div className="h-3 w-20 bg-slate-100 rounded-lg" />
                </div>
                <div className="h-8 w-16 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Total Organizations", value: stats?.total_organizations ?? 0, icon: Building2, gradient: "from-blue-500 to-indigo-500", link: "/super-admin/organizations" },
    { title: "Active", value: stats?.active_organizations ?? 0, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-500" },
    { title: "Suspended", value: stats?.suspended_organizations ?? 0, icon: ShieldAlert, gradient: "from-slate-500 to-gray-600" },
    { title: "Total Employees", value: stats?.total_employees ?? 0, icon: Users, gradient: "from-violet-500 to-purple-500" },
  ];

  const secondaryCards = [
    { title: "Active Employees", value: stats?.active_employees ?? 0, icon: UserCheck, gradient: "from-emerald-400 to-green-500" },
    { title: "Admins", value: stats?.total_admins ?? 0, icon: UserCog, gradient: "from-amber-400 to-orange-500" },
    { title: "HR Admins", value: stats?.total_hr_admins ?? 0, icon: UserCog, gradient: "from-pink-400 to-rose-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50/60 p-6 sm:p-10 text-slate-800 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm">
                <Activity className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Super Admin Dashboard
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-500 font-medium ml-1">
              Comprehensive platform overview across all organizations and products.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={loadStats} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
          </div>
        )}

        {/* Primary Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s, idx) => (
            <div key={idx}
              className={`group p-5 bg-white border border-slate-200/80 rounded-3xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${s.link ? "cursor-pointer" : ""}`}
              onClick={() => s.link && navigate(s.link)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 bg-gradient-to-br ${s.gradient} text-white rounded-2xl shadow-sm`}>
                  <s.icon className="w-5 h-5" />
                </div>
                {s.link && <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" />}
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.title}</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Secondary Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {secondaryCards.map((s, idx) => (
            <div key={idx} className="p-5 bg-white border border-slate-200/80 rounded-3xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 bg-gradient-to-br ${s.gradient} text-white rounded-xl shadow-sm`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.title}</p>
              </div>
              <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Recent Organizations */}
        {stats?.recent_organizations?.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">Recent Organizations</h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
                  {stats.recent_organizations.length}
                </span>
              </div>
              <button onClick={() => navigate("/super-admin/organizations")}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {stats.recent_organizations.map((org) => {
                const avatar = getOrgAvatar(org.name);
                return (
                  <div key={org.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                  >
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatar.gradient} text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white shrink-0`}>
                      {avatar.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors truncate">
                        {org.name}
                      </div>
                      <div className="text-xs font-medium text-slate-400">
                        ID: {org.organization_code || "—"} · {org.total_employees ?? 0} employees
                      </div>
                    </div>
                    <StatusBadge status={org.status} />
                    <span className="text-xs font-medium text-slate-400 shrink-0">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Workforce Summary */}
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Workforce Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Employees</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats?.total_employees ?? 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Employees</p>
              <p className="text-2xl font-extrabold text-emerald-600 mt-1">{stats?.active_employees ?? 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Admins</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats?.total_admins ?? 0}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">HR Admins</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats?.total_hr_admins ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
