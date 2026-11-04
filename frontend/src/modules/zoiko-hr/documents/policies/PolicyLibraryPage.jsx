// Company policies (Prompt 3 §A0): the 14 policy templates with their released versions, the current publication and how
// many people have acknowledged it, whether Mira (the assistant) answers from the current version, re-acknowledgement drafts
// prepared after a material change, the per-organization policy settings, and a publish wizard that previews the recipients
// before anything is sent. Content is edited in the template editor; publications are tracked on Policy Distributions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Bot, CheckCircle2, Megaphone, RefreshCw, Send, Settings2, Users } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import { getDepartments } from "../../../../service/hrService";
import { createPolicyDistribution, publishPolicyDistribution, reasonText } from "../../../../service/docTemplatesService";
import {
  getPolicySettings, listPolicies, previewPolicyAudience, retryPolicyKnowledgeSync, updatePolicySettings,
} from "../../../../service/workDocumentsService";
import {
  EmployeePicker, ErrorBanner, PrimaryButton, SecondaryButton, Toast, fmtDate, fmtDateTime, inputCls, useToast,
} from "../generated/docUi";

const SYNC_TEXT = { SYNCED: "Mira answers from this version", FAILED: "Mira sync failed: retry", RETIRED: "Retired" };
const SETTING_FIELDS = [
  ["owner_name", "Default policy owner", "text"], ["contact", "Contact for policy questions", "text"],
  ["scope_statement", "Applies to (default)", "text"], ["review_months", "Months between reviews", "number"],
  ["privacy_contact", "Privacy contact", "text"], ["absence_notification_rule", "When to report an absence (e.g. within one hour of your start time)", "text"],
  ["default_probation_months", "Default probation (months)", "number"], ["core_hours", "Core hours", "text"],
  ["remote_cost_support", "Remote working cost support", "text"], ["annual_leave_notice_days", "Annual leave notice (days)", "number"],
  ["self_certification_days", "Days before sickness evidence may be asked for", "number"], ["leave_year_label", "Leave year (if not in leave settings)", "text"],
  ["travel_class_rules", "Class of travel and accommodation", "text"], ["travel_assistance_contact", "Travel assistance contact", "text"],
  ["expense_limits_summary", "Expense limits (if not in travel settings)", "text"], ["claim_deadline_days", "Days to submit a claim", "number"],
  ["claim_dispute_days", "Days to dispute a claim decision", "number"], ["eap_contact", "Employee assistance contact", "text"],
];

export default function PolicyLibraryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return listPolicies().then((r) => setItems(r?.items || [])).catch((e) => setError(e.message || "Could not load policies."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const retry = async (p) => {
    try {
      const r = await retryPolicyKnowledgeSync(p.current_distribution.id);
      showToast(r.kb_sync_status === "SYNCED" ? "success" : "error",
        r.kb_sync_status === "SYNCED" ? "Mira now answers from the current version." : "The sync failed again. Check the assistant settings.");
      load();
    } catch (e) { showToast("error", e.message || "Could not sync."); }
  };

  return (
    <HRPage
      title="Company Policies"
      subtitle="Released policy versions, who has acknowledged them, and what the assistant answers from."
      actions={<SecondaryButton icon={Settings2} onClick={() => setSettingsOpen(true)}>Policy settings</SecondaryButton>}
    >
      <Toast toast={toast} />
      <ErrorBanner error={error} />
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Policies">
          {items.map((p) => <PolicyCard key={p.canonical_id} policy={p} onPublish={() => setPublishing({ policy: p })}
            onPublishDraft={(d) => setPublishing({ policy: p, draftId: d.id })} onRetry={() => retry(p)} />)}
        </ul>
      )}
      <PublishWizard open={Boolean(publishing)} policy={publishing?.policy} draftId={publishing?.draftId} onClose={() => setPublishing(null)}
        onDone={(msg) => { setPublishing(null); showToast("success", msg); load(); }} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); showToast("success", "Policy settings saved."); load(); }} />
    </HRPage>
  );
}

function PolicyCard({ policy: p, onPublish, onPublishDraft, onRetry }) {
  const active = p.active_versions || [];
  const current = p.current_distribution;
  const stats = current?.stats;
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">{p.canonical_id}</p>
          <h2 className="text-base font-semibold text-slate-900">{p.title}</h2>
          <p className="text-xs text-slate-600">Owner: {p.owner_name || "not set"}</p>
        </div>
        <Link to={`/zoiko-hr/documents/templates/${encodeURIComponent(p.canonical_id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
          <BookOpen size={14} aria-hidden="true" /> Edit content
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-slate-500">Released version</dt>
          <dd className="font-medium text-slate-800">{active.length ? active.map((v) => `v${v.version}`).join(", ") : "None released"}</dd></div>
        <div><dt className="text-xs text-slate-500">Effective from / next review</dt>
          <dd className="text-slate-800">{active[0] ? `${fmtDate(active[0].effective_from)} / ${fmtDate(active[0].review_due)}` : "—"}</dd></div>
        <div><dt className="text-xs text-slate-500">Published</dt>
          <dd className="text-slate-800">{current ? `v${current.version} · ${fmtDateTime(current.published_at)}` : "Not published"}</dd></div>
        <div><dt className="text-xs text-slate-500">Acknowledged</dt>
          <dd className="text-slate-800">{stats ? `${stats.acknowledged} of ${stats.recipients}${stats.overdue ? ` · ${stats.overdue} overdue` : ""}` : "—"}</dd></div>
      </dl>
      {current && (
        <p className={`mt-2 inline-flex items-center gap-1 text-xs ${current.kb_sync_status === "FAILED" ? "text-red-700" : "text-slate-600"}`}>
          <Bot size={14} aria-hidden="true" /> {SYNC_TEXT[current.kb_sync_status] || "Not yet synced to Mira"}
          {current.kb_sync_status === "FAILED" && <button type="button" onClick={onRetry} className="ml-1 font-semibold underline">Retry</button>}
        </p>
      )}
      {(p.draft_distributions || []).map((d) => (
        <div key={d.id} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          A new version was released. Employees must acknowledge it again.
          <button type="button" onClick={() => onPublishDraft(d)} className="ml-2 font-semibold underline">Review and publish</button>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton icon={Send} onClick={onPublish} disabled={!active.length}>Publish</PrimaryButton>
        <Link to="/zoiko-hr/documents/policy-distributions" className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Users size={16} aria-hidden="true" /> Track distributions
        </Link>
      </div>
    </li>
  );
}

function useDepartments(open) {
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    if (!open) return;
    getDepartments().then((r) => { const d = r?.data; setDepartments(Array.isArray(d) ? d : d?.items || []); }).catch(() => setDepartments([]));
  }, [open]);
  return departments;
}

const blank = { audienceType: "all", departments: [], employees: {}, requires: "ACKNOWLEDGE", due_date: "", reminder_days: "7, 1", newJoiners: true };

export function PublishWizard({ open, policy, draftId, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const departments = useDepartments(open && !draftId);

  useEffect(() => { if (open) { setStep(draftId ? 3 : 1); setForm(blank); setPreview(null); setError(null); setBusy(false); } }, [open, draftId]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const audience = useMemo(() => {
    if (form.audienceType === "departments") return { type: "departments", ids: form.departments.map(Number) };
    if (form.audienceType === "employees") return { type: "employees", ids: Object.keys(form.employees).map(Number) };
    return { type: "all", ids: [] };
  }, [form]);

  const runPreview = async () => {
    if (audience.type !== "all" && !audience.ids.length) { setError("Choose at least one audience value."); return; }
    setBusy(true); setError(null);
    try { setPreview(await previewPolicyAudience(policy.canonical_id, audience)); setStep(3); }
    catch (e) { setError(e.message || "Could not preview the recipients."); }
    finally { setBusy(false); }
  };

  const publish = async (confirmPartial = false) => {
    setBusy(true); setError(null);
    try {
      let id = draftId;
      if (!id) {
        const reminders = form.reminder_days.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
        const d = await createPolicyDistribution({ canonical_id: policy.canonical_id, audience, requires: form.requires,
          due_date: form.due_date || null, reminder_days: reminders, auto_include_new_joiners: form.newJoiners });
        id = d.id;
      }
      const r = await publishPolicyDistribution(id, confirmPartial);
      if (!r.published) {
        setPreview({ recipients: (r.ready || 0) + (r.blocked || 0), blocked: r.blocked, ready: r.ready, checked: (r.ready || 0) + (r.blocked || 0),
          reasons: summarize(r.results), publishedLater: true, distributionId: id });
        setBusy(false);
        return;
      }
      onDone(`Published to ${r.ready} ${r.ready === 1 ? "person" : "people"}.`);
    } catch (e) { setError(e.message || "Could not publish."); setBusy(false); }
  };

  if (!policy) return null;
  return (
    <Modal open={open} onClose={busy ? undefined : onClose} size="xl" icon={Megaphone} title={`Publish ${policy.title}`}
      description={draftId ? "Re-acknowledgement of the new version, to the same audience as before." : `Step ${step} of 3`}
      footer={
        <>
          <SecondaryButton onClick={step === 1 || draftId ? onClose : () => setStep(step - 1)} disabled={busy}>{step === 1 || draftId ? "Cancel" : "Back"}</SecondaryButton>
          {step === 1 && <PrimaryButton onClick={() => setStep(2)}>Next</PrimaryButton>}
          {step === 2 && <PrimaryButton loading={busy} onClick={runPreview}>Preview recipients</PrimaryButton>}
          {step === 3 && (preview?.publishedLater
            ? <PrimaryButton loading={busy} onClick={() => publish(true)} disabled={!preview.ready}>Publish to the {preview.ready} ready</PrimaryButton>
            : <PrimaryButton loading={busy} icon={Send} onClick={() => publish(false)}>Publish now</PrimaryButton>)}
        </>
      }>
      <ErrorBanner error={error} />
      {step === 1 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Who should receive it?</legend>
          {[["all", "Everyone"], ["departments", "Departments"], ["employees", "Selected employees"]].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="pw-aud" checked={form.audienceType === k} onChange={() => set("audienceType", k)} className="accent-blue-600" />{label}</label>
          ))}
          {form.audienceType === "departments" && (
            <select multiple aria-label="Departments" value={form.departments.map(String)} className={inputCls}
              onChange={(e) => set("departments", Array.from(e.target.selectedOptions).map((o) => o.value))}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {form.audienceType === "employees" && <EmployeePicker value={form.employees} onChange={(v) => set("employees", v)} idPrefix="pw-emp" />}
        </fieldset>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">What employees do
            <select value={form.requires} onChange={(e) => set("requires", e.target.value)} className={inputCls}>
              <option value="ACKNOWLEDGE">Acknowledge they have read it</option>
              <option value="SIGN">Sign it</option>
            </select>
          </label>
          <label className="text-sm">Due date
            <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">Reminders (days before the due date)
            <input value={form.reminder_days} onChange={(e) => set("reminder_days", e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.newJoiners} onChange={(e) => set("newJoiners", e.target.checked)} className="accent-blue-600" />
            Send to new joiners in this audience automatically</label>
          <p className="sm:col-span-2 text-xs text-slate-600">Acknowledging confirms that someone received and read the policy. It is not a signature and not consent.</p>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-2 text-sm">
          {preview ? (
            <>
              <p className="flex items-center gap-2 font-medium text-slate-800"><CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />
                {preview.recipients} {preview.recipients === 1 ? "person" : "people"} in this audience; {preview.ready} ready{preview.blocked ? `, ${preview.blocked} blocked` : ""}.</p>
              {preview.reasons?.length > 0 && (
                <ul className="list-disc pl-5 text-amber-900">
                  {preview.reasons.map((r) => <li key={r.code}>{reasonText(r.code)} ({r.count})</li>)}
                </ul>
              )}
              {preview.checked < preview.recipients && <p className="text-xs text-slate-500">The first {preview.checked} were checked in advance; everyone is checked again when you publish.</p>}
            </>
          ) : <p className="text-slate-700">Everyone in the previous audience will receive the new version and be asked to acknowledge it again.</p>}
        </div>
      )}
    </Modal>
  );
}

function summarize(results = []) {
  const counts = {};
  results.filter((r) => r.outcome !== "ALLOW").forEach((r) => (r.reasons || []).forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
  return Object.entries(counts).map(([code, count]) => ({ code, count }));
}

function SettingsModal({ open, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    getPolicySettings().then((r) => setValues(r?.settings || {})).catch((e) => setError(e.message || "Could not load settings."));
  }, [open]);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = Object.fromEntries(SETTING_FIELDS.map(([k, , t]) => [k, values[k] === "" || values[k] == null ? null : t === "number" ? Number(values[k]) : values[k]]));
      await updatePolicySettings(body);
      onSaved();
    } catch (e) { setError(e.message || "Could not save."); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={busy ? undefined : onClose} size="xl" icon={Settings2} title="Policy settings"
      description="These values appear in your policies. A policy that needs a value you have not set cannot be published; nothing is filled in for you."
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton loading={busy} onClick={save}>Save</PrimaryButton></>}>
      <ErrorBanner error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {SETTING_FIELDS.map(([k, label, type]) => (
          <label key={k} className="text-sm">{label}
            <input type={type} min={type === "number" ? 0 : undefined} value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} className={inputCls} />
          </label>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><RefreshCw size={12} aria-hidden="true" /> The standard working day is set in Working Time settings.</p>
    </Modal>
  );
}
