/*
 * Onboarding › Settings › "Test your package".
 * Checks every document of the package for a sample new hire (nothing is saved or sent) and lists, per document, what must
 * be fixed in Settings before any real hire can receive it. Values typed for each hire are shown separately: a sample has
 * none, so they are expected. Each document can be previewed as a watermarked sample.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Eye, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { SecondaryButton, StatusPill } from "../recruitment/ui";
import { getTestPackage, getTestPackagePreview } from "../../../service/onboardingSetupService";
import { openFile } from "../../../utils/fileViewer";
import { SectionLink, SettingsCard } from "./settingsUi";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function TestPackageCard() {
  const [result, setResult] = useState(null);
  const [choice, setChoice] = useState({ engagement: "", role: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState("");

  const run = async (params = choice) => {
    setLoading(true);
    setError("");
    try {
      const res = await getTestPackage(params);
      setResult(res);
      setChoice({ engagement: res.engagement || "", role: res.role || "" });
    } catch (e) {
      setError(e?.message || "The package could not be checked.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const preview = async (category, title) => {
    setPreviewing(category);
    try {
      openFile(await getTestPackagePreview(category, choice), `Sample - ${title}.pdf`, "preview");
    } catch (e) {
      setError(e?.message || "The preview could not be made.");
    } finally {
      setPreviewing("");
    }
  };

  return (
    <SettingsCard id="test-package" icon={ClipboardCheck} title="Test your package"
      help="Checks every document for a sample new hire – nothing is saved or sent – and shows what to fix before real hires get them."
      action={<SecondaryButton icon={loading ? Loader2 : RefreshCw} onClick={() => run()} disabled={loading}>{loading ? "Checking…" : "Check again"}</SecondaryButton>}>
      {result && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="tp-eng" className="mb-1 block text-sm font-medium text-gray-700">Employment type</label>
            <select id="tp-eng" className={inputCls} value={choice.engagement} onChange={(e) => run({ ...choice, engagement: e.target.value })}>
              {result.engagement_profiles.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tp-role" className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <select id="tp-role" className={inputCls} value={choice.role} onChange={(e) => run({ ...choice, role: e.target.value })}>
              {result.role_profiles.length === 0 && <option value="">No role profiles yet</option>}
              {result.role_profiles.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && !result && <div className="flex items-center py-4 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Checking every document…</div>}
      {result && (
        <>
          <p role="status" className={`rounded-xl px-3 py-2 text-sm font-medium ${result.all_ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {result.total === 0 ? "No documents are switched on for this employment type."
              : result.all_ready ? `All ${result.total} documents can be generated.`
                : `${result.ready} of ${result.total} documents can be generated. Fix the items below in Settings.`}
          </p>
          <ul className="space-y-2" aria-label="Documents checked">
            {result.documents.map((d) => (
              <li key={d.category} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      {d.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                      {d.title}
                    </p>
                    <p className="text-xs text-gray-500">{d.mode_label}{d.source === "org_template" ? " · your document" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={d.ready ? "green" : "amber"}>{d.ready ? "Ready" : "Needs settings"}</StatusPill>
                    <button type="button" onClick={() => preview(d.category, d.title)} disabled={!!previewing}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {previewing === d.category ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Sample
                    </button>
                  </div>
                </div>
                {(d.settings_gaps.length > 0 || d.missing_clauses.length > 0) && (
                  // folded: the same items are listed once, with a link to each field, in Missing details above
                  <details className="mt-2 text-xs text-amber-900">
                  <summary className="cursor-pointer font-medium text-amber-800">
                    {d.settings_gaps.length + d.missing_clauses.length} missing {d.settings_gaps.length + d.missing_clauses.length === 1 ? "item" : "items"} – show
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {d.settings_gaps.map((g) => (
                      <li key={g.key}>
                        {g.settings_path ? <SectionLink as={Link} to={g.settings_path} className="font-semibold underline">{g.meaning}</SectionLink> : <span className="font-semibold">{g.meaning}</span>}
                        <span className="text-amber-800"> – {g.source}</span>
                      </li>
                    ))}
                    {d.missing_clauses.map((c) => (
                      <li key={c.key}><SectionLink as={Link} to={`/zoiko-hr/onboarding/settings#clause-${c.key}`} className="font-semibold underline">Clause wording: {c.title}</SectionLink></li>
                    ))}
                  </ul>
                  </details>
                )}
                {d.per_hire.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">Typed for each new hire: {d.per_hire.map((g) => g.meaning).join(", ")}.</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </SettingsCard>
  );
}
