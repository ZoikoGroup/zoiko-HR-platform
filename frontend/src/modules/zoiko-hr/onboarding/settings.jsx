/*
 * Onboarding › Settings. One page of cards: new-hire automation, then the company profile (legal & policy defaults) and the
 * rest of the onboarding-document setup. The header's "Save changes" / "Discard changes" act on the automation settings
 * and on every section that registers with SettingsSaveContext (the company profile); the engagement / role profiles,
 * offer package and finance viewers keep their own Save buttons because they save item by item.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, BellRing, Check, CheckCircle2, ClipboardCheck, FileText, Info, Layers, Link2, ListChecks, MinusCircle, Settings2,
  Sparkles, UploadCloud,
} from "lucide-react";
import { getOnboardingSettings, saveOnboardingSettings, getOnboardingChecklistTemplates, getCompanyProfile } from "../../../service/hrService";
import { getDocsSetupStatus, getRequestCategories } from "../../../service/docsSetupService";
import PackageDocumentsSettings from "./PackageDocumentsSettings";
import PortalFormsSettings from "./PortalFormsSettings";
import RequestCategoriesSettings from "./RequestCategoriesSettings";
import { humanizeValidationError } from "../../../utils/validationMessage";
import FinanceViewersSetting from "./FinanceViewersSetting";
import OfferPackageSettings from "./OfferPackageSettings";
import CompanyProfileSettings from "./CompanyProfileSettings";
import OnboardingProfilesSettings from "./OnboardingProfilesSettings";
import { PrimaryButton, SecondaryButton } from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";
import { SettingsCard, SettingsSaveContext } from "./settingsUi";

// Uploads requested automatically: the organisation's own upload categories (Settings › Documents requested from new hires).
// This list is only the fallback while they load. The offer-package documents are issued from the package instead.
const DEFAULT_CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];
export const DOCS_SETUP_PATH = "/zoiko-hr/onboarding/settings/docs-setup";

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

/** A divider heading between the two halves of the page. */
function PartHeading({ id, title, help }) {
  return (
    <div id={id} className="scroll-mt-24 pt-2">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{help}</p>
    </div>
  );
}

// "On this page" navigation: the anchors are the section ids rendered below (and in the section components).
const PAGE_NAV = [
  { href: "#automation", label: "New-hire automation", children: [
    { href: "#os-step-1", label: "Checklists" },
    { href: "#os-step-2", label: "Documents requested" },
    { href: "#os-step-3", label: "Pre-onboarding link" },
    { href: "#os-step-4", label: "Reminders" },
    { href: "#os-step-5", label: "Completion rules" },
  ] },
  { href: "#documents", label: "Onboarding documents", children: [
    { href: "#docs-setup", label: "Set up docs for your organisation" },
    { href: "#company-profile", label: "Company profile" },
    { href: "#company-profile-legal", label: "Legal & policy defaults" },
    { href: "#onboarding-profiles", label: "Engagement & role profiles" },
    { href: "#package-documents", label: "Documents in your package" },
    { href: "#offer-package", label: "Offer package & clauses" },
    { href: "#portal-forms", label: "Forms new hires fill in" },
    { href: "#finance-viewers", label: "Finance viewers" },
  ] },
];

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

const SUBTITLE = "Configure legal, policy, and operational defaults for a consistent and automated onboarding experience.";

/** One row of the configuration summary: a status icon and the value. */
function SummaryRow({ label, on, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="inline-flex items-center gap-1.5 text-right font-medium text-gray-900">
        {on === true && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
        {on === false && <MinusCircle className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
        {value}
      </dd>
    </div>
  );
}

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
  const [categoryView, setCategoryView] = useState(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [setupStatus, setSetupStatus] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    let live = true;
    getRequestCategories().then((v) => live && setCategoryView(v)).catch(() => {});
    getDocsSetupStatus().then((v) => live && setSetupStatus(v)).catch(() => live && setSetupStatus({ enabled: false }));
    getCompanyProfile().then((v) => live && setProfileComplete(!!v?.completeness?.complete)).catch(() => {});
    return () => { live = false; };
  }, []);
  const categoryOptions = categoryView
    ? categoryView.categories.filter((c) => c.active).map((c) => ({ value: c.key, label: c.label }))
    : DEFAULT_CATEGORIES;

  // a link such as ".../settings#company-profile-clauses" (from the package panel) opens on that section once the
  // sections have rendered (they load their own data, so the target may appear a moment later)
  useEffect(() => {
    const id = typeof window !== "undefined" ? decodeURIComponent(window.location.hash.slice(1)) : "";
    if (!id) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      tries += 1;
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); clearInterval(timer); }
      else if (tries > 40) clearInterval(timer);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  // sections saved by the header buttons (the company profile) register here
  const registry = useRef({});
  const [sectionDirty, setSectionDirty] = useState({});
  const saveCtx = useMemo(() => ({
    register: (id, handlers) => { registry.current[id] = handlers; },
    unregister: (id) => {
      delete registry.current[id];
      setSectionDirty((m) => { if (!(id in m)) return m; const n = { ...m }; delete n[id]; return n; });
    },
    report: (id, dirty) => setSectionDirty((m) => (m[id] === dirty ? m : { ...m, [id]: dirty })),
  }), []);

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

  const automationDirty = !loading && JSON.stringify(form) !== JSON.stringify(saved);
  const anyDirty = automationDirty || Object.values(sectionDirty).some(Boolean);

  // Warn before leaving the page with unsaved changes in anything the header buttons save.
  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

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

  /** Save the new-hire automation settings. Resolves true when saved. */
  const saveAutomation = async () => {
    const found = validateOnboardingSettings(form);
    setErrors(found);
    if (Object.keys(found).length) return false;
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
      return true;
    } catch (err) {
      const fields = {};
      if (Array.isArray(err?.validation)) {
        for (const item of err.validation) {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          if (typeof field === "string" && !fields[field]) fields[field] = humanizeValidationError(item);
        }
      }
      setErrors(fields);
      if (!Object.keys(fields).length) setErrors({ _form: err?.message || "The automation settings could not be saved." });
      return false;
    }
  };

  const saveAll = useCallback(async () => {
    setSaving(true);
    setBanner({ type: "", text: "" });
    const failed = [];
    try {
      if (automationDirty && !(await saveAutomation())) failed.push("New-hire automation");
      for (const [id, dirty] of Object.entries(sectionDirty)) {
        const section = registry.current[id];
        if (dirty && section && !(await section.save())) failed.push(id === "company-profile" ? "Company profile" : id);
      }
    } finally {
      setSaving(false);
    }
    setBanner(failed.length
      ? { type: "error", text: `Not saved: ${failed.join(", ")}. Fix the highlighted fields and save again.` }
      : { type: "success", text: "Settings saved. They apply to new hires and documents created from now on." });
  }, [automationDirty, sectionDirty, form]); // eslint-disable-line react-hooks/exhaustive-deps

  const discardAll = () => {
    setForm(saved);
    setErrors({});
    Object.values(registry.current).forEach((s) => s.discard());
    setBanner({ type: "", text: "" });
  };

  const numberBox = (name) =>
    `w-24 rounded-xl border ${errors[name] ? "border-rose-300 bg-rose-50/40" : "border-gray-200 bg-white"} px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100`;

  const actions = !loading && !loadError ? (
    <>
      <SecondaryButton onClick={discardAll} disabled={!anyDirty || saving}>Discard changes</SecondaryButton>
      <PrimaryButton icon={Check} onClick={saveAll} disabled={!anyDirty || saving}>{saving ? "Saving…" : "Save changes"}</PrimaryButton>
    </>
  ) : null;

  const page = (body) => (
    <OnboardingLayout title="Onboarding Settings" subtitle={SUBTITLE} actions={actions}>{body}</OnboardingLayout>
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
  const completionRule = saved.require_checklists_complete && saved.require_documents_approved ? "Checklists & documents"
    : saved.require_checklists_complete ? "Checklist-based" : saved.require_documents_approved ? "Document-based" : "None";

  return page(
    <SettingsSaveContext.Provider value={saveCtx}>
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

          <PartHeading id="automation" title="New-hire automation" help="What happens automatically when a new hire is created." />

          <SettingsCard id="os-step-1" icon={ClipboardCheck} title="Checklists assigned automatically" help="Every new hire gets a copy of these templates as soon as they are created.">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500">
                No checklist templates yet.
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
          </SettingsCard>

          <SettingsCard id="os-step-2" icon={FileText} title="Documents requested from new hires" help="Uploads requested from every new hire through their pre-onboarding link. The offer-package documents (offer letter, contract, NDA…) are set up under Onboarding documents."
            action={<SecondaryButton icon={Settings2} onClick={() => setManagingCategories((v) => !v)} aria-expanded={managingCategories}>
              {managingCategories ? "Done" : "Manage categories"}</SecondaryButton>}>
            {form.required_document_categories.length === 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">No documents will be requested. Tick at least ID proof and bank details for payroll.</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {categoryOptions.map((c) => {
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
            {managingCategories && categoryView && <RequestCategoriesSettings view={categoryView} onChange={setCategoryView} />}
          </SettingsCard>

          <SettingsCard id="os-step-3" icon={Link2} title="Pre-onboarding link" help="The new hire's personal page where they fill in their details, read the welcome message and upload documents.">
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
          </SettingsCard>

          <SettingsCard id="os-step-4" icon={BellRing} title="Reminders" help="Nudges new hires who still have documents to upload.">
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
          </SettingsCard>

          <SettingsCard id="os-step-5" icon={ListChecks} title="Before onboarding can be completed" help="HR cannot mark a new hire's onboarding complete until these are met.">
            <ToggleRow id="os-req-checklists" title="All checklist items are done" help="Every item on the new hire's assigned checklists must be completed."
              checked={form.require_checklists_complete} onChange={(v) => set("require_checklists_complete", v)} label="Require all checklist items to be done" />
            <ToggleRow id="os-req-documents" title="All requested documents are approved" help="Every requested document must be uploaded and approved by HR."
              checked={form.require_documents_approved} onChange={(v) => set("require_documents_approved", v)} label="Require all documents to be approved" />
            <FieldError msg={errors._form} />
          </SettingsCard>

          <PartHeading id="documents" title="Onboarding documents"
            help="What the offer-package documents print. Work top to bottom: company details and legal defaults, then the engagement and role profiles, then the clause wording." />

          {setupStatus?.enabled && (
            <section id="docs-setup" aria-labelledby="docs-setup-title"
              className={`scroll-mt-24 rounded-2xl border p-5 shadow-sm ${profileComplete ? "border-blue-100 bg-blue-50/50" : "border-amber-200 bg-amber-50/60"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600" aria-hidden="true"><UploadCloud className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 id="docs-setup-title" className="text-base font-semibold text-gray-900">Set up docs for your organisation</h2>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {profileComplete
                        ? "Upload your own offer letter, contract, NDA, handbook and forms. We suggest settings and draft templates from them; you review every suggestion and decide what is used."
                        : "Your Company Profile is not complete yet. Upload your existing documents and we will suggest the missing details for you to review."}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Suggestions may use AI where your plan allows it. You decide what is applied; nothing is sent to new hires.
                    </p>
                    {setupStatus.last_session && setupStatus.last_session.status !== "cancelled" && (
                      <p className="mt-1 text-xs text-gray-600">Last setup: {setupStatus.last_session.status === "applied" ? "applied" : `in progress (step ${setupStatus.last_session.step} of 6)`}</p>
                    )}
                  </div>
                </div>
                <Link to={DOCS_SETUP_PATH}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  {setupStatus.last_session && ["uploading", "analysing", "review"].includes(setupStatus.last_session.status) ? "Continue setting up docs" : "Set up docs for your organisation"}
                </Link>
              </div>
            </section>
          )}

          <CompanyProfileSettings />
          <OnboardingProfilesSettings />
          <PackageDocumentsSettings />
          <OfferPackageSettings />
          <PortalFormsSettings />
          <FinanceViewersSetting />

          {anyDirty && (
            <div className="sticky bottom-0 z-10 rounded-2xl border border-gray-200/80 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-amber-700">You have unsaved changes.</p>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton onClick={discardAll} disabled={saving}>Discard changes</SecondaryButton>
                  <PrimaryButton icon={Check} onClick={saveAll} disabled={saving}>{saving ? "Saving…" : "Save changes"}</PrimaryButton>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-gray-600">
            <p className="mb-2 inline-flex items-center gap-2 text-base font-semibold text-gray-900"><Info className="h-5 w-5 text-blue-600" />About these settings</p>
            <p>
              When a candidate accepts an offer or a new hire is created, the checklist items are assigned, the required
              documents are requested, and (if turned on) the new hire is emailed a pre-onboarding link. Reminders go out for
              any missing items, and the completion rules decide when onboarding can be marked complete.
            </p>
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-blue-100/70" />
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
            <p className="inline-flex items-center gap-2 text-base font-semibold text-gray-900"><Layers className="h-5 w-5 text-blue-600" />Configuration summary</p>
            <dl className="mt-3 divide-y divide-gray-100 text-sm">
              <SummaryRow label="Checklists assigned" on={saved.auto_template_ids.length > 0}
                value={saved.auto_template_ids.length ? "Configured" : "Not set"} />
              <SummaryRow label="Documents requested" on={saved.required_document_categories.length > 0}
                value={saved.required_document_categories.length ? "Configured" : "Not set"} />
              <SummaryRow label="Link emailed automatically" on={saved.auto_send_portal_invite}
                value={saved.auto_send_portal_invite ? "Enabled" : "Off"} />
              <SummaryRow label="Link valid for" value={saved.portal_link_days ? `${saved.portal_link_days} days` : "—"} />
              <SummaryRow label="Reminders" on={Number(saved.reminder_days) > 0}
                value={Number(saved.reminder_days) ? `Every ${saved.reminder_days} days` : "Off"} />
              <SummaryRow label="Completion rules" value={completionRule} />
            </dl>
          </div>

          <nav aria-label="On this page" className="hidden rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm xl:block">
            <p className="text-sm font-semibold text-gray-900">On this page</p>
            <ul className="mt-3 space-y-3 text-sm">
              {PAGE_NAV.map((part) => (
                <li key={part.href}>
                  <a href={part.href} className="font-medium text-gray-800 hover:text-blue-700">{part.label}</a>
                  <ul className="mt-1 space-y-1 border-l border-gray-100 pl-3">
                    {part.children.map((c) => (
                      <li key={c.href}><a href={c.href} className="text-gray-500 hover:text-blue-700">{c.label}</a></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </SettingsSaveContext.Provider>
  );
}
