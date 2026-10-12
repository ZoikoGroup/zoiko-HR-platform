import { useEffect, useRef, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";

const DEFAULT_NOTIFICATIONS = { email: true, sms: false, push: true };

/** What the server holds (or the defaults for someone who never saved) as three real on/off values. */
function readSettings(p) {
  const saved = p.notificationPreferences || p.notification_preferences || {};
  return {
    notifications: {
      email: typeof saved.email === "boolean" ? saved.email : DEFAULT_NOTIFICATIONS.email,
      sms: typeof saved.sms === "boolean" ? saved.sms : DEFAULT_NOTIFICATIONS.sms,
      push: typeof saved.push === "boolean" ? saved.push : DEFAULT_NOTIFICATIONS.push,
    },
    language: p.language || "English",
    timezone: p.timezone || "Asia/Kolkata",
  };
}

export default function EssSettings() {
  const [notifications, setNotifications] = useState({ email: true, sms: false, push: true });
  const [language, setLanguage] = useState("English");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    getMyProfile()
      .then((res) => {
        if (!mounted.current) return;
        const next = readSettings(res.data || res);
        setNotifications(next.notifications);
        setLanguage(next.language);
        setTimezone(next.timezone);
        setLoaded(true);
      })
      .catch((err) => {
        // do not show made-up defaults as if they were saved: say the settings could not be loaded
        if (mounted.current) setError(err?.message || "Your saved settings could not be loaded. Reload the page to try again.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  const handleSave = () => {
    if (saving || !loaded) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    updateMyProfile({
      notification_preferences: notifications,
      language,
      timezone,
    })
      .then(() => getMyProfile())
      .then((res) => {
        if (!mounted.current) return;
        // show what the server now holds, so the page and a reload always agree
        const saved = readSettings(res.data || res);
        setNotifications(saved.notifications);
        setLanguage(saved.language);
        setTimezone(saved.timezone);
        setSuccess(true);
        setTimeout(() => { if (mounted.current) setSuccess(false); }, 3000);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message || "Failed to save settings");
      })
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  if (loading) {
    return (
      <EmployeePageShell title="Settings" subtitle="Manage your personal preferences and notification settings.">
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Settings" subtitle="Manage your personal preferences and notification settings.">
      <div className="space-y-5 max-w-2xl">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm font-medium">
            Settings saved successfully!
          </div>
        )}

        <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Notification Preferences</h3>
          {[
            { key: "email", label: "Email Notifications", desc: "Receive updates via email" },
            { key: "sms", label: "SMS Notifications", desc: "Receive alerts via SMS" },
            { key: "push", label: "Push Notifications", desc: "Browser push alerts" },
          ].map((n) => (
            <div key={n.key} className="flex justify-between items-center py-3 border-t border-gray-100 dark:border-[#334155]">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9]">{n.label}</p>
                <p className="text-xs text-gray-500 dark:text-[#94a3b8]">{n.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifications[n.key]}
                aria-label={n.label}
                onClick={() => setNotifications((prev) => ({ ...prev, [n.key]: !prev[n.key] }))}
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors ${
                  notifications[n.key] ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    notifications[n.key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155]">
          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] mb-4">Regional Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-[#94a3b8] mb-1.5">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-[#334155] text-sm text-gray-900 dark:text-[#f1f5f9] bg-white dark:bg-[#1e293b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {["English", "Hindi", "Telugu", "Tamil"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-[#94a3b8] mb-1.5">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-[#334155] text-sm text-gray-900 dark:text-[#f1f5f9] bg-white dark:bg-[#1e293b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {["Asia/Kolkata", "UTC", "America/New_York", "Europe/London"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !loaded}
            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </EmployeePageShell>
  );
}
