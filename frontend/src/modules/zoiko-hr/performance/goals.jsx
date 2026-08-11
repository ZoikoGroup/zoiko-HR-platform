import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, X, Edit2, Trash2, BarChart3, Search, ChevronLeft, ChevronRight, Save } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getHrEmployees } from "../../../service/hrService";
import {
  getPerformanceGoals, createPerformanceGoal, updatePerformanceGoal, deletePerformanceGoal,
  getPerformanceKpis, createPerformanceKpi, updatePerformanceKpi, deletePerformanceKpi,
} from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/performance" },
  { label: "Goals & OKRs", href: "/zoiko-hr/performance/goals" },
  { label: "Performance Reviews", href: "/zoiko-hr/performance/reviews" },
  { label: "Appraisals", href: "/zoiko-hr/performance/appraisals" },
  { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics" },
];
const PAGE_SIZE = 5;

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/performance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const m = { not_started: "bg-gray-100 text-gray-800", on_track: "bg-green-100 text-green-800", at_risk: "bg-red-100 text-red-800", completed: "bg-blue-100 text-blue-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

function TypeBadge({ type }) {
  const m = { okr: "bg-indigo-100 text-indigo-800", kpi: "bg-orange-100 text-orange-800", individual: "bg-teal-100 text-teal-800" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m[type] || "bg-gray-100 text-gray-800"}`}>{(type || "okr").toUpperCase()}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

const initForm = { title: "", description: "", employee_id: "", goal_type: "okr", quarter: "", year: new Date().getFullYear(), progress: 0, status: "not_started", due_date: "" };

export default function GoalsOKRs() {
  const [goals, setGoals] = useState([]);
  const [kpis, setKpis] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [form, setForm] = useState({ ...initForm });

  const [showKpiModal, setShowKpiModal] = useState(false);
  const [editKpi, setEditKpi] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [kpiForm, setKpiForm] = useState({ name: "", target_value: "", actual_value: "", unit: "", weight: 1.0 });

  const [editingProgress, setEditingProgress] = useState(null);

  const empMap = {};
  employees.forEach((e) => {
    const first = e.firstName || e.first_name;
    const last = e.lastName || e.last_name;
    empMap[e.id] = e.fullName || e.full_name || (first && last ? `${first} ${last}` : null) || `#${e.id}`;
  });

  const loadKpisForGoal = useCallback((goalId) => {
    getPerformanceKpis(goalId).then((kr) => {
      setKpis((prev) => ({ ...prev, [goalId]: Array.isArray(kr) ? kr : kr?.items || kr?.data || [] }));
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getPerformanceGoals(),
      getHrEmployees({ per_page: 200, include_all_roles: true }).catch(() => []),
    ]).then(([g, emps]) => {
      const list = Array.isArray(g) ? g : g?.items || g?.data || [];
      setGoals(list);
      setEmployees(Array.isArray(emps) ? emps : emps?.items || emps?.data || []);
      list.forEach((goal) => loadKpisForGoal(goal.id));
    }).catch((err) => {
      console.error("Goals load error:", err);
    }).finally(() => setLoading(false));
  }, [loadKpisForGoal]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditGoal(null); setForm({ ...initForm }); setShowModal(true); };
  const openEdit = (g) => {
    setEditGoal(g);
    setForm({ title: g.title, description: g.description || "", employee_id: g.employee_id || "", goal_type: g.goal_type || "okr", quarter: g.quarter || "", year: g.year || new Date().getFullYear(), progress: g.progress || 0, status: g.status || "not_started", due_date: g.due_date ? g.due_date.split("T")[0] : "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.employee_id) {
      window.alert("Please select an employee for this goal.");
      return;
    }
    const payload = { ...form, employee_id: Number(form.employee_id), year: Number(form.year), progress: Number(form.progress) };
    if (editGoal) {
      await updatePerformanceGoal(editGoal.id, payload);
    } else {
      await createPerformanceGoal(payload);
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this goal?")) return;
    await deletePerformanceGoal(id);
    load();
  };

  const handleProgressSave = async (goalId, progress) => {
    await updatePerformanceGoal(goalId, { progress: Number(progress) });
    setEditingProgress(null);
    load();
  };

  const openKpiModal = (goalId) => {
    setSelectedGoalId(goalId);
    setEditKpi(null);
    setKpiForm({ name: "", target_value: "", actual_value: "", unit: "", weight: 1.0 });
    setShowKpiModal(true);
  };

  const openKpiEdit = (goalId, kpi) => {
    setSelectedGoalId(goalId);
    setEditKpi(kpi);
    setKpiForm({ name: kpi.name, target_value: kpi.target_value ?? "", actual_value: kpi.actual_value ?? "", unit: kpi.unit || "", weight: kpi.weight ?? 1.0 });
    setShowKpiModal(true);
  };

  const handleKpiSave = async () => {
    const goal = goals.find((g) => g.id === selectedGoalId);
    const payload = { ...kpiForm, employee_id: goal?.employee_id, goal_id: selectedGoalId, target_value: Number(kpiForm.target_value) || null, actual_value: Number(kpiForm.actual_value) || null, weight: Number(kpiForm.weight) };
    if (editKpi) {
      await updatePerformanceKpi(editKpi.id, payload);
    } else {
      await createPerformanceKpi(payload);
    }
    setShowKpiModal(false);
    loadKpisForGoal(selectedGoalId);
  };

  const handleKpiDelete = async (goalId, kpiId) => {
    if (!window.confirm("Delete this KPI?")) return;
    await deletePerformanceKpi(kpiId);
    loadKpisForGoal(goalId);
  };

  const filtered = goals.filter((g) => {
    if (filter && g.status !== filter) return false;
    if (search && !g.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) return <HRPage title="Goals & OKRs" subtitle="Track team objectives and key results"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  return (
    <HRPage title="Goals & OKRs" subtitle="Track team objectives and key results">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Goals & OKRs</h1>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Goal
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search goals..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["", "not_started", "on_track", "at_risk", "completed"].map((s) => (
              <button key={s} onClick={() => { setFilter(s); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {s ? s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {["Type", "Objective", "Employee", "Quarter", "Progress", "Status", "Due Date", "KPIs", ""].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((g) => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-3 py-3"><TypeBadge type={g.goal_type} /></td>
                  <td className="px-3 py-3 font-medium text-gray-900 max-w-[200px] truncate">{g.title}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{empMap[g.employee_id] || `#${g.employee_id}`}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">{g.quarter || "-"}</td>
                  <td className="px-3 py-3">
                    {editingProgress === g.id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} defaultValue={g.progress || 0}
                          className="w-16 border border-gray-200 rounded px-1 py-0.5 text-xs text-center"
                          onKeyDown={(e) => { if (e.key === "Enter") handleProgressSave(g.id, e.target.value); if (e.key === "Escape") setEditingProgress(null); }}
                          autoFocus />
                        <button onClick={(e) => handleProgressSave(g.id, e.target.closest("tr").querySelector("input").value)} className="text-green-600"><Save className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditingProgress(g.id)}>
                        <div className="w-20 bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${g.status === "completed" ? "bg-green-500" : g.status === "at_risk" ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${g.progress || 0}%` }} />
                        </div>
                        <span className="text-xs font-medium">{g.progress || 0}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={g.status} /></td>
                  <td className="px-3 py-3 text-xs text-gray-500">{formatDate(g.due_date)}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => openKpiModal(g.id)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                      <BarChart3 className="w-3 h-3" /> {(kpis[g.id] || []).length} KPIs
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(g)} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(g.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No goals found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{filtered.length} total goal(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editGoal ? "Edit Goal" : "New Goal"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Employee</label>
                  <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select employee</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{empMap[e.id]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Type</label>
                  <select value={form.goal_type} onChange={(e) => setForm({ ...form, goal_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="okr">OKR</option>
                    <option value="kpi">KPI</option>
                    <option value="individual">Individual</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Quarter</label>
                  <input value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })} placeholder="Q1 2025" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Year</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Progress (%)</label>
                  <input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="not_started">Not Started</option>
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">{editGoal ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {showKpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editKpi ? "Edit KPI" : "Add KPI"}</h2>
              <button onClick={() => setShowKpiModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Name</label>
                <input value={kpiForm.name} onChange={(e) => setKpiForm({ ...kpiForm, name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Target Value</label>
                  <input type="number" value={kpiForm.target_value} onChange={(e) => setKpiForm({ ...kpiForm, target_value: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Actual Value</label>
                  <input type="number" value={kpiForm.actual_value} onChange={(e) => setKpiForm({ ...kpiForm, actual_value: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Unit</label>
                  <input value={kpiForm.unit} onChange={(e) => setKpiForm({ ...kpiForm, unit: e.target.value })} placeholder="%" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Weight</label>
                  <input type="number" step="0.1" value={kpiForm.weight} onChange={(e) => setKpiForm({ ...kpiForm, weight: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowKpiModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleKpiSave} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">{editKpi ? "Update" : "Add"}</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
