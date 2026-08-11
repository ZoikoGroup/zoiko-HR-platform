import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Search, Calendar, MapPin, DollarSign, Briefcase, User, X } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { api } from "../../../service/api";

const formatCurrency = (amount) => 
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);

function getEmployeeDisplay(emp) {
  if (!emp) return "Unknown";
  if (typeof emp === "string") return emp;
  if (typeof emp === "object") {
    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    return fullName || emp.full_name || emp.name || emp.email || "Unknown";
  }
  return "Unknown";
}

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
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ employee_id: "", destination: "", purpose: "", start_date: "", end_date: "" });

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [travelRes, empRes] = await Promise.all([
          api.get("/hr/travel?page=1&per_page=100&search="),
          api.get("/hr/employees?page=1&per_page=100")
        ]);
        
        setRequests(travelRes?.items || travelRes || []);
        setEmployees(empRes?.items || empRes || []);
      } catch (err) {
        console.error("Failed to load initial modules:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.destination || !form.start_date || !form.end_date) {
      alert("Please accurately fill all mandatory input parameters.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { 
        employee_id: parseInt(form.employee_id),
        destination: form.destination,
        purpose: form.purpose,
        start_date: form.start_date,
        end_date: form.end_date,
      };
      
      const newRecordResponse = await api.post("/hr/travel", payload);
      const addedItem = newRecordResponse?.data || newRecordResponse;
      
      setRequests(prev => [addedItem, ...prev]);
      setShowModal(false);
      setForm({ employee_id: "", destination: "", purpose: "", start_date: "", end_date: "" });
    } catch (err) {
      alert("Failed to securely deploy your travel registration request.");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = requests.filter(r => 
    (r.employee_name || r.employee || "").toLowerCase().includes(search.toLowerCase()) ||
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
              onChange={e => setSearch(e.target.value)} 
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
            />
          </div>
          <button 
            onClick={() => setShowModal(true)} 
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Issue Request
          </button>
        </div>

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
                    <td className="p-4 font-semibold text-gray-900">{getEmployeeDisplay(row.employee)}</td>
                    <td className="p-4">{getDestinationDisplay(row.destination)}</td>
                    <td className="p-4 text-gray-500">{row.purpose || "—"}</td>
                    <td className="p-4 text-gray-600">{row.start_date || "—"}</td>
                    <td className="p-4 text-gray-600">{row.end_date || "—"}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide capitalize ${
                        row.status?.toLowerCase() === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                      }`}>{row.status || "Pending"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">New Travel Request</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Active Employee</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <select 
                      className="w-full border border-gray-200 pl-9 pr-4 py-2.5 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={form.employee_id} 
                      onChange={e => setForm({...form, employee_id: e.target.value})}
                      required
                    >
                      <option value="">Choose employee...</option>
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
