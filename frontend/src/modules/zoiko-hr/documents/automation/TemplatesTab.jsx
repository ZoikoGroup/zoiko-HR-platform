import { useEffect, useRef, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import SectionState from "../components/SectionState";
import {
  useNotificationTemplates, usePreviewNotificationTemplate, useRevertNotificationTemplate, useSaveNotificationTemplate,
} from "../hooks/useAutomation";

const CHANNELS = [["email", "Email"], ["in_app", "In-app"]];
const nice = (key) => key.replace(/^document\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Templates tab (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): the organization's own wording for each document notification, per
 * channel. Plain text with {{placeholders}} from a fixed list; "Use default" goes back to the platform wording.
 */
export default function TemplatesTab() {
  const query = useNotificationTemplates();
  const [editing, setEditing] = useState(null);
  return (
    <>
      <SectionState query={query} label="Loading notifications" isEmpty={(d) => !d?.items?.length} empty={{ title: "No notifications" }}>
        {(data) => (
          <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Notification</th>{CHANNELS.map(([c, l]) => <th key={c} className="px-4 py-3">{l}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((t) => (
                  <tr key={t.key}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">{nice(t.key)}</p>
                      <p className="text-xs text-slate-500">{t.default_subject}</p>
                    </td>
                    {CHANNELS.map(([c, l]) => {
                      const o = t.overrides?.[c];
                      return (
                        <td key={c} className="px-4 py-3">
                          <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${o ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-600"}`}>{o ? "Custom" : "Default"}</span>
                          <button type="button" aria-label={`Edit ${l.toLowerCase()} wording for ${nice(t.key)}`}
                            onClick={() => setEditing({ key: t.key, channel: c, label: `${nice(t.key)} · ${l}`, custom: Boolean(o),
                              subject: o?.subject ?? t.default_subject, body: o?.body ?? t.default_body })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                            <Pencil size={12} aria-hidden="true" /> Edit
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionState>
      {editing && <TemplateEditor template={editing} variables={query.data?.variables || {}} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateEditor({ template, variables, onClose }) {
  const [subject, setSubject] = useState(template.subject || "");
  const [body, setBody] = useState(template.body || "");
  const [error, setError] = useState(null);
  const save = useSaveNotificationTemplate();
  const revert = useRevertNotificationTemplate();
  const preview = usePreviewNotificationTemplate();
  const bodyRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const ids = { key: template.key, channel: template.channel };
  const run = async (fn) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e?.message || "That didn't work."); }
  };
  const insert = (name) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    if (!el || typeof el.selectionStart !== "number") { setBody((v) => v + token); return; }
    const a = el.selectionStart;
    const b = el.selectionEnd;
    setBody((v) => v.slice(0, a) + token + v.slice(b));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Wording: ${template.label}`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{template.label}</h2>
          <button type="button" onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium">{template.channel === "email" ? "Subject and heading" : "Heading"}
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm font-medium">Message
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insert</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(variables).map(([name, help]) => (
                <button key={name} type="button" title={help} onClick={() => insert(name)}
                  className="rounded-md border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-slate-50">{`{{${name}}}`}</button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          {preview.data && (
            <div role="status" aria-label="Preview" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              {preview.data.subject && <p className="font-semibold">{preview.data.subject}</p>}
              <p className="whitespace-pre-line">{preview.data.body}</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button type="button" disabled={!template.custom || revert.isPending}
              onClick={() => run(async () => { await revert.mutateAsync(ids); onClose(); })}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50">
              <RotateCcw size={14} aria-hidden="true" /> Use default
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => run(() => preview.mutateAsync({ ...ids, subject, body }))}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium">Preview</button>
              <button type="button" disabled={!body.trim() || save.isPending}
                onClick={() => run(async () => { await save.mutateAsync({ ...ids, subject, body }); onClose(); })}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Save</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
