// Step 6: one summary of every change, one confirmation. Everything is applied together (or nothing is), templates are
// drafts waiting for legal approval, clause wording waits for counsel, and nothing is sent to any new hire.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { applyDocsSetup, getDocsSetupSummary, setDocsSetupOptions, undoDocsSetup } from "../../../../service/docsSetupService";
import { Banner, errorText, formatValue } from "./shared";
import ReleasePanel from "./ReleasePanel";

function idempotencyKey(sessionId) {
  const name = `docs-setup-apply-${sessionId}`;
  try {
    const existing = window.sessionStorage.getItem(name);
    if (existing) return existing;
    const key = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 80);
    window.sessionStorage.setItem(name, key);
    return key;
  } catch {
    return `docs-setup-${sessionId}`;
  }
}

export default function ApplyStep({ session, onSession }) {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [undoMsg, setUndoMsg] = useState(null);
  const applied = session.status === "applied";

  useEffect(() => {
    if (applied) { setSummary(session.applied_summary); return; }
    getDocsSetupSummary(session.id).then(setSummary).catch((e) => setError(errorText(e, "The summary could not be loaded.")));
  }, [session.id, applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      onSession(await applyDocsSetup(session.id, idempotencyKey(session.id)));
    } catch (e) {
      setError(errorText(e, "Nothing was changed. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!window.confirm("Undo this setup? Your earlier settings come back and the drafts it created are retired.")) return;
    setBusy(true);
    try {
      const res = await undoDocsSetup(session.id);
      setUndoMsg({ tone: res.undone ? "ok" : "warn", text: res.message });
      if (res.undone) onSession({ ...session, status: "cancelled", undo_available: false, undone_at: new Date().toISOString() });
    } catch (e) {
      setUndoMsg({ tone: "error", text: errorText(e, "The setup could not be undone.") });
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => summary ? [
    [summary.settings, "settings"], [summary.clauses, "clause wordings (waiting for counsel)"], [summary.draft_templates, "draft templates"],
    [summary.new_package_documents, "new package documents"], [summary.package_changes, "package changes"],
    [summary.form_fields, "form questions"], [summary.categories, "upload categories"],
  ] : [], [summary]);

  if (!summary) return error ? <Banner tone="error">{error}</Banner> : <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  const blocked = !applied && (summary.unresolved_conflicts?.length > 0);
  const pkg = summary.package;
  const toggleOnly = async (value) => {
    setBusy(true);
    try { setSummary(await setDocsSetupOptions(session.id, { only_uploaded: value })); }
    catch (e) { setError(errorText(e, "The option could not be saved.")); }
    finally { setBusy(false); }
  };
  const created = summary.created || {};
  return (
    <div className="space-y-4">
      {applied ? (
        <Banner tone="ok">Applied {session.applied_at ? new Date(session.applied_at).toLocaleString() : ""}. Your settings are updated. Nothing was sent to any new hire.</Banner>
      ) : (
        <p className="text-sm text-gray-600">Check what will change. Everything is applied together, or nothing is.</p>
      )}
      <p className="text-base font-semibold text-gray-900">
        {counts.filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(", ") || "No changes chosen yet."}
      </p>
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Templates are created as drafts. After applying, you approve and release them here; only then are they used.</li>
        <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Clause wording is held for counsel sign-off and is not printed until it is approved.</li>
        <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />No document is sent to anyone.</li>
      </ul>
      {pkg && !applied && (
        <div className="space-y-3 rounded-xl border border-gray-200 p-3 sm:p-4">
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={!!pkg.only_uploaded} disabled={busy}
              onChange={(e) => toggleOnly(e.target.checked)} />
            <span>
              <span className="font-semibold">Send new hires only the documents I uploaded</span>
              <span className="block text-xs text-gray-600">Every other onboarding document is switched off. You can switch any back on later in Settings.</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-emerald-700">New hires will get ({pkg.sent.length})</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">{pkg.sent.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            {pkg.off.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600">Switched off ({pkg.off.length})</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-gray-500">{pkg.off.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
      {summary.pending > 0 && !applied && (
        <Banner tone="info">
          {summary.pending === 1 ? "1 suggestion has a value that does not pass a check, so it is left out."
            : `${summary.pending} suggestions have values that do not pass a check, so they are left out.`}
          {" "}To use {summary.pending === 1 ? "it" : "them"}, go back to Review settings and use Edit.
        </Banner>
      )}
      {blocked && <Banner tone="error">Settle the conflicting values in Review settings first.</Banner>}
      <details className="rounded-xl border border-gray-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-gray-800">Every change ({(summary.changes || []).length + (summary.templates || []).length})</summary>
        <ul className="mt-2 space-y-1">
          {(summary.changes || []).map((c, i) => (
            <li key={i} className="break-words"><span className="text-gray-500">{c.area}:</span> {c.label} → <strong>{formatValue(c.value)}</strong></li>
          ))}
          {(summary.templates || []).map((t, i) => (
            <li key={`t${i}`}><span className="text-gray-500">Draft template:</span> {t.file} → {t.action === "variant_of" ? `your version of ${t.category}` : `new document${t.title ? ` "${t.title}"` : ""}`}</li>
          ))}
        </ul>
      </details>
      {error && <Banner tone="error">{error}</Banner>}
      {!applied ? (
        <button type="button" onClick={apply} disabled={busy || blocked}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Apply these changes
        </button>
      ) : (
        <div className="space-y-3">
          {!session.undone_at && <ReleasePanel sessionId={session.id} variantIds={created.variants || []} />}
          <div className="flex flex-wrap gap-2">
            <Link to="/zoiko-hr/onboarding/settings#package-documents" className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
              Open Settings
            </Link>
            {(created.clauses_pending || []).length > 0 && (
              <Link to="/zoiko-hr/onboarding/settings#offer-package" className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                Clause wording waiting for counsel ({created.clauses_pending.length})
              </Link>
            )}
          </div>
          {session.undo_available && (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm text-gray-700">Changed your mind? You can undo this setup until {session.undo_until ? new Date(session.undo_until).toLocaleDateString() : "30 days after applying"}, as long as no new hire has received a document made from it.</p>
              <button type="button" onClick={undo} disabled={busy}
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                <RotateCcw className="h-4 w-4" />Undo this setup
              </button>
            </div>
          )}
          {undoMsg && <Banner tone={undoMsg.tone}>{undoMsg.text}</Banner>}
        </div>
      )}
    </div>
  );
}
