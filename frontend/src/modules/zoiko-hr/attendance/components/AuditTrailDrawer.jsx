import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useAttendanceRecordAudit } from "../hooks/useAttendanceAdmin";
import { formatDateTime } from "../../../../utils/dateTime";

const ACTION = {
  punch_in: "Punched in", punch_out: "Punched out", break_start: "Break started", break_end: "Break ended", created: "Record added",
  updated: "Record changed", deleted: "Record removed", auto_marked: "Marked automatically", corrected: "Correction approved",
  recomputed: "Recalculated", merged: "Duplicate merged",
};
const FIELD = {
  status: "Status", check_in: "Check-in", check_out: "Check-out", check_in_at: "Check-in (UTC)", check_out_at: "Check-out (UTC)",
  worked_minutes: "Worked (min)", break_minutes: "Breaks (min)", late_minutes: "Late (min)", overtime_minutes: "Beyond standard (min)",
  source: "Source", shift_id: "Shift", status_locked: "Status set by HR", notes: "Notes", is_deleted: "Removed",
};
const SKIP = new Set(["check_in_at", "check_out_at"]);       // the local times say the same thing in a readable way
const show = (v) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" && v.includes("T") ? v.replace("T", " ").slice(0, 16) : String(v));

/** Who changed an attendance record, when, what (before → after) and why. */
export default function AuditTrailDrawer({ record, onClose }) {
  const query = useAttendanceRecordAudit(record?.id);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const items = query.data?.items || [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`History of ${record?.employee_name || "record"} on ${record?.date}`}
        onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-lg overflow-auto bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">History · {record?.employee_name} · {record?.date}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        {query.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {query.isError && <p role="alert" className="text-sm text-rose-700">{query.error?.message || "The history could not be loaded."}</p>}
        {!query.isLoading && !items.length && !query.isError && <p className="text-sm text-slate-500">No changes recorded yet.</p>}
        <ol className="space-y-3 text-sm" aria-label="Changes">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold">{ACTION[it.action] || it.action}</p>
              <p className="text-xs text-slate-500">{formatDateTime(it.at)} · {it.actor_type === "system" ? "Automatic" : it.actor_name || "Unknown"}</p>
              {it.reason && <p className="mt-1 text-slate-700">“{it.reason}”</p>}
              {it.after && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {Object.keys(it.after).filter((k) => !SKIP.has(k) && FIELD[k] && (it.before ? it.before[k] !== it.after[k] : it.after[k] !== null)).map((k) => (
                    <li key={k}>{FIELD[k]}: {it.before ? <><span className="text-slate-500 line-through">{show(it.before[k])}</span> → </> : null}<strong>{show(it.after[k])}</strong></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
