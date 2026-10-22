// Compensation approvals (Prompt 3 §D): salary revisions and allowance awards go DRAFT → waiting for approval → approved →
// communicated. The approver is an organization admin or an authorised signatory for compensation, never the requester or
// the employee; the server refuses anything else. Approval produces the letter (encrypted, C3) and an ID-only payroll event.
// Also: the annual total reward statement run (with a preview) and the compensation settings.
import { useCallback, useEffect, useId, useState } from "react";
import { BadgeDollarSign, Check, Send, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
import RecordDocumentsPanel, { blockedText } from "../../../components/documents/RecordDocumentsPanel";
import {
  createRevision, decideAllowanceAward, decideRevision, getCompensationRecordDocuments, getCompensationSettings, listAllowanceAwards,
  listRevisions, requestAllowanceAward, runStatements, submitRevision, updateCompensationSettings,
} from "../../../service/workDocumentsService";
import {
  EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, Toast, fmtDate, inputCls, useToast,
} from "../documents/generated/docUi";

const STATUS = { DRAFT: "Draft", PENDING_APPROVAL: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", COMMUNICATED: "Communicated" };
const TYPES = [["annual_review", "Annual review"], ["merit", "Merit"], ["promotion", "Promotion"], ["market_adjustment", "Market adjustment"],
  ["initial", "Initial salary"], ["correction", "Correction (no letter)"]];

export default function CompensationApprovalsPage() {
  const [tab, setTab] = useState("revisions");
  const [toast, showToast] = useToast();
  return (
    <HRPage title="Compensation approvals" subtitle="Salary revisions and allowance awards need a second person before anyone is told.">
      <Toast toast={toast} />
      <div role="tablist" aria-label="Compensation" className="mb-4 flex flex-wrap gap-2">
        {[["revisions", "Salary revisions"], ["allowances", "Allowance awards"], ["statements", "Reward statements"], ["settings", "Settings"]].map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{l}</button>
        ))}
      </div>
      {tab === "revisions" && <Revisions toast={showToast} />}
      {tab === "allowances" && <Allowances toast={showToast} />}
      {tab === "statements" && <Statements toast={showToast} />}
      {tab === "settings" && <Settings toast={showToast} />}
    </HRPage>
  );
}

function Decision({ onDecide }) {
  const [comment, setComment] = useState("");
  const cid = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={cid}>Comment</label>
      <input id={cid} placeholder="Comment (required to reject)" value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputCls} w-56`} />
      <PrimaryButton icon={Check} onClick={() => onDecide(true, comment)}>Approve</PrimaryButton>
      <SecondaryButton icon={X} tone="danger" onClick={() => onDecide(false, comment)}>Reject</SecondaryButton>
    </div>
  );
}

function Revisions({ toast }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ employees: {}, new_salary: "", effective_date: "", revision_type: "annual_review", reason: "", reason_statement: "" });
  const [open, setOpen] = useState(null);
  const load = useCallback(() => listRevisions().then((r) => setItems(r?.items || [])).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = (p, ok) => p.then(() => { toast("success", ok); load(); }).catch((e) => toast("error", (e.detail?.reasons || []).map(blockedText).join(" ") || e.message));

  const create = () => {
    const ids = Object.keys(form.employees).map(Number);
    if (ids.length !== 1 || !form.new_salary || !form.effective_date) { setError("Choose one employee, the new salary and the effective date."); return; }
    setError(null);
    act(createRevision({ employee_id: ids[0], new_salary: form.new_salary, effective_date: form.effective_date, revision_type: form.revision_type,
      reason: form.reason || null, reason_statement: form.reason_statement || null }), "Draft revision created. Submit it for approval.");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="New salary revision">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><BadgeDollarSign size={18} aria-hidden="true" /> New salary revision</h2>
        <ErrorBanner error={error} />
        <EmployeePicker value={form.employees} onChange={(v) => setForm({ ...form, employees: v })} idPrefix="rev-emp" max={1} />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-sm">New salary<input type="number" min="0" step="0.01" value={form.new_salary} onChange={(e) => setForm({ ...form, new_salary: e.target.value })} className={inputCls} /></label>
          <label className="text-sm">Effective from<input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} className={inputCls} /></label>
          <label className="text-sm">Type<select value={form.revision_type} onChange={(e) => setForm({ ...form, revision_type: e.target.value })} className={inputCls}>
            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="text-sm sm:col-span-3">Internal reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} /></label>
          <label className="text-sm sm:col-span-3">Sentence for the employee's letter (optional)<input value={form.reason_statement} onChange={(e) => setForm({ ...form, reason_statement: e.target.value })} className={inputCls} /></label>
        </div>
        <p className="mt-1 text-xs text-slate-500">An increase letter is never produced for a decrease; a salary reduction needs a separately reviewed letter.</p>
        <PrimaryButton className="mt-2" onClick={create}>Create draft</PrimaryButton>
      </section>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label="Salary revisions">
        {items.length === 0 && <li className="p-4 text-sm text-slate-500">No revisions yet.</li>}
        {items.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">Employee #{r.employee_id} · {r.old_salary ?? "—"} → {r.new_salary} {r.currency || ""}
                  {r.percentage_change != null ? ` (${r.percentage_change > 0 ? "+" : ""}${r.percentage_change}%)` : ""}</p>
                <p className="text-xs text-slate-500">{STATUS[r.status] || r.status} · effective {fmtDate(r.effective_date)}{r.decision_comment ? ` · ${r.decision_comment}` : ""}</p>
              </div>
              {r.status === "DRAFT" && <SecondaryButton icon={Send} onClick={() => act(submitRevision(r.id), "Submitted for approval.")}>Submit for approval</SecondaryButton>}
              {r.status === "PENDING_APPROVAL" && <Decision onDecide={(approve, comment) => act(decideRevision(r.id, { approve, comment: comment || null }),
                approve ? "Approved. The letter goes to the employee once it is issued." : "Rejected.")} />}
              {["APPROVED", "COMMUNICATED"].includes(r.status) && <SecondaryButton onClick={() => setOpen(open === r.id ? null : r.id)}>Letter</SecondaryButton>}
            </div>
            {open === r.id && <div className="mt-3"><RecordDocumentsPanel title="Salary letter" hrLink load={() => getCompensationRecordDocuments("salary_revision", r.id)} /></div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Allowances({ toast }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ employees: {}, allowance_type: "", amount: "", frequency: "monthly", effective_date: "", end_date: "", review_date: "", eligibility_reason: "", conditions: "" });
  const load = useCallback(() => listAllowanceAwards().then((r) => setItems(r?.items || [])).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = (p, ok) => p.then(() => { toast("success", ok); load(); }).catch((e) => toast("error", e.message));
  const create = () => {
    const ids = Object.keys(form.employees).map(Number);
    if (ids.length !== 1 || !form.allowance_type || !form.amount || !form.effective_date || !form.conditions) {
      setError("Choose one employee and give the allowance, amount, start date and eligibility conditions."); return;
    }
    setError(null);
    const { employees, ...rest } = form;
    act(requestAllowanceAward({ ...rest, employee_id: ids[0], end_date: form.end_date || null, review_date: form.review_date || null }), "Award sent for approval.");
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }), className: inputCls });
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="New allowance award">
        <h2 className="mb-2 text-base font-semibold">New allowance award</h2>
        <ErrorBanner error={error} />
        <EmployeePicker value={form.employees} onChange={(v) => setForm({ ...form, employees: v })} idPrefix="alw-emp" max={1} />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-sm">Allowance<input {...f("allowance_type")} /></label>
          <label className="text-sm">Amount<input type="number" min="0" step="0.01" {...f("amount")} /></label>
          <label className="text-sm">Frequency<select {...f("frequency")}><option value="monthly">Monthly</option><option value="annual">Annually</option><option value="weekly">Weekly</option><option value="one_time">One-off</option></select></label>
          <label className="text-sm">Starts<input type="date" {...f("effective_date")} /></label>
          <label className="text-sm">Ends (optional)<input type="date" {...f("end_date")} /></label>
          <label className="text-sm">Review date (optional)<input type="date" {...f("review_date")} /></label>
          <label className="text-sm sm:col-span-3">Why the employee is eligible<input {...f("eligibility_reason")} /></label>
          <label className="text-sm sm:col-span-3">Conditions it depends on (shown in the letter)<input {...f("conditions")} /></label>
        </div>
        <PrimaryButton className="mt-2" onClick={create}>Send for approval</PrimaryButton>
      </section>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label="Allowance awards">
        {items.length === 0 && <li className="p-4 text-sm text-slate-500">No awards yet.</li>}
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div><p className="font-medium">Employee #{a.employee_id} · {a.allowance_type} · {a.amount} {a.currency || ""} {a.frequency}</p>
              <p className="text-xs text-slate-500">{STATUS[a.status] || a.status} · from {fmtDate(a.effective_date)}</p></div>
            {a.status === "PENDING_APPROVAL" && <Decision onDecide={(approve, comment) => act(decideAllowanceAward(a.id, { approve, comment: comment || null }), approve ? "Approved." : "Rejected.")} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Statements({ toast }) {
  const [employees, setEmployees] = useState({});
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (isPreview) => {
    const ids = Object.keys(employees).map(Number);
    if (!ids.length) { toast("error", "Choose at least one employee."); return; }
    setBusy(true);
    try {
      const r = await runStatements({ employee_ids: ids, period_label: period, preview: isPreview });
      if (isPreview) setPreview(r.results);
      else { toast("success", `${r.results.filter((x) => x.document_id).length} statements issued.`); setPreview(null); }
    } catch (e) { toast("error", e.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Total reward statements">
      <p className="text-sm text-slate-600">Employees can download their own statement any time from My compensation. Use this for an annual run.</p>
      <label className="text-sm">Period<input value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inputCls} w-40`} /></label>
      <EmployeePicker value={employees} onChange={(v) => { setEmployees(v); setPreview(null); }} idPrefix="stmt-emp" />
      {preview && <ul className="list-disc pl-5 text-sm">{preview.map((x) => <li key={x.employee_id}>Employee #{x.employee_id}: {x.outcome === "ALLOW" ? "ready" : x.reasons.map(blockedText).join(" ")}</li>)}</ul>}
      <div className="flex gap-2">
        <SecondaryButton loading={busy} onClick={() => run(true)}>Preview</SecondaryButton>
        <PrimaryButton loading={busy} disabled={!preview} onClick={() => run(false)}>Issue statements</PrimaryButton>
      </div>
    </section>
  );
}

function Settings({ toast }) {
  const [v, setV] = useState({ managers_see_reports: false, expense_second_approval_threshold: "" });
  useEffect(() => { getCompensationSettings().then((r) => setV({ managers_see_reports: !!r.managers_see_reports, expense_second_approval_threshold: r.expense_second_approval_threshold ?? "" })).catch(() => {}); }, []);
  const save = () => updateCompensationSettings({ managers_see_reports: v.managers_see_reports,
    expense_second_approval_threshold: v.expense_second_approval_threshold === "" ? null : Number(v.expense_second_approval_threshold) })
    .then(() => toast("success", "Compensation settings saved.")).catch((e) => toast("error", e.message));
  return (
    <section className="max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-blue-600" checked={v.managers_see_reports} onChange={(e) => setV({ ...v, managers_see_reports: e.target.checked })} />
        <span>Managers may open the compensation documents of their own reports<span className="block text-xs text-slate-500">Off by default. Only an organization admin can change this.</span></span></label>
      <label className="block text-sm">Expense claims above this total need a second approver
        <input type="number" min="0" step="0.01" value={v.expense_second_approval_threshold} onChange={(e) => setV({ ...v, expense_second_approval_threshold: e.target.value })} className={inputCls} /></label>
      <PrimaryButton onClick={save}>Save</PrimaryButton>
    </section>
  );
}
