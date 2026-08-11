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
  ];

  const [formData, setFormData] = useState({
    leave_type: '',
    start_date: '',
    end_date: '',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

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
    if (!formData.end_date) e.end_date = "Select end date";
    if (formData.start_date && formData.end_date && new Date(formData.end_date) < new Date(formData.start_date)) {
      e.end_date = "End date must be after start date";
    }
    if (!formData.reason.trim() || formData.reason.length < 10) e.reason = "Provide at least 10 characters";
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
      await createLeaveRequest(formData);
      setSuccess("Leave application submitted successfully! It is under process.");
      setFormData({ leave_type: '', start_date: '', end_date: '', reason: '' });
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
          <div className="flex items-center gap-3 bg-green-950/40 border border-green-800 rounded-xl px-4 py-3 text-green-300 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
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
                    onChange={handleChange}
                    className={`w-full bg-slate-950/80 border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 transition-all [color-scheme:dark] ${errors.end_date ? 'border-red-600 focus:border-red-500 focus:ring-red-500' : 'border-slate-800 hover:border-slate-700 focus:border-orange-500 focus:ring-orange-500'}`}
                  />
                  {errors.end_date && <p className="text-xs text-red-400 mt-1">{errors.end_date}</p>}
                </div>
              </div>

              {/* REASON TEXTAREA */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 text-orange-500" />
                  Reason for Leave
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
