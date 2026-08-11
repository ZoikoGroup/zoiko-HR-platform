import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { CheckCircle } from "lucide-react";
import { getTravel, createTravelExpense } from "../../../../service/employee";


function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("reimburs") || v.includes("paid")) return "Reimbursed";
  if (v.includes("pending") || v.includes("submitted")) return "Pending";
  if (v.includes("reject")) return "Rejected";
  return s ? String(s) : "Pending";
}

export default function TravelExpenses() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ trip: "", category: "Hotel", amount: "" });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getTravel();
        const data = res?.data || res?.items || res || [];
        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        const filtered = arr.filter((t) => {
          const isExpense = t.type === "expense" || t.category || normalizeStatus(t.status) !== "Approved";
          return t.amount || t.expense_amount || t.category;
        });
        if (mounted) setExpenses(filtered);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load expenses");
        setExpenses([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const expenseRows = useMemo(() => {
    return expenses.map((e, i) => ({
      id: e.id || e.expense_id || `EXP-${String(i + 1).padStart(3, "0")}`,
      trip: e.destination || e.location || e.trip || e.reason || "",
      category: e.category || "Other",
      amount: `₹${String(e.amount || e.expense_amount || "0")}`,
      status: normalizeStatus(e.status),
    }));
  }, [expenses]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createTravelExpense({
        description: form.trip,
        expense_type: form.category,
        amount: parseFloat(form.amount) || 0,
      });
      setShowForm(false);
      setForm({ trip: "", category: "Hotel", amount: "" });
      setSuccess("Your expense claim has been submitted successfully! It is under process and will be reviewed by the admin.");
      setTimeout(() => setSuccess(null), 5000);
      const res = await getTravel();
      const data = res?.data || res?.items || res || [];
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setExpenses(arr.filter((t) => t.amount || t.expense_amount || t.category));
    } catch (err) {
      setFormError(err?.message || "Failed to submit expense claim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Expenses" subtitle="Submit and track your business travel reimbursements.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading expenses...</span>
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
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              + Claim Expense
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border-2 border-emerald-600">
              <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">New Expense Claim</h3>
              {formError && (
                <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Trip</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai Visit"
                    value={form.trip}
                    onChange={(e) => setForm((f) => ({ ...f, trip: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {["Hotel", "Flight", "Cab", "Meals", "Transport", "Other"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {saving ? "Submitting..." : "Submit Claim"}
                </button>
              </div>
            </form>
          )}

          <EmployeeDataTable
            columns={[
              { key: "id", label: "Expense ID" },
              { key: "trip", label: "Trip" },
              { key: "category", label: "Category" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            rows={expenseRows}
            renderCell={(row, col) => {
              if (col.key === "amount") return <span className="font-bold text-gray-900 dark:text-[#f1f5f9]">{row.amount}</span>;
              if (col.key === "status") return <EmployeeStatusBadge status={row.status} />;
              return row[col.key];
            }}
            emptyMessage="No expense claims found."
          />
        </div>
      )}
    </EmployeePageShell>
  );
}
