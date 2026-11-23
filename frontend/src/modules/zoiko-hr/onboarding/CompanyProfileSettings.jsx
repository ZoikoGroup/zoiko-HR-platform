/*
 * Onboarding › Settings › Company Profile: the organisation's own employer particulars. It is the only source of company
 * details printed in generated documents (offer letter, contract, NDA …). The form is built from the field list the server
 * sends, so new fields appear without a frontend change. Each field group is its own card; "Legal & policy defaults" has a
 * fixed layout with the employee notice period rules table.
 * - "Prefill from organisation record" only fills the form; nothing is saved until you press Save.
 * - The server checks every field (CIN, GSTIN, PAN, PIN code, e-mails …) and returns one message per field.
 * - On the Onboarding Settings page the header's Save / Discard buttons save this section (useSettingsSection).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, CheckCircle2, Clock3, FileText, Loader2, Mail, MapPin, MoreHorizontal, Palette, PenLine, Plus, Save, ShieldAlert,
  User, Users, Wand2,
} from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { getCompanyProfile, getOnboardingProfiles, prefillCompanyProfile, saveCompanyProfile } from "../../../service/hrService";
import { COUNTRY_CHOICES } from "../../../utils/fieldRules";
import { SettingsCard, useSettingsSection } from "./settingsUi";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const errorInputCls = "border-rose-300 focus:border-rose-400 focus:ring-rose-100";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";

const GROUPS = [
  ["identity", "Identity", Building2, "The employer's registered name and registration numbers."],
  ["address", "Registered address", MapPin, "Printed under the company name in agreements."],
  ["contacts", "Contacts", Mail, "Where new hires return documents and send reports."],
  ["signatory", "Signatory", PenLine, "The person who signs the documents for the company."],
  ["legal", "Legal & policy defaults", FileText, null],
  ["formatting", "Formatting", Palette, "Paper, spelling, dates and number style of the documents."],
  ["clauses", "Clause details", FileText, "Values for the merge fields in your clause wording, such as {{speak_up_channel}}. A blank field "
    + "prints the new hire's own details, the HR contact or standard wording; a document is only held when a field it uses has neither."],
];
const WIDE = new Set(["legal_name", "address_line1", "address_line2", "governing_law_text", "affidavit_stamp_paper_note",
  "compliance_documents", "brands", "task_system_name", "reports_channel_text", "velocity_motto", "velocity_deadline_text"]);
const HINTS = {
  legal_name: "Exactly as registered, e.g. Example Industries Private Limited",
  cin: "21 characters, e.g. L17110MH1973PLC019786",
  gstin: "15 characters", pan: "e.g. AAAAA9999A",
  postal_code: "India: 6 digits",
  compliance_documents: "One per line, in order (e.g. PAN Card)", brands: "One per line",
  governing_law_text: "Optional – generated from the jurisdiction country and city when blank",
};
const ENUM_LABELS = {
  calendar_days: "Calendar days", business_days: "Business days", weeks: "Weeks", months: "Months",
  A4: "A4", LETTER: "US Letter", UK: "UK English", US: "US English", DMY: "6 July 2026", MDY: "July 6, 2026",
  indian: "Indian (1,20,000)", international: "International (120,000)",
};
const CHOICE_LABELS = {
  monthly: "Monthly", "twice a month": "Twice a month", "every two weeks": "Every two weeks", weekly: "Weekly",
  indefinitely: "Indefinitely", "for one year": "1 year", "for two years": "2 years", "for three years": "3 years",
  "for five years": "5 years",
};
const NOTICE_UNITS = ["calendar_days", "business_days", "weeks", "months"];
const STAGES = [["any", "Any time"], ["probation", "Probation"], ["post_probation", "Post-probation"]];
const ALL_TYPES = "all";
const IN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
const IN_CITIES = ["Ahmedabad", "Bengaluru", "Bhopal", "Bhubaneswar", "Chandigarh", "Chennai", "Coimbatore", "Delhi", "Gurugram",
  "Guwahati", "Hyderabad", "Indore", "Jaipur", "Kochi", "Kolkata", "Lucknow", "Mumbai", "Mysuru", "Nagpur", "Noida", "Patna",
  "Pune", "Surat", "Thiruvananthapuram", "Vadodara", "Visakhapatnam"];

// Legal & policy defaults: the fields laid out by hand; everything else in the group follows in the server's order.
const LEGAL_TOP = ["jurisdiction_country", "jurisdiction_city", "governing_law_text"];
const LEGAL_HANDLED = new Set([...LEGAL_TOP, "notice_rules", "notice_period_value", "notice_period_unit",
  "employer_notice_value", "employer_notice_unit"]);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The cities offered for the jurisdiction: the registered address's city, the jurisdiction country's list, and a saved value
 * that is on neither (so it is not lost on save). */
export function jurisdictionCityChoices({ value, country, registeredCity }) {
  const list = [registeredCity, ...((country || "").toUpperCase() === "IN" ? IN_CITIES : [])]
    .map((c) => String(c || "").trim()).filter(Boolean);
  const v = String(value || "").trim();
  if (v && !list.some((c) => c.toLowerCase() === v.toLowerCase())) list.unshift(v);
  return [...new Set(list)];
}

/** Jump to the Registered address card and put the cursor in its first box. */
function goToAddresses() {
  const card = document.getElementById("company-profile-address");
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  card.querySelector("input, select, textarea")?.focus({ preventScroll: true });
}

/** QA-R2-4: the jurisdiction city is the same styled dropdown as the jurisdiction country. It used to be a text box with a
 * <datalist>, which the browser opened as its own (dark, unstyled) address-autofill popup ending in "Manage addresses…".
 * Typing another city and "Manage addresses…" are actions under the box, not options in it. */
function JurisdictionCityField({ spec, value, error, onChange, country, registeredCity }) {
  const id = `cp-${spec.key}`;
  const cls = `${inputCls} ${error ? errorInputCls : ""}`;
  const describedBy = error ? `${id}-err` : undefined;
  const choices = jurisdictionCityChoices({ value, country, registeredCity });
  const [typing, setTyping] = useState(false);
  const typed = typing || !choices.length;
  const action = "text-xs font-medium text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded";
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{spec.label}{spec.required && <span className="text-rose-600"> *</span>}</label>
      {typed ? (
        <input id={id} className={cls} value={value ?? ""} autoComplete="off" placeholder={HINTS[spec.key] || spec.hint || "City whose courts have jurisdiction"}
          aria-invalid={!!error} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <select id={id} className={cls} value={value ?? ""} autoComplete="off" aria-invalid={!!error} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">{spec.required ? "Select a city…" : "—"}</option>
          {choices.map((c) => (
            <option key={c} value={c}>{c}{registeredCity && c === String(registeredCity).trim() ? " (registered address)" : ""}</option>
          ))}
        </select>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {choices.length > 0 && (
          <button type="button" className={action} onClick={() => setTyping((t) => !t)}>
            {typed ? "Choose from the list" : "Type another city"}
          </button>
        )}
        <button type="button" className={action} onClick={goToAddresses}>Manage addresses…</button>
      </div>
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function Field({ spec, value, error, onChange, country }) {
  const id = `cp-${spec.key}`;
  const cls = `${inputCls} ${error ? errorInputCls : ""}`;
  const describedBy = error ? `${id}-err` : undefined;
  const label = <label htmlFor={id} className={labelCls}>{spec.label}{spec.required && <span className="text-rose-600"> *</span>}</label>;
  let control;
  if (spec.kind === "bool") {
    return (
      <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-blue-600" />
        <span>{spec.label}</span>
      </label>
    );
  }
  if (spec.kind === "enum") {
    control = (
      <select id={id} className={cls} value={value ?? ""} aria-invalid={!!error} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        {!spec.required && <option value="">—</option>}
        {(spec.options || []).map((o) => <option key={o} value={o}>{ENUM_LABELS[o] || o}</option>)}
      </select>
    );
  } else if (spec.kind === "choice") {
    // a dropdown; wording saved before the dropdown existed stays selectable so it is not lost on save
    const options = spec.options || [];
    const legacy = value && !options.includes(value) ? value : null;
    control = (
      <select id={id} className={cls} value={value ?? ""} aria-invalid={!!error} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        <option value="">{spec.required ? "Select…" : "—"}</option>
        {legacy && <option value={legacy}>{legacy}</option>}
        {options.map((o) => <option key={o} value={o}>{CHOICE_LABELS[o] || o}</option>)}
      </select>
    );
  } else if (spec.kind === "country") {
    const known = COUNTRY_CHOICES.some((c) => c.code === value);
    control = (
      <select id={id} className={cls} value={value ?? ""} aria-invalid={!!error} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a country…</option>
        {value && !known && <option value={value}>{value}</option>}
        {COUNTRY_CHOICES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
      </select>
    );
  } else if (spec.kind === "list") {
    control = (
      <textarea id={id} rows={4} className={cls} value={(value || []).join("\n")} placeholder={HINTS[spec.key] || spec.hint || undefined}
        aria-invalid={!!error} aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.replace(/^\s+/, "")))} />
    );
  } else if (spec.kind === "hex") {
    control = (
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${spec.label} picker`} value={/^#[0-9A-Fa-f]{6}$/.test(value || "") ? value : "#0B3D91"}
          onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-gray-200" />
        <input id={id} className={cls} value={value || ""} maxLength={7} aria-invalid={!!error} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  } else {
    const inIndia = (country || "").toUpperCase() === "IN";
    const suggest = inIndia && spec.key === "state" ? ["cp-in-states", IN_STATES]
      : inIndia && spec.key === "city" ? ["cp-in-cities", IN_CITIES] : null;
    control = (
      <>
        <input id={id} className={cls} value={value ?? ""} placeholder={HINTS[spec.key] || spec.hint || undefined} aria-invalid={!!error} aria-describedby={describedBy}
          type={spec.kind === "int" ? "number" : spec.kind === "email" ? "email" : "text"}
          inputMode={spec.key === "postal_code" && inIndia ? "numeric" : undefined}
          list={suggest ? `${suggest[0]}-${spec.key}` : undefined}
          onChange={(e) => onChange(spec.kind === "int" ? (e.target.value === "" ? null : e.target.value) : e.target.value)} />
        {suggest && <datalist id={`${suggest[0]}-${spec.key}`}>{suggest[1].map((s) => <option key={s} value={s} />)}</datalist>}
      </>
    );
  }
  return (
    <div className={WIDE.has(spec.key) ? "sm:col-span-2" : ""}>
      {label}
      {control}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** The "…" menu on a notice rule row. */
function RuleMenu({ active, onToggle, onRemove, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const item = "block w-full px-3 py-2 text-left text-sm hover:bg-gray-50";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${label}`}
        className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <button type="button" role="menuitem" className={`${item} text-gray-700`} onClick={() => { onToggle(); setOpen(false); }}>
            {active ? "Mark inactive" : "Mark active"}
          </button>
          <button type="button" role="menuitem" className={`${item} text-rose-600`} onClick={() => { onRemove(); setOpen(false); }}>Remove rule</button>
        </div>
      )}
    </div>
  );
}

// phones: type and stage on their own lines; tablets: two lines of four; from 1024px: one table row per rule
const RULE_GRID = "sm:grid-cols-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_84px_minmax(0,1fr)_88px_32px]";

/** Employee notice period rules: one row per employee type (engagement profile) and stage of employment. */
function NoticeRules({ rules, onChange, types, error }) {
  const list = Array.isArray(rules) ? rules : [];
  const typeOptions = [{ value: ALL_TYPES, label: "All employees" }, ...types];
  const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const used = new Set(list.filter((r) => r.active !== false).map((r) => `${r.employee_type}|${r.applies_when}`));
    const free = typeOptions.flatMap((t) => STAGES.map(([s]) => [t.value, s])).find(([t, s]) => !used.has(`${t}|${s}`)) || [ALL_TYPES, "any"];
    onChange([...list, { employee_type: free[0], applies_when: free[1], value: "", unit: "calendar_days", active: true }]);
  };
  const sel = "w-full rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 ring-1 ring-blue-100" aria-hidden="true"><Clock3 className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Employee Notice Period Rules <span className="text-rose-600">*</span></h3>
          <p className="text-xs text-gray-500">Configure notice periods for different employee types and scenarios. Employee types are your engagement profiles.</p>
        </div>
      </div>

      <div className={`mt-4 hidden gap-2 px-1 text-xs font-semibold text-gray-600 lg:grid ${RULE_GRID}`} aria-hidden="true">
        <span>Employee type</span><span>Applies when</span><span>Notice period</span><span>Unit</span><span>Status</span><span />
      </div>
      <ul className="mt-2 space-y-2">
        {list.map((r, i) => {
          const active = r.active !== false;
          const known = typeOptions.some((t) => t.value === r.employee_type);
          const name = (typeOptions.find((t) => t.value === r.employee_type) || {}).label || r.employee_type;
          return (
            <li key={i} className={`grid grid-cols-2 items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 ${RULE_GRID} ${active ? "" : "opacity-60"}`}>
              <div className="relative col-span-2 lg:col-span-1">
                {r.employee_type === ALL_TYPES ? <Users className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  : <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />}
                <select aria-label={`Rule ${i + 1}: employee type`} className={`${sel} pl-8`} value={r.employee_type || ""}
                  onChange={(e) => update(i, { employee_type: e.target.value })}>
                  {!known && <option value={r.employee_type}>{r.employee_type} (profile removed)</option>}
                  {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <select aria-label={`Rule ${i + 1}: applies when`} className={`${sel} col-span-2 bg-blue-50/60 font-medium text-blue-800 lg:col-span-1`}
                value={r.applies_when || "any"} onChange={(e) => update(i, { applies_when: e.target.value })}>
                {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input aria-label={`Rule ${i + 1}: notice period`} type="number" min={0} max={365} step={1} className={sel}
                value={r.value ?? ""} onChange={(e) => update(i, { value: e.target.value === "" ? "" : e.target.value })} />
              <select aria-label={`Rule ${i + 1}: unit`} className={sel} value={r.unit || "calendar_days"} onChange={(e) => update(i, { unit: e.target.value })}>
                {NOTICE_UNITS.map((u) => <option key={u} value={u}>{ENUM_LABELS[u]}</option>)}
              </select>
              <span className="justify-self-start">
                {active ? <StatusPill tone="green">● Active</StatusPill> : <StatusPill tone="gray">Inactive</StatusPill>}
              </span>
              <span className="justify-self-end">
                <RuleMenu active={active} label={`${name}, ${(STAGES.find(([v]) => v === r.applies_when) || [])[1] || ""}`}
                  onToggle={() => update(i, { active: !active })} onRemove={() => onChange(list.filter((_, j) => j !== i))} />
              </span>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500">No notice rules yet. Add one for all employees, then add rules for specific employee types if they differ.</p>}
      {error && <p id="cp-notice_rules-err" role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
      <button type="button" onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
        <Plus className="h-4 w-4" />Add notice rule
      </button>
    </div>
  );
}

/** Employer notice period: value and unit on one row. */
function EmployerNotice({ value, unit, onChange, error, required }) {
  // fixed widths: the shared input class is full-width, which would stack these two boxes under the label
  const cls = `${inputCls.replace("w-full ", "")} ${error ? errorInputCls : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/60 px-4 py-3 sm:col-span-2">
      <label htmlFor="cp-employer_notice_value" className="basis-full text-sm font-semibold text-gray-800 sm:basis-auto">
        Employer notice period{required && <span className="text-rose-600"> *</span>}
      </label>
      <input id="cp-employer_notice_value" type="number" min={0} max={365} className={`${cls} w-20 shrink-0`} value={value ?? ""}
        onChange={(e) => onChange("employer_notice_value", e.target.value === "" ? null : e.target.value)} />
      <select aria-label="Employer notice period unit" className={`${cls} min-w-0 w-40 flex-1 sm:flex-none`} value={unit || ""}
        onChange={(e) => onChange("employer_notice_unit", e.target.value)}>
        <option value="">—</option>
        {NOTICE_UNITS.map((u) => <option key={u} value={u}>{ENUM_LABELS[u]}</option>)}
      </select>
      {error && <p className="basis-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function CompanyProfileSettings() {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [msg, setMsg] = useState(null);
  const [types, setTypes] = useState([]);

  const hydrate = (res) => {
    setView(res);
    setForm({ ...res.profile });
    setErrors({});
  };

  useEffect(() => {
    let live = true;
    getCompanyProfile()
      .then((res) => live && hydrate(res))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "The company profile could not be loaded." }))
      .finally(() => live && setLoading(false));
    getOnboardingProfiles()
      .then((res) => live && setTypes((res?.engagement_profiles || []).map((p) => ({ value: p.slug, label: p.name || p.slug }))))
      .catch(() => {});                                      // the rules still work with "All employees"
    return () => { live = false; };
  }, []);

  const changed = useMemo(() => {
    if (!view) return {};
    return Object.fromEntries((view.fields || []).filter((f) => !same(form[f.key], view.profile[f.key])).map((f) => [f.key, form[f.key]]));
  }, [form, view]);
  const dirty = Object.keys(changed).length > 0;

  const setField = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  };

  const save = async () => {
    if (!dirty) return true;
    setSaving(true);
    setMsg(null);
    const payload = Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, Array.isArray(v) && k !== "notice_rules" ? v.filter((s) => s.trim()) : v]));
    try {
      hydrate(await saveCompanyProfile(payload));
      // on the settings page the page banner reports the save; on its own the section says so itself
      if (!pageOwnsSave) setMsg({ tone: "ok", text: "Company profile saved. Documents generated from now on use it; documents already sent are not changed." });
      return true;
    } catch (e) {
      const fieldErrors = e?.detail?.errors || {};
      setErrors(fieldErrors);
      const n = Object.keys(fieldErrors).length;
      setMsg({ tone: "error", text: n ? `Company profile: ${n} field${n === 1 ? " needs" : "s need"} correcting. Nothing was saved.` : (e?.message || "The company profile could not be saved.") });
      return false;
    } finally {
      setSaving(false);
    }
  };
  const discard = () => { if (view) hydrate(view); setMsg(null); };
  const pageOwnsSave = useSettingsSection("company-profile", { dirty, save, discard });

  useEffect(() => {                                           // unsaved-changes guard when used on its own
    if (!dirty || pageOwnsSave) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pageOwnsSave]);

  const prefill = async () => {
    setPrefilling(true);
    setMsg(null);
    try {
      const res = await prefillCompanyProfile();
      const proposal = res?.proposal || {};
      const keys = Object.keys(proposal);
      setForm((p) => ({ ...p, ...proposal }));
      setMsg({ tone: "info", text: keys.length
        ? `${keys.length} empty field${keys.length === 1 ? " was" : "s were"} filled from your organisation record. Review them, then press Save — nothing has been saved yet.`
        : "Nothing to prefill: every field the organisation record could fill is already filled." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The prefill could not be loaded." });
    } finally {
      setPrefilling(false);
    }
  };

  const completeness = view?.completeness;
  const fieldsByGroup = (group) => (view?.fields || []).filter((f) => f.group === group);
  const spec = (key) => (view?.fields || []).find((f) => f.key === key);
  const renderField = (s, country = form.country) => (
    <Field key={s.key} spec={s} value={form[s.key]} error={errors[s.key]} country={country} onChange={(v) => setField(s.key, v)} />
  );

  const legalBody = () => {
    const top = LEGAL_TOP.map(spec).filter(Boolean);
    const rest = fieldsByGroup("legal").filter((s) => !LEGAL_HANDLED.has(s.key));
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {top.map((s) => (s.key === "jurisdiction_city"
          ? <JurisdictionCityField key={s.key} spec={s} value={form[s.key]} error={errors[s.key]} country={form.jurisdiction_country}
              registeredCity={form.city} onChange={(v) => setField(s.key, v)} />
          : renderField(s, form.jurisdiction_country)))}
        {spec("notice_rules") && (
          <NoticeRules rules={form.notice_rules} types={types} error={errors.notice_rules || errors.notice_period_value}
            onChange={(v) => setField("notice_rules", v)} />
        )}
        {spec("employer_notice_value") && (
          <EmployerNotice value={form.employer_notice_value} unit={form.employer_notice_unit} required={spec("employer_notice_value").required}
            error={errors.employer_notice_value || errors.employer_notice_unit} onChange={setField} />
        )}
        {rest.map((s) => renderField(s))}
      </div>
    );
  };

  return (
    <div id="company-profile" className="scroll-mt-24 space-y-5">
      <SettingsCard id="company-profile-status" icon={Building2} title="Company profile"
        help="Your organisation's legal details. They are the only company details printed in generated documents."
        action={(
          <SecondaryButton icon={Wand2} onClick={prefill} disabled={prefilling || loading}>
            {prefilling ? "Loading…" : "Prefill from organisation record"}
          </SecondaryButton>
        )}>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : (
          <>
            {completeness && (
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-800">Company profile {completeness.percent}% complete</span>
                  {completeness.complete
                    ? <StatusPill tone="green" icon={CheckCircle2}>Ready for documents</StatusPill>
                    : <StatusPill tone="amber" icon={ShieldAlert}>{completeness.missing.length} required field{completeness.missing.length === 1 ? "" : "s"} missing</StatusPill>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={completeness.percent} aria-valuemin={0} aria-valuemax={100}
                  aria-label="Company profile completeness">
                  <div className={`h-full rounded-full ${completeness.complete ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${completeness.percent}%` }} />
                </div>
                {!completeness.complete && (
                  <p className="mt-1 text-xs text-gray-500">Missing: {completeness.missing.map((m) => m.label).join(", ")}</p>
                )}
              </div>
            )}
            {msg && (
              <div role={msg.tone === "error" ? "alert" : "status"}
                className={`rounded-xl border px-3 py-2 text-sm ${msg.tone === "error" ? "border-red-200 bg-red-50 text-red-700"
                  : msg.tone === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {msg.text}
              </div>
            )}
            <p className="text-xs text-gray-500">The logo is set under Offer package documents below.</p>
          </>
        )}
      </SettingsCard>

      {view && GROUPS.map(([group, title, Icon, help]) => {
        const specs = fieldsByGroup(group);
        if (!specs.length) return null;
        return (
          <SettingsCard key={group} id={`company-profile-${group}`} icon={Icon} title={title} help={help}>
            {group === "legal" ? legalBody() : (
              <div className="grid gap-4 sm:grid-cols-2">{specs.map((s) => renderField(s))}</div>
            )}
          </SettingsCard>
        );
      })}

      {view && !pageOwnsSave && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SecondaryButton onClick={discard} disabled={!dirty || saving}>Discard changes</SecondaryButton>
          <PrimaryButton icon={Save} onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save company profile"}</PrimaryButton>
        </div>
      )}
    </div>
  );
}
