/*
 * Onboarding › Settings › Offer package: what the 10 package documents print.
 * - Employer particulars, signatory and HR contact; branding, paper size, spelling and date format. These settings are the ONLY
 *   source of company information in the documents: nothing is taken from the organisation profile, so a document waits
 *   (not ready) until the particulars it prints are filled in here.
 * - The counsel clause library: one entry per {{clause:…}} hook. Paste the wording your employment counsel approved for your
 *   jurisdiction, or mark an optional clause "not used". Until a required clause has wording, every document that uses it stays
 *   a watermarked draft and is never sent to a new hire. Zoiko HR does not write legal clauses for you.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Download, FileText, ImagePlus, Loader2, Save, Scale, ShieldAlert, Trash2 } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { deleteOfferPackageLogo, getOfferPackageLogo, getOfferPackageSettings, getOfferPackageTemplateSet, saveOfferPackageSettings,
  uploadOfferPackageLogo } from "../../../service/hrService";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_MB = 2;

/** The company logo printed in every package document's header and in the offer letterhead. */
function LogoCard({ hasLogo, onChanged, onMessage }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [rev, setRev] = useState(0);            // bumps after each upload, so a replaced logo is re-read

  useEffect(() => {
    let live = true;
    let objectUrl = "";
    if (!hasLogo) { setUrl(""); return undefined; }
    getOfferPackageLogo()
      .then((res) => { if (live && res?.blob) { objectUrl = URL.createObjectURL(res.blob); setUrl(objectUrl); } })
      .catch(() => live && setUrl(""));
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [hasLogo, rev]);

  const upload = async (file) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { onMessage({ tone: "error", text: "Upload the logo as a PNG, JPG or WebP image." }); return; }
    if (file.size > LOGO_MAX_MB * 1024 * 1024) { onMessage({ tone: "error", text: `The logo must be ${LOGO_MAX_MB} MB or smaller.` }); return; }
    setBusy(true);
    try {
      onChanged(await uploadOfferPackageLogo(file));
      setRev((r) => r + 1);
      onMessage({ tone: "ok", text: "Logo saved. New documents print it in the header and the offer letterhead." });
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The logo could not be uploaded." });
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the company logo? Documents generated from now on will have no logo.")) return;
    setBusy(true);
    try {
      onChanged(await deleteOfferPackageLogo());
      onMessage({ tone: "ok", text: "Logo removed." });
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The logo could not be removed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:items-center">
      <div className="grid h-20 w-44 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white">
        {hasLogo && url ? <img src={url} alt="Company logo" className="max-h-16 max-w-[160px] object-contain" />
          : hasLogo ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Loading logo" />
            : <span className="px-2 text-center text-xs text-gray-400">No logo yet</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Company logo</p>
        <p className="text-xs text-gray-500">
          Printed in the header of every page and in the offer letterhead. PNG, JPG or WebP, up to {LOGO_MAX_MB} MB; a wide logo on a
          transparent background works best. Applies to documents generated from now on; documents already sent are not changed.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {hasLogo ? "Replace logo" : "Upload logo"}
            <input key={inputKey} type="file" accept={LOGO_TYPES.join(",")} className="sr-only" aria-label="Company logo file"
              onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          </label>
          {hasLogo && (
            <button type="button" onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";

const TEXT_FIELDS = [
  ["legal_name", "Employer legal name", "As registered, e.g. Example Holdings Ltd"],
  ["registered_address", "Registered office address", "Street, town, postcode, country"],
  ["header_label", "Header label (shown as “LABEL | HR”)", "Optional – the legal name is used if left blank"],
  ["signatory_name", "Authorised signatory – name", "Who issues offers and contracts"],
  ["signatory_title", "Authorised signatory – job title", "e.g. Managing Director"],
  ["hr_contact_name", "HR contact – name", "e.g. People Team"],
  ["hr_contact_email", "HR contact – e-mail", "e.g. people@example.com"],
  ["pay_frequency", "Pay frequency", "e.g. monthly"],
  ["leave_entitlement", "Annual leave entitlement (Schedule 1)", "e.g. 25 days plus public holidays"],
  ["post_employment_period", "Confidentiality period after employment (NDA §9)", "As advised by counsel, e.g. two years"],
  ["benefits_reference", "Where benefits are described", "e.g. the Benefits Guide provided with this offer"],
  ["kpi_review_cycle", "KPI review cycle", "e.g. Weekly, in the 1:1 meeting"],
  ["jurisdiction", "Primary jurisdiction (for counsel)", "e.g. United Kingdom"],
];

export default function OfferPackageSettings() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [clauses, setClauses] = useState({});
  const [open, setOpen] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState(null);

  const hydrate = (res) => {
    setData(res);
    setForm({ ...res.settings });
    setClauses(Object.fromEntries(res.clauses.map((c) => [c.key, {
      text: c.text || "", not_applicable: !!c.not_applicable, counsel_reference: c.counsel_reference || "" }])));
  };

  useEffect(() => {
    let live = true;
    getOfferPackageSettings()
      .then((res) => live && hydrate(res))
      .catch((e) => live && setMsg({ tone: "error", text: e?.message || "Offer package settings could not be loaded." }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const missingRequired = useMemo(() => (data?.clauses || []).filter((c) => c.required
    && !(clauses[c.key]?.text || "").trim() && !clauses[c.key]?.not_applicable), [data, clauses]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = { ...form, clauses };
      hydrate(await saveOfferPackageSettings(payload));
      setMsg({ tone: "ok", text: "Offer package settings saved. Documents generated from now on use them; documents already sent are not changed." });
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The settings could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await getOfferPackageTemplateSet();
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || "offer-package-template-set.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMsg({ tone: "error", text: e?.message || "The template set could not be downloaded." });
    } finally {
      setDownloading(false);
    }
  };

  const setClause = (key, patch) => setClauses((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  return (
    <section id="offer-package" aria-labelledby="offer-package-title" className="scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true"><FileText className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="offer-package-title" className="text-base font-semibold text-gray-900">Offer package documents</h2>
            <p className="text-sm text-gray-500">What the 10 onboarding documents print, and the clause wording your counsel approved.</p>
            <p className="mt-1 text-xs text-gray-500">
              You can change anything here at any time. Changes apply to documents generated from now on (new employees, and
              documents not sent yet). Documents already sent to an employee are final and are never changed.
            </p>
            <p className="mt-1 text-xs font-medium text-blue-700">
              The company details below are the only company information printed in the documents. Nothing is taken from your
              organisation profile, so fill in every field the documents need before sending.
            </p>
          </div>
        </div>
        <SecondaryButton icon={Download} onClick={download} disabled={downloading}>
          {downloading ? "Preparing…" : "Download template set"}
        </SecondaryButton>
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

          <LogoCard hasLogo={!!data.settings.has_logo} onMessage={setMsg}
            onChanged={(res) => setData((d) => ({ ...d, settings: { ...d.settings, has_logo: !!res?.settings?.has_logo } }))} />

          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map(([key, label, hint]) => (
              <div key={key} className={key === "registered_address" ? "sm:col-span-2" : ""}>
                <label htmlFor={`op-${key}`} className={labelCls}>{label}</label>
                <input id={`op-${key}`} className={inputCls} value={form[key] || ""} placeholder={hint}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-6">
              {[["brand_primary", "Primary colour"], ["brand_accent", "Accent colour"]].map(([key, label]) => (
                <div key={key} className="col-span-1 sm:col-span-1">
                  <label htmlFor={`op-${key}`} className={labelCls}>{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label={`${label} picker`} value={form[key] || "#0B3D91"}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value.toUpperCase() }))} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-gray-200" />
                    <input id={`op-${key}`} className={inputCls} value={form[key] || ""} maxLength={7}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                </div>
              ))}
              {[["paper", "Paper size", [["A4", "A4"], ["LETTER", "US Letter"]]],
                ["spelling", "Spelling", [["UK", "UK English"], ["US", "US English"]]],
                ["date_format", "Date format", [["DMY", "10 November 2026"], ["MDY", "November 10, 2026"]]]].map(([key, label, opts]) => (
                <div key={key}>
                  <label htmlFor={`op-${key}`} className={labelCls}>{label}</label>
                  <select id={`op-${key}`} className={inputCls} value={form[key] || opts[0][0]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}>
                    {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label htmlFor="op-response_days" className={labelCls}>Days to respond</label>
                <input id="op-response_days" type="number" min={1} max={60} className={inputCls} value={form.response_days ?? 7}
                  onChange={(e) => setForm((p) => ({ ...p, response_days: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Scale className="h-4 w-4 text-gray-500" />Counsel clause library</h3>
              {missingRequired.length
                ? <StatusPill tone="amber" icon={ShieldAlert}>{missingRequired.length} required clause(s) without wording</StatusPill>
                : <StatusPill tone="green" icon={CheckCircle2}>All required clauses supplied</StatusPill>}
            </div>
            <p className="mb-3 text-xs leading-5 text-gray-500">
              Paste the wording your employment counsel approved for your jurisdiction. Documents that use a clause without wording stay
              watermarked drafts and are not sent. Zoiko HR never writes these clauses for you.
            </p>
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {data.clauses.map((c) => {
                const v = clauses[c.key] || {};
                const done = (v.text || "").trim() || v.not_applicable;
                const isOpen = open === c.key;
                return (
                  <li key={c.key}>
                    <button type="button" onClick={() => setOpen(isOpen ? "" : c.key)} aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{c.title}</span>
                        <span className="block truncate text-xs text-gray-500"><code>{c.token}</code> · {c.used_in.join(", ")}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {done
                          ? <StatusPill tone="green">{v.not_applicable ? "Not used" : "Supplied"}</StatusPill>
                          : <StatusPill tone={c.required ? "amber" : "gray"}>{c.required ? "Required" : "Optional"}</StatusPill>}
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 px-4 pb-4">
                        <p className="text-xs italic text-gray-500">Drafting note: {c.note}</p>
                        <label htmlFor={`cl-${c.key}`} className="sr-only">Wording for {c.title}</label>
                        <textarea id={`cl-${c.key}`} rows={6} className={inputCls} value={v.text || ""} disabled={v.not_applicable}
                          placeholder="Paste the counsel-approved wording. Leave a blank line between paragraphs."
                          onChange={(e) => setClause(c.key, { text: e.target.value })} />
                        <div className="flex flex-wrap items-center gap-4">
                          {!c.required && (
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input type="checkbox" checked={!!v.not_applicable} onChange={(e) => setClause(c.key, { not_applicable: e.target.checked })}
                                className="rounded border-gray-300" />
                              Not used in our jurisdiction
                            </label>
                          )}
                          <input aria-label="Counsel reference" className={`${inputCls} max-w-xs`} value={v.counsel_reference || ""}
                            placeholder="Counsel reference (optional)" onChange={(e) => setClause(c.key, { counsel_reference: e.target.value })} />
                          {c.updated_at && <span className="text-xs text-gray-400">Last changed {new Date(c.updated_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex justify-end">
            <PrimaryButton icon={Save} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save offer package settings"}</PrimaryButton>
          </div>
        </div>
      )}
    </section>
  );
}
