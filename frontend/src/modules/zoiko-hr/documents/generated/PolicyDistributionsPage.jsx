// Policy distributions (HR-DOC-014): send a released policy template to a group of employees for acknowledgement or
// signature, track who has read it, and close the campaign. Publishing checks every recipient first; when some are
// blocked HR sees why and can publish to the others only.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Megaphone, Pencil, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import { getDepartments, getDesignations } from "../../../../service/hrService";
import {
  closePolicyDistribution, createPolicyDistribution, listPolicyDistributions, listTemplates, publishPolicyDistribution, reasonText,
  updatePolicyDistribution,
} from "../../../../service/docTemplatesService";
import {
  EmployeePicker, ErrorBanner, ExportButtons, PrimaryButton, SecondaryButton, StatusChip, Toast, fmtDate, fmtDateTime, inputCls, useToast,
} from "./docUi";

const PER_PAGE = 20;
const AUDIENCE_TYPES = [
  ["all", "Everyone"],
  ["departments", "Departments"],
  ["designations", "Designations"],
  ["employment_types", "Employment types"],
  ["locations", "Locations"],
  ["employees", "Selected employees"],
];
const EMPLOYMENT_TYPES = [["full_time", "Full time"], ["part_time", "Part time"], ["contract", "Contract"], ["intern", "Intern"], ["probation", "Probation"]];
const REQUIRES_TEXT = { ACKNOWLEDGE: "Acknowledge", SIGN: "Sign" };

function audienceText(a) {
  if (!a || a.type === "all") return "Everyone";
  const label = (AUDIENCE_TYPES.find(([k]) => k === a.type) || [null, a.type])[1];
  return `${label} (${(a.ids || []).length})`;
}

export default function PolicyDistributionsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: PER_PAGE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | distribution
  const [publishing, setPublishing] = useState(null);
  const [closing, setClosing] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return listPolicyDistributions({ status, page, per_page: PER_PAGE })
      .then((r) => setData(r || { items: [], total: 0 }))
      .catch((e) => setError(e.message || "Could not load distributions."))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listTemplates({ per_page: 600 })
      .then((r) => setTemplates((r?.items || []).filter((t) => t.output_mode === "POLICY")))
      .catch(() => setTemplates([]));
  }, []);

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.per_page || PER_PAGE)));

  return (
    <HRPage
      title="Policy distributions"
      subtitle="Send a policy to employees for acknowledgement or signature and track who has read it (HR-DOC-014)."
      actions={
        <div className="flex flex-wrap gap-2">
          <SecondaryButton icon={RefreshCw} onClick={load}>Refresh</SecondaryButton>
          <PrimaryButton icon={Plus} onClick={() => setEditing("new")}>New distribution</PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pd-status" className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
            <select id="pd-status" className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>

        <ErrorBanner error={error} />

        {loading && <p className="text-sm text-slate-600">Loading distributions…</p>}
        {!loading && data.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <Megaphone className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">No policy distributions yet</p>
            <p className="mt-1 text-sm text-slate-600">Create one to send a released policy to your employees.</p>
          </div>
        )}

        <ul className="space-y-3">
          {!loading && data.items.map((d) => (
            <li key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{d.title}</h2>
                    <StatusChip status={d.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {d.canonical_id}{d.version ? ` · version ${d.version}` : ""} · {REQUIRES_TEXT[d.requires] || d.requires} · {audienceText(d.audience)}
                    {d.due_date ? ` · due ${fmtDate(d.due_date)}` : ""}
                    {d.auto_include_new_joiners ? " · new joiners included" : ""}
                  </p>
                  {d.published_at && <p className="text-xs text-slate-600">Published {fmtDateTime(d.published_at)}{d.closed_at ? ` · closed ${fmtDateTime(d.closed_at)}` : ""}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.status === "DRAFT" && (
                    <>
                      <SecondaryButton icon={Pencil} onClick={() => setEditing(d)}>Edit</SecondaryButton>
                      <PrimaryButton icon={Send} onClick={() => setPublishing(d)}>Publish</PrimaryButton>
                    </>
                  )}
                  {d.status === "PUBLISHED" && <SecondaryButton icon={Lock} onClick={() => setClosing(d)}>Close</SecondaryButton>}
                </div>
              </div>

              {d.stats && (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[["Recipients", d.stats.recipients], ["Sent", d.stats.sent], ["Viewed", d.stats.viewed],
                    [d.requires === "SIGN" ? "Signed" : "Acknowledged", d.stats.acknowledged], ["Overdue", d.stats.overdue], ["Reminders", d.stats.reminders]].map(([k, v]) => (
                    <div key={k} className={`rounded-lg border px-3 py-2 ${k === "Overdue" && v > 0 ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-slate-50"}`}>
                      <dt className="text-xs font-medium text-slate-600">{k}</dt>
                      <dd className="text-lg font-bold text-slate-900">{v ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {d.status !== "DRAFT" && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <Link to={`/zoiko-hr/documents/governance?report=distributions&distribution=${d.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" /> HR-DOC-014 distribution record
                  </Link>
                  <ExportButtons path={`/hr/generated-documents/governance/distributions/${d.id}`} filename={`HR-DOC-014-${d.id}`} size="sm" onError={(m) => showToast("error", m)} />
                </div>
              )}
            </li>
          ))}
        </ul>

        {data.total > PER_PAGE && (
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-700">
            <span>Page {data.page || page} of {totalPages}</span>
            <div className="flex gap-2">
              <SecondaryButton icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
              <SecondaryButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></SecondaryButton>
            </div>
          </nav>
        )}
      </div>

      <DistributionForm
        open={Boolean(editing)}
        distribution={editing === "new" ? null : editing}
        templates={templates}
        onClose={() => setEditing(null)}
        onSaved={(msg) => { setEditing(null); showToast("success", msg); load(); }}
      />
      <PublishModal
        distribution={publishing}
        onClose={() => setPublishing(null)}
        onPublished={(msg) => { setPublishing(null); showToast("success", msg); load(); }}
      />
      <CloseModal
        distribution={closing}
        onClose={() => setClosing(null)}
        onClosed={() => { setClosing(null); showToast("success", "Distribution closed."); load(); }}
      />
      <Toast toast={toast} />
    </HRPage>
  );
}

// ── create / edit ─────────────────────────────────────────────────────────────────────────────────────────────────────
function useOrgLists(open) {
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  useEffect(() => {
    if (!open) return;
    const list = (res) => {
      const body = res?.data ?? res;
      const arr = body?.items || body?.data || body;
      return Array.isArray(arr) ? arr : [];
    };
    getDepartments().then((r) => setDepartments(list(r))).catch(() => setDepartments([]));
    getDesignations().then((r) => setDesignations(list(r))).catch(() => setDesignations([]));
  }, [open]);
  return { departments, designations };
}

function CheckboxList({ idPrefix, options, value, onChange, label }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  if (!options.length) return <p className="text-sm text-slate-600">Nothing to choose from.</p>;
  return (
    <ul className="max-h-52 overflow-y-auto rounded-xl border border-gray-200" aria-label={label}>
      {options.map(([id, text]) => (
        <li key={id} className="border-b border-gray-100 last:border-0">
          <label htmlFor={`${idPrefix}-${id}`} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
            <input id={`${idPrefix}-${id}`} type="checkbox" className="h-4 w-4 accent-blue-600" checked={value.includes(id)} onChange={() => toggle(id)} />
            {text}
          </label>
        </li>
      ))}
    </ul>
  );
}

const emptyForm = { canonical_id: "", title: "", audienceType: "all", ids: [], employees: {}, locations: "", requires: "ACKNOWLEDGE", due_date: "", reminder_days: "7, 1", auto_include_new_joiners: true };

function DistributionForm({ open, distribution, templates, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { departments, designations } = useOrgLists(open);
  const isEdit = Boolean(distribution);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (!distribution) { setForm(emptyForm); return; }
    const a = distribution.audience || { type: "all", ids: [] };
    const ids = a.ids || [];
    setForm({
      canonical_id: distribution.canonical_id,
      title: distribution.title || "",
      audienceType: a.type || "all",
      ids: a.type === "employment_types" ? ids.map(String) : ids.map(Number),
      employees: a.type === "employees" ? Object.fromEntries(ids.map((i) => [i, `Employee #${i}`])) : {},
      locations: a.type === "locations" ? ids.join(", ") : "",
      requires: distribution.requires || "ACKNOWLEDGE",
      due_date: distribution.due_date || "",
      reminder_days: (distribution.reminder_days || []).join(", "),
      auto_include_new_joiners: distribution.auto_include_new_joiners !== false,
    });
  }, [open, distribution]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const choosable = useMemo(() => templates.filter((t) => t.implemented && t.available), [templates]);
  const unavailable = useMemo(() => templates.filter((t) => !(t.implemented && t.available)), [templates]);

  const audience = () => {
    const t = form.audienceType;
    if (t === "all") return { type: "all", ids: [] };
    if (t === "employees") return { type: t, ids: Object.keys(form.employees).map(Number) };
    if (t === "locations") return { type: t, ids: form.locations.split(",").map((s) => s.trim()).filter(Boolean) };
    return { type: t, ids: form.ids };
  };

  const save = async () => {
    if (!isEdit && !form.canonical_id) { setError("Choose a policy template."); return; }
    const aud = audience();
    if (aud.type !== "all" && !aud.ids.length) { setError("Choose at least one audience value."); return; }
    const reminders = form.reminder_days.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (reminders.some((n) => !Number.isInteger(n) || n < 0)) { setError("Reminder days must be whole numbers, e.g. 7, 1."); return; }
    const body = {
      title: form.title.trim() || null,
      audience: aud,
      requires: form.requires,
      due_date: form.due_date || null,
      reminder_days: reminders,
      auto_include_new_joiners: form.auto_include_new_joiners,
    };
    setBusy(true); setError(null);
    try {
      if (isEdit) await updatePolicyDistribution(distribution.id, body);
      else await createPolicyDistribution({ ...body, canonical_id: form.canonical_id, title: body.title || undefined });
      onSaved(isEdit ? "Draft saved." : "Draft distribution created.");
    } catch (e) {
      setError(e.message || "Could not save.");
      setBusy(false);
    }
  };

  const changeAudienceType = (t) => setForm((f) => ({ ...f, audienceType: t, ids: [], employees: {}, locations: "" }));

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? "Edit draft distribution" : "New policy distribution"}
      description="Saved as a draft. Nothing is sent until you publish it."
      icon={Megaphone}
      size="xl"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton loading={busy} onClick={save}>{isEdit ? "Save draft" : "Create draft"}</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="pd-template" className="mb-1.5 block text-sm font-medium text-slate-700">Policy template</label>
          {isEdit ? (
            <p id="pd-template" className="text-sm text-slate-900">{distribution.canonical_id}{distribution.version ? ` · version ${distribution.version}` : ""}</p>
          ) : (
            <>
              <select id="pd-template" className={inputCls} value={form.canonical_id} onChange={(e) => set("canonical_id", e.target.value)}>
                <option value="">Choose a policy…</option>
                {choosable.map((t) => <option key={t.canonical_id} value={t.canonical_id}>{t.canonical_id} · {t.title}</option>)}
              </select>
              {choosable.length === 0 && <p className="mt-1 text-xs text-slate-600">No policy template has a released version yet.</p>}
              {unavailable.length > 0 && (
                <p className="mt-1 text-xs text-slate-600">{unavailable.length} other polic{unavailable.length === 1 ? "y is" : "ies are"} not available yet (no released version).</p>
              )}
            </>
          )}
        </div>
        <div className="md:col-span-2">
          <label htmlFor="pd-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title <span className="font-normal text-slate-600">(optional, defaults to the template title)</span></label>
          <input id="pd-title" className={inputCls} maxLength={255} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pd-requires" className="mb-1.5 block text-sm font-medium text-slate-700">Employees must</label>
          <select id="pd-requires" className={inputCls} value={form.requires} onChange={(e) => set("requires", e.target.value)}>
            <option value="ACKNOWLEDGE">Acknowledge they have read it</option>
            <option value="SIGN">Sign it</option>
          </select>
        </div>
        <div>
          <label htmlFor="pd-due" className="mb-1.5 block text-sm font-medium text-slate-700">Due date</label>
          <input id="pd-due" type="date" className={inputCls} value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pd-reminders" className="mb-1.5 block text-sm font-medium text-slate-700">Reminders (days before due date)</label>
          <input id="pd-reminders" className={inputCls} value={form.reminder_days} onChange={(e) => set("reminder_days", e.target.value)} placeholder="7, 1" aria-describedby="pd-reminders-hint" />
          <p id="pd-reminders-hint" className="mt-1 text-xs text-slate-600">Comma-separated, up to 10.</p>
        </div>
        <div className="flex items-center">
          <label htmlFor="pd-joiners" className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input id="pd-joiners" type="checkbox" className="h-4 w-4 accent-blue-600" checked={form.auto_include_new_joiners} onChange={(e) => set("auto_include_new_joiners", e.target.checked)} />
            Send automatically to new joiners in this audience
          </label>
        </div>

        <fieldset className="md:col-span-2 space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Audience</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audience type">
            {AUDIENCE_TYPES.map(([k, label]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${form.audienceType === k ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 text-slate-700"}`}>
                <input type="radio" name="pd-audience" value={k} checked={form.audienceType === k} onChange={() => changeAudienceType(k)} className="accent-blue-600" />
                {label}
              </label>
            ))}
          </div>
          {form.audienceType === "departments" && (
            <CheckboxList idPrefix="pd-dept" label="Departments" value={form.ids} onChange={(v) => set("ids", v)}
              options={departments.map((d) => [Number(d.id), d.name || d.department_name || `Department #${d.id}`])} />
          )}
          {form.audienceType === "designations" && (
            <CheckboxList idPrefix="pd-desig" label="Designations" value={form.ids} onChange={(v) => set("ids", v)}
              options={designations.map((d) => [Number(d.id), d.title || d.name || `Designation #${d.id}`])} />
          )}
          {form.audienceType === "employment_types" && (
            <CheckboxList idPrefix="pd-etype" label="Employment types" value={form.ids} onChange={(v) => set("ids", v)} options={EMPLOYMENT_TYPES} />
          )}
          {form.audienceType === "locations" && (
            <div>
              <label htmlFor="pd-locations" className="mb-1 block text-xs font-semibold text-slate-600">Countries (2-letter code) or cities, comma-separated</label>
              <input id="pd-locations" className={inputCls} value={form.locations} onChange={(e) => set("locations", e.target.value)} placeholder="GB, IN, London" />
            </div>
          )}
          {form.audienceType === "employees" && (
            <EmployeePicker value={form.employees} onChange={(v) => set("employees", v)} idPrefix="pd-emp" max={5000} />
          )}
        </fieldset>
      </div>
      <ErrorBanner error={error} className="mt-4" />
    </Modal>
  );
}

// ── publish ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function PublishModal({ distribution, onClose, onPublished }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [check, setCheck] = useState(null); // publish response with published=false

  useEffect(() => { setBusy(false); setError(null); setCheck(null); }, [distribution]);

  const publish = async (confirmPartial) => {
    setBusy(true); setError(null);
    try {
      const res = await publishPolicyDistribution(distribution.id, confirmPartial);
      if (res?.published) {
        onPublished(`Published to ${res.ready} employee${res.ready === 1 ? "" : "s"}${res.blocked ? `; ${res.blocked} skipped` : ""}.`);
        return;
      }
      setCheck(res);
    } catch (e) {
      setError(e.message || "Could not publish.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = (check?.results || []).filter((r) => r.outcome !== "ALLOW");

  return (
    <Modal
      open={Boolean(distribution)}
      onClose={busy ? undefined : onClose}
      title="Publish distribution"
      description={distribution?.title}
      icon={Send}
      size={check ? "xl" : "md"}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          {!check && <PrimaryButton loading={busy} onClick={() => publish(false)}>Publish</PrimaryButton>}
          {check && check.ready > 0 && (
            <PrimaryButton loading={busy} onClick={() => publish(true)}>Publish to the others only ({check.ready})</PrimaryButton>
          )}
        </>
      }
    >
      {!check ? (
        <p className="text-sm text-slate-800">
          Every recipient is checked first. If everyone is ready, the policy is issued to all of them straight away.
          {distribution?.requires === "SIGN" ? " Each employee will be asked to sign it." : " Each employee will be asked to acknowledge it."}
        </p>
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm text-slate-800">
            {check.message || "Some recipients are blocked."} <strong>{check.ready}</strong> ready, <strong>{check.blocked}</strong> blocked.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Blocked recipients</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                <tr><th scope="col" className="px-3 py-2">Employee</th><th scope="col" className="px-3 py-2">Result</th><th scope="col" className="px-3 py-2">Why</th></tr>
              </thead>
              <tbody>
                {blocked.map((r) => (
                  <tr key={r.employee_id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <Link to={`/zoiko-hr/employee-management/employees/${r.employee_id}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline">Employee #{r.employee_id}</Link>
                    </td>
                    <td className="px-3 py-2"><StatusChip status={r.outcome} /></td>
                    <td className="px-3 py-2 text-xs text-slate-800">
                      <ul className="list-disc space-y-0.5 pl-4">
                        {(r.reasons || []).filter(Boolean).map((c) => <li key={c}>{reasonText(c)}</li>)}
                        {(r.missing_fields || []).filter((f) => !(r.reasons || []).includes(`MISSING_FIELD:${f}`)).map((f) => <li key={f}>Missing information: {f}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {check.ready === 0 && <p className="text-sm text-slate-700">Nobody is ready yet. Fix the problems above and publish again.</p>}
        </div>
      )}
      <ErrorBanner error={error} className="mt-3" />
    </Modal>
  );
}

function CloseModal({ distribution, onClose, onClosed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setBusy(false); setError(null); }, [distribution]);
  const close = async () => {
    setBusy(true); setError(null);
    try { await closePolicyDistribution(distribution.id); onClosed(); } catch (e) { setError(e.message || "Could not close."); setBusy(false); }
  };
  return (
    <Modal
      open={Boolean(distribution)}
      onClose={busy ? undefined : onClose}
      title="Close distribution"
      description={distribution?.title}
      icon={Lock}
      size="sm"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <SecondaryButton tone="danger" loading={busy} onClick={close}>Close distribution</SecondaryButton>
        </>
      }
    >
      <p className="text-sm text-slate-800">New joiners will no longer receive this policy. Documents already issued stay valid and on record.</p>
      <ErrorBanner error={error} className="mt-3" />
    </Modal>
  );
}
