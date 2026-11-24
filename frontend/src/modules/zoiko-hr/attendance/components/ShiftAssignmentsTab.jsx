import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { getDepartments, getShifts } from "../../../../service/hrService";
import { assignShift, endShiftAssignment, listShiftAssignments } from "../../../../service/attendanceService";
import { formatClockTime } from "../constants";
import { formatDate } from "../../../../utils/dateTime";
import { EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, inputCls } from "../../documents/generated/docUi";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data || []);
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Shifts & Work Policy → Assignments: give people (or a whole department) a shift from a date, optionally until a date;
 * see who works which shift on a day; end an assignment. A running assignment ends the day before a new one starts
 * (the server keeps the rest of it after a dated one), and each person is notified.
 */
export default function ShiftAssignmentsTab({ onToast }) {
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ shift_id: "", effective_from: "", effective_to: "", employees: {}, department_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [on, setOn] = useState(todayIso());
  const [list, setList] = useState({ items: [], total: 0 });
  const [listError, setListError] = useState(null);
  const [ending, setEnding] = useState(null);                   // {id, date}
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    getShifts().then((r) => setShifts(asList(r).filter((s) => s.is_active !== false))).catch(() => setShifts([]));
    getDepartments().then((r) => setDepartments(asList(r?.data ?? r))).catch(() => setDepartments([]));
  }, []);
  const load = useCallback(() => {
    setListError(null);
    listShiftAssignments({ active_on: on || undefined, per_page: 200 }).then(setList)
      .catch((e) => setListError(e?.message || "Assignments could not be loaded."));
  }, [on]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const ids = Object.keys(form.employees).map(Number);
    if (!form.shift_id || !form.effective_from || (!ids.length && !form.department_id)) {
      setError("Choose a shift, a start date, and people or a department."); return;
    }
    if (form.effective_to && form.effective_to < form.effective_from) { setError("The end date is before the start date."); return; }
    setBusy(true); setError(null);
    try {
      const r = await assignShift({ shift_id: Number(form.shift_id), effective_from: form.effective_from, effective_to: form.effective_to || null,
        employee_ids: ids, department_id: form.department_id ? Number(form.department_id) : null });
      onToast("success", `Shift assigned to ${r.count} ${r.count === 1 ? "person" : "people"}; they have been notified.`);
      setForm((f) => ({ ...f, employees: {}, department_id: "" }));
      load();
    } catch (err) { setError(err?.message || "The shift was not assigned."); }
    finally { setBusy(false); }
  };

  const end = async () => {
    try {
      await endShiftAssignment({ id: ending.id, effective_to: ending.date });
      onToast("success", "The assignment ends on that date; the person has been notified.");
      setEnding(null); load();
    } catch (err) { onToast("error", err?.message || "The assignment was not changed."); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <form onSubmit={submit} aria-label="Assign a shift" noValidate className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2 dark:border-[#334155] dark:bg-[#1e293b]">
        <h2 className="flex items-center gap-2 text-base font-semibold"><UserPlus size={18} aria-hidden="true" /> Assign a shift</h2>
        <ErrorBanner error={error} />
        <label className="block text-sm">Shift<select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={inputCls}>
          <option value="">Choose…</option>
          {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatClockTime(s.start_time)} – {formatClockTime(s.end_time)})</option>)}
        </select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">From<input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} className={inputCls} /></label>
          <label className="text-sm">Until (optional)<input type="date" value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} className={inputCls} /></label>
        </div>
        <label className="block text-sm">Whole department (optional)<select value={form.department_id} onChange={(e) => set("department_id", e.target.value)} className={inputCls}>
          <option value="">No department</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
        <div className="text-sm"><span className="font-medium">People</span>
          <EmployeePicker value={form.employees} onChange={(v) => set("employees", v)} idPrefix="assign-emp" max={500} /></div>
        <p className="text-xs text-slate-500">A shift they already have ends the day before; a later dated assignment is never overwritten.</p>
        <PrimaryButton type="submit" loading={busy}>Assign shift</PrimaryButton>
      </form>

      <section aria-label="Who works which shift" className="rounded-2xl border border-slate-200 bg-white xl:col-span-3 dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4 dark:border-[#334155]">
          <h2 className="text-base font-semibold">Who works which shift</h2>
          <label className="text-xs font-medium text-slate-600">On
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label>
        </div>
        <ErrorBanner error={listError} className="m-4" />
        {list.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Nobody has an assigned shift on {on ? formatDate(on) : "that day"}. People without one use the default shift, if set.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[#334155]">
            {list.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-[10rem] flex-1 font-medium">{a.employee.name}</span>
                <span className="text-slate-700">{a.shift.name} <span className="font-mono text-xs text-slate-500">{formatClockTime(a.shift.start)} – {formatClockTime(a.shift.end)}</span></span>
                <span className="text-xs text-slate-500">{formatDate(a.effective_from)} → {a.effective_to ? formatDate(a.effective_to) : "ongoing"}</span>
                {ending?.id === a.id ? (
                  <span className="flex items-center gap-2">
                    <label className="text-xs">Last day<input type="date" value={ending.date} min={a.effective_from} max={a.effective_to || undefined}
                      onChange={(e) => setEnding({ ...ending, date: e.target.value })} className="ml-1 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <SecondaryButton onClick={end} disabled={!ending.date}>Confirm</SecondaryButton>
                    <button type="button" onClick={() => setEnding(null)} className="text-xs underline">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setEnding({ id: a.id, date: on || a.effective_from })} aria-label={`End ${a.employee.name}'s ${a.shift.name} assignment`}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50">End</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
