// Step 4: what each uploaded document becomes – "our version of" a Zoiko package document (the locked signature and
// declaration blocks are kept), a new document in the package, or only a source of settings. Every sample detail and blank
// in a template is turned into its placeholder automatically, so each document fills itself from the new hire's data and
// the organisation's settings. Each document is previewed here and its wording can be edited before applying.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Lock, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import {
  getDocsSetupMapping, getDocsSetupMappingOptions, getDocsSetupPreviewPdf, setDocsSetupMapping,
} from "../../../../service/docsSetupService";
import { addCustomField } from "../../../../service/onboardingSetupService";
import { Banner, KIND_LABELS, errorText, inputCls } from "./shared";

const TYPE_LABELS = { heading: "Heading", paragraph: "Paragraph", list: "List", table: "Table", page_break: "Page break" };
const toLines = (s) => String(s || "").replace(/<br\s*\/?>/gi, "\n");
const fromLines = (s) => String(s || "").replace(/\r?\n/g, "<br/>");

function BlockEditor({ blocks, onChange, disabled }) {
  const set = (i, patch) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i) => onChange(blocks.filter((_, j) => j !== i));
  const addAfter = (i) => {
    const next = [...blocks];
    next.splice(i + 1, 0, { type: "paragraph", text: "", id: `new${Date.now()}` });
    onChange(next);
  };
  const btn = "rounded-md border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40";
  return (
    <ol className="space-y-2">
      {blocks.map((b, i) => (
        <li key={`${b.id || "b"}-${i}`} className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <select aria-label={`Part ${i + 1} type`} disabled={disabled} value={b.type}
              className="rounded-md border border-gray-200 px-1.5 py-0.5 text-xs text-gray-700"
              onChange={(e) => {
                const t = e.target.value;
                const text = b.text ?? (b.items || []).join("\n");
                if (t === "list") set(i, { type: t, items: toLines(text).split("\n"), style: "bullet", text: undefined });
                else if (t === "heading" || t === "paragraph") set(i, { type: t, text: b.text ?? fromLines((b.items || []).join("\n")), level: 2 });
                else set(i, { type: t });
              }}>
              {["heading", "paragraph", "list", "page_break"].concat(b.type === "table" ? ["table"] : [])
                .map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <span className="flex-1" />
            <button type="button" className={btn} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className={btn} disabled={disabled || i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className={btn} disabled={disabled} onClick={() => addAfter(i)} aria-label="Add a paragraph below"><Plus className="h-3.5 w-3.5" /></button>
            <button type="button" className={btn} disabled={disabled || blocks.length === 1} onClick={() => remove(i)} aria-label="Remove this part"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></button>
          </div>
          {(b.type === "heading" || b.type === "paragraph") && (
            <textarea aria-label={`Part ${i + 1} text`} disabled={disabled} rows={b.type === "heading" ? 1 : Math.min(8, Math.max(2, Math.ceil(toLines(b.text).length / 90)))}
              className={`${inputCls} ${b.type === "heading" ? "font-semibold" : ""}`} value={toLines(b.text)}
              onChange={(e) => set(i, { text: fromLines(e.target.value) })} />
          )}
          {b.type === "list" && (
            <textarea aria-label={`Part ${i + 1} list items, one per line`} disabled={disabled} rows={Math.max(2, (b.items || []).length)}
              className={inputCls} value={(b.items || []).join("\n")}
              onChange={(e) => set(i, { items: e.target.value.split("\n") })} />
          )}
          {b.type === "table" && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>{(b.columns || []).map((c, ci) => (
                    <th key={ci} className="p-0.5"><input aria-label={`Column ${ci + 1}`} disabled={disabled} className={`${inputCls} font-semibold`} value={c}
                      onChange={(e) => set(i, { columns: b.columns.map((x, k) => (k === ci ? e.target.value : x)) })} /></th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(b.rows || []).map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => (
                      <td key={ci} className="p-0.5"><input aria-label={`Row ${ri + 1} column ${ci + 1}`} disabled={disabled} className={inputCls} value={c}
                        onChange={(e) => set(i, { rows: b.rows.map((row, k) => (k === ri ? row.map((x, m) => (m === ci ? e.target.value : x)) : row)) })} /></td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {b.type === "page_break" && <p className="text-xs text-gray-500">A new page starts here.</p>}
        </li>
      ))}
    </ol>
  );
}

function PdfPreview({ sessionId, fileId, version }) {
  const [url, setUrl] = useState(null);
  const [state, setState] = useState("loading");
  const current = useRef(null);
  useEffect(() => {
    let alive = true;
    setState("loading");
    getDocsSetupPreviewPdf(sessionId, fileId)
      .then((blob) => {
        if (!alive) return;
        const next = URL.createObjectURL(blob);
        if (current.current) URL.revokeObjectURL(current.current);
        current.current = next;
        setUrl(next);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [sessionId, fileId, version]);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  if (state === "error") return <p className="text-sm text-rose-700">The preview could not be made.</p>;
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      {state === "loading" && (
        <p className="absolute inset-x-0 top-3 z-10 flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Making the preview…</p>
      )}
      {url && <iframe title="Document preview" src={url} className="h-[32rem] w-full sm:h-[40rem]" />}
    </div>
  );
}

function describe(form, options, file) {
  if (form.action === "variant_of") {
    const d = (options?.documents || []).find((x) => x.category === form.category);
    return d ? `Becomes your version of ${d.title}` : "Becomes your version of a package document";
  }
  if (form.action === "new_document") return `Becomes a new package document${form.title ? `: ${form.title}` : ""}`;
  return `Used only as a source of settings${file.detected_kind ? ` (${KIND_LABELS[file.detected_kind] || "document"})` : ""}`;
}

const FIELD_TYPES = [["text", "Text"], ["money", "Amount of money"], ["number", "Number"], ["date", "Date"], ["long_text", "Paragraph"]];

/** Placeholders written in the file that are not known yet: each can become one of the organisation's own fields. */
export function UnknownPlaceholders({ items, onCreated }) {
  const [types, setTypes] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!items?.length) return null;
  const create = async (p) => {
    setBusy(p.key);
    setError("");
    try {
      await addCustomField({ key: p.custom_key, label: p.custom_label || p.custom_key, type: types[p.key] || "text", source: "hr", required: true });
      await onCreated();
    } catch (e) {
      setError(errorText(e, "The field could not be created."));
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="region" aria-label="Unknown placeholders">
      <p className="font-semibold">Placeholders we do not know yet</p>
      <p className="mt-0.5 text-xs">Until they are fields, they print as plain text. Create each as one of your own fields: HR types its value for every new hire.</p>
      <ul className="mt-2 space-y-2">
        {items.map((p) => (
          <li key={p.key} className="flex flex-col gap-2 rounded-lg bg-white/70 p-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0"><span className="font-mono text-xs">{`{{${p.key}}}`}</span> → <span className="font-medium">{p.custom_label}</span>
              <span className="font-mono text-xs text-amber-800"> ({`{{custom.${p.custom_key}}}`})</span></span>
            <span className="flex items-center gap-2">
              <label htmlFor={`uph-${p.custom_key}`} className="sr-only">Type of {p.custom_label}</label>
              <select id={`uph-${p.custom_key}`} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs" value={types[p.key] || "text"}
                onChange={(e) => setTypes((t) => ({ ...t, [p.key]: e.target.value }))}>
                {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="button" onClick={() => create(p)} disabled={!!busy}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {busy === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create field
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function FileMapping({ session, file, options }) {
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [version, setVersion] = useState(0);

  const hydrate = useCallback((res) => {
    const m = res.file.mapping || {};
    setPreview(res.preview);
    setBlocks(res.preview.blocks || []);
    setForm({
      action: m.action || "source_only", category: m.category || "", mode: m.mode || "ACKNOWLEDGE",
      signers: m.signers || ["candidate"], slugs: m.engagement_slugs || [], title: m.title || "",
    });
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    getDocsSetupMapping(session.id, file.id).then(hydrate).catch((e) => setMsg({ tone: "error", text: errorText(e, "Could not load.") }));
  }, [session.id, file.id, hydrate]);

  const body = (extra = {}) => {
    const b = { action: form.action, ...extra };
    if (form.action === "variant_of") b.category = form.category;
    if (form.action === "new_document") Object.assign(b, { mode: form.mode, signers: form.mode === "SIGN" ? form.signers : [],
      engagement_slugs: form.slugs, title: form.title });
    return b;
  };
  const send = async (extra, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      hydrate(await setDocsSetupMapping(session.id, file.id, body(extra)));
      setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "The change could not be saved.") });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveChoice = () => send({}, "Saved. The draft is created when you apply.");
  const saveDocument = async () => {
    const clean = blocks.map((b) => (b.type === "list" ? { ...b, items: (b.items || []).filter((x) => x.trim()) } : b));
    if (await send({ blocks: clean }, "Your edits are saved. The preview below shows the document as it will be used.")) setEditing(false);
  };
  const resetDocument = async () => {
    if (!window.confirm("Discard your edits and use the uploaded file's wording again?")) return;
    if (await send({ blocks: null }, "The uploaded file's wording is used again.")) setEditing(false);
  };

  if (!form) {
    return <li className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-500">{msg ? msg.text : `Loading ${file.filename}…`}</li>;
  }
  const docs = options?.documents || [];
  const savedAction = preview?.mapping?.action;
  const isTemplate = savedAction === "variant_of" || savedAction === "new_document";
  const changed = form.action !== (savedAction || "source_only") || (form.action === "variant_of" && form.category !== (preview?.mapping?.category || ""))
    || (form.action === "new_document" && (form.title !== (preview?.mapping?.title || "") || form.mode !== (preview?.mapping?.mode || "ACKNOWLEDGE")
      || JSON.stringify(form.slugs) !== JSON.stringify(preview?.mapping?.engagement_slugs || [])
      || JSON.stringify(form.signers) !== JSON.stringify(preview?.mapping?.signers || form.signers)));
  const blockedChoice = form.action === "variant_of" && (!form.category || !!docs.find((d) => d.category === form.category)?.customise_blocked);
  const fields = (preview?.fields || []).length;
  return (
    <li className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div>
        <p className="break-words text-sm font-semibold text-gray-900">{file.filename}</p>
        <p className="text-xs text-gray-600">{describe(form, options, file)}{preview?.edited ? " · edited by you" : ""}</p>
        {preview?.mapping?.note && <p className="mt-1 text-xs text-amber-800">{preview.mapping.note}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="sr-only">Use {file.filename} as</legend>
        {[["variant_of", "Use as our version of a package document"], ["new_document", "Add as a new package document"],
          ["source_only", "Use only as a source of settings"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm text-gray-800">
            <input type="radio" name={`act-${file.id}`} className="accent-blue-600" checked={form.action === v} disabled={busy}
              onChange={() => setForm((f) => ({ ...f, action: v }))} />{l}
          </label>
        ))}
      </fieldset>
      {form.action === "variant_of" && (
        <div>
          <label htmlFor={`cat-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Our version of</label>
          <select id={`cat-${file.id}`} className={inputCls} value={form.category} disabled={busy || !options}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">{options ? "Choose…" : "Loading…"}</option>
            {docs.map((d) => (
              <option key={d.category} value={d.category} disabled={!!d.customise_blocked}>
                {d.title}{d.customise_blocked ? " – not available" : ""}
              </option>
            ))}
          </select>
          {form.category && docs.find((d) => d.category === form.category)?.customise_blocked && (
            <p className="mt-1 text-xs font-medium text-rose-700">{docs.find((d) => d.category === form.category).customise_blocked}</p>
          )}
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="h-3 w-3" />The Zoiko signature, declaration and statutory blocks stay, locked.</p>
        </div>
      )}
      {form.action === "new_document" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`title-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Document title</label>
            <input id={`title-${file.id}`} className={inputCls} value={form.title} placeholder="e.g. Hybrid Working Agreement" disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label htmlFor={`mode-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">The new hire must</label>
            <select id={`mode-${file.id}`} className={inputCls} value={form.mode} disabled={busy || !options}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
              {!options && <option value={form.mode}>Loading…</option>}
              {(options?.modes || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {form.mode === "SIGN" && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs font-semibold text-gray-600">Who signs</legend>
              <div className="flex flex-wrap gap-3">
                {(options?.signer_parties || []).map((p) => (
                  <label key={p} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="accent-blue-600" checked={form.signers.includes(p)} disabled={busy}
                      onChange={(e) => setForm((f) => ({ ...f, signers: e.target.checked ? [...f.signers, p] : f.signers.filter((x) => x !== p) }))} />
                    {p === "candidate" ? "New hire" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {(options?.engagement_profiles || []).length > 0 && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs font-semibold text-gray-600">Send only to these engagement profiles (none ticked = everyone)</legend>
              <div className="flex flex-wrap gap-3">
                {options.engagement_profiles.map((p) => (
                  <label key={p.slug} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="accent-blue-600" checked={form.slugs.includes(p.slug)} disabled={busy}
                      onChange={(e) => setForm((f) => ({ ...f, slugs: e.target.checked ? [...f.slugs, p.slug] : f.slugs.filter((x) => x !== p.slug) }))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}
      {changed && (
        <button type="button" onClick={saveChoice} disabled={busy || blockedChoice}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save choice
        </button>
      )}
      {msg && <Banner tone={msg.tone === "error" ? "error" : "ok"}>{msg.text}</Banner>}
      {isTemplate && !changed && (
        <div className="space-y-3">
          {fields > 0 && (
            <p className="text-xs text-emerald-800">
              {fields} {fields === 1 ? "detail fills" : "details fill"} in automatically from the new hire's data and your settings.
            </p>
          )}
          <UnknownPlaceholders items={preview?.unknown_placeholders}
            onCreated={() => getDocsSetupMapping(session.id, file.id).then(hydrate)} />
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button type="button" onClick={() => setEditing(true)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                <Pencil className="h-4 w-4" />Edit document
              </button>
            ) : (
              <>
                <button type="button" onClick={saveDocument} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save document
                </button>
                <button type="button" onClick={() => { setBlocks(preview?.blocks || []); setEditing(false); }} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                  <X className="h-4 w-4" />Cancel
                </button>
              </>
            )}
            {preview?.edited && (
              <button type="button" onClick={resetDocument} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                <RotateCcw className="h-4 w-4" />Use the uploaded wording again
              </button>
            )}
          </div>
          {editing && (
            <div className="space-y-2 rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-600">
                Edit the wording of your document. Placeholders such as <code>{"{{worker.full_name}}"}</code> are filled for each new hire –
                keep them where the detail should appear. <span className="whitespace-nowrap">**Bold**</span> prints in bold. The locked Zoiko blocks are added at the end.
              </p>
              <BlockEditor blocks={blocks} onChange={setBlocks} disabled={busy} />
            </div>
          )}
          <PdfPreview sessionId={session.id} fileId={file.id} version={version} />
        </div>
      )}
    </li>
  );
}

export default function MappingStep({ session }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    getDocsSetupMappingOptions(session.id).then(setOptions).catch((e) => setError(errorText(e, "The document choices could not be loaded.")));
  }, [session.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Each template is set up automatically: the details in it fill in from the new hire's data and your settings. Check each
        document in its preview, edit the wording if you need to, then continue. Nothing is sent to anyone.
      </p>
      {error && (
        <Banner tone="error">
          {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </Banner>
      )}
      <ul className="space-y-3">
        {session.files.map((f) => <FileMapping key={f.id} session={session} file={f} options={options} />)}
      </ul>
    </div>
  );
}
