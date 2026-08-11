import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../../components/HRPage";
import { getOrgChart } from "../../../../service/employee";
import { Users, Building2, UserCheck, MapPin, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";

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

const DEPARTMENT_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-red-500", "bg-teal-500", "bg-cyan-500", "bg-indigo-500",
];

function TreeNode({ node, depth = 0 }) {
  return (
    <div className="relative pl-6 ml-3 border-l border-gray-200">
      <div className="absolute left-0 top-2 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center -translate-x-1.5">
        <Users className="w-1.5 h-1.5 text-white" />
      </div>
      <div className="bg-green-50 rounded-lg p-2 ml-4 hover:bg-green-100 transition-colors mb-2">
        <p className="text-xs font-medium text-green-900">{node.name}</p>
        <p className="text-xs text-green-600">{node.job_title}</p>
      </div>
      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function OrgChart() {
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getOrgChart(1)
      .then(setChart)
      .catch((err) => {
        console.error("Org chart load error:", err);
        setError("Failed to load organization chart data. Please try again later.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <HRPage title="Organization Structure" subtitle="View and manage employee reporting hierarchy and department structure"><SubNav /><div className="p-6 text-center text-gray-400">Loading organization chart...</div></HRPage>;

  if (error) return <HRPage title="Organization Structure" subtitle="View and manage employee reporting hierarchy and department structure"><SubNav /><div className="p-6 text-center text-red-500 bg-red-50 rounded-lg m-4"><AlertCircle className="w-8 h-8 mx-auto mb-2" />{error}</div></HRPage>;

  return (
    <HRPage title="Organization Structure" subtitle="View and manage employee reporting hierarchy and department structure">
      <SubNav />

      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Department Structure
            </h2>
            {(!chart?.departments || Object.keys(chart.departments).length === 0) ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No department data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(chart.departments).map(([id, name], idx) => (
                  <div key={id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${DEPARTMENT_COLORS[idx % DEPARTMENT_COLORS.length]} text-white font-medium text-sm`}>{idx + 1}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">Department</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Reporting Hierarchy
            </h2>
            {(!chart?.reporting_structure || chart.reporting_structure.length === 0) ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No reporting hierarchy data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chart.reporting_structure.map((emp) => (
                  <div key={emp.id} className="relative pl-8">
                    <div className="absolute left-0 top-1 w-0.5 h-full bg-gray-200"></div>
                    <div className="absolute left-0 top-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <UserCheck className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 ml-6 hover:bg-gray-100 transition-colors">
                      <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.job_title}</p>
                      {emp.manager_name && (
                        <p className="text-xs text-blue-600 mt-1">Manager: {emp.manager_name}</p>
                      )}
                      {emp.children?.map((child) => (
                        <TreeNode key={child.id} node={child} depth={1} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            Location Distribution
          </h2>
          {(!chart?.employees || chart.employees.filter((e) => e.location).length === 0) ? (
            <div className="text-center py-8">
              <MapPin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No location data available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {chart.employees.filter((e) => e.location).map((emp) => (
                <div key={emp.id} className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                  <MapPin className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">{emp.name}</p>
                    <p className="text-xs text-purple-600">{emp.location}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </HRPage>
  );
}

export default OrgChart;
