import { useEffect, useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import { blockedText } from "../../../../components/documents/RecordDocumentsPanel";
import { changeShifts, publishRoster } from "../../../../service/workDocumentsService";
import { getShifts } from "../../../../service/hrService";
import { formatClockTime } from "../constants";
import { EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, inputCls } from "../../documents/generated/docUi";

/**
 * Shifts & Work Policy → Roster & notices (moved here from Working time requests, My Attendance plan step 6):
 * publish a shift pattern for people over a period, or change someone's shifts on given dates. Both send the shift
 * notice document (when the organization has the HR-TIM templates) and an in-app notification.
 */
export default function RosterTools({ onToast }) {
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState({ shift_id: "", employees: {}, start_date: "", end_date: "", weekdays: [0, 1, 2, 3, 4], location: "" });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [change, setChange] = useState({ employees: {}, new_shift_id: "", dates: "", reason: "", short_notice_reason: "" });
  useEffect(() => {
    getShifts().then((r) => setShifts(r?.items || r?.data || (Array.isArray(r) ? r : []))).catch(() => setShifts([]));
  }, []);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setPreview(null); };
  const body = () => ({ shift_id: Number(form.shift_id), employee_ids: Object.keys(form.employees).map(Number), start_date: form.start_date,
    end_date: form.end_date || null, weekdays: form.weekdays, location: form.location || null });

  const run = async (isPreview) => {
    if (!form.shift_id || !form.start_date || !Object.keys(form.employees).length) { setError("Choose a shift, a start date and at least one person."); return; }
    setBusy(true); setError(null);
    try {
      const r = await publishRoster({ ...body(), preview: isPreview });
      if (isPreview) setPreview(r);
      else { onToast("success", `Rostered and sent ${r.results.filter((x) => x.document_status === "ISSUED").length} shift notices.`); setPreview(null); }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const submitChange = async () => {
    const ids = Object.keys(change.employees).map(Number);
    const dates = change.dates.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 1 || !change.new_shift_id || !dates.length || !change.reason.trim()) { setError("Choose one person, the new shift, the dates and a reason."); return; }
    setBusy(true); setError(null);
    try {
      const r = await changeShifts({ employee_id: ids[0], new_shift_id: Number(change.new_shift_id), dates, reason: change.reason,
        short_notice_reason: change.short_notice_reason || null });
      onToast("success", r.needs_approval ? "Short notice: the change notice is waiting for an HR approver." : "Shifts changed and the notice was sent.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Publish a shift pattern">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><CalendarClock size={18} aria-hidden="true" /> Publish a shift pattern</h2>
        <ErrorBanner error={error} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Shift<select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={inputCls}>
            <option value="">Choose…</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatClockTime(s.start_time)}–{formatClockTime(s.end_time)})</option>)}</select></label>
          <label className="text-sm">Location<input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} /></label>
          <label className="text-sm">From<input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} /></label>
          <label className="text-sm">Until (optional)<input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputCls} /></label>
        </div>
        <fieldset className="mt-2 flex flex-wrap gap-2 text-sm"><legend className="sr-only">Days</legend>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={form.weekdays.includes(i)} className="accent-blue-600"
              onChange={(e) => set("weekdays", e.target.checked ? [...form.weekdays, i].sort() : form.weekdays.filter((x) => x !== i))} />{d}</label>
          ))}
        </fieldset>
        <div className="mt-2"><EmployeePicker value={form.employees} onChange={(v) => set("employees", v)} idPrefix="roster-emp" /></div>
        {preview && (
          <div role="status" className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            {preview.recipients} {preview.recipients === 1 ? "person" : "people"}; {preview.blocked ? `${preview.blocked} cannot receive a notice yet:` : "everyone can receive a notice."}
            <ul className="list-disc pl-5">{preview.results.filter((x) => x.outcome !== "ALLOW").map((x) => <li key={x.employee_id}>Employee #{x.employee_id}: {x.reasons.map(blockedText).join(" ")}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <SecondaryButton loading={busy} onClick={() => run(true)}>Preview</SecondaryButton>
          <PrimaryButton loading={busy} icon={Send} disabled={!preview} onClick={() => run(false)}>Roster and send notices</PrimaryButton>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Change shifts">
        <h2 className="mb-2 text-base font-semibold">Change someone's shifts</h2>
        <EmployeePicker value={change.employees} onChange={(v) => setChange((c) => ({ ...c, employees: v }))} idPrefix="change-emp" max={1} />
        <div className="mt-2 grid gap-2">
          <label className="text-sm">New shift<select value={change.new_shift_id} onChange={(e) => setChange((c) => ({ ...c, new_shift_id: e.target.value }))} className={inputCls}>
            <option value="">Choose…</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatClockTime(s.start_time)}–{formatClockTime(s.end_time)})</option>)}</select></label>
          <label className="text-sm">Dates (YYYY-MM-DD, comma separated)<input value={change.dates} onChange={(e) => setChange((c) => ({ ...c, dates: e.target.value }))} className={inputCls} /></label>
          <label className="text-sm">Reason<input value={change.reason} onChange={(e) => setChange((c) => ({ ...c, reason: e.target.value }))} className={inputCls} /></label>
          <label className="text-sm">Why the notice is short (needed when it is shorter than usual)<input value={change.short_notice_reason}
            onChange={(e) => setChange((c) => ({ ...c, short_notice_reason: e.target.value }))} className={inputCls} /></label>
        </div>
        <PrimaryButton className="mt-3" loading={busy} onClick={submitChange}>Change shifts and send notice</PrimaryButton>
      </section>
    </div>
  );
}
