import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Calendar, Flag, Filter } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getLeaveCalendar, getLeaveRequests, getHolidays, createHoliday } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/leave" },
  { label: "Requests", href: "/zoiko-hr/leave/requests" },
  { label: "Calendar", href: "/zoiko-hr/leave/calendar" },
  { label: "Reports", href: "/zoiko-hr/leave/reports" },
];

const typeColors = {
  annual: "bg-blue-500", sick: "bg-pink-500", casual: "bg-orange-500", earned: "bg-teal-500",
  maternity: "bg-purple-500", paternity: "bg-indigo-500", unpaid: "bg-gray-500", study: "bg-cyan-500", emergency: "bg-red-500",
};

const typeLabels = {
  annual: "Annual", sick: "Sick", casual: "Casual", earned: "Earned",
  maternity: "Maternity", paternity: "Paternity", unpaid: "Unpaid", study: "Study", emergency: "Emergency",
};

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/leave"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function LeaveCalendar() {
  const today = new Date();
  const [records, setRecords] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [typeFilter, setTypeFilter] = useState("all");
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", description: "" });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);
  const [holidayError, setHolidayError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const [data, hols] = await Promise.all([
          getLeaveCalendar({ year: currentYear, month: currentMonth + 1 }),
          getHolidays({ year: currentYear }),
        ]);
        if (mounted) {
          setRecords(Array.isArray(data) ? data : []);
          const holData = Array.isArray(hols) ? hols : (hols?.data || hols?.items || []);
          setHolidays(Array.isArray(holData) ? holData : []);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, [currentYear, currentMonth]);

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayForm.name.trim() || !holidayForm.date) {
      setHolidayError("Name and date are required");
      return;
    }
    setHolidaySubmitting(true);
    setHolidayError(null);
    try {
      await createHoliday({
        name: holidayForm.name.trim(),
        date: holidayForm.date,
        description: holidayForm.description.trim() || null,
      });
      setShowHolidayModal(false);
      setHolidayForm({ name: "", date: "", description: "" });
      setSuccessMsg("Holiday added successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      const [data, hols] = await Promise.all([
        getLeaveCalendar({ year: currentYear, month: currentMonth + 1 }),
        getHolidays({ year: currentYear }),
      ]);
      setRecords(Array.isArray(data) ? data : []);
      const holData = Array.isArray(hols) ? hols : (hols?.data || hols?.items || []);
      setHolidays(Array.isArray(holData) ? holData : []);
    } catch (err) {
      setHolidayError(err?.message || "Failed to add holiday");
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const filtered = useMemo(() => {
    let result = records;
    if (typeFilter !== "all") result = result.filter((r) => r.leave_type === typeFilter);
    return result;
  }, [records, typeFilter]);

  const monthHolidays = useMemo(() => {
    return holidays.filter(h => {
      const d = new Date(h.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [holidays, currentMonth, currentYear]);

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayLeaves = filtered.filter((l) => dateStr >= l.start_date && dateStr <= l.end_date);
      const dayHolidays = monthHolidays.filter(h => h.date === dateStr);
      days.push({ date: d, dateStr, leaves: dayLeaves, holidays: dayHolidays });
    }
    return days;
  }, [filtered, monthHolidays, currentYear, currentMonth, daysInMonth, firstDayOfWeek]);

  if (loading) {
    return (
      <HRPage title="Leave Calendar" subtitle="Team leave calendar view">
        <SubNav />
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="text-gray-500 font-medium text-sm">Loading calendar...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Leave Calendar" subtitle="Team leave calendar view">
      <SubNav />
      <div className="space-y-6">
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 rounded-xl border border-teal-100">
              <Calendar className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-none">Leave Calendar</h1>
              <p className="text-sm text-gray-500 mt-1">View team leaves and company holidays</p>
            </div>
          </div>
          <button
            onClick={() => { setShowHolidayModal(true); setHolidayError(null); }}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow"
          >
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        </div>

        {successMsg && (
          <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">
            {successMsg}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          
          {/* Header Row: Nav + Filter */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 p-1">
                <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-gray-600 hover:shadow-sm">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-40 text-center font-bold text-gray-800">
                  {monthNames[currentMonth]} {currentYear}
                </div>
                <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-gray-600 hover:shadow-sm">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {monthHolidays.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-lg text-xs font-semibold">
                  <Flag className="w-3.5 h-3.5" />
                  {monthHolidays.length} holiday(s)
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <div className="flex gap-1 overflow-x-auto pb-1 lg:pb-0 hide-scrollbar">
                <button
                  onClick={() => setTypeFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${typeFilter === "all" ? "bg-teal-50 text-teal-700" : "text-gray-500 hover:bg-gray-50"}`}
                >All</button>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <button
                    key={k} onClick={() => setTypeFilter(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${typeFilter === k ? "bg-teal-50 text-teal-700" : "text-gray-500 hover:bg-gray-50"}`}
                  >{v}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
              {DAYS.map((day) => (
                <div key={day} className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-100 last:border-r-0">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 bg-gray-100 gap-px">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="bg-gray-50 min-h-[120px]" />;
                const isToday = day.date === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                
                return (
                  <div key={day.date} className={`bg-white min-h-[120px] p-2 flex flex-col group transition-colors hover:bg-gray-50/50 ${isToday ? "ring-2 ring-teal-500 ring-inset" : ""}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-teal-500 text-white" : "text-gray-600 group-hover:bg-gray-100"}`}>
                        {day.date}
                      </span>
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto hide-scrollbar max-h-[85px]">
                      {day.holidays.map((h) => (
                        <div key={h.id || h.name} title={`Holiday: ${h.name}`}
                          className="flex items-center gap-1 text-[10px] font-semibold leading-tight px-1.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-100 truncate">
                          <Flag className="w-2.5 h-2.5 flex-shrink-0" /> {h.name}
                        </div>
                      ))}
                      {day.leaves.slice(0, 4).map((l) => (
                        <div key={l.id} title={`${l.employee_name || l.employee} - ${l.leave_type}`}
                          className={`text-[10px] font-medium leading-tight px-1.5 py-1 rounded text-white truncate shadow-sm ${typeColors[l.leave_type] || "bg-gray-400"}`}>
                          {(l.employee_name || l.employee || "").split(" ")[0]}
                        </div>
                      ))}
                      {day.leaves.length > 4 && (
                        <div className="text-[10px] text-gray-500 font-semibold px-1.5 bg-gray-100 rounded py-0.5 text-center">
                          +{day.leaves.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 border-t border-gray-100 pt-4 flex flex-wrap items-center gap-4">
            <span className="text-xs font-bold text-gray-400 uppercase">Legend</span>
            {Object.entries(typeLabels).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <span className={`w-3 h-3 rounded-full shadow-sm ${typeColors[type]}`} /> {label}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-4 flex justify-between items-center text-white">
              <h2 className="text-lg font-bold">Add Company Holiday</h2>
              <button onClick={() => { setShowHolidayModal(false); setHolidayError(null); }} className="text-teal-50 hover:text-white transition-colors text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAddHoliday} className="p-6 space-y-5">
              {holidayError && <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4" />{holidayError}</div>}
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Holiday Name <span className="text-red-500">*</span></label>
                <input type="text" value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors" placeholder="e.g. Independence Day" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
                <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={3} value={holidayForm.description} onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })} 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors" placeholder="Optional details..." />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => { setShowHolidayModal(false); setHolidayError(null); }} 
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={holidaySubmitting} 
                  className="px-5 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-sm hover:shadow">
                  {holidaySubmitting ? "Adding..." : "Add Holiday"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
