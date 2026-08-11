import { useState, useEffect, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { TrendingUp, Users, UserCheck, Clock, AlertCircle, RefreshCw, Building2, Award, Target, Star, Activity, CheckCircle, Briefcase, MapPin, Calendar, FileText } from "lucide-react";
import { SearchInput, StatCard, TopBarButton } from "../../../../components/DashboardWidgets";
import HRPage from "../../../../components/HRPage";
import { getEmployeeDashboard } from "../../../../service/employee";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/employee-management" },
  { label: "Employees", href: "/zoiko-hr/employee-management/employees" },
  { label: "Organization Structure", href: "/zoiko-hr/employee-management/organization" },
  { label: "Employee Lifecycle", href: "/zoiko-hr/employee-management/lifecycle" },
  { label: "Reports", href: "/zoiko-hr/employee-management/reports" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/employee-management"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, subtitle, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        {Icon && <div className={`p-2 ${color} rounded-lg`}><Icon className="w-5 h-5 text-white" /></div>}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function ProgressBlock({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value}/{total} ({pct}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="text-center py-12">
      {Icon && <Icon className="w-12 h-12 mx-auto mb-4 text-gray-300" />}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-4">{message}</p>
      {action}
    </div>
  );
}

export default function EmployeeManagementDashboard() {
  const navigate = useNavigate();
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getEmployeeDashboard()
      .then(setDash)
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setError("Failed to load dashboard data. Please try again later.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <HRPage title="Employee Management Dashboard" subtitle="Employee management overview and analytics"><SubNav /><div className="p-6 text-center text-gray-400">Loading dashboard...</div></HRPage>;

  if (error) return <HRPage title="Employee Management Dashboard" subtitle="Employee management overview and analytics"><SubNav /><div className="p-6 text-center text-red-500 bg-red-50 rounded-lg m-4"><AlertCircle className="w-8 h-8 mx-auto mb-2" />{error}</div></HRPage>;

  const d = dash || {};

  return (
    <HRPage title="Employee Management Dashboard" subtitle="Employee management overview and analytics">
      <SubNav />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchInput placeholder="Search employees, teams, metrics..." />
        <div className="flex flex-wrap gap-2">
          <TopBarButton icon={UserCheck} label="Refresh Data" />
          <TopBarButton icon={Briefcase} label="New Request" primary />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Employees" value={d.total_employees ?? 0} icon={Users} iconBg="#3B82F6" />
          <StatCard label="Active Employees" value={d.active_employees ?? 0} icon={UserCheck} iconBg="#10B981" />
          <StatCard label="Inactive Employees" value={d.inactive_employees ?? 0} icon={AlertCircle} iconBg="#EF4444" />
          <StatCard label="On Probation" value={d.on_probation ?? 0} icon={Clock} iconBg="#F97316" />
          <StatCard label="New Hires This Month" value={d.new_hires_this_month ?? 0} icon={TrendingUp} iconBg="#8B5CF6" />
          <StatCard label="Exits This Month" value={d.exits_this_month ?? 0} icon={AlertCircle} iconBg="#EC4899" />
          <StatCard label="Department Count" value={d.department_distribution?.length ?? 0} icon={Building2} iconBg="#6366F1" />
          <StatCard label="Designation Count" value={d.designation_distribution?.length ?? 0} icon={Award} iconBg="#14B8A6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Department Distribution</h2>
            {d.department_distribution?.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No department data"
                message="Department distribution data is not available"
              />
            ) : (
              <div className="space-y-3">
                {d.department_distribution?.map((dept, idx) => (
                  <ProgressBlock
                    key={dept.department}
                    label={dept.department}
                    value={dept.count}
                    total={d.total_employees}
                    color="bg-blue-500"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Designation Distribution</h2>
            {d.designation_distribution?.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No designation data"
                message="Designation distribution data is not available"
              />
            ) : (
              <div className="space-y-3">
                {d.designation_distribution?.map((desig, idx) => (
                  <ProgressBlock
                    key={desig.designation}
                    label={desig.designation}
                    value={desig.count}
                    total={d.total_employees}
                    color="bg-green-500"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Location Distribution</h2>
            {d.location_distribution?.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="No location data"
                message="Location distribution data is not available"
              />
            ) : (
              <div className="space-y-3">
                {d.location_distribution?.map((loc, idx) => (
                  <ProgressBlock
                    key={loc.location}
                    label={loc.location}
                    value={loc.count}
                    total={d.total_employees}
                    color="bg-purple-500"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Lifecycle Events</h2>
            {d.lifecycle_events?.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No lifecycle events"
                message="Recent employee lifecycle events will appear here"
              />
            ) : (
              <div className="space-y-3">
                {d.lifecycle_events?.map((event, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className={`w-2 h-2 rounded-full ${event.event_type === "probation_end" ? "bg-orange-500" : event.event_type === "confirmation" ? "bg-green-500" : event.event_type === "promotion" ? "bg-blue-500" : event.event_type === "transfer" ? "bg-purple-500" : event.event_type === "resignation" ? "bg-red-500" : "bg-gray-500"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{event.event_type.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</p>
                      <p className="text-xs text-gray-500">{event.employee_name} • {event.event_date}</p>
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${event.status === "completed" ? "bg-green-100 text-green-800" : event.status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>{event.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Probation End</h2>
            {d.upcoming_probation_end?.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No upcoming probation ends"
                message="No employees approaching end of probation"
              />
            ) : (
              <div className="space-y-3">
                {d.upcoming_probation_end?.map((emp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{emp.employee_name}</p>
                      <p className="text-xs text-gray-500">Probation ends: {emp.probation_end_date}</p>
                    </div>
                    <button onClick={() => navigate(`/zoiko-hr/employee-management/employees/${emp.employee_id}`)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">View</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Confirmations</h2>
            {d.upcoming_confirmations?.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="No upcoming confirmations"
                message="No employees awaiting confirmation"
              />
            ) : (
              <div className="space-y-3">
                {d.upcoming_confirmations?.map((emp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{emp.employee_name}</p>
                      <p className="text-xs text-gray-500">Confirmation due: {emp.confirmation_date}</p>
                    </div>
                    <button onClick={() => navigate("/zoiko-hr/employee-management/lifecycle")} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Confirm</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Anniversaries</h2>
          {d.upcoming_anniversaries?.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming anniversaries"
              message="No employee anniversaries coming up"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.upcoming_anniversaries?.map((emp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-medium text-sm">{emp.employee_name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{emp.employee_name}</p>
                    <p className="text-xs text-gray-500">Birthday: {new Date(emp.next_birthday).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </HRPage>
  );
}

