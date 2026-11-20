// ESS "Time requests": ask for overtime (before the work, or record it afterwards) and correct a day: a missed punch,
// wrong times, a wrong status or wrong breaks (attendance plan M4).
// Your manager or HR decides; you receive the decision record. A correction changes your attendance only once approved,
// and the original times are kept.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, Loader2, Send } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import CorrectionForm, { KIND_LABEL } from "../../../../modules/zoiko-hr/attendance/components/CorrectionForm";
import { listCorrections, listOvertime, requestOvertime } from "../../../../service/workDocumentsService";
import { formatDate } from "../../../../utils/dateTime";

const STATUS = { PENDING: "Waiting for a decision", APPROVED: "Approved", REJECTED: "Refused" };
const input = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function EmployeeTimeRequests() {
  const [overtime, setOvertime] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [ot, setOt] = useState({ date: "", start_time: "", end_time: "", reason: "", emergency: false });
  // ?date=YYYY-MM-DD (from a day in My Attendance) prefills the correction form
  const [params] = useSearchParams();
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    listOvertime().then((r) => setOvertime(r?.items || [])).catch(() => setOvertime([]));
    listCorrections().then((r) => setCorrections(r?.items || [])).catch(() => setCorrections([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (fn, body, ok) => {
    setBusy(true); setNotice(null);
    try { await fn(body); setNotice({ ok: true, text: ok }); load(); }
    catch (e) { setNotice({ ok: false, text: e?.message || "The request could not be sent." }); }
    finally { setBusy(false); }
  };

  return (
    <EmployeePageShell title="Time requests" subtitle="Overtime and attendance corrections, and the decisions on them.">
      {notice && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Request overtime">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Clock size={18} aria-hidden="true" /> Overtime</h2>
          <p className="mb-2 text-xs text-slate-500">Ask before you work overtime unless it is an emergency. A request for a past date is recorded as retrospective.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Date<input type="date" value={ot.date} onChange={(e) => setOt({ ...ot, date: e.target.value })} className={input} /></label>
            <label className="text-sm">From<input type="time" value={ot.start_time} onChange={(e) => setOt({ ...ot, start_time: e.target.value })} className={input} /></label>
            <label className="text-sm">To<input type="time" value={ot.end_time} onChange={(e) => setOt({ ...ot, end_time: e.target.value })} className={input} /></label>
          </div>
          <label className="mt-2 block text-sm">Reason<input value={ot.reason} onChange={(e) => setOt({ ...ot, reason: e.target.value })} className={input} /></label>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={ot.emergency} onChange={(e) => setOt({ ...ot, emergency: e.target.checked })} className="accent-blue-600" /> This was an emergency</label>
          <button type="button" disabled={busy || !ot.date || !ot.start_time || !ot.end_time || ot.reason.trim().length < 3}
            onClick={() => send(requestOvertime, ot, "Overtime request sent to your manager.")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} Send request</button>
          <ul className="mt-4 divide-y divide-slate-100 text-sm" aria-label="My overtime requests">
            {overtime.map((o) => <li key={o.id} className="py-1.5">{formatDate(o.date)} · {o.start_time}–{o.end_time} · {STATUS[o.status] || o.status}{o.decision_reason ? ` · ${o.decision_reason}` : ""}</li>)}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Correct attendance">
          <h2 className="mb-2 text-base font-semibold">Attendance correction</h2>
          <p className="mb-2 text-xs text-slate-500">Missed a punch, or the times, status or breaks are wrong? Your manager or HR decides; the
            day changes only once it is approved and the original times are kept.</p>
          <CorrectionForm key={formKey} initial={{ date: params.get("date") || "" }}
            onSubmitted={() => { setNotice({ ok: true, text: "Correction sent. Your record changes only if it is approved." }); setFormKey((k) => k + 1); load(); }} />
          <ul className="mt-4 divide-y divide-slate-100 text-sm" aria-label="My corrections">
            {corrections.map((c) => <li key={c.id} className="py-1.5">{formatDate(c.date)} · {KIND_LABEL[c.kind] || "Correction"} · {STATUS[c.status] || c.status}{c.decision_reason ? ` · ${c.decision_reason}` : ""}</li>)}
          </ul>
        </section>
      </div>
    </EmployeePageShell>
  );
}
