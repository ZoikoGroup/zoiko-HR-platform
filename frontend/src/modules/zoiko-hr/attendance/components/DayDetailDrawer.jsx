import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import CorrectionForm from "./CorrectionForm";
import AttendanceStatusChip from "./AttendanceStatusChip";
import { dayOffset, formatMinutes, SOURCE_LABEL, timeIn, timeIn24 } from "../constants";
import NextDayHint from "./NextDayHint";
import { useMyAttendanceDay } from "../hooks/useMyAttendance";
import { formatDate } from "../../../../utils/dateTime";

const ACTION_LABEL = {
  punch_in: "Punched in", punch_out: "Punched out", break_start: "Break started", break_end: "Break ended",
  created: "Record created", updated: "Record changed", deleted: "Record removed", auto_marked: "Marked automatically",
  corrected: "Correction applied", recomputed: "Recalculated", merged: "Duplicate removed",
};

/** One day's punches, breaks, totals and history, and a correction request for that day. Esc or the backdrop closes it. */
export default function DayDetailDrawer({ date, onClose }) {
  const query = useMyAttendanceDay(date);
  const qc = useQueryClient();
  const [correcting, setCorrecting] = useState(false);
  const [sent, setSent] = useState(false);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);
  const d = query.data;
  const tz = d?.timezone;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Attendance on ${formatDate(date)}`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{formatDate(date)}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        {query.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {query.isError && <p role="alert" className="text-sm text-rose-700">{query.error?.message || "This day could not be loaded."}</p>}
        {d && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2"><AttendanceStatusChip status={d.status} />{d.source && <span className="text-xs text-slate-500">via {SOURCE_LABEL[d.source] || d.source}</span>}</div>
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-slate-500">Punched in</dt><dd className="font-mono">{timeIn(d.check_in_at, tz)}</dd>
              <dt className="text-slate-500">Punched out</dt>
              <dd className="font-mono">{timeIn(d.check_out_at, tz)}{dayOffset(d.check_out_at, d.date, tz) > 0 && <NextDayHint />}</dd>
              <dt className="text-slate-500">Worked (net)</dt><dd className="font-mono">{formatMinutes(d.worked_minutes)}</dd>
              <dt className="text-slate-500">Breaks</dt><dd className="font-mono">{formatMinutes(d.break_minutes)}</dd>
              {d.late_minutes > 0 && (<><dt className="text-slate-500">Late by</dt><dd className="font-mono">{d.late_minutes} min</dd></>)}
              {d.overtime_minutes > 0 && (<><dt className="text-slate-500">Beyond the standard day</dt><dd className="font-mono">{formatMinutes(d.overtime_minutes)}</dd></>)}
            </dl>
            {d.breaks?.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Breaks</h3>
                <ul className="space-y-1">{d.breaks.map((b, i) => <li key={i} className="font-mono">{timeIn(b.start_at, tz)} – {b.end_at ? timeIn(b.end_at, tz) : "running"}</li>)}</ul>
              </div>
            )}
            {d.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-2 text-slate-700">{d.notes}</p>}
            {d.history?.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">History</h3>
                <ol className="space-y-1 text-xs">
                  {d.history.map((h, i) => (
                    <li key={i}><span className="font-mono">{timeIn(h.at, tz)}</span> · {ACTION_LABEL[h.action] || h.action}
                      {h.actor_type === "system" ? " (automatic)" : h.by_self ? "" : " (by HR)"}{h.reason ? ` — ${h.reason}` : ""}</li>
                  ))}
                </ol>
              </div>
            )}
            {sent ? (
              <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">
                Correction sent to your manager. This day changes only if it is approved; you can follow it in Time Requests.
              </p>
            ) : correcting ? (
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">Request a correction</h3>
                <CorrectionForm dateEditable={false}
                  hasRecord={Boolean(d.record_id)}
                  initial={{ date, check_in: timeIn24(d.check_in_at, tz), check_out: timeIn24(d.check_out_at, tz),
                             kind: !d.check_in_at || !d.check_out_at ? "missed_punch" : "time_change" }}
                  onSubmitted={() => { setSent(true); setCorrecting(false); qc.invalidateQueries({ queryKey: ["attendance", "me"] }); }} />
              </div>
            ) : (
              <button type="button" onClick={() => setCorrecting(true)} className="inline-flex rounded-xl border border-slate-200 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50">
                Something wrong? Request a correction
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
