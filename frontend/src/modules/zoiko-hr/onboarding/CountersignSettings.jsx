/*
 * Onboarding › Settings › "Employer countersignature".
 * Who signs onboarding documents for the employer after the new hire has signed (documents whose rules say "The employer
 * countersigns"). Countersigners are the organisation's admins and HR admins; they sign from their documents list.
 */
import { useEffect, useState } from "react";
import { Loader2, PenLine, Plus, Trash2 } from "lucide-react";
import { SecondaryButton } from "../recruitment/ui";
import { addCountersigner, getCountersigners, removeCountersigner } from "../../../service/onboardingSetupService";
import { SettingsCard } from "./settingsUi";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function CountersignSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ employee_id: "", title: "" });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let live = true;
    getCountersigners().then((d) => live && setData(d))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "Countersigners could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setData(await addCountersigner({ employee_id: Number(form.employee_id), title: form.title.trim() }));
      setForm({ employee_id: "", title: "" });
      setMsg({ tone: "ok", text: "Countersigner added. Documents waiting for one can now be sent." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The countersigner could not be added." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Stop this person countersigning onboarding documents? Documents they already signed stay signed.")) return;
    setBusy(true);
    try {
      setData(await removeCountersigner(id));
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The countersigner could not be removed." });
    } finally {
      setBusy(false);
    }
  };

  const current = new Set((data?.signatories || []).map((s) => s.employee_id));
  const people = (data?.people || []).filter((p) => !current.has(p.id));

  return (
    <SettingsCard id="countersign" icon={PenLine} title="Employer countersignature"
      help="Who signs for the company after the new hire, on documents set to “The employer countersigns”. Until someone can, those documents are held.">
      {loading ? (
        <div className="flex items-center py-4 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : (
        <>
          {msg && (
            <div role={msg.tone === "error" ? "alert" : "status"}
              className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {msg.text}
            </div>
          )}
          {(data?.signatories || []).length === 0 ? (
            <p className="text-sm text-gray-500">Nobody countersigns yet. Only needed if a document's rules ask the employer to sign.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {data.signatories.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.name} <span className="font-normal text-gray-500">· {s.title}</span></p>
                    <p className="text-xs text-gray-500">Can sign: {s.covers.length ? s.covers.join(", ") : "your own documents"}</p>
                  </div>
                  <button type="button" onClick={() => remove(s.id)} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="cs-person" className="mb-1 block text-sm font-medium text-gray-700">Person</label>
              <select id="cs-person" className={inputCls} value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}>
                <option value="">Choose an admin or HR admin…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.job_title ? ` – ${p.job_title}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cs-title" className="mb-1 block text-sm font-medium text-gray-700">Title under their signature</label>
              <input id="cs-title" className={inputCls} maxLength={150} value={form.title} placeholder="e.g. HR Director"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <SecondaryButton icon={Plus} onClick={add} disabled={busy || !form.employee_id || !form.title.trim()}>Add</SecondaryButton>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
