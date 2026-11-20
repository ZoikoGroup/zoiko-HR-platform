import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Search, Calendar, MapPin, User, X } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { staffName, indexById, asPage } from "../../../utils/travelDisplay";
import TravelPager from "./TravelPager";
import { api } from "../../../service/api";

const PER_PAGE = 25;

// The staff picker lists every active person in the organization, whatever their role (audit T7: a trip can be raised
// for a manager, HR or the admin too), and searches the server, so nobody is missing past the first page.
const staffPickerPath = (term = "") =>
  `/hr/employees?page=1&per_page=100&include_all_roles=true&status=active${term ? `&search=${encodeURIComponent(term)}` : ""}`;

function getDestinationDisplay(dest) {
  if (!dest) return "—";
  if (typeof dest === "string") return dest;
  if (typeof dest === "object") {
    return dest.city || dest.name || dest.location || JSON.stringify(dest);
  }
  return "—";
}

export default function TravelRequests() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadedTerm, setLoadedTerm] = useState("");      // the search the rows on screen came from
  const [employees, setEmployees] = useState([]);
  const [staffSearch, setStaffSearch] = useState("");
  const searchTimer = useRef(null);
  const staffTimer = useRef(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ employee_id: "", destination: "", purpose: "", start_date: "", end_date: "" });

  // one page of requests from the server, with the total (audit T6)
  const loadPage = async (nextPage = page, term = search) => {
    try {
      setLoading(true);
      setLoadError("");
      const q = term.trim() ? `&search=${encodeURIComponent(term.trim())}` : "";
      const res = asPage(await api.get(`/hr/travel?page=${nextPage}&per_page=${PER_PAGE}${q}`), nextPage, PER_PAGE);
      setRequests(res.items);
      setTotal(res.total);
      setPage(nextPage);
      setLoadedTerm(term.trim());
    } catch (err) {
      console.error("Failed to load travel requests:", err);
      setLoadError(err?.message || "The travel requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const loadStaff = async (term = "") => {
    try {
      const empRes = await api.get(staffPickerPath(term));
      setEmployees(empRes?.items || empRes || []);
    } catch (err) {
      console.error("Failed to load staff:", err);
    }
  };

  useEffect(() => {
    loadPage(1, "");
    loadStaff("");
    return () => { clearTimeout(searchTimer.current); clearTimeout(staffTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the box filters the rows on screen at once, then asks the server (destination, purpose or name) shortly after
  const onSearch = (value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadPage(1, value), 350);
  };

  const onStaffSearch = (value) => {
    setStaffSearch(value);
    clearTimeout(staffTimer.current);
    staffTimer.current = setTimeout(() => loadStaff(value.trim()), 300);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.destination.trim() || !form.start_date || !form.end_date) {
      setFormError("Choose the staff member, and enter the destination, start date and end date.");
      return;
    }
    if (form.end_date < form.start_date) {
      setFormError("The end date cannot be before the start date.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const payload = { 
        employee_id: parseInt(form.employee_id),
        destination: form.destination.trim(),
        purpose: form.purpose.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
      };
      
      const newRecordResponse = await api.post("/hr/travel", payload);
      const addedItem = newRecordResponse?.data || newRecordResponse;
      
      setRequests(prev => [addedItem, ...prev]);
      setTotal(t => t + 1);
      setShowModal(false);
      setForm({ employee_id: "", destination: "", purpose: "", start_date: "", end_date: "" });
    } catch (err) {
      setFormError(err?.message || "The travel request could not be created. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const employeesById = indexById(employees);
  // once the server has answered for this search, its rows are the result; until then the rows on screen are narrowed
  const filtered = loadedTerm === search.trim() ? requests : requests.filter(r =>
    staffName(r, employeesById).toLowerCase().includes(search.toLowerCase()) ||
    (r.destination || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <TravelLayout title="Travel Requests" subtitle="Submit and monitor operational items">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filter workflows..." 
              value={search} 
              onChange={e => onSearch(e.target.value)} 
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
            />
          </div>
          <button 
            onClick={() => { setFormError(""); setShowModal(true); }} 
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Issue Request
          </button>
        </div>

        {loadError && <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{loadError}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500 font-medium">Syncing database entries...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100 text-gray-400 text-sm font-medium">No records found matching search queries.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 font-bold text-gray-600">
                  <th className="p-4">Staff Member</th>
                  <th className="p-4">Destination Target</th>
                  <th className="p-4">Purpose</th>
                  <th className="p-4">Start Date</th>
                  <th className="p-4">End Date</th>
                  <th className="p-4">Status Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                {filtered.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-gray-50/40 transition-colors">
                    <td className="p-4 font-semibold text-gray-900">{staffName(row, employeesById)}</td>
                    <td className="p-4">{getDestinationDisplay(row.destination)}</td>
                    <td className="p-4 text-gray-500">{row.purpose || "—"}</td>
                    <td className="p-4 text-gray-600">{row.start_date || "—"}</td>
                    <td className="p-4 text-gray-600">{row.end_date || "—"}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide capitalize ${
                        row.status?.toLowerCase() === "approved" ? "bg-green-100 text-green-800"
                          : row.status?.toLowerCase() === "rejected" ? "bg-red-100 text-red-800"
                          : ["cancelled", "completed"].includes(row.status?.toLowerCase()) ? "bg-gray-100 text-gray-700"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>{row.status || "Pending"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TravelPager page={page} perPage={PER_PAGE} total={total} onPage={(p) => loadPage(p)} label="requests" />
        
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">New Travel Request</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                {formError && <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{formError}</div>}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Staff Member</label>
                  <input
                    type="search"
                    aria-label="Search staff"
                    placeholder="Search by name or email..."
                    value={staffSearch}
                    onChange={e => onStaffSearch(e.target.value)}
                    className="w-full mb-2 border border-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <select 
                      className="w-full border border-gray-200 pl-9 pr-4 py-2.5 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={form.employee_id} 
                      onChange={e => setForm({...form, employee_id: e.target.value})}
                      required
                    >
                      <option value="">Choose staff member...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name} ({emp.email || emp.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Destination Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="e.g. San Francisco Office" className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Start Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input type="date" className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">End Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input type="date" className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} required />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Purpose of Travel</label>
                  <textarea placeholder="Specify strategic goals..." rows="2" className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} />
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setShowModal(false)} className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600">Cancel</button>
                  <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                    {submitting ? "Processing..." : "Deploy Workspace"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TravelLayout>
  );
}
