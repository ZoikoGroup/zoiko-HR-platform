import { useState, useEffect } from "react";
import { Save, Sliders, Bell, Lock, DollarSign, Calendar, Layers, BellRing } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { api } from "../../../service/api";

export default function TravelSettings() {
  const [settings, setSettings] = useState({
    approval_workflow: "manager",
    expense_limit_per_day: 500,
    max_trip_duration: 30,
    auto_approve_threshold: 1000,
    reimbursement_deadline: 30,
    notification_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await api.get("/hr/travel/settings");
        const data = res || {};
        if (data && data.id) {
          setSettings({
            approval_workflow: data.approval_workflow || "manager",
            expense_limit_per_day: parseFloat(data.expense_limit_per_day) || 500,
            max_trip_duration: data.max_trip_duration || 30,
            auto_approve_threshold: data.auto_approve_threshold || 1000,
            reimbursement_deadline: data.reimbursement_deadline || 30,
            notification_enabled: data.notification_enabled !== false,
          });
        }
      } catch (err) {
        console.error("Failed to load travel settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/hr/travel/settings", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const Toggle = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
    </label>
  );

  return (
    <TravelLayout title="Travel" subtitle="Configure travel module preferences">
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
          <div>
            <h1 className="text-xl font-black text-gray-900">Module Preferences</h1>
            <p className="text-xs text-gray-500">Travel policy and workflow configuration</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          <button onClick={() => setActiveTab("general")} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === "general" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500"}`}><Sliders className="w-4 h-4" /> General</button>
          <button onClick={() => setActiveTab("notifications")} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === "notifications" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500"}`}><Bell className="w-4 h-4" /> Notifications</button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 font-medium">Loading settings...</div>
        ) : (
          <>
            {activeTab === "general" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 shadow-sm">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Approval Workflow</label>
                  <select value={settings.approval_workflow} onChange={e => update("approval_workflow", e.target.value)} className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
                    <option value="manager">Manager Only</option>
                    <option value="manager+director">Manager + Director</option>
                    <option value="manager+director+finance">Manager + Director + Finance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /> Daily Expense Limit ($)</label>
                  <input type="number" value={settings.expense_limit_per_day} onChange={e => update("expense_limit_per_day", parseFloat(e.target.value) || 0)} className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Max Trip Duration (days)</label>
                  <input type="number" value={settings.max_trip_duration} onChange={e => update("max_trip_duration", parseInt(e.target.value) || 1)} className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /> Auto-Approve Threshold ($)</label>
                  <input type="number" value={settings.auto_approve_threshold} onChange={e => update("auto_approve_threshold", parseInt(e.target.value) || 0)} className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Reimbursement Deadline (days)</label>
                  <input type="number" value={settings.reimbursement_deadline} onChange={e => update("reimbursement_deadline", parseInt(e.target.value) || 1)} className="w-full border border-gray-200 px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between py-2 border-b border-gray-50 font-medium text-sm">
                  <span className="text-gray-700 flex items-center gap-2"><BellRing className="w-4 h-4 text-blue-500" /> Email & Push Notifications</span>
                  <Toggle checked={settings.notification_enabled} onChange={(v) => update("notification_enabled", v)} />
                </div>
                <p className="text-xs text-gray-400">When enabled, users will receive notifications for travel request approvals, expense reimbursements, and policy updates.</p>
              </div>
            )}
          </>
        )}
      </div>
    </TravelLayout>
  );
}
