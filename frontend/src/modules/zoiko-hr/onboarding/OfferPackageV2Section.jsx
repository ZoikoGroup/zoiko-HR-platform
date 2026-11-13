/*
 * Per new hire, in the offer package panel: the choices that decide what the documents print (engagement profile, role
 * profile, the personal "why you fit" paragraph, the issue date), the amber consistency warnings (they never block sending),
 * and every value that will be printed, grouped, so HR can check each personal detail before sending.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ListChecks, Save } from "lucide-react";
import { SecondaryButton } from "../recruitment/ui";
import { getOnboardingProfiles, saveHirePackageInputs } from "../../../service/hrService";

const fieldCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const KEYS = ["engagement_profile_slug", "role_profile_slug", "offer.candidate_fit_summary", "document.issue_date"];

export function printedText(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? (v.heading || v.title || JSON.stringify(v)) : String(v))).join("; ");
  }
  return String(value);
}

export default function OfferPackageV2Section({ pkg, hireId, onSaved, onError }) {
  const [profiles, setProfiles] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [openValues, setOpenValues] = useState(false);

  const current = useMemo(() => Object.fromEntries((pkg?.input_fields || []).filter((f) => KEYS.includes(f.key))
    .map((f) => [f.key, f.key === "document.issue_date" ? (pkg.inputs?.[f.key] || "") : (pkg.inputs?.[f.key] ?? "")])), [pkg]);

  useEffect(() => { setForm(current); }, [current]);
  useEffect(() => {
    let live = true;
    getOnboardingProfiles().then((res) => live && setProfiles(res)).catch(() => live && setProfiles({ engagement_profiles: [], role_profiles: [] }));
    return () => { live = false; };
  }, []);

  const dirty = KEYS.some((k) => (form[k] || "") !== (current[k] || ""));

  const save = async () => {
    setSaving(true);
    try {
      const values = Object.fromEntries(KEYS.filter((k) => (form[k] || "") !== (current[k] || "")).map((k) => [k, form[k] || ""]));
      onSaved?.(await saveHirePackageInputs(hireId, values));
    } catch (e) {
      onError?.(e?.message || "The choices could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const warnings = pkg?.warnings || [];
  const groups = pkg?.printed_values || [];
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Check before sending</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6 text-xs leading-5">
            {warnings.map((w) => <li key={w.code}>{w.message}</li>)}
          </ul>
          <p className="mt-1 text-xs text-amber-800">These don't stop you sending; they are recorded if you send anyway.</p>
        </div>
      )}

      <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-gray-800">Documents for {pkg?.candidate_name}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pkg-eng" className="mb-1 block text-sm font-medium text-gray-700">Engagement profile</label>
            <select id="pkg-eng" className={fieldCls} value={form.engagement_profile_slug || ""} onChange={set("engagement_profile_slug")}>
              <option value="">Organisation default</option>
              {(profiles?.engagement_profiles || []).map((p) => <option key={p.slug} value={p.slug}>{p.name}{p.default ? " (default)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pkg-role" className="mb-1 block text-sm font-medium text-gray-700">Role profile</label>
            <select id="pkg-role" className={fieldCls} value={form.role_profile_slug || ""} onChange={set("role_profile_slug")}>
              <option value="">Match the position</option>
              {(profiles?.role_profiles || []).map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pkg-issue" className="mb-1 block text-sm font-medium text-gray-700">Issue date <span className="text-xs font-normal text-gray-400">(today when blank)</span></label>
            <input id="pkg-issue" type="date" className={fieldCls} value={form["document.issue_date"] || ""} onChange={set("document.issue_date")} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pkg-fit" className="mb-1 block text-sm font-medium text-gray-700">
              Why {pkg?.candidate_name?.split(" ")[0] || "the candidate"} fits the role <span className="text-xs font-normal text-gray-400">(offer letter, 2nd paragraph)</span>
            </label>
            <textarea id="pkg-fit" rows={3} maxLength={4000} className={fieldCls} value={form["offer.candidate_fit_summary"] || ""}
              placeholder="e.g. Your experience with Python, React and SQL matches the engineering standards of this role…"
              onChange={set("offer.candidate_fit_summary")} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <SecondaryButton icon={Save} onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save choices"}</SecondaryButton>
        </div>
      </fieldset>

      {groups.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <button type="button" onClick={() => setOpenValues((o) => !o)} aria-expanded={openValues}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50">
            <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-gray-500" />Values that will be printed</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition ${openValues ? "rotate-180" : ""}`} />
          </button>
          {openValues && (
            <div className="space-y-4 border-t border-gray-100 px-4 py-3">
              {groups.map((g) => (
                <div key={g.group}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.group}</p>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                    {g.values.map((v) => (
                      <div key={v.key} className="contents">
                        <dt className="text-gray-500">{v.label}</dt>
                        <dd className={`whitespace-pre-line break-words ${v.value === null || v.value === undefined || v.value === "" ? "text-amber-700" : "text-gray-900"}`}>
                          {printedText(v.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
