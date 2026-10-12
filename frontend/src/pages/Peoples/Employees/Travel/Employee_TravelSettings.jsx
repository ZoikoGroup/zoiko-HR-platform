import { useEffect, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { Loader2 } from "lucide-react";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";
import {
  TRAVEL_CURRENCIES,
  DEFAULT_TRAVEL_SETTINGS,
  readTravelSettings,
  validateTravelSettings,
  travelSettingsPayload,
  settingsChanged,
  serverSettingsErrors,
} from "../../../../utils/travelSettingsPersonal";

const boxClass = (bad) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-[#0f172a] text-gray-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:border-transparent ${
    bad ? "border-red-400 focus:ring-red-300" : "border-gray-200 dark:border-[#334155] focus:ring-blue-500"
  }`;

export default function TravelSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState(DEFAULT_TRAVEL_SETTINGS);
  const [saved, setSaved] = useState(DEFAULT_TRAVEL_SETTINGS);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getMyProfile();
        if (!mounted.current) return;
        const current = readTravelSettings(res?.data || res || {});
        setForm(current);
        setSaved(current);
        setLoaded(true);
      } catch (e) {
        // never show invented defaults as if they were saved: say the settings could not be loaded
        if (mounted.current) setError(e?.message || "Your saved settings could not be loaded. Reload the page to try again.");
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
  }, []);

  const setField = (name) => (value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    setNotice(null);
    setSuccess(null);
    setError(null);
  };

  async function handleSave(e) {
    e.preventDefault();
    if (saving || !loaded) return;
    setSuccess(null);
    setNotice(null);
    setError(null);

    const problems = validateTravelSettings(form);
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      return;
    }
    setFieldErrors({});
    if (!settingsChanged(form, saved)) {
      setNotice("Nothing to save: you have not changed any setting.");
      return;
    }

    setSaving(true);
    try {
      await updateMyProfile(travelSettingsPayload(form));
      const fresh = readTravelSettings((await getMyProfile().then((r) => r?.data || r)) || {});
      if (!mounted.current) return;
      // show what the server now holds, so the page and a reload always agree
      setForm(fresh);
      setSaved(fresh);
      setSuccess("Settings saved successfully.");
    } catch (err) {
      const { fieldErrors: fe, message } = serverSettingsErrors(err);
      setFieldErrors(fe);
      setError(message || null);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Settings" subtitle="Configure your personal travel preferences and limits.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading settings...</span>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && notice && (
        <div role="status" className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium">{notice}</div>
      )}

      {!loading && success && (
        <div role="status" className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg">{success}</div>
      )}

      {!loading && loaded && (
        <form onSubmit={handleSave} noValidate className="space-y-5">
          <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Expense Preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ts-currency" className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Preferred Currency</label>
                <select id="ts-currency" value={form.currency} onChange={(e) => setField("currency")(e.target.value)} aria-invalid={!!fieldErrors.currency} className={boxClass(fieldErrors.currency)}>
                  {TRAVEL_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                {fieldErrors.currency && <p role="alert" className="text-xs text-red-500 mt-1">{fieldErrors.currency}</p>}
              </div>
              <div>
                <label htmlFor="ts-perdiem" className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Daily Per Diem Limit ({form.currency})</label>
                <input
                  id="ts-perdiem"
                  type="number"
                  inputMode="decimal"
                  value={form.perDiem}
                  onChange={(e) => setField("perDiem")(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="e.g. 1500"
                  aria-invalid={!!fieldErrors.perDiem}
                  className={boxClass(fieldErrors.perDiem)}
                />
                {fieldErrors.perDiem && <p role="alert" className="text-xs text-red-500 mt-1">{fieldErrors.perDiem}</p>}
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Approval Preferences</h3>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9]">Auto-notify Manager</p>
                <p className="text-xs text-gray-500 dark:text-[#94a3b8]">Automatically notify your reporting manager for every travel request.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.autoNotify}
                aria-label="Auto-notify Manager"
                onClick={() => setField("autoNotify")(!form.autoNotify)}
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors focus:outline-none ${form.autoNotify ? "bg-blue-600" : "bg-gray-300 dark:bg-[#475569]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoNotify ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-7 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </EmployeePageShell>
  );
}
