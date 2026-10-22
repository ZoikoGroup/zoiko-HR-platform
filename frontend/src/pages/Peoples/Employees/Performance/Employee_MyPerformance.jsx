// ESS "My performance": comment on a probation review before it is issued for your acknowledgement, complete your
// self-assessment, and ask for an internal transfer. Acknowledging a review or appraisal confirms you have read it; it never
// means you agree with it.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import {
  commentOnMyProbationReview, listMyProbationReviews, listMyTransferRequests, requestTransfer, submitSelfAssessment,
} from "../../../../service/goLiveService";
import { getDepartments } from "../../../../service/hrService";
import { useDocumentActions } from "../../../../components/documents/DocumentActionsWidget";

const input = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const RECOMMEND = { on_track: "On track", concerns: "Concerns raised", recommend_confirm: "Recommend confirmation",
  recommend_extend: "Recommend extension", recommend_end: "Recommend ending employment" };

function Notice({ notice }) {
  if (!notice) return null;
  return <p role="status" className={`mb-3 rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</p>;
}

export default function EmployeeMyPerformance() {
  const [reviews, setReviews] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [comments, setComments] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const actions = useDocumentActions();
  const selfTasks = actions.items.filter((i) => i.kind === "self_assessment");
  const [self, setSelf] = useState({ went_well: "", difficult: "", support: "", development: "", wellbeing: "" });
  const [transfer, setTransfer] = useState({ requested_department_id: "", requested_role: "", requested_location: "", preferred_start: "",
    reason: "", manager_informed: false, supporting_information: "" });

  const load = useCallback(() => {
    listMyProbationReviews().then((r) => setReviews(r?.items || [])).catch(() => setReviews([]));
    listMyTransferRequests().then((r) => setTransfers(r?.items || [])).catch(() => setTransfers([]));
  }, []);
  useEffect(() => {
    load();
    getDepartments().then((r) => { const d = r?.data; setDepartments(Array.isArray(d) ? d : d?.items || []); }).catch(() => setDepartments([]));
  }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice({ ok: true, text: ok }); load(); }
    catch (e) { setNotice({ ok: false, text: e?.message || "That did not work." }); }
    finally { setBusy(false); }
  };

  return (
    <EmployeePageShell title="My performance" subtitle="Probation reviews, self-assessments and internal transfer requests.">
      <Notice notice={notice} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Probation reviews">
          <h2 className="mb-2 text-base font-semibold">Probation reviews</h2>
          {reviews.length === 0 && <p className="text-sm text-slate-600">No probation reviews yet.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="mb-3 rounded-xl border border-slate-100 p-3 text-sm">
              <p className="font-medium">Review {r.review_number} · {RECOMMEND[r.recommendation] || r.recommendation}</p>
              {r.strengths && <p className="text-slate-700">Going well: {r.strengths}</p>}
              {r.concerns && <p className="text-slate-700">To improve: {r.concerns}</p>}
              {r.support_agreed && <p className="text-slate-700">Support agreed: {r.support_agreed}</p>}
              {r.status === "SUBMITTED" ? (
                <>
                  <label className="mt-2 block text-sm">Your comments (optional)
                    <textarea rows={3} className={input} value={comments[r.id] || ""} onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })} />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">A recommendation is not a final decision. Your comments become part of the review.</p>
                  <button type="button" disabled={busy} onClick={() => run(() => commentOnMyProbationReview(r.id, comments[r.id] || ""),
                    "Thank you. The review is now in your documents to acknowledge.")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                    <Send size={14} aria-hidden="true" /> Send comments</button>
                </>
              ) : <p className="mt-1 text-xs text-slate-500">Issued: acknowledge it in Documents to action.</p>}
            </div>
          ))}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Self-assessment">
          <h2 className="mb-2 text-base font-semibold">Self-assessment</h2>
          {selfTasks.length === 0 ? <p className="text-sm text-slate-600">No self-assessment is open.</p> : (
            <>
              <p className="mb-2 text-sm text-slate-700">{selfTasks[0].title}</p>
              {[["went_well", "What went well *"], ["difficult", "What was difficult, and why"], ["support", "Support that would help"],
                ["development", "Development interests"], ["wellbeing", "Wellbeing and workload (optional, seen by your manager and HR only)"]].map(([k, l]) => (
                <label key={k} className="mb-2 block text-sm">{l}
                  <textarea rows={2} className={input} value={self[k]} onChange={(e) => setSelf({ ...self, [k]: e.target.value })} />
                </label>
              ))}
              <button type="button" disabled={busy || !self.went_well.trim()} onClick={() => run(() => submitSelfAssessment(selfTasks[0].id, self),
                "Self-assessment sent to your manager.")} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                <Send size={14} aria-hidden="true" /> Submit self-assessment</button>
            </>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2" aria-label="Request an internal transfer">
          <h2 className="mb-2 text-base font-semibold">Request an internal transfer</h2>
          <p className="mb-2 text-xs text-slate-500">Requesting a transfer will not affect how you are treated in your current role. Moves to another country need a different process.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Department *<select className={input} value={transfer.requested_department_id}
              onChange={(e) => setTransfer({ ...transfer, requested_department_id: e.target.value })}>
              <option value="">Choose…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="text-sm">Role (optional)<input className={input} value={transfer.requested_role} onChange={(e) => setTransfer({ ...transfer, requested_role: e.target.value })} /></label>
            <label className="text-sm">Location (same country)<input className={input} value={transfer.requested_location} onChange={(e) => setTransfer({ ...transfer, requested_location: e.target.value })} /></label>
            <label className="text-sm">Preferred start<input type="date" className={input} value={transfer.preferred_start} onChange={(e) => setTransfer({ ...transfer, preferred_start: e.target.value })} /></label>
            <label className="text-sm sm:col-span-2">Reason *<input className={input} value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} /></label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={transfer.manager_informed}
            onChange={(e) => setTransfer({ ...transfer, manager_informed: e.target.checked })} /> I have told my current manager (you can choose not to before HR contacts you)</label>
          <button type="button" disabled={busy || !transfer.requested_department_id || transfer.reason.trim().length < 3}
            onClick={() => run(() => requestTransfer({ ...transfer, requested_department_id: Number(transfer.requested_department_id),
              preferred_start: transfer.preferred_start || null }), "Transfer request sent to HR.")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />} Send request</button>
          {transfers.length > 0 && (
            <ul className="mt-3 text-sm text-slate-700">{transfers.map((t) => <li key={t.id}>To {t.new_value?.department || "—"} · {t.status}
              {t.needs_second_approval ? " (waiting for HR)" : ""}{t.decision_comment ? ` · ${t.decision_comment}` : ""}</li>)}</ul>
          )}
        </section>
      </div>
    </EmployeePageShell>
  );
}
