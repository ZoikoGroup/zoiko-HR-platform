// Organization settings for the template engine. Editable by organization admins; read-only for HR admins.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { getTemplateSettings, updateTemplateSettings } from "../../../../service/docTemplatesService";
import { ErrorBanner, Labeled, btnIcon, btnPrimary, btnSmall, errorMessage, inputClass, useCurrentUser } from "./components/ui";

function Toggle({ id, label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">{checked ? "On" : "Off"}</span>
        <input id={id} type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-gray-300 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60" />
      </div>
    </div>
  );
}

export default function TemplateSettingsCard({ onChange }) {
  const { isOrgAdmin } = useCurrentUser();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = useCallback((s) => {
    setSettings(s);
    setForm({ tenant_attestation_enabled: !!s.tenant_attestation_enabled, prefer_tenant_variants: !!s.prefer_tenant_variants,
      expiry_warning_days: s.expiry_warning_days ?? 30 });
    setOverrides(Object.entries(s.approval_overrides || {}).map(([key, level]) => ({ key, level })));
  }, []);

  useEffect(() => {
    getTemplateSettings().then((s) => { apply(s); onChangeRef.current?.(s); }).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, [apply]);

  const readOnly = !isOrgAdmin;

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const approval_overrides = {};
      overrides.filter((o) => o.key.trim()).forEach((o) => { approval_overrides[o.key.trim()] = o.level; });
      const s = await updateTemplateSettings({ ...form, expiry_warning_days: Number(form.expiry_warning_days), approval_overrides });
      apply(s); onChangeRef.current?.(s); setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading settings…</p>;
  if (!form) return <ErrorBanner error={error || "Settings could not be loaded."} />;

  return (
    <div>
      <ErrorBanner error={error} onDismiss={() => setError("")} />
      {readOnly && <p className="mb-3 text-xs text-gray-500">Only an organization admin can change these settings. You are viewing them read-only.</p>}

      <div className="divide-y divide-gray-100">
        <Toggle id="tpl-attest" label="Organization-approved templates"
          description={!settings.platform_allows_tenant_attestation ? "Switched off by the platform." : !settings.plan_includes_tenant_attestation
            ? "Not included in your plan." : "Allow your organization to adopt and approve templates under its own responsibility."}
          checked={form.tenant_attestation_enabled} disabled={readOnly}
          onChange={(v) => setForm((f) => ({ ...f, tenant_attestation_enabled: v }))} />
        <Toggle id="tpl-prefer" label="Prefer organization versions"
          description="When both a platform counsel version and an organization-approved version apply, use the organization's version."
          checked={form.prefer_tenant_variants} disabled={readOnly}
          onChange={(v) => setForm((f) => ({ ...f, prefer_tenant_variants: v }))} />
        <div className="py-3">
          <Labeled id="tpl-expiry" label="Expiry warning (days)" hint="How many days before a document expires to warn HR (1–365).">
            <input id="tpl-expiry" type="number" min={1} max={365} className={`${inputClass} max-w-[10rem]`} disabled={readOnly}
              value={form.expiry_warning_days} onChange={(e) => setForm((f) => ({ ...f, expiry_warning_days: e.target.value }))} />
          </Labeled>
        </div>
        <div className="py-3">
          <p className="text-sm font-semibold text-gray-800">Approval overrides</p>
          <p className="mb-2 text-xs text-gray-500">
            Require a stricter approval level for a template (e.g. HR-EMP-001) or a whole family (e.g. HR-EMP). An override can only make approval stricter, never looser.
          </p>
          {overrides.length === 0 && <p className="mb-2 text-xs text-gray-500">No overrides.</p>}
          <ul className="space-y-2">
            {overrides.map((o, i) => (
              <li key={i} className="flex items-end gap-2">
                <Labeled id={`ovr-key-${i}`} label="Template or family id" className="flex-1">
                  <input id={`ovr-key-${i}`} className={inputClass} value={o.key} disabled={readOnly}
                    onChange={(e) => setOverrides((list) => list.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                </Labeled>
                <Labeled id={`ovr-level-${i}`} label="Approval level">
                  <select id={`ovr-level-${i}`} className={inputClass} value={o.level} disabled={readOnly}
                    onChange={(e) => setOverrides((list) => list.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}>
                    <option value="L2">L2</option>
                    <option value="L3">L3</option>
                  </select>
                </Labeled>
                {!readOnly && (
                  <button type="button" className={`${btnIcon} mb-1`} aria-label={`Remove override ${o.key || i + 1}`}
                    onClick={() => setOverrides((list) => list.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <button type="button" className={`${btnSmall} mt-2`} onClick={() => setOverrides((l) => [...l, { key: "", level: "L2" }])}>
              <Plus className="h-3.5 w-3.5" /> Add override
            </button>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
          </button>
          {saved && <span className="text-sm text-emerald-700" role="status">Settings saved.</span>}
        </div>
      )}
    </div>
  );
}
