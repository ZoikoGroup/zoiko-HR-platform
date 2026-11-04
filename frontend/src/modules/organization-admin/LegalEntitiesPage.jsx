import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, AlertTriangle, ShieldCheck, RefreshCw, Plus, Pencil, Star, Power, Loader2, UserPlus, Ban, MapPin, Users, Settings2,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { Modal } from "../../components/billing-ui";
import { api } from "../../service/api";
import { getHrEmployees } from "../../service/hrService";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../utils/dateTime";
import {
  listLegalEntities, createLegalEntity, updateLegalEntity, setDefaultLegalEntity, setLegalEntityStatus,
  listSignatories, createSignatory, updateSignatory, listTemplateFamilies, getJurisdictionGaps,
  getTemplateSettings, updateTemplateSettings,
} from "../../service/docTemplatesService";

// "Legal entities & signatories": the employer companies documents are issued in the name of, the people authorised to
// approve and sign for each of them, what still blocks document generation (missing work countries, incomplete
// entity profiles), and whether organization-approved templates may be attested here.

const cardCls = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
const inputCls = "w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-800 outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600";
const btnGhost = "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const btnPrimary = "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#3B82F6] text-xs font-semibold text-white hover:bg-[#2563EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50";
const btnDanger = "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50";
const modalPrimary = "inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2563EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50";
const modalGhost = "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

const RISK_OPTIONS = [
  { value: "L1", label: "L1 · standard documents" },
  { value: "L2", label: "L2 · up to elevated risk" },
  { value: "L3", label: "L3 · up to high risk (contracts, dismissals)" },
];

const SOD_TEXT = "You cannot appoint yourself or change your own signing authority. Another organization admin must do this.";

function errorText(e, fallback) {
  if (e?.code === "SEPARATION_OF_DUTIES") return SOD_TEXT;
  return e?.message || fallback;
}

function Pill({ tone = "slate", children }) {
  const cls = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function ErrorBox({ text }) {
  if (!text) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{text}</span>
    </div>
  );
}

// ── entity create / edit ────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY_ENTITY = {
  legal_name: "", trading_name: "", country: "", registration_type: "", registration_number: "", tax_id: "",
  region: "", city: "", postal_code: "", address_lines: ["", ""], phone: "", email: "",
};

function EntityModal({ entity, countries, formats, onClose, onSaved }) {
  const id = useId();
  const [form, setForm] = useState(() => {
    if (!entity) return { ...EMPTY_ENTITY };
    const lines = Array.isArray(entity.address_lines) ? [...entity.address_lines] : [];
    while (lines.length < 2) lines.push("");
    const out = { ...EMPTY_ENTITY };
    for (const k of Object.keys(EMPTY_ENTITY)) if (entity[k] !== null && entity[k] !== undefined) out[k] = entity[k];
    out.address_lines = lines;
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const fmt = (form.country && formats?.countries?.[form.country]) || formats?.default || null;
  const idTypes = fmt?.ids || [];
  const regionList = fmt?.regions || null;
  const currentType = idTypes.find((t) => t.key === form.registration_type) || null;

  const changeCountry = (cc) => {
    setForm((f) => {
      const nf = { ...f, country: cc };
      const nfmt = (cc && formats?.countries?.[cc]) || formats?.default;
      if (!nfmt?.ids?.some((t) => t.key === f.registration_type)) nf.registration_type = nfmt?.ids?.[0]?.key || "";
      if (nfmt?.regions && f.region && !nfmt.regions.includes(f.region)) nf.region = "";
      return nf;
    });
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.legal_name.trim()) { setError("The legal name is required."); return; }
    setBusy(true);
    setError(null);
    const body = { ...form, address_lines: form.address_lines.map((l) => l.trim()).filter(Boolean) };
    for (const k of Object.keys(body)) if (body[k] === "") body[k] = null;
    try {
      const saved = entity ? await updateLegalEntity(entity.id, body) : await createLegalEntity(body);
      onSaved(saved, entity ? `${saved.legal_name || "Entity"} updated.` : `${saved.legal_name || "Entity"} added.`);
    } catch (err) {
      setError(errorText(err, "The entity could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const f = (name) => `${id}-${name}`;
  return (
    <Modal open onClose={onClose} size="lg" icon={Building2} title={entity ? "Edit legal entity" : "Add legal entity"}
      description="The employer company named on documents. Use the details exactly as registered."
      footer={<>
        <button type="button" className={modalGhost} onClick={onClose}>Cancel</button>
        <button type="submit" form={f("form")} className={modalPrimary} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Save
        </button>
      </>}>
      <form id={f("form")} onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={f("legal")} className={labelCls}>Legal name <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></label>
          <input id={f("legal")} required maxLength={255} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={f("trading")} className={labelCls}>Trading name</label>
          <input id={f("trading")} maxLength={255} value={form.trading_name} onChange={(e) => set("trading_name", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={f("country")} className={labelCls}>Country of registration</label>
          <select id={f("country")} value={form.country} onChange={(e) => changeCountry(e.target.value)} className={inputCls}>
            <option value="">Choose a country</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={f("rtype")} className={labelCls}>Registration type</label>
          <select id={f("rtype")} value={form.registration_type} onChange={(e) => set("registration_type", e.target.value)} className={inputCls}>
            <option value="">Not set</option>
            {idTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={f("rnum")} className={labelCls}>{currentType?.label || "Registration"} number</label>
          <input id={f("rnum")} maxLength={100} value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)}
            placeholder={currentType?.placeholder || ""} aria-describedby={currentType?.hint ? f("rnum-h") : undefined} className={inputCls} />
          {currentType?.hint && <p id={f("rnum-h")} className="mt-1 text-xs text-slate-500">{currentType.hint}</p>}
        </div>
        <div>
          <label htmlFor={f("tax")} className={labelCls}>Tax ID</label>
          <input id={f("tax")} maxLength={100} value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} className={inputCls} />
        </div>
        <fieldset className="sm:col-span-2 space-y-2">
          <legend className={labelCls}>Registered address</legend>
          {form.address_lines.map((line, i) => (
            <div key={i}>
              <label htmlFor={f(`addr${i}`)} className="sr-only">Address line {i + 1}</label>
              <input id={f(`addr${i}`)} maxLength={200} value={line} placeholder={`Address line ${i + 1}`}
                onChange={(e) => set("address_lines", form.address_lines.map((l, j) => (j === i ? e.target.value : l)))} className={inputCls} />
            </div>
          ))}
          {form.address_lines.length < 6 && (
            <button type="button" className={btnGhost} onClick={() => set("address_lines", [...form.address_lines, ""])}>
              <Plus size={14} aria-hidden="true" /> Add address line
            </button>
          )}
        </fieldset>
        <div>
          <label htmlFor={f("city")} className={labelCls}>City</label>
          <input id={f("city")} maxLength={100} value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={f("region")} className={labelCls}>{fmt?.region_label || "State / region"}</label>
          {regionList ? (
            <select id={f("region")} value={form.region} onChange={(e) => set("region", e.target.value)} className={inputCls}>
              <option value="">Choose</option>
              {regionList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input id={f("region")} maxLength={100} value={form.region} onChange={(e) => set("region", e.target.value)} className={inputCls} />
          )}
        </div>
        <div>
          <label htmlFor={f("postal")} className={labelCls}>{fmt?.postal_label || "Postal code"}</label>
          <input id={f("postal")} maxLength={20} value={form.postal_code} placeholder={fmt?.postal_placeholder || ""} onChange={(e) => set("postal_code", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={f("phone")} className={labelCls}>Phone</label>
          <input id={f("phone")} type="tel" maxLength={50} value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={f("email")} className={labelCls}>E-mail</label>
          <input id={f("email")} type="email" maxLength={255} value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2"><ErrorBox text={error} /></div>
      </form>
    </Modal>
  );
}

// ── signatory create / edit ─────────────────────────────────────────────────────────────────────────────────────────

function ScopePicker({ value, onChange, families, idBase }) {
  const all = value.includes("ALL");
  const familyIds = new Set(families.map((x) => x.family_id));
  const extras = value.filter((v) => v !== "ALL" && !familyIds.has(v)); // individual template ids, kept as they are
  const toggle = (fid) => {
    const has = value.includes(fid);
    onChange(has ? value.filter((v) => v !== fid) : [...value.filter((v) => v !== "ALL"), fid]);
  };
  return (
    <fieldset>
      <legend className={labelCls}>Authority scope</legend>
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? ["ALL"] : [])}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
          All document families
        </label>
        <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto border-t border-slate-100 pt-2 sm:grid-cols-2" aria-describedby={`${idBase}-scope-h`}>
          {families.map((fam) => (
            <label key={fam.family_id} className={`flex items-start gap-2 text-sm ${all ? "text-slate-400" : "text-slate-700"}`}>
              <input type="checkbox" disabled={all} checked={!all && value.includes(fam.family_id)} onChange={() => toggle(fam.family_id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
              <span><span className="font-mono text-xs">{fam.family_id}</span> {fam.name}</span>
            </label>
          ))}
        </div>
        {extras.length > 0 && (
          <p className="text-xs text-slate-600">Also individual templates: {extras.join(", ")}</p>
        )}
      </div>
      <p id={`${idBase}-scope-h`} className="mt-1 text-xs text-slate-500">Choose "All" or one or more families of documents this person may approve and sign.</p>
    </fieldset>
  );
}

function SignatoryModal({ entity, signatory, families, employees, onClose, onSaved }) {
  const id = useId();
  const editing = !!signatory;
  const [employeeId, setEmployeeId] = useState(signatory?.employee_id ? String(signatory.employee_id) : "");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState(signatory?.signatory_title || "");
  const [scope, setScope] = useState(signatory?.authority_scope?.length ? signatory.authority_scope : ["ALL"]);
  const [risk, setRisk] = useState(signatory?.max_risk_level || "L1");
  const [validFrom, setValidFrom] = useState(signatory?.valid_from || "");
  const [validTo, setValidTo] = useState(signatory?.valid_to || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => !q || `${e.first_name} ${e.last_name} ${e.employee_code || ""} ${e.email || ""}`.toLowerCase().includes(q)).slice(0, 200);
  }, [employees, search]);

  const save = async (ev) => {
    ev?.preventDefault?.();
    if (!editing && !employeeId) { setError("Choose the person to appoint."); return; }
    if (!title.trim()) { setError("Enter the signatory's title, for example Director."); return; }
    if (!scope.length) { setError("Choose at least one document family, or All."); return; }
    if (validFrom && validTo && validTo < validFrom) { setError("The end date must be after the start date."); return; }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateSignatory(signatory.id, { signatory_title: title.trim(), authority_scope: scope, max_risk_level: risk, valid_to: validTo || null });
        onSaved(`${signatory.employee_name || "Signatory"} updated.`);
      } else {
        await createSignatory({
          entity_id: entity.id, employee_id: Number(employeeId), signatory_title: title.trim(), authority_scope: scope,
          max_risk_level: risk, valid_from: validFrom || null, valid_to: validTo || null,
        });
        onSaved("Signatory appointed.");
      }
    } catch (e) {
      setError(errorText(e, "The signatory could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const f = (n) => `${id}-${n}`;
  return (
    <Modal open onClose={onClose} size="lg" icon={UserPlus}
      title={editing ? `Edit signatory · ${signatory.employee_name || ""}` : "Appoint an authorised signatory"}
      description={entity.legal_name}
      footer={<>
        <button type="button" className={modalGhost} onClick={onClose}>Cancel</button>
        <button type="submit" form={f("form")} className={modalPrimary} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {editing ? "Save" : "Appoint"}
        </button>
      </>}>
      <form id={f("form")} onSubmit={save} className="space-y-4">
        {!editing && (
          <div>
            <label htmlFor={f("emp")} className={labelCls}>Person <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></label>
            <label htmlFor={f("emp-search")} className="sr-only">Filter people</label>
            <input id={f("emp-search")} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or code" className={`${inputCls} mb-2`} />
            <select id={f("emp")} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls} required>
              <option value="">Choose a person ({filtered.length})</option>
              {filtered.map((e) => (
                <option key={e.id} value={e.id}>{`${e.first_name || ""} ${e.last_name || ""}`.trim()}{e.employee_code ? ` (${e.employee_code})` : ""}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">You cannot appoint yourself: another organization admin must do that.</p>
          </div>
        )}
        <div>
          <label htmlFor={f("title")} className={labelCls}>Title shown on documents <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></label>
          <input id={f("title")} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Director" className={inputCls} />
        </div>
        <ScopePicker value={scope} onChange={setScope} families={families} idBase={id} />
        <div>
          <label htmlFor={f("risk")} className={labelCls}>Highest risk level</label>
          <select id={f("risk")} value={risk} onChange={(e) => setRisk(e.target.value)} className={inputCls}>
            {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={f("from")} className={labelCls}>Valid from</label>
            <input id={f("from")} type="date" value={validFrom || ""} onChange={(e) => setValidFrom(e.target.value)} disabled={editing}
              aria-describedby={f("from-h")} className={inputCls} />
            <p id={f("from-h")} className="mt-1 text-xs text-slate-500">{editing ? "The start date cannot be changed." : "Leave empty to start today."}</p>
          </div>
          <div>
            <label htmlFor={f("to")} className={labelCls}>Valid until</label>
            <input id={f("to")} type="date" value={validTo || ""} onChange={(e) => setValidTo(e.target.value)} aria-describedby={f("to-h")} className={inputCls} />
            <p id={f("to-h")} className="mt-1 text-xs text-slate-500">Leave empty for no end date.</p>
          </div>
        </div>
        <ErrorBox text={error} />
      </form>
    </Modal>
  );
}

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export default function LegalEntitiesPage() {
  const { user } = useAuth();
  const [entities, setEntities] = useState([]);
  const [signatories, setSignatories] = useState([]);
  const [families, setFamilies] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [settings, setSettings] = useState(null);
  const [countries, setCountries] = useState([]);
  const [formats, setFormats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [entityModal, setEntityModal] = useState(null); // { entity|null }
  const [sigModal, setSigModal] = useState(null); // { entity, signatory|null }
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const problems = [];
    const safe = (p, label) => p.catch((e) => { problems.push(`${label}: ${e?.message || "failed"}`); return null; });
    const [ents, sigs, fams, gp, st] = await Promise.all([
      safe(listLegalEntities(), "Legal entities"),
      safe(listSignatories(), "Signatories"),
      safe(listTemplateFamilies(), "Document families"),
      safe(getJurisdictionGaps(), "Jurisdiction gaps"),
      safe(getTemplateSettings(), "Template settings"),
    ]);
    if (ents) setEntities(Array.isArray(ents.items) ? ents.items : []);
    if (sigs) setSignatories(Array.isArray(sigs.items) ? sigs.items : []);
    if (fams) setFamilies(Array.isArray(fams.items) ? fams.items : []);
    setGaps(gp);
    setSettings(st);
    setError(problems.length ? `Some information could not be loaded. ${problems.join(" · ")}` : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reference data for the forms (countries, registration types, regions) and the people who can be appointed.
  useEffect(() => {
    api.get("/hr/reference/regions").then((r) => setCountries(Array.isArray(r?.countries) ? r.countries : [])).catch(() => {});
    api.get("/hr/reference/business-formats").then(setFormats).catch(() => {});
    getHrEmployees({ per_page: 200, include_all_roles: true })
      .then((res) => { const raw = res?.items || res?.data || res; setEmployees(Array.isArray(raw) ? raw : []); })
      .catch(() => {});
  }, []);

  const run = async (key, fn, okText) => {
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      setNotice(okText);
      await load();
    } catch (e) {
      setError(errorText(e, "The action failed."));
    } finally {
      setBusyKey(null);
    }
  };

  const attestationAllowed = settings && settings.platform_allows_tenant_attestation !== false && settings.plan_includes_tenant_attestation !== false;
  const attestationReason = !settings ? null
    : settings.platform_allows_tenant_attestation === false
      ? "Zoiko has not enabled organization attestation on this platform yet."
      : settings.plan_includes_tenant_attestation === false
        ? "Your plan does not include organization-approved templates. Upgrade your plan to use it."
        : null;

  const sigsFor = (entityId) => signatories.filter((s) => s.entity_id === entityId);
  const isMe = (s) => user?.id != null && Number(s.employee_id) === Number(user.id);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Legal entities & signatories"
        description="The employer companies documents are issued by, and the people authorised to approve and sign for them."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load()} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            <button type="button" onClick={() => setEntityModal({ entity: null })} className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2563EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add legal entity
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs font-semibold text-red-700 underline">Dismiss</button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold text-emerald-800 underline">Dismiss</button>
        </div>
      )}

      {gaps && !gaps.has_default_entity && !loading && (
        <div role="status" className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>There is no active default legal entity. Documents cannot be generated until one is set.</span>
        </div>
      )}

      {/* entities */}
      <section className={cardCls} aria-labelledby="le-entities">
        <h2 id="le-entities" className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Legal entities</h2>
        {loading && entities.length === 0 ? (
          <div role="status" className="py-8 text-center text-slate-500">Loading...</div>
        ) : entities.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-slate-500">
            <Building2 className="h-8 w-8 opacity-40" aria-hidden="true" />
            No legal entity yet. Add the company that employs your people.
          </div>
        ) : (
          <ul className="space-y-4">
            {entities.map((e) => {
              const inactive = e.status !== "active";
              const sigs = sigsFor(e.id);
              return (
                <li key={e.id} className={`rounded-2xl border p-4 ${inactive ? "border-slate-200 bg-slate-50/60" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{e.legal_name || "Unnamed entity"}</h3>
                    {e.trading_name && <span className="text-sm text-slate-500">trading as {e.trading_name}</span>}
                    {e.is_default && <Pill tone="blue">Default</Pill>}
                    <Pill tone={inactive ? "slate" : "green"}>{inactive ? "Inactive" : "Active"}</Pill>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <button type="button" className={btnGhost} onClick={() => setEntityModal({ entity: e })}>
                        <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> {e.legal_name}</span>
                      </button>
                      {!e.is_default && !inactive && (
                        <button type="button" className={btnGhost} disabled={busyKey === `def-${e.id}`}
                          onClick={() => run(`def-${e.id}`, () => setDefaultLegalEntity(e.id), `${e.legal_name} is now the default entity.`)}>
                          <Star size={14} aria-hidden="true" /> Make default<span className="sr-only"> {e.legal_name}</span>
                        </button>
                      )}
                      <button type="button" className={inactive ? btnGhost : btnDanger} disabled={busyKey === `st-${e.id}`}
                        onClick={() => run(`st-${e.id}`, () => setLegalEntityStatus(e.id, inactive ? "active" : "inactive"),
                          `${e.legal_name} ${inactive ? "reactivated" : "deactivated"}.`)}>
                        <Power size={14} aria-hidden="true" /> {inactive ? "Reactivate" : "Deactivate"}<span className="sr-only"> {e.legal_name}</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                    {e.country_name && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" /> {[e.city, e.region, e.country_name].filter(Boolean).join(", ")}</span>}
                    {e.registration_number && <span>{e.registration_label || "Registration"}: <span className="font-mono">{e.registration_number}</span></span>}
                    {e.tax_id && <span>Tax ID: <span className="font-mono">{e.tax_id}</span></span>}
                  </div>
                  {Array.isArray(e.address_lines) && e.address_lines.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{[...e.address_lines, e.postal_code].filter(Boolean).join(", ")}</p>
                  )}

                  {e.profile_gaps?.length > 0 && (
                    <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-semibold">Complete your entity profile</p>
                        <p>Missing: {e.profile_gaps.join(", ")}. Documents naming this employer cannot be generated until these are filled in.</p>
                      </div>
                    </div>
                  )}

                  {/* signatories */}
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Users size={15} className="text-slate-500" aria-hidden="true" />
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorised signatories ({sigs.length})</h4>
                      <button type="button" className={`${btnPrimary} ml-auto`} disabled={inactive} onClick={() => setSigModal({ entity: e, signatory: null })}>
                        <UserPlus size={14} aria-hidden="true" /> Appoint<span className="sr-only"> a signatory for {e.legal_name}</span>
                      </button>
                    </div>
                    {sigs.length === 0 ? (
                      <p className="py-2 text-sm text-slate-500">No signatories. Documents that need the employer's signature cannot be issued for this entity.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">Authorised signatories of {e.legal_name}</caption>
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                              <th scope="col" className="py-2 pr-3">Person</th>
                              <th scope="col" className="py-2 pr-3">Title</th>
                              <th scope="col" className="py-2 pr-3">Scope</th>
                              <th scope="col" className="py-2 pr-3">Max risk</th>
                              <th scope="col" className="py-2 pr-3">Valid</th>
                              <th scope="col" className="py-2 pr-3">Status</th>
                              <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sigs.map((s) => {
                              const me = isMe(s);
                              const revoked = s.status === "revoked";
                              return (
                                <tr key={s.id} className="border-b border-slate-50 align-top">
                                  <td className="py-2.5 pr-3 text-slate-800">{s.employee_name || `#${s.employee_id}`}{me && <span className="ml-1 text-xs text-slate-500">(you)</span>}</td>
                                  <td className="py-2.5 pr-3 text-slate-700">{s.signatory_title}</td>
                                  <td className="py-2.5 pr-3 text-xs text-slate-600">{(s.authority_scope || []).includes("ALL") ? "All documents" : (s.authority_scope || []).join(", ")}</td>
                                  <td className="py-2.5 pr-3 text-slate-700">{s.max_risk_level}</td>
                                  <td className="py-2.5 pr-3 text-xs text-slate-600 whitespace-nowrap">
                                    {s.valid_from ? formatDate(s.valid_from) : "—"} – {s.valid_to ? formatDate(s.valid_to) : "no end"}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    {revoked ? <Pill tone="red">Revoked</Pill> : s.in_force ? <Pill tone="green">In force</Pill> : <Pill tone="amber">Not in force (dates)</Pill>}
                                  </td>
                                  <td className="py-2.5 text-right">
                                    {me ? (
                                      <span className="text-xs text-slate-500">Another admin must change this</span>
                                    ) : !revoked && (
                                      <div className="flex justify-end gap-2">
                                        <button type="button" className={btnGhost} onClick={() => setSigModal({ entity: e, signatory: s })}>
                                          <Pencil size={13} aria-hidden="true" /> Edit<span className="sr-only"> {s.employee_name}</span>
                                        </button>
                                        <button type="button" className={btnDanger} onClick={() => setRevoking(s)}>
                                          <Ban size={13} aria-hidden="true" /> Revoke<span className="sr-only"> {s.employee_name}</span>
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* jurisdiction gaps */}
      <section className={cardCls} aria-labelledby="le-gaps">
        <h2 id="le-gaps" className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-500">Jurisdiction gaps</h2>
        <p className="mb-4 text-sm text-slate-600">Documents are chosen by where each person works. People without a work country cannot receive generated documents.</p>
        {!gaps ? (
          <div className="py-4 text-center text-slate-500">{loading ? "Loading..." : "Not available."}</div>
        ) : gaps.employees_without_work_country?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">People without a work country</caption>
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 pr-4">Person</th>
                  <th scope="col" className="py-2 pr-4">Code</th>
                  <th scope="col" className="py-2 pr-4">Country on profile</th>
                  <th scope="col" className="py-2"><span className="sr-only">Open profile</span></th>
                </tr>
              </thead>
              <tbody>
                {gaps.employees_without_work_country.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-800">{p.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{p.employee_code || "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">{p.recorded_country || "—"}</td>
                    <td className="py-2 text-right">
                      <Link to={`/zoiko-hr/employee-management/employees/${p.id}`} className="text-xs font-semibold text-[#2563EB] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        Set work country<span className="sr-only"> for {p.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 text-sm text-emerald-700"><ShieldCheck size={16} aria-hidden="true" /> Everyone has a work country.</div>
        )}
        {gaps?.entities_with_gaps?.length > 0 && (
          <p className="mt-3 text-sm text-amber-800">
            {gaps.entities_with_gaps.length} legal {gaps.entities_with_gaps.length === 1 ? "entity has" : "entities have"} an incomplete profile:{" "}
            {gaps.entities_with_gaps.map((x) => `${x.legal_name || "Unnamed"} (${(x.gaps || []).join(", ")})`).join("; ")}.
          </p>
        )}
      </section>

      {/* settings */}
      <section className={cardCls} aria-labelledby="le-settings">
        <div className="mb-3 flex items-center gap-2">
          <Settings2 size={16} className="text-slate-500" aria-hidden="true" />
          <h2 id="le-settings" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Document template settings</h2>
        </div>
        {!settings ? (
          <div className="py-4 text-slate-500">{loading ? "Loading..." : "Not available."}</div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p id="le-attest-label" className="font-semibold text-slate-800">Organization-approved templates</p>
              <p id="le-attest-desc" className="mt-1 text-sm text-slate-600">
                Lets your organization approve its own versions of templates (attesting that its legal reviewer checked them),
                instead of only using versions released by Zoiko.
              </p>
              {attestationReason && <p className="mt-2 text-sm text-amber-800">{attestationReason}</p>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.tenant_attestation_enabled}
              aria-labelledby="le-attest-label"
              aria-describedby="le-attest-desc"
              disabled={!attestationAllowed || busyKey === "attest"}
              onClick={() => run("attest", () => updateTemplateSettings({ tenant_attestation_enabled: !settings.tenant_attestation_enabled }),
                settings.tenant_attestation_enabled ? "Organization-approved templates switched off." : "Organization-approved templates switched on.")}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${settings.tenant_attestation_enabled ? "bg-[#3B82F6]" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.tenant_attestation_enabled ? "translate-x-6" : "translate-x-1"}`} />
              <span className="sr-only">{settings.tenant_attestation_enabled ? "On" : "Off"}</span>
            </button>
          </div>
        )}
      </section>

      {entityModal && (
        <EntityModal entity={entityModal.entity} countries={countries} formats={formats}
          onClose={() => setEntityModal(null)}
          onSaved={(_, msg) => { setEntityModal(null); setNotice(msg); load(); }} />
      )}
      {sigModal && (
        <SignatoryModal entity={sigModal.entity} signatory={sigModal.signatory} families={families}
          employees={employees.filter((x) => Number(x.id) !== Number(user?.id))}
          onClose={() => setSigModal(null)}
          onSaved={(msg) => { setSigModal(null); setNotice(msg); load(); }} />
      )}
      {revoking && (
        <Modal open onClose={() => setRevoking(null)} size="sm" icon={Ban} title="Revoke signing authority"
          description={`${revoking.employee_name || "This person"} · ${revoking.signatory_title}`}
          footer={<>
            <button type="button" className={modalGhost} onClick={() => setRevoking(null)}>Cancel</button>
            <button type="button" disabled={busyKey === `rev-${revoking.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
              onClick={async () => {
                const s = revoking;
                setRevoking(null);
                await run(`rev-${s.id}`, () => updateSignatory(s.id, { status: "revoked" }), `${s.employee_name || "Signatory"} can no longer sign for the employer.`);
              }}>
              Revoke
            </button>
          </>}>
          <p className="text-sm text-slate-700">They will no longer be able to approve or sign documents for this entity. Documents they already signed stay valid.</p>
        </Modal>
      )}
    </div>
  );
}
