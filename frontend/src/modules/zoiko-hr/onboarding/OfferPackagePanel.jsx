/*
 * Offer package panel (Onboarding › Documents › Offer package): the 10 standard onboarding documents for one new hire.
 * For each document it shows the action the new hire takes (sign, acknowledge, complete, voluntary, information), where it
 * stands, and — before it is sent — exactly what is missing: HR data (typed in here) or counsel wording (Settings › Offer
 * package). Any document can be previewed. HR ticks which documents to send (all that can go are ticked at first); "Send"
 * issues the ticked documents that are ready, and ticked documents waiting for the new hire's address or outside-activities
 * declaration are released automatically when they enter it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, Eye, FileSignature, Hourglass, Info, Loader2, Pencil, Send, ShieldAlert, UserRound, Zap } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusPill } from "../recruitment/ui";
import OfferPackageV2Section from "./OfferPackageV2Section";
import PackageDocumentEditor from "./PackageDocumentEditor";
import { Toast, useToast } from "../../../components/Toast";
import { openFile } from "../../../utils/fileViewer";
import { downloadHirePackageDocument, downloadHirePackageZip, getHirePackage, getHirePackagePreview, saveHirePackageInputs, sendOnboardingPackage,
  sendOnboardingPortalInvite } from "../../../service/hrService";
import { sendPreparedDocuments } from "../../../service/onboardingSetupService";

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

const UNSENT = ["not_sent", "declined"];
/** Can HR choose to send this document now? Ready, or waiting only for something the new hire enters in the portal. */
const sendable = (d) => UNSENT.includes(d.state) && (d.ready
  || (d.missing_clauses.length === 0 && d.missing_fields.length > 0 && d.missing_fields.every((f) => f.candidate_provides)));

/** One typed input for a value HR enters: the organisation's own fields carry their type (choice, yes/no, date, number). */
export function HireValueInput({ id, field, value, onChange, className, placeholder, maxLength }) {
  const t = field.custom ? field.input_type : null;
  if (t === "choice" || t === "yes_no") {
    const options = t === "yes_no" ? [{ v: "yes", l: "Yes" }, { v: "no", l: "No" }] : (field.options || []).map((o) => ({ v: o, l: o }));
    return (
      <select id={id} className={className} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }
  if (t === "long_text") {
    return <textarea id={id} rows={3} maxLength={4000} className={className} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input id={id} className={className} value={value || ""} maxLength={maxLength}
      type={t === "date" || DATE_INPUTS.includes(field.key) ? "date" : "text"}
      inputMode={t === "number" || t === "money" || field.key === "employment.base_pay" ? "decimal" : undefined}
      placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/** How the panel names something only the new hire provides. */
function hireNeedText(f) {
  if (f.key === "worker.postal_address") return "their postal address";
  if (f.key === "worker.outside_activities") return "their outside-activities declaration";
  return (f.meaning || "").toLowerCase();
}

const fieldCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function OfferPackagePanel({ hireId, onSent, onError, footer: Footer }) {
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState("");
  const [editing, setEditing] = useState(null);        // the document open in the full editor (see PackageDocumentEditor)
  const [result, setResult] = useState(null);
  const [chosen, setChosen] = useState(() => new Set());     // the documents HR ticked to send
  const [toast, showToast] = useToast();                     // success / error of Send and Save choices, always on screen

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

  // every document that can go is ticked when the package (re)loads; HR unticks what should wait
  // (keyed by the categories, not the array: saving choices reloads the package and must not undo HR's unticking)
  const choosable = useMemo(() => (pkg?.documents || []).filter(sendable).map((d) => d.category), [pkg]);
  const choosableKey = choosable.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setChosen(new Set(choosable)); }, [choosableKey]);
  const toggle = (category) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(category)) next.delete(category); else next.add(category);
    return next;
  });

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

  // missing values set once for the organisation (not typed per hire), with where to set each
  const missingSettings = useMemo(() => {
    if (!pkg) return [];
    const m = new Map();
    pkg.documents.forEach((d) => {
      if (!UNSENT.includes(d.state)) return;
      d.missing_fields.forEach((f) => {
        if (f.editable || f.candidate_provides || !f.settings_path) return;
        const cur = m.get(f.key) || { ...f, docs: [] };
        cur.docs.push(d.title);
        m.set(f.key, cur);
      });
    });
    return [...m.values()];
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
  const chosenReady = ready.filter((c) => chosen.has(c));
  const chosenWaiting = [...chosen].filter((c) => !ready.includes(c));
  // Send works for any ticked document: ready ones go now, ones waiting only for the new hire's details are released
  // automatically once they enter them (the server holds them).
  const chosenCount = chosenReady.length + chosenWaiting.length;

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
      hireNeeds: [...new Set(unsent.flatMap((d) => d.missing_fields.filter((f) => f.candidate_provides).map(hireNeedText)))],
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
      openFile(res.blob, res.filename || `${category}-preview.pdf`, "preview");
    } catch (e) {
      onError?.(e?.message || "The preview could not be generated.");
    } finally {
      setPreviewing("");
    }
  };

  const [downloading, setDownloading] = useState("");
  const download = async (key, fetcher) => {
    setDownloading(key);
    try {
      const res = await fetcher();
      openFile(res.blob, res.filename, "download");
    } catch (e) {
      onError?.(e?.message || "The download failed.");
    } finally {
      setDownloading("");
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

  // documents automation prepared (Settings › Documents in your onboarding package › Rules & timing): one click sends them
  const prepared = useMemo(() => {
    const q = pkg?.automation?.queued || [];
    return (pkg?.documents || []).filter((d) => q.includes(d.category));
  }, [pkg]);
  const [sendingPrepared, setSendingPrepared] = useState(false);
  const sendPrepared = async () => {
    setSendingPrepared(true);
    setError("");
    try {
      const res = await sendPreparedDocuments(hireId);
      if (res?.package) setPkg(res.package);
      setResult(res);
      showToast(res?.issued?.length ? "success" : "error", res?.message || "Nothing was sent.");
      onSent?.(res);
    } catch (e) {
      const msg = e?.message || "The prepared documents could not be sent.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSendingPrepared(false);
    }
  };

  // the organisation's own fields HR types for this hire (all of them, so values can be set before anything is missing)
  const customInputs = (pkg?.input_fields || []).filter((f) => f.custom);
  const [customValues, setCustomValues] = useState({});
  const saveCustom = async () => {
    const values = Object.fromEntries(Object.entries(customValues).map(([k, v]) => [k, String(v ?? "").trim()]));
    if (!Object.keys(values).length) return;
    setSaving(true);
    setError("");
    try {
      setPkg(await saveHirePackageInputs(hireId, values));
      setCustomValues({});
      showToast("success", "Saved.");
    } catch (e) {
      setError(e?.message || "The values could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!chosenCount) return;
    setSending(true);
    setError("");
    try {
      const res = await sendOnboardingPackage(hireId, [...chosen]);
      setResult(res);
      showToast(res?.issued?.length || res?.held?.length ? "success" : "error",
        res?.message || (res?.issued?.length ? "Documents sent." : "Nothing was sent."));
      onSent?.(res);
      await load();
    } catch (e) {
      const msg = e?.message || "The documents could not be sent.";
      setError(msg);
      showToast("error", msg);
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

        {prepared.length > 0 && (
          <div role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="flex items-start gap-2 font-semibold"><Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {prepared.length} document{prepared.length === 1 ? " was" : "s were"} prepared automatically and {prepared.length === 1 ? "is" : "are"} ready to send
            </p>
            <p className="mt-1 text-xs">{prepared.map((d) => d.title).join(", ")}. Preview them below, then send.</p>
            <button type="button" onClick={sendPrepared} disabled={sendingPrepared}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {sendingPrepared ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send the prepared document{prepared.length === 1 ? "" : "s"}
            </button>
          </div>
        )}

        {pkg && <OfferPackageV2Section pkg={pkg} hireId={hireId} onSaved={setPkg} onError={setError} onNotice={showToast} />}

        {customInputs.length > 0 && (
          <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-gray-800">Your document fields – {pkg?.candidate_name}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {customInputs.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`pkg-cf-${f.key}`} className="mb-1 block text-sm font-medium text-gray-700">
                    {f.meaning}{!f.required && <span className="text-xs font-normal text-gray-400"> (optional)</span>}
                  </label>
                  <HireValueInput id={`pkg-cf-${f.key}`} field={f} className={fieldCls}
                    value={customValues[f.key] ?? f.value ?? ""} onChange={(v) => setCustomValues((p) => ({ ...p, [f.key]: v }))} />
                  {f.help && <p className="mt-0.5 text-xs text-gray-500">{f.help}</p>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <SecondaryButton onClick={saveCustom} disabled={saving || !Object.keys(customValues).length}>{saving ? "Saving…" : "Save"}</SecondaryButton>
            </div>
          </fieldset>
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

        {missingSettings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-semibold"><Info className="mt-0.5 h-4 w-4 shrink-0" />Set once in Settings</p>
            <ul className="mt-1 space-y-1 text-xs leading-5">
              {missingSettings.map((f) => (
                <li key={f.key}>
                  <Link to={f.settings_path} className="font-semibold underline">{f.meaning}</Link>
                  <span className="text-amber-800"> – {f.source || "Onboarding settings"} · used in {f.docs.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {missingInputs.length > 0 && (
          <fieldset id="pkg-missing" className="scroll-mt-4 rounded-2xl border border-amber-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-gray-800">Fill in to send – {pkg?.candidate_name}</legend>
            <p className="mb-3 text-xs text-gray-500">
              These values are printed in the documents. Details for this new hire are saved for them only; clause details
              (marked “all new hires”) are saved once in Settings › Company profile and used for everyone.
            </p>
            <div className="space-y-3">
              {missingInputs.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`pkg-in-${f.key}`} className="mb-1 block text-sm font-medium text-gray-700">
                    {f.hr_may_enter ? "Postal address" : f.meaning}{" "}
                    <span className="text-xs font-normal text-gray-400">
                      ({f.hr_may_enter ? `optional – or ${pkg?.candidate_name} enters it in the portal` : f.org_wide ? "all new hires" : f.source})
                    </span>
                  </label>
                  {f.key === "job.role_purpose" ? (
                    <textarea id={`pkg-in-${f.key}`} rows={3} maxLength={1200} className={fieldCls} value={inputs[f.key] || ""}
                      placeholder="2–3 sentences on why the role exists" onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))} />
                  ) : (
                    <HireValueInput id={`pkg-in-${f.key}`} field={f} className={fieldCls} value={inputs[f.key] || ""}
                      maxLength={f.org_wide ? 255 : 300}
                      placeholder={PLACEHOLDERS[f.key] || (f.key.includes("_url") ? "https://…" : "")}
                      onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))} />
                  )}
                  {f.key === "employment.base_pay" && (
                    <p className="mt-0.5 text-xs text-gray-500">Type the amount (e.g. 12000): it is printed with the currency and pay period, e.g. “₹12,000 per month”.</p>
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

        {pkg && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {[["pdf", "Download all (ZIP)"], ["docx", "All as Word (ZIP)"]].map(([fmt, label]) => (
              <button key={fmt} type="button" disabled={!!downloading} onClick={() => download(`zip-${fmt}`, () => downloadHirePackageZip(hireId, fmt))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {downloading === `zip-${fmt}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{label}
              </button>
            ))}
          </div>
        )}

        {choosable.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm">
            <p className="text-blue-900" aria-live="polite">
              <span className="font-semibold">{chosen.size} of {choosable.length}</span> document{choosable.length === 1 ? "" : "s"} selected to send
            </p>
            <span className="flex gap-1">
              <button type="button" onClick={() => setChosen(new Set(choosable))} disabled={chosen.size === choosable.length}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Select all</button>
              <button type="button" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Clear</button>
            </span>
          </div>
        )}

        <ol className="space-y-2">
          {pkg?.documents.map((d, i) => {
            const base = STATE[d.state] || STATE.not_sent;
            // a form the new hire filled in online: say so, and Preview shows their completed copy
            const st = d.filled_online && d.state === "needs_review" ? { ...base, label: "Filled in online – review" } : base;
            const unsent = ["not_sent", "declined"].includes(d.state);
            const candidateFields = d.missing_fields.filter((f) => f.candidate_provides);
            const addressOnly = candidateFields.length > 0 && candidateFields.every((f) => f.hr_may_enter);
            const hrFields = d.missing_fields.filter((f) => !f.candidate_provides);
            return (
              <li key={d.category} className={`rounded-2xl border bg-white p-3 ${chosen.has(d.category) ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {sendable(d) && (
                      <input id={`pkg-pick-${d.category}`} type="checkbox" checked={chosen.has(d.category)} onChange={() => toggle(d.category)}
                        aria-label={`Send ${d.title}`} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    )}
                    <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {sendable(d) ? <label htmlFor={`pkg-pick-${d.category}`} className="cursor-pointer">{i + 1}. {d.title}</label> : `${i + 1}. ${d.title}`}
                    </p>
                    <p className="text-xs text-gray-500">{d.template_id} · {d.doc_type} · {d.risk} / {d.sensitivity}{d.orientation === "landscape" ? " · landscape" : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={MODE_TONE[d.mode]}>{d.mode_label}</StatusPill>
                    {unsent && d.ready
                      ? <StatusPill tone="teal" icon={FileSignature}>{prepared.some((p) => p.category === d.category) ? "Prepared – ready to send" : "Ready to send"}</StatusPill>
                      : d.awaiting_employer
                        ? <StatusPill tone="violet" icon={Hourglass}>Signed – awaiting employer</StatusPill>
                        : <StatusPill tone={unsent ? "amber" : st.tone} icon={st.icon}>{unsent ? "Waiting" : st.label}</StatusPill>}
                  </div>
                </div>
                {unsent && !d.ready && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {hrFields.length > 0 && (
                      <li className="flex gap-1.5 text-amber-800"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          Not sent yet – missing: {hrFields.map((f) => f.meaning).join("; ")}.{" "}
                          {hrFields.some((f) => f.editable) && (
                            <button type="button" className="font-semibold underline"
                              onClick={() => document.getElementById("pkg-missing")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                              Fill in above
                            </button>
                          )}
                          {hrFields.some((f) => !f.editable && f.settings_path) && (
                            <>
                              {hrFields.some((f) => f.editable) ? " · " : ""}
                              <Link to={hrFields.find((f) => !f.editable && f.settings_path).settings_path} className="font-semibold underline">Open Settings</Link>
                            </>
                          )}
                        </span>
                      </li>
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
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(d)} disabled={previewing === d.category}
                      title={d.editable ? "Edit the whole document, including any missing details or wording" : "Sent documents are read-only"}
                      aria-label={`Edit / Fill missing gaps for ${d.title}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" />Edit / Fill missing gaps{d.edited ? " · edited" : ""}
                    </button>
                    <button type="button" onClick={() => preview(d.category)} disabled={previewing === d.category}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                      {previewing === d.category ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}{d.filled_online ? "View filled form" : "Preview"}
                    </button>
                    {["pdf", "docx"].map((fmt) => (
                      <button key={fmt} type="button" disabled={downloading === `${d.category}-${fmt}`}
                        onClick={() => download(`${d.category}-${fmt}`, () => downloadHirePackageDocument(hireId, d.category, fmt))}
                        aria-label={`Download ${d.title} as ${fmt.toUpperCase()}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                        {downloading === `${d.category}-${fmt}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{fmt.toUpperCase()}
                      </button>
                    ))}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <Footer>
        <p className="mr-auto self-center text-xs text-gray-500">
          {ready.length ? `${chosenReady.length} of ${ready.length} ready document${ready.length === 1 ? "" : "s"} selected`
            + (chosenWaiting.length ? ` · ${chosenWaiting.length} more sent when ${pkg?.candidate_name} adds their details` : "")
            : chosenWaiting.length ? `${chosenWaiting.length} selected · sent when ${pkg?.candidate_name} adds their details`
            : status?.waitingForHire.length ? `Waiting for ${pkg?.candidate_name}` : status?.blocked.length ? "Some documents are not ready" : "All documents sent"}
        </p>
        <PrimaryButton icon={Send} onClick={send} disabled={sending || !chosenCount}
          title={!chosenCount ? (choosable.length ? "Tick at least one document to send." : "No document can be sent yet: see what is missing above.") : undefined}>
          {sending ? "Sending…" : `Send ${chosenCount || ""} selected document${chosenCount === 1 ? "" : "s"}`}
        </PrimaryButton>
      </Footer>
      {editing && (
        <PackageDocumentEditor hireId={hireId} category={editing.category} title={editing.title}
          onClose={() => setEditing(null)}
          onSaved={(updated, message) => { setPkg(updated); showToast("success", message); }}
          onError={(message) => showToast("error", message)} />
      )}
      <Toast toast={toast} />
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

// per-hire values typed as a date (the documents print them in the organisation's date format)
export const DATE_INPUTS = ["employment.start_date", "employment.assessment_end_date"];
const PLACEHOLDERS = {
  "employment.work_location": "e.g. Leeds office, 1 Sample Street",
  "employment.working_hours": "e.g. 37.5 hours per week",
  "employment.base_pay": "e.g. 12000",
  "employment.pay_frequency": "e.g. monthly",
  "employment.employment_type": "e.g. Full-time, permanent",
  "employment.leave_entitlement": "e.g. 25 days plus public holidays",
  "worker.postal_address": "Street, town, postcode",
  "worker.degree": "e.g. B.Tech, Computer Science",
  "worker.institution": "e.g. Osmania University",
  "worker.place": "e.g. Hyderabad",
  "employment.next_stage_title": "e.g. Full-Time Associateship",
};
