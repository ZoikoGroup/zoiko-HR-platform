import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, Clock, FileText, User } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { api } from "../../../service/api";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
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

const quickLinks = [
  { label: "Apply Leave", href: "/zoiko-hr/ess/leave", icon: Calendar },
  { label: "Request Time Off", href: "/zoiko-hr/ess/requests", icon: Clock },
  { label: "View Documents", href: "/zoiko-hr/ess/my-documents", icon: FileText },
  { label: "Update Profile", href: "/zoiko-hr/ess/profile", icon: User },
];

export default function EssDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const [leaveRes, essRes] = await Promise.allSettled([
          api.get("/hr/leaves/dashboard"),
          api.get("/hr/ess?page=1&per_page=5"),
        ]);

        if (!mounted) return;

        const leaveData = leaveRes.status === "fulfilled" ? leaveRes.value?.data || leaveRes.value : {};
        const essRequests = essRes.status === "fulfilled"
          ? essRes.value?.data || essRes.value || []
          : [];

        setDashboard({
          totalLeaveBalance: leaveData?.total_leave_balance ?? leaveData?.stats?.total_leave_balance ?? 25,
          pendingRequests: essRequests.length > 0
            ? essRequests.filter((r) => r?.status === "pending").length
            : (leaveData?.pending_requests ?? leaveData?.stats?.pending_requests ?? 0),
          recentRequests: Array.isArray(essRequests)
            ? essRequests.slice(0, 5).map((r) => ({
                id: r.id,
                type: r.request_type || r.type || "Request",
                description: r.description || r.reason || "",
                status: r.status || "pending",
                date: r.created_at ? r.created_at.slice(0, 10) : "",
              }))
            : [],
        });
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <HRPage title="Employee Self Service" subtitle="Overview of your ESS portal">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Employee Self Service" subtitle="Overview of your ESS portal">
        <SubNav />
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">Error: {error}</div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Employee Self Service" subtitle="Overview of your ESS portal">
      <SubNav />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ESS Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your employee self-service portal</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Leave Balance</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{dashboard.totalLeaveBalance} days</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Pending Requests</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{dashboard.pendingRequests}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Requests</h2>
              <NavLink to="/zoiko-hr/ess/requests" className="text-xs text-blue-600 font-medium hover:underline">View all</NavLink>
            </div>
            <div className="space-y-3">
              {dashboard.recentRequests.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No requests yet.</p>
              ) : (
                dashboard.recentRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.type}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${r.status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                        {r.status}
                      </span>
                      <span className="text-xs text-gray-400">{r.date}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
            <div className="grid grid-cols-2 gap-3">
              {quickLinks.map((link) => (
                <NavLink
                  key={link.label}
                  to={link.href}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <link.icon className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-700">{link.label}</span>
                  </div>
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
