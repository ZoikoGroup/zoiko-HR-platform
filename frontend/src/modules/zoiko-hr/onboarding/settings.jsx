import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getOnboardingSettings, saveOnboardingSettings, getOnboardingChecklistTemplates } from "../../../service/hrService";
import { humanizeValidationError } from "../../../utils/validationMessage";
import FinanceViewersSetting from "./FinanceViewersSetting";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];

function OnboardingSubNav() {
  return (
    <div className="hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

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

function Section({ step, title, help, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        {step ? <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span> : null}
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          {help ? <p className="text-xs text-gray-500 mt-0.5">{help}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const FieldError = ({ msg }) => (msg ? <p role="alert" className="text-xs text-red-600 mt-1">{msg}</p> : null);

export default function OnboardingSettings() {
  const [form, setForm] = useState(EMPTY);
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
        setForm(fromServer(settings));
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
      const saved = await saveOnboardingSettings(payload);
      if (saved) setForm(fromServer(saved));
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
    `w-24 border ${errors[name] ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;

  const page = (body) => (
    <HRPage title="Onboarding Settings" subtitle="Decide what happens automatically when a new hire is created.">
      <OnboardingSubNav />
      {body}
    </HRPage>
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
      <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-6 text-center">
        <p className="text-sm font-medium break-words">{loadError}</p>
        <button onClick={() => setReloadKey((k) => k + 1)} className="mt-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  const reminders = Number(form.reminder_days) || 0;
  const welcomeLen = form.welcome_message.length;

  return page(
    <div className="space-y-5 max-w-3xl">
      {banner.text && (
        <div role={banner.type === "error" ? "alert" : "status"} className={`px-4 py-3 rounded-lg flex justify-between items-start sm:items-center gap-3 ${
          banner.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <span className="text-sm min-w-0 break-words">{banner.text}</span>
          <button onClick={() => setBanner({ type: "", text: "" })} className="font-bold shrink-0 p-1.5 -m-1.5 leading-none" aria-label="Dismiss">&times;</button>
        </div>
      )}

      <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">How onboarding runs</p>
        <p>
          When a candidate accepts an offer, a new hire is created. The checklist templates below are assigned, the
          required documents are requested, and (if turned on) the new hire is emailed a pre-onboarding link. Reminders go
          out for anything still missing, and the completion rules decide when onboarding can be marked complete.
        </p>
      </div>

      <Section step={1} title="Checklists assigned automatically" help="Every new hire gets a copy of these templates as soon as they are created.">
        {templates.length === 0 ? (
          <p className="text-sm text-gray-400">
            No checklist templates yet. Create one on the <NavLink to="/zoiko-hr/onboarding/checklists" className="text-blue-600 hover:underline">Checklists</NavLink> page.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.auto_template_ids.includes(Number(t.id))} onChange={() => toggleIn("auto_template_ids", Number(t.id))}
                  className="shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="min-w-0 truncate" title={t.name}>{t.name}</span>
                {t.category ? <span className="ml-auto text-xs text-gray-400 capitalize shrink-0">{String(t.category).replace(/_/g, " ")}</span> : null}
              </label>
            ))}
          </div>
        )}
        <FieldError msg={errors.auto_template_ids} />
      </Section>

      <Section step={2} title="Documents requested from new hires" help="These are requested from every new hire; they upload them through their pre-onboarding link.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DOCUMENT_CATEGORIES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm text-gray-700 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={form.required_document_categories.includes(c.value)} onChange={() => toggleIn("required_document_categories", c.value)}
                className="shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="min-w-0 break-words">{c.label}</span>
            </label>
          ))}
        </div>
        <FieldError msg={errors.required_document_categories} />
      </Section>

      <Section step={3} title="Pre-onboarding link" help="The new hire's personal page where they fill in their details, read the welcome message and upload documents.">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">Email new hires their pre-onboarding link automatically</p>
            <p className="text-xs text-gray-400">When off, send the link yourself from the New Hires page.</p>
          </div>
          <Toggle id="os-auto-invite" checked={form.auto_send_portal_invite} onChange={(v) => set("auto_send_portal_invite", v)} label="Email new hires their pre-onboarding link automatically" />
        </div>
        <div>
          <label htmlFor="os-link-days" className="block text-sm font-medium text-gray-700">Link valid for</label>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input id="os-link-days" type="number" min={1} max={180} step={1} value={form.portal_link_days} aria-invalid={!!errors.portal_link_days}
              onChange={(e) => set("portal_link_days", e.target.value)} className={numberBox("portal_link_days")} />
            <span className="text-sm text-gray-500">days (1 to 180)</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">After this the link stops working; sending a new link replaces the old one.</p>
          <FieldError msg={errors.portal_link_days} />
        </div>
        <div>
          <label htmlFor="os-welcome" className="block text-sm font-medium text-gray-700">Welcome message</label>
          <p className="text-xs text-gray-400 mb-1">Shown in the welcome email and on the new hire's pre-onboarding page.</p>
          <textarea id="os-welcome" rows={4} value={form.welcome_message} maxLength={WELCOME_MAX} aria-invalid={!!errors.welcome_message}
            onChange={(e) => set("welcome_message", e.target.value)} placeholder="e.g. We're excited to have you join us! Please complete the steps below before your first day."
            className={`w-full border ${errors.welcome_message ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
          <div className="flex flex-wrap justify-between gap-x-3">
            <FieldError msg={errors.welcome_message} />
            <span className={`text-xs ml-auto ${welcomeLen > WELCOME_MAX ? "text-red-600" : "text-gray-400"}`}>{welcomeLen}/{WELCOME_MAX}</span>
          </div>
        </div>
      </Section>

      <Section step={4} title="Reminders" help="Nudges new hires who still have documents to upload.">
        <div>
          <label htmlFor="os-reminder-days" className="block text-sm font-medium text-gray-700">Remind new hires about missing documents every</label>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input id="os-reminder-days" type="number" min={0} max={30} step={1} value={form.reminder_days} aria-invalid={!!errors.reminder_days}
              onChange={(e) => set("reminder_days", e.target.value)} className={numberBox("reminder_days")} />
            <span className="text-sm text-gray-500">days</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {reminders === 0 ? "0 means no reminders are sent." : `A reminder is emailed every ${reminders} day${reminders === 1 ? "" : "s"} until all requested documents are uploaded. Set 0 to turn reminders off.`}
          </p>
          <FieldError msg={errors.reminder_days} />
        </div>
      </Section>

      <Section step={5} title="Before onboarding can be completed" help="HR cannot mark a new hire's onboarding complete until these are met.">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">All checklist items are done</p>
            <p className="text-xs text-gray-400">Every item on the new hire's assigned checklists must be completed.</p>
          </div>
          <Toggle id="os-req-checklists" checked={form.require_checklists_complete} onChange={(v) => set("require_checklists_complete", v)} label="Require all checklist items to be done" />
        </div>
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">All requested documents are approved</p>
            <p className="text-xs text-gray-400">Every requested document must be uploaded and approved by HR.</p>
          </div>
          <Toggle id="os-req-documents" checked={form.require_documents_approved} onChange={(v) => set("require_documents_approved", v)} label="Require all documents to be approved" />
        </div>
      </Section>

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={handleSave} disabled={saving}
          className="w-full sm:w-auto min-h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-5 py-2 rounded-lg font-medium transition-colors">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
      <FinanceViewersSetting />
    </div>
  );
}
