import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Building, CreditCard, Hash, FileText, ChevronDown, Edit3, Save, X, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";

const PAYMENT_METHODS = ["Bank Transfer", "Check", "Digital Wallet"];

const Field = ({ label, icon: Icon, children }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest mb-1.5">
      <Icon size={12} />
      {label}
    </label>
    {children}
  </div>
);

const defaultBankData = {
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  ifscCode: "",
  panCard: "",
  paymentMethod: "Bank Transfer",
};

export default function BankDetails() {
  const [data, setData] = useState(defaultBankData);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(defaultBankData);
  const [showAccount, setShowAccount] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);
    getMyProfile()
      .then((res) => {
        if (!mounted.current) return;
        const p = res.data || res;
        const bank = p.bankDetails || {
          bankName: p.bankName || "",
          accountHolder: p.accountHolder || p.fullName || "",
          accountNumber: p.accountNumber || "",
          ifscCode: p.ifscCode || "",
          panCard: p.panCard || "",
          paymentMethod: p.paymentMethod || "Bank Transfer",
        };
        setData(bank);
        setDraft(bank);
      })
      .catch((err) => {
        if (mounted.current) setError(err?.message || "Failed to load bank details");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, []);

  const maskedAccount = data.accountNumber
    ? "•••• •••• " + data.accountNumber.slice(-4)
    : "•••• •••• ••••";

  const validate = () => {
    const e = {};
    if (!draft.bankName.trim()) e.bankName = "Required";
    if (!draft.accountHolder.trim()) e.accountHolder = "Required";
    if (!/^\d{9,18}$/.test(draft.accountNumber)) e.accountNumber = "Must be 9–18 digits";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(draft.ifscCode)) e.ifscCode = "Invalid IFSC format";
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.panCard)) e.panCard = "Invalid PAN format";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    setErrors({});
    setSuccess(false);
    updateMyProfile({ bankDetails: draft })
      .then(() => {
        if (!mounted.current) return;
        setData(draft);
        setEditMode(false);
        setSuccess(true);
        setTimeout(() => { if (mounted.current) setSuccess(false); }, 3000);
      })
      .catch((err) => {
        if (mounted.current) setErrors({ _api: err?.message || "Failed to save bank details" });
      })
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  const handleCancel = () => {
    setDraft(data);
    setErrors({});
    setEditMode(false);
  };

  const inputClass = (field) =>
    `w-full bg-slate-50 dark:bg-[#0f172a] border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-[#e2e8f0] outline-none transition
    focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-300 ${
      errors[field] ? "border-red-300 bg-red-50 dark:bg-red-900/30" : "border-slate-200 dark:border-[#334155] focus:border-indigo-400"
    } ${!editMode ? "opacity-60 cursor-not-allowed" : ""}`;

  if (loading) {
    return (
      <EmployeePageShell title="Bank Details" subtitle="Profile">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading bank details...</span>
        </div>
      </EmployeePageShell>
    );
  }

  if (error && !data.bankName) {
    return (
      <EmployeePageShell title="Bank Details" subtitle="Profile">
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
          <AlertCircle size={16} /> {error}
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Bank Details" subtitle="Profile">
      <div className="max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest font-semibold">Profile</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-[#f1f5f9] mt-1">Bank Details</h1>
          </div>
          {saving ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-500/20 px-4 py-2 rounded-xl">
              <Loader2 size={14} className="animate-spin" /> Saving...
            </div>
          ) : !editMode ? (
            <button
              onClick={() => { setDraft(data); setEditMode(true); }}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 px-4 py-2 rounded-xl transition"
            >
              <Edit3 size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-[#94a3b8] bg-slate-100 dark:bg-[#0f172a] hover:bg-slate-200 dark:hover:bg-[#0f172a]/80 px-4 py-2 rounded-xl transition">
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl transition">
                <Save size={14} /> Save
              </button>
            </div>
          )}
        </div>

        {success && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <CheckCircle size={16} /> Bank details saved successfully!
          </div>
        )}

        {errors._api && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
            <AlertCircle size={16} /> {errors._api}
          </div>
        )}

        {/* Card visual */}
        <div className="mb-6 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-xs opacity-60 uppercase tracking-widest font-semibold">Bank Name</p>
              <p className="text-lg font-bold mt-0.5">{data.bankName || "—"}</p>
            </div>
            <CreditCard size={32} className="opacity-40" />
          </div>
          <div className="mb-4">
            <p className="text-xl tracking-[0.2em] font-mono font-semibold">
              {showAccount && data.accountNumber
                ? data.accountNumber.match(/.{1,4}/g)?.join(" ")
                : maskedAccount}
            </p>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs opacity-60 uppercase tracking-widest">Account Holder</p>
              <p className="font-semibold mt-0.5">{data.accountHolder || "—"}</p>
            </div>
            <button
              onClick={() => setShowAccount((v) => !v)}
              className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition font-medium"
            >
              {showAccount ? <EyeOff size={13} /> : <Eye size={13} />}
              {showAccount ? "Hide" : "Reveal"}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-100 dark:border-[#334155] p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Bank Name" icon={Building}>
              <input
                className={inputClass("bankName")}
                value={editMode ? draft.bankName : data.bankName}
                disabled={!editMode}
                onChange={(e) => setDraft((p) => ({ ...p, bankName: e.target.value }))}
              />
              {errors.bankName && <p className="text-xs text-red-500 mt-1">{errors.bankName}</p>}
            </Field>

            <Field label="Account Holder Name" icon={FileText}>
              <input
                className={inputClass("accountHolder")}
                value={editMode ? draft.accountHolder : data.accountHolder}
                disabled={!editMode}
                onChange={(e) => setDraft((p) => ({ ...p, accountHolder: e.target.value }))}
              />
              {errors.accountHolder && <p className="text-xs text-red-500 mt-1">{errors.accountHolder}</p>}
            </Field>

            <Field label="Account Number" icon={CreditCard}>
              <div className="relative">
                <input
                  className={inputClass("accountNumber") + " pr-10"}
                  value={editMode ? draft.accountNumber : (showAccount ? data.accountNumber : maskedAccount)}
                  disabled={!editMode}
                  onChange={(e) => setDraft((p) => ({ ...p, accountNumber: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowAccount((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#94a3b8] hover:text-slate-600 dark:hover:text-[#cbd5e1]"
                >
                  {showAccount ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.accountNumber && <p className="text-xs text-red-500 mt-1">{errors.accountNumber}</p>}
            </Field>

            <Field label="IFSC / Routing Code" icon={Hash}>
              <input
                className={inputClass("ifscCode")}
                value={editMode ? draft.ifscCode : data.ifscCode}
                disabled={!editMode}
                onChange={(e) => setDraft((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))}
              />
              {errors.ifscCode && <p className="text-xs text-red-500 mt-1">{errors.ifscCode}</p>}
            </Field>

            <Field label="PAN Card / Tax ID" icon={FileText}>
              <input
                className={inputClass("panCard")}
                value={editMode ? draft.panCard : data.panCard}
                disabled={!editMode}
                onChange={(e) => setDraft((p) => ({ ...p, panCard: e.target.value.toUpperCase() }))}
              />
              {errors.panCard && <p className="text-xs text-red-500 mt-1">{errors.panCard}</p>}
            </Field>

            <Field label="Payment Method" icon={ChevronDown}>
              <div className="relative">
                <select
                  className={inputClass("paymentMethod") + " appearance-none pr-8"}
                  value={editMode ? draft.paymentMethod : data.paymentMethod}
                  disabled={!editMode}
                  onChange={(e) => setDraft((p) => ({ ...p, paymentMethod: e.target.value }))}
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </Field>
          </div>

          {!editMode && (
            <p className="text-xs text-slate-400 dark:text-[#94a3b8] text-center pt-2">
              Your banking details are encrypted and stored securely.
            </p>
          )}
        </div>
      </div>
    </EmployeePageShell>
  );
}
