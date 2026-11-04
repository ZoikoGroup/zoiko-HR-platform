// Leave decision tools for HR (Prompt 3 §B): refusing needs a reason (and may suggest other dates), family leave is
// confirmed by HR with dates and a pay summary, and every decided request shows its decision records. A sickness reason is
// special-category data: it is never shown in lists; HR can reveal it here, and that is audited.
import { useEffect, useState } from "react";
import { Baby, Eye, FileText, XCircle } from "lucide-react";
import { Modal } from "../../../components/billing-ui";
import RecordDocumentsPanel from "../../../components/documents/RecordDocumentsPanel";
import { confirmFamilyLeave, getLeaveDocuments, revealSensitiveLeaveReason, reviewLeave } from "../../../service/workDocumentsService";

const input = "mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
export const FAMILY_TYPES = ["maternity", "paternity"];

function Footer({ busy, onClose, onConfirm, label }) {
  return (
    <>
      <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
      <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">{label}</button>
    </>
  );
}

export function RefuseLeaveModal({ leave, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setReason(""); setAlternatives(""); setError(null); setBusy(false); }, [leave]);
  if (!leave) return null;
  const submit = async () => {
    if (!reason.trim()) { setError("Give the reason for refusing. The employee sees it in their decision notice."); return; }
    setBusy(true); setError(null);
    try {
      await reviewLeave(leave.id, { status: "rejected", decision_reason: reason.trim(), alternative_dates: alternatives.trim() || null });
      onDone("Request refused. The employee received a notice with your reason.");
    } catch (e) { setError(e.message || "Could not refuse the request."); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? undefined : onClose} icon={XCircle} title="Refuse leave request"
      description="Refusing does not affect any minimum leave entitlement the employee has under the law."
      footer={<Footer busy={busy} onClose={onClose} onConfirm={submit} label="Refuse request" />}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <label className="block text-sm font-medium text-gray-700">Reason (required)
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
      </label>
      <label className="mt-3 block text-sm font-medium text-gray-700">Alternative dates you could offer (optional)
        <input value={alternatives} onChange={(e) => setAlternatives(e.target.value)} className={input} />
      </label>
    </Modal>
  );
}

export function ConfirmFamilyLeaveModal({ leave, onClose, onDone }) {
  const [form, setForm] = useState({ confirmed_start: "", expected_return: "", pay_summary: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setForm({ confirmed_start: leave?.start_date || "", expected_return: "", pay_summary: "" }); setError(null); setBusy(false); }, [leave]);
  if (!leave) return null;
  const submit = async () => {
    if (!form.expected_return) { setError("Give the expected return date."); return; }
    setBusy(true); setError(null);
    try {
      await confirmFamilyLeave(leave.id, { confirmed_start: form.confirmed_start || null, expected_return: form.expected_return, pay_summary: form.pay_summary || null });
      onDone("Family leave confirmed. The employee was asked to acknowledge the confirmation, and a return-to-work reminder was scheduled.");
    } catch (e) { setError(e.message || "Could not confirm the family leave."); setBusy(false); }
  };
  const d = leave.details || {};
  return (
    <Modal open onClose={busy ? undefined : onClose} icon={Baby} title="Confirm family leave"
      description="Check the dates and pay with the employee. Do not record medical details."
      footer={<Footer busy={busy} onClose={onClose} onConfirm={submit} label="Confirm and send" />}>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <p className="mb-2 text-sm text-gray-600">Requested: {String(d.parental_type || leave.leave_type).replace(/_/g, " ")}
        {d.expected_date ? ` · expected ${d.expected_date}` : ""}{d.kit_days_interest ? " · interested in keep-in-touch days" : ""}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Confirmed start<input type="date" value={form.confirmed_start} onChange={(e) => setForm({ ...form, confirmed_start: e.target.value })} className={input} /></label>
        <label className="text-sm font-medium text-gray-700">Expected return<input type="date" value={form.expected_return} onChange={(e) => setForm({ ...form, expected_return: e.target.value })} className={input} /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Pay summary (as the policy and law provide)
          <input value={form.pay_summary} onChange={(e) => setForm({ ...form, pay_summary: e.target.value })} className={input} /></label>
      </div>
    </Modal>
  );
}

export function LeaveRecordsModal({ leave, isHr, onClose }) {
  const [reason, setReason] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setReason(null); setError(null); }, [leave]);
  if (!leave) return null;
  const reveal = () => revealSensitiveLeaveReason(leave.id).then((r) => setReason(r.reason || "No reason was given.")).catch((e) => setError(e.message));
  return (
    <Modal open onClose={onClose} icon={FileText} size="lg" title="Leave records" description={`Request LV-${leave.organization_id}-${String(leave.id).padStart(4, "0")}`}
      footer={<button type="button" onClick={onClose} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Close</button>}>
      {leave.decision_reason && <p className="mb-3 text-sm text-gray-700"><span className="font-semibold">Decision reason:</span> {leave.decision_reason}</p>}
      <RecordDocumentsPanel title="Decision records and letters" load={() => getLeaveDocuments(leave.id)} hrLink={isHr} />
      {isHr && leave.has_sensitive_reason && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>This request has a sickness reason. It is special-category data: only reveal it if you need it. Viewing it is recorded.</p>
          {reason ? <p className="mt-2 font-medium">{reason}</p> : (
            <button type="button" onClick={reveal} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><Eye size={14} aria-hidden="true" /> Reveal reason</button>
          )}
          {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
