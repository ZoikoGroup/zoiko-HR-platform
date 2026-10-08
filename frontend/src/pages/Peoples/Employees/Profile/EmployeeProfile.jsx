import { useState, useEffect, useRef } from "react";
import {
  User, Briefcase, MapPin, Calendar, Mail, Phone, Building2,
  Clock, Users, Shield, Loader2, AlertCircle, Pencil, X, Check,
  CreditCard, FileText, Globe, Save
} from "lucide-react";
import { getMyProfile, getEmployeeProfile, updateMyProfile, updateEmployeeProfile } from "../../../../service/employee";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { validateProfile, changedFields, serverProfileErrors, FIELD_TAB, UPPERCASE_FIELDS } from "../../../../utils/profileForm";

const TABS = ["Personal Details", "Work Details", "Banking & Documents"];

function v(obj, ...keys) {
  for (const k of keys) {
    const val = obj?.[k];
    if (val !== undefined && val !== null) return val;
  }
  return null;
}

function formatDate(d) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function toDateInput(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().split("T")[0];
}

function fmtEmpType(t) {
  if (!t) return "N/A";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-[#334155] last:border-0">
    <div className="mt-0.5 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/20">
      <Icon size={15} className="text-blue-500" />
    </div>
    <div>
      <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 dark:text-[#f1f5f9] font-medium mt-0.5">{value ?? "N/A"}</p>
    </div>
  </div>
);

const ROW_ERROR_CLASS = "border-red-400 focus:ring-red-200 focus:border-red-400";
const ROW_OK_CLASS = "border-slate-200 dark:border-[#334155] focus:ring-blue-300 focus:border-blue-400";

const InputRow = ({ icon: Icon, label, name, value, onChange, type = "text", placeholder = "N/A", error, maxLength, inputMode, autoCapitalize }) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-[#334155] last:border-0">
    <div className="mt-0.5 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/20">
      <Icon size={15} className="text-blue-500" />
    </div>
    <div className="flex-1">
      <label htmlFor={name ? `pf-${name}` : undefined} className="block text-xs text-slate-400 dark:text-[#94a3b8] font-medium uppercase tracking-wide mb-1">{label}</label>
      <input
        id={name ? `pf-${name}` : undefined}
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        aria-invalid={!!error}
        className={`w-full text-sm text-slate-800 dark:text-[#e2e8f0] font-medium bg-white dark:bg-[#0f172a] border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${error ? ROW_ERROR_CLASS : ROW_OK_CLASS}`}
      />
      {error ? <p role="alert" className="text-red-500 text-xs mt-1">{error}</p> : null}
    </div>
  </div>
);

const SelectRow = ({ icon: Icon, label, name, value, onChange, options, error }) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-[#334155] last:border-0">
    <div className="mt-0.5 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/20">
      <Icon size={15} className="text-blue-500" />
    </div>
    <div className="flex-1">
      <label htmlFor={`pf-${name}`} className="block text-xs text-slate-400 dark:text-[#94a3b8] font-medium uppercase tracking-wide mb-1">{label}</label>
      <select
        id={`pf-${name}`}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        aria-invalid={!!error}
        className={`w-full text-sm text-slate-800 dark:text-[#e2e8f0] font-medium bg-white dark:bg-[#0f172a] border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${error ? ROW_ERROR_CLASS : ROW_OK_CLASS}`}
      >
        <option value="">N/A</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error ? <p role="alert" className="text-red-500 text-xs mt-1">{error}</p> : null}
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, children }) => (
  <h3 className="text-sm font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-widest mb-4 flex items-center gap-2">
    {Icon && <Icon size={14} />}
    {children}
  </h3>
);

export default function EmployeeProfile() {
  const [activeTab, setActiveTab] = useState(0);
  const [profile, setProfile] = useState(null);
  const [extended, setExtended] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [formData, setFormData] = useState({});
  const [original, setOriginal] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    getMyProfile()
      .then((res) => {
        if (!mounted.current) return;
        const emp = res.data || res;
        setProfile(emp);
        const empId = v(emp, "id");
        if (empId) {
          getEmployeeProfile(empId)
            .then((profRes) => {
              if (mounted.current) setExtended(profRes.data || profRes);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (mounted.current) setError(err?.message || "Failed to load profile");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  function startEdit() {
    const p = profile || {};
    const x = extended || {};
    const snapshot = {
      first_name: v(p, "firstName", "first_name") || "",
      last_name: v(p, "lastName", "last_name") || "",
      phone: v(p, "phoneNumber", "phone") || "",
      personal_email: v(p, "personalEmail", "personal_email") || "",
      date_of_birth: toDateInput(v(p, "dateOfBirth", "date_of_birth")),
      gender: v(p, "gender") || "",
      current_address: v(p, "currentAddress", "current_address") || "",
      permanent_address: v(p, "permanentAddress", "permanent_address") || "",
      city: v(p, "city") || "",
      state: v(p, "state") || "",
      country: v(p, "country") || "",
      pincode: v(p, "pincode") || "",
      company: v(p, "company") || "",
      business_unit: v(p, "businessUnit", "business_unit") || "",
      team: v(p, "team") || "",
      emergency_contact_name: v(x, "emergency_contact_name", "emergencyContactName") || "",
      emergency_contact_phone: v(x, "emergency_contact_phone", "emergencyContactPhone") || "",
      emergency_contact_relation: v(x, "emergency_contact_relation", "emergencyContactRelation") || "",
      blood_group: v(x, "blood_group", "bloodGroup") || "",
      marital_status: v(x, "marital_status", "maritalStatus") || "",
      nationality: v(x, "nationality") || "",
      pan_number: v(x, "pan_number", "panNumber") || "",
      aadhar_number: v(x, "aadhar_number", "aadharNumber") || "",
      bank_name: v(x, "bank_name", "bankName") || "",
      bank_account: v(x, "bank_account", "bankAccount") || "",
      bank_ifsc: v(x, "bank_ifsc", "bankIfsc") || "",
      uan_number: v(x, "uan_number", "uanNumber") || "",
      pf_number: v(x, "pf_number", "pfNumber") || "",
      esic_number: v(x, "esic_number", "esicNumber") || "",
      passport_number: v(x, "passport_number", "passportNumber") || "",
      passport_expiry: toDateInput(v(x, "passport_expiry", "passportExpiry")),
      visa_number: v(x, "visa_number", "visaNumber") || "",
      visa_expiry: toDateInput(v(x, "visa_expiry", "visaExpiry")),
      work_permit_expiry: toDateInput(v(x, "work_permit_expiry", "workPermitExpiry")),
      skills: v(x, "skills") || "",
      certifications: v(x, "certifications") || "",
      projects: v(x, "projects") || "",
      achievements: v(x, "achievements") || "",
    };
    setFormData(snapshot);
    setOriginal(snapshot);
    setFieldErrors({});
    setEditing(true);
    setSaveMsg(null);
  }

  function cancelEdit() {
    setEditing(false);
    setFormData({});
    setFieldErrors({});
    setSaveMsg(null);
  }

  function handleChange(e) {
    const { name } = e.target;
    const value = UPPERCASE_FIELDS.has(name) ? e.target.value.toUpperCase() : e.target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  const BASIC_KEYS = ["first_name", "last_name", "phone", "personal_email", "date_of_birth", "gender", "current_address", "permanent_address", "city", "state", "country", "pincode", "company", "business_unit", "team"];
  const PROFILE_KEYS = ["emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation", "blood_group", "marital_status", "nationality", "pan_number", "aadhar_number", "bank_name", "bank_account", "bank_ifsc", "uan_number", "pf_number", "esic_number", "passport_number", "passport_expiry", "visa_number", "visa_expiry", "work_permit_expiry", "skills", "certifications", "projects", "achievements"];

  function showProblems(errors) {
    setFieldErrors(errors);
    // take the person to the first tab (left to right) that has a mistake on it
    const tabs = Object.keys(errors).filter((k) => errors[k] && FIELD_TAB[k] !== undefined).map((k) => FIELD_TAB[k]);
    if (tabs.length) setActiveTab(Math.min(...tabs));
    const count = Object.keys(errors).filter((k) => errors[k]).length;
    setSaveMsg(`${count} field${count === 1 ? " needs" : "s need"} attention. Fix the highlighted ${count === 1 ? "field" : "fields"} and save again.`);
    setTimeout(() => { const el = document.querySelector("[aria-invalid=true]"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" }); }, 50);
  }

  async function handleSave() {
    const problems = validateProfile(formData);
    if (Object.keys(problems).length > 0) { showProblems(problems); return; }
    setFieldErrors({});
    setSaving(true);
    setSaveMsg(null);
    const empId = v(profile, "id");
    try {
      const basic = changedFields(BASIC_KEYS, formData, original);
      if (basic.gender === null) delete basic.gender;                       // the gender box cannot be emptied
      if (Object.keys(basic).length > 0) await updateMyProfile(basic);

      if (empId) {
        const details = changedFields(PROFILE_KEYS, formData, original);
        if (Object.keys(details).length > 0) await updateEmployeeProfile(empId, details);
      }

      const fresh = await getMyProfile();
      if (mounted.current) setProfile(fresh.data || fresh);
      if (empId) {
        getEmployeeProfile(empId)
          .then((profRes) => {
            if (mounted.current) setExtended(profRes.data || profRes);
          })
          .catch(() => {});
      }
      setEditing(false);
      setSaveMsg("Profile updated successfully");
      setTimeout(() => { if (mounted.current) setSaveMsg(null); }, 3000);
    } catch (err) {
      const fields = serverProfileErrors(err?.validation);
      if (Object.keys(fields).length) { showProblems(fields); }
      else {
        setSaveMsg(err?.message || "Failed to save changes");
        setTimeout(() => { if (mounted.current) setSaveMsg(null); }, 6000);
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <EmployeePageShell title="Employee Profile" subtitle="Employees">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading profile...</span>
        </div>
      </EmployeePageShell>
    );
  }

  if (error) {
    return (
      <EmployeePageShell title="Employee Profile" subtitle="Employees">
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
          <AlertCircle size={16} /> {error}
        </div>
      </EmployeePageShell>
    );
  }

  const p = profile || {};
  const x = extended || {};
  const fn = v(p, "firstName", "first_name");
  const ln = v(p, "lastName", "last_name");
  const initials = (fn || "?").charAt(0).toUpperCase() + (ln || "").charAt(0).toUpperCase() || "?";

  return (
    <EmployeePageShell title="Employee Profile" subtitle="Employees">
      {saveMsg && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
          saveMsg.includes("updated") ? "bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
        }`}>
          {saveMsg.includes("updated") ? <Check size={16} /> : <AlertCircle size={16} />}
          {saveMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-100 dark:border-[#334155] p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center shadow-lg mb-4">
              <span className="text-3xl font-bold text-white">{initials}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-[#f1f5f9]">{fn} {ln}</h2>
            <p className="text-sm text-blue-600 font-medium mt-0.5">{v(p, "designationName", "title", "jobTitle", "job_title")}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-[#0f172a] text-slate-600 dark:text-[#94a3b8] px-3 py-1 rounded-full font-medium">
              <Building2 size={12} /> {v(p, "departmentName") || v(p, "department", "name") || "N/A"}
            </span>
            <div className="w-full mt-5 pt-5 border-t border-slate-100 dark:border-[#334155] space-y-3 text-left">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 dark:text-[#94a3b8] font-medium">Employee ID</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-[#f1f5f9] bg-slate-100 dark:bg-[#0f172a] px-2 py-0.5 rounded">{v(p, "employeeId", "employee_id", "employeeCode", "employee_code")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 dark:text-[#94a3b8] font-medium">Joined</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-[#f1f5f9]">{formatDate(v(p, "dateOfJoining", "date_of_joining"))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 dark:text-[#94a3b8] font-medium">Status</span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded">{v(p, "status") === "active" ? "Active" : (v(p, "status") || "N/A")}</span>
              </div>
            </div>
          </div>

          {v(x, "emergency_contact_name", "emergencyContactName") && !editing && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-red-500" />
                <span className="text-xs font-bold text-red-600 dark:text-red-300 uppercase tracking-wide">Emergency Contact</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">{v(x, "emergency_contact_name", "emergencyContactName")}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a3b8] mt-0.5">{v(x, "emergency_contact_relation", "emergencyContactRelation")}</p>
              <p className="text-xs text-slate-600 dark:text-[#94a3b8] font-medium mt-1">{v(x, "emergency_contact_phone", "emergencyContactPhone")}</p>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-100 dark:border-[#334155] overflow-hidden">
          <div className="flex border-b border-slate-100 dark:border-[#334155] items-stretch">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`flex-1 py-4 text-sm font-semibold transition-colors relative ${
                  activeTab === i ? "text-blue-600" : "text-slate-400 dark:text-[#94a3b8] hover:text-slate-600 dark:hover:text-[#cbd5e1]"
                }`}
              >
                {tab}
                {activeTab === i && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
                )}
              </button>
            ))}
            <div className="ml-auto flex items-center px-4">
              {!editing ? (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/30 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
              ) : (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  Editing Mode
                </span>
              )}
            </div>
          </div>

          <div className="p-6 pb-20">
            {/* Tab 0: Personal Details */}
            {activeTab === 0 && (
              <div>
                <SectionTitle icon={User}>Personal Information</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  {editing ? (
                    <>
                      <div>
                        <InputRow icon={User} label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} error={fieldErrors.first_name} maxLength={100} />
                        <InputRow icon={User} label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} error={fieldErrors.last_name} maxLength={100} />
                        <InputRow icon={Mail} label="Email" name="email" value={v(p, "email")} onChange={() => {}} />
                        <InputRow icon={Mail} label="Personal Email" name="personal_email" value={formData.personal_email} onChange={handleChange} error={fieldErrors.personal_email} maxLength={255} inputMode="email" />
                        <InputRow icon={Phone} label="Phone" name="phone" value={formData.phone} onChange={handleChange} error={fieldErrors.phone} maxLength={20} inputMode="tel" placeholder="+91 9876543210" />
                      </div>
                      <div>
                        <InputRow icon={Calendar} label="Date of Birth" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} error={fieldErrors.date_of_birth} type="date" />
                        <SelectRow icon={User} label="Gender" name="gender" value={formData.gender} onChange={handleChange} error={fieldErrors.gender} options={["male", "female", "other"]} />
                        <InputRow icon={Globe} label="Nationality" name="nationality" value={formData.nationality} onChange={handleChange} error={fieldErrors.nationality} maxLength={50} />
                        <SelectRow icon={User} label="Blood Group" name="blood_group" value={formData.blood_group} onChange={handleChange} error={fieldErrors.blood_group} options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]} />
                        <SelectRow icon={User} label="Marital Status" name="marital_status" value={formData.marital_status} onChange={handleChange} error={fieldErrors.marital_status} options={["single", "married", "divorced", "widowed"]} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <InfoRow icon={User} label="First Name" value={fn} />
                        <InfoRow icon={User} label="Last Name" value={ln} />
                        <InfoRow icon={Mail} label="Email" value={v(p, "email")} />
                        <InfoRow icon={Mail} label="Personal Email" value={v(p, "personalEmail", "personal_email")} />
                        <InfoRow icon={Phone} label="Phone" value={v(p, "phoneNumber", "phone")} />
                      </div>
                      <div>
                        <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(v(p, "dateOfBirth", "date_of_birth"))} />
                        <InfoRow icon={User} label="Gender" value={v(p, "gender")} />
                        <InfoRow icon={Globe} label="Nationality" value={v(x, "nationality")} />
                        <InfoRow icon={User} label="Blood Group" value={v(x, "blood_group", "bloodGroup")} />
                        <InfoRow icon={User} label="Marital Status" value={v(x, "marital_status", "maritalStatus")} />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8">
                  <SectionTitle icon={Shield}>Emergency Contact</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {editing ? (
                      <>
                        <div>
                          <InputRow icon={User} label="Contact Name" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} error={fieldErrors.emergency_contact_name} maxLength={100} />
                          <InputRow icon={User} label="Relation" name="emergency_contact_relation" value={formData.emergency_contact_relation} onChange={handleChange} error={fieldErrors.emergency_contact_relation} maxLength={50} />
                        </div>
                        <div>
                          <InputRow icon={Phone} label="Phone" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleChange} error={fieldErrors.emergency_contact_phone} maxLength={20} inputMode="tel" placeholder="+91 9876543210" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <InfoRow icon={User} label="Contact Name" value={v(x, "emergency_contact_name", "emergencyContactName")} />
                          <InfoRow icon={User} label="Relation" value={v(x, "emergency_contact_relation", "emergencyContactRelation")} />
                        </div>
                        <div>
                          <InfoRow icon={Phone} label="Phone" value={v(x, "emergency_contact_phone", "emergencyContactPhone")} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <SectionTitle icon={MapPin}>Address Details</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {editing ? (
                      <>
                        <div>
                          <InputRow icon={MapPin} label="Current Address" name="current_address" value={formData.current_address} onChange={handleChange} error={fieldErrors.current_address} maxLength={500} />
                          <InputRow icon={MapPin} label="Permanent Address" name="permanent_address" value={formData.permanent_address} onChange={handleChange} error={fieldErrors.permanent_address} maxLength={500} />
                        </div>
                        <div>
                          <InputRow icon={MapPin} label="City" name="city" value={formData.city} onChange={handleChange} error={fieldErrors.city} maxLength={100} />
                          <InputRow icon={MapPin} label="State" name="state" value={formData.state} onChange={handleChange} error={fieldErrors.state} maxLength={100} />
                          <InputRow icon={MapPin} label="Country" name="country" value={formData.country} onChange={handleChange} error={fieldErrors.country} maxLength={100} />
                          <InputRow icon={MapPin} label="Pincode" name="pincode" value={formData.pincode} onChange={handleChange} error={fieldErrors.pincode} maxLength={10} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <InfoRow icon={MapPin} label="Current Address" value={v(p, "currentAddress", "current_address")} />
                          <InfoRow icon={MapPin} label="Permanent Address" value={v(p, "permanentAddress", "permanent_address")} />
                        </div>
                        <div>
                          <InfoRow icon={MapPin} label="City" value={v(p, "city")} />
                          <InfoRow icon={MapPin} label="State" value={v(p, "state")} />
                          <InfoRow icon={MapPin} label="Country" value={v(p, "country")} />
                          <InfoRow icon={MapPin} label="Pincode" value={v(p, "pincode")} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 1: Work Details */}
            {activeTab === 1 && (
              <div>
                <SectionTitle icon={Briefcase}>Employment Details</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  {editing ? (
                    <>
                      <div>
                        <InputRow icon={User} label="Employee ID" name="" value={v(p, "employeeId", "employee_id")} onChange={() => {}} />
                        <InputRow icon={User} label="Employee Code" name="" value={v(p, "employeeCode", "employee_code")} onChange={() => {}} />
                        <InputRow icon={Briefcase} label="Job Title" name="" value={v(p, "jobTitle", "job_title")} onChange={() => {}} />
                        <InfoRow icon={Building2} label="Department" value={v(p, "departmentName") || v(p, "department", "name")} />
                        <InfoRow icon={Users} label="Designation" value={v(p, "designationName", "title")} />
                        <InfoRow icon={Users} label="Reporting Manager" value={v(p, "managerName")} />
                      </div>
                      <div>
                        <InfoRow icon={Briefcase} label="Employment Type" value={fmtEmpType(v(p, "employmentType", "employment_type"))} />
                        <InfoRow icon={Calendar} label="Date of Joining" value={formatDate(v(p, "dateOfJoining", "date_of_joining"))} />
                        <InfoRow icon={Calendar} label="Confirmation Date" value={formatDate(v(p, "confirmationDate", "confirmation_date"))} />
                        <InputRow icon={Building2} label="Company" name="company" value={formData.company} onChange={handleChange} error={fieldErrors.company} maxLength={100} />
                        <InputRow icon={Building2} label="Business Unit" name="business_unit" value={formData.business_unit} onChange={handleChange} error={fieldErrors.business_unit} maxLength={100} />
                        <InputRow icon={Users} label="Team" name="team" value={formData.team} onChange={handleChange} error={fieldErrors.team} maxLength={100} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <InfoRow icon={User} label="Employee ID" value={v(p, "employeeId", "employee_id")} />
                        <InfoRow icon={User} label="Employee Code" value={v(p, "employeeCode", "employee_code")} />
                        <InfoRow icon={Briefcase} label="Job Title" value={v(p, "jobTitle", "job_title")} />
                        <InfoRow icon={Building2} label="Department" value={v(p, "departmentName") || v(p, "department", "name")} />
                        <InfoRow icon={Users} label="Designation" value={v(p, "designationName", "title")} />
                        <InfoRow icon={Users} label="Reporting Manager" value={v(p, "managerName")} />
                      </div>
                      <div>
                        <InfoRow icon={Briefcase} label="Employment Type" value={fmtEmpType(v(p, "employmentType", "employment_type"))} />
                        <InfoRow icon={Calendar} label="Date of Joining" value={formatDate(v(p, "dateOfJoining", "date_of_joining"))} />
                        <InfoRow icon={Calendar} label="Confirmation Date" value={formatDate(v(p, "confirmationDate", "confirmation_date"))} />
                        <InfoRow icon={Building2} label="Company" value={v(p, "company")} />
                        <InfoRow icon={Building2} label="Business Unit" value={v(p, "businessUnit", "business_unit")} />
                        <InfoRow icon={Users} label="Team" value={v(p, "team")} />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8">
                  <SectionTitle icon={Mail}>Contact</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <InfoRow icon={Mail} label="Work Email" value={v(p, "workEmail", "work_email", "email")} />
                    <InfoRow icon={Phone} label="Phone" value={v(p, "phoneNumber", "phone")} />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Banking & Documents */}
            {activeTab === 2 && (
              <div>
                <SectionTitle icon={CreditCard}>Bank Details</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  {editing ? (
                    <>
                      <div>
                        <InputRow icon={CreditCard} label="Bank Name" name="bank_name" value={formData.bank_name} onChange={handleChange} error={fieldErrors.bank_name} maxLength={100} placeholder="e.g. State Bank of India" />
                        <InputRow icon={CreditCard} label="Account Number" name="bank_account" value={formData.bank_account} onChange={handleChange} error={fieldErrors.bank_account} maxLength={22} inputMode="numeric" placeholder="9 to 18 digits" />
                        <InputRow icon={CreditCard} label="IFSC Code" name="bank_ifsc" value={formData.bank_ifsc} onChange={handleChange} error={fieldErrors.bank_ifsc} maxLength={11} autoCapitalize="characters" placeholder="e.g. HDFC0001234" />
                      </div>
                      <div>
                        <InputRow icon={CreditCard} label="UAN Number" name="uan_number" value={formData.uan_number} onChange={handleChange} error={fieldErrors.uan_number} maxLength={14} inputMode="numeric" placeholder="12 digits" />
                        <InputRow icon={CreditCard} label="PF Number" name="pf_number" value={formData.pf_number} onChange={handleChange} error={fieldErrors.pf_number} maxLength={30} />
                        <InputRow icon={CreditCard} label="ESIC Number" name="esic_number" value={formData.esic_number} onChange={handleChange} error={fieldErrors.esic_number} maxLength={19} inputMode="numeric" placeholder="10 or 17 digits" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <InfoRow icon={CreditCard} label="Bank Name" value={v(x, "bank_name", "bankName")} />
                        <InfoRow icon={CreditCard} label="Account Number" value={v(x, "bank_account", "bankAccount")} />
                        <InfoRow icon={CreditCard} label="IFSC Code" value={v(x, "bank_ifsc", "bankIfsc")} />
                      </div>
                      <div>
                        <InfoRow icon={CreditCard} label="UAN Number" value={v(x, "uan_number", "uanNumber")} />
                        <InfoRow icon={CreditCard} label="PF Number" value={v(x, "pf_number", "pfNumber")} />
                        <InfoRow icon={CreditCard} label="ESIC Number" value={v(x, "esic_number", "esicNumber")} />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8">
                  <SectionTitle icon={FileText}>Identity Documents</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {editing ? (
                      <>
                        <div>
                          <InputRow icon={FileText} label="PAN Number" name="pan_number" value={formData.pan_number} onChange={handleChange} error={fieldErrors.pan_number} maxLength={10} autoCapitalize="characters" placeholder="e.g. ABCDE1234F" />
                          <InputRow icon={FileText} label="Aadhar Number" name="aadhar_number" value={formData.aadhar_number} onChange={handleChange} error={fieldErrors.aadhar_number} maxLength={14} inputMode="numeric" placeholder="12 digits" />
                        </div>
                        <div>
                          <InputRow icon={FileText} label="Passport Number" name="passport_number" value={formData.passport_number} onChange={handleChange} error={fieldErrors.passport_number} maxLength={9} autoCapitalize="characters" placeholder="e.g. K1234567" />
                          <InputRow icon={Calendar} label="Passport Expiry" name="passport_expiry" value={formData.passport_expiry} onChange={handleChange} error={fieldErrors.passport_expiry} type="date" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <InfoRow icon={FileText} label="PAN Number" value={v(x, "pan_number", "panNumber")} />
                          <InfoRow icon={FileText} label="Aadhar Number" value={v(x, "aadhar_number", "aadharNumber")} />
                        </div>
                        <div>
                          <InfoRow icon={FileText} label="Passport Number" value={v(x, "passport_number", "passportNumber")} />
                          <InfoRow icon={Calendar} label="Passport Expiry" value={formatDate(v(x, "passport_expiry", "passportExpiry"))} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <SectionTitle icon={Globe}>Visa & Work Permits</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {editing ? (
                      <>
                        <div>
                          <InputRow icon={Globe} label="Visa Number" name="visa_number" value={formData.visa_number} onChange={handleChange} error={fieldErrors.visa_number} maxLength={20} autoCapitalize="characters" />
                          <InputRow icon={Calendar} label="Visa Expiry" name="visa_expiry" value={formData.visa_expiry} onChange={handleChange} error={fieldErrors.visa_expiry} type="date" />
                        </div>
                        <div>
                          <InputRow icon={Calendar} label="Work Permit Expiry" name="work_permit_expiry" value={formData.work_permit_expiry} onChange={handleChange} error={fieldErrors.work_permit_expiry} type="date" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <InfoRow icon={Globe} label="Visa Number" value={v(x, "visa_number", "visaNumber")} />
                          <InfoRow icon={Calendar} label="Visa Expiry" value={formatDate(v(x, "visa_expiry", "visaExpiry"))} />
                        </div>
                        <div>
                          <InfoRow icon={Calendar} label="Work Permit Expiry" value={formatDate(v(x, "work_permit_expiry", "workPermitExpiry"))} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <SectionTitle icon={User}>Additional Info</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {editing ? (
                      <>
                        <div>
                          <InputRow icon={User} label="Skills" name="skills" value={formData.skills} onChange={handleChange} />
                          <InputRow icon={User} label="Certifications" name="certifications" value={formData.certifications} onChange={handleChange} />
                        </div>
                        <div>
                          <InputRow icon={User} label="Projects" name="projects" value={formData.projects} onChange={handleChange} />
                          <InputRow icon={User} label="Achievements" name="achievements" value={formData.achievements} onChange={handleChange} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <InfoRow icon={User} label="Skills" value={v(x, "skills")} />
                          <InfoRow icon={User} label="Certifications" value={v(x, "certifications")} />
                        </div>
                        <div>
                          <InfoRow icon={User} label="Projects" value={v(x, "projects")} />
                          <InfoRow icon={User} label="Achievements" value={v(x, "achievements")} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Save/Cancel bar */}
      {editing && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1e293b] border-t border-slate-200 dark:border-[#334155] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-6 py-4 z-50">
          <div className="max-w-6xl mx-auto flex items-center justify-end gap-3">
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-[#94a3b8] bg-white dark:bg-[#0f172a] hover:bg-slate-50 dark:hover:bg-[#0f172a]/80 border border-slate-200 dark:border-[#334155] rounded-lg transition-colors"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </EmployeePageShell>
  );
}
