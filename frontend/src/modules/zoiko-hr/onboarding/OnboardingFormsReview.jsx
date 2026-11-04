/*
 * Submitted onboarding forms: verify, return with a reason, reveal masked financial values (finance permission only).
 * Two uses: embedded on a new hire's record (`hireId`), and the routed Payroll Verifications queue (`payrollQueue`), which
 * gets the Onboarding module shell, KPI row, status chips, a table and a detail panel.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, FileText, Loader2, RotateCcw, ShieldCheck, Undo2, WalletCards } from "lucide-react";
import {
  errorMessage, getNewHireForms, getPayrollVerifications, returnOnboardingForm,
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

export default function OnboardingFormsReview({ hireId, payrollQueue = false }) {
  const [forms, setForms] = useState([]);
  const [financePermitted, setFinancePermitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noFinancePermission, setNoFinancePermission] = useState(false);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [returnReasons, setReturnReasons] = useState({});
  const [returningId, setReturningId] = useState(null);
  // queue view only
  const [hireNames, setHireNames] = useState({});
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    setNoFinancePermission(false);
    try {
      const result = payrollQueue ? await getPayrollVerifications() : await getNewHireForms(hireId);
      setForms(Array.isArray(result?.items) ? result.items : []);
      setFinancePermitted(!!result?.finance_permitted || payrollQueue);
    } catch (err) {
      // not an error: bank details are for the finance viewers the organization admin chose, and nobody is one by default
      if (payrollQueue && err?.code === "FINANCE_PERMISSION_REQUIRED") setNoFinancePermission(true);
      else setError(errorMessage(err, "Onboarding forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [hireId, payrollQueue]);

  // the queue rows carry only new_hire_id; names come from the onboarding records when this user may read them
  useEffect(() => {
    if (!payrollQueue) return undefined;
    let live = true;
    import("../../../service/hrService")
      .then((m) => (typeof m.getOnboardingRecords === "function" ? m.getOnboardingRecords() : null))
      .then((recs) => {
        if (!live) return;
        const list = Array.isArray(recs) ? recs : Array.isArray(recs?.items) ? recs.items : [];
        setHireNames(Object.fromEntries(list.map((r) => [r.id, r.candidate_name || r.name]).filter(([, n]) => n)));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [payrollQueue]);

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

  // ── embedded on a new hire's record ──────────────────────────────────────────────────────────────────────────────
  if (!payrollQueue) {
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

  // ── routed Payroll Verifications queue ───────────────────────────────────────────────────────────────────────────
  return <PayrollQueue {...{ forms, loading, banners, retry, hireNames, tab, setTab, search, setSearch, selectedId, setSelectedId, bodyProps, load }} />;
}

function PayrollQueue({ forms, loading, banners, retry, hireNames, tab, setTab, search, setSearch, selectedId, setSelectedId, bodyProps, load }) {
  const nameOf = (form) => form.new_hire_name || hireNames[form.new_hire_id]
    || (form.new_hire_id ? `New hire #${form.new_hire_id}` : form.employee_id ? `Employee #${form.employee_id}` : "—");
  const counts = useMemo(() => {
    const c = { ALL: forms.length, SUBMITTED: 0, VERIFIED: 0, RETURNED: 0 };
    forms.forEach((f) => { const s = statusOf(f); if (s in c) c[s] += 1; });
    return c;
  }, [forms]);
  const q = search.trim().toLowerCase();
  const rows = forms.filter((f) => (tab === "ALL" || statusOf(f) === tab)
    && (!q || `${nameOf(f)} ${f.title || ""} ${f.canonical_id || ""}`.toLowerCase().includes(q)));
  const selected = forms.find((f) => f.id === selectedId) || null;

  const detail = selected ? (
    <DetailPanel title="Payroll submission" onClose={() => setSelectedId(null)}
      header={
        <div className="min-w-0">
          <PersonCell name={nameOf(selected)} sub={selected.title || selected.canonical_id} />
          <div className="mt-2"><FormStatus form={selected} /></div>
        </div>
      }>
      <DetailSection title="Submission">
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-gray-500">Submitted</dt><dd className="text-gray-900">{shortDate(selected.submitted_at)}</dd></div>
          <div><dt className="text-xs text-gray-500">Verified</dt><dd className="text-gray-900">{shortDate(selected.verified_at)}</dd></div>
        </dl>
      </DetailSection>
      <DetailSection title="Details">
        <FormBody {...bodyProps(selected)} />
      </DetailSection>
    </DetailPanel>
  ) : null;

  const tabs = [
    { value: "ALL", label: "All", count: counts.ALL },
    { value: "SUBMITTED", label: "To verify", count: counts.SUBMITTED },
    { value: "VERIFIED", label: "Verified", count: counts.VERIFIED },
    { value: "RETURNED", label: "Returned", count: counts.RETURNED },
  ];

  if (noFinancePermission) {
    return (
      <OnboardingLayout title="Payroll Verifications" subtitle="Submitted bank and payroll forms awaiting finance verification.">
        <Card>
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true"><ShieldCheck className="h-6 w-6" /></span>
            <h2 className="text-base font-semibold text-gray-900">Finance permission needed</h2>
            <p className="max-w-md text-sm text-gray-600">
              Bank and payroll details are shown only to the finance viewers your organization admin has chosen. An organization admin can
              add you under Onboarding settings, in Finance viewers.
            </p>
            <Link to="/zoiko-hr/onboarding/settings" className="text-sm font-semibold text-blue-600 hover:underline">Go to Onboarding settings</Link>
          </div>
        </Card>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout title="Payroll Verifications" subtitle="Submitted bank and payroll forms awaiting finance verification."
      actions={<SecondaryButton icon={RotateCcw} onClick={load} disabled={loading}>Refresh</SecondaryButton>}>
      <section className="space-y-6" aria-label="Payroll verification queue">
        <h2 className="sr-only">Payroll verification queue</h2>
        {banners}
        <KpiGrid cols={3}>
          <KpiCard label="To Verify" icon={WalletCards} tone="amber" kpi={{ value: loading ? null : counts.SUBMITTED }} loading={loading} />
          <KpiCard label="Verified This Session" icon={CheckCircle2} tone="green" kpi={{ value: loading ? null : counts.VERIFIED }} loading={loading} />
          <KpiCard label="Returned This Session" icon={Undo2} tone="red" kpi={{ value: loading ? null : counts.RETURNED }} loading={loading} />
        </KpiGrid>
        <p className="-mt-3 text-[11px] text-gray-400">The queue lists submitted forms; verified and returned counts are the ones actioned since this page was opened.</p>

        <WithDetail detail={detail}>
          <Card bodyClass="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
              <ChipTabs label="Verification status" value={tab} onChange={setTab} tabs={tabs} />
              <div className="w-full sm:w-72"><SearchInput value={search} onChange={setSearch} placeholder="Search new hire or form…" label="Search payroll forms" /></div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-5 pb-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading forms…</div>
            ) : (
              <Table columns={[{ label: "New hire" }, { label: "Form" }, { label: "Submitted" }, { label: "Status" }, { label: "Actions", className: "text-right" }]}
                empty={rows.length === 0 ? (
                  <EmptyState icon={WalletCards} title={forms.length ? "No forms match" : "No payroll forms are waiting for verification."}>
                    {forms.length ? "Try another status or search." : null}
                  </EmptyState>
                ) : null}>
                {rows.map((form) => (
                  <tr key={form.id || form.canonical_id} className={`hover:bg-gray-50/60 ${selectedId === form.id ? "bg-blue-50/40" : ""}`}>
                    <td className={`${td} min-w-[12rem]`}><PersonCell name={nameOf(form)} sub={form.employee_id ? `Employee #${form.employee_id}` : null} /></td>
                    <td className={td}>{form.title || form.canonical_id || "—"}</td>
                    <td className={td}>
                      <p className="text-gray-800">{shortDate(form.submitted_at)}</p>
                      {form.submitted_at && <p className="text-xs text-gray-500">{relativeTime(form.submitted_at)}</p>}
                    </td>
                    <td className={td}><FormStatus form={form} /></td>
                    <td className={`${td} text-right`}>
                      <button type="button" onClick={() => setSelectedId(form.id)} aria-label={`Review ${form.title || "form"} for ${nameOf(form)}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Review</button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </WithDetail>
        {retry}
      </section>
    </OnboardingLayout>
  );
}
