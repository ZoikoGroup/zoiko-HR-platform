import { useState, useEffect } from "react";
import PageHeader from "../../components/PageHeader";
import { AlertTriangle, Settings, Plus, Save, X, Edit3, Trash2, Eye } from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingSetting, setEditingSetting] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: "", value: "", description: "", category: "general" });
  const [viewingSetting, setViewingSetting] = useState(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setError(null);
      const data = await superAdminService.getSettings();
      setSettings(data || []);
    } catch (e) {
      console.error("Failed to load settings", e);
      setError(e.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  const grouped = settings.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const openEdit = (setting) => {
    setEditingSetting(setting);
    setForm({ key: setting.key, value: setting.value, description: setting.description || "", category: setting.category });
  };

  const openCreate = () => {
    setCreating(true);
    setForm({ key: "", value: "", description: "", category: "general" });
  };

  const handleSave = async () => {
    try {
      if (editingSetting) {
        await superAdminService.updateSetting(editingSetting.id, { value: form.value, description: form.description });
      } else if (creating) {
        await superAdminService.createSetting(form);
      }
      setEditingSetting(null);
      setCreating(false);
      loadSettings();
    } catch (e) {
      console.error("Failed to save setting", e);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400 font-sans">Loading...</div>;

  return (
    <div className="space-y-6 font-sans">
      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadSettings} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <PageHeader
        title="Platform Settings"
        description="Global platform configuration settings."
        action={
          <button onClick={openCreate} className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Add Setting
          </button>
        }
      />

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 shadow-sm text-center text-slate-400">
          <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No platform settings configured yet.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 capitalize mb-4">{category} Settings</h3>
            <div className="space-y-3">
              {items.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-semibold text-slate-800">{s.key}</code>
                      <button onClick={() => setViewingSetting(s)} className="text-slate-400 hover:text-blue-500"><Eye className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.description || "No description"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-slate-600 max-w-[200px] truncate">{s.value}</code>
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:text-[#FF7A00] hover:bg-white rounded-lg transition text-slate-400"><Edit3 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Edit/Create Modal */}
      {(editingSetting || creating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">{creating ? "Add Setting" : `Edit: ${editingSetting.key}`}</h3>
              <button onClick={() => { setEditingSetting(null); setCreating(false); }} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              {creating && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Key</label>
                  <input type="text" value={form.key}
                    onChange={(e) => setForm(f => ({ ...f, key: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Value</label>
                <textarea value={form.value} rows={3}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <input type="text" value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
              </div>
              {creating && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                  <input type="text" value={form.category}
                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-800 outline-none focus:border-[#FF7A00]" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setEditingSetting(null); setCreating(false); }} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF7A00] text-white text-sm font-semibold hover:bg-[#e56e00]"><Save className="h-4 w-4" /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewingSetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">{viewingSetting.key}</h3>
              <button onClick={() => setViewingSetting(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-slate-400">Key:</span><code className="ml-2 font-mono font-semibold text-slate-700">{viewingSetting.key}</code></div>
              <div><span className="text-slate-400">Value:</span><p className="mt-1 text-slate-700 bg-slate-50 rounded-xl p-3 border">{viewingSetting.value}</p></div>
              <div><span className="text-slate-400">Description:</span><p className="mt-1 text-slate-600">{viewingSetting.description || "No description"}</p></div>
              <div><span className="text-slate-400">Category:</span><span className="ml-2 text-slate-700 capitalize">{viewingSetting.category}</span></div>
              <div><span className="text-slate-400">Created:</span><span className="ml-2 text-slate-500">{new Date(viewingSetting.created_at).toLocaleString()}</span></div>
            </div>
            <div className="flex mt-6 justify-end">
              <button onClick={() => setViewingSetting(null)} className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
