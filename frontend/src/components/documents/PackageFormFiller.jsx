/*
 * A "Complete and return" onboarding form (Self-Disclosure Declaration, Job Application Form) filled in on the new hire's
 * pre-onboarding page. The questions come from the server, built from the document itself: headings and notes to read,
 * yes/no choices, tables with a row per entry, text boxes, and the declaration signed by typing the full name.
 * "Save draft" keeps the answers; "Submit" sends the completed document to HR for review.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Save, Send } from "lucide-react";
import { getPortalPackageForm, savePortalPackageForm, submitPortalPackageForm } from "../../service/hrService";

const input = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

function FieldError({ msg }) {
  return msg ? <p role="alert" className="mt-1 inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" />{msg}</p> : null;
}

function Item({ item, value, onChange, error, disabled, idx }) {
  const id = `pf-${item.id || idx}`;
  switch (item.type) {
    case "heading": {
      const cls = item.level === 1 ? "text-base font-bold text-slate-900" : item.level === 2 ? "pt-2 text-sm font-bold text-slate-900" : "text-sm font-semibold text-slate-800";
      return <p className={cls}>{item.text}</p>;
    }
    case "info":
      return item.lines ? (
        item.list ? <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">{item.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          : <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-slate-700">{item.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      ) : <p className="whitespace-pre-line text-xs text-slate-600">{item.text}</p>;
    case "choice":
      return (
        <fieldset aria-invalid={!!error}>
          <legend className="text-sm font-medium text-slate-800">{item.label}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {item.options.map((o) => (
              <label key={o} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${value === o ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700"}`}>
                <input type="radio" name={id} value={o} checked={value === o} disabled={disabled} onChange={() => onChange(o)} className="text-blue-600" />
                {o}
              </label>
            ))}
          </div>
          <FieldError msg={error} />
        </fieldset>
      );
    case "text":
    case "answer":
      return (
        <div>
          <label htmlFor={id} className="text-sm font-medium text-slate-800">{item.label}</label>
          <textarea id={id} rows={item.rows || 3} className={`${input} mt-1`} placeholder={item.hint || ""} value={value || ""}
            disabled={disabled} maxLength={4000} onChange={(e) => onChange(e.target.value)} />
          <FieldError msg={error} />
        </div>
      );
    case "fields":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {item.rows.map((r, i) => (
            <div key={r.id || i}>
              <span className="block text-xs font-medium text-slate-600">{r.label}</span>
              {r.editable
                ? <input aria-label={r.label} className={`${input} mt-0.5`} placeholder={r.placeholder || ""} value={(value || {})[r.id] ?? ""}
                    disabled={disabled} maxLength={300} onChange={(e) => onChange({ ...(value || {}), [r.id]: e.target.value })} />
                : <span className="mt-0.5 block text-sm text-slate-900">{r.value || "—"}</span>}
            </div>
          ))}
        </div>
      );
    case "table": {
      const grid = Array.isArray(value) ? value : [];
      const set = (ri, ci, v) => onChange(item.rows.map((row, r) => row.map((_c, c) => (r === ri && c === ci ? v : (grid[r] || [])[c] ?? ""))));
      // Phones: each row is a small card with a label on every box. Wider screens: the rows line up as table columns
      // (from tablet width when there are many columns), with one header row.
      const wide = item.headers.length > 4;
      const vars = { "--cols": item.headers.length };
      const columns = wide ? "md:grid-cols-[repeat(var(--cols),minmax(0,1fr))] md:gap-1.5" : "sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))] sm:gap-1.5";
      const head = wide ? "hidden md:grid" : "hidden sm:grid";
      const card = wide ? "rounded-lg border border-slate-200 p-2.5 md:border-0 md:p-0" : "rounded-lg border border-slate-200 p-2.5 sm:border-0 sm:p-0";
      const onlyNarrow = wide ? "md:hidden" : "sm:hidden";
      const cellLabel = `mb-0.5 block text-[11px] font-medium text-slate-500 ${wide ? "md:sr-only" : "sm:sr-only"}`;
      return (
        <div className="space-y-2" role="group" aria-label={item.headers.join(", ")}>
          <div className={`${head} ${columns}`} style={vars} aria-hidden="true">
            {item.headers.map((h) => <span key={h} className="min-w-0 px-0.5 text-xs font-semibold text-slate-600">{h}</span>)}
          </div>
          {item.rows.map((row, ri) => (
            <div key={ri} className={card}>
              {item.rows.length > 1 && <p className={`mb-1.5 text-xs font-semibold text-slate-700 ${onlyNarrow}`}>Entry {ri + 1}</p>}
              <div className={`grid grid-cols-2 gap-2 ${columns}`} style={vars}>
                {row.map((cell, ci) => (
                  <label key={ci} className="block min-w-0">
                    <span className={cellLabel}>{item.headers[ci]}</span>
                    <input aria-label={`${item.headers[ci]}, row ${ri + 1}`} className={input} placeholder={cell.placeholder || ""}
                      value={(grid[ri] || [])[ci] ?? ""} disabled={disabled} maxLength={300} onChange={(e) => set(ri, ci, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "signature": {
      const sig = value || { name: "", confirmed: false };
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-sm font-semibold text-slate-800">Declaration and signature</p>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-blue-600" checked={!!sig.confirmed} disabled={disabled}
              onChange={(e) => onChange({ ...sig, confirmed: e.target.checked })} />
            <span>{item.statement}</span>
          </label>
          <label htmlFor={id} className="mt-2 block text-xs font-medium text-slate-600">Type your full name to sign{item.name ? ` (${item.name})` : ""}</label>
          <input id={id} className={`${input} mt-0.5 font-medium`} value={sig.name || ""} disabled={disabled} maxLength={200}
            autoComplete="name" onChange={(e) => onChange({ ...sig, name: e.target.value })} />
          <FieldError msg={error} />
        </div>
      );
    }
    default:
      return null;
  }
}

/** Fields rows store their answers flat ("b3.0"); the editor groups them under the item id. */
const toEditor = (items, answers) => {
  const out = { ...answers };
  items.filter((i) => i.type === "fields").forEach((i) => {
    out[i.id] = Object.fromEntries(i.rows.filter((r) => r.editable).map((r) => [r.id, answers[r.id] ?? ""]));
  });
  return out;
};
const fromEditor = (items, values) => {
  const out = {};
  items.forEach((i) => {
    if (!i.id) return;
    if (i.type === "fields") Object.assign(out, values[i.id] || {});
    else out[i.id] = values[i.id];
  });
  return out;
};

export default function PackageFormFiller({ token, category, onSubmitted, onClose }) {
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let live = true;
    getPortalPackageForm(token, category)
      .then((f) => { if (live) { setForm(f); setValues(toEditor(f.items, f.answers || {})); } })
      .catch((e) => live && setMessage({ tone: "error", text: e?.message || "The form could not be loaded." }));
    return () => { live = false; };
  }, [token, category]);

  if (!form) {
    return message ? <p role="alert" className="mt-3 text-xs text-rose-600">{message.text}</p>
      : <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading the form…</p>;
  }
  const disabled = !form.editable || !!busy;
  const set = (id, v) => {
    setValues((p) => ({ ...p, [id]: v }));
    setErrors((p) => { if (!p[id]) return p; const n = { ...p }; delete n[id]; return n; });
  };

  const save = async () => {
    setBusy("save"); setMessage(null);
    try {
      const f = await savePortalPackageForm(token, category, fromEditor(form.items, values));
      setForm(f);
      setMessage({ tone: "ok", text: "Draft saved. You can come back and finish it later." });
    } catch (e) {
      setMessage({ tone: "error", text: e?.message || "The draft could not be saved." });
    } finally { setBusy(""); }
  };

  const submit = async () => {
    setBusy("submit"); setMessage(null);
    try {
      const view = await submitPortalPackageForm(token, category, fromEditor(form.items, values));
      onSubmitted(view, `${form.title} submitted. HR will review it.`);
    } catch (e) {
      const errs = e?.detail?.errors || {};
      setErrors(errs);
      const n = Object.keys(errs).length;
      setMessage({ tone: "error", text: n ? `${n} answer${n === 1 ? " is" : "s are"} still needed – see the highlighted questions.` : (e?.message || "The form could not be submitted.") });
    } finally { setBusy(""); }
  };

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-blue-100 bg-white p-3 sm:p-4">
      {form.items.map((item, i) => (
        <Item key={item.id || `i${i}`} idx={i} item={item} value={values[item.id]} error={errors[item.id]} disabled={disabled}
          onChange={(v) => set(item.id, v)} />
      ))}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs ${message.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>
      )}
      {form.editable && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
          {onClose && <button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
          <button type="button" onClick={save} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />{busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={submit} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            <Send className="h-3.5 w-3.5" />{busy === "submit" ? "Submitting…" : "Submit to HR"}
          </button>
        </div>
      )}
    </div>
  );
}
