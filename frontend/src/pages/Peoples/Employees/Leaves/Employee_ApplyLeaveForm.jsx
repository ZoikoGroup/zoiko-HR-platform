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

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 p-6 sm:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* HEADER SECTION */}
        <div className="border-b border-slate-800/80 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-500 mb-1">
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse"></span>
              Zoiko HR Portal
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Apply <span className="text-orange-500">Leave</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Submit a new leave request for manager review and approval.
            </p>
          </div>

          <button
            onClick={() => navigate('/employee/leaves')}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm font-semibold bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl transition-all hover:bg-slate-800 self-start sm:self-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Dashboard
          </button>
        </div>

        {/* SUCCESS / ERROR BANNERS */}
        {success && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-green-950/40 border border-green-800 rounded-xl px-4 py-3 text-green-300 text-sm font-semibold">
            <span className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 shrink-0" /> {success}</span>
            <button
              type="button"
              onClick={() => navigate('/employee/leaves/history')}
              className="self-start sm:self-auto text-green-200 hover:text-white underline underline-offset-2 font-semibold"
            >
              View Leave History
            </button>
          </div>
        )}

        {errors._api && (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors._api}
          </div>
        )}

        {/* FORM + SUMMARY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* MAIN FORM CONTAINER (LEFT 2 COLS) */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
            {/* Ambient Lighting Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent"></div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* LEAVE TYPE DROPDOWN */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Leave Type <span className="text-orange-500">*</span>
                </label>
                <div className="relative">
                  <select
                    name="leave_type"
                    value={formData.leave_type}
                    onChange={handleChange}
                    className={`w-full bg-slate-950/80 border text-white rounded-xl px-4 py-3.5 text-sm appearance-none focus:outline-none focus:ring-1 transition-all cursor-pointer ${errors.leave_type ? 'border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700 focus:border-orange-500 focus:ring-orange-500'}`}
                  >
                    <option value="" disabled>Select leave type...</option>
                    {leaveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    ▼
                  </div>
                </div>
                {errors.leave_type && <p className="text-xs text-red-400 mt-1">{errors.leave_type}</p>}
              </div>

              {/* DATE SELECTION (START & END) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* START DATE */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    Start Date <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    min={today}
                    onChange={handleChange}
                    className={`w-full bg-slate-950/80 border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 transition-all [color-scheme:dark] ${errors.start_date ? 'border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700 focus:border-orange-500 focus:ring-orange-500'}`}
                  />
                  {errors.start_date && <p className="text-xs text-red-400 mt-1">{errors.start_date}</p>}
                </div>

                {/* END DATE */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    End Date <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    min={formData.start_date || today}
                    onChange={handleChange}
                    className={`w-full bg-slate-950/80 border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 transition-all [color-scheme:dark] ${errors.end_date ? 'border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700 focus:border-orange-500 focus:ring-orange-500'}`}
                  />
                  {errors.end_date && <p className="text-xs text-red-400 mt-1">{errors.end_date}</p>}
                </div>
              </div>

              {isFamily && (
                <fieldset className="space-y-4 rounded-xl border border-slate-800 p-4">
                  <legend className="px-1 text-xs font-bold text-slate-300 uppercase tracking-wider">Family leave</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1 block"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Type of leave *</span>
                      <select name="parental_type" value={formData.parental_type} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]">
                        <option value="">Choose…</option><option value="maternity">Maternity</option><option value="paternity_partner">Paternity / partner</option>
                        <option value="adoption">Adoption</option><option value="shared_parental">Shared / parental</option>
                      </select>
                      {errors.parental_type && <p className="text-xs text-red-400">{errors.parental_type}</p>}</label>
                    <label className="space-y-1 block"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Expected week of birth or placement *</span>
                      <input type="date" name="expected_date" value={formData.expected_date} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]" />
                      {errors.expected_date && <p className="text-xs text-red-400">{errors.expected_date}</p>}</label>
                    <label className="space-y-1 block"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pay option (where offered)</span>
                      <input name="pay_option" value={formData.pay_option} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]" /></label>
                    <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="kit_days_interest" checked={formData.kit_days_interest} onChange={handleChange} className="accent-orange-500" />
                      I am interested in keep-in-touch days</label>
                  </div>
                  <p className="text-xs text-slate-400">We may ask for the evidence the law allows, such as a certificate of expected birth. Please do not share more medical information than we ask for. HR will confirm your dates and pay.</p>
                </fieldset>
              )}
              {isBereavement && (
                <fieldset className="space-y-4 rounded-xl border border-slate-800 p-4">
                  <legend className="px-1 text-xs font-bold text-slate-300 uppercase tracking-wider">Bereavement leave</legend>
                  <p className="text-sm text-slate-300">We are very sorry for your loss. You do not have to tell us anything you do not want to share.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1 block"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Relationship (optional)</span>
                      <select name="relationship" value={formData.relationship} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]">
                        <option value="">Not given</option>{["partner", "child", "parent", "sibling", "grandparent", "other family member", "other", "prefer not to say"].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select></label>
                    <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="travel_needed" checked={formData.travel_needed} onChange={handleChange} className="accent-orange-500" />
                      I need to travel</label>
                    <label className="space-y-1 block sm:col-span-2"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Message to your manager (optional)</span>
                      <textarea name="message" rows={2} value={formData.message} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]" /></label>
                  </div>
                </fieldset>
              )}

              {/* HANDOVER (seen by your manager and HR only) */}
              <label className="space-y-1 block"><span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Cover and handover (optional, seen by your manager and HR)</span>
                <textarea name="handover_note" rows={2} value={formData.handover_note} onChange={handleChange} className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:border-orange-500 focus:ring-orange-500 [color-scheme:dark]" /></label>

              {/* REASON TEXTAREA */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 text-orange-500" />
                  Reason for Leave {isSick || isBereavement ? <span className="normal-case font-normal text-slate-400">(optional, you do not need to give a diagnosis)</span> : null}
                </label>
                <textarea
                  name="reason"
                  rows={4}
                  value={formData.reason}
                  onChange={handleChange}
                  placeholder="Describe the reason for your leave application..."
                  className={`w-full bg-slate-950/80 border text-white placeholder-slate-500 rounded-xl p-4 text-sm focus:outline-none focus:ring-1 transition-all resize-none ${errors.reason ? 'border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700 focus:border-orange-500 focus:ring-orange-500'}`}
                />
                {errors.reason && <p className="text-xs text-red-400 mt-1">{errors.reason}</p>}
              </div>

              {/* SUBMIT ACTION BUTTON */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base py-4 px-6 rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-200 active:scale-[0.99] mt-4"
              >
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</> : <><Send className="w-5 h-5" /> Submit Leave Request</>}
              </button>

            </form>
          </div>

          {/* SIDEBAR SUMMARY & POLICIES (RIGHT 1 COL) */}
          <div className="space-y-6">

            {/* SUMMARY CARD */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800 pb-3">
                <Info className="w-4 h-4 text-orange-500" />
                Application Summary
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Selected Type</span>
                  <span className="font-semibold text-white capitalize">
                    {formData.leave_type || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Duration</span>
                  <span className="font-semibold text-orange-400">
                    {calculateDays() ? `${calculateDays()} Day${calculateDays() > 1 ? 's' : ''}` : '0 Days'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Approver</span>
                  <span className="font-semibold text-white">Direct Manager</span>
                </div>
              </div>
            </div>

            {/* POLICY HELPER CARD */}
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-950 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400">
                <Clock className="w-4 h-4" />
                Submission Guidelines
              </div>

              <ul className="space-y-3 text-xs text-slate-400 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  Apply at least 2 days in advance for planned casual leave.
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  Medical certificates are required for sick leave exceeding 2 consecutive days.
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
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
