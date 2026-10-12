import { useState, useEffect } from "react";
import { Save, Sliders, Bell, DollarSign, Calendar, Layers, BellRing } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { api } from "../../../service/api";
import { WORKFLOWS, DEFAULT_SETTINGS, settingsToForm, validateSettings, settingsPayload, serverSettingErrors } from "../../../utils/travelSettingsForm";

const inputBase = "w-full border px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

const Toggle = ({ id, checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
  </label>
);

export default function TravelSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState(null);   // { type: "error" | "success", text }
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get("/hr/travel/settings");
        if (alive && data) setSettings(settingsToForm(data));
      } catch (err) {
        if (alive) setNotice({ type: "error", text: err?.message || "The travel settings could not be loaded. The values below are the defaults and have not been saved." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setDirty(true);
    setSaved(false);
    setNotice(null);
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    const found = validateSettings(settings);
    setErrors(found);
    if (Object.keys(found).length) {
      setActiveTab("general");
      setNotice({ type: "error", text: "Some settings need attention. Fix the highlighted fields and save again." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.put("/hr/travel/settings", settingsPayload(settings));
      setSettings(settingsToForm(res));       // what the server stored is what the page shows
      setSaved(true);
      setDirty(false);
      setNotice({ type: "success", text: "Travel settings saved." });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const fields = serverSettingErrors(err?.validation);
      if (Object.keys(fields).length) { setErrors(fields); setActiveTab("general"); }
      setNotice({ type: "error", text: Object.keys(fields).length ? "Some settings need attention. Fix the highlighted fields and save again." : err?.message || "The settings could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const label = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2";

  return (
    <TravelLayout title="Travel" subtitle="Configure travel module preferences">
      <form noValidate onSubmit={handleSave} className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
          <div>
            <h1 className="text-xl font-black text-gray-900">Module Preferences</h1>
            <p className="text-xs text-gray-500">Travel policy and workflow configuration{dirty ? " · unsaved changes" : ""}</p>
          </div>
          <button type="submit" disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>

        {notice && (
          <div role={notice.type === "error" ? "alert" : "status"} className={`px-4 py-3 rounded-lg text-sm flex items-center justify-between ${notice.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">&times;</button>
          </div>
        )}

        <div className="flex gap-2 border-b border-gray-200">
          <button type="button" onClick={() => setActiveTab("general")} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === "general" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500"}`}><Sliders className="w-4 h-4" /> General</button>
          <button type="button" onClick={() => setActiveTab("notifications")} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === "notifications" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500"}`}><Bell className="w-4 h-4" /> Notifications</button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 font-medium">Loading settings...</div>
        ) : (
          <>
            {activeTab === "general" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 shadow-sm">
                <div>
                  <label htmlFor="ts-workflow" className={label}><Layers className="w-3.5 h-3.5" /> Approval Workflow</label>
                  <select id="ts-workflow" value={settings.approval_workflow} aria-invalid={!!errors.approval_workflow} onChange={(e) => update("approval_workflow", e.target.value)} className={`${box("approval_workflow")} bg-white`}>
                    {WORKFLOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                  {err("approval_workflow")}
                </div>
                <div>
                  <label htmlFor="ts-limit" className={label}><DollarSign className="w-3.5 h-3.5" /> Daily Expense Limit ($)</label>
                  <input id="ts-limit" type="number" min="0" step="0.01" value={settings.expense_limit_per_day} aria-invalid={!!errors.expense_limit_per_day} onChange={(e) => update("expense_limit_per_day", e.target.value)} className={box("expense_limit_per_day")} />
                  {err("expense_limit_per_day")}
                </div>
                <div>
                  <label htmlFor="ts-duration" className={label}><Calendar className="w-3.5 h-3.5" /> Max Trip Duration (days)</label>
                  <input id="ts-duration" type="number" min="1" max="365" step="1" value={settings.max_trip_duration} aria-invalid={!!errors.max_trip_duration} onChange={(e) => update("max_trip_duration", e.target.value)} className={box("max_trip_duration")} />
                  {err("max_trip_duration")}
                </div>
                <div>
                  <label htmlFor="ts-auto" className={label}><DollarSign className="w-3.5 h-3.5" /> Auto-Approve Threshold ($)</label>
                  <input id="ts-auto" type="number" min="0" step="1" value={settings.auto_approve_threshold} aria-invalid={!!errors.auto_approve_threshold} onChange={(e) => update("auto_approve_threshold", e.target.value)} className={box("auto_approve_threshold")} />
                  {err("auto_approve_threshold")}
                </div>
                <div>
                  <label htmlFor="ts-deadline" className={label}><Calendar className="w-3.5 h-3.5" /> Reimbursement Deadline (days)</label>
                  <input id="ts-deadline" type="number" min="1" max="365" step="1" value={settings.reimbursement_deadline} aria-invalid={!!errors.reimbursement_deadline} onChange={(e) => update("reimbursement_deadline", e.target.value)} className={box("reimbursement_deadline")} />
                  {err("reimbursement_deadline")}
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between py-2 border-b border-gray-50 font-medium text-sm">
                  <label htmlFor="ts-notify" className="text-gray-700 flex items-center gap-2"><BellRing className="w-4 h-4 text-blue-500" /> Email & Push Notifications</label>
                  <Toggle id="ts-notify" checked={settings.notification_enabled} onChange={(v) => update("notification_enabled", v)} />
                </div>
                <p className="text-xs text-gray-400">When enabled, users will receive notifications for travel request approvals, expense reimbursements, and policy updates.</p>
              </div>
            )}
          </>
        )}
      </form>
    </TravelLayout>
  );
}
