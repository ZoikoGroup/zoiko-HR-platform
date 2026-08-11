import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import HRPage from "../../../../components/HRPage";
import { getEmployeeLifecycle, confirmProbation, promoteEmployee, transferEmployee, resignEmployee, exitEmployee } from "../../../../service/employee";
import { Clock, UserCheck, TrendingUp, AlertCircle, RefreshCw, FileText, Users, Building2, MapPin } from "lucide-react";

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

function LifecycleEvent({ event, onAction, actionLabel, actionColor }) {
  const navigate = useNavigate();
  const getEventIcon = (eventType) => {
    switch (eventType) {
      case "probation_start": return Clock;
      case "probation_end": return UserCheck;
      case "confirmation": return FileText;
      case "promotion": return TrendingUp;
      case "transfer": return Users;
      case "resignation": return AlertCircle;
      case "exit": return AlertCircle;
      default: return Clock;
    }
  };

  const getEventColor = (eventType) => {
    switch (eventType) {
      case "probation_start": return "bg-orange-500";
      case "probation_end": return "bg-green-500";
      case "confirmation": return "bg-blue-500";
      case "promotion": return "bg-purple-500";
      case "transfer": return "bg-indigo-500";
      case "resignation": return "bg-red-500";
      case "exit": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const formatEventType = (eventType) => {
    switch (eventType) {
      case "probation_start": return "Probation Start";
      case "probation_end": return "Probation End";
      case "confirmation": return "Confirmation";
      case "promotion": return "Promotion";
      case "transfer": return "Transfer";
      case "resignation": return "Resignation";
      case "exit": return "Exit";
      default: return eventType.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
    }
  };

  const Icon = getEventIcon(event.event_type);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${getEventColor(event.event_type)} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900">{formatEventType(event.event_type)}</h3>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${event.status === "completed" ? "bg-green-100 text-green-800" : event.status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>{event.status}</span>
          </div>
          <p className="text-xs text-gray-600 mb-2">{event.employee_name} • {event.event_date}</p>
          {event.reason && (
            <p className="text-xs text-gray-500 mb-2">Reason: {event.reason}</p>
          )}
          {event.new_value && (
            <div className="bg-gray-50 rounded p-2 mb-2">
              <p className="text-xs font-medium text-gray-700 mb-1">Changes:</p>
              <pre className="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(event.new_value, null, 2)}</pre>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            {event.status === "pending" && (
              <button
                onClick={() => onAction(event.employee_id || event.id, "approve", event.event_type)}
                className={`text-xs px-3 py-1 rounded font-medium ${actionColor(event.event_type)} hover:opacity-80 transition-opacity`}
              >
                {actionLabel(event.event_type)}
              </button>
            )}
            <button onClick={() => navigate(`/zoiko-hr/employee-management/employees/${event.employee_id}`)} className="text-xs text-gray-500 hover:text-gray-700">View Details</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeLifecycle() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    getEmployeeLifecycle(employeeFilter || undefined)
      .then(data => {
        let filtered = data;
        if (filter !== "all") {
          filtered = data.filter((e) => e.event_type === filter);
        }
        setEvents(filtered);
      })
      .catch((err) => {
        console.error("Lifecycle load error:", err);
        setError("Failed to load lifecycle events. Please try again later.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, employeeFilter]);

  const stats = {
    total: events.length,
    pending: events.filter((e) => e.status === "pending").length,
    completed: events.filter((e) => e.status === "completed").length,
    probation: events.filter((e) => e.event_type === "probation_start").length,
    confirmations: events.filter((e) => e.event_type === "confirmation").length,
    promotions: events.filter((e) => e.event_type === "promotion").length,
    transfers: events.filter((e) => e.event_type === "transfer").length,
    resignations: events.filter((e) => e.event_type === "resignation").length,
    exits: events.filter((e) => e.event_type === "exit").length,
  };

  const handleAction = async (eventId, action, eventType) => {
    const today = new Date().toISOString().split("T")[0];

    switch (eventType) {
      case "probation_start":
        if (!window.confirm("Confirm probation completion for this employee?")) return;
        break;
      case "promotion": {
        const newDesignation = prompt("Enter new designation ID:", "");
        if (!newDesignation || !window.confirm(`Promote employee to designation ID ${newDesignation}?`)) return;
        await promoteEmployee({ employee_id: eventId, new_designation_id: parseInt(newDesignation, 10), effective_date: today });
        load();
        return;
      }
      case "transfer": {
        const newDept = prompt("Enter new department ID:", "");
        if (!newDept || !window.confirm(`Transfer employee to department ID ${newDept}?`)) return;
        await transferEmployee({ employee_id: eventId, new_department_id: parseInt(newDept, 10), effective_date: today });
        load();
        return;
      }
      case "resignation": {
        if (!window.confirm("Process resignation for this employee?")) return;
        break;
      }
      case "exit": {
        if (!window.confirm("Process exit for this employee? This will mark them as terminated.")) return;
        break;
      }
    }

    try {
      switch (eventType) {
        case "probation_start":
          await confirmProbation({ employee_id: eventId, confirmation_date: today });
          break;
        case "resignation":
          await resignEmployee({ employee_id: eventId, resignation_date: today, last_working_date: today });
          break;
        case "exit":
          await exitEmployee({ employee_id: eventId, exit_date: today, exit_type: "voluntary" });
          break;
      }
      load();
    } catch (err) {
      setError(err.message || "Failed to process action");
    }
  };

  const getActionLabel = (eventType) => {
    switch (eventType) {
      case "probation_start": return "Confirm";
      case "probation_end": return "Complete";
      case "confirmation": return "Confirm";
      case "promotion": return "Promote";
      case "transfer": return "Transfer";
      case "resignation": return "Process";
      case "exit": return "Process";
      default: return "Process";
    }
  };

  const getActionColor = (eventType) => {
    switch (eventType) {
      case "probation_start": return "bg-blue-600 text-white";
      case "probation_end": return "bg-green-600 text-white";
      case "confirmation": return "bg-purple-600 text-white";
      case "promotion": return "bg-orange-600 text-white";
      case "transfer": return "bg-indigo-600 text-white";
      case "resignation": return "bg-red-600 text-white";
      case "exit": return "bg-gray-600 text-white";
      default: return "bg-blue-600 text-white";
    }
  };

  if (loading && events.length === 0) {
    return (
      <HRPage title="Employee Lifecycle" subtitle="Track employee lifecycle events and status changes.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading lifecycle events...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Employee Lifecycle" subtitle="Track employee lifecycle events and status changes.">
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

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Total Events</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Pending</p>
            <p className="text-lg font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Completed</p>
            <p className="text-lg font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Probation</p>
            <p className="text-lg font-bold text-orange-600">{stats.probation}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Confirmations</p>
            <p className="text-lg font-bold text-blue-600">{stats.confirmations}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Promotions</p>
            <p className="text-lg font-bold text-purple-600">{stats.promotions}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Transfers</p>
            <p className="text-lg font-bold text-indigo-600">{stats.transfers}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Resignations</p>
            <p className="text-lg font-bold text-red-600">{stats.resignations}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
            <p className="text-xs text-gray-400">Exits</p>
            <p className="text-lg font-bold text-gray-600">{stats.exits}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("probation_start")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "probation_start" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Probation
          </button>
          <button
            onClick={() => setFilter("confirmation")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "confirmation" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Confirmation
          </button>
          <button
            onClick={() => setFilter("promotion")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "promotion" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Promotion
          </button>
          <button
            onClick={() => setFilter("transfer")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "transfer" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Transfer
          </button>
          <button
            onClick={() => setFilter("resignation")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "resignation" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Resignation
          </button>
          <button
            onClick={() => setFilter("exit")}
            className={`px-3 py-1 text-xs rounded-full font-medium ${filter === "exit" ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Exit
          </button>
        </div>

        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100 shadow-sm">
              <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No lifecycle events found</p>
            </div>
          ) : (
            events.map((event) => (
              <LifecycleEvent
                key={event.id}
                event={event}
                onAction={handleAction}
                actionLabel={getActionLabel}
                actionColor={getActionColor}
              />
            ))
          )}
        </div>
      </div>
    </HRPage>
  );
}
