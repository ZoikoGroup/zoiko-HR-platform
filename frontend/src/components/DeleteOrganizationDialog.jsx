import React, { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { superAdminService } from "../service/superAdminService";

/**
 * The single confirmation dialog for deleting an organization (ZHR-35), used by
 * the Organizations list, the Organization detail page and User Management so
 * every entry point shows the same impact and calls the same endpoint.
 *
 * Props: org = { id, name }, onClose(), onDeleted(result)
 */
export default function DeleteOrganizationDialog({ org, onClose, onDeleted }) {
  const [impact, setImpact] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    superAdminService
      .getOrganizationDeletionImpact(org.id)
      .then((r) => { if (!cancelled) setImpact(r); })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || "Could not load what this will affect."); });
    return () => { cancelled = true; };
  }, [org.id]);

  const matches = typed.trim() === (impact?.name || org.name);

  async function submit(e) {
    e.preventDefault();
    if (pending || !matches) return;
    setPending(true);
    setError("");
    try {
      const res = await superAdminService.deleteOrganization(org.id, { confirm_name: typed.trim(), reason: reason.trim() || null });
      onDeleted(res);
    } catch (err) {
      setError(err?.message || "The organization could not be deleted.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Delete organization">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100"><Trash2 className="h-5 w-5 text-red-600" /></div>
          <h3 className="text-lg font-bold text-slate-800">Delete {org.name}?</h3>
        </div>

        {loadError ? <div role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">{loadError}</div> : null}
        {!impact && !loadError ? <p className="mb-3 text-sm text-slate-500">Checking what this affects…</p> : null}
        {impact ? (
          <div className="mb-4 space-y-3 text-sm text-slate-600">
            <p>
              <strong>{impact.users_total}</strong> user{impact.users_total === 1 ? "" : "s"} ({impact.users_active} active) will lose access.
              {impact.subscription ? (
                <> Subscription: <strong>{impact.subscription.plan || "no plan"}</strong> ({impact.subscription.status || "unknown status"}).</>
              ) : (
                <> No subscription on record.</>
              )}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {impact.effects.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        ) : null}

        <label className="mb-3 block text-xs font-semibold text-slate-600">
          Reason (optional, kept in the audit log)
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" maxLength={1000}
            value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Type <span className="font-mono text-red-600">{impact?.name || org.name}</span> to confirm
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" autoComplete="off"
            aria-label="Type the organization name to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={pending} />
        </label>

        {error ? (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={pending || !matches || !impact}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />{pending ? "Deleting…" : "Delete organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
