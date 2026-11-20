// Step 5: the documents new hires are asked to upload (document request categories). Suggestions found in the documents
// are listed for a decision; the admin can add more. Which package documents are sent follows from the templates mapped in
// step 4 (and the "send only the documents I uploaded" option in step 6); the core portal questions are always asked.
import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { addDocsSetupChange, decideDocsSetupProposal, getDocsSetupProposals } from "../../../../service/docsSetupService";
import { Banner, errorText, formatValue, inputCls } from "./shared";

const TARGET = "request_category";

export default function PackageFormsStep({ session }) {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState({ label: "", description: "" });

  const load = async () => {
    const res = await getDocsSetupProposals(session.id);
    setItems((res.items || []).filter((p) => p.target === TARGET));
  };
  useEffect(() => { load().catch(() => {}); }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "That change could not be added.") });
    } finally {
      setBusy(false);
    }
  };

  const addCat = () => run(() => addDocsSetupChange(session.id, { target: TARGET, value: cat }), "Category added.")
    .then(() => setCat({ label: "", description: "" }));
  const decide = (p, decision) => run(() => decideDocsSetupProposal(session.id, p.id, decision), decision === "rejected" ? "Rejected." : "Accepted.");

  return (
    <div className="space-y-5">
      {msg && <Banner tone={msg.tone === "error" ? "error" : "ok"}>{msg.text}</Banner>}
      <section aria-labelledby="pf-request-category" className="space-y-2">
        <h3 id="pf-request-category" className="text-sm font-semibold text-gray-900">Documents requested from new hires</h3>
        {items.length === 0 && <p className="text-sm text-gray-500">No changes yet.</p>}
        <ul className="space-y-1.5">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                {formatValue(p.final_value ?? p.proposed_value)}
                {p.sources?.[0] && <span className="block text-xs text-gray-500">Found in {p.sources[0].filename}: “{p.sources[0].quote}”</span>}
                <span className="block text-xs text-gray-600">{p.decision === "pending" ? "Waiting for your decision" : p.decision === "rejected" ? "Rejected" : "Will be applied"}</span>
              </span>
              <span className="flex gap-1">
                <button type="button" disabled={busy || p.decision === "accepted"} onClick={() => decide(p, "accepted")} aria-label="Accept"
                  className="rounded-lg border border-gray-200 p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Check className="h-4 w-4" /></button>
                <button type="button" disabled={busy || p.decision === "rejected"} onClick={() => decide(p, "rejected")} aria-label="Reject"
                  className="rounded-lg border border-gray-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-40"><X className="h-4 w-4" /></button>
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor="pf-cat" className="mb-1 block text-xs font-semibold text-gray-600">Category</label>
            <input id="pf-cat" className={inputCls} value={cat.label} placeholder="e.g. Driving licence" onChange={(e) => setCat((c) => ({ ...c, label: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="pf-cat-desc" className="mb-1 block text-xs font-semibold text-gray-600">What to upload</label>
            <input id="pf-cat-desc" className={inputCls} value={cat.description} onChange={(e) => setCat((c) => ({ ...c, description: e.target.value }))} />
          </div>
          <button type="button" onClick={addCat} disabled={busy || !cat.label.trim()}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
        </div>
      </section>
    </div>
  );
}
