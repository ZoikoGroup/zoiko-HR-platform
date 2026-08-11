import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { SearchInput, StatCard, TopBarButton } from "../../components/DashboardWidgets";
import {
  LayoutDashboard, Building2, Users, CreditCard, AlertTriangle,
  Activity, TrendingUp, ArrowUpRight, ArrowDownRight, Package, Clock,
  DollarSign, HardDrive, Shield, Bell, MessageSquare, AlertCircle,
  CheckCircle, XCircle, ShieldAlert,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";

const PIE_COLORS = ["#FF7A00", "#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444"];

export default function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setError(null);
      setLoading(true);
      const [statsData, analyticsData] = await Promise.all([
        superAdminService.getDashboardStats(),
        superAdminService.getAnalytics(),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
    } catch (e) {
      console.error("Failed to load dashboard", e);
      setError(e.message || "Unable to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: "Total Organizations", value: stats?.total_organizations ?? 0, icon: Building2, iconBg: "#FF7A00", link: "/super-admin/organizations" },
    { title: "Pending Approval", value: stats?.pending_organizations ?? 0, icon: Clock, iconBg: "#F59E0B", link: "/super-admin/approvals" },
    { title: "Approved", value: stats?.active_organizations ?? 0, icon: CheckCircle, iconBg: "#10B981" },
    { title: "Rejected", value: stats?.rejected_organizations ?? "—", icon: XCircle, iconBg: "#EF4444" },
    { title: "Suspended", value: stats?.suspended_organizations ?? 0, icon: ShieldAlert, iconBg: "#64748B" },
    { title: "Deactivated", value: stats?.deactivated_organizations ?? 0, icon: ShieldAlert, iconBg: "#8B5CF6" },
    { title: "Total Users", value: stats?.total_users ?? 0, icon: Users, iconBg: "#8B5CF6" },
    { title: "Revenue", value: `$${stats?.total_revenue ?? 0}`, icon: DollarSign, iconBg: "#FBBF24" },
    { title: "Open Tickets", value: stats?.open_support_tickets ?? 0, icon: MessageSquare, iconBg: "#F97316" },
    { title: "Storage", value: `${stats?.total_storage_gb ?? 0} GB`, icon: HardDrive, iconBg: "#06B6D4" },
    { title: "Unread Notifications", value: stats?.unread_notifications ?? 0, icon: Bell, iconBg: "#3B82F6" },
    { title: "Security Events", value: stats?.unresolved_security_events ?? 0, icon: Shield, iconBg: "#DC2626" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="Super Admin Dashboard" description="Comprehensive platform overview" />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF7A00] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4FB] p-4 font-sans">
      <PageHeader title="Super Admin Dashboard" description="Comprehensive platform overview across all organizations and products." />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search organizations, users, reports..." />
        <div className="flex flex-wrap gap-2">
          <TopBarButton icon={Users} label="Invite User" />
          <TopBarButton icon={Building2} label="New Organization" primary />
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadAll} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, idx) => (
          <div key={idx} className={s.link ? "cursor-pointer" : ""} onClick={() => s.link && navigate(s.link)}>
            <StatCard
              label={s.title}
              value={s.value}
              icon={s.icon}
              iconBg={s.iconBg}
            />
          </div>
        ))}
      </div>
      {stats && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Registration Requests</h3>
          {stats.recent_registrations?.length > 0 ? (
            <div className="space-y-2">
              {stats.recent_registrations.map((reg) => (
                <div key={reg.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-slate-700">{reg.name}</span>
                    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      reg.status === "PENDING" ? "bg-amber-50 text-amber-700" :
                      reg.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" :
                      reg.status === "REJECTED" ? "bg-red-50 text-red-700" :
                      reg.status === "DEACTIVATED" ? "bg-purple-50 text-purple-700" :
                      "bg-slate-50 text-slate-600"
                    }`}>{reg.status}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(reg.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm py-4 text-center">No recent registrations</p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Organization Growth</h3>
          {analytics?.organization_growth?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={analytics.organization_growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#FF7A00" fill="#FF7A00" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No growth data available</p>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">User Growth</h3>
          {analytics?.user_growth?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={analytics.user_growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No user growth data available</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Subscription Distribution</h3>
          {analytics?.subscription_distribution?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={analytics.subscription_distribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {analytics.subscription_distribution.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No subscription data</p>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Product Adoption</h3>
          {analytics?.product_adoption?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analytics.product_adoption}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No product adoption data</p>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Platform Statistics</h3>
          {stats?.platform_stats && Object.keys(stats.platform_stats).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.platform_stats).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-sm font-semibold text-slate-700 capitalize">{plan}</span>
                  <span className="text-sm font-bold text-slate-800">{count} orgs</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No subscription data available</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Platform Activity</h3>
          {stats?.recent_activity && stats.recent_activity.length > 0 ? (
            <div className="space-y-2">
              {stats.recent_activity.map((act) => (
                <div key={act.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF7A00]/10 text-[#FF7A00]">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 capitalize truncate">{act.action} {act.entity_type}</p>
                    <p className="text-[10px] text-slate-400 truncate">{act.performed_by_email}</p>
                  </div>
                  <Clock className="h-3 w-3 text-slate-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm py-10 text-center">No recent activity</p>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-sm text-slate-600">Failed Logins (24h)</span>
              <span className="text-sm font-bold text-red-600">{stats?.failed_logins_24h ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-sm text-slate-600">Open Support Tickets</span>
              <span className="text-sm font-bold text-orange-600">{stats?.open_support_tickets ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-sm text-slate-600">Unread Notifications</span>
              <span className="text-sm font-bold text-blue-600">{stats?.unread_notifications ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-sm text-slate-600">Unresolved Security</span>
              <span className="text-sm font-bold text-red-600">{stats?.unresolved_security_events ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}