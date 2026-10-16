// Pay for a person, wherever it is recorded: what kind of pay (salary / stipend / fee), how much, in which currency and
// per what period. The currency follows the work country until someone picks one by hand.
import { useEffect, useState } from "react";
import { getRegions } from "../service/hrService";
import { REMUNERATION_TYPES, PAY_PERIODS, currencySymbol } from "../utils/money";

const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white";
const labelCls = "text-xs text-gray-500 font-medium";

export function useRegions() {
  const [regions, setRegions] = useState(null);
  useEffect(() => {
    let alive = true;
    getRegions().then((r) => alive && setRegions(r)).catch(() => alive && setRegions({ countries: [], currencies: [], organization: { currency: "USD" } }));
    return () => { alive = false; };
  }, []);
  return regions;
}

export function currencyForCountry(regions, code) {
  return regions?.countries?.find((c) => c.code === code)?.currency || null;
}

/** Best-effort country code from free text such as "Pune, India" or "UK" (same idea as the server's matcher). */
export function guessCountry(regions, text) {
  if (!regions || !text) return null;
  const low = String(text).toLowerCase();
  const parts = low.split(/[,/|()-]/).map((p) => p.trim()).filter(Boolean).reverse();
  const aliases = { usa: "US", "u.s.": "US", us: "US", uk: "GB", "u.k.": "GB", england: "GB", uae: "AE", dubai: "AE", bangalore: "IN", bengaluru: "IN", mumbai: "IN", delhi: "IN", hyderabad: "IN", chennai: "IN", pune: "IN", london: "GB" };
  for (const p of parts) {
    if (p.length === 2 && regions.countries.some((c) => c.code === p.toUpperCase())) return p.toUpperCase();
    const byName = regions.countries.find((c) => c.name.toLowerCase() === p);
    if (byName) return byName.code;
    if (aliases[p]) return aliases[p];
  }
  const hit = [...regions.countries].sort((a, b) => b.name.length - a.name.length).find((c) => low.includes(c.name.toLowerCase()));
  return hit?.code || null;
}

export function CountrySelect({ regions, value, onChange, placeholder = "Select country", className = field, id }) {
  return (
    <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={className}>
      <option value="">{placeholder}</option>
      {(regions?.countries || []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  );
}

export function CurrencySelect({ regions, value, onChange, className = field, id }) {
  const list = regions?.currencies || [];
  const known = list.some((c) => c.code === value);
  return (
    <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} className={className}>
      {!known && value && <option value={value}>{value}</option>}
      {list.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
    </select>
  );
}

/**
 * value: { remuneration_type, amount, currency, pay_period }
 * lockedType: when set (e.g. "stipend" for an internship) the type cannot be changed.
 */
export default function RemunerationFields({ regions, value, onChange, lockedType, currencyHint }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const type = lockedType || value.remuneration_type || "salary";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="rem-type">Remuneration type</label>
          <select id="rem-type" value={type} disabled={!!lockedType}
            onChange={(e) => set({ remuneration_type: e.target.value })} className={`${field} disabled:bg-gray-50`}>
            {REMUNERATION_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {lockedType === "stipend" && <p className="mt-1 text-xs text-gray-400">Internships are paid a stipend, not a salary.</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="rem-period">Paid</label>
          <select id="rem-period" value={value.pay_period || ""} onChange={(e) => set({ pay_period: e.target.value })} className={field}>
            {PAY_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-3">
          <label className={labelCls} htmlFor="rem-amount">{REMUNERATION_TYPES.find((r) => r.value === type)?.label} amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{currencySymbol(value.currency || "USD")}</span>
            <input id="rem-amount" type="number" min="0" step="0.01" inputMode="decimal" value={value.amount ?? ""}
              onChange={(e) => set({ amount: e.target.value })}
              className={`${field} pl-10`} placeholder="0" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="rem-currency">Currency</label>
          <CurrencySelect id="rem-currency" regions={regions} value={value.currency} onChange={(c) => set({ currency: c, currencyTouched: true })} />
          {currencyHint && <p className="mt-1 text-xs text-gray-400">{currencyHint}</p>}
        </div>
      </div>
    </div>
  );
}
