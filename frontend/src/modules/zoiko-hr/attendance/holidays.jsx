import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Upload, Trash2, CalendarDays, List, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getHolidays, createHoliday, updateHoliday, deleteHoliday, importHolidays } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/attendance" },
  { label: "Attendance Records", href: "/zoiko-hr/attendance/daily" },
  { label: "Holiday Calendar", href: "/zoiko-hr/attendance/holidays" },
  { label: "Attendance Analytics", href: "/zoiko-hr/attendance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/attendance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const TYPE_OPTIONS = ["Public", "Company", "Optional"];

const TYPE_COLORS = {
  Public: "bg-red-100 text-red-800 border-red-200",
  Company: "bg-blue-100 text-blue-800 border-blue-200",
  Optional: "bg-purple-100 text-purple-800 border-purple-200",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const initialForm = {
  name: "", date: "", type: "Public", is_recurring: false, description: "",
};

export default function Holidays() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editHoliday, setEditHoliday] = useState(null);
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getHolidays()
      .then((data) => setHolidays(Array.isArray(data) ? data : data?.items || []))
      .catch((err) => setError(err?.message || "Failed to load holidays"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditHoliday(null);
    setForm({ ...initialForm });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (h) => {
    setEditHoliday(h);
    setForm({
      name: h.name || "",
      date: h.date ? h.date.substring(0, 10) : "",
      type: h.type || "Public",
      is_recurring: h.is_recurring || false,
      description: h.description || "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = (d) => {
    const e = {};
    if (!d.name?.trim()) e.name = "Name is required";
    if (!d.date) e.date = "Date is required";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        type: form.type,
        is_recurring: form.is_recurring,
        description: form.description?.trim() || null,
      };
      if (editHoliday) {
        await updateHoliday(editHoliday.id, payload);
      } else {
        await createHoliday(payload);
      }
      setShowModal(false);
      const data = await getHolidays();
      setHolidays(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save holiday" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this holiday?")) return;
    try {
      await deleteHoliday(id);
      const data = await getHolidays();
      setHolidays(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      setError(err.message || "Failed to delete holiday");
    }
  };

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importData);
      await importHolidays(Array.isArray(parsed) ? { holidays: parsed } : parsed);
      setShowImport(false);
      setImportData("");
      const data = await getHolidays();
      setHolidays(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      setError(err.message || "Failed to import holidays");
    }
  };

  const calendarData = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const holidayMap = {};
    holidays.forEach((h) => {
      if (h.date) {
        const d = new Date(h.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const day = d.getDate();
          if (!holidayMap[day]) holidayMap[day] = [];
          holidayMap[day].push(h);
        }
      }
    });
    return { firstDay, daysInMonth, holidayMap };
  }, [holidays, currentMonth, currentYear]);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  return (
    <HRPage title="Holiday Calendar" subtitle="Manage company-wide public holidays and observances">
      <SubNav />
      <div className="space-y-6">
        
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-medium rounded-xl flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg">&times;</button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900">Holidays</h1>
              <p className="text-sm text-gray-500 font-medium mt-0.5">Track public and company events</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button onClick={() => setView("calendar")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === "calendar" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                <CalendarDays className="w-4 h-4" /> Calendar
              </button>
              <button onClick={() => setView("list")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === "list" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                <List className="w-4 h-4" /> List
              </button>
            </div>
            <button onClick={() => setShowImport(true)}
              className="flex justify-center items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 bg-white rounded-xl hover:bg-gray-50 text-sm font-bold shadow-sm transition-colors">
              <Upload className="w-4 h-4" /> Import
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow transition-colors">
              <Plus className="w-4 h-4" /> Add Holiday
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
            <span className="text-sm font-bold text-gray-500">Loading calendar data...</span>
          </div>
        ) : view === "calendar" ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
              <button onClick={prevMonth} className="p-2 text-gray-500 hover:text-orange-600 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all shadow-sm">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-extrabold text-gray-900">{MONTHS[currentMonth]} {currentYear}</h2>
              <button onClick={nextMonth} className="p-2 text-gray-500 hover:text-orange-600 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all shadow-sm">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS.map((d) => (
                <div key={d} className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">{d}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 bg-gray-50 gap-px border-b border-gray-100">
              {Array.from({ length: calendarData.firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-gray-50 min-h-[120px]" />
              ))}
              {Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1).map((day) => {
                const dayHolidays = calendarData.holidayMap[day] || [];
                const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
                return (
                  <div key={day} className={`bg-white min-h-[120px] p-2 hover:bg-gray-50 transition-colors ${isToday ? "ring-2 ring-inset ring-orange-400 bg-orange-50/10" : ""}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-orange-500 text-white" : "text-gray-700"}`}>{day}</span>
                    </div>
                    <div className="space-y-1.5">
                      {dayHolidays.slice(0, 3).map((h, idx) => (
                        <div key={idx} onClick={() => openEdit(h)} className={`cursor-pointer px-2 py-1 text-xs font-bold rounded-md border ${TYPE_COLORS[h.type] || "bg-gray-100 text-gray-800 border-gray-200"} truncate hover:opacity-80 transition-opacity`} title={h.name}>
                          {h.name}
                        </div>
                      ))}
                      {dayHolidays.length > 3 && (
                        <div className="text-xs font-bold text-gray-400 px-1">+{dayHolidays.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Pad end of calendar */}
              {Array.from({ length: (7 - ((calendarData.firstDay + calendarData.daysInMonth) % 7)) % 7 }).map((_, i) => (
                <div key={`empty-end-${i}`} className="bg-gray-50 min-h-[120px]" />
              ))}
            </div>
            
            {/* Legend */}
            <div className="p-4 flex items-center gap-6 bg-white justify-center">
              {TYPE_OPTIONS.map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${type === 'Public' ? 'bg-red-400' : type === 'Company' ? 'bg-blue-400' : 'bg-purple-400'}`} />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{type}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Recurring</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-orange-50/50 transition-colors group">
                      <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{h.name}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-700">{formatDate(h.date)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${TYPE_COLORS[h.type] || "bg-gray-100 text-gray-800 border-gray-200"}`}>
                          {h.type || "Public"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-600">{h.is_recurring ? "Yes" : "No"}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-500 max-w-[200px] truncate">{h.description || "-"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(h)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Edit">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(h.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {holidays.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-gray-500 font-bold text-sm">No holidays defined yet. Click "Add Holiday" to create one.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-5 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">{editHoliday ? "Edit Holiday" : "Add Holiday"}</h2>
                <button onClick={() => setShowModal(false)} className="text-orange-200 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <form id="holiday-form" onSubmit={handleSubmit} className="space-y-5">
                  {formErrors.submit && (
                    <div className="text-red-700 text-sm font-semibold bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{formErrors.submit}</div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Holiday Name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. New Year's Day"
                      className={`w-full bg-gray-50 border ${formErrors.name ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors`} />
                    {formErrors.name && <p className="text-red-500 text-xs font-bold mt-1.5">{formErrors.name}</p>}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className={`w-full bg-gray-50 border ${formErrors.date ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors`} />
                      {formErrors.date && <p className="text-red-500 text-xs font-bold mt-1.5">{formErrors.date}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Holiday Type</label>
                      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors">
                        {TYPE_OPTIONS.map((v) => (<option key={v} value={v}>{v}</option>))}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Description / Remarks</label>
                    <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Optional details..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-colors resize-none" />
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                    <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer" />
                    <label htmlFor="recurring" className="text-sm font-bold text-gray-700 cursor-pointer">Make this holiday recur annually</label>
                  </div>
                </form>
              </div>
              
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 mt-auto">
                <button type="button" onClick={() => setShowModal(false)} 
                  className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button type="submit" form="holiday-form" disabled={submitting} 
                  className="flex justify-center items-center gap-2 min-w-[130px] px-5 py-2.5 text-sm font-bold bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-xl transition-colors shadow-sm">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? "Saving..." : editHoliday ? "Update Holiday" : "Save Holiday"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-5 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Import Holidays</h2>
                <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 font-medium mb-3">Paste a JSON array of holidays to bulk import.</p>
                <textarea rows={8} value={importData} onChange={(e) => setImportData(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  placeholder='[&#10;  {"name":"New Year","date":"2026-01-01","type":"Public"}&#10;]' />
              </div>
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 mt-auto">
                <button onClick={() => setShowImport(false)} 
                  className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button onClick={handleImport}
                  className="px-5 py-2.5 text-sm font-bold bg-gray-900 hover:bg-black text-white rounded-xl transition-colors shadow-sm">
                  Run Import
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
