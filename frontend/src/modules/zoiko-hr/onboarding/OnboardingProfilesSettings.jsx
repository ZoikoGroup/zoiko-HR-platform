/*
 * Onboarding › Settings › Engagement and Role Profiles.
 * - Engagement Profile: what the person is called in the documents, the assessment / probation period, how pay is described,
 *   working days and hours, the leave rule. "Standard Employee" is built in and read-only (duplicate it to change wording).
 * - Role Profile: the role's own text — about the role, grouped responsibilities, offer-letter duties, contract duties, skills,
 *   work setup, performance structure and KPI areas. A hire's documents print only their role's text; with no matching role
 *   they stay drafts.
 * Grouped lists are edited as plain text: one block per group (blank line between), first line the heading, then one bullet per
 * line. In KPI areas a line starting "Success:" is the area's "Success looks like" statement.
 */
import { useEffect, useState } from "react";
import { Briefcase, Copy, Loader2, Pencil, Plus, Save, Star, Trash2, Users, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { deleteEngagementProfile, deleteRoleProfile, getOnboardingProfiles, saveEngagementProfile, saveRoleProfile }
  from "../../../service/hrService";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const DAYS = [["MON", "Mon"], ["TUE", "Tue"], ["WED", "Wed"], ["THU", "Thu"], ["FRI", "Fri"], ["SAT", "Sat"], ["SUN", "Sun"]];

const slugify = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-")
  .replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const lines = (text) => (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
const toLines = (list) => (list || []).join("\n");
const bullet = (l) => l.replace(/^[-•*]\s*/, "");

export const groupsToText = (groups) => (groups || []).map((g) => [g.heading, ...(g.bullets || []).map((b) => `- ${b}`)].join("\n")).join("\n\n");
export const textToGroups = (text) => (text || "").split(/\n\s*\n/).map((block) => lines(block)).filter((b) => b.length)
  .map(([heading, ...rest]) => ({ heading: bullet(heading), bullets: rest.map(bullet) }));
export const kpisToText = (areas) => (areas || []).map((a) => [a.title, ...(a.bullets || []).map((b) => `- ${b}`),
  ...(a.success ? [`Success: ${a.success}`] : [])].join("\n")).join("\n\n");
export const textToKpis = (text) => (text || "").split(/\n\s*\n/).map((block) => lines(block)).filter((b) => b.length)
  .map(([title, ...rest]) => ({
    title: bullet(title),
    bullets: rest.filter((l) => !/^success\s*:/i.test(l)).map(bullet),
    success: (rest.find((l) => /^success\s*:/i.test(l)) || "").replace(/^success\s*:\s*/i, ""),
  }));

function TextArea({ id, label, value, onChange, rows = 3, hint }) {
  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className={labelCls}>{label}</label>
      <textarea id={id} rows={rows} className={inputCls} value={value || ""} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Input({ id, label, value, onChange, type = "text", hint }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} type={type} className={inputCls} value={value ?? ""} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function EngagementForm({ draft, set }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input id="ep-name" label="Profile name" value={draft.name} onChange={(v) => set({ name: v })} hint="e.g. Graduate Programme Associate" />
      <Input id="ep-party" label="What the person is called" value={draft.party_term} onChange={(v) => set({ party_term: v })} hint="e.g. Employee" />
      <Input id="ep-prog" label="Programme name" value={draft.programme_name} onChange={(v) => set({ programme_name: v })} />
      <Input id="ep-prog-s" label="Programme short name" value={draft.programme_short} onChange={(v) => set({ programme_short: v })} />
      <Input id="ep-eterm" label="What the engagement is called" value={draft.engagement_term} onChange={(v) => set({ engagement_term: v })} hint="e.g. employment" />
      <Input id="ep-etype" label="Employment type" value={draft.employment_type} onChange={(v) => set({ employment_type: v })} />
      <div>
        <label htmlFor="ep-rtype" className={labelCls}>Pay type</label>
        <select id="ep-rtype" className={inputCls} value={draft.remuneration_type || "salary"} onChange={(e) => set({ remuneration_type: e.target.value })}>
          <option value="salary">Salary</option><option value="stipend">Stipend</option><option value="fee">Fee</option>
        </select>
      </div>
      <Input id="ep-rlabel" label="How pay is described" value={draft.remuneration_label} onChange={(v) => set({ remuneration_label: v })} hint="e.g. Monthly Stipend" />
      <Input id="ep-amonths" label="Assessment / probation (months)" type="number" value={draft.assessment_months} onChange={(v) => set({ assessment_months: v === "" ? null : v })} />
      <Input id="ep-alabel" label="Name of that period" value={draft.assessment_label} onChange={(v) => set({ assessment_label: v })} hint="e.g. Probation" />
      <fieldset className="sm:col-span-2">
        <legend className={labelCls}>Working days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="checkbox" className="rounded border-gray-300" checked={(draft.working_days || []).includes(code)}
                onChange={(e) => set({ working_days: e.target.checked ? [...(draft.working_days || []), code]
                  : (draft.working_days || []).filter((d) => d !== code) })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Input id="ep-start" label="Start time" type="time" value={draft.start_time} onChange={(v) => set({ start_time: v })} />
      <Input id="ep-end" label="End time" type="time" value={draft.end_time} onChange={(v) => set({ end_time: v })} />
      <Input id="ep-tz" label="Time zone label" value={draft.timezone_label} onChange={(v) => set({ timezone_label: v })} hint="e.g. IST" />
      <Input id="ep-sched" label="Work schedule (optional override)" value={draft.work_schedule} onChange={(v) => set({ work_schedule: v })}
        hint="Generated from the days and times when blank" />
      <TextArea id="ep-sat" label="Saturday rule" rows={2} value={draft.saturday_rule} onChange={(v) => set({ saturday_rule: v })} />
      <TextArea id="ep-conv" label="Programme structure & conversion pathway" rows={4} value={draft.conversion_text} onChange={(v) => set({ conversion_text: v })} />
      <TextArea id="ep-leave" label="Leave rule" rows={3} value={draft.leave_rule} onChange={(v) => set({ leave_rule: v })} />
      <Input id="ep-accr" label="Leave accrual (days per month)" type="number" value={draft.leave_accrual_days_per_month} onChange={(v) => set({ leave_accrual_days_per_month: v === "" ? null : v })} />
      <Input id="ep-cap" label="Leave cap in the period (days)" type="number" value={draft.leave_cap_in_period} onChange={(v) => set({ leave_cap_in_period: v === "" ? null : v })} />
      <Input id="ep-paid" label="Paid leave after (months)" type="number" value={draft.paid_leave_after_months} onChange={(v) => set({ paid_leave_after_months: v === "" ? null : v })} />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" className="rounded border-gray-300" checked={!!draft.carry_forward_on_conversion} onChange={(e) => set({ carry_forward_on_conversion: e.target.checked })} />
        Leave carries forward on conversion
      </label>
      <TextArea id="ep-ws" label="Workspace & equipment requirements (one per line)" rows={4} value={toLines(draft.workspace_requirements)}
        onChange={(v) => set({ workspace_requirements: v.split("\n") })} />
      <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
        <input type="checkbox" className="rounded border-gray-300" checked={!!draft.default} onChange={(e) => set({ default: e.target.checked })} />
        Use for new hires by default
      </label>
    </div>
  );
}

function RoleForm({ draft, set }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Input id="rp-title" label="Role title (matched to the hire's position)" value={draft.title} onChange={(v) => set({ title: v })} /></div>
      <TextArea id="rp-about" label="About the role (blank line between paragraphs)" rows={4}
        value={(draft.about || []).join("\n\n")} onChange={(v) => set({ about: v.split(/\n\s*\n/) })} />
      <TextArea id="rp-groups" label="Key responsibilities (heading, then one bullet per line; blank line between groups)" rows={8}
        value={draft._groups ?? groupsToText(draft.responsibility_groups)} onChange={(v) => set({ _groups: v })} />
      <TextArea id="rp-offer" label="Offer letter duties (one per line, e.g. “Label: sentence”)" rows={4}
        value={toLines(draft.offer_responsibilities)} onChange={(v) => set({ offer_responsibilities: v.split("\n") })} />
      <TextArea id="rp-duties" label="Contract duties paragraph (the offer duties are used when blank)" rows={4}
        value={draft.contract_duties} onChange={(v) => set({ contract_duties: v })} />
      <TextArea id="rp-skills" label="Required skills (one per line)" rows={4} value={toLines(draft.required_skills)} onChange={(v) => set({ required_skills: v.split("\n") })} />
      <TextArea id="rp-setup" label="Work setup requirements (one per line)" rows={3} value={toLines(draft.work_setup)} onChange={(v) => set({ work_setup: v.split("\n") })} />
      <TextArea id="rp-perf" label="Performance structure (one per line)" rows={3} value={toLines(draft.performance_structure)} onChange={(v) => set({ performance_structure: v.split("\n") })} />
      <TextArea id="rp-kpi" label="KPI areas (title, bullets, then “Success: …”; blank line between areas)" rows={8}
        value={draft._kpis ?? kpisToText(draft.kpi_areas)} onChange={(v) => set({ _kpis: v })} />
    </div>
  );
}

const ENGAGEMENT_KEYS = ["name", "programme_name", "programme_short", "party_term", "engagement_term", "employment_type", "remuneration_type",
  "remuneration_label", "assessment_months", "assessment_label", "conversion_text", "working_days", "start_time", "end_time", "timezone_label",
  "work_schedule", "saturday_rule", "leave_rule", "leave_accrual_days_per_month", "leave_cap_in_period", "paid_leave_after_months",
  "carry_forward_on_conversion", "workspace_requirements", "default"];
const ROLE_KEYS = ["title", "about", "offer_responsibilities", "contract_duties", "required_skills", "work_setup", "performance_structure"];

const clean = (v) => (Array.isArray(v) ? v.map((s) => (typeof s === "string" ? s.trim() : s)).filter((s) => s !== "") : v);

export default function OnboardingProfilesSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);       // {kind: "engagement" | "role", slug, isNew, draft}
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let live = true;
    getOnboardingProfiles().then((res) => live && setData(res))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "Profiles could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const open = (kind, profile, { duplicate = false } = {}) => {
    const draft = profile ? { ...profile } : (kind === "engagement" ? { working_days: ["MON", "TUE", "WED", "THU", "FRI"], remuneration_type: "salary" } : {});
    if (duplicate) {
      draft.name = `${profile.name || profile.title} (copy)`;
      if (kind === "role") draft.title = `${profile.title} (copy)`;
      draft.default = false;
    }
    setErrors({});
    setEditing({ kind, isNew: !profile || duplicate, slug: profile && !duplicate ? profile.slug : "", draft });
  };

  const save = async () => {
    const { kind, isNew, draft } = editing;
    const slug = isNew ? slugify(kind === "role" ? draft.title : draft.name) : editing.slug;
    if (!slug) { setErrors({ [kind === "role" ? "title" : "name"]: "Required." }); return; }
    const keys = kind === "role" ? ROLE_KEYS : ENGAGEMENT_KEYS;
    const payload = Object.fromEntries(keys.filter((k) => k in draft).map((k) => [k, clean(draft[k])]));
    if (kind === "role") {
      payload.responsibility_groups = textToGroups(draft._groups ?? groupsToText(draft.responsibility_groups));
      payload.kpi_areas = textToKpis(draft._kpis ?? kpisToText(draft.kpi_areas));
      if (Array.isArray(payload.about)) payload.about = payload.about.map((p) => p.trim()).filter(Boolean);
    }
    setBusy(true);
    setMsg(null);
    try {
      setData(kind === "role" ? await saveRoleProfile(slug, payload) : await saveEngagementProfile(slug, payload));
      setEditing(null);
      setMsg({ tone: "ok", text: "Profile saved. Documents generated from now on use it." });
    } catch (e) {
      setErrors(e?.detail?.errors || {});
      setMsg({ tone: "error", text: e?.message || "The profile could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind, profile) => {
    if (!window.confirm(`Delete “${profile.name || profile.title}”? Documents already sent are not changed.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      setData(kind === "role" ? await deleteRoleProfile(profile.slug) : await deleteEngagementProfile(profile.slug));
      setMsg({ tone: "ok", text: "Profile deleted." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The profile could not be deleted." });
    } finally {
      setBusy(false);
    }
  };

  const List = ({ kind, items, icon: Icon, title, empty }) => (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon className="h-4 w-4 text-gray-500" />{title}</h3>
        <SecondaryButton icon={Plus} onClick={() => open(kind, null)} disabled={busy}>New</SecondaryButton>
      </div>
      {items.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">{empty}</p> : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
          {items.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{p.name || p.title}</span>
                <span className="block truncate text-xs text-gray-500">
                  {kind === "engagement" ? `${p.party_term || "—"} · ${p.assessment_label || "—"} · ${p.remuneration_label || "—"}`
                    : `${(p.responsibility_groups || []).length} responsibility group(s) · ${(p.kpi_areas || []).length} KPI area(s)`}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {p.default && <StatusPill tone="blue" icon={Star}>Default</StatusPill>}
                {p.builtin && <StatusPill tone="gray">Built in</StatusPill>}
                {!p.builtin && <button type="button" onClick={() => open(kind, p)} aria-label={`Edit ${p.name || p.title}`} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>}
                <button type="button" onClick={() => open(kind, p, { duplicate: true })} aria-label={`Duplicate ${p.name || p.title}`} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Copy className="h-4 w-4" /></button>
                {!p.builtin && <button type="button" onClick={() => remove(kind, p)} aria-label={`Delete ${p.name || p.title}`} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section id="onboarding-profiles" aria-labelledby="onboarding-profiles-title" className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><Users className="h-5 w-5" /></span>
        <div>
          <h2 id="onboarding-profiles-title" className="text-base font-semibold text-gray-900">Engagement and role profiles</h2>
          <p className="text-sm text-gray-500">The terms of each kind of engagement, and each role's own duties and KPIs, printed in the onboarding documents.</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : data && (
        <div className="space-y-6 px-5 py-5">
          {msg && (
            <div role={msg.tone === "error" ? "alert" : "status"}
              className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {msg.text}
            </div>
          )}
          <List kind="engagement" items={data.engagement_profiles} icon={Users} title="Engagement profiles" empty="" />
          <List kind="role" items={data.role_profiles} icon={Briefcase} title="Role profiles"
            empty="No role profiles yet. A hire's documents print their role's duties only when a role profile matches their position." />
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4" role="dialog" aria-modal="true"
          aria-labelledby="profile-editor-title">
          <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 id="profile-editor-title" className="text-base font-semibold text-gray-900">
                {editing.isNew ? "New" : "Edit"} {editing.kind === "role" ? "role" : "engagement"} profile
              </h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
              {Object.keys(errors).length > 0 && (
                <ul className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
                  {Object.entries(errors).map(([k, v]) => <li key={k}><strong>{k.replace(/_/g, " ")}:</strong> {v}</li>)}
                </ul>
              )}
              {editing.kind === "role"
                ? <RoleForm draft={editing.draft} set={(patch) => setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }))} />
                : <EngagementForm draft={editing.draft} set={(patch) => setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }))} />}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <SecondaryButton onClick={() => setEditing(null)} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton icon={Save} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
