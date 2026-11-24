import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { ChevronRight, ChevronDown, Briefcase } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignations, getDesignationSettings, updateDesignation } from "../../../service/hrService";
import { normalizeDesignationSettings, DEFAULT_DESIGNATION_SETTINGS } from "../../../utils/designationSettings";

const LEVEL_META = {
  L1: { label: "Entry Level", desc: "Interns, trainees, and junior staff" },
  L2: { label: "Junior", desc: "Associates and junior specialists" },
  L3: { label: "Mid-Level", desc: "Experienced professionals" },
  L4: { label: "Senior", desc: "Senior specialists and leads" },
  L5: { label: "Manager", desc: "Team leads and department managers" },
  L6: { label: "Senior Manager", desc: "Senior managers and directors" },
  L7: { label: "Director", desc: "Directors and senior directors" },
  L8: { label: "VP", desc: "Vice presidents" },
  L9: { label: "SVP", desc: "Senior vice presidents" },
  L10: { label: "C-Level", desc: "C-suite executives" },
};
const NO_LEVEL = "none";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

/** "l3", " L3 ", "3" → "L3"; empty → null; anything else is kept as typed (upper case). */
export function normalizeLevel(level) {
  const s = String(level ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return `L${Number(s)}`;
  const m = s.match(/^L\s*0*(\d+)$/);
  return m ? `L${Number(m[1])}` : s;
}

/** Every level up to the organization's maximum depth (empty ones too), any other level in use, then "No level yet". */
export function groupByLevel(records, maxDepth) {
  const levels = Array.from({ length: maxDepth }, (_, i) => `L${i + 1}`);
  const byLevel = new Map(levels.map((l) => [l, []]));
  const none = [];
  for (const r of records) {
    const l = normalizeLevel(r.level);
    if (!l) { none.push(r); continue; }
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(r);
  }
  const num = (l) => (/^L\d+$/.test(l) ? Number(l.slice(1)) : 999);
  const groups = [...byLevel.entries()].sort((a, b) => num(a[0]) - num(b[0]) || a[0].localeCompare(b[0]))
    .map(([level, items]) => ({ level, items, beyond: num(level) > maxDepth }));
  return [...groups, { level: NO_LEVEL, items: none, beyond: false }];
}

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/designations"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function LevelNode({ level, items, beyond, selected, onSelect }) {
  const [expanded, setExpanded] = useState(items.length > 0);
  const isNone = level === NO_LEVEL;
  const meta = LEVEL_META[level];
  const name = isNone ? "No level yet" : meta?.label || level;
  const desc = isNone ? "Give these a level so they sit in the hierarchy" : beyond ? "Above the maximum depth in Settings" : meta?.desc;

  return (
    <div className="select-none">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-blue-50 ${isNone ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white"}`}>
        <span className="text-gray-400 w-4 h-4 flex items-center justify-center" aria-hidden="true">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        {!isNone && <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">{level}</span>}
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-gray-900">{name}</span>
          {desc && <span className="ml-2 text-xs text-gray-400">{desc}</span>}
        </span>
        <span className="shrink-0 text-xs text-gray-400">{items.length} {items.length === 1 ? "designation" : "designations"}</span>
      </button>
      {expanded && items.length === 0 && <p className="ml-10 mt-1 text-xs text-gray-400">No designations at this level yet.</p>}
      {expanded && items.map((item) => (
        <button type="button" key={item.id} onClick={() => onSelect(item)} aria-pressed={selected?.id === item.id}
          className={`ml-6 mt-0.5 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
            selected?.id === item.id ? "border-blue-200 bg-blue-50" : "border-transparent hover:bg-gray-50"
          }`}>
          <span className="rounded-lg bg-gray-100 p-1.5"><Briefcase className="h-4 w-4 text-gray-500" aria-hidden="true" /></span>
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <span className="font-medium text-gray-800">{item.title}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{item.status}</span>
          </span>
          <span className="text-xs text-gray-400">{item.employees_count || 0} {item.employees_count === 1 ? "person" : "people"}</span>
        </button>
      ))}
    </div>
  );
}

function DetailPanel({ item, maxDepth, onSaved }) {
  const current = normalizeLevel(item.level) || "";
  const [level, setLevel] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const options = Array.from({ length: maxDepth }, (_, i) => `L${i + 1}`);
  if (current && !options.includes(current)) options.push(current);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateDesignation(item.id, { level: level || null });
      setMsg({ type: "success", text: "Level saved." });
      onSaved({ ...item, level: level || null });
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "The level was not saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Designation details" className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-500">Department</dt><dd className="text-gray-900">{item.department_name || "—"}</dd>
        <dt className="text-gray-500">People</dt><dd className="text-gray-900">{item.employees_count || 0}</dd>
        <dt className="text-gray-500">Status</dt><dd className="capitalize text-gray-900">{item.status}</dd>
      </dl>
      <label htmlFor="structure-level" className="block text-sm font-medium text-gray-700">Level</label>
      <div className="flex gap-2">
        <select id="structure-level" value={level} onChange={(e) => setLevel(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          <option value="">No level yet</option>
          {options.map((l) => <option key={l} value={l}>{l}{LEVEL_META[l] ? ` · ${LEVEL_META[l].label}` : ""}</option>)}
        </select>
        <button type="button" onClick={save} disabled={busy || level === current}
          className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">{busy ? "Saving..." : "Save"}</button>
      </div>
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`text-sm ${msg.type === "error" ? "text-red-700" : "text-green-700"}`}>{msg.text}</p>}
      <NavLink to="/zoiko-hr/designations/list" className="inline-block text-sm text-blue-600 hover:underline">Assign people from the Designation List</NavLink>
    </aside>
  );
}

export default function DesignationStructure() {
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_DESIGNATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return Promise.all([
      getDesignations(),
      getDesignationSettings().then(normalizeDesignationSettings).catch(() => null),
    ])
      .then(([res, s]) => {
        setRecords(Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []));
        if (s) setSettings(s);
      })
      .catch((e) => setError(e?.message || "The designations could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const maxDepth = settings.max_hierarchy_depth || 10;
  const grouped = useMemo(() => groupByLevel(records, maxDepth), [records, maxDepth]);
  const saved = (item) => {
    setRecords((rs) => rs.map((r) => (r.id === item.id ? { ...r, level: item.level } : r)));
    setSelected(item);
  };

  return (
    <HRPage title="Designation Structure" subtitle="Organizational hierarchy and designation relationships">
      <SubNav />
      {loading ? (
        <div className="flex justify-center items-center py-20" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading hierarchy...</span>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Levels</h2>
              <span className="text-xs text-gray-400">{records.length} designations · {maxDepth} levels</span>
            </div>
            <div className="space-y-2">
              {grouped.map((g) => (
                <LevelNode key={g.level} level={g.level} items={g.items} beyond={g.beyond} selected={selected} onSelect={setSelected} />
              ))}
            </div>
          </div>
          {selected ? (
            <DetailPanel key={selected.id} item={selected} maxDepth={maxDepth} onSaved={saved} />
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">Pick a designation to see its details or change its level.</p>
          )}
        </div>
      )}
    </HRPage>
  );
}
