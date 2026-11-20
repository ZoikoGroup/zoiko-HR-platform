import { useState } from "react";
import SectionState from "../components/SectionState";
import { useAutomationSettings, useSaveAutomationSettings } from "../hooks/useAutomation";

const FEATURE_LABEL = {
  onboarding: "Onboarding checklist and role changes", reminders: "Task reminders and escalation", expiry: "Expiry alerts and renewals",
  payslip_publish: "Payslip publishing", sla: "Review time target reminders", prechecks: "Upload pre-checks", policy_auto: "Policy publishing and read-confirmations",
  digest: "Weekly HR summary", esign_autofile: "File signed documents", ocr: "Read document text (OCR) for reviewers", offboarding: "Archive files of people who left",
  rules_ui: "Custom rules",
};

/**
 * Settings tab (docs/new_docs/ZHR-DOCS-ARCH-001 §15.3): which automations run, the review time target and how long after
 * someone leaves their files are archived. Pausing everything, quiet hours and sending limits are the Org Admin's.
 */
export default function AutomationOrgSettingsTab() {
  const query = useAutomationSettings();
  return (
    <SectionState query={query} label="Loading settings">
      {(s) => <SettingsForm key={JSON.stringify(s)} settings={s} />}
    </SectionState>
  );
}

function SettingsForm({ settings: s }) {
  const save = useSaveAutomationSettings();
  const [features, setFeatures] = useState(s.features || {});
  const [sla, setSla] = useState(s.approval_sla_hours);
  const [lockDays, setLockDays] = useState(s.lock_after_exit_days);
  const [paused, setPaused] = useState(Boolean(s.paused));
  const [quiet, setQuiet] = useState(Boolean(s.quiet_hours));
  const [qStart, setQStart] = useState(s.quiet_hours?.start || "20:00");
  const [qEnd, setQEnd] = useState(s.quiet_hours?.end || "08:00");
  const [qTz, setQTz] = useState(s.quiet_hours?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [cap, setCap] = useState(s.rate_limits?.reminders_per_employee_per_day ?? 5);
  const [notice, setNotice] = useState(null);
  const global = s.can_change_global;

  const submit = async (e) => {
    e.preventDefault();
    setNotice(null);
    const changes = { features, approval_sla_hours: Number(sla), lock_after_exit_days: Number(lockDays) };
    if (global) Object.assign(changes, { paused, quiet_hours: quiet ? { start: qStart, end: qEnd, tz: qTz } : null,
      rate_limits: { reminders_per_employee_per_day: Number(cap) } });
    try { await save.mutateAsync(changes); setNotice({ ok: true, text: "Saved." }); }
    catch (err) { setNotice({ ok: false, text: err?.message || "Not saved." }); }
  };

  return (
    <form onSubmit={submit} className="space-y-5 text-sm">
      {s.globally_paused && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-2 text-amber-900">Automation is paused for the whole platform right now. Nothing runs until it is resumed.</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold">Organization</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={paused} disabled={!global} onChange={(e) => setPaused(e.target.checked)} />
          Pause all document automation (things queue up and run when you resume)
        </label>
        {!global && <p className="mt-1 text-xs text-slate-500">Only the Org Admin can pause automation, set quiet hours or change sending limits.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={quiet} disabled={!global} onChange={(e) => setQuiet(e.target.checked)} /> Quiet hours for email
          </label>
          {quiet && (
            <>
              <label>From <input type="time" aria-label="Quiet hours start" value={qStart} disabled={!global} onChange={(e) => setQStart(e.target.value)} className="rounded border border-gray-200 px-1" /></label>
              <label>to <input type="time" aria-label="Quiet hours end" value={qEnd} disabled={!global} onChange={(e) => setQEnd(e.target.value)} className="rounded border border-gray-200 px-1" /></label>
              <label>Time zone <input aria-label="Quiet hours time zone" value={qTz} disabled={!global} onChange={(e) => setQTz(e.target.value)} className="w-40 rounded border border-gray-200 px-1" /></label>
            </>
          )}
        </div>
        <label className="mt-3 block">Reminders per person per day
          <input type="number" min={1} max={50} value={cap} disabled={!global} onChange={(e) => setCap(e.target.value)} className="ml-2 w-20 rounded border border-gray-200 px-1" />
        </label>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold">Timing</h3>
        <label className="block">Review documents within
          <input type="number" min={4} max={720} value={sla} onChange={(e) => setSla(e.target.value)} aria-label="Review target in hours" className="mx-2 w-20 rounded border border-gray-200 px-1" /> hours
        </label>
        <label className="mt-2 block">Archive the files of people who left after
          <input type="number" min={0} max={365} value={lockDays} onChange={(e) => setLockDays(e.target.value)} aria-label="Days after exit" className="mx-2 w-20 rounded border border-gray-200 px-1" /> days
        </label>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold">Automations</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.keys(FEATURE_LABEL).filter((k) => k in features).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(features[k])} onChange={(e) => setFeatures((f) => ({ ...f, [k]: e.target.checked }))} /> {FEATURE_LABEL[k]}
            </label>
          ))}
        </div>
      </section>
      {notice && <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "text-emerald-700" : "text-rose-700"}>{notice.text}</p>}
      <button type="submit" disabled={save.isPending} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">Save settings</button>
    </form>
  );
}
