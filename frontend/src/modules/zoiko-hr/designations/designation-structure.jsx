import { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { ChevronRight, ChevronDown, Briefcase, Building2, DollarSign, Users, ChevronsDownUp } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDesignations } from "../../../service/hrService";

const LEVEL_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"];

const LEVEL_META = {
  L1: { label: "Entry Level", color: "blue", desc: "Interns, trainees, and junior staff" },
  L2: { label: "Junior", color: "indigo", desc: "Associates and junior specialists" },
  L3: { label: "Mid-Level", color: "purple", desc: "Experienced professionals" },
  L4: { label: "Senior", color: "pink", desc: "Senior specialists and leads" },
  L5: { label: "Manager", color: "red", desc: "Team leads and department managers" },
  L6: { label: "Senior Manager", color: "orange", desc: "Senior managers and directors" },
  L7: { label: "Director", color: "yellow", desc: "Directors and senior directors" },
  L8: { label: "VP", color: "green", desc: "Vice presidents" },
  L9: { label: "SVP", color: "teal", desc: "Senior vice presidents" },
  L10: { label: "C-Level", color: "cyan", desc: "C-suite executives" },
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/designations"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const LEVEL_BG = { L1: "bg-blue-100", L2: "bg-indigo-100", L3: "bg-purple-100", L4: "bg-pink-100", L5: "bg-red-100", L6: "bg-orange-100", L7: "bg-yellow-100", L8: "bg-green-100", L9: "bg-teal-100", L10: "bg-cyan-100" };
const LEVEL_TEXT = { L1: "text-blue-800", L2: "text-indigo-800", L3: "text-purple-800", L4: "text-pink-800", L5: "text-red-800", L6: "text-orange-800", L7: "text-yellow-800", L8: "text-green-800", L9: "text-teal-800", L10: "text-cyan-800" };

function LevelNode({ level, items, selected, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const meta = LEVEL_META[level];
  const bg = LEVEL_BG[level] || "bg-gray-100";
  const text = LEVEL_TEXT[level] || "text-gray-800";

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-orange-50 bg-white border border-gray-100"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-400 w-4 h-4 flex items-center justify-center">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${bg} ${text}`}>{level}</span>
        <div className="flex-1">
          <span className="font-semibold text-gray-900">{meta?.label || level}</span>
          <span className="text-xs text-gray-400 ml-2">{meta?.desc}</span>
        </div>
        <span className="text-xs text-gray-400 font-mono">{items.length} designations</span>
      </div>
      {expanded && items.map((item) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ml-6 mt-0.5 ${
            selected?.id === item.id ? "bg-orange-50 border border-orange-200" : "hover:bg-gray-50 border border-transparent"
          }`}
        >
          <div className="p-1.5 rounded-lg bg-gray-100">
            <Briefcase className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">{item.title}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{item.status}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DesignationStructure() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let mounted = true;
    getDesignations()
      .then((res) => {
        // api wrapper returns parsed JSON body directly (not axios-style { data })
        // Handle both shapes defensively: array | { data: array }
        if (!mounted) return;
        const next = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        setRecords(next);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const grouped = useMemo(() => {
    return LEVEL_ORDER.map((level) => ({
      level,
      items: records.filter((r) => r.level === level),
    })).filter((g) => g.items.length > 0);
  }, [records]);

  if (loading) {
    return (
      <HRPage title="Designation Structure" subtitle="Organizational hierarchy and designation relationships">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-3 text-gray-500">Loading hierarchy...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Designation Structure" subtitle="Organizational hierarchy and designation relationships">
      <SubNav />
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Designation Structure</h1>
          <p className="text-sm text-gray-500 mt-1">Organizational hierarchy and designation relationships</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Levels</h2>
              <span className="text-xs text-gray-400">{records.length} designations</span>
            </div>
            <div className="space-y-2">
              {grouped.map((g) => (
                <LevelNode key={g.level} level={g.level} items={g.items} selected={selected} onSelect={setSelected} />
              ))}
              {grouped.length === 0 && (
                <div className="text-center py-8 text-gray-400">No designations found</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}