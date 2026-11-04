// Create a clause (or a new version of one) / edit a draft clause. Clause text may use {{field}} placeholders only.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "../../../../../components/billing-ui";
import { createClause, updateClause } from "../../../../../service/docTemplatesService";
import { FieldPicker } from "./InsertPanels";
import SmartText, { InsertTargetContext } from "./SmartText";
import { ErrorBanner, Labeled, btnIcon, btnPrimary, btnSecondary, btnSmall, errorMessage, errorProblems, inputClass } from "./ui";

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const toDateInput = (v) => (v ? String(v).slice(0, 10) : "");

// mode: "create" | "new-version" | "edit"; initial: clause (for edit / new-version) or null
export default function ClauseFormModal({ open, mode, initial, packs, fields, onClose, onSaved }) {
  const orgPacks = useMemo(() => packs.filter((p) => p.owner === "organization" && p.status !== "RETIRED"), [packs]);
  const [form, setForm] = useState({});
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const target = useRef(null);
  const ctx = useMemo(() => ({ register: (t) => { target.current = t; } }), []);

  useEffect(() => {
    if (!open) return;
    setForm({
      clause_key: initial?.clause_key || "", pack_id: initial?.pack_id ? String(initial.pack_id) : (orgPacks[0] ? String(orgPacks[0].id) : ""),
      title: initial?.title || "", text: initial?.text || "",
      effective_from: mode === "edit" ? toDateInput(initial?.effective_from) : "", effective_to: mode === "edit" ? toDateInput(initial?.effective_to) : "",
      change_reason: mode === "edit" ? initial?.change_reason || "" : "",
    });
    setSources((initial?.source_references || []).map((s) => ({ title: s.title || "", url: s.url || "" })));
    setError(""); setProblems([]);
    target.current = null;
  }, [open, mode, initial, orgPacks]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const keyInvalid = form.clause_key && !KEY_RE.test(form.clause_key);
  const nestsClause = /\{\{\s*(clause:|required_clause_block)/.test(form.text || "");
  const canSave = !busy && form.text?.trim() && (mode === "edit" || (form.clause_key && !keyInvalid && form.pack_id)) && !nestsClause;

  const insert = (text) => {
    const t = target.current;
    if (t && t.isAlive()) t.insert(text);
    else setForm((f) => ({ ...f, text: `${f.text || ""}${text}` }));
  };

  const save = async () => {
    setBusy(true); setError(""); setProblems([]);
    const body = {
      title: form.title.trim() || null, text: form.text,
      source_references: sources.filter((s) => s.title.trim() || s.url.trim()),
      effective_from: form.effective_from || null, effective_to: form.effective_to || null,
      change_reason: form.change_reason.trim() || null,
    };
    try {
      const saved = mode === "edit"
        ? await updateClause(initial.id, body)
        : await createClause({ ...body, clause_key: form.clause_key.trim(), pack_id: Number(form.pack_id), language: initial?.language || "en" });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e)); setProblems(errorProblems(e));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "edit" ? `Edit clause ${initial?.clause_key} v${initial?.version}` : mode === "new-version" ? `New version of ${initial?.clause_key}` : "New clause";

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl"
      description="Clause text may contain {{field}} placeholders. A clause cannot include another clause."
      footer={<>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!canSave} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "edit" ? "Save draft" : "Create draft"}
        </button>
      </>}>
      <InsertTargetContext.Provider value={ctx}>
        <ErrorBanner error={error} problems={problems} />
        {mode !== "edit" && orgPacks.length === 0 && (
          <p className="mb-3 text-sm text-amber-800">Your organization has no jurisdiction pack. Create one on the Jurisdiction packs page first.</p>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled id="cl-key" label="Clause key" required hint="Lower-case letters, digits and underscores, e.g. notice_period">
                <input id="cl-key" className={inputClass} value={form.clause_key || ""} onChange={set("clause_key")} disabled={mode !== "create"}
                  aria-invalid={keyInvalid || undefined} />
                {keyInvalid && <p className="mt-1 text-xs text-red-700" role="alert">Use lower-case letters, digits and underscores, starting with a letter.</p>}
              </Labeled>
              <Labeled id="cl-pack" label="Jurisdiction pack" required>
                <select id="cl-pack" className={inputClass} value={form.pack_id || ""} onChange={set("pack_id")} disabled={mode !== "create"}>
                  {mode !== "create" && initial && !orgPacks.find((p) => p.id === initial.pack_id) && <option value={initial.pack_id}>Pack #{initial.pack_id}</option>}
                  {orgPacks.map((p) => <option key={p.id} value={p.id}>{p.country}{p.region ? ` · ${p.region}` : ""} (#{p.id}, {p.status})</option>)}
                </select>
              </Labeled>
            </div>
            <Labeled id="cl-title" label="Title">
              <input id="cl-title" className={inputClass} value={form.title || ""} onChange={set("title")} />
            </Labeled>
            <Labeled id="cl-text" label="Clause text" required>
              <SmartText id="cl-text" multiline rows={10} value={form.text || ""} onChange={(text) => setForm((f) => ({ ...f, text }))} />
              {nestsClause && <p className="mt-1 text-xs text-red-700" role="alert">A clause cannot include another clause or the required clause block.</p>}
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled id="cl-from" label="Effective from"><input id="cl-from" type="date" className={inputClass} value={form.effective_from || ""} onChange={set("effective_from")} /></Labeled>
              <Labeled id="cl-to" label="Effective to"><input id="cl-to" type="date" className={inputClass} value={form.effective_to || ""} onChange={set("effective_to")} /></Labeled>
            </div>
            <Labeled id="cl-reason" label="Change reason">
              <textarea id="cl-reason" rows={2} className={inputClass} value={form.change_reason || ""} onChange={set("change_reason")} />
            </Labeled>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-gray-600">Source references</legend>
              <ul className="space-y-2">
                {sources.map((s, i) => (
                  <li key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Labeled id={`cls-t-${i}`} label="Title"><input id={`cls-t-${i}`} className={inputClass} value={s.title}
                      onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Labeled>
                    <Labeled id={`cls-u-${i}`} label="URL"><input id={`cls-u-${i}`} type="url" className={inputClass} value={s.url}
                      onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} /></Labeled>
                    <button type="button" className={`${btnIcon} mb-1`} aria-label={`Remove source ${i + 1}`} onClick={() => setSources((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className={`${btnSmall} mt-2`} onClick={() => setSources((l) => [...l, { title: "", url: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add source
              </button>
            </fieldset>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Insert a field</h3>
            <FieldPicker fields={fields} onInsert={insert} hint="Click into the clause text, then choose a field." />
          </div>
        </div>
      </InsertTargetContext.Provider>
    </Modal>
  );
}
