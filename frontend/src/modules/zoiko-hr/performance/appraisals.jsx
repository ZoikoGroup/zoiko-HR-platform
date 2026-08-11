import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, X, Edit2, Trash2, CheckCircle, XCircle, Send, DollarSign, TrendingUp } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getHrEmployees } from "../../../service/hrService";
import {
  getPerformanceAppraisals, createPerformanceAppraisal, updatePerformanceAppraisal, deletePerformanceAppraisal,
  getDefaultReviewers,
} from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/performance" },
  { label: "Goals & OKRs", href: "/zoiko-hr/performance/goals" },
  { label: "Performance Reviews", href: "/zoiko-hr/performance/reviews" },
  { label: "Appraisals", href: "/zoiko-hr/performance/appraisals" },
  { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics" },
];

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
  const m = { draft: "bg-gray-100 text-gray-800", submitted: "bg-blue-100 text-blue-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

export default function Appraisals() {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    employee_id: "", reviewer_id: "", hr_reviewer_id: "", admin_reviewer_id: "", cycle: "", self_score: "", manager_score: "", final_score: "",
    recommendation: "", salary_hike: "", comments: "", status: "draft",
  });

  const empMap = {};
  employees.forEach((e) => {
    const first = e.firstName || e.first_name;
    const last = e.lastName || e.last_name;
    empMap[e.id] = e.fullName || e.full_name || (first && last ? `${first} ${last}` : null) || `#${e.id}`;
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getPerformanceAppraisals().then((r) => { setItems(Array.isArray(r) ? r : r?.items || r?.data || []); }).catch(() => {}),
      getHrEmployees({ per_page: 200, include_all_roles: true }).then((e) => { setEmployees(Array.isArray(e) ? e : e?.items || e?.data || []); }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ employee_id: "", reviewer_id: "", hr_reviewer_id: "", admin_reviewer_id: "", cycle: "", self_score: "", manager_score: "", final_score: "", recommendation: "", salary_hike: "", comments: "", status: "draft" });
    setShowModal(true);
  };

  const openEdit = (a) => {
    setEditItem(a);
    setForm({
      employee_id: a.employee_id,
      reviewer_id: a.reviewer_id || "",
      hr_reviewer_id: a.hr_reviewer_id || "",
      admin_reviewer_id: a.admin_reviewer_id || "",
      cycle: a.cycle,
      self_score: a.self_score ?? "",
      manager_score: a.manager_score ?? "",
      final_score: a.final_score ?? "",
      recommendation: a.recommendation || "",
      salary_hike: a.salary_hike ?? "",
      comments: a.comments || "",
      status: a.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      employee_id: Number(form.employee_id),
      reviewer_id: form.reviewer_id ? Number(form.reviewer_id) : null,
      hr_reviewer_id: form.hr_reviewer_id ? Number(form.hr_reviewer_id) : null,
      admin_reviewer_id: form.admin_reviewer_id ? Number(form.admin_reviewer_id) : null,
      self_score: form.self_score !== "" ? Number(form.self_score) : null,
      manager_score: form.manager_score !== "" ? Number(form.manager_score) : null,
      final_score: form.final_score !== "" ? Number(form.final_score) : null,
      salary_hike: form.salary_hike !== "" ? Number(form.salary_hike) : null,
    };
    if (editItem) {
      await updatePerformanceAppraisal(editItem.id, payload);
    } else {
      await createPerformanceAppraisal(payload);
    }
    setShowModal(false);
    load();
  };

  const handleEmployeeChangeForAppraisal = async (employeeId) => {
    setForm((prev) => ({ ...prev, employee_id: employeeId }));
    if (!employeeId) return;
    try {
      const res = await getDefaultReviewers(employeeId);
      const data = res?.data || res;
      setForm((prev) => ({
        ...prev,
        employee_id: employeeId,
        reviewer_id: prev.reviewer_id || data.manager_id || "",
        hr_reviewer_id: prev.hr_reviewer_id || data.hr_reviewer_id || "",
        admin_reviewer_id: prev.admin_reviewer_id || data.admin_reviewer_id || "",
      }));
    } catch {
      // leave defaults unchanged
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this appraisal?")) return;
    await deletePerformanceAppraisal(id);
    load();
  };

  const handleStatusChange = async (id, newStatus) => {
    const item = items.find((a) => a.id === id);
    if (!item) return;
    await updatePerformanceAppraisal(id, { status: newStatus });
    load();
  };

  const filtered = filter ? items.filter((a) => a.status === filter) : items;

  if (loading) return <HRPage title="Appraisals" subtitle="Annual and periodic appraisal records"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  return (
    <HRPage title="Appraisals" subtitle="Annual and periodic appraisal records">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Appraisals</h1>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Appraisal
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["", "draft", "submitted", "approved", "rejected"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s ? s.replace(/\b\w/g, (l) => l.toUpperCase()) : "All"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-600 font-medium">Draft</p>
            <p className="text-2xl font-bold text-gray-700">{items.filter((a) => a.status === "draft").length}</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-blue-600 font-medium">Submitted</p>
            <p className="text-2xl font-bold text-blue-700">{items.filter((a) => a.status === "submitted").length}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <p className="text-xs text-green-600 font-medium">Approved</p>
            <p className="text-2xl font-bold text-green-700">{items.filter((a) => a.status === "approved").length}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-xs text-red-600 font-medium">Rejected</p>
            <p className="text-2xl font-bold text-red-700">{items.filter((a) => a.status === "rejected").length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {["Employee", "Reviewer", "HR Reviewer", "Admin Reviewer", "Period", "Self", "Manager", "Final", "Recommendation", "Salary Hike", "Status", "Actions", ""].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-3 py-3 font-medium text-gray-900">{empMap[a.employee_id] || `#${a.employee_id}`}</td>
                  <td className="px-3 py-3 text-gray-500">{empMap[a.reviewer_id] || (a.reviewer_id ? `#${a.reviewer_id}` : "-")}</td>
                  <td className="px-3 py-3 text-gray-500">{empMap[a.hr_reviewer_id] || (a.hr_reviewer_id ? `#${a.hr_reviewer_id}` : "-")}</td>
                  <td className="px-3 py-3 text-gray-500">{empMap[a.admin_reviewer_id] || (a.admin_reviewer_id ? `#${a.admin_reviewer_id}` : "-")}</td>
                  <td className="px-3 py-3 text-gray-500">{a.cycle}</td>
                  <td className="px-3 py-3">{a.self_score != null ? `${a.self_score}/5` : "-"}</td>
                  <td className="px-3 py-3">{a.manager_score != null ? `${a.manager_score}/5` : "-"}</td>
                  <td className="px-3 py-3 font-bold text-gray-900">{a.final_score != null ? `${a.final_score}/5` : "-"}</td>
                  <td className="px-3 py-3">
                    {a.recommendation ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.recommendation.includes("promotion") ? "bg-purple-100 text-purple-800" :
                        a.recommendation === "bonus" ? "bg-yellow-100 text-yellow-800" :
                        a.recommendation === "improvement_plan" ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {a.recommendation === "promotion" && <TrendingUp className="w-3 h-3" />}
                        {a.recommendation === "bonus" && <DollarSign className="w-3 h-3" />}
                        {a.recommendation === "promotion_bonus" && <><TrendingUp className="w-3 h-3" />+<DollarSign className="w-3 h-3" /></>}
                        {a.recommendation.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-3">{a.salary_hike != null ? `${a.salary_hike}%` : "-"}</td>
                  <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {a.status === "draft" && (
                        <button onClick={() => handleStatusChange(a.id, "submitted")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"><Send className="w-3 h-3" /> Submit</button>
                      )}
                      {a.status === "submitted" && (
                        <>
                          <button onClick={() => handleStatusChange(a.id, "approved")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"><CheckCircle className="w-3 h-3" /> Approve</button>
                          <button onClick={() => handleStatusChange(a.id, "rejected")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"><XCircle className="w-3 h-3" /> Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(a)} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">No appraisals found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Appraisal" : "New Appraisal"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Employee</label>
                  <select value={form.employee_id} onChange={(e) => handleEmployeeChangeForAppraisal(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select employee</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Reviewer (Manager)</label>
                  <select value={form.reviewer_id} onChange={(e) => setForm({ ...form, reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select reviewer</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">HR Reviewer</label>
                  <select value={form.hr_reviewer_id} onChange={(e) => setForm({ ...form, hr_reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select HR reviewer</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Admin Reviewer</label>
                  <select value={form.admin_reviewer_id} onChange={(e) => setForm({ ...form, admin_reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select admin reviewer</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Cycle / Period</label>
                <input value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} placeholder="2024-2025" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Self Score</label>
                  <input type="number" step="0.1" min={0} max={5} value={form.self_score} onChange={(e) => setForm({ ...form, self_score: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Manager Score</label>
                  <input type="number" step="0.1" min={0} max={5} value={form.manager_score} onChange={(e) => setForm({ ...form, manager_score: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Final Score</label>
                  <input type="number" step="0.1" min={0} max={5} value={form.final_score} onChange={(e) => setForm({ ...form, final_score: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Recommendation</label>
                  <select value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">None</option>
                    <option value="promotion">Promotion</option>
                    <option value="bonus">Bonus</option>
                    <option value="promotion_bonus">Promotion + Bonus</option>
                    <option value="improvement_plan">Improvement Plan</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Salary Hike (%)</label>
                  <input type="number" step="0.5" min={0} value={form.salary_hike} onChange={(e) => setForm({ ...form, salary_hike: e.target.value })} placeholder="e.g. 10" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Comments</label>
                <textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">{editItem ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
