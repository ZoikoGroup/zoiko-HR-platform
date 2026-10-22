import { useEffect, useId, useState } from "react";
import { Globe2, Pencil, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../service/api";
import { getEmployeeJurisdiction, updateEmployeeJurisdiction, listLegalEntities } from "../../service/docTemplatesService";
import { formatDate } from "../../utils/dateTime";

// Where a person works, for the document engine: work country / region / city, the legal entity that employs them,
// their worker category and contract end date. These choose which jurisdiction's templates apply. HR roles only;
// every change asks for a reason and is written to the employee's history.

const HR_EDIT_ROLES = ["admin", "hr_admin"];
const CATEGORIES = [
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "apprentice", label: "Apprentice" },
  { value: "contractor", label: "Contractor" },
  { value: "casual", label: "Casual worker" },
];

const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600";

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-gray-100 py-2 last:border-0">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{value || <span className="italic text-gray-500">Not set</span>}</dd>
    </div>
  );
}

export default function EmployeeJurisdictionCard({ employeeId }) {
  const uid = useId();
  const { user } = useAuth();
  const canEdit = HR_EDIT_ROLES.includes(user?.role);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [countries, setCountries] = useState([]);
  const [formats, setFormats] = useState(null);
  const [entities, setEntities] = useState([]);

  useEffect(() => {
    if (!employeeId) return;
    let alive = true;
    setLoading(true);
    getEmployeeJurisdiction(employeeId)
      .then((d) => { if (alive) { setData(d); setLoadError(null); } })
      .catch((e) => alive && setLoadError(e?.message || "Could not load the work location."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [employeeId]);

  // Reference data is only needed to show the entity name and to edit.
  useEffect(() => {
    listLegalEntities().then((r) => setEntities(Array.isArray(r?.items) ? r.items : [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!editing || countries.length) return;
    api.get("/hr/reference/regions").then((r) => setCountries(Array.isArray(r?.countries) ? r.countries : [])).catch(() => {});
    api.get("/hr/reference/business-formats").then(setFormats).catch(() => {});
  }, [editing, countries.length]);

  const startEdit = () => {
    setForm({
      work_country: data?.work_country || "",
      work_region: data?.work_region || "",
      work_city: data?.work_city || "",
      employing_entity_id: data?.employing_entity_id ? String(data.employing_entity_id) : "",
      worker_category: data?.worker_category || "",
      contract_end_date: data?.contract_end_date || "",
    });
    setReason("");
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const regionList = form?.work_country ? formats?.countries?.[form.work_country]?.regions || null : null;
  const regionLabel = (form?.work_country && formats?.countries?.[form.work_country]?.region_label) || "State / region";
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError("Say why this is changing. It is recorded in the employee's history."); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        work_country: form.work_country || null,
        work_region: form.work_region.trim() || null,
        work_city: form.work_city.trim() || null,
        employing_entity_id: form.employing_entity_id ? Number(form.employing_entity_id) : null,
        worker_category: form.worker_category || null,
        contract_end_date: form.contract_end_date || null,
        change_reason: reason.trim(),
      };
      const res = await updateEmployeeJurisdiction(employeeId, body);
      setData(res && typeof res === "object" && "employee_id" in res ? res : await getEmployeeJurisdiction(employeeId));
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(err?.message || "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const entityName = (id) => {
    const e = entities.find((x) => Number(x.id) === Number(id));
    return e ? e.legal_name : id ? `Entity #${id}` : null;
  };
  const f = (n) => `${uid}-${n}`;

  return (
    <section aria-labelledby={f("h")} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <Globe2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <h3 id={f("h")} className="text-sm font-semibold text-gray-700">Work location & employer (for documents)</h3>
        {canEdit && !editing && data && (
          <button type="button" onClick={startEdit} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <Pencil size={13} aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      <div className="p-4">
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading...</p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-red-700">{loadError}</p>
        ) : !editing ? (
          <>
            {saved && (
              <p role="status" className="mb-2 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} aria-hidden="true" /> Saved and recorded in the employee's history.</p>
            )}
            {!data?.work_country && (
              <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                No work country is recorded, so documents cannot be generated for this person.
              </p>
            )}
            <dl>
              <Row label="Work country" value={data?.work_country_name || data?.work_country} />
              <Row label="Region" value={data?.work_region} />
              <Row label="City" value={data?.work_city} />
              <Row label="Employing entity" value={entityName(data?.employing_entity_id)} />
              <Row label="Worker category" value={CATEGORIES.find((c) => c.value === data?.worker_category)?.label || data?.worker_category} />
              <Row label="Contract end" value={data?.contract_end_date ? formatDate(data.contract_end_date) : null} />
            </dl>
          </>
        ) : (
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={f("country")} className={labelCls}>Work country</label>
              <select id={f("country")} value={form.work_country}
                onChange={(e) => setForm((x) => ({ ...x, work_country: e.target.value, work_region: "" }))} className={inputCls}>
                <option value="">Not set</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={f("region")} className={labelCls}>{regionLabel}</label>
              {regionList ? (
                <select id={f("region")} value={form.work_region} onChange={(e) => set("work_region", e.target.value)} className={inputCls}>
                  <option value="">Not set</option>
                  {regionList.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input id={f("region")} maxLength={100} value={form.work_region} onChange={(e) => set("work_region", e.target.value)} className={inputCls} />
              )}
            </div>
            <div>
              <label htmlFor={f("city")} className={labelCls}>City</label>
              <input id={f("city")} maxLength={100} value={form.work_city} onChange={(e) => set("work_city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor={f("entity")} className={labelCls}>Employing entity</label>
              <select id={f("entity")} value={form.employing_entity_id} onChange={(e) => set("employing_entity_id", e.target.value)} className={inputCls}>
                <option value="">Default entity</option>
                {entities.filter((x) => x.status === "active" || String(x.id) === form.employing_entity_id).map((x) => (
                  <option key={x.id} value={x.id}>{x.legal_name}{x.is_default ? " (default)" : ""}{x.status !== "active" ? " (inactive)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={f("cat")} className={labelCls}>Worker category</label>
              <select id={f("cat")} value={form.worker_category} onChange={(e) => set("worker_category", e.target.value)} className={inputCls}>
                <option value="">Not set</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={f("end")} className={labelCls}>Contract end date</label>
              <input id={f("end")} type="date" value={form.contract_end_date || ""} onChange={(e) => set("contract_end_date", e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={f("reason")} className={labelCls}>Reason for the change <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></label>
              <input id={f("reason")} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Relocated to the Dubai office" aria-describedby={f("reason-h")} className={inputCls} />
              <p id={f("reason-h")} className="mt-1 text-xs text-gray-500">Recorded in the employee's history with your name.</p>
            </div>
            {error && (
              <p role="alert" className="sm:col-span-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
              </p>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50">
                {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Save
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
