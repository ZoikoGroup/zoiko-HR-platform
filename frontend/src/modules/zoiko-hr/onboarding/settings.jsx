import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { AlertCircle, CheckCircle2, ClipboardCheck, FileText, Info, Link2, ListChecks, Save, BellRing } from "lucide-react";
import { getOnboardingSettings, saveOnboardingSettings, getOnboardingChecklistTemplates } from "../../../service/hrService";
import { humanizeValidationError } from "../../../utils/validationMessage";
import FinanceViewersSetting from "./FinanceViewersSetting";
import { PrimaryButton } from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

const DOCUMENT_CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "offer_letter", label: "Signed offer letter" },
  { value: "nda", label: "Signed NDA" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

const WELCOME_MAX = 2000;

const EMPTY = {
  auto_template_ids: [],
  required_document_categories: [],
  auto_send_portal_invite: false,
  portal_link_days: 30,
  reminder_days: 0,
  require_checklists_complete: false,
  require_documents_approved: false,
  welcome_message: "",
};

function fromServer(s) {
  const d = s || {};
  return {
    auto_template_ids: Array.isArray(d.auto_template_ids) ? d.auto_template_ids.map(Number) : [],
    required_document_categories: Array.isArray(d.required_document_categories) ? d.required_document_categories : [],
    auto_send_portal_invite: !!d.auto_send_portal_invite,
    portal_link_days: d.portal_link_days ?? EMPTY.portal_link_days,
    reminder_days: d.reminder_days ?? EMPTY.reminder_days,
    require_checklists_complete: !!d.require_checklists_complete,
    require_documents_approved: !!d.require_documents_approved,
    welcome_message: d.welcome_message || "",
  };
}

const isWhole = (v) => /^\d+$/.test(String(v ?? "").trim());

/** { field: message } for everything the server would refuse. */
function validateOnboardingSettings(f) {
  const errors = {};
  if (!isWhole(f.portal_link_days) || Number(f.portal_link_days) < 1 || Number(f.portal_link_days) > 180) {
    errors.portal_link_days = "Enter a whole number of days from 1 to 180.";
  }
  if (!isWhole(f.reminder_days) || Number(f.reminder_days) > 30) {
    errors.reminder_days = "Enter a whole number of days from 0 to 30 (0 turns reminders off).";
  }
  if (String(f.welcome_message || "").length > WELCOME_MAX) {
    errors.welcome_message = `The welcome message can be at most ${WELCOME_MAX} characters.`;
  }
  return errors;
}

function Toggle({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" aria-label={label} />
      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
  );
}

function Section({ step, icon: Icon, title, help, children }) {
  return (
    <section aria-labelledby={`os-section-${step}`} className="rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
          {Icon ? <Icon className="h-5 w-5" /> : <span className="text-sm font-bold">{step}</span>}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Step {step}</p>
          <h2 id={`os-section-${step}`} className="text-base font-semibold text-gray-900">{title}</h2>
          {help ? <p className="mt-0.5 text-sm text-gray-500">{help}</p> : null}
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
  );
}

/** A labelled on/off row: the text on the left, the switch on the right. */
function ToggleRow({ id, title, help, checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-500">{help}</p>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const FieldError = ({ msg }) => (msg ? <p role="alert" className="mt-1 inline-flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{msg}</p> : null);

const optionTile = (on) => `flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
  on ? "border-blue-200 bg-blue-50/60 text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;
const checkbox = "shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500";

const SUBTITLE = "Decide what happens automatically when a new hire is created.";

export default function OnboardingSettings() {
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState({ type: "", text: "" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [settings, tpl] = await Promise.all([getOnboardingSettings(), getOnboardingChecklistTemplates()]);
        if (!mounted) return;
        const loaded = fromServer(settings);
        setForm(loaded);
        setSaved(loaded);
        const list = Array.isArray(tpl) ? tpl : Array.isArray(tpl?.items) ? tpl.items : [];
        setTemplates(list);
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Onboarding settings could not be loaded.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [reloadKey]);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };
  const toggleIn = (key, value) => {
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleSave = async () => {
    const found = validateOnboardingSettings(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setBanner({ type: "error", text: "Please fix the highlighted fields." });
      return;
    }
    setSaving(true);
    setBanner({ type: "", text: "" });
    try {
      const payload = {
        auto_template_ids: form.auto_template_ids,
        required_document_categories: form.required_document_categories,
        auto_send_portal_invite: form.auto_send_portal_invite,
        portal_link_days: Number(form.portal_link_days),
        reminder_days: Number(form.reminder_days),
        require_checklists_complete: form.require_checklists_complete,
        require_documents_approved: form.require_documents_approved,
        welcome_message: form.welcome_message.trim() === "" ? null : form.welcome_message,
      };
      const result = await saveOnboardingSettings(payload);
      const next = result ? fromServer(result) : form;
      setForm(next);
      setSaved(next);
      setBanner({ type: "success", text: "Onboarding settings saved. They apply to new hires created from now on." });
    } catch (err) {
      const fields = {};
      if (Array.isArray(err?.validation)) {
        for (const item of err.validation) {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          if (typeof field === "string" && !fields[field]) fields[field] = humanizeValidationError(item);
        }
      }
      setErrors(fields);
      setBanner({ type: "error", text: err?.message || "The settings could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const numberBox = (name) =>
    `w-24 rounded-xl border ${errors[name] ? "border-rose-300 bg-rose-50/40" : "border-gray-200 bg-white"} px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

  const page = (body) => (
    <OnboardingLayout title="Onboarding Settings" subtitle={SUBTITLE}>{body}</OnboardingLayout>
  );

  if (loading) {
    return page(
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading settings...</span>
      </div>
    );
  }

  if (loadError) {
    return page(
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 break-words"><AlertCircle className="h-5 w-5 shrink-0" />{loadError}</p>
        <div className="mt-3"><PrimaryButton onClick={() => setReloadKey((k) => k + 1)}>Retry</PrimaryButton></div>
      </div>
    );
  }

  const reminders = Number(form.reminder_days) || 0;
  const welcomeLen = form.welcome_message.length;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const errorCount = Object.values(errors).filter(Boolean).length;
  const savedRules = [saved.require_checklists_complete && "Checklists", saved.require_documents_approved && "Documents"].filter(Boolean);

  return page(
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {banner.text && (
          <div role={banner.type === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 sm:items-center ${
            banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}>
            <span className="inline-flex min-w-0 items-center gap-2 text-sm break-words">
              {banner.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{banner.text}
            </span>
            <button onClick={() => setBanner({ type: "", text: "" })} className="font-bold shrink-0 p-1.5 -m-1.5 leading-none" aria-label="Dismiss">&times;</button>
          </div>
        )}

        <Section step={1} icon={ClipboardCheck} title="Checklists assigned automatically" help="Every new hire gets a copy of these templates as soon as they are created.">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-500">
              No checklist templates yet. Create one on the <NavLink to="/zoiko-hr/onboarding/checklists" className="text-blue-600 hover:underline">Checklists</NavLink> page.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {templates.map((t) => {
                const on = form.auto_template_ids.includes(Number(t.id));
                return (
                  <label key={t.id} className={optionTile(on)}>
                    <input type="checkbox" checked={on} onChange={() => toggleIn("auto_template_ids", Number(t.id))} className={checkbox} />
                    <span className="min-w-0 truncate" title={t.name}>{t.name}</span>
                    {t.category ? <span className="ml-auto shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] capitalize text-gray-500">{String(t.category).replace(/_/g, " ")}</span> : null}
                  </label>
                );
              })}
            </div>
          )}
          <FieldError msg={errors.auto_template_ids} />
        </Section>

        <Section step={2} icon={FileText} title="Documents requested from new hires" help="These are requested from every new hire; they upload them through their pre-onboarding link.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DOCUMENT_CATEGORIES.map((c) => {
              const on = form.required_document_categories.includes(c.value);
              return (
                <label key={c.value} className={optionTile(on)}>
                  <input type="checkbox" checked={on} onChange={() => toggleIn("required_document_categories", c.value)} className={checkbox} />
                  <span className="min-w-0 break-words">{c.label}</span>
                </label>
              );
            })}
          </div>
          <FieldError msg={errors.required_document_categories} />
        </Section>

        <Section step={3} icon={Link2} title="Pre-onboarding link" help="The new hire's personal page where they fill in their details, read the welcome message and upload documents.">
          <ToggleRow id="os-auto-invite" title="Email new hires their pre-onboarding link automatically" help="When off, send the link yourself from the New Hires page."
            checked={form.auto_send_portal_invite} onChange={(v) => set("auto_send_portal_invite", v)} label="Email new hires their pre-onboarding link automatically" />
          <div>
            <label htmlFor="os-link-days" className="block text-sm font-medium text-gray-800">Link valid for</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input id="os-link-days" type="number" min={1} max={180} step={1} value={form.portal_link_days} aria-invalid={!!errors.portal_link_days}
                onChange={(e) => set("portal_link_days", e.target.value)} className={numberBox("portal_link_days")} />
              <span className="text-sm text-gray-500">days (1 to 180)</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">After this the link stops working; sending a new link replaces the old one.</p>
            <FieldError msg={errors.portal_link_days} />
          </div>
          <div>
            <label htmlFor="os-welcome" className="block text-sm font-medium text-gray-800">Welcome message</label>
            <p className="mb-1 text-xs text-gray-500">Shown in the welcome email and on the new hire's pre-onboarding page.</p>
            <textarea id="os-welcome" rows={4} value={form.welcome_message} maxLength={WELCOME_MAX} aria-invalid={!!errors.welcome_message}
              onChange={(e) => set("welcome_message", e.target.value)} placeholder="e.g. We're excited to have you join us! Please complete the steps below before your first day."
              className={`w-full rounded-xl border ${errors.welcome_message ? "border-rose-300" : "border-gray-200"} px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`} />
            <div className="flex flex-wrap justify-between gap-x-3">
              <FieldError msg={errors.welcome_message} />
              <span className={`ml-auto text-xs ${welcomeLen > WELCOME_MAX ? "text-rose-600" : "text-gray-400"}`}>{welcomeLen}/{WELCOME_MAX}</span>
            </div>
          </div>
        </Section>

        <Section step={4} icon={BellRing} title="Reminders" help="Nudges new hires who still have documents to upload.">
          <div>
            <label htmlFor="os-reminder-days" className="block text-sm font-medium text-gray-800">Remind new hires about missing documents every</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input id="os-reminder-days" type="number" min={0} max={30} step={1} value={form.reminder_days} aria-invalid={!!errors.reminder_days}
                onChange={(e) => set("reminder_days", e.target.value)} className={numberBox("reminder_days")} />
              <span className="text-sm text-gray-500">days</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {reminders === 0 ? "0 means no reminders are sent." : `A reminder is emailed every ${reminders} day${reminders === 1 ? "" : "s"} until all requested documents are uploaded. Set 0 to turn reminders off.`}
            </p>
            <FieldError msg={errors.reminder_days} />
          </div>
        </Section>

        <Section step={5} icon={ListChecks} title="Before onboarding can be completed" help="HR cannot mark a new hire's onboarding complete until these are met.">
          <ToggleRow id="os-req-checklists" title="All checklist items are done" help="Every item on the new hire's assigned checklists must be completed."
            checked={form.require_checklists_complete} onChange={(v) => set("require_checklists_complete", v)} label="Require all checklist items to be done" />
          <ToggleRow id="os-req-documents" title="All requested documents are approved" help="Every requested document must be uploaded and approved by HR."
            checked={form.require_documents_approved} onChange={(v) => set("require_documents_approved", v)} label="Require all documents to be approved" />
        </Section>

        <div className="sticky bottom-0 z-10 rounded-2xl border border-gray-200/80 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {errorCount ? <span className="text-rose-600">{errorCount} field{errorCount === 1 ? " needs" : "s need"} attention</span>
                : dirty ? "You have unsaved changes." : "No unsaved changes."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setForm(saved); setErrors({}); }} disabled={!dirty || saving}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                Discard changes
              </button>
              <PrimaryButton icon={Save} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</PrimaryButton>
            </div>
          </div>
        </div>

        <FinanceViewersSetting />
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-gray-600">
          <p className="mb-1 inline-flex items-center gap-2 font-semibold text-gray-800"><Info className="h-4 w-4 text-blue-600" />How onboarding runs</p>
          <p>
            When a candidate accepts an offer, a new hire is created. The checklist templates are assigned, the
            required documents are requested, and (if turned on) the new hire is emailed a pre-onboarding link. Reminders go
            out for anything still missing, and the completion rules decide when onboarding can be marked complete.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Saved setup</p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Checklists assigned", saved.auto_template_ids.length],
              ["Documents requested", saved.required_document_categories.length],
              ["Link emailed automatically", saved.auto_send_portal_invite ? "Yes" : "No"],
              ["Link valid for", `${saved.portal_link_days} days`],
              ["Reminders", Number(saved.reminder_days) ? `Every ${saved.reminder_days} days` : "Off"],
              ["Completion rules", savedRules.join(", ") || "None"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-right font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
