import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getWorkforceDashboard } from "../../../service/hrService";
import { Users, Target, DollarSign, UserCheck, AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/workforce-planning" },
  { label: "Plans", href: "/zoiko-hr/workforce-planning/plans" },
  { label: "Headcount", href: "/zoiko-hr/workforce-planning/headcount" },
  { label: "Succession", href: "/zoiko-hr/workforce-planning/succession" },
  { label: "Reports", href: "/zoiko-hr/workforce-planning/reports" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/workforce-planning"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50"
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

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

const formatNumber = (v) =>
  new Intl.NumberFormat("en-US").format(v || 0);

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between shadow-sm hover:shadow-md transition-shadow">
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${color || "text-gray-900"}`}>{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color ? color.replace("text-", "bg-").replace("900", "50").replace("600", "50") : "bg-gray-50"}`}>
        <Icon size={20} className={color || "text-gray-600"} />
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}</span>
    </div>
  );
}

function ReadinessGauge({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-12 text-right">{value}/{total}</span>
    </div>
  );
}

export default function WorkforceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getWorkforceDashboard();
        if (mounted) setData(res);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  if (loading && !data) {
    return (
      <HRPage title="Workforce Planning" subtitle="Dashboard overview">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  if (error) {
    return (
      <HRPage title="Workforce Planning" subtitle="Dashboard overview">
        <SubNav />
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      </HRPage>
    );
  }

  const d = data || {};

  const maxBudget = Math.max(d.total_budget || 1, 1);
  const maxPositions = Math.max(d.total_approved_positions || 1, 1);
  const totalSuccession = d.succession_count || 1;

  return (
    <HRPage title="Workforce Planning" subtitle="Strategic organizational alignment">
      <SubNav />
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Plans" value={formatNumber(d.total_plans)} icon={Target} color="text-blue-600" />
          <StatCard title="Active Plans" value={formatNumber(d.active_plans)} icon={BarChart3} color="text-teal-600" />
          <StatCard title="Total Budget" value={formatCurrency(d.total_budget)} icon={DollarSign} color="text-green-600" />
          <StatCard title="Total Headcount" value={formatNumber(d.total_current_headcount)} icon={Users} color="text-indigo-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-teal-600" /> Headcount Metrics
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{formatNumber(d.total_approved_positions)}</p>
                <p className="text-xs text-gray-400">Approved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{formatNumber(d.total_filled_positions)}</p>
                <p className="text-xs text-gray-400">Filled</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{formatNumber(d.total_vacant_positions)}</p>
                <p className="text-xs text-gray-400">Vacant</p>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Planned Hires</span>
                <span className="font-semibold text-gray-800">{formatNumber(d.total_planned_hires)}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-500">Projected Cost</span>
                <span className="font-semibold text-gray-800">{formatCurrency(d.total_projected_cost)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <UserCheck size={16} className="text-purple-600" /> Succession Readiness
            </h3>
            <div className="space-y-3">
              <ReadinessGauge label="Ready" value={d.ready_successors} total={totalSuccession} color="bg-green-500" />
              <ReadinessGauge label="High Risk" value={d.high_risk_count} total={totalSuccession} color="bg-red-500" />
              <ReadinessGauge label="Total Tracked" value={d.succession_count} total={totalSuccession || 1} color="bg-purple-500" />
            </div>
          </div>
        </div>

        {d.headcount_by_dept?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" /> Headcount by Department
            </h3>
            <div className="space-y-2">
              {d.headcount_by_dept.map((dept, i) => (
                <SimpleBar
                  key={i}
                  label={dept.department}
                  value={dept.approved}
                  max={maxPositions}
                  color="bg-blue-500"
                />
              ))}
            </div>
          </div>
        )}

        {d.department_breakdown?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-teal-600" /> Department Analytics
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-2 font-medium">Department</th>
                    <th className="py-2 font-medium">Plans</th>
                    <th className="py-2 font-medium">Positions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.department_breakdown.map((dept, i) => (
                    <tr key={i} className="border-b border-gray-50 text-gray-700">
                      <td className="py-2 font-medium">{dept.department}</td>
                      <td className="py-2">{dept.plans}</td>
                      <td className="py-2">{dept.positions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {d.recent_plans?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Recent Workforce Initiatives</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-2 font-medium">Title</th>
                    <th className="py-2 font-medium">Year</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent_plans.map((p) => {
                    const statusColors = {
                      draft: "bg-gray-100 text-gray-700",
                      active: "bg-green-100 text-green-700",
                      approved: "bg-blue-100 text-blue-700",
                      on_hold: "bg-yellow-100 text-yellow-700",
                      completed: "bg-teal-100 text-teal-700",
                      cancelled: "bg-red-100 text-red-700",
                    };
                    return (
                      <tr key={p.id} className="border-b border-gray-50 text-gray-700">
                        <td className="py-2 font-medium">{p.title}</td>
                        <td className="py-2">{p.plan_year}</td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || "bg-gray-100 text-gray-700"}`}>
                            {p.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2">{formatCurrency(p.budget)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
