import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  ChevronRight,
  ChevronDown,
  Briefcase,
  Layers,
  Search,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Users,
  ShieldCheck,
  X,
  ExternalLink,
} from "lucide-react";
import DesignationLayout, { notifyDesignationsUpdated } from "./DesignationLayout";
import { getDesignations, getDesignationSettings, updateDesignation } from "../../../service/hrService";
import { normalizeDesignationSettings, DEFAULT_DESIGNATION_SETTINGS } from "../../../utils/designationSettings";

export const LEVEL_META = {
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
export const NO_LEVEL = "none";

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
    if (!l) {
      none.push(r);
      continue;
    }
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(r);
  }
  const num = (l) => (/^L\d+$/.test(l) ? Number(l.slice(1)) : 999);
  const groups = [...byLevel.entries()]
    .sort((a, b) => num(a[0]) - num(b[0]) || a[0].localeCompare(b[0]))
    .map(([level, items]) => ({ level, items, beyond: num(level) > maxDepth }));
  return [...groups, { level: NO_LEVEL, items: none, beyond: false }];
}

function LevelNode({ level, items, beyond, selected, onSelect, expanded, onToggle }) {
  const isNone = level === NO_LEVEL;
  const meta = LEVEL_META[level];
  const name = isNone ? "No level yet" : meta?.label || level;
  const desc = isNone
    ? "Give these a level so they sit in the hierarchy"
    : beyond
    ? "Above the maximum depth in Settings"
    : meta?.desc;

  return (
    <div className="select-none mb-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all shadow-2xs hover:shadow-xs ${
          isNone
            ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
            : "border-gray-200/90 bg-white hover:bg-slate-50/80"
        }`}
      >
        <span className="text-gray-400 w-5 h-5 flex items-center justify-center shrink-0" aria-hidden="true">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </span>
        {!isNone && (
          <span className="inline-flex items-center rounded-lg bg-blue-100 text-blue-800 px-2.5 py-1 text-xs font-bold font-mono">
            {level}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="font-bold text-gray-900 text-sm">{name}</span>
          {desc && <span className="ml-2 text-xs text-gray-400 font-medium">{desc}</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          {items.length} {items.length === 1 ? "designation" : "designations"}
        </span>
      </button>

      {expanded && items.length === 0 && (
        <p className="ml-12 my-2 text-xs text-gray-400 italic">No designations at this level yet.</p>
      )}

      {expanded && items.length > 0 && (
        <div className="ml-6 mt-1.5 space-y-1.5 pl-3 border-l-2 border-blue-100/80">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelect(item)}
              aria-pressed={selected?.id === item.id}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                selected?.id === item.id
                  ? "border-blue-400 bg-blue-50/90 shadow-2xs ring-2 ring-blue-500/10"
                  : "border-gray-200/70 bg-white hover:bg-slate-50/80 shadow-2xs"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="rounded-lg bg-slate-100 p-1.5 text-slate-600 shrink-0">
                  <Briefcase className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-semibold text-gray-900 text-sm truncate">{item.title}</span>
                {item.department_name && (
                  <span className="text-xs text-gray-400 truncate max-w-[140px]">· {item.department_name}</span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                    item.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {item.status || "active"}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-500 shrink-0">
                {item.employees_count || 0} {item.employees_count === 1 ? "person" : "people"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ item, maxDepth, onSaved, onClose }) {
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
      notifyDesignationsUpdated();
      onSaved({ ...item, level: level || null });
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "The level was not saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="complementary"
      aria-label="Designation details"
      className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-sm space-y-4"
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
        <div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
            {current || "No level"}
          </span>
          <h3 className="text-base font-bold text-gray-900 mt-1.5">{item.title}</h3>
          {item.department_name && <p className="text-xs text-gray-500 mt-0.5">{item.department_name}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={16} />
          </button>
        )}
      </div>

      {msg && (
        <div
          role={msg.type === "error" ? "alert" : "status"}
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            msg.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          {msg.type === "error" ? <AlertCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div>
        <label htmlFor="designation-level-select" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
          Seniority Level
        </label>
        <select
          id="designation-level-select"
          aria-label="Level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 shadow-xs"
        >
          <option value="">No level</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt} {LEVEL_META[opt] ? `— ${LEVEL_META[opt].label}` : ""}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">
          {level && LEVEL_META[level] ? LEVEL_META[level].desc : "Assign a seniority tier to place in the matrix."}
        </p>
      </div>

      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        <NavLink
          to="/zoiko-hr/designations/list"
          className="text-xs font-semibold text-gray-500 hover:text-blue-600 flex items-center gap-1"
        >
          <span>Open in list</span>
          <ExternalLink size={12} />
        </NavLink>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function DesignationStructure() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [maxDepth, setMaxDepth] = useState(10);
  const [search, setSearch] = useState("");
  const [expandedLevels, setExpandedLevels] = useState(new Set());
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [desigRes, settRes] = await Promise.all([
        getDesignations(),
        typeof getDesignationSettings === "function" ? getDesignationSettings().catch(() => ({})) : Promise.resolve({}),
      ]);
      const data = desigRes?.data?.data ?? desigRes?.data?.items ?? desigRes?.data ?? desigRes?.items ?? desigRes ?? [];
      const list = Array.isArray(data) ? data : [];
      setRecords(list);
      const s = normalizeDesignationSettings(settRes);
      setMaxDepth(s.max_hierarchy_depth || 10);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load designation matrix.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        r.title?.toLowerCase().includes(q) ||
        r.department_name?.toLowerCase().includes(q) ||
        r.level?.toLowerCase().includes(q)
    );
  }, [records, search]);

  const groups = useMemo(() => {
    return groupByLevel(filteredRecords, maxDepth);
  }, [filteredRecords, maxDepth]);

  useEffect(() => {
    if (groups.length > 0 && expandedLevels.size === 0) {
      const initial = new Set(groups.filter((g) => g.items.length > 0).map((g) => g.level));
      setExpandedLevels(initial);
    }
  }, [groups]);

  const toggleLevel = (lvl) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedLevels(new Set(groups.map((g) => g.level)));
  };

  const handleCollapseAll = () => {
    setExpandedLevels(new Set());
  };

  const handleSaved = (updatedItem) => {
    setRecords((prev) => prev.map((r) => (r.id === updatedItem.id ? updatedItem : r)));
    setSelected(updatedItem);
  };

  return (
    <DesignationLayout
      title="Level Matrix & Structure"
      subtitle="Comprehensive organizational seniority levels, reporting ladders, and role stratification"
      lastUpdated={lastUpdated}
      isRefreshing={loading}
      onRefresh={load}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
          >
            <Maximize2 size={13} />
            <span>Expand All</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
          >
            <Minimize2 size={13} />
            <span>Collapse All</span>
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Search designations, departments, levels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50/80 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="text-xs font-semibold text-gray-500">
          Showing <strong className="text-gray-900">{filteredRecords.length}</strong> designations across {groups.length} level tiers
        </div>
      </div>

      {/* Main Grid: Level Tree Column + Detail Inspector Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={selected ? "lg:col-span-8" : "lg:col-span-12"}>
          {loading && records.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">Loading seniority matrix...</div>
          ) : error && records.length === 0 ? (
            <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-medium">
              {error}
            </div>
          ) : (
            <div className="space-y-1">
              {groups.map((g) => (
                <LevelNode
                  key={g.level}
                  level={g.level}
                  items={g.items}
                  beyond={g.beyond}
                  selected={selected}
                  onSelect={setSelected}
                  expanded={expandedLevels.has(g.level)}
                  onToggle={() => toggleLevel(g.level)}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="lg:col-span-4 sticky top-6">
            <DetailPanel
              key={selected.id}
              item={selected}
              maxDepth={maxDepth}
              onSaved={handleSaved}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>
    </DesignationLayout>
  );
}
