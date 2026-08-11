import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { CheckCircle } from "lucide-react";
import { getTravel, createTravel } from "../../../../service/employee";


function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("approve")) return "Approved";
  if (v.includes("pending")) return "Pending";
  if (v.includes("complete")) return "Completed";
  if (v.includes("reject")) return "Rejected";
  return s ? String(s) : "";
}

export default function TravelRequests() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ destination: "", purpose: "", from: "", to: "" });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getTravel();
        const data = res?.data || res?.items || res || [];
        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        const filtered = arr.filter((t) => !t.category && !t.type?.includes("expense"));
        if (mounted) setRequests(filtered);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load travel requests");
        setRequests([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const requestCards = useMemo(() => {
    return requests.map((r, i) => ({
      id: r.id || r.request_id || r.travel_id || `TR-${String(i + 1).padStart(3, "0")}`,
      destination: r.destination || r.location || r.city || "",
      from: r.from || r.travel_date || r.start_date || "",
      to: r.to || r.return_date || r.end_date || "",
      purpose: r.purpose || r.reason || "",
      status: normalizeStatus(r.status),
    }));
  }, [requests]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createTravel({
        destination: form.destination,
        purpose: form.purpose,
        from: form.from,
        to: form.to,
        status: "Pending",
      });
      setShowForm(false);
      setForm({ destination: "", purpose: "", from: "", to: "" });
      setSuccess("Your travel request has been submitted successfully! It is under process and will be reviewed by the admin.");
      setTimeout(() => setSuccess(null), 5000);
      const res = await getTravel();
      const data = res?.data || res?.items || res || [];
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setRequests(arr.filter((t) => !t.category && !t.type?.includes("expense")));
    } catch (err) {
      setFormError(err?.message || "Failed to create travel request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Requests" subtitle="Raise and track your business travel requests.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading travel requests...</span>
        </div>
      )}

      {!loading && success && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-semibold flex items-center gap-2">
          <CheckCircle size={15} /> {success}
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div />
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              + New Request
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border-2 border-indigo-600">
              <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">New Travel Request</h3>
              {formError && (
                <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Destination</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Purpose</label>
                  <input
                    type="text"
                    placeholder="e.g. Client Meeting"
                    value={form.purpose}
                    onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Travel Date From</label>
                  <input
                    type="date"
                    value={form.from}
                    onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Travel Date To</label>
                  <input
                    type="date"
                    value={form.to}
                    onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-[#cbd5e1] border border-gray-200 dark:border-[#334155] rounded-lg text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1e293b]/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {saving ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          )}

          {requestCards.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155]">
              <p className="text-gray-500 dark:text-[#94a3b8] font-medium">No travel requests found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {requestCards.map((r) => (
                <div key={r.id} className="p-5 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <div className="flex gap-2.5 items-center mb-1">
                      <span className="text-xs font-bold text-gray-400 dark:text-[#64748b]">{r.id}</span>
                      <span className="text-base font-bold text-gray-900 dark:text-[#f1f5f9]">{r.destination}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-[#94a3b8] mb-0.5">{r.purpose}</p>
                    <p className="text-xs text-gray-400 dark:text-[#64748b]">{r.from}{r.from && r.to ? " → " : ""}{r.to}</p>
                  </div>
                  <EmployeeStatusBadge status={r.status || "-"} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </EmployeePageShell>
  );
}
