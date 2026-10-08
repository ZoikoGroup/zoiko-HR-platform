import { useState, useEffect, useRef } from "react";
import { Plus, Star, Trash2, Edit3, Save, X, Phone, MapPin, Users, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { getMyProfile, updateMyProfile } from "../../../../service/employee";
import { validateContact, cleanContact, serverContactError, MAX_CONTACTS } from "../../../../utils/emergencyContactForm";
import { PHONE_MAX_LENGTH } from "../../../../utils/phone";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";

const RELATIONSHIPS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Guardian", "Other"];

const emptyContact = {
  name: "", relationship: "Spouse",
  primaryPhone: "", alternatePhone: "", address: "", isPrimary: false,
};

const Field = ({ label, icon: Icon, children }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest mb-1.5">
      <Icon size={11} /> {label}
    </label>
    {children}
  </div>
);

const inputCls = (err) =>
  `w-full border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-[#e2e8f0] bg-slate-50 dark:bg-[#0f172a] outline-none
   focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition
   ${err ? "border-red-300 bg-red-50 dark:bg-red-900/30" : "border-slate-200 dark:border-[#334155]"}`;

export default function EmergencyContacts() {
  const [contacts, setContacts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newContact, setNewContact] = useState(emptyContact);
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
        const raw = p.emergencyContacts || p.emergency_contacts || [];
        const normalized = raw.map(c => ({ ...c, id: c.id || c._id }));
        setContacts(normalized);
      })
      .catch((err) => {
        if (mounted.current) setError(err?.message || "Failed to load emergency contacts");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, []);

  const persistContacts = (updatedContacts) => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    return updateMyProfile({ emergency_contacts: updatedContacts })
      .then(() => {
        if (!mounted.current) return true;
        setContacts(updatedContacts);
        setSuccess(true);
        setTimeout(() => { if (mounted.current) setSuccess(false); }, 3000);
        return true;
      })
      .catch((err) => {
        if (mounted.current) setError(serverContactError(err) || err?.message || "Failed to save emergency contacts");
        return false;
      })
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  const handleEdit = (c) => { setEditingId(c.id); setDraft({ ...c }); setErrors({}); };
  const handleCancelEdit = () => { setEditingId(null); setDraft(null); setErrors({}); };

  const handleSave = async (id) => {
    if (saving) return;
    const e = validateContact(draft, contacts.filter((c) => c.id !== id));
    if (Object.keys(e).length) { setErrors(e); return; }
    const updated = contacts.map((c) => c.id === id ? cleanContact(draft) : c);
    if (await persistContacts(updated)) {
      setEditingId(null);
      setDraft(null);
      setErrors({});
    }
  };

  const handleDelete = (id) => {
    const updated = contacts.filter((c) => c.id !== id);
    persistContacts(updated);
  };

  const handleSetPrimary = (id) => {
    const updated = contacts.map((c) => ({ ...c, isPrimary: c.id === id }));
    persistContacts(updated);
  };

  const handleAdd = async () => {
    if (saving) return;
    if (contacts.length >= MAX_CONTACTS) { setErrors({ name: `You can add at most ${MAX_CONTACTS} emergency contacts.` }); return; }
    const e = validateContact(newContact, contacts);
    if (Object.keys(e).length) { setErrors(e); return; }
    const added = { ...cleanContact(newContact), id: Date.now().toString(), isPrimary: contacts.length === 0 };
    if (await persistContacts([...contacts, added])) {
      setNewContact(emptyContact);
      setShowAdd(false);
      setErrors({});
    }
  };

  const ContactCard = ({ contact }) => {
    const isEditing = editingId === contact.id;
    const c = isEditing ? draft : contact;

    return (
      <div className={`bg-white dark:bg-[#1e293b] rounded-2xl border shadow-sm transition ${contact.isPrimary ? "border-blue-200 dark:border-blue-800 shadow-blue-100" : "border-slate-100 dark:border-[#334155]"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#334155]">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
              contact.isPrimary ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300" : "bg-slate-100 dark:bg-[#0f172a] text-slate-500 dark:text-[#94a3b8]"
            }`}>
              {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">{contact.name}</span>
                {contact.isPrimary && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">
                    <Star size={10} fill="currentColor" /> Primary
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-[#94a3b8] mt-0.5">{contact.relationship}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!contact.isPrimary && !isEditing && (
              <button onClick={() => handleSetPrimary(contact.id)} title="Set as primary" className="p-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/20 text-slate-300 dark:text-[#64748b] hover:text-amber-500 transition">
                <Star size={15} />
              </button>
            )}
            {!isEditing ? (
              <>
                <button onClick={() => handleEdit(contact)} className="p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/20 text-slate-400 dark:text-[#94a3b8] hover:text-blue-500 transition">
                  <Edit3 size={15} />
                </button>
                <button onClick={() => handleDelete(contact.id)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-400 dark:text-[#94a3b8] hover:text-red-500 transition">
                  <Trash2 size={15} />
                </button>
              </>
            ) : (
              <>
                <button onClick={handleCancelEdit} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#0f172a] text-slate-400 dark:text-[#94a3b8] transition"><X size={15} /></button>
                <button onClick={() => handleSave(contact.id)} className="flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition">
                  <Save size={13} /> Save
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <Field label="Full Name" icon={Users}>
                <input className={inputCls(errors.name)} value={draft.name} maxLength={100} onChange={(e) => { setDraft((p) => ({ ...p, name: e.target.value })); setErrors((x) => ({ ...x, name: undefined })); }} />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </Field>
              <Field label="Relationship" icon={Users}>
                <select className={inputCls()} value={draft.relationship} onChange={(e) => setDraft((p) => ({ ...p, relationship: e.target.value }))}>
                  {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Primary Phone" icon={Phone}>
                <input className={inputCls(errors.primaryPhone)} value={draft.primaryPhone} maxLength={PHONE_MAX_LENGTH} onChange={(e) => { setDraft((p) => ({ ...p, primaryPhone: e.target.value })); setErrors((x) => ({ ...x, primaryPhone: undefined })); }} />
                {errors.primaryPhone && <p className="text-xs text-red-500 mt-1">{errors.primaryPhone}</p>}
              </Field>
              <Field label="Alternate Phone" icon={Phone}>
                <input className={inputCls(errors.alternatePhone)} value={draft.alternatePhone} maxLength={PHONE_MAX_LENGTH} onChange={(e) => { setDraft((p) => ({ ...p, alternatePhone: e.target.value })); setErrors((x) => ({ ...x, alternatePhone: undefined })); }} placeholder="Optional" />
                {errors.alternatePhone && <p className="text-xs text-red-500 mt-1">{errors.alternatePhone}</p>}
              </Field>
              <div className="md:col-span-2">
                <Field label="Home Address" icon={MapPin}>
                  <input className={inputCls(errors.address)} value={draft.address} maxLength={500} onChange={(e) => { setDraft((p) => ({ ...p, address: e.target.value })); setErrors((x) => ({ ...x, address: undefined })); }} />
                  {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                </Field>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-semibold uppercase tracking-wide flex items-center gap-1"><Phone size={10} /> Primary Phone</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mt-1">{contact.primaryPhone}</p>
              </div>
              {contact.alternatePhone && (
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-semibold uppercase tracking-wide flex items-center gap-1"><Phone size={10} /> Alternate Phone</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mt-1">{contact.alternatePhone}</p>
                </div>
              )}
              <div className="md:col-span-2">
                <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-semibold uppercase tracking-wide flex items-center gap-1"><MapPin size={10} /> Home Address</p>
                <p className="text-sm text-slate-700 dark:text-[#f1f5f9] mt-1">{contact.address}</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <EmployeePageShell title="Emergency Contacts" subtitle="Profile">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading emergency contacts...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Emergency Contacts" subtitle="Profile">
      <div className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest font-semibold">Profile</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-[#f1f5f9] mt-1">Emergency Contacts</h1>
          </div>
          {saving ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/20 px-4 py-2.5 rounded-xl">
              <Loader2 size={14} className="animate-spin" /> Saving...
            </div>
          ) : (
            <button
              disabled={contacts.length >= MAX_CONTACTS}
              title={contacts.length >= MAX_CONTACTS ? `You can add at most ${MAX_CONTACTS} emergency contacts.` : undefined}
              onClick={() => { setShowAdd(true); setErrors({}); }}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl transition shadow-sm shadow-blue-200"
            >
              <Plus size={16} /> Add Contact
            </button>
          )}
        </div>

        {success && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <CheckCircle size={16} /> Emergency contacts saved successfully!
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="space-y-4">
          {[...contacts].sort((a, b) => b.isPrimary - a.isPrimary).map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
          {contacts.length === 0 && !showAdd && (
            <div className="text-center py-12 text-slate-400 dark:text-[#94a3b8] text-sm font-medium">
              No emergency contacts added yet. Click "Add Contact" to add one.
            </div>
          )}
        </div>

        {/* Add New Contact Form */}
        {showAdd && (
          <div className="mt-4 bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-[#f1f5f9]">New Contact</h3>
              <button onClick={() => { setShowAdd(false); setErrors({}); setNewContact(emptyContact); }} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#0f172a] text-slate-400 dark:text-[#94a3b8] transition">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" icon={Users}>
                <input className={inputCls(errors.name)} value={newContact.name} maxLength={100} onChange={(e) => { setNewContact((p) => ({ ...p, name: e.target.value })); setErrors((x) => ({ ...x, name: undefined })); }} placeholder="Jane Doe" />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </Field>
              <Field label="Relationship" icon={Users}>
                <select className={inputCls()} value={newContact.relationship} onChange={(e) => setNewContact((p) => ({ ...p, relationship: e.target.value }))}>
                  {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Primary Phone" icon={Phone}>
                <input className={inputCls(errors.primaryPhone)} value={newContact.primaryPhone} maxLength={PHONE_MAX_LENGTH} onChange={(e) => { setNewContact((p) => ({ ...p, primaryPhone: e.target.value })); setErrors((x) => ({ ...x, primaryPhone: undefined })); }} placeholder="+91 98765 43210" />
                {errors.primaryPhone && <p className="text-xs text-red-500 mt-1">{errors.primaryPhone}</p>}
              </Field>
              <Field label="Alternate Phone" icon={Phone}>
                <input className={inputCls(errors.alternatePhone)} value={newContact.alternatePhone} maxLength={PHONE_MAX_LENGTH} onChange={(e) => { setNewContact((p) => ({ ...p, alternatePhone: e.target.value })); setErrors((x) => ({ ...x, alternatePhone: undefined })); }} placeholder="Optional" />
                {errors.alternatePhone && <p className="text-xs text-red-500 mt-1">{errors.alternatePhone}</p>}
              </Field>
              <div className="md:col-span-2">
                <Field label="Home Address" icon={MapPin}>
                  <input className={inputCls(errors.address)} value={newContact.address} maxLength={500} onChange={(e) => { setNewContact((p) => ({ ...p, address: e.target.value })); setErrors((x) => ({ ...x, address: undefined })); }} placeholder="Full home address" />
                  {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                </Field>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowAdd(false); setErrors({}); setNewContact(emptyContact); }} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#334155] text-sm font-semibold text-slate-500 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#0f172a] transition">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={handleAdd} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
                Add Contact
              </button>
            </div>
          </div>
        )}
      </div>
    </EmployeePageShell>
  );
}
