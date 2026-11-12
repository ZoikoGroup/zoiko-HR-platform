import { useState } from "react";
import { Loader2 } from "lucide-react";

// Schedule A of the Affidavit of Employment Exclusivity: the deponent's own declaration of outside activities (or that there
// are none). Made before the affidavit is signed, from wherever it is signed: the onboarding portal, the signing link, or
// self-service. `save(body)` posts it; `onSaved(result)` receives the response.

const EMPTY = { organisation: "", role: "", hours: "", paid: "unpaid" };

export default function OutsideActivitiesForm({ save, onSaved, onError, compact = false }) {
  const [none, setNone] = useState(false);
  const [rows, setRows] = useState([{ ...EMPTY }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const cls = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await save({
        none,
        rows: none ? [] : rows.filter((r) => r.organisation.trim()).map((r) => ({ ...r, hours: Number(r.hours) || 0 })),
      });
      onSaved?.(res);
    } catch (err) {
      const text = err?.message || "Could not save your declaration.";
      if (onError) onError(text);
      else setError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`rounded-2xl border border-blue-100 bg-white ${compact ? "p-4" : "p-4 sm:p-5"}`}>
      <h4 className="text-sm font-semibold text-slate-900">Schedule A · Outside activities</h4>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Before signing your Affidavit of Employment Exclusivity, list any other employment, consultancy, directorship or business
        activity, paid or unpaid, or confirm you have none. It is attached to the affidavit when you sign it.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
        I have no outside activities
      </label>
      {!none && (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
              <input aria-label="Organisation" placeholder="Organisation" className={cls} value={r.organisation} onChange={(e) => set(i, { organisation: e.target.value })} />
              <input aria-label="Role" placeholder="Role" className={cls} value={r.role} onChange={(e) => set(i, { role: e.target.value })} />
              <input aria-label="Hours per week" type="number" min={0} max={168} placeholder="Hours / week" className={cls} value={r.hours} onChange={(e) => set(i, { hours: e.target.value })} />
              <select aria-label="Paid or unpaid" className={cls} value={r.paid} onChange={(e) => set(i, { paid: e.target.value })}>
                <option value="unpaid">Unpaid</option><option value="paid">Paid</option>
              </select>
              <button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ ...EMPTY }]))}
                className="rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-600">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((x) => [...x, { ...EMPTY }])} className="text-xs font-semibold text-blue-600 hover:underline">
            + Add another activity
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={busy || (!none && !rows.some((r) => r.organisation.trim()))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {busy ? "Saving…" : "Save declaration"}
        </button>
      </div>
    </form>
  );
}
