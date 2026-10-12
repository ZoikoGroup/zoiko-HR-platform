import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Building, CreditCard, Hash, FileText, Edit3, Save, X, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { getMyProfile, getEmployeeProfile, updateEmployeeProfile } from "../../../../service/employee";
import { FORMATS, cleanedValue, serverProfileErrors } from "../../../../utils/profileForm";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";

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
  const [empId, setEmpId] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);
    getMyProfile()
      .then(async (res) => {
        if (!mounted.current) return;
        const p = res.data || res;
        setEmpId(p.id);
        let ext = {};
        try { const r = await getEmployeeProfile(p.id); ext = r.data || r || {}; } catch { ext = {}; }
        const bank = {
          bankName: ext.bank_name || "",
          accountHolder: p.fullName || p.full_name || `${p.firstName || p.first_name || ""} ${p.lastName || p.last_name || ""}`.trim(),
          accountNumber: ext.bank_account || "",
          ifscCode: ext.bank_ifsc || "",
          panCard: ext.pan_number || "",
        };
        if (!mounted.current) return;
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

  const hasAccount = !!data.accountNumber;
  const maskedAccount = hasAccount ? "•••• •••• " + data.accountNumber.slice(-4) : "Not added yet";
  const spacedAccount = hasAccount ? (data.accountNumber.match(/.{1,4}/g) || []).join(" ") : "Not added yet";

  const validate = () => {
    const e = {};
    if (!draft.bankName.trim()) e.bankName = "Bank name is required.";
    else if (FORMATS.bank_name(draft.bankName)) e.bankName = FORMATS.bank_name(draft.bankName);
    if (!draft.accountNumber.trim()) e.accountNumber = "Account number is required.";
    else if (FORMATS.bank_account(draft.accountNumber)) e.accountNumber = FORMATS.bank_account(draft.accountNumber);
    if (!draft.ifscCode.trim()) e.ifscCode = "IFSC code is required.";
    else if (FORMATS.bank_ifsc(draft.ifscCode)) e.ifscCode = FORMATS.bank_ifsc(draft.ifscCode);
    if (!draft.panCard.trim()) e.panCard = "PAN is required.";
    else if (FORMATS.pan_number(draft.panCard)) e.panCard = FORMATS.pan_number(draft.panCard);
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    if (!empId) { setErrors({ _api: "Your profile could not be found. Reload the page and try again." }); return; }
    setSaving(true);
    setErrors({});
    setSuccess(false);
    const saved = {
      ...draft,
      bankName: cleanedValue("bank_name", draft.bankName),
      accountNumber: cleanedValue("bank_account", draft.accountNumber),
      ifscCode: cleanedValue("bank_ifsc", draft.ifscCode),
      panCard: cleanedValue("pan_number", draft.panCard),
    };
    updateEmployeeProfile(empId, { bank_name: saved.bankName, bank_account: saved.accountNumber, bank_ifsc: saved.ifscCode, pan_number: saved.panCard })
      .then(() => {
        if (!mounted.current) return;
        setData(saved);
        setDraft(saved);
        setEditMode(false);
        setSuccess(true);
        setTimeout(() => { if (mounted.current) setSuccess(false); }, 3000);
      })
      .catch((err) => {
        if (!mounted.current) return;
        const fields = serverProfileErrors(err?.validation);
        const map = { bank_name: "bankName", bank_account: "accountNumber", bank_ifsc: "ifscCode", pan_number: "panCard" };
        const mapped = Object.fromEntries(Object.entries(fields).map(([k, msg]) => [map[k] || "_api", msg]));
        setErrors(Object.keys(mapped).length ? mapped : { _api: err?.message || "The bank details could not be saved." });
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
    focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-blue-300 ${
      errors[field] ? "border-red-300 bg-red-50 dark:bg-red-900/30" : "border-slate-200 dark:border-[#334155] focus:border-blue-400"
    } ${!editMode ? "opacity-60 cursor-not-allowed" : ""}`;

  if (loading) {
    return (
      <EmployeePageShell title="Bank Details" subtitle="Profile">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
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
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/20 px-4 py-2 rounded-xl">
              <Loader2 size={14} className="animate-spin" /> Saving...
            </div>
          ) : !editMode ? (
            <button
              onClick={() => { setDraft(data); setEditMode(true); }}
              className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/30 px-4 py-2 rounded-xl transition"
            >
              <Edit3 size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-[#94a3b8] bg-slate-100 dark:bg-[#0f172a] hover:bg-slate-200 dark:hover:bg-[#0f172a]/80 px-4 py-2 rounded-xl transition">
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition">
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
        <div className="mb-6 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-xs opacity-60 uppercase tracking-widest font-semibold">Bank Name</p>
              <p className="text-lg font-bold mt-0.5">{data.bankName || "—"}</p>
            </div>
            <CreditCard size={32} className="opacity-40" />
          </div>
          <div className="mb-4">
            <p data-testid="card-account" className="text-xl tracking-[0.2em] font-mono font-semibold">
              {showAccount ? spacedAccount : maskedAccount}
            </p>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs opacity-60 uppercase tracking-widest">Account Holder</p>
              <p className="font-semibold mt-0.5">{data.accountHolder || "—"}</p>
            </div>
            <button
              type="button"
              aria-pressed={showAccount}
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
                maxLength={100} onChange={(e) => { setDraft((p) => ({ ...p, bankName: e.target.value })); setErrors((x) => ({ ...x, bankName: undefined })); }}
              />
              {errors.bankName && <p className="text-xs text-red-500 mt-1">{errors.bankName}</p>}
            </Field>

            <Field label="Account Holder Name" icon={FileText}>
              <input className={inputClass("accountHolder")} value={data.accountHolder} disabled readOnly />
              <p className="text-[11px] text-slate-400 mt-1">The account must be in your own name as it appears on your profile.</p>
            </Field>

            <Field label="Account Number" icon={CreditCard}>
              <div className="relative">
                <input
                  className={inputClass("accountNumber") + " pr-10"}
                  type={editMode && !showAccount ? "password" : "text"}
                  autoComplete="off"
                  value={editMode ? draft.accountNumber : (showAccount ? data.accountNumber : maskedAccount)}
                  disabled={!editMode}
                  maxLength={22} inputMode="numeric" onChange={(e) => { setDraft((p) => ({ ...p, accountNumber: e.target.value })); setErrors((x) => ({ ...x, accountNumber: undefined })); }}
                />
                <button
                  type="button"
                  aria-label={showAccount ? "Hide account number" : "Show account number"}
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
                maxLength={11} onChange={(e) => { setDraft((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() })); setErrors((x) => ({ ...x, ifscCode: undefined })); }}
              />
              {errors.ifscCode && <p className="text-xs text-red-500 mt-1">{errors.ifscCode}</p>}
            </Field>

            <Field label="PAN Card / Tax ID" icon={FileText}>
              <input
                className={inputClass("panCard")}
                value={editMode ? draft.panCard : data.panCard}
                disabled={!editMode}
                maxLength={10} onChange={(e) => { setDraft((p) => ({ ...p, panCard: e.target.value.toUpperCase() })); setErrors((x) => ({ ...x, panCard: undefined })); }}
              />
              {errors.panCard && <p className="text-xs text-red-500 mt-1">{errors.panCard}</p>}
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
