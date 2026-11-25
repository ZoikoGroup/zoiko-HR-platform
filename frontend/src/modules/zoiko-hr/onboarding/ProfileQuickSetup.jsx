/*
 * Onboarding › Settings › Engagement and role profiles — quick setup (Lennox, 25 Nov 2026):
 * - "Sectors we operate in": pick one or more; they decide which role titles are suggested below.
 * - "Employment categories": full-time / part-time permanent employees, full-time / part-time Associates (interns),
 *   contractors / consultants. Ticking one adds a ready engagement profile, which the notice-period rules and offers then list.
 * - "Suggested roles": the usual roles of the chosen sectors; ticking adds a role profile with that title.
 */
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Layers, Loader2, Plus, Save, UserPlus } from "lucide-react";
import { addEngagementCategories, addSuggestedRoles, saveCompanySectors } from "../../../service/hrService";

const chip = (on) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 ${
    on ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
  }`;

function Card({ icon: Icon, title, hint, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon className="h-4 w-4 text-blue-600" aria-hidden="true" />{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export default function ProfileQuickSetup({ data, onData, onMessage, busy, setBusy }) {
  const [sectors, setSectors] = useState(data.sectors || []);
  const [cats, setCats] = useState([]);
  const [roles, setRoles] = useState([]);
  useEffect(() => { setSectors(data.sectors || []); }, [data.sectors]);

  const haveCategory = useMemo(() => {
    const profiles = data.engagement_profiles || [];
    return new Set((data.employment_categories || [])
      .filter((c) => profiles.some((p) => p.category === c.key || p.slug === c.slug)).map((c) => c.key));
  }, [data]);
  const sectorsChanged = [...sectors].sort().join() !== [...(data.sectors || [])].sort().join();
  const openRoles = (data.suggested_roles || []).filter((r) => !r.added);

  const run = async (fn, ok) => {
    setBusy(true);
    onMessage(null);
    try {
      onData(await fn());
      onMessage({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      onMessage({ tone: "error", text: e?.message || "The change could not be saved." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card icon={Building2} title="Sectors we operate in" hint="Choose every sector your company works in. They decide the roles suggested below.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sectors we operate in">
          {(data.sector_options || []).map((s) => {
            const on = sectors.includes(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={on} className={chip(on)} onClick={() => setSectors((l) => toggle(l, s.key))}>
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{s.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">{sectors.length ? `${sectors.length} selected` : "None selected yet"}</p>
          <button type="button" disabled={busy || !sectorsChanged}
            onClick={() => run(() => saveCompanySectors(sectors), "Sectors saved. The suggested roles are updated.")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> Save sectors
          </button>
        </div>
      </Card>

      <Card icon={Layers} title="Employment categories" hint="The kinds of people you engage. Each one you add becomes an engagement profile, listed in notice period rules and offers.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data.employment_categories || []).map((c) => {
            const added = haveCategory.has(c.key);
            return (
              <li key={c.key}>
                <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${added ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-800"}`}>
                  <input type="checkbox" className="rounded border-gray-300" disabled={added || busy}
                    checked={added || cats.includes(c.key)} onChange={() => setCats((l) => toggle(l, c.key))} />
                  <span className="min-w-0 flex-1">{c.label}</span>
                  {added && <span className="text-xs font-semibold">Added</span>}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={busy || cats.length === 0}
            onClick={async () => { if (await run(() => addEngagementCategories(cats), "Engagement profiles added. Edit any of them below to adjust the wording.")) setCats([]); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add selected categories
          </button>
        </div>
      </Card>

      <Card icon={UserPlus} title="Suggested roles"
        hint={(data.sectors || []).length ? "Usual roles in your sectors. Tick the ones you hire for to add a role profile; then fill in its duties and KPIs."
          : "Choose your sectors above to see the roles usually hired in them. Roles every company hires are listed already."}>
        {openRoles.length === 0 ? (
          <p className="text-sm text-gray-500">Every suggested role already has a role profile.</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested roles">
            {openRoles.map((r) => {
              const on = roles.includes(r.title);
              return (
                <button key={r.title} type="button" aria-pressed={on} className={chip(on)} onClick={() => setRoles((l) => toggle(l, r.title))}>
                  {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{r.title}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={busy || roles.length === 0}
            onClick={async () => { if (await run(() => addSuggestedRoles(roles), "Role profiles added. Open each one to add its duties and KPIs.")) setRoles([]); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add {roles.length || ""} selected role{roles.length === 1 ? "" : "s"}
          </button>
        </div>
      </Card>
    </div>
  );
}
