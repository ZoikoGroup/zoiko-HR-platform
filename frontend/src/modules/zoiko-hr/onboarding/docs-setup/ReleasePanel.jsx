// After Apply: an organisation admin approves and releases the templates this setup created, in one click. The approval is
// signed with the admin's profile name and the attestation is recorded on each approval record (for contracts and NDAs the
// admin's attestation is the review, recorded as such).
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Rocket } from "lucide-react";
import { approveReleaseDocsSetup } from "../../../../service/docsSetupService";
import { Banner, errorText } from "./shared";

export default function ReleasePanel({ sessionId, variantIds, onReleased }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  if (!variantIds?.length) return null;
  const allLive = result && result.total > 0 && result.released === result.total;

  const release = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await approveReleaseDocsSetup(sessionId, { attestation_accepted: true });
      setResult(res);
      if (res.total > 0 && res.released === res.total) onReleased?.();
    } catch (e) {
      setError(errorText(e, "The templates could not be released. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const ids = Object.fromEntries((result?.results || []).map((r) => [r.variant_id, r]));
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Approve and release your templates</h3>
        <p className="mt-1 text-sm text-gray-600">
          New hires get documents made from your templates once they are released. As the organisation admin you can approve
          and release them yourself in one click; your name and the attestation are kept on each approval record.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {variantIds.map((id) => {
          const r = ids[id];
          return (
            <li key={id} className="flex flex-wrap items-center gap-2">
              {r?.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded-full border border-gray-300" />}
              <Link to={`/zoiko-hr/documents/templates/variants/${id}`} className="font-medium text-blue-700 hover:underline">
                {r?.title || `Template #${id}`}
              </Link>
              <span className="text-gray-500">{r ? (r.ok ? "Released" : r.message || r.status) : "Draft"}</span>
            </li>
          );
        })}
      </ul>
      {!allLive && (
        <>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I have reviewed these templates (including any contract or NDA) and accept responsibility for their content on behalf of my organisation.
          </label>
          <button type="button" onClick={release} disabled={busy || !agree}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}Approve and release
          </button>
        </>
      )}
      {result && (
        <Banner tone={allLive ? "ok" : "warn"}>
          {allLive ? `All templates are live${(result.clauses_approved || []).length ? ` and ${result.clauses_approved.length} clause wordings are approved` : ""}. New hires now get documents generated from them automatically${result.held_documents_sent ? `; held documents were sent to ${result.held_documents_sent} new hire(s)` : ""}.`
            : `${result.released} of ${result.total} released. Fix what is listed above and try again.`}
        </Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  );
}
