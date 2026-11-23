import { useEffect, useRef, useState } from "react";
import { getCertifications, createCertification, updateCertification, deleteCertification } from "../../../service/hrService";
import EmployeePicker from "./EmployeePicker.jsx";
import { Banner, Dialog, DialogButtons, Pager, Table, asPage, inputCls, PER_PAGE } from "./recordsKit.jsx";

export const CERT_STATUSES = ["active", "expired", "revoked"];
const EMPTY = { certification_name: "", issuing_organization: "", issue_date: "", expiry_date: "", credential_url: "", status: "active" };

/** The checks the server makes too, so a mistake is shown next to its field before anything is sent. */
export function validateCertification(form, person, creating) {
  const errors = {};
  if (creating && !person) errors.person = "Choose whose certification this is.";
  if (!form.certification_name.trim()) errors.certification_name = "Certification name is required.";
  if (!form.issue_date) errors.issue_date = "Issue date is required.";
  if (form.issue_date && form.expiry_date && form.expiry_date < form.issue_date) errors.expiry_date = "The expiry date cannot be before the issue date.";
  if (form.credential_url.trim() && !/^https?:\/\//i.test(form.credential_url.trim())) errors.credential_url = "The link must start with http:// or https://.";
  return errors;
}

export function certificationPayload(form) {
  return {
    certification_name: form.certification_name.trim(),
    issuing_organization: form.issuing_organization.trim() || null,
    issue_date: form.issue_date,
    expiry_date: form.expiry_date || null,
    credential_url: form.credential_url.trim() || null,
    status: form.status || "active",
  };
}

/** Admin screen (audit L4): certifications held by the organization's people. */
export default function LearningCertifications() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [who, setWho] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);           // {} = new, a row = edit
  const latest = useRef(0);

  const load = async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const res = asPage(await getCertifications({ page, per_page: PER_PAGE, employee_id: who?.id }));
      if (ticket !== latest.current) return;
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      if (ticket === latest.current) { setRows([]); setError(err?.message || "Certifications could not be loaded."); }
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  };
  useEffect(() => { load(); }, [page, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.certification_name}" for ${row.employee_name || "this person"}?`)) return;
    setError(""); setNotice("");
    try {
      await deleteCertification(row.id);
      setNotice("The certification was deleted.");
      await load();
    } catch (err) {
      setError(err?.message || "The certification could not be deleted.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError("")} />
      <Banner message={notice} tone="ok" onClose={() => setNotice("")} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <EmployeePicker id="cert-filter" label="Show one person" value={who} onChange={(p) => { setWho(p); setPage(1); }} />
        </div>
        <button type="button" onClick={() => setEditing({})} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">+ Add Certification</button>
      </div>

      <Table headers={["Employee", "Certification", "Issued by", "Issued", "Expires", "Status", "Actions"]}
        empty={<>
          {!loading && rows.length === 0 && <p className="text-center py-10 text-gray-500 dark:text-[#94a3b8]">{who ? "This person has no certifications recorded." : "No certifications recorded yet."}</p>}
          <Pager page={page} total={total} onPage={setPage} />
        </>}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-[#0f172a]">
            <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f1f5f9]">{r.employee_name || `Employee #${r.employee_id}`}</td>
            <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{r.certification_name}</td>
            <td className="px-4 py-3 text-gray-500 dark:text-[#94a3b8]">{r.issuing_organization || "-"}</td>
            <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">{r.issue_date || "-"}</td>
            <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">{r.expiry_date || "-"}</td>
            <td className="px-4 py-3 text-xs capitalize">{r.status}</td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                <button type="button" onClick={() => remove(r)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <CertificationDialog row={editing.id ? editing : null} onClose={() => setEditing(null)}
          onDone={async (msg) => { setEditing(null); setNotice(msg); await load(); }} />
      )}
    </div>
  );
}

function CertificationDialog({ row, onClose, onDone }) {
  const creating = !row;
  const [form, setForm] = useState(row ? {
    certification_name: row.certification_name || "", issuing_organization: row.issuing_organization || "", issue_date: row.issue_date || "",
    expiry_date: row.expiry_date || "", credential_url: row.credential_url || "", status: row.status || "active",
  } : { ...EMPTY });
  const [person, setPerson] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined, submit: undefined })); };
  const err = (k) => (errors[k] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[k]}</p> : null);

  const submit = async (e) => {
    e.preventDefault();
    const found = validateCertification(form, person, creating);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (creating) await createCertification({ ...certificationPayload(form), employee_id: person.id });
      else await updateCertification(row.id, certificationPayload(form));
      await onDone(creating ? `"${form.certification_name.trim()}" was added for ${person.name}.` : "The certification was updated.");
    } catch (err2) {
      setErrors({ submit: err2?.message || "The certification could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={creating ? "Add Certification" : "Edit Certification"} onClose={onClose}>
      <form noValidate onSubmit={submit} className="space-y-4">
        {errors.submit && <p role="alert" className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg">{errors.submit}</p>}
        {creating
          ? <EmployeePicker id="cert-person" label="Employee" required value={person} onChange={setPerson} error={errors.person} />
          : <p className="text-sm text-gray-600 dark:text-[#cbd5e1]">For <span className="font-medium text-gray-800 dark:text-[#f1f5f9]">{row.employee_name || `Employee #${row.employee_id}`}</span></p>}
        <div>
          <label htmlFor="cert-name" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Certification name<span className="text-red-500"> *</span></label>
          <input id="cert-name" value={form.certification_name} maxLength={200} onChange={set("certification_name")} className={inputCls} />
          {err("certification_name")}
        </div>
        <div>
          <label htmlFor="cert-issuer" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Issuing organization</label>
          <input id="cert-issuer" value={form.issuing_organization} maxLength={200} onChange={set("issuing_organization")} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cert-issued" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Issue date<span className="text-red-500"> *</span></label>
            <input id="cert-issued" type="date" value={form.issue_date} onChange={set("issue_date")} className={inputCls} />
            {err("issue_date")}
          </div>
          <div>
            <label htmlFor="cert-expiry" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Expiry date</label>
            <input id="cert-expiry" type="date" value={form.expiry_date} onChange={set("expiry_date")} className={inputCls} />
            {err("expiry_date")}
          </div>
        </div>
        <div>
          <label htmlFor="cert-url" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Credential link</label>
          <input id="cert-url" value={form.credential_url} maxLength={500} onChange={set("credential_url")} placeholder="https://..." className={inputCls} />
          {err("credential_url")}
        </div>
        <div>
          <label htmlFor="cert-status" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Status</label>
          <select id="cert-status" value={form.status} onChange={set("status")} className={inputCls}>
            {CERT_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <DialogButtons busy={busy} label={creating ? "Add Certification" : "Save Changes"} busyLabel="Saving..." onCancel={onClose} />
      </form>
    </Dialog>
  );
}
