import { useState, useEffect } from "react";
import { Save, Sliders, CheckCircle, Wrench, Bell, Plus, Trash2 } from "lucide-react";
import { getAssetSettings, updateAssetSetting, getAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory } from "../../../service/hrService";

const approvalSteps = [
  { id: 1, role: "Team Lead", order: 1, required: true },
  { id: 2, role: "Department Head", order: 2, required: true },
  { id: 3, role: "IT Manager", order: 3, required: true },
  { id: 4, role: "Finance", order: 4, required: false },
];

const maintenanceDefaults = [
  { key: "warrantyPeriod", label: "Default Warranty Period (months)", value: "12" },
  { key: "maintenanceInterval", label: "Default Maintenance Interval (days)", value: "90" },
  { key: "repairBudget", label: "Annual Repair Budget ($)", value: "25000" },
  { key: "vendorWarranty", label: "Vendor Warranty Required", value: "Yes" },
];

const notifications = [
  { id: "warranty_expiry", label: "Warranty Expiry Reminder", desc: "30 days before warranty expires" },
  { id: "maintenance_due", label: "Maintenance Due", desc: "When scheduled maintenance is due" },
  { id: "asset_assigned", label: "Asset Assignment", desc: "When an asset is assigned to an employee" },
  { id: "asset_returned", label: "Asset Returned", desc: "When an asset is returned" },
  { id: "request_approved", label: "Request Approved", desc: "When an asset request is approved" },
  { id: "maintenance_overdue", label: "Maintenance Overdue", desc: "When maintenance is past due date" },
];

export default function AssetSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [saved, setSaved] = useState(false);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState("");

  const fetchCategories = async () => {
    try {
      const catRes = await getAssetCategories();
      const cats = Array.isArray(catRes) ? catRes : catRes?.items || catRes?.data || [];
      setCategories(cats.length > 0 ? cats : []);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const [settingsRes] = await Promise.all([
          getAssetSettings(),
          fetchCategories(),
        ]);
        if (!mounted) return;
        const settingsArr = Array.isArray(settingsRes) ? settingsRes : settingsRes?.items || settingsRes?.data || [];
        const opts = {};
        settingsArr.forEach((s) => { opts[s.setting_key] = s.setting_value; });
        setSettings(opts);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    setSaved(true);
    try {
      const promises = Object.entries(settings).map(([key, value]) =>
        updateAssetSetting(key, { setting_value: value })
      );
      await Promise.all(promises);
    } catch {
      // silently fail
    }
    setTimeout(() => setSaved(false), 2000);
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: "general", label: "General", icon: Sliders },
    { id: "approvals", label: "Approvals", icon: CheckCircle },
    { id: "maintenance", label: "Maintenance", icon: Wrench },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          <span className="ml-3 text-gray-500">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure asset module preferences</p>
        </div>
        <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors">
          <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? "border-amber-500 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Asset Categories</h2>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <input type="text" value={newCategory} onChange={(e) => { setNewCategory(e.target.value); setCategoryError(""); }}
              placeholder="New category name..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
            <button onClick={async () => {
              const name = newCategory.trim();
              if (!name) return;
              try {
                await createAssetCategory({ name, description: null });
                setNewCategory("");
                await fetchCategories();
              } catch (err) {
                setCategoryError(err.message || "Failed to create category");
              }
            }} disabled={!newCategory.trim()}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-400 font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {categoryError && <p className="text-red-500 text-xs mb-2">{categoryError}</p>}

          <div className="space-y-2">
            {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No categories yet. Add one above.</p>}
            {categories.map((cat) => {
              const name = typeof cat === "string" ? cat : cat.name;
              const catId = typeof cat === "string" ? null : cat.id;
              const isEditing = editingCat === catId;
              return (
                <div key={catId || name} className="flex items-center justify-between py-2.5 px-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    {isEditing ? (
                      <input type="text" value={editCatName} autoFocus
                        onChange={(e) => setEditCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (async () => {
                              try {
                                await updateAssetCategory(catId, { name: editCatName.trim() });
                                setEditingCat(null);
                                await fetchCategories();
                              } catch (err) {
                                setCategoryError(err.message || "Failed to update category");
                              }
                            })();
                          }
                          if (e.key === "Escape") setEditingCat(null);
                        }}
                        className="flex-1 px-2 py-1 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
                    ) : (
                      <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
                    )}
                  </div>
                  {catId && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button onClick={async () => {
                            try {
                              await updateAssetCategory(catId, { name: editCatName.trim() });
                              setEditingCat(null);
                              await fetchCategories();
                            } catch (err) {
                              setCategoryError(err.message || "Failed to update category");
                            }
                          }} className="p-1 text-green-500 hover:text-green-700 transition-colors" title="Save">&#10003;</button>
                          <button onClick={() => setEditingCat(null)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors" title="Cancel">&#10005;</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingCat(catId); setEditCatName(name); }}
                            className="p-1 text-gray-300 hover:text-amber-500 transition-colors" title="Edit">&#9998;</button>
                          <button onClick={async () => {
                            try {
                              await deleteAssetCategory(catId);
                              await fetchCategories();
                            } catch (err) {
                              setCategoryError(err.message || "Failed to delete category");
                            }
                          }} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Asset Prefix</label>
              <input type="text" value={settings.default_asset_prefix || "AST"} onChange={(e) => updateSetting("default_asset_prefix", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto Asset Tag Format</label>
              <input type="text" value={settings.auto_asset_tag_format || "AST-{NNNN}"} onChange={(e) => updateSetting("auto_asset_tag_format", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
            </div>
          </div>
        </div>
      )}

      {activeTab === "approvals" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Approval Workflow</h2>
          <p className="text-sm text-gray-500 mb-4">Configure the approval steps for asset requests</p>
          <div className="space-y-3">
            {approvalSteps.map((step) => (
              <div key={step.id} className="flex items-center justify-between py-3 px-4 border border-gray-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{step.order}</div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{step.role}</span>
                    {step.required && <span className="ml-2 text-xs text-amber-600 font-medium">Required</span>}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked={step.required} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Auto-approve requests under ($)</label>
            <input type="number" value={settings.auto_approve_threshold || 500} onChange={(e) => updateSetting("auto_approve_threshold", e.target.value)}
              className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
          </div>
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {maintenanceDefaults.map((item) => (
              <div key={item.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                <input type="text" value={settings[item.key] || item.value} onChange={(e) => updateSetting(item.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
            ))}
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Depreciation Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Depreciation Method</label>
                <select value={settings.depreciation_method || "straight_line"} onChange={(e) => updateSetting("depreciation_method", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500">
                  <option value="straight_line">Straight Line</option>
                  <option value="declining">Declining Balance</option>
                  <option value="sum_of_years">Sum of Years Digits</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Useful Life (years)</label>
                <input type="number" value={settings.default_useful_life || 5} onChange={(e) => updateSetting("default_useful_life", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salvage Value (%)</label>
                <input type="number" value={settings.salvage_value || 10} onChange={(e) => updateSetting("salvage_value", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
          <div className="space-y-3">
            {notifications.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings[item.id] === "true" || settings[item.id] === true} onChange={(e) => updateSetting(item.id, e.target.checked ? "true" : "false")} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
