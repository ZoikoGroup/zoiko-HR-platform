import { useEffect, useMemo, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import EmployeeDataTable from "../../../../components/employee/EmployeeDataTable";
import { CheckCircle, Loader2 } from "lucide-react";
import { getTravel, getTravelExpenses, createTravelExpense } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { EXPENSE_CATEGORIES, validateExpenseForm, expensePayload, serverExpenseErrors, formatClaimAmount } from "../../../../utils/travelExpenseForm";

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("reimburs") || v.includes("paid") || v.includes("complete")) return "Reimbursed";
  if (v.includes("approve")) return "Approved";
  if (v.includes("pending") || v.includes("submitted") || v.includes("progress")) return "Pending";
  if (v.includes("reject")) return "Rejected";
  if (v.includes("cancel")) return "Cancelled";
  return s ? String(s) : "Pending";
}

const asList = (res) => {
  const data = res?.data || res?.items || res || [];
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};

const EMPTY = { tripId: "", category: "Hotel", amount: "", description: "" };
const boxClass = (bad) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-[#0f172a] text-gray-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:border-transparent ${
    bad ? "border-red-400 focus:ring-red-300" : "border-gray-200 dark:border-[#334155] focus:ring-emerald-500"
  }`;

function Field({ id, label, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-red-500 mt-1">{error}</p> : null}
    </div>
  );
}

export default function TravelExpenses() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const me = getStoredUser()?.id;
        const [claims, myTrips] = await Promise.all([getTravelExpenses(me), getTravel(me).catch(() => [])]);
        if (!mounted.current) return;
        setExpenses(asList(claims));
        setTrips(asList(myTrips).filter((t) => !/reject|cancel/i.test(String(t.status || ""))));
      } catch (e) {
        if (!mounted.current) return;
        setError(e?.message || "Failed to load expenses");
        setExpenses([]);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
  }, []);

  const tripName = useMemo(() => Object.fromEntries(trips.map((t) => [t.id, t.destination])), [trips]);

  const expenseRows = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
        .map((e) => ({
          id: e.id,
          trip: e.request_id ? tripName[e.request_id] || `Trip #${e.request_id}` : "-",
          category: e.expense_type || e.category || "Other",
          description: e.description || "-",
          submitted: e.created_at || e.submitted_at ? formatDate(e.created_at || e.submitted_at) : "-",
          amount: formatClaimAmount(e.amount, e.currency || "INR"),
          status: normalizeStatus(e.status),
        })),
    [expenses, tripName]
  );

  const setField = (name) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    setFormError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY);
    setFieldErrors({});
    setFormError(null);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const problems = validateExpenseForm(form);
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      setFormError(null);
      return;
    }
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await createTravelExpense(expensePayload(form));
      closeForm();
      setSuccess("Your expense claim has been submitted successfully! It is under process and will be reviewed by the admin.");
      setTimeout(() => { if (mounted.current) setSuccess(null); }, 5000);
      try {
        const claims = await getTravelExpenses(getStoredUser()?.id);
        if (mounted.current) setExpenses(asList(claims));
      } catch { /* the claim is saved; the list refreshes on the next visit */ }
    } catch (err) {
      const { fieldErrors: fe, message } = serverExpenseErrors(err);
      setFieldErrors(fe);
      setFormError(message || null);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Expenses" subtitle="Submit and track your business travel reimbursements.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading expenses...</span>
        </div>
      )}

      {!loading && success && (
        <div role="status" className="mb-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-semibold flex items-center gap-2">
          <CheckCircle size={15} /> {success}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div />
            <button
              type="button"
              onClick={() => (showForm ? closeForm() : setShowForm(true))}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              + Claim Expense
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} noValidate className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border-2 border-emerald-600">
              <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">New Expense Claim</h3>
              {formError && (
                <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field id="te-trip" label="Trip (optional)" error={fieldErrors.tripId}>
                  <select id="te-trip" value={form.tripId} onChange={setField("tripId")} aria-invalid={!!fieldErrors.tripId} className={boxClass(fieldErrors.tripId)}>
                    <option value="">Not linked to a trip</option>
                    {trips.map((t) => <option key={t.id} value={t.id}>{t.destination}{t.start_date ? ` (${formatDate(t.start_date)})` : ""}</option>)}
                  </select>
                </Field>
                <Field id="te-category" label="Category" error={fieldErrors.category}>
                  <select id="te-category" value={form.category} onChange={setField("category")} aria-invalid={!!fieldErrors.category} className={boxClass(fieldErrors.category)}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field id="te-amount" label="Amount (₹)" error={fieldErrors.amount}>
                  <input id="te-amount" type="number" inputMode="decimal" placeholder="0.00" min="0" step="0.01" value={form.amount} onChange={setField("amount")} aria-invalid={!!fieldErrors.amount} className={boxClass(fieldErrors.amount)} />
                </Field>
                <Field id="te-description" label="What was it for?" error={fieldErrors.description} className="sm:col-span-3">
                  <input id="te-description" type="text" placeholder="e.g. Two nights at a hotel in Mumbai" maxLength={500} value={form.description} onChange={setField("description")} aria-invalid={!!fieldErrors.description} className={boxClass(fieldErrors.description)} />
                </Field>
              </div>
              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeForm}
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
              { key: "description", label: "Description" },
              { key: "submitted", label: "Submitted" },
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
