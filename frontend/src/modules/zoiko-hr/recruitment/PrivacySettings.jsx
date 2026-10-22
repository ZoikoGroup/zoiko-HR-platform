import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getRecruitmentPrivacySettings, updateRecruitmentPrivacySettings } from "../../../service/recruitmentDocumentsService";

const EMPTY = {
  privacy_contact_email: "",
  candidate_data_retention_months: "",
  uses_cv_parsing: true,
  talent_pool_opt_in_url: "",
  issue_confirmation_on_clearance: false,
  offer_letters_without_approval: false,
};

export default function RecruitmentPrivacySettings({ embedded = false }) {
  const [settings, setSettings] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const value = await getRecruitmentPrivacySettings();
      setSettings({ ...EMPTY, ...value, candidate_data_retention_months: value?.candidate_data_retention_months ?? "" });
    } catch (e) {
      setError(e?.message || "Recruitment privacy settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const body = {
      ...settings,
      candidate_data_retention_months: settings.candidate_data_retention_months === "" ? null : Number(settings.candidate_data_retention_months),
      privacy_contact_email: settings.privacy_contact_email.trim() || null,
      talent_pool_opt_in_url: settings.talent_pool_opt_in_url.trim() || null,
    };
    try {
      const updated = await updateRecruitmentPrivacySettings(body);
      setSettings({ ...EMPTY, ...updated, candidate_data_retention_months: updated?.candidate_data_retention_months ?? "" });
      setNotice("Recruitment privacy settings saved.");
    } catch (e) {
      setError(e?.message || "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Recruitment privacy settings</h2>
      <p className="mt-1 text-sm text-gray-500">Manage candidate privacy contacts, retention, and recruitment data practices.</p>
      {error && <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
      {loading ? <p role="status" className="py-8 text-sm text-gray-500">Loading settings…</p> : (
        <form onSubmit={save} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Privacy contact email
              <input type="email" value={settings.privacy_contact_email || ""} onChange={(e) => setSettings({ ...settings, privacy_contact_email: e.target.value })} maxLength={255} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Candidate data retention (months)
              <input type="number" min="1" max="120" value={settings.candidate_data_retention_months} onChange={(e) => setSettings({ ...settings, candidate_data_retention_months: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Talent pool opt-in URL
            <input type="url" value={settings.talent_pool_opt_in_url || ""} onChange={(e) => setSettings({ ...settings, talent_pool_opt_in_url: e.target.value })} maxLength={500} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={Boolean(settings.uses_cv_parsing)} onChange={(e) => setSettings({ ...settings, uses_cv_parsing: e.target.checked })} className="mt-0.5 rounded border-gray-300" />
              CV parsing is used to extract candidate details
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={Boolean(settings.issue_confirmation_on_clearance)} onChange={(e) => setSettings({ ...settings, issue_confirmation_on_clearance: e.target.checked })} className="mt-0.5 rounded border-gray-300" />
              Issue a confirmation when offer conditions are cleared
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={Boolean(settings.offer_letters_without_approval)} onChange={(e) => setSettings({ ...settings, offer_letters_without_approval: e.target.checked })} className="mt-0.5 rounded border-gray-300" />
              <span>
                Offer letters without approval
                <span className="block text-xs text-gray-500">
                  Saving an offer approves it and generates its letter for the work country straight away. No second person reviews it; HR still sends it.
                </span>
              </span>
            </label>
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </form>
      )}
    </section>
  );

  return embedded ? content : <HRPage title="Recruitment Privacy" subtitle="Candidate privacy and retention controls">{content}</HRPage>;
}
