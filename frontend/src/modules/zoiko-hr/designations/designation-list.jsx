import { useState, useMemo, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Download, RefreshCw, Users } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { 
  getDesignations, 
  getDepartments,
  createDesignation, 
  updateDesignation, 
  deleteDesignation,
  getHrEmployees
} from "../../../service/hrService";
import { updateEmployee } from "../../../service/employee";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations" },
  { label: "Designation List", href: "/zoiko-hr/designations/list" },
  { label: "Designation Structure", href: "/zoiko-hr/designations/levels" },
  { label: "Reports", href: "/zoiko-hr/designations/reports" },
  { label: "Settings", href: "/zoiko-hr/designations/settings" },
];

const LEVEL_OPTIONS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"].map((l) => ({ value: l, label: l }));
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];


const initialForm = {
  title: "",
  department_name: "", 
  level: "L1",
  description: "",
  status: "active",
};

export default function DesignationList() {
  const [records, setRecords] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [detailItem, setDetailItem] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const getEmpName = (emp) => {
    if (!emp) return "";
    const u = emp.user || emp.profile || {};
    const first = emp.first_name || emp.firstName || u.first_name || u.firstName || "";
    const last = emp.last_name || emp.lastName || u.last_name || u.lastName || "";
    if (first || last) return `${first} ${last}`.trim();
    return emp.full_name || emp.fullName || emp.name || emp.employee_name || emp.display_name || u.full_name || u.name || "";
  };

  const getEmpCode = (emp) => {
    if (!emp) return "";
    const u = emp.user || emp.profile || {};
    return emp.employee_code || emp.code || u.employee_code || u.code || emp.employee_id || emp.employeeId || emp.id;
  };

  const employeeMap = useMemo(() => {
    const m = {};
    employees.forEach((emp) => {
      const key = emp.id || emp.employee_id || emp.user_id || emp.user?.id || emp.profile?.id;
      if (key) m[key] = emp;
    });
    return m;
  }, [employees]);

  const getEmployeeDisplay = (empId) => {
    if (!empId) return "";
    const emp = employeeMap[empId];
    if (!emp) return `#${empId}`;
    const name = getEmpName(emp);
    const code = getEmpCode(emp);
    return name ? `${name} (${code})` : `#${code}`;
  };

  // A Designation has no employee_id of its own — the backend models this the
  // other way around (Employee.designation_id -> Designation.id), and a single
  // designation can be held by many employees (see Designation.employees_count).
  // So "who holds this designation" has to be derived by scanning the employee
  // list, not read off a field on the designation record.
  const getEmployeesForDesignation = (designationId) => {
    if (!designationId) return [];
    return employees.filter((emp) => {
      const empDesigId = emp.designation_id ?? emp.designationId ?? emp.designation?.id;
      return empDesigId != null && String(empDesigId) === String(designationId);
    });
  };

  const getAssignedEmployeeDisplay = (designationId) => {
    const emps = getEmployeesForDesignation(designationId);
    if (emps.length === 0) return "";
    if (emps.length === 1) {
      const name = getEmpName(emps[0]);
      const code = getEmpCode(emps[0]);
      return name ? `${name} (${code})` : `#${code}`;
    }
    return `${emps.length} employees`;
  };

  const fetchRecords = () => {
    setLoading(true);
    Promise.all([
      getDesignations(),
      getDepartments(),
      getHrEmployees()
    ])
      .then(([desigRes, deptRes, empRes]) => {
        const desigItems = desigRes?.items || desigRes?.data || (Array.isArray(desigRes) ? desigRes : []);
        setRecords(Array.isArray(desigItems) ? desigItems : []);
        const deptItems = deptRes?.data || deptRes?.items || (Array.isArray(deptRes) ? deptRes : []);
        setDepartments(Array.isArray(deptItems) ? deptItems : []);
        const empItems = empRes?.data || empRes?.items || (Array.isArray(empRes) ? empRes : []);
        const emps = Array.isArray(empItems) ? empItems : [];
        if (emps.length > 0) console.log("First employee keys:", Object.keys(emps[0]), "sample:", emps[0]);
        setEmployees(emps);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData(initialForm);
    setSelectedEmployeeId("");
    setShowModal(true);
  };

  const handleOpenEdit = (item, e) => {
    e.stopPropagation();
    setEditingId(item.id);
    setFormData({
      title: item.title || "",
      department_name: item.department_name || "",
      level: item.level || "L1",
      description: item.description || "",
      status: item.status || "active",
    });
    const currentEmps = getEmployeesForDesignation(item.id);
    const currentEmpId = currentEmps[0] ? (currentEmps[0].id || currentEmps[0].employee_id || currentEmps[0].user_id) : null;
    setSelectedEmployeeId(currentEmpId ? String(currentEmpId) : "");
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // The Designation record itself has no employee_id field on the backend
    // (a designation can be held by many employees), so the assignment is
    // never sent as part of this payload — it's persisted separately below
    // by updating the chosen employee's designation_id instead.
    const payload = { ...formData };
    const action = editingId
      ? updateDesignation(editingId, payload)
      : createDesignation(payload);

    action
      .then((res) => {
        const savedDesignation = res?.data || res;
        const designationId = editingId || savedDesignation?.id;
        if (selectedEmployeeId && designationId) {
          return updateEmployee(selectedEmployeeId, { designation_id: designationId });
        }
      })
      .then(() => {
        setShowModal(false);
        fetchRecords();
      })
      .catch((err) => console.error("Error saving record:", err));
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this designation?")) {
      deleteDesignation(id)
        .then(() => fetchRecords())
        .catch((err) => console.error(err));
    }
  };

  return (
    <HRPage title="Designation List" breadcrumbs={[{ label: "HR" }, { label: "Designations", href: "/zoiko-hr/designations" }, { label: "List" }]}>
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} to={item.href} className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700"}`}>{item.label}</NavLink>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button onClick={handleOpenCreate} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"><Plus className="w-4 h-4" /> Add Designation</button>
          <button onClick={fetchRecords} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {records.map((item) => (
                  <tr key={item.id} onClick={() => { setDetailItem(item); setShowDetail(true); }} className="hover:bg-gray-50/80 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-sm font-mono font-bold text-[#FF7A00]">{item.designation_code || "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.department_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.level}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getAssignedEmployeeDisplay(item.id) || "-"}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm flex gap-2">
                    <button onClick={(e) => handleOpenEdit(item, e)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={(e) => handleDelete(item.id, e)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && detailItem && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-full p-6 shadow-xl overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{detailItem.title}</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-500">Designation Code</label>
                <p className="text-sm font-mono font-bold text-[#FF7A00]">{detailItem.designation_code || "—"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Department</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.department_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Hierarchy Level</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.level}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Assigned Employee{getEmployeesForDesignation(detailItem.id).length > 1 ? "s" : ""}</label>
                <p className="text-sm text-gray-900 font-medium">{getAssignedEmployeeDisplay(detailItem.id) || "Not assigned"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Description</label>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border">{detailItem.description || "N/A"}</p>
              </div>
            </div>
            <button onClick={() => setShowDetail(false)} className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Close Panel</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50"><h3 className="text-base font-semibold text-gray-900">{editingId ? "Edit Designation" : "Add New Designation"}</h3></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation Title</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" required placeholder="e.g. Senior Software Engineer" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department Name</label>
                <select value={formData.department_name} onChange={(e) => setFormData({ ...formData, department_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" required>
                  <option value="">Select Department</option>
                  {departments.length === 0 ? (
                    <option value="" disabled>No departments available. Please create a department first.</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Hierarchy Level</label>
                  <select value={formData.level} onChange={(e) => setFormData({ ...formData, level: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" required>
                    {LEVEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assign Employee</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20">
                  <option value="">Select employee...</option>
                  {employees.map((emp) => {
                    const eid = emp.id || emp.employee_id || emp.user_id || emp.user?.id;
                    const ename = getEmpName(emp);
                    const ecode = getEmpCode(emp);
                    return (
                      <option key={eid} value={eid}>
                        {ename ? `${ename} (${ecode})` : `#${ecode}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="Brief details about responsibilities..."></textarea>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">Save Designation</button>
            </div>
          </form>
        </div>
      )}
    </HRPage>
  );
}