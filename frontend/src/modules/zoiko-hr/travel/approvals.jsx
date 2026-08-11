import { useState, useEffect, Component } from "react";
import { Check, X, ShieldCheck, CircleAlert, Calendar, MapPin, User, Building, RefreshCw } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { api } from "../../../service/api";

const STATUS_COLORS = {
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
};

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function safeStr(val, fallback = "") {
  return val != null ? String(val) : fallback;
}

function getNested(obj, path, fallback = "—") {
  if (!obj) return fallback;
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return fallback;
    current = current[key];
  }
  return current != null ? String(current) : fallback;
}

function getEmployeeDisplay(emp) {
  if (!emp) return "Unknown";
  if (typeof emp === "string") return emp;
  if (typeof emp === "object") {
    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    return fullName || emp.full_name || emp.name || emp.email || "Unknown";
  }
  return "Unknown";
}

function getDepartmentName(emp) {
  if (!emp) return "—";
  if (typeof emp === "string") return emp;
  if (typeof emp === "object") {
    if (emp.department?.name) return emp.department.name;
    if (emp.department_name) return emp.department_name;
    if (emp.department) return typeof emp.department === "string" ? emp.department : (emp.department.name || "—");
    return "—";
  }
  return "—";
}

function getDestinationDisplay(dest) {
  if (!dest) return "—";
  if (typeof dest === "string") return dest;
  if (typeof dest === "object") {
    return dest.city || dest.name || dest.location || JSON.stringify(dest);
  }
  return "—";
}

class ApprovalsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-xl mx-auto my-10">
          <CircleAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-md font-bold text-gray-800">Something went wrong</h3>
          <p className="text-sm text-gray-600 mt-1">An unexpected error occurred while loading approvals.</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ApprovalsContent() {
  const [approvals, setApprovals] = useState([]);
  const [employees, setEmployees] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const [travelRes, empRes] = await Promise.all([
        api.get("/hr/travel?page=1&per_page=100&search="),
        api.get("/hr/employees?page=1&per_page=100")
      ]);
      console.log("Travel API response:", travelRes);
      console.log("Employees API response:", empRes);
      
      const empMap = {};
      const empList = safeArray(empRes?.items || empRes);
      empList.forEach(emp => { if (emp?.id != null) empMap[emp.id] = emp; });
      setEmployees(empMap);
      setApprovals(safeArray(travelRes?.items || travelRes));
    } catch (e) {
      console.error("Authorization fetch failed:", e);
      setFetchError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAction = async (id, status) => {
    if (id == null) return;
    setActionLoading(id);
    try {
      await api.put(`/hr/travel/${id}`, { status });
      setApprovals(prev => prev.map(a => a?.id === id ? { ...a, status } : a));
    } catch (err) {
      alert("Action execution failed. Verify authorization states.");
    } finally {
      setActionLoading(null);
    }
  };

  const getEmployeeName = (empId) => {
    if (empId == null) return "Unknown";
    const emp = employees[empId];
    return getEmployeeDisplay(emp) || `ID: ${empId}`;
  };

  const getDepartment = (empId) => {
    if (empId == null) return "—";
    const emp = employees[empId];
    return getDepartmentName(emp);
  };

  const safeRender = (value, fallback = "N/A") => {
    if (value == null) return fallback;
    if (typeof value === "object") {
      console.warn("Object rendered directly:", value);
      return JSON.stringify(value);
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 font-medium">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        Loading approval records...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-xl mx-auto my-10">
        <CircleAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-md font-bold text-gray-800">Unable to load approvals</h3>
        <p className="text-sm text-gray-600 mt-1">The server could not be reached. Please try again.</p>
        <button onClick={loadData} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-100 text-gray-400 text-sm font-medium">
        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        No approval records found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-200 bg-white rounded-xl shadow-sm">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 font-bold text-gray-600">
            <th className="p-4"><User className="w-3.5 h-3.5 inline mr-1" /> Employee</th>
            <th className="p-4"><Building className="w-3.5 h-3.5 inline mr-1" /> Department</th>
            <th className="p-4"><MapPin className="w-3.5 h-3.5 inline mr-1" /> Destination</th>
            <th className="p-4"><Calendar className="w-3.5 h-3.5 inline mr-1" /> Travel Dates</th>
            <th className="p-4">Current Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
          {approvals.map((row, idx) => (
            <tr key={row?.id || idx} className="hover:bg-gray-50/30 transition-colors">
              <td className="p-4 font-semibold text-gray-900">{safeRender(getEmployeeName(row?.employee_id))}</td>
              <td className="p-4 text-gray-500">{safeRender(getDepartment(row?.employee_id))}</td>
              <td className="p-4 text-gray-600">{safeRender(getDestinationDisplay(row?.destination))}</td>
              <td className="p-4 text-gray-600">{safeRender(safeStr(row?.start_date, "—"))} — {safeRender(safeStr(row?.end_date, "—"))}</td>
              <td className="p-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                  STATUS_COLORS[(row?.status || "").toLowerCase()] || "bg-gray-100 text-gray-800"
                }`}>{safeRender(row?.status || "Pending")}</span>
              </td>
              <td className="p-4 text-right">
                {(!row?.status || row.status.toLowerCase() === "pending") ? (
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => handleAction(row?.id, "approved")}
                      disabled={actionLoading === row?.id}
                      className="inline-flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-3 py-1.5 font-bold rounded-lg shadow-sm transition-colors"
                    >
                      <Check className="w-3 h-3" /> {safeRender(actionLoading === row?.id ? "..." : "Approve")}
                    </button>
                    <button
                      onClick={() => handleAction(row?.id, "rejected")}
                      disabled={actionLoading === row?.id}
                      className="inline-flex items-center gap-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-3 py-1.5 font-bold rounded-lg shadow-sm transition-colors"
                    >
                      <X className="w-3 h-3" /> {safeRender(actionLoading === row?.id ? "..." : "Reject")}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 font-medium italic">Processed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TravelApprovals() {
  return (
    <TravelLayout title="Travel Approvals" subtitle="Review incoming travel authorizations">
      <ApprovalsErrorBoundary>
        <ApprovalsContent />
      </ApprovalsErrorBoundary>
    </TravelLayout>
  );
}
