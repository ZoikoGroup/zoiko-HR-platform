/*
 * New Exit: HR starts an exit for someone (termination, end of contract, mutual separation, retirement, death in service,
 * or a resignation HR records). The last working day is proposed from the company's notice rules; HR can change it.
 * ?employee=<id> preselects the person (the Employees → Lifecycle page links here that way).
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, UserMinus } from "lucide-react";
import { errorMessage, getNoticePreview, startExit } from "../../../service/offboardingService";
import { Card, PrimaryButton, SecondaryButton, shortDate } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import {
  EXIT_TYPES, EmployeePicker, ErrorBanner, Input, NOTICE_HANDLING, REASON_CATEGORIES, Select, Textarea, todayIso,
} from "./shared";

export default function OffboardingNewExit() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [employee, setEmployee] = useState(null);
  const [exitType, setExitType] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [noticeDate, setNoticeDate] = useState(todayIso());
  const [handling, setHandling] = useState("serve");
  const [lwd, setLwd] = useState("");
  const [lwdTouched, setLwdTouched] = useState(false);
  const [reportees, setReportees] = useState(null);
  const [hrNotes, setHrNotes] = useState("");
  const [stopNow, setStopNow] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // ?employee=<id>: preselect (the name fills in from the preview's open-case / manager data when available)
  useEffect(() => {
    const pre = Number(params.get("employee"));
    if (pre && !employee) setEmployee({ id: pre, name: params.get("name") || `Employee #${pre}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (!employee) { setPreview(null); return undefined; }
    let live = true;
    setPreviewError("");
    getNoticePreview(employee.id, noticeDate || undefined)
      .then((p) => {
        if (!live) return;
        setPreview(p);
        // a preselected person (?employee=) shows their real name once the preview names them
        if (p?.employee?.name && p.employee.id === employee.id && p.employee.name !== employee.name) {
          setEmployee((cur) => (cur && cur.id === p.employee.id ? { ...cur, name: p.employee.name, employee_code: p.employee.employee_code } : cur));
        }
      })
      .catch((e) => { if (live) { setPreview(null); setPreviewError(errorMessage(e)); } });
    return () => { live = false; };
  }, [employee, noticeDate]);

  // the proposed last day follows the notice rules until HR types their own
  useEffect(() => {
    if (lwdTouched) return;
    if (handling === "waive" || handling === "pay_in_lieu" || exitType === "death_in_service") setLwd(noticeDate || "");
    else if (preview?.notice?.end_date) setLwd(preview.notice.end_date);
  }, [preview, handling, noticeDate, exitType, lwdTouched]);

  const validate = () => {
    const e = {};
    if (!employee) e.employee = "Choose who is leaving.";
    if (!exitType) e.exitType = "Choose the type of exit.";
    if (!noticeDate) e.noticeDate = "Choose the notice date.";
    if (!lwd) e.lwd = "Choose the last working day.";
    else if (noticeDate && lwd < noticeDate) e.lwd = "The last working day cannot be before the notice date.";
    if (reason.length > 2000) e.reason = "At most 2000 characters.";
    if (reportees && employee && reportees.id === employee.id) e.reportees = "Choose someone other than the leaver.";
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = {
        employee_id: employee.id, exit_type: exitType, reason_category: category || undefined, reason: reason.trim() || undefined,
        notice_date: noticeDate, notice_handling: handling, last_working_day: lwd, hr_notes: hrNotes.trim() || undefined,
        stop_access_now: stopNow,
      };
      if (reportees) body.reportees_to_id = reportees.id;
      const created = await startExit(body);
      navigate(`/zoiko-hr/offboarding/cases/${created.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const notice = preview?.notice;
  return (
    <OffboardingLayout title="New Exit" subtitle="Start an exit for someone in your organisation. Employees resign themselves from My Exit.">
      <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-5" aria-label="Start an exit">
        <ErrorBanner message={formError} onClose={() => setFormError("")} />
        <Card title="Who and why">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <EmployeePicker label="Employee" required value={employee} error={errors.employee}
                onChange={(p) => { setEmployee(p); setLwdTouched(false); }} />
              {preview?.open_case && (
                <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  This person already has an exit in progress:
                  <Link to={`/zoiko-hr/offboarding/cases/${preview.open_case.id}`} className="font-semibold underline">{preview.open_case.case_number}</Link>
                </p>
              )}
              {previewError && <p className="mt-2 text-sm text-rose-700">{previewError}</p>}
            </div>
            <Select label="Type of exit" required value={exitType} onChange={setExitType} options={EXIT_TYPES} placeholder="Choose…" error={errors.exitType} />
            <Select label="Reason" value={category} onChange={setCategory} options={REASON_CATEGORIES} placeholder="Choose (optional)…" />
            <Textarea className="sm:col-span-2" label="Details (optional)" value={reason} onChange={setReason} rows={3} maxLength={2000}
              error={errors.reason} hint="Visible to the employee in My Exit." />
          </div>
        </Card>

        <Card title="Notice and last day">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Notice date" type="date" required value={noticeDate} onChange={(v) => { setNoticeDate(v); setLwdTouched(false); }}
              error={errors.noticeDate} />
            <Select label="Notice" value={handling} onChange={(v) => { setHandling(v); setLwdTouched(false); }} options={NOTICE_HANDLING}
              disabled={exitType === "death_in_service"} />
            <Input label="Last working day" type="date" required value={lwd} min={noticeDate || undefined} error={errors.lwd}
              onChange={(v) => { setLwd(v); setLwdTouched(true); }}
              hint={notice ? `Notice per company rules: ${notice.label}, ends ${shortDate(notice.end_date)}.` : "Choose the employee to see their notice."} />
            <div className="text-sm text-gray-600 sm:pt-6">
              {handling === "pay_in_lieu" && "The notice they do not work is paid in the settlement."}
              {handling === "garden_leave" && "They stay employed but do not work until the last day."}
              {handling === "waive" && "No notice: the last day can be today."}
              {handling === "serve" && "They work their notice until the last day."}
            </div>
          </div>
        </Card>

        <Card title="Team and access">
          <div className="space-y-4">
            <div>
              <EmployeePicker label="Direct reports move to" value={reportees} onChange={setReportees} error={errors.reportees}
                exclude={employee ? [employee.id] : []}
                hint={preview ? `${preview.direct_reports} direct report(s). Empty: they move to ${preview.manager?.name || "the leaver's own manager"}.`
                  : "Empty: they move to their current manager's manager."} />
            </div>
            <Textarea label="HR notes (private)" value={hrNotes} onChange={setHrNotes} rows={3} hint="Never shown to the employee." />
            <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm">
              <input type="checkbox" checked={stopNow} onChange={(e) => setStopNow(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-semibold text-rose-900">Stop access now</span>
                <span className="block text-rose-800">Signs them out everywhere and blocks sign-in today. They stay employed until the last working day.
                  Use it for urgent cases only.</span>
              </span>
            </label>
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <SecondaryButton onClick={() => navigate("/zoiko-hr/offboarding/cases")} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" icon={UserMinus} disabled={busy || Boolean(preview?.open_case)}>{busy ? "Starting…" : "Start exit"}</PrimaryButton>
        </div>
      </form>
    </OffboardingLayout>
  );
}
