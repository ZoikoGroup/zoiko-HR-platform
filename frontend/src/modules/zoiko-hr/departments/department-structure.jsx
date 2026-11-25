import { useState, useMemo, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  Users,
  CircleDollarSign,
  Calendar,
  UserCheck,
  ChevronRight,
  ChevronDown,
  Search,
  GitBranch,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  FolderTree,
  X,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import DepartmentLayout, { useDepartmentData } from "./DepartmentLayout";
const formatNumber = (n) => (n == null || !Number.isFinite(Number(n)) ? "0" : Number(n).toLocaleString());

function TreeNode({
  node,
  allDepts,
  depth = 0,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
  searchQuery = "",
  matchedIds,
}) {
  const children = useMemo(
    () => allDepts.filter((d) => d.parent_id === node.id),
    [allDepts, node.id]
  );
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isMatched = matchedIds ? matchedIds.has(node.id) : false;

  const budget = Number(node.budget) || 0;
  const spent = Number(node.spent_budget) || 0;
  const utilPct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 999) : 0;
  const isOver = budget > 0 && spent > budget;

  return (
    <div className="relative select-none">
      {/* Branch Node Card */}
      <div
        onClick={() => onSelect(node)}
        className={`group relative flex items-center justify-between gap-3 p-3 my-1.5 rounded-xl border transition-all cursor-pointer ${
          isSelected
            ? "bg-rose-50/90 border-rose-300 ring-2 ring-rose-500/20 shadow-xs"
            : isMatched
            ? "bg-amber-50/60 border-amber-300 shadow-2xs"
            : "bg-white border-gray-200/80 hover:bg-slate-50/80 hover:border-gray-300 shadow-2xs"
        }`}
        style={{ marginLeft: `${Math.min(depth * 28, 140)}px` }}
      >
        {/* Left: Expansion handle + Icon + Name + Badges */}
        <div className="flex items-center gap-2.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0 transition-colors"
              title={isExpanded ? "Collapse sub-units" : "Expand sub-units"}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            </div>
          )}

          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
              isSelected
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-700 border border-slate-200"
            }`}
          >
            {node.code ? node.code.slice(0, 3) : node.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-semibold truncate ${
                  isSelected ? "text-rose-950 font-bold" : "text-gray-900"
                }`}
              >
                {node.name}
              </span>
              <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-gray-100 text-gray-700">
                {node.code}
              </span>
              {!node.is_active && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-200 text-gray-600">
                  Inactive
                </span>
              )}
            </div>
            {hasChildren && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {children.length} direct sub-unit{children.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Right: Quick metrics (Head, staff count, budget) */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 text-xs">
          {(node.head_name || node.head) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-100/60 max-w-[140px] truncate">
              <UserCheck size={11} className="shrink-0" />
              <span className="truncate">{node.head_name || node.head}</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
            <Users size={11} className="shrink-0 text-slate-500" />
            {node.employee_count || 0}
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
              isOver
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <CircleDollarSign size={11} className="shrink-0" />
            {formatNumber(budget)}
          </span>
        </div>
      </div>

      {/* Children branches */}
      {hasChildren && isExpanded && (
        <div className="relative pl-3 border-l-2 border-gray-200/80 ml-4 space-y-1">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              allDepts={allDepts}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              searchQuery={searchQuery}
              matchedIds={matchedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DepartmentStructure() {
  const {
    departments: records,
    loading: isLoading,
    refresh: fetchRecords,
    lastUpdated,
    isRefreshing,
  } = useDepartmentData({ autoPoll: true });

  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Build parent and child maps
  const { deptMap, rootDepts, childMap } = useMemo(() => {
    const map = new Map();
    const children = new Map();
    const roots = [];

    records.forEach((d) => {
      map.set(d.id, d);
      if (!d.parent_id) {
        roots.push(d);
      } else {
        const list = children.get(d.parent_id) || [];
        list.push(d);
        children.set(d.parent_id, list);
      }
    });

    return { deptMap: map, rootDepts: roots, childMap: children };
  }, [records]);

  // Initially auto-expand root departments when data loads
  useEffect(() => {
    if (records.length > 0 && expandedIds.size === 0) {
      const initial = new Set(rootDepts.map((d) => d.id));
      setExpandedIds(initial);
      if (!selectedDeptId && rootDepts.length > 0) {
        setSelectedDeptId(rootDepts[0].id);
      }
    }
  }, [records, rootDepts]);

  // Search filtering & ancestor auto-expansion
  const matchedIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matches = new Set();
    const autoExpand = new Set(expandedIds);

    records.forEach((d) => {
      const hit =
        d.name?.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q) ||
        (d.head_name || d.head)?.toLowerCase().includes(q);

      if (hit) {
        matches.add(d.id);
        // Expand all ancestors
        let curr = d.parent_id ? deptMap.get(d.parent_id) : null;
        while (curr) {
          autoExpand.add(curr.id);
          curr = curr.parent_id ? deptMap.get(curr.parent_id) : null;
        }
      }
    });

    if (autoExpand.size !== expandedIds.size) {
      setExpandedIds(autoExpand);
    }

    return matches;
  }, [search, records, deptMap]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set(records.map((d) => d.id));
    setExpandedIds(all);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const selectedDept = selectedDeptId ? deptMap.get(selectedDeptId) : null;

  // Compute breadcrumb path for selected item
  const breadcrumbTrail = useMemo(() => {
    if (!selectedDept) return [];
    const trail = [selectedDept];
    let curr = selectedDept.parent_id ? deptMap.get(selectedDept.parent_id) : null;
    while (curr) {
      trail.unshift(curr);
      curr = curr.parent_id ? deptMap.get(curr.parent_id) : null;
    }
    return trail;
  }, [selectedDept, deptMap]);

  // Selected unit's direct sub-units
  const selectedChildren = useMemo(() => {
    if (!selectedDept) return [];
    return childMap.get(selectedDept.id) || [];
  }, [selectedDept, childMap]);

  // Overall structure stats
  const structureStats = useMemo(() => {
    const total = records.length;
    const roots = rootDepts.length;
    const subs = total - roots;
    const withHeads = records.filter((d) => d.head_name || d.head).length;
    const leadershipPct = total > 0 ? Math.round((withHeads / total) * 100) : 0;
    return { total, roots, subs, leadershipPct };
  }, [records, rootDepts]);

  return (
    <DepartmentLayout
      title="Department Hierarchy"
      subtitle="Interactive organizational structure, functional parent-child reporting pathways, and unit governance"
      lastUpdated={lastUpdated}
      isRefreshing={isRefreshing}
      onRefresh={fetchRecords}
      actions={
        <NavLink
          to="/zoiko-hr/departments/list"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-colors"
        >
          <Building2 size={14} />
          <span>Manage in Directory</span>
        </NavLink>
      }
    >
      {/* Structural Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <Building2 size={14} className="text-rose-500" />
            <span>Total Units</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {structureStats.total}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <GitBranch size={14} className="text-blue-500" />
            <span>Root Entities</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {structureStats.roots}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <Layers size={14} className="text-amber-500" />
            <span>Sub-Units</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {structureStats.subs}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Head Coverage</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {structureStats.leadershipPct}%
          </p>
        </div>
      </div>

      {/* Main Grid: Tree Column (Left) + Selected Unit Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tree Column */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-2xl border border-gray-200/90 p-5 shadow-sm">
          {/* Tree Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
            <div className="relative flex-1 max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={15}
              />
              <input
                type="text"
                placeholder="Search branches by unit or head..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50/70 border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 focus:bg-white transition-all"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExpandAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Maximize2 size={13} />
                <span>Expand All</span>
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Minimize2 size={13} />
                <span>Collapse All</span>
              </button>
            </div>
          </div>

          {/* Tree Body */}
          {isLoading && records.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Loading organizational hierarchy...
            </div>
          ) : rootDepts.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3">
                <FolderTree size={24} />
              </div>
              <h4 className="text-sm font-bold text-gray-900">
                No structural units defined
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                Create a department in the directory to initialize your organizational hierarchy.
              </p>
              <NavLink
                to="/zoiko-hr/departments/list"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition-colors"
              >
                Add Primary Unit
              </NavLink>
            </div>
          ) : (
            <div className="space-y-1 overflow-x-auto pb-2">
              {rootDepts.map((root) => (
                <TreeNode
                  key={root.id}
                  node={root}
                  allDepts={records}
                  depth={0}
                  selectedId={selectedDeptId}
                  onSelect={(dept) => setSelectedDeptId(dept.id)}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                  searchQuery={search}
                  matchedIds={matchedIds}
                />
              ))}
            </div>
          )}
        </div>

        {/* Selected Unit Inspector Panel (Right) */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
          {selectedDept ? (
            <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm p-6 overflow-hidden">
              {/* Unit Header Card */}
              <div className="pb-5 border-b border-gray-100">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                    {selectedDept.code}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      selectedDept.is_active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedDept.is_active ? "bg-emerald-500" : "bg-gray-400"
                      }`}
                    />
                    {selectedDept.is_active ? "Active Unit" : "Inactive"}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight leading-snug">
                  {selectedDept.name}
                </h3>
                {selectedDept.establishment_year && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Calendar size={12} /> Founded {selectedDept.establishment_year}
                  </p>
                )}
              </div>

              {/* Hierarchy Breadcrumbs */}
              <div className="py-4 border-b border-gray-100">
                <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Hierarchy Path
                </h5>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                  {breadcrumbTrail.map((item, idx) => (
                    <span key={item.id} className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDeptId(item.id)}
                        className={`font-semibold hover:text-rose-600 transition-colors ${
                          item.id === selectedDept.id
                            ? "text-rose-600 font-bold"
                            : "text-gray-600"
                        }`}
                      >
                        {item.name}
                      </button>
                      {idx < breadcrumbTrail.length - 1 && (
                        <ChevronRight size={13} className="text-gray-400" />
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Department Head & Staff Metrics */}
              <div className="py-4 border-b border-gray-100 space-y-3.5">
                <div>
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Department Leadership
                  </h5>
                  {selectedDept.head_name || selectedDept.head ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100/60">
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {(selectedDept.head_name || selectedDept.head)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {selectedDept.head_name || selectedDept.head}
                        </p>
                        <p className="text-[11px] text-blue-700 font-medium">
                          Head of Department
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70 text-xs text-gray-500 italic">
                      No appointed leadership assigned yet
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] font-semibold text-gray-400 block">
                      Active Staff
                    </span>
                    <span className="text-base font-bold text-gray-900 flex items-center gap-1.5 mt-0.5">
                      <Users size={15} className="text-slate-500" />
                      {selectedDept.employee_count || 0}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] font-semibold text-gray-400 block">
                      Sub-Units
                    </span>
                    <span className="text-base font-bold text-gray-900 flex items-center gap-1.5 mt-0.5">
                      <Layers size={15} className="text-slate-500" />
                      {selectedChildren.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Envelope */}
              <div className="py-4 border-b border-gray-100">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Financial Envelope
                  </h5>
                  <span className="font-bold text-gray-700">
                    {formatNumber(Number(selectedDept.budget) || 0)}
                  </span>
                </div>
                {(() => {
                  const b = Number(selectedDept.budget) || 0;
                  const s = Number(selectedDept.spent_budget) || 0;
                  const pct = b > 0 ? Math.min(Math.round((s / b) * 100), 999) : 0;
                  const isOver = b > 0 && s > b;

                  return (
                    <div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden my-2">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver ? "bg-red-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Spent: {formatNumber(s)}</span>
                        <span
                          className={`font-semibold ${
                            isOver ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {pct}% utilized
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Direct Sub-units List */}
              {selectedChildren.length > 0 && (
                <div className="py-4 border-b border-gray-100">
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                    Direct Sub-Departments ({selectedChildren.length})
                  </h5>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {selectedChildren.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedDeptId(child.id)}
                        className="w-full text-left flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-rose-50 text-xs group transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-[10px] font-bold text-gray-500 group-hover:text-rose-600">
                            {child.code}
                          </span>
                          <span className="font-medium text-gray-800 truncate">
                            {child.name}
                          </span>
                        </div>
                        <ArrowRight
                          size={12}
                          className="text-gray-400 group-hover:text-rose-600 shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedDept.description && (
                <div className="py-4 border-b border-gray-100">
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Mandate / Description
                  </h5>
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    {selectedDept.description}
                  </p>
                </div>
              )}

              {/* Panel Action Footer */}
              <div className="pt-4 flex items-center justify-end gap-2">
                <NavLink
                  to="/zoiko-hr/departments/list"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                >
                  <ExternalLink size={13} />
                  <span>Open in Directory</span>
                </NavLink>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200/90 p-8 text-center text-gray-400 text-xs">
              Select any branch in the hierarchy tree to inspect leadership, staff, and budget parameters.
            </div>
          )}
        </div>
      </div>
    </DepartmentLayout>
  );
}
