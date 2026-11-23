/* My Exit → Resign: submit a resignation, then see what was submitted, its decision, and withdraw it. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info, Send, Undo2 } from "lucide-react";
import ConfirmDialog from "../../../../../modules/zoiko-hr/documents/components/ConfirmDialog";
import { errorMessage, submitResignation, withdrawResignation } from "../../../../../service/offboardingService";
import { formatDate } from "../../../../../utils/dateTime";
import MyExitLayout, { StatusBadge, useMyExit } from "./MyExitLayout";

const field = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const MAX_REASON = 2000;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function ResignForm({ data, onDone }) {
  const [form, setForm] = useState({ reason_category: "", reason: "", requested_last_day: "" });
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const notice = data.notice || {};
  const early = form.requested_last_day && notice.end_date && form.requested_last_day < notice.end_date;

  const check = () => {
    const e = {};
    if (!form.reason_category) e.reason_category = "Choose the main reason.";
    if (!form.reason.trim()) e.reason = "Tell us briefly why you are resigning.";
    else if (form.reason.length > MAX_REASON) e.reason = `Use at most ${MAX_REASON} characters.`;
    if (form.requested_last_day && form.requested_last_day < todayIso()) e.requested_last_day = "Your last day cannot be in the past.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <section aria-labelledby="resign-heading" className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 id="resign-heading" className="text-lg font-semibold text-slate-900">Resign</h2>
      <p className="mt-1 text-sm text-slate-600">Your manager or HR reviews your resignation. You can withdraw it until they decide.</p>
      <div className="mt-4 flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        <Info size={18} className="shrink-0" aria-hidden="true" />
        <p>Your notice period is <strong>{notice.label || "not set"}</strong>; your earliest last day under it is{" "}
          <strong>{formatDate(notice.end_date)}</strong>.</p>
      </div>
      <form noValidate className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); if (check()) setConfirming(true); }}>
        <div>
          <label htmlFor="resign-category" className="block text-sm font-medium text-slate-700">Main reason</label>
          <select id="resign-category" value={form.reason_category} onChange={(e) => setForm({ ...form, reason_category: e.target.value })}
            aria-invalid={Boolean(errors.reason_category)} aria-describedby={errors.reason_category ? "err-cat" : undefined} className={field}>
            <option value="">Choose…</option>
            {(data.reason_categories || []).filter((c) => !["performance", "conduct", "contract_end"].includes(c.key))
              .map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {errors.reason_category && <span id="err-cat" role="alert" className="mt-1 block text-xs text-red-700">{errors.reason_category}</span>}
        </div>
        <div>
          <label htmlFor="resign-reason" className="block text-sm font-medium text-slate-700">Your reason</label>
          <textarea id="resign-reason" rows={5} value={form.reason} maxLength={MAX_REASON} onChange={(e) => setForm({ ...form, reason: e.target.value })}
            aria-invalid={Boolean(errors.reason)} aria-describedby="reason-count" className={field} />
          <span id="reason-count" className="mt-1 block text-right text-xs text-slate-500">{form.reason.length}/{MAX_REASON}</span>
          {errors.reason && <span role="alert" className="block text-xs text-red-700">{errors.reason}</span>}
        </div>
        <label className="block text-sm font-medium text-slate-700">Intended last working day (optional)
          <input type="date" min={todayIso()} value={form.requested_last_day}
            onChange={(e) => setForm({ ...form, requested_last_day: e.target.value })}
            aria-invalid={Boolean(errors.requested_last_day)} className={`${field} sm:w-60`} />
          <span className="mt-1 block text-xs text-slate-500">Leave empty to finish your full notice period.</span>
          {errors.requested_last_day && <span role="alert" className="block text-xs text-red-700">{errors.requested_last_day}</span>}
        </label>
        {early && (
          <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
            This is earlier than the end of your notice period. HR decides whether an earlier day is possible.
          </p>
        )}
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Send size={16} aria-hidden="true" /> Submit resignation
        </button>
      </form>
      <ConfirmDialog open={confirming} title="Submit your resignation?" confirmLabel="Submit resignation" onClose={() => setConfirming(false)}
        message="Your manager and HR are told straight away. You can withdraw it until they decide."
        onConfirm={async () => {
          await submitResignation({ reason_category: form.reason_category, reason: form.reason.trim(),
            requested_last_day: form.requested_last_day || null });
          setConfirming(false);
          onDone();
        }} />
    </section>
  );
}

function Submitted({ data, onChanged }) {
  const c = data.case;
  const s = data.summary || {};
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(null);
  const afterApproval = c.status === "approved";
  return (
    <section aria-labelledby="sub-heading" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sub-heading" className="text-lg font-semibold text-slate-900">Your resignation</h2>
        <StatusBadge status={c.display_status} />
      </div>
      {note && <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{note}</p>}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Submitted on</dt><dd className="font-medium">{formatDate(c.resignation_date)}</dd></div>
        <div><dt className="text-slate-500">Reference</dt><dd className="font-medium">{c.case_number}</dd></div>
        <div><dt className="text-slate-500">Main reason</dt><dd className="font-medium">
          {(data.reason_categories || []).find((r) => r.key === c.reason_category)?.label || "—"}</dd></div>
        <div><dt className="text-slate-500">Last working day</dt><dd className="font-medium">{formatDate(c.last_working_day)}</dd></div>
        {c.requested_last_day && <div><dt className="text-slate-500">You asked for</dt><dd className="font-medium">{formatDate(c.requested_last_day)}</dd></div>}
        <div className="sm:col-span-2"><dt className="text-slate-500">Your reason</dt><dd className="whitespace-pre-wrap">{c.reason}</dd></div>
      </dl>
      {c.status === "rejected" && c.decision_note && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>Why it was not accepted:</strong> {c.decision_note}</p>
      )}
      {c.withdrawal_requested_at && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">You asked to withdraw this resignation. HR will decide.</p>
      )}
      {s.can_withdraw && (
        <button type="button" onClick={() => { setReason(""); setOpen(true); }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Undo2 size={16} aria-hidden="true" /> {afterApproval ? "Request withdrawal" : "Withdraw resignation"}
        </button>
      )}
      <ConfirmDialog open={open} title={afterApproval ? "Ask HR to withdraw your resignation?" : "Withdraw your resignation?"}
        confirmLabel={afterApproval ? "Send request" : "Withdraw"} onClose={() => setOpen(false)}
        message={(
          <label className="block text-sm">
            {afterApproval ? "It is already accepted, so HR decides. Tell them why." : "Reason (optional)"}
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for withdrawing" className={field} />
          </label>
        )}
        onConfirm={async () => {
          if (afterApproval && !reason.trim()) throw new Error("Tell HR why you want to withdraw.");
          await withdrawResignation(reason.trim());
          setOpen(false);
          setNote(afterApproval ? "Your request was sent to HR." : "Your resignation is withdrawn.");
          onChanged();
        }} />
    </section>
  );
}

function ResignTab() {
  const { data, reload } = useMyExit();
  const navigate = useNavigate();
  const c = data.case;
  if (c && c.exit_type !== "resignation") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Your exit was started by HR</h2>
        <p className="mt-2">Type of exit: <strong>{c.exit_type_label}</strong>. You do not need to resign. See Exit Status for your last working day and what happens next.</p>
      </section>
    );
  }
  const finished = c && ["rejected", "withdrawn", "cancelled", "closed"].includes(c.status);
  return (
    <div className="space-y-4">
      {c && <Submitted data={data} onChanged={reload} />}
      {(!c || finished) && data.can_resign && (
        <ResignForm data={data} onDone={async () => { await reload(); navigate("/employee/ess/exit/status"); }} />
      )}
      {!c && !data.can_resign && (
        <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm"><CheckCircle2 size={16} aria-hidden="true" /> Nothing to do here.</p>
      )}
    </div>
  );
}

export default function Resign() {
  return <MyExitLayout tab="resign"><ResignTab /></MyExitLayout>;
}
