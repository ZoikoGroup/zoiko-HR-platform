import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Save, Sliders, GitBranch, Bell, Eye, Loader2, RotateCcw, Info } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignationSettings, saveDesignationSettings } from "../../../service/hrService";
import { DEFAULT_DESIGNATION_SETTINGS, normalizeDesignationSettings, validateDesignationSettings } from "../../../utils/designationSettings";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/designations"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";

function Switch({ label, hint, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${checked ? "bg-orange-500" : "bg-gray-200"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

const NOTIFICATION_LABELS = {
  created: "Designation created",
  updated: "Designation updated",
  head_changed: "Designation head changed",
  budget_updated: "Designation budget updated",
  status_changed: "Designation status changed",
  added_under_hierarchy: "New designation added under your hierarchy",
  deletion_requested: "Designation deletion requested",
};

export default function DesignationSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [form, setForm] = useState(DEFAULT_DESIGNATION_SETTINGS);
  const [stored, setStored] = useState(DEFAULT_DESIGNATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    // a unique query value gives this request its own cache key: the page must show what is saved, not a cached copy
    getDesignationSettings({ _: Date.now() })
      .then((data) => {
        const clean = normalizeDesignationSettings(data);
        setForm(clean);
        setStored(clean);
      })
      .catch((err) => setLoadError(err?.message || "Could not load the designation settings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(stored), [form, stored]);
  const errors = useMemo(() => validateDesignationSettings(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  // leaving with unsaved changes would silently throw them away
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (key, value) => { setSavedAt(null); setSaveError(""); setForm((f) => ({ ...f, [key]: value })); };
  const setNotification = (key, value) => { setSavedAt(null); setSaveError(""); setForm((f) => ({ ...f, notifications: { ...f.notifications, [key]: value } })); };

  const handleSave = async () => {
    if (hasErrors || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const saved = normalizeDesignationSettings(await saveDesignationSettings(form));
      setForm(saved);
      setStored(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err?.message || "Could not save the settings. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "general", label: "General", icon: Sliders },
    { id: "hierarchy", label: "Hierarchy", icon: GitBranch },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "display", label: "Display", icon: Eye },
  ];

  if (loading) {
    return (
      <HRPage title="Designation Settings" subtitle="Configure designations module preferences">
        <SubNav />
        <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading settings...</div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Designation Settings" subtitle="Configure designations module preferences">
      <SubNav />
      <div className="space-y-6">
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError} The values below are the defaults, not your saved settings.</span>
            <button type="button" onClick={load} className="font-semibold underline">Retry</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Designation Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Configure designations module preferences</p>
          </div>
          <div className="flex items-center gap-3">
            {dirty && !saving && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
            {savedAt && !dirty && <span role="status" className="text-xs font-medium text-green-600">Settings saved</span>}
            <button type="button" onClick={() => { setForm(stored); setSaveError(""); }} disabled={!dirty || saving}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> Discard
            </button>
            <button type="button" onClick={handleSave} disabled={!dirty || saving || hasErrors || !!loadError}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {saveError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{saveError}</div>}

        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
              {Object.keys(errors).some((k) => k.startsWith(tab.id + ".")) && <span className="w-2 h-2 rounded-full bg-red-500" aria-label="has an error" />}
            </button>
          ))}
        </div>

        {activeTab === "general" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Default Designation Code Prefix" error={errors["general.code_prefix"]}>
                <input type="text" value={form.code_prefix} maxLength={6} onChange={(e) => set("code_prefix", e.target.value.toUpperCase())} className={inputCls} />
              </Field>
              <Field label="Default Status for New Designations">
                <select value={form.default_status} onChange={(e) => set("default_status", e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Switch label="Auto-generate Designation Codes" hint="Automatically generate codes for new designations. Turn off to type each code yourself."
                checked={form.auto_generate_codes} onChange={(v) => set("auto_generate_codes", v)} />
              <Switch label="Enforce Unique Designation Codes" hint="Duplicate designation codes are always refused by the system."
                checked disabled onChange={() => {}} />
            </div>
          </div>
        )}

        {activeTab === "hierarchy" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Hierarchy Settings</h2>
            <p className="flex items-start gap-2 text-xs text-gray-500"><Info className="w-4 h-4 shrink-0" /> Maximum depth limits the level (L1 to L10) a designation can be given. The other switches are saved with your organization for the hierarchy rules.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Max Hierarchy Depth" error={errors["hierarchy.max_hierarchy_depth"]}>
                <input type="number" min={1} max={10} value={form.max_hierarchy_depth}
                  onChange={(e) => set("max_hierarchy_depth", e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} />
              </Field>
              <Switch label="Allow Cross-Designations Heads" hint="Allow a person to head multiple designations" checked={form.allow_cross_heads} onChange={(v) => set("allow_cross_heads", v)} />
              <Switch label="Require Parent Designation" hint="All designations must have a parent designation assigned" checked={form.require_parent} onChange={(v) => set("require_parent", v)} />
              <Switch label="Enforce Single Parent" hint="Each designation can only have one parent" checked={form.enforce_single_parent} onChange={(v) => set("enforce_single_parent", v)} />
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Notification Preferences</h2>
            {Object.entries(NOTIFICATION_LABELS).map(([key, label]) => (
              <div key={key} className="border-b border-gray-100 last:border-0">
                <Switch label={label} checked={!!form.notifications[key]} onChange={(v) => setNotification(key, v)} />
              </div>
            ))}
          </div>
        )}

        {activeTab === "display" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Display Settings</h2>
            <p className="flex items-start gap-2 text-xs text-gray-500"><Info className="w-4 h-4 shrink-0" /> These control how the Designation List looks for everyone in your organization.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Switch label="Show Salary Range" hint="Display designation salary ranges in list views" checked={form.show_salary_range} onChange={(v) => set("show_salary_range", v)} />
              <Switch label="Show Employee Count" hint="Display the number of employees in the designation list" checked={form.show_employee_count} onChange={(v) => set("show_employee_count", v)} />
              <Field label="Default Sort Field">
                <select value={form.default_sort_field} onChange={(e) => set("default_sort_field", e.target.value)} className={inputCls}>
                  <option value="title">Title</option>
                  <option value="department">Department</option>
                  <option value="level">Level</option>
                  <option value="salary">Salary</option>
                  <option value="created_at">Created Date</option>
                </select>
              </Field>
              <Field label="Default Sort Direction">
                <select value={form.default_sort_direction} onChange={(e) => set("default_sort_direction", e.target.value)} className={inputCls}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </Field>
              <Field label="Items Per Page">
                <select value={form.items_per_page} onChange={(e) => set("items_per_page", Number(e.target.value))} className={inputCls}>
                  {[5, 10, 15, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Switch label="Compact Mode" hint="Use compact layout for designation lists" checked={form.compact_mode} onChange={(v) => set("compact_mode", v)} />
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
