/*
 * Exit Case: one person's exit. The header shows who, what kind of exit, the status and the last day, with the actions
 * the case allows now (decide, withdrawal, stop access, cancel, close). The tabs hold everything else: summary, notice
 * & dates, clearance, assets, settlement, exit interview, documents and the timeline. Every change reloads the case.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Ban, CheckCircle2, ChevronLeft, Download, FileText, Lock, Plus, RefreshCw, RotateCcw, Send, XCircle } from "lucide-react";
import {
  addCaseTask, approveExit, cancelExit, closeExitCase, decideWithdrawal, downloadCaseDocument, errorMessage, getCaseDocuments,
  getCaseInterview, getCaseTasks, getExitActivity, getExitCase, getSettlement, issueCaseDocument, listAssetReturns, rejectExit,
  resolveAssetReturn, revokeCaseDocument, saveSettlement, sendCaseInterview, setSettlementStatus, stopExitAccess, syncCaseAssets,
  updateCaseInterview, updateClearanceTask, updateExitCase,
} from "../../../service/offboardingService";
import { formatDateTime } from "../../../utils/dateTime";
import { Card, DetailSection, EmptyState, PrimaryButton, SecondaryButton, StatusPill, UnderlineTabs, money, shortDate } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import {
  ApproveDialog, CaseStatusPill, ConfirmDialog, EmployeePicker, ErrorBanner, ExitTypePill, Input, Loading, Modal, NOTICE_HANDLING,
  Notice, REASON_CATEGORIES, Select, Textarea, daysUntil, inDays, inputClass, labelOf, useLoad,
} from "./shared";

const OWNER_ROLES = [
  { value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }, { value: "hr", label: "HR" },
  { value: "it", label: "IT" }, { value: "finance", label: "Finance" }, { value: "admin", label: "Admin" },
];
const ASSET_CONDITIONS = ["new", "good", "fair", "poor", "damaged"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const ASSET_STATUS = { pending: ["To return", "amber"], returned: ["Returned", "green"], damaged: ["Damaged", "red"], lost: ["Lost", "red"],
  written_off: ["Written off", "gray"] };
const SETTLEMENT_STATUS = { draft: ["Draft", "amber"], approved: ["Approved", "blue"], paid: ["Paid", "green"], not_applicable: ["Not applicable", "gray"] };
const INTERVIEW_STATUS = { not_sent: ["Not sent", "gray"], sent: ["Sent", "blue"], draft: ["Started", "amber"], submitted: ["Answered", "green"],
  declined: ["Declined", "gray"] };
const TASK_STATUS = { open: ["Open", "amber"], done: ["Done", "green"], exception: ["Not needed", "gray"], cancelled: ["Cancelled", "gray"] };

function Pill({ map, value }) {
  const [label, tone] = map[value] || [value || "—", "gray"];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{children ?? "—"}</dd>
    </div>
  );
}

// ── header ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function CaseHeader({ c }) {
  const n = daysUntil(c.last_working_day);
  const e = c.employee || {};
  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-gray-900">{e.name}</p>
          <p className="text-sm text-gray-500">{[e.employee_code, e.job_title].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ExitTypePill type={c.exit_type} label={c.exit_type_label} />
            <CaseStatusPill status={c.display_status} />
            {c.access_revoked_at && c.status !== "exited" && c.status !== "closed" && (
              <StatusPill tone="red" icon={Lock}>Access stopped</StatusPill>
            )}
          </div>
        </div>
        <dl className="divide-y divide-gray-100">
          <Row label="Department">{e.department || "—"}</Row>
          <Row label="Manager">{e.manager?.name || "—"}</Row>
          <Row label="Joined">{shortDate(e.date_of_joining)}</Row>
        </dl>
        <dl className="divide-y divide-gray-100">
          <Row label="Case">{c.case_number}</Row>
          <Row label="Notice">{c.notice_handling_label || "—"}</Row>
          <Row label="Last working day">
            {shortDate(c.last_working_day)}
            {["submitted", "approved"].includes(c.status) && n != null && (
              <span className={`ml-2 text-xs ${n < 0 ? "text-rose-600" : "text-gray-500"}`}>({inDays(n)})</span>
            )}
          </Row>
        </dl>
      </div>
    </Card>
  );
}

// ── summary ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function SummaryTab({ c, onSaved }) {
  const [notes, setNotes] = useState(c.hr_notes || "");
  const [rehire, setRehire] = useState(c.rehire_eligible == null ? "" : c.rehire_eligible ? "yes" : "no");
  const [rehireNotes, setRehireNotes] = useState(c.rehire_notes || "");
  const [category, setCategory] = useState(c.reason_category || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const finished = ["closed", "rejected", "withdrawn", "cancelled"].includes(c.status);
  const save = async () => {
    setBusy(true); setError(""); setOk("");
    try {
      await updateExitCase(c.id, { hr_notes: notes, rehire_eligible: rehire === "" ? null : rehire === "yes", rehire_notes: rehireNotes,
        reason_category: category || null });
      setOk("Saved.");
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Why they are leaving">
        <dl className="divide-y divide-gray-100">
          <Row label="Reason">{labelOf(REASON_CATEGORIES, c.reason_category)}</Row>
          <Row label="Started by">{c.requested_by?.name || (c.source === "system" ? "Contract end (automatic)" : "—")}</Row>
          <Row label="Notice given on">{shortDate(c.resignation_date)}</Row>
          <Row label="Notice ends">{shortDate(c.notice_end_date)}</Row>
          {c.requested_last_day && <Row label="Asked for last day">{shortDate(c.requested_last_day)}</Row>}
          <Row label="Decided by">{c.decided_by ? `${c.decided_by.name} · ${formatDateTime(c.decided_at)}` : "—"}</Row>
        </dl>
        {c.reason && <DetailSection title="In their words"><p className="whitespace-pre-line text-sm text-gray-700">{c.reason}</p></DetailSection>}
        {c.decision_note && <DetailSection title="Decision note"><p className="whitespace-pre-line text-sm text-gray-700">{c.decision_note}</p></DetailSection>}
        {c.withdrawal_reason && <DetailSection title="Withdrawal reason"><p className="whitespace-pre-line text-sm text-gray-700">{c.withdrawal_reason}</p></DetailSection>}
      </Card>
      <Card title="HR only">
        <div className="space-y-4">
          <Select label="Reason category" value={category} onChange={setCategory} options={REASON_CATEGORIES} placeholder="Not set" disabled={finished} />
          <Textarea label="HR notes" hint="Never shown to the employee." value={notes} onChange={setNotes} rows={4} disabled={finished} />
          <Select label="Eligible for rehire" value={rehire} onChange={setRehire} placeholder="Not decided" disabled={finished}
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          <Textarea label="Rehire notes" value={rehireNotes} onChange={setRehireNotes} rows={2} disabled={finished} />
          <ErrorBanner message={error} />
          <Notice message={ok} />
          {!finished && <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton>}
        </div>
      </Card>
    </div>
  );
}

// ── notice & dates ───────────────────────────────────────────────────────────────────────────────────────────────────
function NoticeTab({ c, onSaved }) {
  const [lwd, setLwd] = useState(c.last_working_day || "");
  const [handling, setHandling] = useState(c.notice_handling || "serve");
  const [reportees, setReportees] = useState(c.reportees_to ? { id: c.reportees_to.id, name: c.reportees_to.name } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const editable = ["submitted", "approved"].includes(c.status);
  const save = async () => {
    if (!lwd) { setError("Choose the last working day."); return; }
    setBusy(true); setError(""); setOk("");
    try {
      const body = { notice_handling: handling, reportees_to_id: reportees ? reportees.id : null };
      if (lwd !== c.last_working_day) body.last_working_day = lwd;
      await updateExitCase(c.id, body);
      setOk("Saved. Open clearance tasks moved with the new last day.");
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="Notice and dates">
      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Notice given on" type="date" value={c.resignation_date || ""} onChange={() => {}} disabled />
        <Input label="Notice ends (company rules)" type="date" value={c.notice_end_date || ""} onChange={() => {}} disabled
          hint={c.notice_days != null ? `${c.notice_days} days` : undefined} />
        <Input label="Last working day" type="date" value={lwd} onChange={setLwd} disabled={!editable} min={c.resignation_date || undefined}
          hint="The account closes the day after." />
        <Select label="Notice" value={handling} onChange={setHandling} options={NOTICE_HANDLING} disabled={!editable} />
        <div className="sm:col-span-2">
          {editable ? (
            <EmployeePicker label="Direct reports move to" value={reportees} onChange={setReportees} exclude={[c.employee?.id]}
              hint="Empty: they move to the leaver's own manager on the last day." />
          ) : (
            <dl><Row label="Direct reports moved to">{c.reportees_to?.name || "The leaver's manager"}</Row></dl>
          )}
        </div>
      </div>
      <div className="mt-4 max-w-2xl space-y-3">
        <ErrorBanner message={error} />
        <Notice message={ok} />
        {editable ? <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</PrimaryButton>
          : <p className="text-sm text-gray-500">Dates cannot change after the last working day.</p>}
      </div>
    </Card>
  );
}

// ── clearance ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ClearanceTab({ c, onChanged }) {
  const tasks = useLoad(() => getCaseTasks(c.id), [c.id]);
  const [error, setError] = useState("");
  const [excuse, setExcuse] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [adding, setAdding] = useState(false);
  const active = ["approved", "exited"].includes(c.status);
  const items = tasks.data?.items || [];
  const groups = OWNER_ROLES.map((r) => ({ ...r, items: items.filter((t) => t.owner_role === r.value) })).filter((g) => g.items.length);
  const act = async (fn) => {
    setError("");
    try { await fn(); await tasks.reload(); onChanged(); } catch (e) { setError(errorMessage(e)); }
  };
  if (tasks.loading && !tasks.data) return <Loading label="Loading clearance tasks…" />;
  return (
    <div className="space-y-4">
      <ErrorBanner message={error || tasks.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">{items.filter((t) => t.status !== "open" && t.status !== "cancelled").length} of {items.filter((t) => t.status !== "cancelled").length} done</p>
        {active && <SecondaryButton icon={Plus} onClick={() => setAdding(true)}>Add task</SecondaryButton>}
      </div>
      {items.length === 0 ? (
        <Card><EmptyState title="No clearance tasks">{c.status === "submitted" ? "Tasks are created when the exit is approved." : "Add a task if something needs doing."}</EmptyState></Card>
      ) : groups.map((g) => (
        <Card key={g.value} title={g.label} bodyClass="p-0 pt-2">
          <ul className="divide-y divide-gray-100">
            {g.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-[220px] flex-1">
                  <p className={`text-sm font-medium ${t.status === "done" ? "text-gray-500 line-through" : "text-gray-900"}`}>
                    {t.title}{t.mandatory && <span className="ml-1 text-xs font-normal text-rose-600">required</span>}
                    {t.auto_key && <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">automatic</span>}
                  </p>
                  {t.auto_key ? <p className="text-xs text-blue-800">{t.auto_hint}</p>
                    : t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                  <p className="mt-1 text-xs text-gray-500">
                    {t.assignee ? `Assigned to ${t.assignee.name}` : <span className="font-medium text-amber-700">Not assigned</span>}
                    {" · "}<span className={t.overdue ? "font-semibold text-rose-600" : ""}>Due {shortDate(t.due_date)}{t.overdue ? " (overdue)" : ""}</span>
                    {t.completed_by && t.status === "done" && ` · Done by ${t.completed_by.name}`}
                    {!t.completed_by && t.status === "done" && t.auto_key && " · Done automatically"}
                  </p>
                  {t.note && <p className="mt-1 text-xs text-gray-600">Note: {t.note}</p>}
                  {t.exception_reason && <p className="mt-1 text-xs text-gray-600">Not needed: {t.exception_reason}</p>}
                </div>
                <Pill map={TASK_STATUS} value={t.status} />
                {active && t.status !== "cancelled" && (
                  <div className="flex flex-wrap gap-2">
                    {t.status === "open" ? (
                      <>
                        <button type="button" onClick={() => act(() => updateClearanceTask(t.id, { done: true }))}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Mark done</button>
                        <button type="button" onClick={() => setAssigning(t)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Assign</button>
                        <button type="button" onClick={() => setExcuse(t)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Not needed</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => act(() => updateClearanceTask(t.id, { done: false }))}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Reopen</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <ConfirmDialog open={Boolean(excuse)} title="Mark this task as not needed" message={excuse?.title} confirmLabel="Mark not needed"
        reasonLabel="Why is it not needed?" onClose={() => setExcuse(null)}
        onConfirm={async (reason) => { await updateClearanceTask(excuse.id, { exception_reason: reason }); await tasks.reload(); onChanged(); }} />
      <AssignDialog task={assigning} onClose={() => setAssigning(null)} exclude={[]}
        onSave={async (body) => { await updateClearanceTask(assigning.id, body); await tasks.reload(); onChanged(); }} />
      <AddTaskDialog open={adding} onClose={() => setAdding(false)} defaultDue={c.last_working_day}
        onSave={async (body) => { await addCaseTask(c.id, body); await tasks.reload(); onChanged(); }} />
    </div>
  );
}

function AssignDialog({ task, onClose, onSave }) {
  const [person, setPerson] = useState(null);
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (task) { setPerson(task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null); setDue(task.due_date || ""); setError(""); }
  }, [task]);
  const save = async () => {
    if (!person) { setError("Choose who does this task."); return; }
    setBusy(true); setError("");
    try { await onSave({ assignee_id: person.id, due_date: due || undefined }); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(task)} title={`Assign “${task?.title || ""}”`} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={save} disabled={busy}>Save</PrimaryButton></>}>
      <div className="space-y-4">
        <EmployeePicker label="Assigned to" value={person} onChange={setPerson} required />
        <Input label="Due date" type="date" value={due} onChange={setDue} />
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

function AddTaskDialog({ open, onClose, onSave, defaultDue }) {
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("hr");
  const [description, setDescription] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setTitle(""); setRole("hr"); setDescription(""); setMandatory(true); setDue(defaultDue || ""); setErrors({}); }
  }, [open, defaultDue]);
  const save = async () => {
    if (!title.trim()) { setErrors({ title: "Give the task a title." }); return; }
    setBusy(true); setErrors({});
    try {
      await onSave({ title: title.trim(), owner_role: role, description: description.trim() || undefined, mandatory, due_date: due || undefined });
      onClose();
    } catch (e) { setErrors({ form: errorMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Add clearance task" onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={save} disabled={busy}>Add task</PrimaryButton></>}>
      <div className="space-y-4">
        <Input label="Task" required value={title} onChange={setTitle} maxLength={200} error={errors.title} />
        <Select label="Owner" value={role} onChange={setRole} options={OWNER_ROLES}
          hint="Employee and Manager tasks go to the leaver and their manager; others to the owner set in Settings." />
        <Textarea label="Details (optional)" value={description} onChange={setDescription} rows={2} />
        <Input label="Due date" type="date" value={due} onChange={setDue} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          Required before the case can close</label>
        <ErrorBanner message={errors.form} />
      </div>
    </Modal>
  );
}

// ── assets ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function AssetsTab({ c, onChanged }) {
  const assets = useLoad(() => listAssetReturns({ case_id: c.id, status: "all" }), [c.id]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [resolving, setResolving] = useState(null);
  const active = ["approved", "exited"].includes(c.status);
  const items = assets.data?.items || [];
  const sync = async () => {
    setError(""); setOk("");
    try {
      const r = await syncCaseAssets(c.id);
      setOk(r.added ? `${r.added} newly assigned asset(s) added.` : "Nothing new: every asset assigned to them is already listed.");
      await assets.reload(); onChanged();
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <div className="space-y-4">
      <ErrorBanner message={error || assets.error} />
      <Notice message={ok} onClose={() => setOk("")} />
      <Card title="Company property" action={active && <SecondaryButton icon={RefreshCw} onClick={sync}>Refresh from asset register</SecondaryButton>} bodyClass="p-0 pt-3">
        {assets.loading && !assets.data ? <Loading /> : items.length === 0 ? (
          <EmptyState title="No assets to recover">{c.status === "submitted" ? "Assets are listed when the exit is approved." : "Nothing is assigned to this person."}</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.asset_name || "Asset"}</p>
                  <p className="text-xs text-gray-500">{a.asset_tag}{a.condition ? ` · condition ${a.condition}` : ""}{a.resolved_at ? ` · ${formatDateTime(a.resolved_at)}` : ""}</p>
                  {a.note && <p className="text-xs text-gray-600">{a.note}</p>}
                </div>
                {a.recovery_amount != null && (
                  <span className="text-sm font-semibold text-rose-700">Recover {Number(a.recovery_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                )}
                <Pill map={ASSET_STATUS} value={a.status} />
                {active && <SecondaryButton onClick={() => setResolving(a)}>{a.status === "pending" ? "Record return" : "Change"}</SecondaryButton>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ResolveAssetDialog asset={resolving} onClose={() => setResolving(null)}
        onSave={async (body) => { await resolveAssetReturn(resolving.id, body); await assets.reload(); onChanged(); }} />
    </div>
  );
}

export function ResolveAssetDialog({ asset, onClose, onSave }) {
  const [status, setStatus] = useState("returned");
  const [condition, setCondition] = useState("good");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (asset) {
      setStatus(asset.status === "pending" ? "returned" : asset.status); setCondition(asset.condition || "good");
      setAmount(asset.recovery_amount != null ? String(asset.recovery_amount) : ""); setNote(asset.note || ""); setError("");
    }
  }, [asset]);
  const charge = status === "damaged" || status === "lost";
  const save = async () => {
    if (charge && amount !== "" && (Number.isNaN(Number(amount)) || Number(amount) < 0)) { setError("The amount must be a positive number."); return; }
    setBusy(true); setError("");
    try {
      await onSave({ status, condition: status === "returned" ? condition : undefined, recovery_amount: charge && amount !== "" ? Number(amount) : undefined,
        note: note.trim() || undefined });
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(asset)} title={`${asset?.asset_name || "Asset"} ${asset?.asset_tag ? `(${asset.asset_tag})` : ""}`} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={save} disabled={busy}>Save</PrimaryButton></>}>
      <div className="space-y-4">
        <Select label="What happened" value={status} onChange={setStatus} options={[
          { value: "returned", label: "Returned" }, { value: "damaged", label: "Returned damaged" }, { value: "lost", label: "Lost" },
          { value: "written_off", label: "Written off (not recovered, not charged)" }, { value: "pending", label: "Still to return" }]} />
        {status === "returned" && <Select label="Condition" value={condition} onChange={setCondition} options={ASSET_CONDITIONS} />}
        {charge && <Input label="Amount to recover (optional)" type="number" min="0" step="0.01" value={amount} onChange={setAmount}
          hint="Added to the final settlement as a deduction." />}
        <Textarea label="Note (optional)" value={note} onChange={setNote} rows={2} />
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

// ── settlement ───────────────────────────────────────────────────────────────────────────────────────────────────────
function LineEditor({ title, lines, onChange, disabled, currency }) {
  const set = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <DetailSection title={title} action={!disabled && (
      <button type="button" onClick={() => onChange([...lines, { label: "", amount: "", source: "manual" }])}
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus className="h-3.5 w-3.5" />Add line</button>
    )}>
      {lines.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label={`${title} line ${i + 1} description`} value={l.label} disabled={disabled} onChange={(e) => set(i, { label: e.target.value })}
                className={`${inputClass} min-w-[200px] flex-1`} placeholder="Description" />
              <input aria-label={`${title} line ${i + 1} amount`} type="number" min="0" step="0.01" value={l.amount} disabled={disabled}
                onChange={(e) => set(i, { amount: e.target.value })} className={`${inputClass} w-36 text-right`} placeholder={currency || "Amount"} />
              {l.source !== "manual" && <StatusPill tone="teal">{l.source === "leave" ? "Leave" : l.source === "notice" ? "Notice" : "Assets"}</StatusPill>}
              {!disabled && (
                <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={`Remove ${title} line ${i + 1}`}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-rose-600"><XCircle className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

function SettlementTab({ c, onChanged }) {
  const st = useLoad(() => getSettlement(c.id), [c.id]);
  const s = st.data?.settlement;
  const [earnings, setEarnings] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reopen, setReopen] = useState(false);
  useEffect(() => {
    if (!s) return;
    setEarnings(s.earnings.map((l) => ({ ...l, amount: String(l.amount) })));
    setDeductions(s.deductions.map((l) => ({ ...l, amount: String(l.amount) })));
    setRate(s.daily_rate != null ? String(s.daily_rate) : "");
    setNotes(s.notes || "");
  }, [s]);
  const locked = !s || ["paid", "not_applicable"].includes(s.status) || !["approved", "exited", "closed"].includes(c.status);
  const total = (ls) => ls.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const net = total(earnings) - total(deductions);
  const run = async (fn, message) => {
    setBusy(true); setError(""); setOk("");
    try { await fn(); setOk(message); await st.reload(); onChanged(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const lineBody = (ls) => ls.map((l) => ({ label: l.label, amount: Number(l.amount), source: l.source || "manual" }));
  const save = (recalculate = false) => {
    const bad = [...earnings, ...deductions].find((l) => !String(l.label).trim() || l.amount === "" || Number.isNaN(Number(l.amount)));
    if (bad) { setError("Every line needs a description and an amount."); return; }
    run(() => saveSettlement(c.id, { daily_rate: rate === "" ? null : Number(rate), earnings: lineBody(earnings), deductions: lineBody(deductions),
      notes, recalculate }), recalculate ? "Recalculated from leave, notice and assets." : "Settlement saved.");
  };
  if (st.loading && !st.data) return <Loading label="Loading settlement…" />;
  if (!s) return <Card><EmptyState title="No settlement yet">The settlement starts when the exit is approved.</EmptyState></Card>;
  const dirty = JSON.stringify(lineBody(earnings)) !== JSON.stringify(lineBody(s.earnings)) || JSON.stringify(lineBody(deductions)) !== JSON.stringify(lineBody(s.deductions))
    || (rate === "" ? null : Number(rate)) !== s.daily_rate || (notes || "") !== (s.notes || "");
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card title="Final settlement" className="xl:col-span-2" action={<Pill map={SETTLEMENT_STATUS} value={s.status} />}>
        <div className="space-y-2">
          <ErrorBanner message={error || st.error} />
          <Notice message={ok} onClose={() => setOk("")} />
        </div>
        <div className="mt-2 grid max-w-md grid-cols-2 gap-4">
          <Input label={`Daily rate (${s.currency || ""})`} type="number" min="0" step="0.01" value={rate} onChange={setRate} disabled={locked}
            hint="From basic salary ÷ days per month." />
          <div className="pt-6 text-sm text-gray-600">Leave paid out: <strong>{s.leave_days ?? 0}</strong> days</div>
        </div>
        <LineEditor title="Earnings" lines={earnings} onChange={setEarnings} disabled={locked} currency={s.currency} />
        <LineEditor title="Deductions" lines={deductions} onChange={setDeductions} disabled={locked} currency={s.currency} />
        <div className="mt-5 flex justify-end border-t border-gray-100 pt-4 text-lg">
          <span className="mr-3 text-gray-500">Net amount</span><strong>{money(dirty ? net : s.net_amount, s.currency)}</strong>
        </div>
        <Textarea className="mt-4" label="Notes" value={notes} onChange={setNotes} rows={2} disabled={locked} />
        <div className="mt-5 flex flex-wrap gap-2">
          {!locked && <>
            <PrimaryButton onClick={() => save(false)} disabled={busy}>Save</PrimaryButton>
            <SecondaryButton icon={RefreshCw} onClick={() => save(true)} disabled={busy}>Recalculate</SecondaryButton>
            {s.status === "draft" && <SecondaryButton icon={CheckCircle2} disabled={busy || dirty} title={dirty ? "Save first" : undefined}
              onClick={() => run(() => setSettlementStatus(c.id, "approved"), "Settlement approved.")}>Approve</SecondaryButton>}
            {s.status === "approved" && <SecondaryButton onClick={() => setPaying(true)} disabled={busy}>Mark paid</SecondaryButton>}
            <SecondaryButton icon={Ban} disabled={busy} onClick={() => run(() => setSettlementStatus(c.id, "not_applicable"), "Marked not applicable.")}>Not applicable</SecondaryButton>
          </>}
          {s.status === "paid" && <p className="text-sm text-emerald-700">Paid on {shortDate(s.paid_on)}{s.payment_reference ? ` · ${s.payment_reference}` : ""}</p>}
          {["paid", "not_applicable", "approved"].includes(s.status) && ["approved", "exited"].includes(c.status) && (
            <SecondaryButton icon={RotateCcw} disabled={busy} onClick={() => (s.status === "paid" ? setReopen(true)
              : run(() => setSettlementStatus(c.id, "draft"), "Settlement reopened."))}>Reopen</SecondaryButton>
          )}
        </div>
      </Card>
      <Card title={`Leave balance ${s.leave?.year || ""}`}>
        {(s.leave?.lines || []).length === 0 ? <p className="text-sm text-gray-500">No leave balances recorded.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Type</th><th className="py-1 text-right">Left</th><th className="py-1 text-right">Paid out</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {s.leave.lines.map((l) => (
                <tr key={l.leave_type}>
                  <td className="py-1.5 capitalize">{l.leave_type.replace(/_/g, " ")}</td>
                  <td className="py-1.5 text-right">{l.remaining}</td>
                  <td className="py-1.5 text-right">{l.paid_out ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">Which leave types are paid out is set in Offboarding → Settings.</p>
      </Card>
      <PaidDialog open={paying} onClose={() => setPaying(false)}
        onSave={(body) => run(() => setSettlementStatus(c.id, "paid", body), "Marked paid.")} />
      <ConfirmDialog open={reopen} title="Reopen a paid settlement?" danger confirmLabel="Reopen"
        message="It is already marked paid. Reopen only to correct a mistake." onClose={() => setReopen(false)}
        onConfirm={async () => { await setSettlementStatus(c.id, "draft", { confirm_reopen_paid: true }); await st.reload(); onChanged(); }} />
    </div>
  );
}

function PaidDialog({ open, onClose, onSave }) {
  const [date, setDate] = useState("");
  const [ref, setRef] = useState("");
  useEffect(() => { if (open) { setDate(new Date().toISOString().slice(0, 10)); setRef(""); } }, [open]);
  return (
    <Modal open={open} title="Mark settlement paid" onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={async () => { await onSave({ paid_on: date, payment_reference: ref.trim() || undefined }); onClose(); }}>Mark paid</PrimaryButton></>}>
      <div className="space-y-4">
        <Input label="Paid on" type="date" value={date} onChange={setDate} required />
        <Input label="Payment reference (optional)" value={ref} onChange={setRef} maxLength={120} />
      </div>
    </Modal>
  );
}

// ── exit interview ───────────────────────────────────────────────────────────────────────────────────────────────────
function answerText(q, v) {
  if (v == null || v === "") return <span className="text-gray-400">No answer</span>;
  if (q.type === "rating") return `${v} / 5`;
  if (q.type === "nps") return `${v} / 10`;
  if (q.type === "choice") return labelOf(REASON_CATEGORIES, v);
  if (q.type === "yesno") return { yes: "Yes", no: "No", not_sure: "Not sure" }[v] || v;
  return <span className="whitespace-pre-line">{v}</span>;
}

function InterviewTab({ c, onChanged }) {
  const iv = useLoad(() => getCaseInterview(c.id), [c.id]);
  const data = iv.data?.interview;
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSummary(data?.hr_summary || ""); }, [data]);
  const run = async (fn, message) => {
    setBusy(true); setError(""); setOk("");
    try { await fn(); setOk(message); await iv.reload(); onChanged(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const canSend = ["approved", "exited"].includes(c.status) && (!data || ["not_sent", "sent", "draft", "declined"].includes(data.status));
  if (iv.loading && !iv.data) return <Loading label="Loading exit interview…" />;
  return (
    <div className="space-y-4">
      <ErrorBanner message={error || iv.error} />
      <Notice message={ok} onClose={() => setOk("")} />
      <Card title="Exit interview" action={<div className="flex items-center gap-2">
        {data && <Pill map={INTERVIEW_STATUS} value={data.status} />}
        {canSend && <SecondaryButton icon={Send} disabled={busy} onClick={() => run(() => sendCaseInterview(c.id), "Exit interview sent.")}>
          {data && data.status !== "not_sent" ? "Send again" : "Send"}</SecondaryButton>}
      </div>}>
        {!data ? <EmptyState title="Not sent yet">{c.status === "submitted" ? "It can be sent once the exit is approved." : "Send it to collect feedback."}</EmptyState> : (
          <>
            <p className="text-xs text-gray-500">
              {data.sent_at && `Sent ${formatDateTime(data.sent_at)}`}{data.submitted_at && ` · answered ${formatDateTime(data.submitted_at)}`}
              {" · "}Answers are visible to HR only.
            </p>
            <dl className="mt-4 divide-y divide-gray-100">
              {(data.questions || []).map((q) => (
                <div key={q.id} className="py-3">
                  <dt className="text-sm font-medium text-gray-700">{q.text}</dt>
                  <dd className="mt-1 text-sm text-gray-900">{answerText(q, data.answers?.[q.id])}</dd>
                </div>
              ))}
            </dl>
            <Textarea className="mt-4" label="HR summary" value={summary} onChange={setSummary} rows={3} />
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={busy} onClick={() => run(() => updateCaseInterview(c.id, { hr_summary: summary }), "Summary saved.")}>Save summary</PrimaryButton>
              {["sent", "draft", "not_sent"].includes(data.status) && (
                <SecondaryButton disabled={busy} onClick={() => run(() => updateCaseInterview(c.id, { declined: true }), "Marked as declined.")}>Mark declined</SecondaryButton>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── documents ────────────────────────────────────────────────────────────────────────────────────────────────────────
function DocumentsTab({ c, onChanged }) {
  const docs = useLoad(() => getCaseDocuments(c.id), [c.id]);
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const kinds = (docs.data?.kinds || []).filter((k) => {
    if (k.key === "resignation_acknowledgement") return c.exit_type === "resignation";
    if (["relieving_letter", "experience_letter"].includes(k.key)) return c.exit_type !== "death_in_service";
    return true;
  });
  const canIssue = ["approved", "exited", "closed"].includes(c.status);
  const issue = async () => {
    if (!kind) { setError("Choose a document to issue."); return; }
    setBusy(true); setError(""); setOk("");
    try {
      await issueCaseDocument(c.id, kind);
      setOk(c.status === "approved" ? "Issued. The employee can download it in My Exit." : "Issued and e-mailed to the employee as a download link.");
      setKind(""); await docs.reload(); onChanged();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const download = async (d) => {
    setError("");
    try { await downloadCaseDocument(c.id, d); } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <div className="space-y-4">
      <ErrorBanner message={error || docs.error} />
      <Notice message={ok} onClose={() => setOk("")} />
      {canIssue && (
        <Card title="Issue a document">
          <div className="flex flex-wrap items-end gap-3">
            <Select className="min-w-[260px]" label="Document" value={kind} onChange={setKind} placeholder="Choose…"
              options={kinds.map((k) => ({ value: k.key, label: k.label }))} />
            <PrimaryButton icon={FileText} onClick={issue} disabled={busy}>{busy ? "Issuing…" : "Issue"}</PrimaryButton>
          </div>
          <p className="mt-2 text-xs text-gray-500">Reissuing a letter replaces the earlier copy. Letters use the company profile's name, address and signatory.</p>
        </Card>
      )}
      <Card title="Issued documents" bodyClass="p-0 pt-3">
        {docs.loading && !docs.data ? <Loading /> : (docs.data?.items || []).length === 0 ? (
          <EmptyState icon={FileText} title="No documents issued">{canIssue ? "Issue one above." : "Documents can be issued once the exit is approved."}</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.data.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className={`text-sm font-medium ${d.revoked_at ? "text-gray-400 line-through" : "text-gray-900"}`}>{d.title}</p>
                  <p className="text-xs text-gray-500">Issued {formatDateTime(d.issued_at)}{d.downloaded_at ? ` · downloaded ${formatDateTime(d.downloaded_at)}` : ""}
                    {d.revoked_at ? ` · withdrawn ${formatDateTime(d.revoked_at)}` : ""}</p>
                </div>
                <SecondaryButton icon={Download} onClick={() => download(d)} aria-label={`Download ${d.title}`}>Download</SecondaryButton>
                {!d.revoked_at && <SecondaryButton onClick={() => setRevoking(d)}>Withdraw</SecondaryButton>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog open={Boolean(revoking)} title={`Withdraw “${revoking?.title || ""}”?`} danger confirmLabel="Withdraw"
        message="The employee can no longer download it, and its e-mailed link stops working." onClose={() => setRevoking(null)}
        onConfirm={async () => { await revokeCaseDocument(c.id, revoking.id); await docs.reload(); onChanged(); }} />
    </div>
  );
}

// ── timeline ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function TimelineTab({ c }) {
  const act = useLoad(() => getExitActivity(c.id), [c.id, c.status]);
  if (act.loading && !act.data) return <Loading />;
  const items = act.data?.items || [];
  return (
    <Card title="Timeline">
      <ErrorBanner message={act.error} />
      {items.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
        <ol className="relative ml-2 border-l border-gray-200">
          {items.map((a) => (
            <li key={a.id} className="mb-4 ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" aria-hidden="true" />
              <p className="text-sm text-gray-900">{a.message}</p>
              <p className="text-xs text-gray-500">{formatDateTime(a.created_at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TABS = [
  { value: "summary", label: "Summary" }, { value: "notice", label: "Notice & dates" }, { value: "clearance", label: "Clearance" },
  { value: "assets", label: "Assets" }, { value: "settlement", label: "Settlement" }, { value: "interview", label: "Exit interview" },
  { value: "documents", label: "Documents" }, { value: "timeline", label: "Timeline" },
];

export default function OffboardingCaseDetail() {
  const { id } = useParams();
  const exitCase = useLoad(() => getExitCase(id), [id]);
  const c = exitCase.data;
  // ?tab=settlement / ?tab=interview opens that section (links from Settlements and Exit Interviews)
  const [searchParams] = useSearchParams();
  const askedTab = searchParams.get("tab");
  const [tab, setTab] = useState(TABS.some((t) => t.value === askedTab) ? askedTab : "summary");
  const [dialog, setDialog] = useState(null);   // approve | reject | withdraw-accept | withdraw-decline | stop | cancel | close
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = exitCase.reload;
  const progressText = useMemo(() => c && `${c.progress?.tasks_done || 0}/${c.progress?.tasks_total || 0} tasks`, [c]);
  const tabs = TABS.map((t) => (t.value === "clearance" && c ? { ...t, label: `Clearance (${progressText})` } : t));
  const after = async (fn, message) => {
    setError(""); setOk("");
    await fn();
    setOk(message);
    await reload();
  };
  const close = async () => {
    setBusy(true); setError(""); setOk("");
    try { await closeExitCase(c.id); setOk("Case closed."); await reload(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  if (exitCase.loading && !c) return <OffboardingLayout title="Exit Case"><Loading label="Loading exit case…" /></OffboardingLayout>;
  if (!c) {
    return (
      <OffboardingLayout title="Exit Case">
        <ErrorBanner message={exitCase.error || "This exit case could not be found."} />
        <Link to="/zoiko-hr/offboarding/cases" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
          <ChevronLeft className="h-4 w-4" />Back to exit cases</Link>
      </OffboardingLayout>
    );
  }
  const inProgress = ["submitted", "approved"].includes(c.status);
  const actions = (
    <>
      {c.status === "submitted" && c.can_decide && <>
        <PrimaryButton icon={CheckCircle2} onClick={() => setDialog("approve")}>Approve</PrimaryButton>
        <SecondaryButton icon={XCircle} onClick={() => setDialog("reject")}>Reject</SecondaryButton>
      </>}
      {c.status === "approved" && c.withdrawal_requested_at && <>
        <PrimaryButton onClick={() => setDialog("withdraw-accept")}>Accept withdrawal</PrimaryButton>
        <SecondaryButton onClick={() => setDialog("withdraw-decline")}>Decline withdrawal</SecondaryButton>
      </>}
      {inProgress && !c.access_revoked_at && <SecondaryButton icon={Lock} onClick={() => setDialog("stop")}>Stop access now</SecondaryButton>}
      {inProgress && c.source !== "employee" && <SecondaryButton icon={Ban} onClick={() => setDialog("cancel")}>Cancel exit</SecondaryButton>}
      {c.status === "exited" && (
        <PrimaryButton icon={CheckCircle2} onClick={close} disabled={!c.can_close || busy}
          title={c.can_close ? undefined : "Finish the items listed below first"}>Close case</PrimaryButton>
      )}
    </>
  );
  return (
    <OffboardingLayout title="Exit Case" breadcrumbTitle={c.employee?.name} subtitle={`${c.case_number} · ${c.exit_type_label}`} actions={actions}>
      <div className="space-y-5">
        <Link to="/zoiko-hr/offboarding/cases" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
          <ChevronLeft className="h-4 w-4" />All exit cases</Link>
        <ErrorBanner message={error} onClose={() => setError("")} />
        <Notice message={ok} onClose={() => setOk("")} />
        {c.status === "exited" && !c.can_close && (c.close_blockers || []).length > 0 && (
          <div role="note" aria-label="Before the case can close" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Before the case can close:</p>
            <ul className="mt-1 list-disc pl-5">{c.close_blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        {c.status === "approved" && c.withdrawal_requested_at && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The employee asked to withdraw their resignation on {formatDateTime(c.withdrawal_requested_at)}: “{c.withdrawal_reason}”.
          </div>
        )}
        <CaseHeader c={c} />
        <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} label="Exit case sections" />
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
          {tab === "summary" && <SummaryTab key={`${c.id}-${c.status}`} c={c} onSaved={reload} />}
          {tab === "notice" && <NoticeTab key={`${c.id}-${c.last_working_day}-${c.status}`} c={c} onSaved={reload} />}
          {tab === "clearance" && <ClearanceTab c={c} onChanged={reload} />}
          {tab === "assets" && <AssetsTab c={c} onChanged={reload} />}
          {tab === "settlement" && <SettlementTab c={c} onChanged={reload} />}
          {tab === "interview" && <InterviewTab c={c} onChanged={reload} />}
          {tab === "documents" && <DocumentsTab c={c} onChanged={reload} />}
          {tab === "timeline" && <TimelineTab c={c} />}
        </div>
      </div>

      <ApproveDialog open={dialog === "approve"} exitCase={c} onClose={() => setDialog(null)}
        onApprove={(body) => after(() => approveExit(c.id, body), "Approved. Clearance tasks, assets and the settlement are set up.")} />
      <ConfirmDialog open={dialog === "reject"} title="Reject this resignation" confirmLabel="Reject" danger
        reasonLabel="Reason" reasonHint="The employee sees this." onClose={() => setDialog(null)}
        onConfirm={(note) => after(() => rejectExit(c.id, note), "Rejected. The employee has been told.")} />
      <ConfirmDialog open={dialog === "withdraw-accept"} title="Accept the withdrawal" confirmLabel="Accept withdrawal"
        message="The exit stops: open tasks are cancelled and the employee stays." reasonLabel="Note (optional)" reasonRequired={false}
        onClose={() => setDialog(null)} onConfirm={(note) => after(() => decideWithdrawal(c.id, true, note), "Withdrawal accepted. The exit is stopped.")} />
      <ConfirmDialog open={dialog === "withdraw-decline"} title="Decline the withdrawal" confirmLabel="Decline" danger
        reasonLabel="Reason" reasonHint="The employee sees this." onClose={() => setDialog(null)}
        onConfirm={(note) => after(() => decideWithdrawal(c.id, false, note), "Withdrawal declined. The exit continues.")} />
      <ConfirmDialog open={dialog === "stop"} title="Stop access now?" confirmLabel="Stop access" danger
        message={<p>{c.employee?.name} is signed out everywhere and can no longer sign in. They stay employed until their last working day
          ({shortDate(c.last_working_day)}), so the clearance and settlement continue as planned.</p>}
        onClose={() => setDialog(null)} onConfirm={() => after(() => stopExitAccess(c.id), "Access stopped.")} />
      <ConfirmDialog open={dialog === "cancel"} title="Cancel this exit" confirmLabel="Cancel exit" danger
        message="Open tasks are cancelled and, if access was stopped, it is given back." reasonLabel="Reason"
        onClose={() => setDialog(null)} onConfirm={(reason) => after(() => cancelExit(c.id, reason), "Exit cancelled.")} />
    </OffboardingLayout>
  );
}
