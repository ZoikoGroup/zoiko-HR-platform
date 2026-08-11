import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Pencil, Trash2, Search, X, ToggleLeft, ToggleRight } from "lucide-react";
import HRPage from "../../../components/HRPage";
import {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
} from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const SHIFT_TYPES = ["General", "Morning", "Evening", "Night", "Rotational"];
const SHIFT_TYPE_MAP = {
  General: "general",
  Morning: "morning",
  Evening: "evening",
  Night: "night",
  Rotational: "rotational",
};

const SHIFT_TYPE_REVERSE_MAP = {
  general: "General",
  morning: "Morning",
  evening: "Evening",
  night: "Night",
  rotational: "Rotational",
};

const initialForm = {
  name: "",
  shift_type: "General",
  start_time: "09:00",
  end_time: "18:00",
  grace_time_minutes: 15,
  break_duration_minutes: 60,
  is_overtime_eligible: false,
  requires_attendance: true,
  description: "",
};

export default function AttendanceShifts() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({ ...initialForm });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const fetchShifts = useCallback(async () => {
    try {
      const res = await getShifts();
      const data = Array.isArray(res) ? res : res?.items || res?.data || [];
      setShifts(data);
    } catch {
      setShifts([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    getShifts()
      .then((res) => setShifts(Array.isArray(res) ? res : res?.items || res?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setFormData({ ...initialForm });
    setFormErrors({});
    setEditItem(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (shift) => {
    setEditItem(shift);
    setFormData({
      name: shift.name || "",
      shift_type: SHIFT_TYPE_REVERSE_MAP[shift.shift_type] || shift.shift_type || "General",
      start_time: shift.start_time || "09:00",
      end_time: shift.end_time || "18:00",
      grace_time_minutes: shift.grace_time_minutes ?? 15,
      break_duration_minutes: shift.break_duration_minutes ?? 60,
      is_overtime_eligible: !!shift.is_overtime_eligible,
      requires_attendance: shift.requires_attendance !== false,
      description: shift.description || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = (data) => {
    const errors = {};
    if (!data.name?.trim()) errors.name = "Name is required";
    if (!data.shift_type) errors.shift_type = "Type is required";
    if (!data.start_time) errors.start_time = "Start time is required";
    if (!data.end_time) errors.end_time = "End time is required";
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        shift_type: SHIFT_TYPE_MAP[formData.shift_type] || formData.shift_type,
        description: formData.description?.trim() || null,
      };
      if (editItem) {
        await updateShift(editItem.id, payload);
      } else {
        await createShift(payload);
      }
      setShowModal(false);
      resetForm();
      await fetchShifts();
    } catch (err) {
      setFormErrors({ submit: err.message || "Operation failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    try {
      await deleteShift(id);
      await fetchShifts();
    } catch (err) {
      setError(err.message || "Failed to delete shift");
    }
  };

  const handleToggleStatus = async (shift) => {
    try {
      await updateShift(shift.id, { is_active: !shift.is_active });
      await fetchShifts();
    } catch (err) {
      setError(err.message || "Failed to toggle shift status");
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return shifts;
    const q = search.toLowerCase();
    return shifts.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.shift_type || "").toLowerCase().includes(q)
    );
  }, [shifts, search]);

  if (loading) {
    return (
      <HRPage title="Attendance" subtitle="Manage shift definitions">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-500">Loading shifts...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Attendance" subtitle="Manage shift definitions">
      <SubNav />
      <div className="space-y-6">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shift Management</h1>
            <p className="text-sm text-gray-500 mt-1">Define and manage work shifts</p>
          </div>
          <button onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Create Shift
          </button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search shifts..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">&#9200;</div>
            <p className="text-gray-500 font-medium">
              {shifts.length === 0 ? "No shifts yet. Create your first shift." : "No shifts match your search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["Name", "Type", "Start Time", "End Time", "Grace Period", "Break", "Overtime Eligible", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-orange-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        {s.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{s.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 capitalize">
                          {s.shift_type || "General"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 font-mono">{s.start_time}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 font-mono">{s.end_time}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{s.grace_time_minutes ?? 15} min</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{s.break_duration_minutes ?? 60} min</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${s.is_overtime_eligible ? "text-green-600" : "text-gray-400"}`}>
                          {s.is_overtime_eligible ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleStatus(s)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            s.is_active !== false
                              ? "bg-green-100 text-green-800 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}>
                          {s.is_active !== false ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                          {s.is_active !== false ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(s)} className="p-1 text-gray-400 hover:text-orange-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(s.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800">{editItem ? "Edit Shift" : "Create Shift"}</h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {editItem && <div className="text-sm text-gray-500 mb-1">Editing: <span className="font-medium text-gray-800">{editItem.name}</span></div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name *</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={`w-full border ${formErrors.name ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shift Type *</label>
                    <select value={formData.shift_type} onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                      className={`w-full border ${formErrors.shift_type ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`}>
                      {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.shift_type && <p className="text-red-500 text-xs mt-1">{formErrors.shift_type}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Grace Time (minutes)</label>
                    <input type="number" min={0} value={formData.grace_time_minutes} onChange={(e) => setFormData({ ...formData, grace_time_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                    <input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className={`w-full border ${formErrors.start_time ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                    {formErrors.start_time && <p className="text-red-500 text-xs mt-1">{formErrors.start_time}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                    <input type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className={`w-full border ${formErrors.end_time ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} />
                    {formErrors.end_time && <p className="text-red-500 text-xs mt-1">{formErrors.end_time}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Break Duration (minutes)</label>
                    <input type="number" min={0} value={formData.break_duration_minutes} onChange={(e) => setFormData({ ...formData, break_duration_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.is_overtime_eligible} onChange={(e) => setFormData({ ...formData, is_overtime_eligible: e.target.checked })}
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                      <span className="text-sm text-gray-700">Overtime eligible</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.requires_attendance} onChange={(e) => setFormData({ ...formData, requires_attendance: e.target.checked })}
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                      <span className="text-sm text-gray-700">Requires attendance marking</span>
                    </label>
                  </div>
                </div>

                {formErrors.submit && <p className="text-red-500 text-sm">{formErrors.submit}</p>}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={submitting}
                    className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg font-medium transition-colors">
                    {submitting ? (editItem ? "Updating..." : "Creating...") : (editItem ? "Update Shift" : "Create Shift")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
