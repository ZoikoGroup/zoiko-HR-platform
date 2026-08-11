import { useState, useMemo, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ChevronRight, ChevronDown, Building2, Users, CircleDollarSign, Calendar, UserCheck } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDepartments } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/departments" },
  { label: "Department List", href: "/zoiko-hr/departments/list" },
  { label: "Department Structure", href: "/zoiko-hr/departments/structure" },
  { label: "Reports", href: "/zoiko-hr/departments/reports" },
  { label: "Settings", href: "/zoiko-hr/departments/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/departments"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-rose-600 border-b-2 border-rose-600 bg-rose-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function TreeNode({ node, allDepts, depth, onSelect }) {
  const [isOpen, setIsOpen] = useState(true);
  const children = useMemo(() => allDepts.filter(d => d.parent_id === node.id), [allDepts, node.id]);
  const hasChildren = children.length > 0;

  return (
    <div className="select-none">
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
        }}
        className="flex items-center justify-between py-2 px-3 hover:bg-rose-50/40 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-rose-100/50"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-0.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-5" />
          )}
          <Building2 size={16} className="text-rose-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-800">{node.name}</span>
          <span className="text-xs font-mono px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-semibold">{node.code}</span>
          {!node.is_active && (
            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs pr-2 text-gray-500 invisible sm:flex">
          {Number(node.employee_count) > 0 && (
            <div className="flex items-center gap-1 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100/40 text-blue-700">
              <Users size={12} />
              <span>{node.employee_count}</span>
            </div>
          )}
          {node.head && (
            <div className="flex items-center gap-1 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100/40 text-blue-700">
              <UserCheck size={12} />
              <span>{node.head}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-100/40 text-emerald-700 font-medium">
            <CircleDollarSign size={12} />
            <span>${(Number(node.budget) || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
      {hasChildren && isOpen && (
        <div className="space-y-0.5">
          {children.map(child => (
            <TreeNode key={child.id} node={child} allDepts={allDepts} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentDetail({ dept }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div className="border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-bold text-rose-600 tracking-wider uppercase">{dept.code}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            dept.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {dept.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <h3 className="text-lg font-bold text-gray-900">{dept.name}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 text-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={16} /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Employee Count</p>
            <p className="font-semibold text-gray-700">{dept.employee_count || 0} active staff</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><UserCheck size={16} /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Department Head</p>
            <p className="font-semibold text-gray-700">{dept.head || "Not Assigned"}</p>
          </div>
        </div>
        {dept.establishment_year && (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Calendar size={16} /></div>
            <div>
              <p className="text-xs text-gray-400 font-medium">Establishment Year</p>
              <p className="font-semibold text-gray-700">{dept.establishment_year}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><CircleDollarSign size={16} /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Budget Envelope</p>
            <p className="font-semibold text-gray-700">${(Number(dept.budget) || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="pt-2 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-500">
        <Users size={12} />
        <span>{(() => {
          const parentId = dept.parent_id;
          if (!parentId) return "Root department";
          const parent = dept.parent_name || "";
          return parent ? `Parent: ${parent}` : "Has parent";
        })()}</span>
      </div>
      {dept.description && (
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</h4>
          <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2.5 rounded-lg border border-gray-100">{dept.description}</p>
        </div>
      )}
    </div>
  );
}

export default function DepartmentStructure() {
  const [records, setRecords] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    getDepartments({ include_inactive: true })
      .then((res) => {
        if (mounted) {
          const data = res?.data?.data || res?.data || res || [];
          setRecords(Array.isArray(data) ? data : []);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const rootDepts = useMemo(() => {
    return records.filter(d => !d.parent_id);
  }, [records]);

  /* Enrich each record with parent_name for the detail panel */
  const enrichedRecords = useMemo(() => {
    return records.map(d => ({
      ...d,
      parent_name: d.parent_id ? records.find(p => p.id === d.parent_id)?.name : null,
    }));
  }, [records]);

  const selectedItem = selectedDept
    ? enrichedRecords.find(d => d.id === selectedDept.id) || selectedDept
    : null;

  return (
    <HRPage title="Departments" subtitle="Manage organizational entities">
      <SubNav />

      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Department Structure</h1>
          <p className="text-xs text-gray-500 mt-0.5">Organizational hierarchy tree and functional links</p>
        </div>

        <div className={`grid grid-cols-1 ${selectedDept ? "lg:grid-cols-3" : "grid-cols-1"} gap-6`}>
          <div className={`${selectedDept ? "lg:col-span-2" : "w-full"} bg-white rounded-xl border border-gray-200 p-5 shadow-sm`}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
              <h2 className="text-sm font-bold text-gray-900">Org Chart Hierarchy</h2>
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">{records.length} departments</span>
            </div>
            <div className="space-y-1">
              {isLoading ? (
                <p className="text-sm text-gray-400 py-4 text-center">Loading breakdown hierarchy...</p>
              ) : rootDepts.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No structural roots found. Create a department to begin.</p>
              ) : (
                rootDepts.map((dept) => (
                  <TreeNode key={dept.id} node={dept} allDepts={records} depth={0} onSelect={setSelectedDept} />
                ))
              )}
            </div>
          </div>

          {selectedItem && (
            <div className="lg:col-span-1">
              <DepartmentDetail dept={selectedItem} />
            </div>
          )}
        </div>
      </div>
    </HRPage>
  );
}
