// Create an organization jurisdiction pack, or edit one that is still a draft.
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "../../../../../components/billing-ui";
import { createPack, updatePack } from "../../../../../service/docTemplatesService";
import { ErrorBanner, Labeled, btnIcon, btnPrimary, btnSecondary, btnSmall, errorMessage, inputClass } from "./ui";

const toDateInput = (v) => (v ? String(v).slice(0, 10) : "");

export function RetentionRulesEditor({ rows, onChange, disabled }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-gray-600">Retention rules (years to keep each kind of record)</legend>
      {rows.length === 0 && <p className="mb-1 text-xs text-gray-500">No rules. The platform defaults apply.</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Labeled id={`rr-k-${i}`} label="Rule key" hint={i === 0 ? "e.g. employment_contract, payroll_record" : undefined}>
              <input id={`rr-k-${i}`} className={inputClass} disabled={disabled} value={r.key}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
            </Labeled>
            <Labeled id={`rr-y-${i}`} label="Years">
              <input id={`rr-y-${i}`} type="number" min={0} step="0.5" className={inputClass} disabled={disabled} value={r.years}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, years: e.target.value } : x)))} />
            </Labeled>
            {!disabled && (
              <button type="button" className={`${btnIcon} mb-1`} aria-label={`Remove retention rule ${r.key || i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <button type="button" className={`${btnSmall} mt-2`} onClick={() => onChange([...rows, { key: "", years: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
      )}
    </fieldset>
  );
}

export default function PackFormModal({ open, pack, countries, onClose, onSaved }) {
  const editing = !!pack;
  const [form, setForm] = useState({});
  const [sources, setSources] = useState([]);
  const [rules, setRules] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ country: pack?.country || "", region: pack?.region || "", effective_from: toDateInput(pack?.effective_from),
      effective_to: toDateInput(pack?.effective_to), notes: pack?.notes || "" });
    setSources((pack?.source_references || []).map((s) => ({ title: s.title || "", url: s.url || "" })));
    setRules(Object.entries(pack?.retention_rules || {}).map(([key, years]) => ({ key, years: String(years) })));
    setError("");
  }, [open, pack]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rulesInvalid = rules.some((r) => (r.key.trim() && (r.years === "" || Number.isNaN(Number(r.years)) || Number(r.years) < 0)));

  const save = async () => {
    setBusy(true); setError("");
    const retention_rules = {};
    rules.filter((r) => r.key.trim()).forEach((r) => { retention_rules[r.key.trim()] = Number(r.years); });
    const body = {
      region: form.region.trim() || null, effective_from: form.effective_from || null, effective_to: form.effective_to || null,
      source_references: sources.filter((s) => s.title.trim() || s.url.trim()), retention_rules, notes: form.notes.trim() || null,
    };
    try {
      const saved = editing ? await updatePack(pack.id, body) : await createPack({ ...body, country: form.country });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? `Edit ${pack.country} pack #${pack.id}` : "New jurisdiction pack"}
      description="A jurisdiction pack holds your organization's approved templates and clauses for one country (or region)."
      footer={<>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={busy || (!editing && !form.country) || rulesInvalid} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save draft" : "Create pack"}
        </button>
      </>}>
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id="pk-country" label="Country" required>
            <select id="pk-country" className={inputClass} value={form.country || ""} onChange={set("country")} disabled={editing}>
              <option value="">Choose a country…</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
              {editing && !countries.find((c) => c.code === form.country) && <option value={form.country}>{form.country}</option>}
            </select>
          </Labeled>
          <Labeled id="pk-region" label="Region (optional)" hint="Region name, e.g. England, California">
            <input id="pk-region" className={inputClass} value={form.region || ""} onChange={set("region")} />
          </Labeled>
          <Labeled id="pk-from" label="Effective from"><input id="pk-from" type="date" className={inputClass} value={form.effective_from || ""} onChange={set("effective_from")} /></Labeled>
          <Labeled id="pk-to" label="Effective to"><input id="pk-to" type="date" className={inputClass} value={form.effective_to || ""} onChange={set("effective_to")} /></Labeled>
        </div>

        <RetentionRulesEditor rows={rules} onChange={setRules} />
        {rulesInvalid && <p className="text-xs text-red-700" role="alert">Each retention rule needs a number of years (0 or more).</p>}

        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-gray-600">Legal sources</legend>
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Labeled id={`pks-t-${i}`} label="Title"><input id={`pks-t-${i}`} className={inputClass} value={s.title}
                  onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Labeled>
                <Labeled id={`pks-u-${i}`} label="URL"><input id={`pks-u-${i}`} type="url" className={inputClass} value={s.url}
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

        <Labeled id="pk-notes" label="Notes">
          <textarea id="pk-notes" rows={3} className={inputClass} value={form.notes || ""} onChange={set("notes")} />
        </Labeled>
      </div>
    </Modal>
  );
}
