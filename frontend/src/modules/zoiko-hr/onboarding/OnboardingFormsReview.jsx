/*
 * Submitted onboarding forms of one new hire (shown on their record in New Hires): verify, return with a reason, reveal masked
 * financial values (finance permission only).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, FileText, Loader2, RotateCcw, ShieldCheck, Undo2, WalletCards } from "lucide-react";
import {
  errorMessage, getNewHireForms, returnOnboardingForm,
  revealOnboardingForm, verifyOnboardingForm,
} from "../../../service/onboardingPrompt2Service";
import {
  Card, ChipTabs, DetailPanel, DetailSection, EmptyState, KpiCard, KpiGrid, PersonCell, PrimaryButton, SearchInput,
  SecondaryButton, StatusPill, Table, WithDetail, relativeTime, shortDate, td,
} from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

const isBank = (form) => form.canonical_id === "HR-ONB-017";
const statusOf = (form) => String(form.status || "NOT_STARTED").toUpperCase();
const STATUS = {
  SUBMITTED: { label: "To verify", tone: "amber" },
  VERIFIED: { label: "Verified", tone: "green" },
  RETURNED: { label: "Returned", tone: "red" },
  DRAFT: { label: "Draft", tone: "gray" },
  NOT_STARTED: { label: "Not started", tone: "gray" },
};
const statusText = (form) => STATUS[statusOf(form)]?.label || statusOf(form).replace(/_/g, " ").toLowerCase();

function FormStatus({ form }) {
  const s = STATUS[statusOf(form)] || { tone: "gray" };
  return <StatusPill tone={s.tone}>{statusText(form)}</StatusPill>;
}

/** The submission itself, its masking, and the verify / return actions — shared by the embedded cards and the detail panel. */
function FormBody({ form, visible, busy, mayVerify, allowReturn, returning, reason, onReveal, onVerify, onStartReturn, onCancelReturn,
  onReason, onSendBack }) {
  const values = visible?.values || form.values || {};
  const bank = isBank(form);
  const submitted = statusOf(form) === "SUBMITTED";
  const shown = (form.fields || []).filter((field) => values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== "");
  return (
    <>
      {bank && form.id && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onReveal} disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            {visible ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy ? "Loading…" : visible ? "Hide financial details" : "Reveal financial details"}
          </button>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">No values have been entered on this form.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          {shown.map((field) => (
            <div key={field.key} className="min-w-0 rounded-xl bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">{field.label}</dt>
              <dd className={`mt-0.5 break-words text-sm text-gray-900 ${bank && field.classification === "FINANCIAL" ? "font-mono" : ""}`}>
                {String(values[field.key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {bank && !visible && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          Financial values are masked. Reveal only when needed to verify payroll details.
        </p>
      )}
      {form.return_reason && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Previously returned: {form.return_reason}</p>}
      {submitted && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!mayVerify && <p className="mr-auto self-center text-xs text-amber-800">Finance permission is required to verify this form.</p>}
          {allowReturn && (
            <SecondaryButton icon={Undo2} disabled={busy} onClick={onStartReturn}>Return for changes</SecondaryButton>
          )}
          <PrimaryButton icon={CheckCircle2} disabled={!mayVerify || busy} onClick={onVerify}>Verify</PrimaryButton>
        </div>
      )}
      {allowReturn && returning && (
        <form className="mt-4 border-t border-gray-100 pt-4" onSubmit={(event) => { event.preventDefault(); onSendBack(); }}>
          <label htmlFor={`return-${form.id}`} className="block text-sm font-medium text-gray-700">What needs to change?</label>
          <textarea id={`return-${form.id}`} required maxLength={2000} value={reason} onChange={(event) => onReason(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="mt-2 flex justify-end gap-2">
            <SecondaryButton onClick={onCancelReturn}>Cancel</SecondaryButton>
            <button type="submit" disabled={!String(reason || "").trim() || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">Send back</button>
          </div>
        </form>
      )}
    </>
  );
}

export default function OnboardingFormsReview({ hireId }) {
  const [forms, setForms] = useState([]);
  const [financePermitted, setFinancePermitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [returnReasons, setReturnReasons] = useState({});
  const [returningId, setReturningId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await getNewHireForms(hireId);
      setForms(Array.isArray(result?.items) ? result.items : []);
      setFinancePermitted(!!result?.finance_permitted);
    } catch (err) {
      setError(errorMessage(err, "Onboarding forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [hireId]);


  const actOn = async (form, action) => {
    setBusyId(form.id);
    setError("");
    setNotice("");
    try {
      const result = action === "verify"
        ? await verifyOnboardingForm(form.id)
        : await returnOnboardingForm(form.id, (returnReasons[form.id] || "").trim());
      setForms((current) => current.map((item) => item.id === form.id ? { ...item, ...result } : item));
      setRevealed((current) => ({ ...current, [form.id]: null }));
      setReturningId(null);
      setReturnReasons((current) => ({ ...current, [form.id]: "" }));
      setNotice(action === "verify" ? `${form.title} verified.` : `${form.title} returned to the new hire.`);
    } catch (err) {
      setError(errorMessage(err, action === "verify" ? "The form could not be verified." : "The form could not be returned."));
    } finally {
      setBusyId(null);
    }
  };

  const toggleReveal = async (form) => {
    if (revealed[form.id]) {
      setRevealed((current) => ({ ...current, [form.id]: null }));
      return;
    }
    setBusyId(form.id);
    setError("");
    try {
      const result = await revealOnboardingForm(form.id);
      setRevealed((current) => ({ ...current, [form.id]: result }));
    } catch (err) {
      setError(errorMessage(err, "Details could not be revealed."));
    } finally {
      setBusyId(null);
    }
  };

  const bodyProps = (form) => ({
    form,
    visible: revealed[form.id],
    busy: busyId === form.id,
    mayVerify: !isBank(form) || financePermitted,
    allowReturn: true,
    returning: returningId === form.id,
    reason: returnReasons[form.id] || "",
    onReveal: () => toggleReveal(form),
    onVerify: () => actOn(form, "verify"),
    onStartReturn: () => { setReturningId(form.id); setError(""); },
    onCancelReturn: () => setReturningId(null),
    onReason: (value) => setReturnReasons((current) => ({ ...current, [form.id]: value })),
    onSendBack: () => actOn(form, "return"),
  });

  const banners = (
    <>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{notice}</span>
        </div>
      )}
    </>
  );
  const retry = error ? <SecondaryButton icon={RotateCcw} onClick={load}>Try again</SecondaryButton> : null;

  if (loading) return <section className="rounded-2xl border border-gray-200/80 bg-white p-5 text-sm text-gray-500 shadow-sm">Loading forms…</section>;
  return (
    <section className="space-y-4" aria-label="New hire forms">
      <header>
        <h2 className="text-lg font-semibold text-gray-900">New hire forms</h2>
        <p className="mt-1 text-sm text-gray-500">Review submitted onboarding forms. Financial details remain masked unless you explicitly reveal them.</p>
      </header>
      {banners}
      {forms.length === 0 ? (
        <Card><EmptyState icon={FileText} title="No forms have been started." /></Card>
      ) : forms.map((form) => (
        <article key={form.id || form.canonical_id} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{form.title || form.canonical_id}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {form.new_hire_name ? `For ${form.new_hire_name} · ` : ""}
                {form.submitted_at ? `Submitted ${shortDate(form.submitted_at)}` : "Not submitted yet"}
              </p>
            </div>
            <FormStatus form={form} />
          </div>
          <FormBody {...bodyProps(form)} />
        </article>
      ))}
      {retry}
    </section>
  );
}
