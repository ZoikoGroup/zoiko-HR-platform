import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../../components/HRPage";
import { getEmployeeReports, exportEmployeeReports } from "../../../../service/employee";
import { FileText, Download, Users, UserCheck, Building2, Clock, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";

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

export default function EmployeeReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState("employee_master");
  const [format, setFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    getEmployeeReports({ report_type: reportType })
      .then(setReports)
      .catch((err) => {
        console.error("Reports load error:", err);
        setError("Failed to load reports. Please try again later.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [reportType]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportEmployeeReports({ report_type: reportType, format });
      const data = Array.isArray(result) ? result : result?.data || result?.items || [];
      const headers = ["Employee ID", "Name", "Email", "Phone", "Job Title", "Department", "Employment Type", "Status", "Joining Date"];
      const rows = data.map((r) => [
        r.employee_code || r.id || "",
        `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.name || "",
        r.email || "",
        r.phone || "",
        r.job_title || "",
        r.department_name || r.department?.name || "",
        r.employment_type || "",
        r.status || "",
        r.date_of_joining || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  const getReportIcon = (type) => {
    switch (type) {
      case "employee_master": return Users;
      case "active_employees": return UserCheck;
      case "department": return Building2;
      case "lifecycle": return Clock;
      default: return FileText;
    }
  };

  const getReportColor = (type) => {
    switch (type) {
      case "employee_master": return "bg-blue-500";
      case "active_employees": return "bg-green-500";
      case "department": return "bg-purple-500";
      case "lifecycle": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  const formatReportType = (type) => {
    switch (type) {
      case "employee_master": return "Employee Master Report";
      case "active_employees": return "Active Employees Report";
      case "department": return "Department Report";
      case "lifecycle": return "Lifecycle Report";
      default: return type.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
    }
  };

  if (loading && reports.length === 0) {
    return (
      <HRPage title="Employee Reports" subtitle="Generate and download employee reports.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Employee Reports" subtitle="Generate and download employee reports.">
      <SubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { type: "employee_master", icon: Users, color: "bg-blue-500", label: "Employee Master Report" },
            { type: "active_employees", icon: UserCheck, color: "bg-green-500", label: "Active Employees Report" },
            { type: "department", icon: Building2, color: "bg-purple-500", label: "Department Report" },
            { type: "lifecycle", icon: Clock, color: "bg-orange-500", label: "Lifecycle Report" },
          ].map((report, idx) => {
            const Icon = report.icon;
            return (
              <div
                key={report.type}
                className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${report.type === reportType ? "ring-2 ring-blue-500" : ""}`}
                onClick={() => setReportType(report.type)}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-2 ${report.color} rounded-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">{report.label}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">Report</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {formatReportType(reportType)} - Export Options
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("csv")}
                className={`px-3 py-1 text-xs rounded font-medium ${format === "csv" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                CSV
              </button>
              <button
                onClick={() => setFormat("excel")}
                className={`px-3 py-1 text-xs rounded font-medium ${format === "excel" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Excel
              </button>
              <button
                onClick={() => setFormat("pdf")}
                className={`px-3 py-1 text-xs rounded font-medium ${format === "pdf" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                PDF
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Report Type:</span>
              <span className="text-sm font-medium text-gray-900">{formatReportType(reportType)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Format:</span>
              <span className="text-sm font-medium text-gray-900 uppercase">{format}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Records:</span>
              <span className="text-sm font-medium text-gray-900">{reports.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Last Generated:</span>
              <span className="text-sm font-medium text-gray-900">-</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> {exporting ? "Exporting..." : "Export Report"}
            </button>
          </div>
        </div>

        {reports.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Employee ID</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Email</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Department</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Joining Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports.slice(0, 5).map((record, idx) => {
                    const fullName = `${record.first_name || ""} ${record.last_name || ""}`.trim() || record.name || "-";
                    const deptName = record.department_name || record.department?.name || record.department || "-";
                    return (
                      <tr key={record.id || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-xs text-gray-500">{record.employee_code || record.id || "-"}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{fullName}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{record.email || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{deptName}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${record.status === "active" ? "bg-green-100 text-green-800" : record.status === "inactive" || record.status === "terminated" ? "bg-red-100 text-red-800" : record.status === "on_leave" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>{record.status || "-"}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{record.date_of_joining || "-"}</td>
                      </tr>
                    );
                  })}
                  {reports.length > 5 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-center text-xs text-gray-500">
                        +{reports.length - 5} more records...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
