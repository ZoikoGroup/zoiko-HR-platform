import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Calendar,
  UserCheck,
  Send,
  Info,
  Clock,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { createLeaveRequest } from '../../../../service/employee';

// Blue-and-white form styling (bug 26: the page used to be a fixed dark theme)
const box = (bad) =>
  `w-full bg-white border text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all [color-scheme:light] ${
    bad ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 hover:border-blue-300 focus:border-blue-500 focus:ring-blue-100'
  }`;
const LABEL = "flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider";
const SMALL_LABEL = "text-xs font-bold text-slate-700 uppercase tracking-wider";
const ERR = "text-xs text-red-600 mt-1";

export default function ApplyLeaveForm() {
  const navigate = useNavigate();

  const leaveTypes = [
    "Annual Leave",
    "Sick Leave",
    "Casual Leave",
    "Unpaid Leave",
    "Maternity Leave",
    "Paternity Leave",
    "Bereavement Leave",
    "Work From Home",
  ];

  const EMPTY = { leave_type: '', start_date: '', end_date: '', reason: '', handover_note: '',
    parental_type: '', expected_date: '', pay_option: '', kit_days_interest: false, relationship: '', travel_needed: false, message: '' };
  const [formData, setFormData] = useState(EMPTY);
  // A sickness or bereavement reason is optional: you never have to explain a diagnosis or a loss to apply.
  const isSick = /sick/i.test(formData.leave_type);
  const isBereavement = /bereavement/i.test(formData.leave_type);
  const isFamily = /maternity|paternity/i.test(formData.leave_type);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    // Drop the stale message for the field being edited (and any old API error),
    // so a corrected value never sits under its own red error.
    setErrors((prev) => {
      if (!prev[name] && !prev._api) return prev;
      const next = { ...prev };
      delete next[name];
      delete next._api;
      return next;
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  const calculateDays = () => {
    if (!formData.start_date || !formData.end_date) return 0;
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    if (end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  };

  const validate = () => {
    const e = {};
    if (!formData.leave_type) e.leave_type = "Select a leave type";
    if (!formData.start_date) e.start_date = "Select start date";
    else if (formData.start_date < today) e.start_date = "Leave cannot start in the past";
    if (!formData.end_date) e.end_date = "Select end date";
    if (formData.start_date && formData.end_date && new Date(formData.end_date) < new Date(formData.start_date)) {
      e.end_date = "End date must be after start date";
    }
    if (!isSick && !isBereavement && formData.reason.trim().length < 10) e.reason = "Provide at least 10 characters";
    if (isFamily && !formData.parental_type) e.parental_type = "Choose the type of family leave";
    if (isFamily && !formData.expected_date) e.expected_date = "Give the expected week of birth or placement";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) { setErrors(v); return; }
    setSubmitting(true);
    setErrors({});
    setSuccess(null);
    try {
      const details = isFamily
        ? { parental_type: formData.parental_type, expected_date: formData.expected_date, pay_option: formData.pay_option || undefined,
            kit_days_interest: formData.kit_days_interest }
        : isBereavement
          ? { relationship: formData.relationship || undefined, travel_needed: formData.travel_needed, message: formData.message || undefined }
          : undefined;
      await createLeaveRequest({ leave_type: formData.leave_type, start_date: formData.start_date, end_date: formData.end_date,
        reason: formData.reason.trim() || null, handover_note: formData.handover_note.trim() || null, details });
      setSuccess("Leave application submitted successfully! It is under process.");
      setFormData(EMPTY);
    } catch (err) {
      setErrors({ _api: err?.message || "Failed to submit leave request" });
    } finally {
      setSubmitting(false);
    }
  };

  const days = calculateDays();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-700 to-blue-500 text-white px-6 py-6 sm:px-8 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Zoiko HR Portal</div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Apply Leave</h1>
            <p className="text-sm text-blue-100 mt-1">Submit a new leave request for manager review and approval.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/employee/leaves')}
            className="inline-flex items-center gap-2 text-blue-700 text-sm font-semibold bg-white hover:bg-blue-50 px-4 py-2.5 rounded-xl transition-colors self-start sm:self-auto shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Dashboard
          </button>
        </div>

        {/* SUCCESS / ERROR BANNERS */}
        {success && (
          <div role="status" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-semibold">
            <span className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 shrink-0" /> {success}</span>
            <button
              type="button"
              onClick={() => navigate('/employee/leaves/history')}
              className="self-start sm:self-auto text-blue-700 hover:text-blue-900 underline underline-offset-2 font-semibold"
            >
              View Leave History
            </button>
          </div>
        )}

        {errors._api && (
          <div role="alert" className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors._api}
          </div>
        )}

        {/* FORM + SUMMARY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* MAIN FORM */}
          <div className="lg:col-span-2 bg-white border border-slate-200 border-t-4 border-t-blue-600 rounded-2xl p-5 sm:p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>

              {/* LEAVE TYPE */}
              <div className="space-y-2">
                <label htmlFor="al-type" className={LABEL}>
                  <FileText className="w-4 h-4 text-blue-600" />
                  Leave Type <span className="text-red-500">*</span>
                </label>
                <select id="al-type" name="leave_type" value={formData.leave_type} onChange={handleChange}
                  aria-invalid={!!errors.leave_type} className={`${box(errors.leave_type)} cursor-pointer`}>
                  <option value="" disabled>Select leave type...</option>
                  {leaveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.leave_type && <p className={ERR}>{errors.leave_type}</p>}
              </div>

              {/* DATES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="al-start" className={LABEL}>
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input id="al-start" type="date" name="start_date" value={formData.start_date} min={today} onChange={handleChange}
                    aria-invalid={!!errors.start_date} className={box(errors.start_date)} />
                  {errors.start_date && <p className={ERR}>{errors.start_date}</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="al-end" className={LABEL}>
                    <Calendar className="w-4 h-4 text-blue-600" />
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input id="al-end" type="date" name="end_date" value={formData.end_date} min={formData.start_date || today} onChange={handleChange}
                    aria-invalid={!!errors.end_date} className={box(errors.end_date)} />
                  {errors.end_date && <p className={ERR}>{errors.end_date}</p>}
                </div>
              </div>

              {isFamily && (
                <fieldset className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <legend className="px-1 text-xs font-bold text-blue-700 uppercase tracking-wider">Family leave</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1 block"><span className={SMALL_LABEL}>Type of leave *</span>
                      <select name="parental_type" value={formData.parental_type} onChange={handleChange} className={box(errors.parental_type)}>
                        <option value="">Choose…</option><option value="maternity">Maternity</option><option value="paternity_partner">Paternity / partner</option>
                        <option value="adoption">Adoption</option><option value="shared_parental">Shared / parental</option>
                      </select>
                      {errors.parental_type && <p className={ERR}>{errors.parental_type}</p>}</label>
                    <label className="space-y-1 block"><span className={SMALL_LABEL}>Expected week of birth or placement *</span>
                      <input type="date" name="expected_date" value={formData.expected_date} onChange={handleChange} className={box(errors.expected_date)} />
                      {errors.expected_date && <p className={ERR}>{errors.expected_date}</p>}</label>
                    <label className="space-y-1 block"><span className={SMALL_LABEL}>Pay option (where offered)</span>
                      <input name="pay_option" value={formData.pay_option} onChange={handleChange} className={box(false)} /></label>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="kit_days_interest" checked={formData.kit_days_interest} onChange={handleChange} className="accent-blue-600 w-4 h-4" />
                      I am interested in keep-in-touch days</label>
                  </div>
                  <p className="text-xs text-slate-500">We may ask for the evidence the law allows, such as a certificate of expected birth. Please do not share more medical information than we ask for. HR will confirm your dates and pay.</p>
                </fieldset>
              )}
              {isBereavement && (
                <fieldset className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <legend className="px-1 text-xs font-bold text-blue-700 uppercase tracking-wider">Bereavement leave</legend>
                  <p className="text-sm text-slate-700">We are very sorry for your loss. You do not have to tell us anything you do not want to share.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1 block"><span className={SMALL_LABEL}>Relationship (optional)</span>
                      <select name="relationship" value={formData.relationship} onChange={handleChange} className={box(false)}>
                        <option value="">Not given</option>{["partner", "child", "parent", "sibling", "grandparent", "other family member", "other", "prefer not to say"].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select></label>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="travel_needed" checked={formData.travel_needed} onChange={handleChange} className="accent-blue-600 w-4 h-4" />
                      I need to travel</label>
                    <label className="space-y-1 block sm:col-span-2"><span className={SMALL_LABEL}>Message to your manager (optional)</span>
                      <textarea name="message" rows={2} value={formData.message} onChange={handleChange} className={box(false)} /></label>
                  </div>
                </fieldset>
              )}

              {/* HANDOVER (seen by your manager and HR only) */}
              <label className="space-y-2 block"><span className={SMALL_LABEL}>Cover and handover <span className="normal-case font-normal text-slate-500">(optional, seen by your manager and HR)</span></span>
                <textarea name="handover_note" rows={2} value={formData.handover_note} onChange={handleChange} className={`${box(false)} resize-none`} /></label>

              {/* REASON */}
              <div className="space-y-2">
                <label htmlFor="al-reason" className={LABEL}>
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  Reason for Leave {isSick || isBereavement ? <span className="normal-case font-normal text-slate-500">(optional, you do not need to give a diagnosis)</span> : null}
                </label>
                <textarea id="al-reason" name="reason" rows={4} value={formData.reason} onChange={handleChange}
                  placeholder="Describe the reason for your leave application..."
                  aria-invalid={!!errors.reason} className={`${box(errors.reason)} resize-none`} />
                {errors.reason && <p className={ERR}>{errors.reason}</p>}
              </div>

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-sm transition-colors"
              >
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</> : <><Send className="w-5 h-5" /> Submit Leave Request</>}
              </button>
            </form>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Info className="w-4 h-4 text-blue-600" />
                Application Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center gap-3 py-1">
                  <span className="text-slate-500">Selected Type</span>
                  <span className="font-semibold text-slate-900 capitalize text-right">{formData.leave_type || '—'}</span>
                </div>
                <div className="flex justify-between items-center gap-3 py-1 border-t border-slate-100">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-semibold text-blue-700">{days ? `${days} Day${days > 1 ? 's' : ''}` : '0 Days'}</span>
                </div>
                <div className="flex justify-between items-center gap-3 py-1 border-t border-slate-100">
                  <span className="text-slate-500">Approver</span>
                  <span className="font-semibold text-slate-900">Direct Manager</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                <Clock className="w-4 h-4" />
                Submission Guidelines
              </div>
              <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  Apply at least 2 days in advance for planned casual leave.
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  Medical certificates are required for sick leave exceeding 2 consecutive days.
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  Requests are automatically logged and tracked in real-time.
                </li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
