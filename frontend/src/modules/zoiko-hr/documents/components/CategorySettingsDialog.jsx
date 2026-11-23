import { useEffect, useId, useRef, useState } from "react";
import { Lock, Share2, X } from "lucide-react";
import AccessBadge from "./AccessBadge";

const NAME_MAX = 120;
const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/**
 * Settings of one company category (any category: built-in or custom). Only the fields that changed are sent.
 * Built-in categories can be renamed and hidden, never deleted; that is said here so nobody looks for a Delete button.
 * "Who can see" opens the existing Share dialog (the category's default for every folder and file inside).
 *
 * @param {{ open: boolean, category: object|null, onSave: (changes: object) => Promise<any>, onWhoCanSee: () => void, onClose: () => void }} props
 */
export default function CategorySettingsDialog({ open, category, onSave, onWhoCanSee, onClose }) {
  const id = useId();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !category) return undefined;
    setForm({
      name: category.name || "",
      requires_approval: Boolean(category.requires_approval),
      default_require_ack: Boolean(category.default_require_ack),
      ack_reminder_after_days: category.ack_reminder_after_days ?? "",
      reack_interval_months: category.reack_interval_months ?? "",
      auto_unpublish_on_expiry: Boolean(category.auto_unpublish_on_expiry),
    });
    setErrors({}); setServerError(null); setBusy(false);
    setTimeout(() => first.current?.focus(), 0);
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, category]);

  if (!open || !category || !form) return null;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    const name = form.name.split(/\s+/).filter(Boolean).join(" ");
    if (!name) found.name = "Give the category a name.";
    else if (name.length > NAME_MAX) found.name = `A category name can be at most ${NAME_MAX} characters.`;
    for (const k of ["ack_reminder_after_days", "reack_interval_months"]) {
      const v = toNum(form[k]);
      if (v !== null && (!Number.isInteger(v) || v < 1)) found[k] = "Use a whole number of at least 1, or leave it empty.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    const next = { ...form, name, ack_reminder_after_days: toNum(form.ack_reminder_after_days), reack_interval_months: toNum(form.reack_interval_months) };
    const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => (category[k] ?? (typeof v === "boolean" ? false : null)) !== v));
    if (!Object.keys(changes).length) { onClose(); return; }
    setBusy(true);
    setServerError(null);
    try {
      await onSave(changes);
      onClose();
    } catch (err) {
      if (err?.field === "name" || /already exists/i.test(err?.message || "")) setErrors({ name: err.message });
      else setServerError(err?.message || "The settings were not saved.");
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]";
  const check = (k, label, hint) => (
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5" />
      <span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
  const number = (k, label, unit) => (
    <div className="mt-3">
      <label htmlFor={`${id}-${k}`} className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input id={`${id}-${k}`} type="number" min={1} step={1} inputMode="numeric" value={form[k]} onChange={(e) => set(k, e.target.value)}
          aria-invalid={Boolean(errors[k])} className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
        <span className="text-sm text-slate-500">{unit} (leave empty for never)</span>
      </div>
      {errors[k] && <p role="alert" className="mt-1 text-xs text-rose-700">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={`Settings for ${category.name}`} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Settings for {category.name}</h2>
            <p className="text-xs text-slate-500">
              {category.is_system ? "Built-in category: it can be renamed and hidden, but not deleted." : "Custom category: it can be deleted once it is empty."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {category.locked_by_org_admin && (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <Lock size={14} aria-hidden="true" /> Locked by the Organization Admin. Only they can change it.
            </p>
          )}
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-slate-700 dark:text-slate-200">Name</label>
          <input id={`${id}-name`} ref={first} value={form.name} maxLength={NAME_MAX + 10} onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(errors.name)} className={field} />
          {errors.name && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.name}</p>}

          <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-[#334155]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Who can see it</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <AccessBadge access={category.access} />
              <button type="button" onClick={onWhoCanSee}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Share2 size={14} aria-hidden="true" /> Change who can see
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">The default for every folder and file in this category, unless one is shared differently.</p>
          </div>

          {check("requires_approval", "New files need approval before employees see them", "Another approver checks each upload in Approval Workflow.")}
          {check("default_require_ack", "Ask people to confirm “I have read this” by default", "Pre-ticks the read-confirmation box when uploading.")}
          {number("ack_reminder_after_days", "Remind people who have not confirmed after", "days")}
          {number("reack_interval_months", "Ask everyone to confirm again every", "months")}
          {check("auto_unpublish_on_expiry", "Unpublish files automatically when they expire")}
          {serverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{serverError}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
