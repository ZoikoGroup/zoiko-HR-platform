// Documents centre (Prompt 4 §C): the go-live tools for HR — team actions, automation per template, the country activation kit
// (what is unlocked or blocked and why, the clauses to write, the counsel review pack), retention, reporting and the mandatory
// training compliance report. Nothing here shows document contents.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe2 } from "lucide-react";
import { blockedText } from "../../../../components/documents/RecordDocumentsPanel";
import { OrganizationDocumentsLayout } from "../ui";
import {
  getActivationOverview, getAutomationRules, getCountryActivation, getDocumentReport, getRetentionQueue, getRetentionSettings, getTeamDocumentActions,
  getTemplateLanguages, getTrainingCompliance, reviewRetention, saveAutomationRules, saveRetentionSettings,
} from "../../../../service/goLiveService";
import { ErrorBanner, ExportButtons, PrimaryButton, SecondaryButton, Toast, fmtDate, inputCls, useToast } from "../generated/docUi";

const TABS = [["team", "Team actions"], ["activation", "Country activation"], ["automation", "Automation"], ["retention", "Retention"],
  ["reports", "Reports"], ["training", "Training compliance"], ["languages", "Languages"]];
const MODES = [["default", "Platform default"], ["off", "Off"], ["draft", "Create draft for HR"], ["auto", "Issue automatically"]];

export default function DocumentCentrePage() {
  const [tab, setTab] = useState("team");
  const [toast, showToast] = useToast();
  return (
    <OrganizationDocumentsLayout title="Dashboard" subtitle="Document readiness, country coverage, automation and compliance at a glance.">
      <div className="space-y-5">
      <Toast toast={toast} />
      <div role="tablist" aria-label="Documents centre" className="flex flex-wrap gap-2 rounded-2xl border border-gray-200/80 bg-white p-2 shadow-sm">
        {TABS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab === k ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>)}
      </div>
      {tab === "team" && <TeamActions />}
      {tab === "activation" && <Activation toast={showToast} />}
      {tab === "automation" && <Automation toast={showToast} />}
      {tab === "retention" && <Retention toast={showToast} />}
      {tab === "reports" && <Reports />}
      {tab === "training" && <Training />}
      {tab === "languages" && <Languages />}
      </div>
    </OrganizationDocumentsLayout>
  );
}

function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null });
  const reload = useCallback(() => fn().then((d) => setState({ data: d, error: null })).catch((e) => setState({ data: null, error: e?.message || "Could not load." })),
    deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return [state, reload];
}

function TeamActions() {
  const [{ data, error }] = useLoad(getTeamDocumentActions);
  if (error) return <ErrorBanner error={error} />;
  const items = data?.items || [];
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-label="Team actions">
      {items.length === 0 && <li className="p-4 text-sm text-slate-500">Nothing is waiting for you.</li>}
      {items.map((i) => <li key={`${i.kind}-${i.id}`} className="flex items-center justify-between gap-2 p-3 text-sm">
        <span>{i.title}{i.due_by ? <span className="ml-2 text-xs text-slate-500">due {fmtDate(i.due_by)}</span> : null}</span>
        <Link to={i.link} className="text-xs font-semibold text-blue-700 hover:underline">Open</Link></li>)}
    </ul>
  );
}

function Activation({ toast }) {
  const [{ data, error }] = useLoad(getActivationOverview);
  const [country, setCountry] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => { if (country) getCountryActivation(country).then(setDetail).catch((e) => toast("error", e.message)); }, [country, toast]);
  if (error) return <ErrorBanner error={error} />;
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 md:grid-cols-3" aria-label="Countries in use">
        {(data?.countries || []).map((c) => (
          <li key={c.country}>
            <button type="button" onClick={() => setCountry(c.country)} className={`w-full rounded-2xl border p-4 text-left ${country === c.country ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
              <p className="flex items-center gap-2 font-semibold"><Globe2 size={16} aria-hidden="true" /> {c.country_name}</p>
              <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100}
                aria-label={`${c.progress}% of templates unlocked`}><div className="h-2 rounded-full bg-blue-600" style={{ width: `${c.progress}%` }} /></div>
              <p className="mt-1 text-xs text-slate-600">{c.unlocked} of {c.total} templates unlocked · {c.clauses_to_write} clauses to write ·
                {c.packs.length ? ` ${c.packs.map((p) => `${p.scope_type.toLowerCase()} pack`).join(", ")}` : " no active pack"}</p>
            </button>
          </li>
        ))}
        {(data?.countries || []).length === 0 && <li className="text-sm text-slate-500">No work countries recorded yet.</li>}
      </ul>
      {detail && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label={`Activation for ${detail.country_name}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{detail.country_name}: {detail.unlocked} of {detail.total} unlocked</h2>
            <ExportButtons path={`/hr/document-centre/activation/${detail.country}/counsel-pack`} filename={`counsel-review-pack-${detail.country}`}
              onError={(m) => toast("error", m)} />
          </div>
          <p className="text-xs text-slate-600">Send the counsel review pack to your lawyer: it lists every starter and the clauses to write for this country.
            Activate your own pack in <Link to="/zoiko-hr/documents/jurisdiction-packs" className="font-semibold text-blue-700 underline">Jurisdiction packs</Link> (organization attestation).</p>
          <details open><summary className="cursor-pointer text-sm font-semibold">Clauses to write ({detail.clauses.filter((c) => !c.released && !c.starter_text).length})</summary>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Clause</th><th>Mandatory in</th><th>Starter text</th><th>Released</th></tr></thead>
              <tbody>{detail.clauses.map((c) => <tr key={c.clause_key} className="border-t border-slate-100"><td className="py-1 font-mono text-xs">{c.clause_key}</td>
                <td className="text-xs">{c.mandatory_in.join(", ") || "optional"}</td><td>{c.starter_text ? "yes" : "no"}</td><td>{c.released ? "yes" : "no"}</td></tr>)}</tbody></table>
          </details>
          <details><summary className="cursor-pointer text-sm font-semibold">Templates</summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">{detail.templates.map((t) => <li key={t.canonical_id} className="py-1">
              <span className="font-mono text-xs">{t.canonical_id}</span> {t.title}: {t.unlocked ? <span className="text-emerald-700">unlocked</span>
                : <span className="text-amber-800">{t.reasons.map(blockedText).join(" ")}</span>}</li>)}</ul>
          </details>
        </section>
      )}
    </div>
  );
}

function Automation({ toast }) {
  const [{ data, error }, reload] = useLoad(getAutomationRules);
  const change = (cid, mode) => saveAutomationRules({ [cid]: mode }).then(() => { toast("success", "Saved."); reload(); })
    .catch((e) => toast("error", e.detail?.message || e.message));
  if (error) return <ErrorBanner error={error} />;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Automation rules">
      <p className="mb-2 text-sm text-slate-600">What a trigger (a leave decision, a roster, an approval) does with its document. Only notices and records that need
        no approval or signature can be issued automatically. Every automated action is recorded with the event that caused it.</p>
      <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Template</th><th>Approval</th><th>Mode</th></tr></thead>
        <tbody>{(data?.rules || []).map((r) => <tr key={r.canonical_id} className="border-t border-slate-100"><td className="py-1"><span className="font-mono text-xs">{r.canonical_id}</span> {r.title}</td>
          <td className="text-xs">{r.approval_policy} · {r.execution_mode.toLowerCase()}</td>
          <td><select aria-label={`Mode for ${r.canonical_id}`} className={`${inputCls} w-auto`} value={r.mode} onChange={(e) => change(r.canonical_id, e.target.value)}>
            {MODES.filter(([k]) => k !== "auto" || r.auto_allowed).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>)}</tbody></table>
    </section>
  );
}

function Retention({ toast }) {
  const [{ data: settings }, reloadSettings] = useLoad(getRetentionSettings);
  const [{ data: queue }, reloadQueue] = useLoad(getRetentionQueue);
  const [values, setValues] = useState({});
  useEffect(() => { if (settings) setValues(Object.fromEntries(settings.rules.map((r) => [r.rule_key, r.years ?? ""]))); }, [settings]);
  const save = () => saveRetentionSettings(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : Number(v)])))
    .then(() => { toast("success", "Retention saved."); reloadSettings(); }).catch((e) => toast("error", e.message));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Retention durations">
        <p className="mb-2 text-xs text-slate-600">{settings?.note}</p>
        {(settings?.rules || []).map((r) => <label key={r.rule_key} className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="font-mono text-xs">{r.rule_key}</span>
          <input type="number" min="1" max="100" placeholder="years" className={`${inputCls} w-24`} value={values[r.rule_key] ?? ""}
            onChange={(e) => setValues({ ...values, [r.rule_key]: e.target.value })} /></label>)}
        <PrimaryButton className="mt-2" onClick={save}>Save (organization admin)</PrimaryButton>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Retention review queue">
        <p className="mb-2 text-sm">{queue?.retention_not_configured ?? 0} documents have no retention rule yet (kept, flagged “retention not configured”).</p>
        <ul className="divide-y divide-slate-100 text-sm">{(queue?.due_for_review || []).map((d) => <li key={d.id} className="flex items-center justify-between py-2">
          <span>{d.document_number} · past {fmtDate(d.retention_until)}{d.legal_hold ? " · legal hold" : ""}</span>
          <span className="flex gap-2"><SecondaryButton onClick={() => reviewRetention(d.id, { decision: "keep" }).then(reloadQueue)}>Keep</SecondaryButton>
            <SecondaryButton onClick={() => reviewRetention(d.id, { decision: "extend", years: 1 }).then(reloadQueue)}>Extend 1 year</SecondaryButton></span></li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Disposal and destruction certificates are not part of this release.</p>
      </section>
    </div>
  );
}

function Reports() {
  const [{ data, error }] = useLoad(getDocumentReport);
  if (error) return <ErrorBanner error={error} />;
  if (!data) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold">Documents by status</h3>
        <ul className="text-sm">{Object.entries(data.by_status).map(([k, v]) => <li key={k}>{k.toLowerCase().replace(/_/g, " ")}: {v}</li>)}</ul>
        <p className="mt-2 text-sm">Overdue: {Object.entries(data.overdue).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}</p>
        <p className="text-sm">Average time to sign: {data.average_hours_to_sign != null ? `${data.average_hours_to_sign} hours` : "—"}</p>
        <p className="text-sm">Certifications expiring in 60 days: {data.certifications_expiring_60_days}</p></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold">Policy acknowledgement by department</h3>
        <ul className="text-sm">{data.policy_acknowledgement_by_department.map((r) => <li key={r.department}>{r.department}: {r.suppressed ? `fewer than ${data.small_group_threshold} people (hidden)` : `${r.rate}% of ${r.recipients}`}</li>)}</ul></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2"><h3 className="mb-2 text-sm font-semibold">Why documents could not be generated (90 days)</h3>
        <ul className="text-sm">{data.blocked_generations_90_days.map((b) => <li key={b.reason}>{blockedText(b.reason)} — {b.count}</li>)}</ul></section>
    </div>
  );
}

function Training() {
  const [{ data, error }] = useLoad(getTrainingCompliance);
  if (error) return <ErrorBanner error={error} />;
  return (
    <div className="space-y-3">
      {(data?.courses || []).length === 0 && <p className="text-sm text-slate-500">No mandatory courses.</p>}
      {(data?.courses || []).map((c) => <section key={c.course_id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">{c.course} · {c.overdue_employee_ids.length} not complete or expired</h3>
        <ul className="text-sm">{c.departments.map((d) => <li key={d.department}>{d.department}: {d.suppressed ? `fewer than ${data.small_group_threshold} people (hidden)`
          : `${d.complete}/${d.required} complete, ${d.expired} expired, ${d.missing} missing`}</li>)}</ul></section>)}
    </div>
  );
}

function Languages() {
  const [{ data, error }] = useLoad(getTemplateLanguages);
  if (error) return <ErrorBanner error={error} />;
  const rows = Object.entries(data?.templates || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Languages per template">
      <p className="mb-2 text-sm text-slate-600">Languages with a released variant you can use. Right-to-left languages are marked; their packs stay inactive until
        their fonts are installed.</p>
      {rows.length === 0 ? <p className="text-sm text-slate-500">No released variants yet.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">{rows.map(([cid, langs]) => <li key={cid} className="py-1"><span className="font-mono text-xs">{cid}</span>{" "}
          {langs.map((l) => `${l.language}${l.direction === "rtl" ? " (right to left)" : ""}`).join(", ")}</li>)}</ul>)}
    </section>
  );
}
