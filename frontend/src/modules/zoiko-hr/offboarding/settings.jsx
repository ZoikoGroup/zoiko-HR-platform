/*
 * Offboarding → Settings: how exits run in this organisation. One page-level Save for the settings sections (approvals,
 * notice, task owners, exit interview, settlement, reminders); clearance checklists are saved one by one in their dialog.
 * Data: GET/PUT /hr/offboarding/settings; checklists: POST/PUT/DELETE /hr/offboarding/checklists.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCheck, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  createChecklistTemplate, deleteChecklistTemplate, errorMessage, getOffboardingSettings, saveOffboardingSettings, updateChecklistTemplate,
} from "../../../service/offboardingService";
import { Card, EmptyState, PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { EmployeePicker, ErrorNote, Modal, humanize, inputClass, useLoad } from "./part2Helpers";

export const EXIT_TYPES = [
  { key: "resignation", label: "Resignation" }, { key: "termination", label: "Termination" },
  { key: "end_of_contract", label: "End of contract" }, { key: "mutual_separation", label: "Mutual separation" },
  { key: "retirement", label: "Retirement" }, { key: "death_in_service", label: "Death in service" },
];
export const OWNER_ROLES = [
  { key: "hr", label: "HR" }, { key: "manager", label: "Manager" }, { key: "it", label: "IT" },
  { key: "finance", label: "Finance" }, { key: "admin", label: "Admin" }, { key: "employee", label: "Employee" },
];
const QUESTION_TYPE_LABELS = { choice: "Choice", rating: "Rating 1-5", nps: "Score 0-10", text: "Text", yesno: "Yes / no / not sure" };

function Section({ id, title, description, children }) {
  return (
    <Card title={title} className="scroll-mt-6">
      <div id={id} className="space-y-4">
        {description && <p className="-mt-2 text-sm text-slate-500">{description}</p>}
        {children}
      </div>
    </Card>
  );
}

function NumberField({ id, label, value, onChange, min, max, hint }) {
  return (
    <div className="max-w-xs">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input id={id} type="number" min={min} max={max} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-800">
      <input type="checkbox" className="mt-0.5" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

function QuestionEditor({ questions, onChange, types }) {
  const set = (i, patch) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, d) => {
    const next = [...questions];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[240px] flex-1">
                <label htmlFor={`q-text-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Question {i + 1}</label>
                <input id={`q-text-${i}`} value={q.text} maxLength={300} onChange={(e) => set(i, { text: e.target.value })} className={inputClass} />
              </div>
              <div className="w-44">
                <label htmlFor={`q-type-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Answer type</label>
                <select id={`q-type-${i}`} value={q.type} onChange={(e) => set(i, { type: e.target.value, options: e.target.value === "choice" ? (q.options || []) : undefined })} className={inputClass}>
                  {types.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t] || humanize(t)}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={Boolean(q.required)} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
              <div className="flex gap-1 pt-5">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => onChange(questions.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {q.type === "choice" && (
              <div className="mt-2">
                <label htmlFor={`q-opts-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Options (one per line)</label>
                <textarea id={`q-opts-${i}`} rows={3} value={(q.options || []).join("\n")}
                  onChange={(e) => set(i, { options: e.target.value.split("\n") })} className={inputClass} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <SecondaryButton icon={Plus} onClick={() => onChange([...questions, { id: `q_custom_${Date.now()}`, text: "", type: "text", required: false }])}>Add question</SecondaryButton>
    </div>
  );
}

const blankItem = () => ({ title: "", description: "", owner_role: "hr", due_offset_days: 0, mandatory: true });

function ChecklistDialog({ open, template, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setForm(template ? { name: template.name, exit_types: template.exit_types || [], items: (template.items || []).map((i) => ({ ...blankItem(), ...i, description: i.description || "" })) }
      : { name: "", exit_types: [], items: [blankItem()] });
    setError(null);
  }, [open, template]);
  if (!open || !form) return null;
  const setItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const save = async () => {
    setBusy(true); setError(null);
    const body = { name: form.name, exit_types: form.exit_types,
      items: form.items.map((it) => ({ ...it, due_offset_days: Number(it.due_offset_days) || 0, description: it.description || null })) };
    try {
      if (template) await updateChecklistTemplate(template.id, body); else await createChecklistTemplate(body);
      onSaved(template ? `Checklist “${form.name}” saved.` : `Checklist “${form.name}” created.`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={template ? `Edit checklist “${template.name}”` : "New clearance checklist"} onClose={onClose} wide
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton disabled={busy} onClick={save}>Save checklist</PrimaryButton></>}>
      <div className="space-y-4">
        <div>
          <label htmlFor="cl-name" className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input id="cl-name" value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        {!template?.is_default && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Used for (none ticked: every type of exit)</legend>
            <div className="flex flex-wrap gap-3">
              {EXIT_TYPES.map((t) => (
                <label key={t.key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.exit_types.includes(t.key)}
                    onChange={(e) => setForm((f) => ({ ...f, exit_types: e.target.checked ? [...f.exit_types, t.key] : f.exit_types.filter((x) => x !== t.key) }))} />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Items</p>
          <ol className="space-y-3">
            {form.items.map((it, i) => (
              <li key={i} className="rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-3">
                    <label htmlFor={`it-title-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Item {i + 1} title</label>
                    <input id={`it-title-${i}`} value={it.title} maxLength={200} onChange={(e) => setItem(i, { title: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor={`it-owner-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Owner</label>
                    <select id={`it-owner-${i}`} value={it.owner_role} onChange={(e) => setItem(i, { owner_role: e.target.value })} className={inputClass}>
                      {OWNER_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`it-due-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Due (days from last day)</label>
                    <input id={`it-due-${i}`} type="number" min={-90} max={90} value={it.due_offset_days}
                      onChange={(e) => setItem(i, { due_offset_days: e.target.value })} className={inputClass} />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={it.mandatory} onChange={(e) => setItem(i, { mandatory: e.target.checked })} /> Required</label>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      aria-label={`Remove item ${i + 1}`} className="mb-1 rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="sm:col-span-6">
                    <label htmlFor={`it-desc-${i}`} className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
                    <input id={`it-desc-${i}`} value={it.description} maxLength={1000} onChange={(e) => setItem(i, { description: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-500">Negative days are before the last working day (−3 = three days before), 0 is the last day itself.</p>
          <SecondaryButton icon={Plus} className="mt-2" onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))}>Add item</SecondaryButton>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export default function OffboardingSettings() {
  const data = useLoad(() => getOffboardingSettings(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(undefined);        // undefined: closed, null: new, object: edit
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { if (data.data?.settings) setForm(structuredClone(data.data.settings)); }, [data.data]);
  const dirty = useMemo(() => form && data.data && JSON.stringify(form) !== JSON.stringify(data.data.settings), [form, data.data]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    const body = { ...form, interview_questions: form.interview_questions.map((q) => (q.type === "choice"
      ? { ...q, options: (q.options || []).map((o) => o.trim()).filter(Boolean) } : (({ options, ...rest }) => rest)(q))) };
    try { await saveOffboardingSettings(body); setNotice("Offboarding settings saved."); await data.reload(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError(null);
    try { await deleteChecklistTemplate(deleting.id); setNotice(`Checklist “${deleting.name}” removed.`); setDeleting(null); await data.reload(); }
    catch (e) { setError(errorMessage(e)); setDeleting(null); } finally { setBusy(false); }
  };
  const templates = data.data?.templates || [];

  return (
    <OffboardingLayout title="Offboarding Settings" subtitle="Approvals, notice, task owners, the exit interview, settlement and checklists."
      actions={form && <PrimaryButton icon={Save} disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</PrimaryButton>}>
      {!form ? (data.error ? <ErrorNote>{data.error}</ErrorNote> : <p role="status" className="text-sm text-slate-500">Loading settings…</p>) : (
        <div className="space-y-5">
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
          <ErrorNote>{error}</ErrorNote>

          <Section id="approvals" title="Approvals" description="Who decides a resignation, and whether exits HR starts need a second person.">
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">Who decides resignations</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="approver" checked={form.approver === "manager_or_hr"} onChange={() => set({ approver: "manager_or_hr" })} /> HR or the person's own manager</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="approver" checked={form.approver === "hr"} onChange={() => set({ approver: "hr" })} /> HR only</label>
            </fieldset>
            <Toggle label="Exits HR starts (termination, mutual separation…) need a second HR person to approve" checked={form.second_approval_for_hr_exits}
              onChange={(v) => set({ second_approval_for_hr_exits: v })} />
          </Section>

          <Section id="notice" title="Notice" description="The notice rules in the company profile come first; this is used only when it has none.">
            <NumberField id="default-notice" label="Default notice (calendar days)" min={0} max={365} value={form.default_notice_days} onChange={(v) => set({ default_notice_days: v })} />
          </Section>

          <Section id="owners" title="Task owners" description="Who gets the HR, IT, Finance and Admin clearance items. Manager items go to the leaver's manager, employee items to the leaver. Unassigned items wait on the Clearance Board.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {["hr", "it", "finance", "admin"].map((role) => (
                <EmployeePicker key={role} label={`${role === "hr" ? "HR" : role === "it" ? "IT" : humanize(role)} items`} value={form.task_assignees?.[role] ?? null}
                  valueLabel={data.data?.task_assignee_names?.[role]}
                  onChange={(v) => set({ task_assignees: { ...form.task_assignees, [role]: v } })} />
              ))}
            </div>
          </Section>

          <Section id="interview" title="Exit interview" description="Questions are copied into each interview when it is sent, so changes here do not alter interviews already sent.">
            <Toggle label="Send the exit interview automatically when an exit is approved" checked={form.interview_auto_send} onChange={(v) => set({ interview_auto_send: v })}
              hint="Not sent automatically for terminations or death in service." />
            <QuestionEditor questions={form.interview_questions || []} types={data.data.question_types || Object.keys(QUESTION_TYPE_LABELS)}
              onChange={(qs) => set({ interview_questions: qs })} />
          </Section>

          <Section id="settlement" title="Settlement" description="Leave paid out at exit and how the daily rate is worked out (basic salary ÷ days).">
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">Leave types paid out</legend>
              <div className="flex flex-wrap gap-3">
                {(data.data.leave_types || []).map((lt) => (
                  <label key={lt} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={(form.encashable_leave_types || []).includes(lt)}
                      onChange={(e) => set({ encashable_leave_types: e.target.checked ? [...(form.encashable_leave_types || []), lt] : form.encashable_leave_types.filter((x) => x !== lt) })} />
                    {humanize(lt)}
                  </label>
                ))}
              </div>
            </fieldset>
            <NumberField id="rate-divisor" label="Days per month for the daily rate" min={1} max={31} value={form.daily_rate_divisor} onChange={(v) => set({ daily_rate_divisor: v })} />
            <Toggle label="A case can be closed only when the settlement is paid or marked not applicable" checked={form.close_requires_settlement}
              onChange={(v) => set({ close_requires_settlement: v })} />
          </Section>

          <Section id="automation" title="Reminders & automation">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <NumberField id="remind-every" label="Remind owners of overdue tasks every (days)" min={1} max={30} value={form.reminder_every_days} onChange={(v) => set({ reminder_every_days: v })} />
              <NumberField id="contract-ahead" label="Open exits for contracts ending within (days)" min={0} max={180} value={form.contract_end_lookahead_days}
                onChange={(v) => set({ contract_end_lookahead_days: v })} hint="0 turns this off." />
              <NumberField id="doc-link" label="Exit documents link works for (days)" min={1} max={365} value={form.documents_link_days} onChange={(v) => set({ documents_link_days: v })} />
            </div>
            <Toggle label="Issue the resignation acknowledgement automatically when a resignation is accepted" checked={form.auto_issue_acknowledgement}
              onChange={(v) => set({ auto_issue_acknowledgement: v })} />
          </Section>

          <Card title="Clearance checklists" action={<SecondaryButton icon={Plus} onClick={() => setEditing(null)}>New checklist</SecondaryButton>}>
            <p className="-mt-2 mb-3 text-sm text-slate-500">The most specific checklist is used for each exit (same exit type and department first); the standard one otherwise.</p>
            {templates.length === 0 ? <EmptyState icon={ClipboardCheck} title="No checklists" /> : (
              <ul className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="flex items-center gap-2 font-medium text-slate-900">{t.name}
                        {t.is_default && <StatusPill tone="blue">Standard</StatusPill>}
                        {!t.is_active && <StatusPill tone="gray">Off</StatusPill>}</p>
                      <p className="text-xs text-slate-500">{(t.items || []).length} item(s) · {(t.exit_types || []).length
                        ? t.exit_types.map((k) => EXIT_TYPES.find((e) => e.key === k)?.label || k).join(", ") : "every exit type"}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <SecondaryButton icon={Pencil} onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</SecondaryButton>
                      {!t.is_default && <SecondaryButton icon={Trash2} onClick={() => setDeleting(t)} aria-label={`Remove ${t.name}`}>Remove</SecondaryButton>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <ChecklistDialog open={editing !== undefined} template={editing} onClose={() => setEditing(undefined)}
        onSaved={async (msg) => { setEditing(undefined); setNotice(msg); await data.reload(); }} />
      <Modal open={Boolean(deleting)} title={`Remove checklist “${deleting?.name || ""}”?`} onClose={() => setDeleting(null)}
        footer={<><SecondaryButton onClick={() => setDeleting(null)}>Cancel</SecondaryButton><PrimaryButton disabled={busy} onClick={remove}>Remove</PrimaryButton></>}>
        <p className="text-sm text-slate-600">Exits already started keep their tasks. New exits use the next most specific checklist.</p>
      </Modal>
    </OffboardingLayout>
  );
}
