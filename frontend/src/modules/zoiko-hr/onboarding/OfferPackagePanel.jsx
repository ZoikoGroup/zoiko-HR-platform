/*
 * Offer package panel (Onboarding › Documents › Offer package): the 10 standard onboarding documents for one new hire.
 * For each document it shows the action the new hire takes (sign, acknowledge, complete, voluntary, information), where it
 * stands, and — before it is sent — exactly what is missing: HR data (typed in here) or counsel wording (Settings › Offer
 * package). Any document can be previewed. "Send" issues only the documents that are ready; the rest are held, and documents
 * waiting for the new hire's address or outside-activities declaration are released automatically when they enter it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Eye, FileSignature, Hourglass, Info, Loader2, Send, ShieldAlert, UserRound } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import { getHirePackage, getHirePackagePreview, saveHirePackageInputs, sendOnboardingPackage,
  sendOnboardingPortalInvite } from "../../../service/hrService";

const MODE_TONE = { SIGN: "violet", ACKNOWLEDGE: "blue", COMPLETE: "teal", VOLUNTARY: "pink", INFO: "gray" };

const STATE = {
  not_sent: { label: "Not sent", tone: "gray" },
  awaiting_signature: { label: "Awaiting signature", tone: "blue", icon: Hourglass },
  awaiting_acknowledgement: { label: "Awaiting acknowledgement", tone: "blue", icon: Hourglass },
  awaiting_upload: { label: "Awaiting completed form", tone: "blue", icon: Hourglass },
  needs_review: { label: "Uploaded – review", tone: "amber", icon: Hourglass },
  completed: { label: "Completed", tone: "green", icon: CheckCircle2 },
  available: { label: "Sent – no action needed", tone: "green", icon: CheckCircle2 },
  declined: { label: "Declined – can resend", tone: "red", icon: AlertTriangle },
  rejected: { label: "Returned to new hire", tone: "red", icon: AlertTriangle },
};

const fieldCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function OfferPackagePanel({ hireId, onSent, onError, footer: Footer }) {
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState("");
  const [result, setResult] = useState(null);

  const load = async () => {
    if (!hireId) return;
    setLoading(true);
    setError("");
    try {
      setPkg(await getHirePackage(hireId));   // typed-but-unsaved inputs are kept
    } catch (e) {
      setError(e?.message || "The package could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setResult(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hireId]);

  // HR-editable data that at least one unsent document is missing
  const missingInputs = useMemo(() => {
    if (!pkg) return [];
    const keys = new Map();
    pkg.documents.forEach((d) => {
      if (!["not_sent", "declined"].includes(d.state)) return;
      d.missing_fields.forEach((f) => {
        if (f.editable && (!f.candidate_provides || f.hr_may_enter)) {
          const cur = keys.get(f.key) || { ...f, docs: [] };
          cur.docs.push(d.title);
          keys.set(f.key, cur);
        }
      });
    });
    return [...keys.values()];
  }, [pkg]);

  const missingClauses = useMemo(() => {
    if (!pkg) return [];
    const m = new Map();
    pkg.documents.forEach((d) => {
      if (["not_sent", "declined"].includes(d.state)) d.missing_clauses.forEach((c) => m.set(c.key, c.title));
    });
    return [...m.values()];
  }, [pkg]);

  const ready = pkg?.ready_to_send || [];

  // Why nothing can be sent right now, in plain words (the Send button is disabled then)
  const status = useMemo(() => {
    if (!pkg) return null;
    const docs = pkg.documents;
    const unsent = docs.filter((d) => ["not_sent", "declined"].includes(d.state));
    return {
      withHire: docs.filter((d) => d.state.startsWith("awaiting_") || d.state === "needs_review"),
      done: docs.filter((d) => ["completed", "available"].includes(d.state)),
      waitingForHire: unsent.filter((d) => !d.ready && d.missing_clauses.length === 0
        && d.missing_fields.length > 0 && d.missing_fields.every((f) => f.candidate_provides)),
      blocked: unsent.filter((d) => !d.ready && (d.missing_clauses.length > 0 || d.missing_fields.some((f) => !f.candidate_provides))),
      hireNeeds: [...new Set(unsent.flatMap((d) => d.missing_fields.filter((f) => f.candidate_provides)
        .map((f) => (f.key === "worker.postal_address" ? "their postal address" : "their outside-activities declaration"))))],
    };
  }, [pkg]);
  const [resending, setResending] = useState(false);
  const resendLink = async () => {
    setResending(true);
    setError("");
    try {
      const r = await sendOnboardingPortalInvite(hireId);
      setResult({ message: r?.email_sent === false ? "The portal link was created, but the e-mail could not be sent."
        : `The onboarding portal link was e-mailed to ${pkg?.email || pkg?.candidate_name}.`, issued: [] });
    } catch (e) {
      setError(e?.message || "The portal link could not be sent.");
    } finally {
      setResending(false);
    }
  };

  const preview = async (category) => {
    setPreviewing(category);
    try {
      const res = await getHirePackagePreview(hireId, category);
      const url = URL.createObjectURL(res.blob);
      const win = window.open(url, "_blank", "noopener");
      if (!win) onError?.("The browser blocked the preview tab. Allow pop-ups for this site and try again.");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      onError?.(e?.message || "The preview could not be generated.");
    } finally {
      setPreviewing("");
    }
  };

  const saveInputs = async () => {
    const values = Object.fromEntries(Object.entries(inputs).filter(([, v]) => String(v || "").trim()));
    if (!Object.keys(values).length) return;
    setSaving(true);
    setError("");
    try {
      setPkg(await saveHirePackageInputs(hireId, values));
      setInputs({});
    } catch (e) {
      setError(e?.message || "The details could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const res = await sendOnboardingPackage(hireId);
      setResult(res);
      onSent?.(res);
      await load();
    } catch (e) {
      setError(e?.message || "The documents could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (loading && !pkg) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-gray-500" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />Checking the package…
      </div>
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">{error}</div>}
        {result && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">{result.message}</p>
            {result.issued?.length > 0 && <p className="mt-1">Sent: {result.issued.map((i) => i.title).join(", ")}.</p>}
            {result.skipped?.length > 0 && (
              <p className="mt-1 text-xs text-emerald-700">Not changed: {result.skipped.map((x) => `${x.title} (${x.reason})`).join("; ")}</p>
            )}
            {result.issued?.length > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                {result.email_sent ? `${pkg?.candidate_name} was e-mailed their onboarding link.` : "The e-mail could not be sent; share the portal link from Pre-onboarding."}
              </p>
            )}
          </div>
        )}

        {pkg && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Ready to send" value={ready.length} tone="text-blue-700" />
            <Stat label="Waiting" value={pkg.documents.filter((d) => !d.ready && ["not_sent", "declined"].includes(d.state)).length} tone="text-amber-700" />
            <Stat label="Sent" value={pkg.documents.filter((d) => !["not_sent", "declined"].includes(d.state)).length} tone="text-emerald-700" />
          </div>
        )}

        {pkg && status && ready.length === 0 && (
          <div role="status" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Nothing new to send for {pkg.candidate_name} right now</p>
            {status.done.length + status.withHire.length > 0 && (
              <p>
                {status.done.length + status.withHire.length} of {pkg.documents.length} documents are already sent
                {status.withHire.length > 0 ? ` – ${status.withHire.length} waiting for ${pkg.candidate_name} to sign, acknowledge or upload` : ""}
                {status.done.length > 0 ? `, ${status.done.length} complete` : ""}.
              </p>
            )}
            {status.waitingForHire.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                <p>
                  {status.waitingForHire.map((d) => d.title).join(", ")} {status.waitingForHire.length === 1 ? "is" : "are"} waiting
                  for {pkg.candidate_name} to enter {status.hireNeeds.join(" and ")} in the onboarding portal. They are sent
                  automatically as soon as that is done – nothing for you to do here.
                </p>
                <button type="button" onClick={resendLink} disabled={resending}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                  {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Re-send the portal link to {pkg.candidate_name}
                </button>
              </div>
            )}
            {status.blocked.length > 0 && (
              <p className="text-amber-800">
                {status.blocked.map((d) => d.title).join(", ")}: see what is missing below
                {status.blocked.some((d) => d.missing_clauses.length) ? " (counsel wording in Settings › Offer package)" : ""}.
              </p>
            )}
          </div>
        )}

        {missingClauses.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-semibold"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Counsel wording needed</p>
            <p className="mt-1 text-xs leading-5">
              Documents that use these clauses stay as watermarked drafts and are not sent until your employment counsel's wording is
              added: {missingClauses.join(", ")}.
            </p>
            <Link to="/zoiko-hr/onboarding/settings#offer-package" className="mt-2 inline-block text-xs font-semibold text-amber-900 underline">
              Add clause wording in Settings › Offer package
            </Link>
          </div>
        )}

        {missingInputs.length > 0 && (
          <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-gray-800">Missing details for {pkg?.candidate_name}</legend>
            <p className="mb-3 text-xs text-gray-500">These values are printed in the documents. They are saved for this new hire only.</p>
            <div className="space-y-3">
              {missingInputs.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`pkg-in-${f.key}`} className="mb-1 block text-sm font-medium text-gray-700">
                    {f.hr_may_enter ? "Postal address" : f.meaning}{" "}
                    <span className="text-xs font-normal text-gray-400">({f.hr_may_enter ? `optional – or ${pkg?.candidate_name} enters it in the portal` : f.source})</span>
                  </label>
                  {f.key === "job.role_purpose" ? (
                    <textarea id={`pkg-in-${f.key}`} rows={3} maxLength={1200} className={fieldCls} value={inputs[f.key] || ""}
                      placeholder="2–3 sentences on why the role exists" onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))} />
                  ) : (
                    <input id={`pkg-in-${f.key}`} className={fieldCls} value={inputs[f.key] || ""} maxLength={300}
                      placeholder={PLACEHOLDERS[f.key] || ""} onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">Used in: {f.docs.join(", ")}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <SecondaryButton onClick={saveInputs} disabled={saving || !Object.values(inputs).some((v) => String(v || "").trim())}>
                {saving ? "Saving…" : "Save details"}
              </SecondaryButton>
            </div>
          </fieldset>
        )}

        <ol className="space-y-2">
          {pkg?.documents.map((d, i) => {
            const st = STATE[d.state] || STATE.not_sent;
            const unsent = ["not_sent", "declined"].includes(d.state);
            const candidateFields = d.missing_fields.filter((f) => f.candidate_provides);
            const addressOnly = candidateFields.length > 0 && candidateFields.every((f) => f.hr_may_enter);
            const hrFields = d.missing_fields.filter((f) => !f.candidate_provides);
            return (
              <li key={d.category} className="rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{i + 1}. {d.title}</p>
                    <p className="text-xs text-gray-500">{d.template_id} · {d.doc_type} · {d.risk} / {d.sensitivity}{d.orientation === "landscape" ? " · landscape" : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={MODE_TONE[d.mode]}>{d.mode_label}</StatusPill>
                    {unsent && d.ready
                      ? <StatusPill tone="teal" icon={FileSignature}>Ready to send</StatusPill>
                      : <StatusPill tone={unsent ? "amber" : st.tone} icon={st.icon}>{unsent ? "Waiting" : st.label}</StatusPill>}
                  </div>
                </div>
                {unsent && !d.ready && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {hrFields.length > 0 && (
                      <li className="flex gap-1.5 text-amber-800"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Missing data: {hrFields.map((f) => f.meaning).join("; ")}</li>
                    )}
                    {d.missing_clauses.length > 0 && (
                      <li className="flex gap-1.5 text-amber-800"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Counsel wording: {d.missing_clauses.map((c) => c.title).join("; ")}</li>
                    )}
                    {candidateFields.length > 0 && (
                      <li className="flex gap-1.5 text-slate-600"><UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {addressOnly
                          ? "Needs the postal address: enter it above to send now, or it is sent automatically once the new hire enters it in their portal."
                          : `From the new hire: ${candidateFields.map((f) => f.meaning.toLowerCase()).join("; ")} – sent automatically once they enter it in their portal.`}</li>
                    )}
                  </ul>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">Signs: {d.signers}</p>
                  <button type="button" onClick={() => preview(d.category)} disabled={previewing === d.category}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                    {previewing === d.category ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Preview
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <Footer>
        <p className="mr-auto self-center text-xs text-gray-500">
          {ready.length ? `${ready.length} document(s) ready`
            : status?.waitingForHire.length ? `Waiting for ${pkg?.candidate_name}` : status?.blocked.length ? "Some documents are not ready" : "All documents sent"}
        </p>
        <PrimaryButton icon={Send} onClick={send} disabled={sending || !ready.length}>
          {sending ? "Sending…" : `Send ${ready.length || ""} ready document${ready.length === 1 ? "" : "s"}`}
        </PrimaryButton>
      </Footer>
    </>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-2 py-2">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
    </div>
  );
}

const PLACEHOLDERS = {
  "employment.work_location": "e.g. Leeds office, 1 Sample Street",
  "employment.working_hours": "e.g. 37.5 hours per week",
  "employment.base_pay": "e.g. GBP 42,000 per year",
  "employment.pay_frequency": "e.g. monthly",
  "employment.employment_type": "e.g. Full-time, permanent",
  "employment.leave_entitlement": "e.g. 25 days plus public holidays",
  "employment.start_date": "e.g. 01 December 2026",
  "worker.postal_address": "Street, town, postcode",
};
