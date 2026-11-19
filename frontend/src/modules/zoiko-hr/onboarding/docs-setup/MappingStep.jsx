// Step 4: what each uploaded document becomes. "Our version of" a Zoiko package document (the locked signature and
// declaration blocks are kept), a new document in the package, or only a source of settings. Sample personal values found in
// a letter are proposed as placeholders; the admin confirms each one. Every template is created as a draft.
import { useEffect, useState } from "react";
import { Eye, Loader2, Lock, Save } from "lucide-react";
import { getDocsSetupMapping, getDocsSetupPreviewPdf, getPackageDocuments, setDocsSetupMapping } from "../../../../service/docsSetupService";
import { Banner, KIND_LABELS, errorText, inputCls } from "./shared";

function FileMapping({ session, file, pkg }) {
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const hydrate = (res) => {
    const m = res.file.mapping || {};
    const samples = (m.placeholders && m.placeholders.length ? m.placeholders : res.preview.samples) || [];
    setPreview(res.preview);
    setForm({
      action: m.suggested ? (m.action || "source_only") : (m.action || "source_only"), suggested: !!m.suggested,
      category: m.category || "", mode: m.mode || "ACKNOWLEDGE", signers: m.signers || ["candidate"], slugs: m.engagement_slugs || [],
      title: m.title || "", placeholders: samples.map((s) => ({ ...s, confirmed: s.confirmed ?? null })),
    });
  };
  useEffect(() => {
    getDocsSetupMapping(session.id, file.id).then(hydrate).catch((e) => setMsg({ tone: "error", text: errorText(e, "Could not load.") }));
  }, [session.id, file.id]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = { action: form.action };
      if (form.action === "variant_of") body.category = form.category;
      if (form.action === "new_document") Object.assign(body, { mode: form.mode, signers: form.mode === "SIGN" ? form.signers : [],
        engagement_slugs: form.slugs, title: form.title });
      if (form.action !== "source_only") body.placeholders = form.placeholders;
      hydrate(await setDocsSetupMapping(session.id, file.id, body));
      setMsg({ tone: "ok", text: "Saved. The draft is created when you apply." });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "The choice could not be saved.") });
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async () => {
    try {
      const blob = await getDocsSetupPreviewPdf(session.id, file.id);
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "The preview could not be made.") });
    }
  };

  if (!form) return <li className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-500">Loading {file.filename}…</li>;
  const platform = (pkg?.documents || []).filter((d) => d.source === "platform");
  const saved = !form.suggested && preview?.mapping?.action;
  return (
    <li className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{file.filename}</p>
        <p className="text-xs text-gray-600">
          {file.role === "template" ? "Uploaded as a template" : "Uploaded as another document"}
          {" · "}Looks like: {KIND_LABELS[file.detected_kind] || "a document"}
          {form.suggested ? " · suggested choice below – save it to confirm"
            : preview?.mapping?.auto ? " · set up automatically from your upload; change it here if needed"
            : saved ? " · your choice is saved" : ""}</p>
        {preview?.mapping?.note && <p className="mt-1 text-xs text-amber-800">{preview.mapping.note}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="sr-only">Use {file.filename} as</legend>
        {[["variant_of", "Use as our version of a package document"], ["new_document", "Add as a new package document"],
          ["source_only", "Use only as a source of settings"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm text-gray-800">
            <input type="radio" name={`act-${file.id}`} className="accent-blue-600" checked={form.action === v}
              onChange={() => setForm((f) => ({ ...f, action: v }))} />{l}
          </label>
        ))}
      </fieldset>
      {form.action === "variant_of" && (
        <div>
          <label htmlFor={`cat-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Our version of</label>
          <select id={`cat-${file.id}`} className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">Choose…</option>
            {platform.map((d) => (
              <option key={d.category} value={d.category} disabled={!!d.customise_blocked}>
                {d.title} ({d.template_id}){d.customise_blocked ? " – not available" : ""}
              </option>
            ))}
          </select>
          {platform.some((d) => d.customise_blocked) && (
            <p className="mt-1 text-xs text-gray-500">
              {platform.find((d) => d.customise_blocked).customise_blocked}
            </p>
          )}
          {form.category && platform.find((d) => d.category === form.category)?.customise_blocked && (
            <p className="mt-1 text-xs font-medium text-rose-700">This document cannot have your own version yet. Choose another, or use the file only as a source of settings.</p>
          )}
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="h-3 w-3" />The Zoiko signature, declaration and statutory blocks stay, locked.</p>
        </div>
      )}
      {form.action === "new_document" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`title-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">Document title</label>
            <input id={`title-${file.id}`} className={inputCls} value={form.title} placeholder="e.g. Hybrid Working Agreement"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label htmlFor={`mode-${file.id}`} className="mb-1 block text-xs font-semibold text-gray-600">The new hire must</label>
            <select id={`mode-${file.id}`} className={inputCls} value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
              {(pkg?.modes || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {form.mode === "SIGN" && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs font-semibold text-gray-600">Who signs</legend>
              <div className="flex flex-wrap gap-3">
                {(pkg?.signer_parties || []).map((p) => (
                  <label key={p} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="accent-blue-600" checked={form.signers.includes(p)}
                      onChange={(e) => setForm((f) => ({ ...f, signers: e.target.checked ? [...f.signers, p] : f.signers.filter((x) => x !== p) }))} />
                    {p === "candidate" ? "New hire" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-semibold text-gray-600">Send only to these engagement profiles (none ticked = everyone)</legend>
            <div className="flex flex-wrap gap-3">
              {(pkg?.engagement_profiles || []).map((p) => (
                <label key={p.slug} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="accent-blue-600" checked={form.slugs.includes(p.slug)}
                    onChange={(e) => setForm((f) => ({ ...f, slugs: e.target.checked ? [...f.slugs, p.slug] : f.slugs.filter((x) => x !== p.slug) }))} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      {form.action !== "source_only" && form.placeholders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600">Sample details found in this letter: turn them into placeholders?</p>
          <ul className="mt-1 space-y-1">
            {form.placeholders.map((ph, i) => (
              <li key={`${ph.text}-${ph.key}`} className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-sm sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">“{ph.text}” → <code className="text-xs">{`{{${ph.key}}}`}</code> <span className="text-xs text-gray-500">({ph.label})</span></span>
                <span className="flex gap-1">
                  {[[true, "Use placeholder"], [false, "Keep the text"]].map(([val, lab]) => (
                    <button key={lab} type="button" aria-pressed={ph.confirmed === val}
                      onClick={() => setForm((f) => ({ ...f, placeholders: f.placeholders.map((x, j) => (j === i ? { ...x, confirmed: val } : x)) }))}
                      className={`rounded-md border px-2 py-0.5 text-xs ${ph.confirmed === val ? "border-blue-400 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-600"}`}>
                      {lab}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {form.placeholders.some((p) => p.confirmed === null) && <p className="mt-1 text-xs text-amber-700">Choose for every detail before applying.</p>}
        </div>
      )}
      {preview?.warnings?.length > 0 && form.action !== "source_only" && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p className="font-semibold text-gray-700">Notes</p>
          <ul className="mt-1 list-disc pl-5">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {preview?.diff?.length > 0 && saved === "variant_of" && (
        <details className="rounded-lg border border-gray-200 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-gray-700">Differences from the Zoiko default ({preview.diff.length} lines)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-4">{preview.diff.join("\n")}</pre>
        </details>
      )}
      {msg && <Banner tone={msg.tone === "error" ? "error" : "ok"}>{msg.text}</Banner>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || (form.action === "variant_of" && (!form.category
          || !!platform.find((d) => d.category === form.category)?.customise_blocked))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save choice
        </button>
        {saved && saved !== "source_only" && (
          <button type="button" onClick={openPreview}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
            <Eye className="h-4 w-4" />Preview the draft (watermarked)
          </button>
        )}
      </div>
    </li>
  );
}

export default function MappingStep({ session }) {
  const [pkg, setPkg] = useState(null);
  useEffect(() => { getPackageDocuments().then(setPkg).catch(() => setPkg({ documents: [] })); }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Choose what each document becomes. Templates are created as drafts and go through your usual legal review and release; nothing is sent to anyone.</p>
      <ul className="space-y-3">
        {session.files.map((f) => <FileMapping key={f.id} session={session} file={f} pkg={pkg} />)}
      </ul>
    </div>
  );
}
