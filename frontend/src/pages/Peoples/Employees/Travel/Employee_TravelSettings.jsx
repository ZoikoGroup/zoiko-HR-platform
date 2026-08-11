import { useEffect, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";

export default function TravelSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currency, setCurrency] = useState("INR");
  const [perDiem, setPerDiem] = useState("");
  const [autoNotify, setAutoNotify] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getMyProfile();
        const profile = res?.data || res || {};
        if (!mounted) return;
        setCurrency(profile.preferred_currency || profile.currency || "INR");
        setPerDiem(String(profile.per_diem || profile.perDiem || profile.daily_per_diem || ""));
        setAutoNotify(!!(profile.auto_notify || profile.autoNotify));
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load profile settings");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateMyProfile({
        preferred_currency: currency,
        per_diem: perDiem ? parseFloat(perDiem) : undefined,
        auto_notify: autoNotify,
      });
      setSuccess("Settings saved successfully.");
    } catch (err) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmployeePageShell title="Travel Settings" subtitle="Configure your personal travel preferences and limits.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-[#94a3b8]">Loading settings...</span>
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && success && (
        <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg">{success}</div>
      )}

      {!loading && (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
            <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Expense Preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Preferred Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {["INR", "USD", "EUR", "GBP"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-[#cbd5e1] block mb-1.5">Daily Per Diem Limit (₹)</label>
                <input
                  type="number"
                  value={perDiem}
                  onChange={(e) => setPerDiem(e.target.value)}
                  min="0"
                  step="1"
                  placeholder="e.g. 1500"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
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
                onClick={() => setAutoNotify(!autoNotify)}
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors focus:outline-none ${autoNotify ? "bg-indigo-600" : "bg-gray-300 dark:bg-[#475569]"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoNotify ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-7 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </EmployeePageShell>
  );
}
