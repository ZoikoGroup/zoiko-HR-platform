import { useEffect, useRef, useState } from "react";
import { Coffee, Loader2, LogIn, LogOut, Play } from "lucide-react";
import AttendanceStatusChip from "./AttendanceStatusChip";
import { formatMinutes, timeIn } from "../constants";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Punch In / Punch Out card (attendance plan §7): live clock in the person's time zone, today's status, a running timer
 * of net worked time (breaks excluded) and the break button. The server's totals are the base; the timer only adds
 * the seconds since they were fetched, so it never drifts from what is stored.
 */
export default function PunchCard({ today, busy, onPunchIn, onPunchOut, onStartBreak, onEndBreak, error }) {
  const now = useNow();
  const fetchedAt = useRef(Date.now());
  useEffect(() => { fetchedAt.current = Date.now(); }, [today]);
  const tz = today?.timezone;
  const elapsed = Math.max(0, Math.floor((now - fetchedAt.current) / 60000));   // never below the server total
  const ticking = today?.running && !today?.on_break;
  const worked = (today?.worked_minutes || 0) + (ticking ? elapsed : 0);
  const onBreakFor = today?.on_break ? (today.break_minutes || 0) + elapsed : today?.break_minutes || 0;
  let clock = "";
  try {
    clock = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: tz });
  } catch {
    clock = new Date(now).toLocaleTimeString("en-GB", { hour12: false });
  }

  let headline = "Not punched in yet";
  if (today?.running && today?.on_break) headline = `On a break · ${formatMinutes(onBreakFor)}`;
  else if (today?.running) headline = `Working · ${formatMinutes(worked)}`;
  else if (today?.check_out_at) headline = `Done for the day · ${formatMinutes(today.worked_minutes)}`;

  const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60";
  return (
    <section aria-label="Punch in and out" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Today{tz ? ` · ${tz}` : ""}</p>
          <p className="mt-1 font-mono text-4xl font-black tabular-nums text-slate-900 dark:text-white" aria-label="Current time">{clock}</p>
          <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{headline}</p>
        </div>
        <div className="text-right">
          <AttendanceStatusChip status={today?.status} />
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            <dt>Punched in</dt><dd className="font-mono text-slate-800 dark:text-slate-200">{timeIn(today?.check_in_at, tz)}</dd>
            <dt>Punched out</dt><dd className="font-mono text-slate-800 dark:text-slate-200">{timeIn(today?.check_out_at, tz)}</dd>
            <dt>Breaks</dt><dd className="font-mono text-slate-800 dark:text-slate-200">{formatMinutes(onBreakFor)}</dd>
            {today?.late_minutes > 0 && (<><dt>Late by</dt><dd className="font-mono text-amber-700">{today.late_minutes} min</dd></>)}
          </dl>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {today && !today.punch_enabled && !today.running && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Punching in from the browser is turned off for your organization. Ask HR.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {today?.can_punch_in && (
          <button type="button" onClick={onPunchIn} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500`}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />} Punch in
          </button>
        )}
        {today?.can_punch_out && (
          <button type="button" onClick={onPunchOut} disabled={busy} className={`${btn} bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500`}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />} Punch out
          </button>
        )}
        {today?.can_start_break && (
          <button type="button" onClick={onStartBreak} disabled={busy} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
            <Coffee size={16} aria-hidden="true" /> Start break
          </button>
        )}
        {today?.can_end_break && (
          <button type="button" onClick={onEndBreak} disabled={busy} className={`${btn} border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}>
            <Play size={16} aria-hidden="true" /> End break
          </button>
        )}
      </div>
    </section>
  );
}
