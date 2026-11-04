// A contracting / employing business, entered the way its country does it. Pick the country and the form changes:
// which number identifies the business there (GSTIN · CIN · PAN in India, EIN in the US, Company number · VAT in the
// UK, ABN · ACN in Australia, TRN in the UAE, UEN in Singapore, VAT in the EU...), its format and example, whether a
// public register can look it up (EU VIES, UK Companies House, Australia ABN Lookup, Norway's register), and how the
// address is written (State / Province / Emirate, PIN code / ZIP / Postcode, the list of states).
// The server checks the same rules (app/core/business_ids.py).
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { getBusinessFormats, lookupBusiness } from "../service/hrService";
import { CountrySelect } from "./RemunerationFields";

const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white";
const labelCls = "text-xs text-gray-500 font-medium";
const REGISTER_NAMES = { vies: "EU VIES", companies_house: "Companies House", abn: "ABN Lookup", brreg: "Brønnøysund register" };

export function useBusinessFormats() {
  const [formats, setFormats] = useState(null);
  useEffect(() => {
    let alive = true;
    getBusinessFormats().then((f) => alive && setFormats(f)).catch(() => alive && setFormats({ countries: {}, default: null }));
    return () => { alive = false; };
  }, []);
  return formats;
}

const clean = (v) => String(v || "").replace(/[\s.\-/]/g, "").toUpperCase();

/** The same check the server makes (format only; check digits are verified on save). Null when fine. */
export function checkBusinessId(fmt, idType, value, country) {
  if (!value || !idType) return null;
  let v = clean(value);
  if (idType.key === "vat" && country) {
    const prefix = country === "GR" ? "EL" : country;
    if (v.startsWith(prefix)) v = v.slice(prefix.length);
  }
  try {
    if (!new RegExp(idType.pattern).test(v)) return `That doesn't look like a valid ${idType.label}. ${idType.hint}`;
  } catch { /* an unusual pattern: let the server decide */ }
  return null;
}

export function checkPostal(fmt, value) {
  if (!value || !fmt?.postal_pattern) return null;
  try {
    if (!new RegExp(fmt.postal_pattern).test(String(value).trim().toUpperCase())) {
      return `Enter a valid ${fmt.postal_label}${fmt.postal_placeholder ? ` (e.g. ${fmt.postal_placeholder})` : ""}.`;
    }
  } catch { /* let the server decide */ }
  return null;
}

/**
 * value: { entity_country, entity_id_type, entity_tax_id, entity_name, entity_address, entity_city, entity_region, entity_postal_code }
 */
export default function BusinessLookupFields({ regions, value, onChange }) {
  const formats = useBusinessFormats();
  const [state, setState] = useState({ busy: false, message: null, tone: null });
  const set = (patch) => onChange({ ...value, ...patch });

  const country = value.entity_country || "";
  const fmt = useMemo(() => (formats ? formats.countries?.[country] || formats.default : null), [formats, country]);
  const idTypes = fmt?.ids || [];
  const idType = idTypes.find((t) => t.key === value.entity_id_type) || idTypes[0] || null;
  const idProblem = checkBusinessId(fmt, idType, value.entity_tax_id, country);
  const postalProblem = checkPostal(fmt, value.entity_postal_code);
  const regionList = fmt?.regions || null;

  // a new country brings its own default ID type and a fresh region
  const changeCountry = (c) => {
    const next = formats?.countries?.[c] || formats?.default;
    onChange({
      ...value,
      entity_country: c,
      entity_id_type: next?.ids?.[0]?.key || null,
      entity_region: next?.regions?.includes(value.entity_region) ? value.entity_region : "",
    });
    setState({ busy: false, message: null, tone: null });
  };

  const lookup = async () => {
    if (!country || !(value.entity_tax_id || "").trim()) {
      setState({ busy: false, tone: "warn", message: "Choose the country and enter the number first." });
      return;
    }
    if (idProblem) {
      setState({ busy: false, tone: "warn", message: idProblem });
      return;
    }
    setState({ busy: true, message: null, tone: null });
    try {
      const r = await lookupBusiness(country, value.entity_tax_id.trim(), idType?.key);
      if (!r.supported) {
        setState({ busy: false, tone: "info", message: r.message });
      } else if (!r.valid) {
        setState({ busy: false, tone: "warn", message: `${r.source}: this number is not registered or not active.` });
      } else {
        const lines = (r.address_lines || []).filter(Boolean);
        onChange({
          ...value,
          entity_tax_id: r.number || value.entity_tax_id,
          entity_name: r.legal_name || value.entity_name,
          // a structured answer fills each field; a one-line answer (VIES) goes in the street address
          entity_address: lines.length ? lines.join(", ") : r.address || value.entity_address,
          entity_city: r.city || value.entity_city,
          entity_postal_code: r.postcode || value.entity_postal_code,
          entity_region: r.region && (!regionList || regionList.includes(r.region)) ? r.region : value.entity_region,
        });
        setState({ busy: false, tone: "ok", message: `Verified with ${r.source}.${r.address ? "" : " The register does not publish an address for this number."}` });
      }
    } catch (e) {
      setState({ busy: false, tone: "warn", message: e.message || "The lookup failed. Enter the details manually." });
    }
  };

  const tone = { ok: "text-green-700", warn: "text-amber-700", info: "text-gray-500" }[state.tone] || "text-gray-500";
  const ToneIcon = state.tone === "ok" ? CheckCircle2 : state.tone === "info" ? Info : AlertTriangle;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Registered in</label>
          <CountrySelect regions={regions} value={country} onChange={changeCountry} />
        </div>
        <div>
          <label className={labelCls}>Identifier</label>
          <select value={idType?.key || ""} disabled={!country || idTypes.length < 2}
            onChange={(e) => { set({ entity_id_type: e.target.value }); setState({ busy: false, message: null, tone: null }); }}
            className={`${field} disabled:bg-gray-50`}>
            {!country && <option value="">Choose a country first</option>}
            {idTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {country && idType && (
        <div>
          <label className={labelCls}>{idType.label}</label>
          <div className="flex min-w-0 gap-2">
            <input value={value.entity_tax_id || ""} onChange={(e) => set({ entity_tax_id: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && idType.lookup) { e.preventDefault(); lookup(); } }}
              aria-invalid={!!idProblem}
              className={`${field} min-w-0 font-mono ${idProblem ? "border-amber-400" : ""}`} placeholder={idType.placeholder || ""} maxLength={40} />
            {idType.lookup && (
              <button type="button" onClick={lookup} disabled={state.busy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                title={`Look up in ${REGISTER_NAMES[idType.lookup] || "the public register"}`}>
                {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
              </button>
            )}
          </div>
          {idProblem && value.entity_tax_id
            ? <p className="mt-1 text-xs text-amber-700">{idProblem}</p>
            : <p className="mt-1 text-xs text-gray-400">
                {idType.hint}{idType.lookup ? ` Verified against ${REGISTER_NAMES[idType.lookup] || "the public register"}.` : " No public register to check against: enter the details below."}
              </p>}
        </div>
      )}
      {state.message && (
        <p className={`flex items-center gap-1.5 break-words text-xs ${tone}`}><ToneIcon className="h-3.5 w-3.5 shrink-0" /> {state.message}</p>
      )}

      <div>
        <label className={labelCls}>Legal name</label>
        <input value={value.entity_name || ""} onChange={(e) => set({ entity_name: e.target.value })} className={field} maxLength={200} />
      </div>
      <div>
        <label className={labelCls}>Street address</label>
        <textarea value={value.entity_address || ""} onChange={(e) => set({ entity_address: e.target.value })} className={field} rows={2} maxLength={1000}
          placeholder="Building, street, area" />
      </div>
      <div className={`grid grid-cols-1 gap-3 ${fmt?.region_label ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div>
          <label className={labelCls}>City</label>
          <input value={value.entity_city || ""} onChange={(e) => set({ entity_city: e.target.value })} className={field} maxLength={120} />
        </div>
        {fmt?.region_label && (
          <div>
            <label className={labelCls}>{fmt.region_label}</label>
            {regionList ? (
              <select value={value.entity_region || ""} onChange={(e) => set({ entity_region: e.target.value })} className={field}>
                <option value="">Select…</option>
                {regionList.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <input value={value.entity_region || ""} onChange={(e) => set({ entity_region: e.target.value })} className={field} maxLength={120} />
            )}
          </div>
        )}
        <div>
          <label className={labelCls}>{fmt?.postal_label || "Postal code"}</label>
          <input value={value.entity_postal_code || ""} onChange={(e) => set({ entity_postal_code: e.target.value })}
            aria-invalid={!!postalProblem} placeholder={fmt?.postal_placeholder || ""}
            className={`${field} ${postalProblem ? "border-amber-400" : ""}`} maxLength={20} />
          {postalProblem && <p className="mt-1 text-xs text-amber-700">{postalProblem}</p>}
        </div>
      </div>
    </div>
  );
}
