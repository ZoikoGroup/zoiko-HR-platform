/*
 * "Set up offer letters" — one guided step per work country (Recruitment → Offer Management).
 * Confirms the employing legal entity (prefilled from the organization profile) and the authorised signatory, then an
 * organization admin attests the platform's unchanged starter wording by typing their name; the backend activates the
 * country pack and releases the offer templates. Templates that need the organization's own wording are listed, not released.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, FileText, Loader2, PenLine, ShieldCheck, UserCheck, X } from "lucide-react";
import * as recDocs from "../../../service/recruitmentDocumentsService";
import { Avatar, PrimaryButton, SecondaryButton, StatusPill } from "./ui";

const input = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50";
const label = "mb-1 block text-xs font-medium text-gray-600";

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-4 w-4" /></span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const TEMPLATE_STATE = {
  released: { tone: "green", text: "Released" },
  ready_from_starter: { tone: "blue", text: "Will be released" },
  needs_wording: { tone: "amber", text: "Needs your wording" },
  unavailable: { tone: "gray", text: "Not available" },
};

export default function OfferLetterSetupPanel({ country, onClose, onDone }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [result, setResult] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let live = true;
    recDocs.getOfferLetterSetup(country)
      .then((data) => {
        if (!live) return;
        const e = data.entity || data.entity_prefill || {};
        const sig = data.signatories?.[0];
        setForm({
          legal_name: e.legal_name || "", country: (data.country || e.country || "").toUpperCase(), region: e.region || "",
          city: e.city || "", postal_code: e.postal_code || "", address: e.address || "", tax_id: e.tax_id || "",
          registration_number: e.registration_number || "", email: e.email || "", phone: e.phone || "",
          signatory_employee_id: sig ? String(sig.employee_id) : (data.people?.[0] ? String(data.people[0].id) : ""),
          signatory_title: sig?.title || "", offers_without_approval: Boolean(data.offers_without_approval),
          attestation_accepted: false, signed_name: "",
        });
        setState({ loading: false, error: "", data });
      })
      .catch((err) => live && setState({ loading: false, error: err?.message || "The setup could not be loaded.", data: null }));
    return () => { live = false; };
  }, [country]);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (ev) => { if (ev.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const data = state.data;
  const toRelease = useMemo(() => (data?.templates || []).filter((t) => t.state === "ready_from_starter"), [data]);
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value }));

  const problems = [];
  if (form) {
    if (form.legal_name.trim().length < 2) problems.push("Enter the employer's legal name.");
    if (!/^[A-Za-z]{2}$/.test(form.country)) problems.push("Enter the employer's country as a 2-letter code.");
    if (!form.signatory_employee_id) problems.push("Choose the authorised signatory.");
    if (form.signatory_title.trim().length < 2) problems.push("Enter the signatory's title.");
    if (!form.attestation_accepted) problems.push("Confirm the attestation.");
    if (data?.attester_name && form.signed_name.trim().toLowerCase() !== data.attester_name.trim().toLowerCase()) problems.push(`Type your name exactly as "${data.attester_name}".`);
  }

  async function submit(ev) {
    ev.preventDefault();
    if (problems.length) { setSaveError(problems[0]); return; }
    setSaving(true);
    setSaveError("");
    try {
      const out = await recDocs.runOfferLetterSetup({
        country: (data.country || form.country).toUpperCase(),
        entity: { legal_name: form.legal_name.trim(), country: form.country.toUpperCase(), region: form.region || null, city: form.city || null,
          postal_code: form.postal_code || null, address: form.address || null, tax_id: form.tax_id || null,
          registration_number: form.registration_number || null, email: form.email || null, phone: form.phone || null },
        signatory_employee_id: Number(form.signatory_employee_id), signatory_title: form.signatory_title.trim(),
        offers_without_approval: form.offers_without_approval, attestation_accepted: true, signed_name: form.signed_name.trim(),
      });
      setResult(out);
      onDone?.(out);
    } catch (err) {
      const d = err?.detail || err?.data?.detail;
      setSaveError((d && (d.message || (Array.isArray(d.problems) && d.problems.join("; ")))) || err?.message || "The setup could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="offer-setup-title"
        className="flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl outline-none">
        <header className="bg-gradient-to-r from-[#0A1128] to-[#111A33] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Offer letters</p>
              <h2 id="offer-setup-title" className="text-xl font-bold">Set up offer letters{data?.country ? ` for ${data.country}` : ""}</h2>
              <p className="mt-1 text-sm text-slate-300">Confirm your employer details and attest the starter wording once. Offers for people working in this country can then be generated.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close setup" className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </header>

        {state.loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading setup…</div>
        ) : state.error ? (
          <div className="m-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{state.error}</div>
        ) : result ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Offer letters are set up for {result.country}</p>
              <p className="mt-1 text-sm text-emerald-800">
                {result.released.length ? `Released: ${result.released.join(", ")}.` : "Everything was already in place."}
                {result.clauses_released.length ? ` Clauses released: ${result.clauses_released.join(", ")}.` : ""}
              </p>
            </div>
            {result.skipped?.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Not released yet</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">{result.skipped.map((t) => <li key={t.canonical_id}>{t.canonical_id} {t.title} — {t.reason}</li>)}</ul>
              </div>
            )}
            <PrimaryButton onClick={onClose}>Done</PrimaryButton>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {!data.can_attest && (
                <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />Only an organization admin can attest and complete this setup. You can review it here.</p>
              )}
              {data.plan_missing?.length > 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your plan does not include: {data.plan_missing.join(", ")}.</p>
              )}

              <Section icon={Building2} title="Employer on the letter" hint={data.entity ? "Your organization's legal entity. Correct anything that is out of date." : "Prefilled from your organization profile. Check it against your registration documents."}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="ols-legal" className={label}>Legal name *</label><input id="ols-legal" className={input} value={form.legal_name} onChange={set("legal_name")} /></div>
                  <div><label htmlFor="ols-country" className={label}>Country (ISO code) *</label><input id="ols-country" maxLength={2} className={`${input} uppercase`} value={form.country} onChange={set("country")} /></div>
                  <div><label htmlFor="ols-region" className={label}>State / region</label><input id="ols-region" className={input} value={form.region} onChange={set("region")} /></div>
                  <div><label htmlFor="ols-city" className={label}>City</label><input id="ols-city" className={input} value={form.city} onChange={set("city")} /></div>
                  <div><label htmlFor="ols-postal" className={label}>Postal code</label><input id="ols-postal" className={input} value={form.postal_code} onChange={set("postal_code")} /></div>
                  <div className="sm:col-span-2"><label htmlFor="ols-address" className={label}>Registered address</label><textarea id="ols-address" rows={2} className={input} value={form.address} onChange={set("address")} /></div>
                  <div><label htmlFor="ols-tax" className={label}>Tax ID</label><input id="ols-tax" className={input} value={form.tax_id} onChange={set("tax_id")} /></div>
                  <div><label htmlFor="ols-reg" className={label}>Registration number</label><input id="ols-reg" className={input} value={form.registration_number} onChange={set("registration_number")} /></div>
                  <div><label htmlFor="ols-email" className={label}>Email</label><input id="ols-email" type="email" className={input} value={form.email} onChange={set("email")} /></div>
                  <div><label htmlFor="ols-phone" className={label}>Phone</label><input id="ols-phone" className={input} value={form.phone} onChange={set("phone")} /></div>
                </div>
              </Section>

              <Section icon={UserCheck} title="Authorised signatory" hint="The person who signs offer letters for the employer.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ols-signatory" className={label}>Signatory *</label>
                    <select id="ols-signatory" className={input} value={form.signatory_employee_id} onChange={set("signatory_employee_id")}>
                      <option value="">Choose a person</option>
                      {data.people.map((p) => <option key={p.id} value={String(p.id)}>{p.name}{p.job_title ? ` — ${p.job_title}` : ""}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor="ols-title" className={label}>Title on the letter *</label><input id="ols-title" className={input} value={form.signatory_title} onChange={set("signatory_title")} placeholder="e.g. Director" /></div>
                </div>
                {form.signatory_employee_id && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <Avatar size="xs" name={data.people.find((p) => String(p.id) === form.signatory_employee_id)?.name} />
                    {data.people.find((p) => String(p.id) === form.signatory_employee_id)?.name} signs as {form.signatory_title || "…"}
                  </p>
                )}
              </Section>

              <Section icon={FileText} title="Offer letter templates" hint="The platform's starter wording, released unchanged for this country.">
                <ul className="divide-y divide-gray-100">
                  {data.templates.map((t) => {
                    const look = TEMPLATE_STATE[t.state] || TEMPLATE_STATE.unavailable;
                    return (
                      <li key={t.canonical_id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{t.title}</p>
                          <p className="text-xs text-gray-500">{t.canonical_id}{t.reason ? ` · ${t.reason}` : ""}</p>
                        </div>
                        <StatusPill tone={look.tone}>{look.text}</StatusPill>
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <Section icon={ShieldCheck} title="Approval of offers" hint="Who approves an offer before its letter is generated.">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={form.offers_without_approval} onChange={set("offers_without_approval")} />
                  <span>Offers don't need a second approver<span className="block text-xs text-gray-500">Saving an offer approves it and generates its letter; HR still sends it. Leave unticked if another admin reviews offers.</span></span>
                </label>
              </Section>

              <Section icon={PenLine} title="Attestation" hint="Recorded on the approval record (HR-DOC-003) of every template released here.">
                <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">“{data.attestation_text}”</p>
                <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={form.attestation_accepted} onChange={set("attestation_accepted")} disabled={!data.can_attest} />
                  I have reviewed the starter wording and accept this attestation for my organization.
                </label>
                <div className="mt-3">
                  <label htmlFor="ols-name" className={label}>Type your full name to sign{data.attester_name ? ` (${data.attester_name})` : ""} *</label>
                  <input id="ols-name" className={input} value={form.signed_name} onChange={set("signed_name")} disabled={!data.can_attest} autoComplete="off" />
                </div>
              </Section>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
              <p className="min-w-0 flex-1 text-xs text-gray-500">
                {saveError ? <span className="text-rose-600" role="alert">{saveError}</span>
                  : `${toRelease.length} template${toRelease.length === 1 ? "" : "s"} will be released for ${data.country || form.country}.`}
              </p>
              <div className="flex gap-2">
                <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={saving || !data.can_attest} icon={saving ? Loader2 : ShieldCheck}>
                  {saving ? "Setting up…" : "Attest and set up"}
                </PrimaryButton>
              </div>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
