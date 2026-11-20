// Step 5: the package (which documents, for which engagement profiles), extra questions for the portal forms, and document
// request categories. Suggestions found in the documents are listed for a decision; the admin can add more. Core form
// questions can never be removed.
import { useEffect, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { addDocsSetupChange, decideDocsSetupProposal, getDocsSetupProposals, getPackageDocuments } from "../../../../service/docsSetupService";
import { Banner, errorText, formatValue, inputCls } from "./shared";

const TARGETS = [
  { target: "package_document", title: "Package documents" },
  { target: "form_field", title: "Extra questions on New starter information" },
  { target: "request_category", title: "Documents requested from new hires" },
];

export default function PackageFormsStep({ session }) {
  const [items, setItems] = useState([]);
  const [pkg, setPkg] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState({ category: "", mode: "off", slugs: [] });
  const [field, setField] = useState({ label: "", type: "text", options: "", required: false });
  const [cat, setCat] = useState({ label: "", description: "" });

  const load = async () => {
    const res = await getDocsSetupProposals(session.id);
    setItems((res.items || []).filter((p) => TARGETS.some((t) => t.target === p.target)));
  };
  useEffect(() => {
    load().catch(() => {});
    getPackageDocuments().then(setPkg).catch(() => setPkg({ documents: [], engagement_profiles: [] }));
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const addDoc = () => run(() => addDocsSetupChange(session.id, { target: "package_document", value: doc.mode === "off"
    ? { category: doc.category, enabled: false } : { category: doc.category, excluded_engagement_slugs: doc.slugs } }), "Package change added.");
  const addField = () => run(() => addDocsSetupChange(session.id, { target: "form_field", value: { form: "HR-ONB-001", label: field.label,
    type: field.type, required: field.required, options: field.type === "select" ? field.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined } }),
  "Question added.").then(() => setField({ label: "", type: "text", options: "", required: false }));
  const addCat = () => run(() => addDocsSetupChange(session.id, { target: "request_category", value: cat }), "Category added.")
    .then(() => setCat({ label: "", description: "" }));
  const decide = (p, decision) => run(() => decideDocsSetupProposal(session.id, p.id, decision), decision === "rejected" ? "Rejected." : "Accepted.");

  const platformDocs = (pkg?.documents || []).filter((d) => !d.mandatory);
  return (
    <div className="space-y-5">
      {msg && <Banner tone={msg.tone === "error" ? "error" : "ok"}>{msg.text}</Banner>}
      {TARGETS.map((t) => {
        const list = items.filter((p) => p.target === t.target);
        return (
          <section key={t.target} aria-labelledby={`pf-${t.target}`} className="space-y-2">
            <h3 id={`pf-${t.target}`} className="text-sm font-semibold text-gray-900">{t.title}</h3>
            {list.length === 0 && <p className="text-sm text-gray-500">No changes yet.</p>}
            <ul className="space-y-1.5">
              {list.map((p) => (
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
            {t.target === "package_document" && (
              <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
                <div>
                  <label htmlFor="pf-doc" className="mb-1 block text-xs font-semibold text-gray-600">Document</label>
                  <select id="pf-doc" className={inputCls} value={doc.category} onChange={(e) => setDoc((d) => ({ ...d, category: e.target.value }))}>
                    <option value="">Choose…</option>
                    {platformDocs.map((d) => <option key={d.category} value={d.category}>{d.title}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pf-doc-mode" className="mb-1 block text-xs font-semibold text-gray-600">Change</label>
                  <select id="pf-doc-mode" className={inputCls} value={doc.mode} onChange={(e) => setDoc((d) => ({ ...d, mode: e.target.value }))}>
                    <option value="off">Don't send it</option>
                    <option value="except">Don't send it to some profiles</option>
                  </select>
                </div>
                <button type="button" onClick={addDoc} disabled={busy || !doc.category || (doc.mode === "except" && !doc.slugs.length)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add
                </button>
                {doc.mode === "except" && (
                  <fieldset className="flex flex-wrap gap-3 sm:col-span-3">
                    <legend className="sr-only">Profiles that do not get it</legend>
                    {(pkg?.engagement_profiles || []).map((p) => (
                      <label key={p.slug} className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" className="accent-blue-600" checked={doc.slugs.includes(p.slug)}
                          onChange={(e) => setDoc((d) => ({ ...d, slugs: e.target.checked ? [...d.slugs, p.slug] : d.slugs.filter((s) => s !== p.slug) }))} />
                        {p.name}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}
            {t.target === "form_field" && (
              <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pf-field" className="mb-1 block text-xs font-semibold text-gray-600">Question</label>
                  <input id="pf-field" className={inputCls} value={field.label} placeholder="e.g. T-shirt size" onChange={(e) => setField((f) => ({ ...f, label: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="pf-field-type" className="mb-1 block text-xs font-semibold text-gray-600">Answer type</label>
                  <select id="pf-field-type" className={inputCls} value={field.type} onChange={(e) => setField((f) => ({ ...f, type: e.target.value }))}>
                    <option value="text">Short text</option><option value="textarea">Long text</option><option value="date">Date</option>
                    <option value="number">Number</option><option value="select">Choose from a list</option><option value="checkbox">Tick box</option>
                  </select>
                </div>
                {field.type === "select" && (
                  <div className="sm:col-span-2">
                    <label htmlFor="pf-field-opts" className="mb-1 block text-xs font-semibold text-gray-600">Options (comma separated)</label>
                    <input id="pf-field-opts" className={inputCls} value={field.options} placeholder="S, M, L, XL" onChange={(e) => setField((f) => ({ ...f, options: e.target.value }))} />
                  </div>
                )}
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="accent-blue-600" checked={field.required} onChange={(e) => setField((f) => ({ ...f, required: e.target.checked }))} />Must be answered
                </label>
                <div className="flex justify-end">
                  <button type="button" onClick={addField} disabled={busy || !field.label.trim()}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add question</button>
                </div>
                <p className="text-xs text-gray-500 sm:col-span-2">Core questions (legal name, date of birth, contact and address) are always asked and cannot be removed.</p>
              </div>
            )}
            {t.target === "request_category" && (
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
            )}
          </section>
        );
      })}
    </div>
  );
}
