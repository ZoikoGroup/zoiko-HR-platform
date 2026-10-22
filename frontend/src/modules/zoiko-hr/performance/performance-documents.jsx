// Probation, appraisals and improvement plans (Prompt 4 §A): structured probation reviews, probation outcomes (extension,
// confirmation, unsuccessful with its checklist), appraisal stages (manager assessment with evidence, calibration, finalising),
// and PIPs (HR approval by someone other than the manager). Letters follow decisions; none of this changes employment status.
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Send } from "lucide-react";
import HRPage from "../../../components/HRPage";
import RecordDocumentsPanel from "../../../components/documents/RecordDocumentsPanel";
import {
  addPipReviewNote, calibrateAppraisal, closePip, createPip, decidePip, finaliseAppraisal, getAppraisalDocuments, listPips, listProbationReviews,
  requestProbationOutcome, submitManagerAssessment, submitPip, submitProbationReview,
} from "../../../service/goLiveService";
import { EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, Toast, fmtDate, inputCls, useToast } from "../documents/generated/docUi";

const TABS = [["reviews", "Probation reviews"], ["outcomes", "Probation outcomes"], ["appraisals", "Appraisal stages"], ["pips", "Improvement plans"]];
const RECOMMEND = [["on_track", "On track"], ["concerns", "Concerns raised"], ["recommend_confirm", "Recommend confirmation"],
  ["recommend_extend", "Recommend extension"], ["recommend_end", "Recommend ending employment"]];
const one = (picked) => Object.keys(picked).map(Number)[0];

export default function PerformanceDocumentsPage() {
  const [tab, setTab] = useState("reviews");
  const [toast, showToast] = useToast();
  const done = (msg) => showToast("success", msg);
  const fail = (e) => showToast("error", e?.message || "That did not work.");
  return (
    <HRPage title="Probation, appraisals and improvement plans" subtitle="Records and letters follow each decision; none of them changes employment status or pay.">
      <Toast toast={toast} />
      <div role="tablist" aria-label="Performance documents" className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{l}</button>)}
      </div>
      {tab === "reviews" && <Reviews done={done} fail={fail} />}
      {tab === "outcomes" && <Outcomes done={done} fail={fail} />}
      {tab === "appraisals" && <Appraisals done={done} fail={fail} />}
      {tab === "pips" && <Pips done={done} fail={fail} />}
    </HRPage>
  );
}

function Reviews({ done, fail }) {
  const [items, setItems] = useState([]);
  const [who, setWho] = useState({});
  const [f, setF] = useState({ recommendation: "on_track", strengths: "", concerns: "", support_agreed: "", objective: "", rating: "meets", evidence: "" });
  const load = useCallback(() => listProbationReviews().then((r) => setItems(r?.items || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const submit = () => {
    const employee_id = one(who);
    if (!employee_id) { fail({ message: "Choose the employee." }); return; }
    submitProbationReview({ employee_id, recommendation: f.recommendation, strengths: f.strengths, concerns: f.concerns, support_agreed: f.support_agreed,
      objectives_progress: f.objective ? [{ objective: f.objective, rating: f.rating, evidence: f.evidence }] : [] })
      .then(() => { done("Review submitted. The employee can add comments before it is issued."); load(); }).catch(fail);
  };
  const needsDetail = ["concerns", "recommend_extend", "recommend_end"].includes(f.recommendation);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="New probation review">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><ClipboardCheck size={18} aria-hidden="true" /> New probation review</h2>
        <EmployeePicker value={who} onChange={setWho} idPrefix="pr-emp" max={1} />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-sm sm:col-span-3">Objective<input className={inputCls} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} /></label>
          <label className="text-sm">Progress<select className={inputCls} value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>
            <option value="meets">Meets</option><option value="partly">Partly meets</option><option value="not_yet">Not yet</option></select></label>
          <label className="text-sm sm:col-span-2">Evidence<input className={inputCls} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></label>
          <label className="text-sm sm:col-span-3">What is going well<textarea rows={2} className={inputCls} value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} /></label>
          <label className="text-sm sm:col-span-3">Areas to improve {needsDetail && "(specific, with examples) *"}<textarea rows={2} className={inputCls} value={f.concerns} onChange={(e) => setF({ ...f, concerns: e.target.value })} /></label>
          <label className="text-sm sm:col-span-3">Support agreed {needsDetail && "*"}<textarea rows={2} className={inputCls} value={f.support_agreed} onChange={(e) => setF({ ...f, support_agreed: e.target.value })} /></label>
          <label className="text-sm sm:col-span-3">Recommendation<select className={inputCls} value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })}>
            {RECOMMEND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <PrimaryButton className="mt-3" icon={Send} onClick={submit}>Submit review</PrimaryButton>
      </section>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label="Probation reviews">
        {items.length === 0 && <li className="p-4 text-sm text-slate-500">No reviews yet.</li>}
        {items.map((r) => <li key={r.id} className="p-3 text-sm">{r.employee_name} · review {r.review_number} · {RECOMMEND.find(([k]) => k === r.recommendation)?.[1]}
          <span className="ml-2 text-xs text-slate-500">{r.status === "SUBMITTED" ? "waiting for employee comments" : "issued"} · {fmtDate(r.held_on)}</span></li>)}
      </ul>
    </div>
  );
}

function Outcomes({ done, fail }) {
  const [who, setWho] = useState({});
  const [kind, setKind] = useState("confirmation");
  const [f, setF] = useState({ new_end_date: "", extension_reason: "", extension_objectives: "", confirmation_date: "", final_meeting_date: "",
    decision_reasons: "", response_opportunity_date: "", adjustments: "", adjustments_reason: "", hr_reviewed_on: "", protected_status: false, legal_review_cleared: false });
  const submit = () => {
    const id = one(who);
    if (!id) { fail({ message: "Choose the employee." }); return; }
    const body = { kind };
    if (kind === "probation_extended") Object.assign(body, { new_end_date: f.new_end_date, extension_reason: f.extension_reason,
      extension_objectives: f.extension_objectives.split("\n").filter(Boolean) });
    if (kind === "confirmation") body.confirmation_date = f.confirmation_date || null;
    if (kind === "probation_end") Object.assign(body, { final_meeting_date: f.final_meeting_date, decision_reasons: f.decision_reasons, checklist: {
      response_opportunity_date: f.response_opportunity_date || null, adjustments: f.adjustments || null, adjustments_reason: f.adjustments_reason,
      hr_reviewed_on: f.hr_reviewed_on || null, protected_status: f.protected_status, legal_review_cleared: f.legal_review_cleared } });
    requestProbationOutcome(id, body).then(() => done("Sent to HR for a decision (Employment changes). The letter follows the decision.")).catch(fail);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <section className="max-w-3xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Probation outcome">
      <EmployeePicker value={who} onChange={setWho} idPrefix="po-emp" max={1} />
      <label className="block text-sm">Outcome<select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="confirmation">Confirm employment</option><option value="probation_extended">Extend probation</option>
        <option value="probation_end">Not confirmed (unsuccessful)</option></select></label>
      {kind === "confirmation" && <label className="block text-sm">Confirmation date<input type="date" className={inputCls} value={f.confirmation_date} onChange={set("confirmation_date")} /></label>}
      {kind === "probation_extended" && <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">New end date<input type="date" className={inputCls} value={f.new_end_date} onChange={set("new_end_date")} /></label>
        <label className="text-sm sm:col-span-2">Why (reviewed by HR before the letter)<textarea rows={2} className={inputCls} value={f.extension_reason} onChange={set("extension_reason")} /></label>
        <label className="text-sm sm:col-span-2">What we need to see (one per line)<textarea rows={2} className={inputCls} value={f.extension_objectives} onChange={set("extension_objectives")} /></label>
        <p className="text-xs text-slate-500 sm:col-span-2">Needs a review recommending an extension; the released clause sets the maximum length for the country.</p></div>}
      {kind === "probation_end" && <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Final review meeting<input type="date" className={inputCls} value={f.final_meeting_date} onChange={set("final_meeting_date")} /></label>
        <label className="text-sm">Employee given a chance to respond on<input type="date" className={inputCls} value={f.response_opportunity_date} onChange={set("response_opportunity_date")} /></label>
        <label className="text-sm">Reasonable adjustments considered<select className={inputCls} value={f.adjustments} onChange={set("adjustments")}>
          <option value="">Choose…</option><option value="yes">Yes</option><option value="not_applicable">Not applicable</option></select></label>
        <label className="text-sm">If not applicable, why<input className={inputCls} value={f.adjustments_reason} onChange={set("adjustments_reason")} /></label>
        <label className="text-sm">HR reviewed the decision on<input type="date" className={inputCls} value={f.hr_reviewed_on} onChange={set("hr_reviewed_on")} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={f.protected_status} onChange={set("protected_status")} /> The employee has a legal protection flagged by the pack</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={f.legal_review_cleared} onChange={set("legal_review_cleared")} /> Legal review completed</label>
        <label className="text-sm sm:col-span-2">Reasons (HR-reviewed text)<textarea rows={2} className={inputCls} value={f.decision_reasons} onChange={set("decision_reasons")} /></label>
        <p className="text-xs text-slate-500 sm:col-span-2">Needs a requester, an HR approver and an authorised signatory (three people). Issuing the letter does not end employment, access or pay.</p></div>}
      <PrimaryButton icon={Send} onClick={submit}>Send for decision</PrimaryButton>
    </section>
  );
}

function Appraisals({ done, fail }) {
  const [id, setId] = useState("");
  const [goal, setGoal] = useState({ goal: "", rating: "", evidence: "" });
  const [overall, setOverall] = useState("");
  const [final, setFinal] = useState({ overall_rating_label: "", manager_summary: "", development_priorities: "" });
  const assess = () => submitManagerAssessment(Number(id), { goals: [goal], competencies: [], overall_recommendation: overall })
    .then(() => done("Manager assessment saved. It is shared with the employee when the appraisal is final.")).catch(fail);
  const fin = () => finaliseAppraisal(Number(id), { ...final, development_priorities: final.development_priorities.split("\n").filter(Boolean) })
    .then(() => done("Appraisal finalised; the employee was asked to acknowledge it.")).catch(fail);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">Appraisal number<input className={inputCls} value={id} onChange={(e) => setId(e.target.value)} /></label>
        <h3 className="text-sm font-semibold">Manager assessment (evidence required for every rating)</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <input aria-label="Goal" placeholder="Goal" className={inputCls} value={goal.goal} onChange={(e) => setGoal({ ...goal, goal: e.target.value })} />
          <input aria-label="Rating" placeholder="Rating" className={inputCls} value={goal.rating} onChange={(e) => setGoal({ ...goal, rating: e.target.value })} />
          <input aria-label="Evidence" placeholder="Evidence" className={inputCls} value={goal.evidence} onChange={(e) => setGoal({ ...goal, evidence: e.target.value })} />
        </div>
        <label className="block text-sm">Overall recommendation<input className={inputCls} value={overall} onChange={(e) => setOverall(e.target.value)} /></label>
        <div className="flex gap-2"><PrimaryButton onClick={assess} disabled={!id}>Save assessment</PrimaryButton>
          <SecondaryButton onClick={() => calibrateAppraisal(Number(id)).then(() => done("Calibrated.")).catch(fail)} disabled={!id}>Calibrate</SecondaryButton></div>
      </section>
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Finalise</h3>
        <label className="block text-sm">Overall rating<input className={inputCls} value={final.overall_rating_label} onChange={(e) => setFinal({ ...final, overall_rating_label: e.target.value })} /></label>
        <label className="block text-sm">Summary<textarea rows={3} className={inputCls} value={final.manager_summary} onChange={(e) => setFinal({ ...final, manager_summary: e.target.value })} /></label>
        <label className="block text-sm">Development priorities (one per line)<textarea rows={2} className={inputCls} value={final.development_priorities} onChange={(e) => setFinal({ ...final, development_priorities: e.target.value })} /></label>
        <PrimaryButton onClick={fin} disabled={!id}>Finalise appraisal</PrimaryButton>
        {id && <RecordDocumentsPanel title="Appraisal records" load={() => getAppraisalDocuments(Number(id))} refreshKey={id} />}
      </section>
    </div>
  );
}

function Pips({ done, fail }) {
  const [items, setItems] = useState([]);
  const [who, setWho] = useState({});
  const [f, setF] = useState({ start_date: "", end_date: "", objective: "", standard: "", evidence_of_gap: "", success_measure: "", support: "",
    adjustments_considered: "" });
  const [error, setError] = useState(null);
  const load = useCallback(() => listPips().then((r) => setItems(r?.items || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const act = (p, ok) => p.then(() => { done(ok); load(); }).catch(fail);
  const create = () => {
    const employee_id = one(who);
    if (!employee_id) { setError("Choose the employee."); return; }
    setError(null);
    act(createPip({ employee_id, start_date: f.start_date, end_date: f.end_date, adjustments_considered: f.adjustments_considered,
      objectives: [{ objective: f.objective, standard: f.standard, evidence_of_gap: f.evidence_of_gap, success_measure: f.success_measure }],
      support: f.support.split("\n").filter(Boolean) }), "Draft plan saved. Send it to HR for approval.");
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" aria-label="New improvement plan">
        <ErrorBanner error={error} />
        <EmployeePicker value={who} onChange={setWho} idPrefix="pip-emp" max={1} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Start<input type="date" className={inputCls} value={f.start_date} onChange={set("start_date")} /></label>
          <label className="text-sm">End<input type="date" className={inputCls} value={f.end_date} onChange={set("end_date")} /></label>
          <label className="text-sm sm:col-span-2">Objective<input className={inputCls} value={f.objective} onChange={set("objective")} /></label>
          <label className="text-sm">Expected standard<input className={inputCls} value={f.standard} onChange={set("standard")} /></label>
          <label className="text-sm">Current performance (with examples)<input className={inputCls} value={f.evidence_of_gap} onChange={set("evidence_of_gap")} /></label>
          <label className="text-sm sm:col-span-2">How success will be measured<input className={inputCls} value={f.success_measure} onChange={set("success_measure")} /></label>
          <label className="text-sm sm:col-span-2">Support (one per line)<textarea rows={2} className={inputCls} value={f.support} onChange={set("support")} /></label>
          <label className="text-sm sm:col-span-2">Reasonable adjustments considered *<input className={inputCls} value={f.adjustments_considered} onChange={set("adjustments_considered")} /></label>
        </div>
        <PrimaryButton onClick={create}>Save draft</PrimaryButton>
      </section>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label="Improvement plans">
        {items.length === 0 && <li className="p-4 text-sm text-slate-500">No plans.</li>}
        {items.map((p) => (
          <li key={p.id} className="space-y-2 p-3 text-sm">
            <p className="font-medium">{p.employee_name} · {fmtDate(p.start_date)} to {fmtDate(p.end_date)} · {p.status.replace(/_/g, " ").toLowerCase()}</p>
            <div className="flex flex-wrap gap-2">
              {p.status === "DRAFT" && <SecondaryButton onClick={() => act(submitPip(p.id), "Sent to HR for approval.")}>Send to HR</SecondaryButton>}
              {p.status === "PENDING_HR_APPROVAL" && <>
                <PrimaryButton onClick={() => act(decidePip(p.id, { approve: true }), "Approved and issued to the employee.")}>Approve (HR)</PrimaryButton>
                <SecondaryButton onClick={() => { const c = window.prompt("Why is the plan going back?"); if (c) act(decidePip(p.id, { approve: false, comment: c }), "Returned to the manager."); }}>Return</SecondaryButton></>}
              {["ACTIVE", "EXTENDED"].includes(p.status) && <>
                <SecondaryButton onClick={() => { const n = window.prompt("Review meeting notes"); if (n) act(addPipReviewNote(p.id, n), "Notes saved."); }}>Add review notes</SecondaryButton>
                <SecondaryButton onClick={() => act(closePip(p.id, { outcome: "COMPLETED_SUCCESSFUL" }), "Closed: completed successfully.")}>Completed successfully</SecondaryButton>
                <SecondaryButton onClick={() => act(closePip(p.id, { outcome: "COMPLETED_UNSUCCESSFUL" }), "Closed. Any further step is a separate procedure.")}>Not completed</SecondaryButton></>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
