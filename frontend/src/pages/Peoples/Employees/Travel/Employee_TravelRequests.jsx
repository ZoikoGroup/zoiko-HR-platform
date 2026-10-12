import { useEffect, useMemo, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { CheckCircle, Loader2 } from "lucide-react";
import { getTravel, createTravel } from "../../../../service/employee";
import { getStoredUser } from "../../../../service/api";
import { formatDate } from "../../../../utils/dateTime";
import { validateTravelForm, travelPayload, serverTravelErrors, todayString } from "../../../../utils/travelRequestForm";

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("approve")) return "Approved";
  if (v.includes("pending")) return "Pending";
  if (v.includes("complete")) return "Completed";
  if (v.includes("reject")) return "Rejected";
  if (v.includes("cancel")) return "Cancelled";
  return s ? String(s) : "";
}

const EMPTY = { destination: "", purpose: "", from: "", to: "" };
const boxClass = (bad) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-[#0f172a] text-gray-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:border-transparent ${
    bad ? "border-red-400 focus:ring-red-300" : "border-gray-200 dark:border-[#334155] focus:ring-blue-500"
  }`;

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-red-500 mt-1">{error}</p> : null}
    </div>
  );
}

export default function TravelRequests() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const mounted = useRef(true);
  const today = todayString();

  const loadRequests = async () => {
    const res = await getTravel(getStoredUser()?.id);
    const data = res?.data || res?.items || res || [];
    const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return arr.filter((t) => !t.category && !t.type?.includes("expense"));
  };

  useEffect(() => {
    mounted.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await loadRequests();
        if (mounted.current) setRequests(list);
      } catch (e) {
        if (!mounted.current) return;
        setError(e?.message || "Failed to load travel requests");
        setRequests([]);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
  }, []);

  const requestCards = useMemo(() => {
    return [...requests]
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .map((r, i) => ({
        id: r.id || r.request_id || r.travel_id || `TR-${String(i + 1).padStart(3, "0")}`,
        destination: r.destination || r.location || r.city || "",
        from: r.from || r.travel_date || r.start_date || "",
        to: r.to || r.return_date || r.end_date || "",
        purpose: r.purpose || r.reason || "",
        status: normalizeStatus(r.status),
      }));
  }, [requests]);

  const setField = (name) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [name]: value };
      // choosing a start date after the end date clears the end date instead of leaving an impossible range
      if (name === "from" && next.to && value && next.to < value) next.to = "";
      return next;
    });
    setFieldErrors((prev) => (prev[name] || prev.to ? { ...prev, [name]: undefined, ...(name === "from" ? { to: undefined } : {}) } : prev));
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
    const problems = validateTravelForm(form, todayString());
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      setFormError(null);
      return;
    }
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await createTravel(travelPayload(form));
      closeForm();
      setSuccess("Your travel request has been submitted successfully! It is under process and will be reviewed by the admin.");
      setTimeout(() => { if (mounted.current) setSuccess(null); }, 5000);
      try {
        const list = await loadRequests();
        if (mounted.current) setRequests(list);
      } catch { /* the request is saved; the list refreshes on the next visit */ }
    } catch (err) {
      const { fieldErrors: fe, message } = serverTravelErrors(err);
      setFieldErrors(fe);
      setFormError(message || null);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Requests" subtitle="Raise and track your business travel requests.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading travel requests...</span>
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
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              + New Request
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} noValidate className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border-2 border-blue-600">
              <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">New Travel Request</h3>
              {formError && (
                <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="tr-destination" label="Destination" error={fieldErrors.destination}>
                  <input id="tr-destination" type="text" placeholder="e.g. Mumbai" maxLength={200} value={form.destination} onChange={setField("destination")} aria-invalid={!!fieldErrors.destination} className={boxClass(fieldErrors.destination)} />
                </Field>
                <Field id="tr-purpose" label="Purpose" error={fieldErrors.purpose}>
                  <input id="tr-purpose" type="text" placeholder="e.g. Client Meeting" maxLength={500} value={form.purpose} onChange={setField("purpose")} aria-invalid={!!fieldErrors.purpose} className={boxClass(fieldErrors.purpose)} />
                </Field>
                <Field id="tr-from" label="Travel Date From" error={fieldErrors.from}>
                  <input id="tr-from" type="date" min={today} value={form.from} onChange={setField("from")} aria-invalid={!!fieldErrors.from} className={boxClass(fieldErrors.from)} />
                </Field>
                <Field id="tr-to" label="Travel Date To" error={fieldErrors.to}>
                  <input id="tr-to" type="date" min={form.from && form.from > today ? form.from : today} value={form.to} onChange={setField("to")} aria-invalid={!!fieldErrors.to} className={boxClass(fieldErrors.to)} />
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
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
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
                    <p className="text-xs text-gray-400 dark:text-[#64748b]">{r.from ? formatDate(r.from) : ""}{r.from && r.to ? " → " : ""}{r.to ? formatDate(r.to) : ""}</p>
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
