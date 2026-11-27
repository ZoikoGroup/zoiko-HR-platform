/*
 * Onboarding › Settings › "Documents in your onboarding package".
 * Which documents a new hire receives, how they act on each one, and for which engagement profiles. Offer Letter and
 * Employment Contract are always sent. Changes apply to future sends only: documents already sent stay with the hire.
 * "Customise this document" starts the organisation's own version (a draft template that goes through legal review and
 * release before any hire receives it). The organisation's own released templates can be added to the package.
 * Each document also has its rules: when it is prepared (a trigger), whether the employer countersigns, and which new hires
 * receive it ("only send it when"). Documents with a trigger are prepared for review or sent automatically (AutomationBar).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, FilePlus2, FileText, GripVertical, Loader2, Lock, Pencil, Plus, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { addPackageDocument, createOrgTemplate, customisePackageDocument, getPackageDocuments, removePackageDocument,
  savePackageDocuments } from "../../../service/docsSetupService";
import { SettingsCard } from "./settingsUi";
import { AutomationBar, RulesPanel, StarterSetPicker, conditionsComplete, ruleSummary } from "./PackageDocumentRules";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const AUDIENCE = [
  { value: "all", label: "All new hires" },
  { value: "only", label: "Only these profiles" },
  { value: "except", label: "All except these profiles" },
];

function audienceOf(d) {
  if ((d.applies_to_engagement_slugs || []).length) return "only";
  if ((d.excluded_engagement_slugs || []).length) return "except";
  return "all";
}

const editable = (d) => ({
  category: d.category, enabled: d.enabled, mode: d.mode, sort_order: d.sort_order, signers: d.signers || [],
  audience: audienceOf(d), slugs: [...(d.applies_to_engagement_slugs || []), ...(d.excluded_engagement_slugs || [])],
  conditions: d.conditions || [], send_when: d.send_when || "manual", send_days_before: d.send_days_before ?? null,
});

/** The engagement profiles a document goes to (or skips), as toggle chips. */
function ProfileChips({ id, profiles, value, onChange, disabled }) {
  return (
    <fieldset className="mt-2 flex flex-wrap gap-1.5" disabled={disabled}>
      <legend className="sr-only">Engagement profiles</legend>
      {profiles.map((p) => {
        const on = value.includes(p.slug);
        return (
          <label key={p.slug} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-600"}`}>
            <input type="checkbox" id={`${id}-${p.slug}`} className="h-3.5 w-3.5 accent-blue-600" checked={on}
              onChange={(e) => onChange(e.target.checked ? [...value, p.slug] : value.filter((s) => s !== p.slug))} />
            {p.name}
          </label>
        );
      })}
      {profiles.length === 0 && <span className="text-xs text-gray-500">No engagement profiles yet. Add them under Engagement &amp; role profiles.</span>}
    </fieldset>
  );
}

function AddDocumentPanel({ data, onClose, onAdded, onMessage }) {
  const navigate = useNavigate();
  const addable = (data.addable_templates || []).filter((t) => !t.in_package);
  const [form, setForm] = useState({ canonical_id: "", mode: "ACKNOWLEDGE", signers: ["candidate"], audience: "all", slugs: [] });
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const chosen = addable.find((t) => t.canonical_id === form.canonical_id);

  const add = async () => {
    setBusy(true);
    try {
      const res = await addPackageDocument({
        canonical_id: form.canonical_id, mode: form.mode, signers: form.mode === "SIGN" ? form.signers : [],
        applies_to_engagement_slugs: form.audience === "only" ? form.slugs : [],
        excluded_engagement_slugs: form.audience === "except" ? form.slugs : [],
      });
      onAdded(res);
      onMessage({ tone: "ok", text: "Document added. It is sent to new hires from now on." });
      onClose();
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The document could not be added." });
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await createOrgTemplate({ title: title.trim() });
      navigate(res.editor_path);
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The template could not be created." });
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4" role="region" aria-label="Add a document">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Add a document</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-white" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="add-doc-template" className="mb-1 block text-sm font-medium text-gray-700">Your template</label>
          <select id="add-doc-template" className={inputCls} value={form.canonical_id} onChange={(e) => setForm((f) => ({ ...f, canonical_id: e.target.value }))}>
            <option value="">Choose a template…</option>
            {addable.map((t) => (
              <option key={t.canonical_id} value={t.canonical_id} disabled={!t.released}>
                {t.title} ({t.canonical_id}) – {t.released ? "released" : "not released yet"}
              </option>
            ))}
          </select>
          {addable.length === 0 && <p className="mt-1 text-xs text-gray-500">You have no templates of your own yet. Create one below, or import a Word file.</p>}
          {chosen && !chosen.released && <p className="mt-1 text-xs text-amber-700">Release this template (legal approval) before adding it.</p>}
        </div>
        <div>
          <label htmlFor="add-doc-mode" className="mb-1 block text-sm font-medium text-gray-700">The new hire must</label>
          <select id="add-doc-mode" className={inputCls} value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
            {(data.modes || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {form.mode === "SIGN" && (
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-700">Who signs</legend>
            <div className="flex flex-wrap gap-3">
              {(data.signer_parties || []).map((p) => (
                <label key={p} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" className="accent-blue-600" checked={form.signers.includes(p)}
                    onChange={(e) => setForm((f) => ({ ...f, signers: e.target.checked ? [...f.signers, p] : f.signers.filter((x) => x !== p) }))} />
                  {p === "candidate" ? "New hire" : p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="add-doc-aud" className="mb-1 block text-sm font-medium text-gray-700">Send to</label>
          <select id="add-doc-aud" className={inputCls} value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
            {AUDIENCE.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {form.audience !== "all" && (
            <ProfileChips id="add-doc" profiles={data.engagement_profiles || []} value={form.slugs} onChange={(slugs) => setForm((f) => ({ ...f, slugs }))} />
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <PrimaryButton icon={Plus} onClick={add} disabled={busy || !chosen?.released}>Add to package</PrimaryButton>
      </div>
      <div className="mt-4 border-t border-blue-100 pt-3">
        <p className="text-sm font-medium text-gray-800">Or start a new template</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="new-tpl-title" className="sr-only">New template title</label>
          <input id="new-tpl-title" className={inputCls} placeholder="e.g. Hybrid Working Agreement" value={title} onChange={(e) => setTitle(e.target.value)} />
          <SecondaryButton icon={FilePlus2} onClick={createNew} disabled={busy || !title.trim()}>Create and edit</SecondaryButton>
        </div>
        <p className="mt-1 text-xs text-gray-500">The template starts as a draft. It goes through review, legal approval and release before you can add it.</p>
      </div>
    </div>
  );
}

export default function PackageDocumentsSettings() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyCat, setBusyCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [openRules, setOpenRules] = useState(() => new Set());
  const [automation, setAutomation] = useState(null);

  const hydrate = (res) => {
    setData(res);
    if (res.automation) setAutomation(res.automation);
    const list = (res.documents || []).map(editable);
    setRows(list);
    setSaved(list);
  };

  useEffect(() => {
    let live = true;
    getPackageDocuments()
      .then((res) => live && hydrate(res))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "The package could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const byCat = useMemo(() => Object.fromEntries((data?.documents || []).map((d) => [d.category, d])), [data]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const set = (cat, patch) => setRows((list) => list.map((r) => (r.category === cat ? { ...r, ...patch } : r)));
  const move = (from, to) => setRows((list) => {
    if (to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
  });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = rows.map((r) => ({
        category: r.category, enabled: r.enabled, mode: r.mode, sort_order: r.sort_order, signers: r.signers,
        applies_to_engagement_slugs: r.audience === "only" ? r.slugs : [],
        excluded_engagement_slugs: r.audience === "except" ? r.slugs : [],
        conditions: byCat[r.category]?.mandatory ? [] : r.conditions, send_when: r.send_when,
        send_days_before: r.send_when === "days_before_start" ? r.send_days_before : null,
      }));
      hydrate(await savePackageDocuments(payload));
      setMsg({ tone: "ok", text: "Package saved. It applies to documents sent from now on; documents already sent stay with each hire." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The package could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const customise = async (cat) => {
    setBusyCat(cat);
    try {
      const res = await customisePackageDocument(cat);
      navigate(res.editor_path);
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "Your version could not be started." });
      setBusyCat("");
    }
  };

  const remove = async (cat) => {
    if (!window.confirm("Remove this document from the package? New hires who already received it keep it.")) return;
    try {
      hydrate(await removePackageDocument(cat));
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The document could not be removed." });
    }
  };

  return (
    <SettingsCard id="package-documents" icon={FileText} title="Documents in your onboarding package"
      help="Which documents new hires receive, what they do with each one, and who gets it. Changes apply to documents sent from now on."
      action={!loading && data ? (
        <div className="flex flex-wrap gap-2">
          <StarterSetPicker onApplied={hydrate} onMessage={setMsg} />
          <SecondaryButton icon={Plus} onClick={() => setAdding((v) => !v)}>Add a document</SecondaryButton>
        </div>
      ) : null}>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : !data ? (
        // the package could not be loaded: say so (the card used to stay empty)
        msg && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg.text}</div>
      ) : (
        <>
          {msg && (
            <div role={msg.tone === "error" ? "alert" : "status"}
              className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {msg.text}
            </div>
          )}
          <AutomationBar automation={automation} onSaved={setAutomation} onMessage={setMsg} />
          {adding && <AddDocumentPanel data={data} onClose={() => setAdding(false)} onAdded={hydrate} onMessage={setMsg} />}
          <ol className="space-y-2" aria-label="Package documents in order">
            {rows.map((r, i) => {
              const d = byCat[r.category] || {};
              const state = d.template_state || {};
              return (
                <li key={r.category} draggable onDragStart={() => setDragging(i)} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragging !== null) move(dragging, i); setDragging(null); }}
                  className={`rounded-2xl border p-3 sm:p-4 ${r.enabled ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex flex-col gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 cursor-grab text-gray-300 sm:block" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {d.title} <span className="font-normal text-gray-400">· {d.template_id}</span>
                          {d.source === "org_template" && <span className="ml-2 align-middle"><StatusPill tone="blue">Your document</StatusPill></span>}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-600">{state.label || "Using the standard template"}</p>
                        <p className="mt-0.5 text-xs text-blue-800">{ruleSummary({ ...r, mode: r.mode }, data)}</p>
                        {d.warning && <p className="mt-1 inline-flex items-start gap-1 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{d.warning}</p>}
                        {d.mandatory && <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="h-3.5 w-3.5" />Always sent: {d.mandatory_reason}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:pl-6">
                      <label className={`inline-flex items-center gap-2 text-sm ${d.mandatory ? "text-gray-400" : "text-gray-700"}`}>
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={r.enabled} disabled={d.mandatory}
                          aria-label={`Send ${d.title}`} onChange={(e) => set(r.category, { enabled: e.target.checked })} />
                        {r.enabled ? "On" : "Off"}
                      </label>
                      <div>
                        <label htmlFor={`mode-${r.category}`} className="sr-only">What the new hire does with {d.title}</label>
                        <select id={`mode-${r.category}`} className={inputCls} value={r.mode} disabled={d.mandatory}
                          onChange={(e) => set(r.category, { mode: e.target.value })}>
                          {(data.modes || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`aud-${r.category}`} className="sr-only">Who receives {d.title}</label>
                        <select id={`aud-${r.category}`} className={inputCls} value={r.audience} disabled={d.mandatory}
                          onChange={(e) => set(r.category, { audience: e.target.value, slugs: e.target.value === "all" ? [] : r.slugs })}>
                          {AUDIENCE.map((a) => <option key={a.value} value={a.value}>Send to: {a.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {r.audience !== "all" && (
                    <ProfileChips id={`aud-${r.category}`} profiles={data.engagement_profiles || []} value={r.slugs}
                      onChange={(slugs) => set(r.category, { slugs })} />
                  )}
                  {openRules.has(r.category) && (
                    <RulesPanel row={r} doc={d} data={data} onChange={(patch) => set(r.category, patch)} />
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" aria-expanded={openRules.has(r.category)}
                      onClick={() => setOpenRules((prev) => { const n = new Set(prev); if (n.has(r.category)) n.delete(r.category); else n.add(r.category); return n; })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Rules &amp; timing
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openRules.has(r.category) ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    <button type="button" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${d.title} up`}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} aria-label={`Move ${d.title} down`}><ArrowDown className="h-4 w-4" /></button>
                    {d.can_customise && !d.customise_blocked && (
                      <SecondaryButton icon={busyCat === r.category ? Loader2 : Pencil} onClick={() => customise(r.category)} disabled={!!busyCat}>
                        {state.working_variant_id ? "Continue your version" : "Customise this document"}
                      </SecondaryButton>
                    )}
                    {d.can_customise && d.customise_blocked && (
                      <span className="inline-flex items-start gap-1 text-xs text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{d.customise_blocked}</span>
                    )}
                    {d.source === "org_template" && (
                      <button type="button" onClick={() => remove(r.category)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="text-sm text-amber-700">Unsaved changes to the package.</span>}
            <SecondaryButton onClick={() => setRows(saved)} disabled={!dirty || saving}>Discard</SecondaryButton>
            {!rows.every((r) => conditionsComplete(r.conditions)) && <span className="text-sm text-red-600">Complete or remove the unfinished conditions.</span>}
            <PrimaryButton icon={Save} onClick={save} disabled={!dirty || saving || !rows.every((r) => conditionsComplete(r.conditions))}>{saving ? "Saving…" : "Save package"}</PrimaryButton>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
