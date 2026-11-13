/*
 * Onboarding › Settings › Company Profile: the organisation's own employer particulars. It is the only source of company
 * details printed in generated documents (offer letter, contract, NDA …). The form is built from the field list the server
 * sends, so new fields appear without a frontend change.
 * - "Prefill from organisation record" only fills the form; nothing is saved until you press Save.
 * - The server checks every field (CIN, GSTIN, PAN, PIN code, e-mails …) and returns one message per field.
 */
import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, Save, ShieldAlert, Wand2 } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { getCompanyProfile, prefillCompanyProfile, saveCompanyProfile } from "../../../service/hrService";

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const errorInputCls = "border-rose-300 focus:border-rose-400 focus:ring-rose-100";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";

const GROUPS = [
  ["identity", "Identity"],
  ["address", "Registered address"],
  ["contacts", "Contacts"],
  ["signatory", "Signatory"],
  ["legal", "Legal & policy defaults"],
  ["formatting", "Formatting"],
];
const WIDE = new Set(["legal_name", "address_line1", "address_line2", "governing_law_text", "affidavit_stamp_paper_note",
  "compliance_documents", "brands", "task_system_name", "reports_channel_text", "velocity_motto", "velocity_deadline_text"]);
const HINTS = {
  legal_name: "Exactly as registered, e.g. Example Industries Private Limited",
  cin: "21 characters, e.g. L17110MH1973PLC019786",
  gstin: "15 characters", pan: "e.g. AAAAA9999A",
  postal_code: "India: 6 digits", country: "2-letter code, e.g. IN",
  jurisdiction_country: "2-letter code, e.g. IN", currency: "3-letter code, e.g. INR",
  compliance_documents: "One per line, in order (e.g. PAN Card)", brands: "One per line",
  governing_law_text: "Optional – generated from the jurisdiction country and city when blank",
};
const ENUM_LABELS = {
  calendar_days: "Calendar days", business_days: "Business days", weeks: "Weeks", months: "Months",
  A4: "A4", LETTER: "US Letter", UK: "UK English", US: "US English", DMY: "6 July 2026", MDY: "July 6, 2026",
  indian: "Indian (1,20,000)", international: "International (120,000)",
};
const IN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function Field({ spec, value, error, onChange, country }) {
  const id = `cp-${spec.key}`;
  const cls = `${inputCls} ${error ? errorInputCls : ""}`;
  const describedBy = error ? `${id}-err` : undefined;
  const label = <label htmlFor={id} className={labelCls}>{spec.label}{spec.required && <span className="text-rose-600"> *</span>}</label>;
  let control;
  if (spec.kind === "bool") {
    return (
      <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
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
  } else if (spec.kind === "list") {
    control = (
      <textarea id={id} rows={4} className={cls} value={(value || []).join("\n")} placeholder={HINTS[spec.key]}
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
    const isState = spec.key === "state" && (country || "").toUpperCase() === "IN";
    control = (
      <>
        <input id={id} className={cls} value={value ?? ""} placeholder={HINTS[spec.key]} aria-invalid={!!error} aria-describedby={describedBy}
          type={spec.kind === "int" ? "number" : spec.kind === "email" ? "email" : "text"}
          inputMode={spec.key === "postal_code" && (country || "").toUpperCase() === "IN" ? "numeric" : undefined}
          list={isState ? "cp-in-states" : undefined}
          onChange={(e) => onChange(spec.kind === "int" ? (e.target.value === "" ? null : e.target.value) : e.target.value)} />
        {isState && <datalist id="cp-in-states">{IN_STATES.map((s) => <option key={s} value={s} />)}</datalist>}
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

export default function CompanyProfileSettings() {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [msg, setMsg] = useState(null);

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
    return () => { live = false; };
  }, []);

  const changed = useMemo(() => {
    if (!view) return {};
    return Object.fromEntries((view.fields || []).filter((f) => !same(form[f.key], view.profile[f.key])).map((f) => [f.key, form[f.key]]));
  }, [form, view]);
  const dirty = Object.keys(changed).length > 0;

  useEffect(() => {                                           // unsaved-changes guard
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const payload = Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, Array.isArray(v) ? v.filter((s) => s.trim()) : v]));
    try {
      hydrate(await saveCompanyProfile(payload));
      setMsg({ tone: "ok", text: "Company profile saved. Documents generated from now on use it; documents already sent are not changed." });
    } catch (e) {
      const fieldErrors = e?.detail?.errors || {};
      setErrors(fieldErrors);
      const n = Object.keys(fieldErrors).length;
      setMsg({ tone: "error", text: n ? `${n} field${n === 1 ? " needs" : "s need"} correcting. Nothing was saved.` : (e?.message || "The company profile could not be saved.") });
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <section id="company-profile" aria-labelledby="company-profile-title" className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><Building2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="company-profile-title" className="text-base font-semibold text-gray-900">Company profile</h2>
            <p className="text-sm text-gray-500">Your organisation's legal details. They are the only company details printed in generated documents.</p>
          </div>
        </div>
        <SecondaryButton icon={Wand2} onClick={prefill} disabled={prefilling || loading}>
          {prefilling ? "Loading…" : "Prefill from organisation record"}
        </SecondaryButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
      ) : view && (
        <div className="space-y-6 px-5 py-5">
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

          {GROUPS.map(([group, title]) => {
            const specs = fieldsByGroup(group);
            if (!specs.length) return null;
            return (
              <fieldset key={group} className="rounded-2xl border border-gray-100 p-4">
                <legend className="px-1 text-sm font-semibold text-gray-900">{title}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {specs.map((spec) => (
                    <Field key={spec.key} spec={spec} value={form[spec.key]} error={errors[spec.key]} country={form.country}
                      onChange={(v) => setField(spec.key, v)} />
                  ))}
                </div>
              </fieldset>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">{dirty ? "You have unsaved changes." : "No unsaved changes."} The logo is set under Offer package documents below.</p>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => hydrate(view)} disabled={!dirty || saving}>Discard changes</SecondaryButton>
              <PrimaryButton icon={Save} onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save company profile"}</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
