// Employment changes (Prompt 4 §B): promotions, job title changes, department transfers, manager changes and the probation
// decisions. A request is decided by someone other than the person who asked (transfers: the receiving manager, then HR); the
// letter follows the approval; the employee record changes only when HR completes the change on or after the effective date.
import { useCallback, useEffect, useState } from "react";
import { Check, CheckCheck, FileText, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { Modal } from "../../../components/billing-ui";
import RecordDocumentsPanel from "../../../components/documents/RecordDocumentsPanel";
import { getDepartments } from "../../../service/hrService";
import { bulkManagerChange, completeChange, createChange, decideChange, getChangeDocuments, listChanges } from "../../../service/goLiveService";
import { EmployeePicker, PrimaryButton, SecondaryButton, Toast, fmtDate, inputCls, useToast } from "../documents/generated/docUi";

const TYPES = [["promotion", "Promotion"], ["role_change", "Job title change"], ["department_change", "Department transfer"], ["manager_change", "New manager"]];
const LABEL = Object.fromEntries([...TYPES, ["transfer", "Internal transfer"], ["probation_extended", "Probation extension"],
  ["confirmation", "Probation confirmation"], ["probation_end", "Probation not confirmed"]]);

export default function EmployeeChangesPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("pending");
  const [open, setOpen] = useState(null);
  const [toast, showToast] = useToast();
  const load = useCallback(() => listChanges({ status }).then((r) => setItems(r?.items || [])).catch(() => setItems([])), [status]);
  useEffect(() => { load(); }, [load]);
  const act = (p, ok) => p.then(() => { showToast("success", ok); load(); }).catch((e) => showToast("error", e?.message || "That did not work."));
  return (
    <HRPage title="Employment changes" subtitle="Approved changes produce the letter; the record changes only when you complete them.">
      <Toast toast={toast} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <NewChange onDone={(m) => { showToast("success", m); load(); }} onError={(m) => showToast("error", m)} />
          <BulkManager onDone={(m) => { showToast("success", m); load(); }} onError={(m) => showToast("error", m)} />
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2" aria-label="Change requests">
          <label className="text-sm">Show<select className={`${inputCls} ml-2 inline-block w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Waiting for a decision</option><option value="approved">Approved, to complete</option><option value="completed">Completed</option>
            <option value="rejected">Refused</option><option value="">All</option></select></label>
          <ul className="mt-3 divide-y divide-slate-100">
            {items.length === 0 && <li className="py-3 text-sm text-slate-500">Nothing here.</li>}
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{LABEL[c.event_type] || c.event_type} · {c.employee_name}</p>
                  <p className="text-xs text-slate-500">Effective {fmtDate(c.effective_date)} · {c.status}{c.needs_second_approval ? " · waiting for the HR approval" : ""}
                    {c.decision_comment ? ` · ${c.decision_comment}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  {c.status === "pending" && <>
                    <PrimaryButton icon={Check} onClick={() => act(decideChange(c.id, { approve: true }), "Approved. The letter has been produced.")}>Approve</PrimaryButton>
                    <SecondaryButton icon={X} tone="danger" onClick={() => { const r = window.prompt("Reason for refusing"); if (r) act(decideChange(c.id, { approve: false, comment: r }), "Refused."); }}>Refuse</SecondaryButton></>}
                  {c.status === "approved" && <PrimaryButton icon={CheckCheck} onClick={() => act(completeChange(c.id), "Completed: the employee record is updated.")}>Complete</PrimaryButton>}
                  <SecondaryButton icon={FileText} onClick={() => setOpen(c)}>Documents</SecondaryButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {open && (
        <Modal open onClose={() => setOpen(null)} icon={FileText} title={`${LABEL[open.event_type] || open.event_type} — documents`}
          footer={<SecondaryButton onClick={() => setOpen(null)}>Close</SecondaryButton>}>
          <RecordDocumentsPanel title="Records and letters" load={() => getChangeDocuments(open.id)} hrLink />
        </Modal>
      )}
    </HRPage>
  );
}

function NewChange({ onDone, onError }) {
  const [who, setWho] = useState({});
  const [mgr, setMgr] = useState({});
  const [departments, setDepartments] = useState([]);
  const [f, setF] = useState({ event_type: "promotion", effective_date: "", title: "", department_id: "", reason_statement: "", duties_changed: false,
    responsibilities: "", linked_salary_revision_id: "" });
  useEffect(() => { getDepartments().then((r) => { const d = r?.data; setDepartments(Array.isArray(d) ? d : d?.items || []); }).catch(() => {}); }, []);
  const submit = () => {
    const employee_id = Object.keys(who).map(Number)[0];
    if (!employee_id || !f.effective_date) { onError("Choose the employee and the effective date."); return; }
    const nv = f.event_type === "department_change" ? { department_id: Number(f.department_id) }
      : f.event_type === "manager_change" ? { manager_id: Object.keys(mgr).map(Number)[0] } : { title: f.title };
    createChange({ employee_id, event_type: f.event_type, effective_date: f.effective_date, new_value: nv, reason_statement: f.reason_statement || null,
      duties_changed: f.duties_changed, new_responsibilities: f.responsibilities.split("\n").filter(Boolean),
      linked_salary_revision_id: f.linked_salary_revision_id ? Number(f.linked_salary_revision_id) : null })
      .then(() => onDone("Change requested. Someone else must approve it.")).catch((e) => onError(e?.message || "Could not request the change."));
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Request a change">
      <h2 className="text-base font-semibold">Request a change</h2>
      <EmployeePicker value={who} onChange={setWho} idPrefix="chg-emp" max={1} />
      <label className="block text-sm">Change<select className={inputCls} value={f.event_type} onChange={set("event_type")}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="block text-sm">Effective from<input type="date" className={inputCls} value={f.effective_date} onChange={set("effective_date")} /></label>
      {["promotion", "role_change"].includes(f.event_type) && <label className="block text-sm">New title<input className={inputCls} value={f.title} onChange={set("title")} /></label>}
      {f.event_type === "department_change" && <label className="block text-sm">New department<select className={inputCls} value={f.department_id} onChange={set("department_id")}>
        <option value="">Choose…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
      {f.event_type === "manager_change" && <EmployeePicker value={mgr} onChange={setMgr} idPrefix="chg-mgr" max={1} />}
      {f.event_type === "promotion" && <>
        <label className="block text-sm">New responsibilities (one per line)<textarea rows={2} className={inputCls} value={f.responsibilities} onChange={set("responsibilities")} /></label>
        <label className="block text-sm">Linked salary revision number (must be approved)<input className={inputCls} value={f.linked_salary_revision_id} onChange={set("linked_salary_revision_id")} /></label></>}
      {f.event_type === "role_change" && <>
        <label className="block text-sm">Reason (optional)<input className={inputCls} value={f.reason_statement} onChange={set("reason_statement")} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={f.duties_changed} onChange={set("duties_changed")} /> Duties change too</label></>}
      <p className="text-xs text-slate-500">A move to another country or region, or a change of hours or contract type, needs a terms variation instead.</p>
      <PrimaryButton onClick={submit}>Request change</PrimaryButton>
    </section>
  );
}

function BulkManager({ onDone, onError }) {
  const [people, setPeople] = useState({});
  const [mgr, setMgr] = useState({});
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState(null);
  const body = (p) => ({ employee_ids: Object.keys(people).map(Number), new_manager_id: Object.keys(mgr).map(Number)[0], effective_date: date, preview: p });
  const run = (p) => bulkManagerChange(body(p)).then((r) => { if (p) setPreview(r.results); else { setPreview(null); onDone(`${r.change_ids.length} manager changes requested.`); } })
    .catch((e) => onError(e?.message || "Could not run the bulk change."));
  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Team reorganisation">
      <h2 className="text-base font-semibold">Move a team to a new manager</h2>
      <EmployeePicker value={people} onChange={setPeople} idPrefix="bulk-emp" />
      <p className="text-xs text-slate-600">New manager</p>
      <EmployeePicker value={mgr} onChange={setMgr} idPrefix="bulk-mgr" max={1} />
      <label className="block text-sm">Effective from<input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {preview && <p className="text-sm">{preview.filter((x) => x.outcome === "ALLOW").length} of {preview.length} can receive the notice.</p>}
      <div className="flex gap-2"><SecondaryButton onClick={() => run(true)}>Preview</SecondaryButton><PrimaryButton disabled={!preview} onClick={() => run(false)}>Request changes</PrimaryButton></div>
    </section>
  );
}
