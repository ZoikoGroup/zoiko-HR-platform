import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  X,
  Search,
  Filter,
  Users,
  Briefcase,
  Layers,
  ChevronRight,
  ShieldCheck,
  Building2,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Trash2,
  Edit2,
  UserPlus,
} from "lucide-react";
import DesignationLayout, { notifyDesignationsUpdated } from "./DesignationLayout";
import { 
  getDesignations, 
  getDepartments,
  createDesignation, 
  updateDesignation, 
  deleteDesignation,
  getDesignationSettings,
  getDesignationHolders,
  assignDesignation,
} from "../../../service/hrService";
import {
  decidePositionApproval, getJobDescriptions, getPositionAuthorization, requestPositionApproval,
} from "../../../service/workforcePlanningService";
import GenerateDocumentButton from "../../../components/documents/GenerateDocumentButton";
import AssignPeopleDialog, { PeopleMultiPicker } from "./AssignPeopleDialog";
import { formatDate } from "../../../utils/dateTime";
import { DEFAULT_DESIGNATION_SETTINGS, normalizeDesignationSettings, sortDesignations } from "../../../utils/designationSettings";

// Where a designation came from. Rows created before this was tracked have no source.
const SOURCE_LABELS = {
  manual: "Added manually",
  import: "Employee import",
  user_form: "Add User form",
};
const sourceLabel = (s) => SOURCE_LABELS[s] || "Before tracking";

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
  const [holders, setHolders] = useState(null);        // people holding the designation open in the detail panel
  const [assigning, setAssigning] = useState(null);     // the designation being given to people
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [detailItem, setDetailItem] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [newPeople, setNewPeople] = useState([]);      // people to give a new designation to, right after it is created
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }
  const [modalError, setModalError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // The organization's Designation Settings (sort, page size, columns, compact layout, level limit, codes).
  const [settings, setSettings] = useState(DEFAULT_DESIGNATION_SETTINGS);
  const [page, setPage] = useState(1);
  const [positionAuthorization, setPositionAuthorization] = useState(null);
  const [positionError, setPositionError] = useState("");
  const [positionBusy, setPositionBusy] = useState(false);
  const [jobDescriptions, setJobDescriptions] = useState([]);
  const [positionReason, setPositionReason] = useState("");
  const [reportsToId, setReportsToId] = useState("");
  const [payGradeId, setPayGradeId] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [positionLocation, setPositionLocation] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [positionComment, setPositionComment] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = records.filter((r) => {
      if (sourceFilter === "none" ? r.source : sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (departmentFilter !== "all" && (r.department_name || "") !== departmentFilter) return false;
      if (statusFilter !== "all" && (r.status || "active") !== statusFilter) return false;
      if (!q) return true;
      return [r.title, r.department_name, r.level].some((v) => String(v || "").toLowerCase().includes(q));
    });
    return sortDesignations(rows, settings.default_sort_field, settings.default_sort_direction);
  }, [records, search, sourceFilter, departmentFilter, statusFilter, settings.default_sort_field, settings.default_sort_direction]);

  const pageSize = settings.items_per_page || 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);
  useEffect(() => { setPage(1); }, [search, sourceFilter, departmentFilter, statusFilter, pageSize]);

  const cell = settings.compact_mode ? "px-4 py-1.5" : "px-4 py-3.5";
  const levelOptions = useMemo(() => {
    const allowed = LEVEL_OPTIONS.filter((_, i) => i + 1 <= settings.max_hierarchy_depth);
    return allowed.some((o) => o.value === formData.level) || !formData.level ? allowed : [...allowed, { value: formData.level, label: `${formData.level} (above the limit)` }];
  }, [settings.max_hierarchy_depth, formData.level]);

  const peopleCount = (n) => (n ? `${n} ${n === 1 ? "person" : "people"}` : "—");
  const canAssign = (item) => (item.status || "active") === "active" && item.approval_status !== "pending";

  const openDetail = (item) => {
    setDetailItem(item);
    setShowDetail(true);
    setHolders(null);
    getDesignationHolders(item.id)
      .then((rows) => setHolders(Array.isArray(rows) ? rows : rows?.data || []))
      .catch(() => setHolders([]));
  };

  const assignedDone = (res) => {
    const n = res?.assigned ?? 0;
    const same = res?.unchanged ? ` ${res.unchanged} already had it.` : "";
    setNotice({ type: "success", text: `“${assigning.title}” given to ${n} ${n === 1 ? "person" : "people"}.${same}` });
    const item = assigning;
    setAssigning(null);
    fetchRecords({ fresh: true });
    notifyDesignationsUpdated();
    if (showDetail && detailItem?.id === item.id) openDetail(item);
  };

  const fetchRecords = useCallback((opts = {}) => {
    setLoading(true);
    const fresh = opts.fresh ? { _: Date.now() } : undefined;
    return Promise.all([
      getDesignations(fresh),
      getDepartments(fresh),
      getDesignationSettings(fresh).then(normalizeDesignationSettings).catch(() => null),
    ])
      .then(([desigRes, deptRes, settingsRes]) => {
        if (settingsRes) setSettings(settingsRes);
        const desigItems = desigRes?.items || desigRes?.data || (Array.isArray(desigRes) ? desigRes : []);
        setRecords(Array.isArray(desigItems) ? desigItems : []);
        const deptItems = deptRes?.data || deptRes?.items || (Array.isArray(deptRes) ? deptRes : []);
        setDepartments(Array.isArray(deptItems) ? deptItems : []);
        setLastUpdated(new Date());
        return true;
      })
      .catch((err) => {
        console.error(err);
        setNotice({ type: "error", text: err?.message || "Could not load designations." });
        return false;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setNotice(null);
    const ok = await fetchRecords({ fresh: true });
    if (ok) setNotice({ type: "success", text: "Designation list refreshed." });
    setRefreshing(false);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ ...initialForm, status: settings.default_status || "active" });
    setNewPeople([]);
    setModalError("");
    setShowModal(true);
  };

  const handleOpenEdit = (item, e) => {
    e.stopPropagation();
    setEditingId(item.id);
    setFormData({
      title: item.title || "",
      department_name: item.department_name || "",
      level: item.level || "",
      description: item.description || "",
      status: item.status || "active",
    });
    setNewPeople([]);
    setModalError("");
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...formData, department_name: formData.department_name || null, level: formData.level || null };
    const action = editingId
      ? updateDesignation(editingId, payload)
      : createDesignation(payload);
    let given = 0;

    action
      .then((res) => {
        const saved = res?.data || res;
        if (!editingId && newPeople.length && saved?.id && (saved.status || "active") === "active" && saved.approval_status !== "pending") {
          return assignDesignation(saved.id, { employee_ids: newPeople.map((p) => p.id), sync_job_title: true })
            .then((r) => { given = r?.assigned ?? 0; });
        }
      })
      .then(() => {
        setShowModal(false);
        setNotice({
          type: "success",
          text: editingId
            ? "Designation updated."
            : `Designation created.${given ? ` Given to ${given} ${given === 1 ? "person" : "people"}.` : newPeople.length ? " It needs approval or is inactive, so nobody was assigned yet." : ""}`,
        });
        notifyDesignationsUpdated();
        return fetchRecords({ fresh: true });
      })
      .catch((err) => {
        console.error("Error saving record:", err);
        setModalError(err?.message || "Could not save the designation.");
      });
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this designation?")) {
      deleteDesignation(id)
        .then(() => {
          setNotice({ type: "success", text: "Designation deleted." });
          notifyDesignationsUpdated();
          return fetchRecords({ fresh: true });
        })
        .catch((err) => {
          setNotice({ type: "error", text: err?.message || "Could not delete the designation." });
        });
    }
  };

  const openPositionAuthorization = async (item) => {
    setPositionBusy(true); setPositionError("");
    try {
      const [record, jdResponse] = await Promise.all([
        getPositionAuthorization(item.id),
        getJobDescriptions({ designation_id: item.id }),
      ]);
      setPositionAuthorization({ ...record, title: item.title });
      setJobDescriptions((jdResponse?.items || []).filter((jd) => jd.status === "APPROVED"));
      setPositionReason(record.position_reason || "");
      setReportsToId((record.reports_to_designation_id ?? item.reports_to_designation_id) ? String(record.reports_to_designation_id ?? item.reports_to_designation_id) : "");
      setPayGradeId((record.pay_grade_id ?? item.pay_grade_id) ? String(record.pay_grade_id ?? item.pay_grade_id) : "");
      setEmploymentType(record.employment_type || item.employment_type || "");
      setPositionLocation(record.location || item.location || "");
      setJobDescriptionId((record.job_description_id ?? item.job_description_id) ? String(record.job_description_id ?? item.job_description_id) : "");
      setPositionComment("");
    } catch (err) { setPositionError(err.message || "Could not load the position authorization record."); }
    finally { setPositionBusy(false); }
  };

  const requestPosition = async () => {
    if (!positionAuthorization || !positionReason.trim()) { setPositionError("Enter a reason for this position request."); return; }
    setPositionBusy(true); setPositionError("");
    try {
      await requestPositionApproval(positionAuthorization.id, {
        reason: positionReason.trim(),
        reports_to_designation_id: reportsToId ? Number(reportsToId) : null,
        pay_grade_id: payGradeId ? Number(payGradeId) : null,
        employment_type: employmentType.trim() || null,
        location: positionLocation.trim() || null,
        job_description_id: jobDescriptionId ? Number(jobDescriptionId) : null,
      });
      await openPositionAuthorization(positionAuthorization);
      await fetchRecords({ fresh: true });
    } catch (err) { setPositionError(err.message || "Could not submit the position request."); }
    finally { setPositionBusy(false); }
  };

  const decidePosition = async (approve) => {
    if (!positionAuthorization) return;
    if (!approve && !positionComment.trim()) { setPositionError("A comment is required when rejecting."); return; }
    setPositionBusy(true); setPositionError("");
    try {
      await decidePositionApproval(positionAuthorization.id, { approve, comment: positionComment.trim() || null });
      await openPositionAuthorization(positionAuthorization);
      await fetchRecords({ fresh: true });
    } catch (err) { setPositionError(err.message || "Could not save the position decision."); }
    finally { setPositionBusy(false); }
  };

  // Metrics for quick summary ribbon
  const totalRoles = records.length;
  const activeRoles = records.filter((r) => (r.status || "active") === "active").length;
  const filledRoles = records.filter((r) => (r.employees_count || 0) > 0).length;

  return (
    <DesignationLayout
      title="Designation Directory"
      subtitle="Comprehensive catalogue of organizational roles, hierarchy mapping, and workforce assignments"
      lastUpdated={lastUpdated}
      isRefreshing={refreshing}
      onRefresh={handleRefresh}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Designation</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh designations"
            title="Refresh from the server"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-white hover:bg-white/20 transition-all disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      }
    >
      {/* Feedback Toast / Banner */}
      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xs transition-all ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span className="font-medium">{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metric Quick-Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Roles</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalRoles}</p>
          <p className="text-xs text-gray-400 mt-0.5">{activeRoles} active in org</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Status</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{activeRoles}</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalRoles - activeRoles} inactive or archived</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Filled Roles</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{filledRoles}</p>
          <p className="text-xs text-gray-400 mt-0.5">Holding active staff</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Unfilled Roles</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalRoles - filledRoles}</p>
          <p className="text-xs text-gray-400 mt-0.5">Zero current assignees</p>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, department, level..."
              aria-label="Search designations"
              className="w-full pl-10 pr-4 py-2 bg-gray-50/70 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="filter-source" className="text-xs font-semibold text-gray-500 sr-only">Source</label>
              <select
                id="filter-source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filter by source"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="all">All sources</option>
                <option value="manual">Added manually</option>
                <option value="import">Employee import</option>
                <option value="user_form">Add User form</option>
                <option value="none">Before tracking</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="filter-dept" className="text-xs font-semibold text-gray-500 sr-only">Department</label>
              <select
                id="filter-dept"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Filter by department"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="filter-status" className="text-xs font-semibold text-gray-500 sr-only">Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {(search || sourceFilter !== "all" || departmentFilter !== "all" || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSourceFilter("all");
                  setDepartmentFilter("all");
                  setStatusFilter("all");
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Designation Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Designation Title</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                {settings.show_salary_range && (
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Salary Range</th>
                )}
                {settings.show_employee_count && (
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Employees</th>
                )}
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={6 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-5 py-12 text-center text-sm text-gray-400" role="status">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                      <span>Loading designations...</span>
                    </div>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-5 py-12 text-center text-sm text-gray-500">
                    {records.length === 0
                      ? "No designations yet. Click \"Add Designation\" or upload employees with a Designation column."
                      : "No designations match your search or filter."}
                  </td>
                </tr>
              ) : null}

              {visible.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openDetail(item)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  <td className={`${cell} text-sm font-semibold text-gray-900`}>{item.title}</td>
                  <td className={`${cell} text-sm text-gray-600`}>
                    {item.department_name ? (
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        <span>{item.department_name}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={`${cell} text-sm text-gray-600`}>
                    {item.level ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.level}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">No level</span>
                    )}
                  </td>
                  {settings.show_salary_range && (
                    <td className={`${cell} text-sm font-mono text-gray-700`}>
                      {item.min_salary != null || item.max_salary != null
                        ? `${item.min_salary != null ? Number(item.min_salary).toLocaleString() : "?"} – ${item.max_salary != null ? Number(item.max_salary).toLocaleString() : "?"}`
                        : "—"}
                    </td>
                  )}
                  {settings.show_employee_count && (
                    <td className={`${cell} text-sm text-gray-600`}>
                      {item.employees_count ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <Users className="w-3.5 h-3.5 text-blue-500" />
                          <span>{peopleCount(item.employees_count)}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  <td className={`${cell} text-xs text-gray-500`} title={item.created_by_name ? `Created by ${item.created_by_name}` : undefined}>
                    <span className="block font-medium text-gray-700">{sourceLabel(item.source)}</span>
                    {item.created_at ? (
                      <span className="text-gray-400 text-[11px]">
                        {formatDate(item.created_at)}
                        {item.created_by_name ? ` · ${item.created_by_name}` : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${cell} text-sm`}>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        item.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {item.status || "active"}
                    </span>
                  </td>
                  <td className={`${cell} whitespace-nowrap text-right text-sm`}>
                    <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(item, e)}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setAssigning(item); }}
                        disabled={!canAssign(item)}
                        aria-label={`Assign ${item.title} to employees`}
                        title={canAssign(item) ? "Give this designation to existing employees" : "Only an active, approved designation can be assigned"}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.id, e)}
                        disabled={item.employees_count > 0}
                        title={item.employees_count > 0 ? `${item.employees_count} employee(s) hold this designation; reassign them first` : "Delete designation"}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs text-gray-600">
            <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(safePage - 1)}
                disabled={safePage <= 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="px-2">Page {safePage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Detail Panel */}
      {showDetail && detailItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end transition-opacity">
          <div className="w-full max-w-full sm:max-w-md bg-white h-full p-4 sm:p-6 shadow-2xl overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-gray-100 mb-5">
                <div>
                  <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Role Details</span>
                  <h2 className="text-xl font-bold text-gray-900 mt-0.5">{detailItem.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetail(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Department</p>
                      <p className="font-semibold text-gray-900 mt-0.5">{detailItem.department_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Hierarchy Level</p>
                      <p className="font-semibold text-gray-900 mt-0.5">{detailItem.level || "No level yet"}</p>
                    </div>
                  </div>
                </div>

                <section aria-label="People with this designation">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      People with this designation
                    </h3>
                    {canAssign(detailItem) && (
                      <button
                        type="button"
                        onClick={() => setAssigning(detailItem)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Assign to employees
                      </button>
                    )}
                  </div>
                  {holders === null ? (
                    <p className="text-sm text-gray-400 py-3" role="status">Loading...</p>
                  ) : holders.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100">Nobody yet.</p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                      {holders.map((h) => (
                        <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white hover:bg-gray-50">
                          <span className="font-medium text-gray-900">
                            {h.name}
                            {h.employee_code ? <span className="text-gray-400 font-normal"> · {h.employee_code}</span> : null}
                          </span>
                          {h.status !== "active" && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
                              {String(h.status || "").replace(/_/g, " ")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div>
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Description</h3>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-100 leading-relaxed">
                    {detailItem.description || "N/A"}
                  </p>
                </div>
              </div>

              {/* Position Authorization Card */}
              <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Position authorization</h3>
                    <p className="text-xs text-gray-600">Approval is required before this designation can become active.</p>
                  </div>
                  <button
                    type="button"
                    disabled={positionBusy}
                    onClick={() => openPositionAuthorization(detailItem)}
                    className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    View authorization
                  </button>
                </div>
                {positionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{positionError}</p>}
                {positionAuthorization?.id === detailItem.id && (
                  <div className="mt-4 space-y-3 border-t border-blue-100/80 pt-3">
                    <p className="text-xs text-gray-700 font-medium">Status: <strong className="capitalize text-slate-900">{positionAuthorization.approval_status || "not requested"}</strong></p>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2 bg-white/70 p-3 rounded-xl border border-blue-100/60">
                      <div><dt className="text-gray-400 font-medium">Reason</dt><dd className="font-semibold text-gray-800">{positionAuthorization.position_reason || "—"}</dd></div>
                      <div><dt className="text-gray-400 font-medium">Requested by</dt><dd className="font-semibold text-gray-800">{positionAuthorization.requested_by || "—"}</dd></div>
                      <div><dt className="text-gray-400 font-medium">Decided by</dt><dd className="font-semibold text-gray-800">{positionAuthorization.decided_by || "—"}</dd></div>
                      <div><dt className="text-gray-400 font-medium">Decision comment</dt><dd className="font-semibold text-gray-800">{positionAuthorization.decision_comment || "—"}</dd></div>
                    </dl>
                    {positionAuthorization.approval_status !== "pending" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-medium text-gray-600">Reason for position request<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" value={positionReason} onChange={(e) => setPositionReason(e.target.value)} maxLength={4000} /></label>
                        <label className="text-xs font-medium text-gray-600">Reports to designation ID<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" type="number" value={reportsToId} onChange={(e) => setReportsToId(e.target.value)} /></label>
                        <label className="text-xs font-medium text-gray-600">Pay grade ID<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" type="number" value={payGradeId} onChange={(e) => setPayGradeId(e.target.value)} /></label>
                        <label className="text-xs font-medium text-gray-600">Employment type<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} maxLength={30} /></label>
                        <label className="text-xs font-medium text-gray-600">Location<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" value={positionLocation} onChange={(e) => setPositionLocation(e.target.value)} maxLength={200} /></label>
                        <label className="text-xs font-medium text-gray-600">Approved job description<select className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" value={jobDescriptionId} onChange={(e) => setJobDescriptionId(e.target.value)}><option value="">No job description linked</option>{jobDescriptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.reference} · {jd.title} · v{jd.version}</option>)}</select></label>
                        <div className="flex items-end col-span-2 pt-1"><button type="button" disabled={positionBusy || !positionReason.trim()} onClick={requestPosition} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-blue-700 transition-colors">Submit position request</button></div>
                      </div>
                    )}
                    {positionAuthorization.approval_status === "pending" && (
                      <div className="flex flex-wrap items-end gap-2 pt-2">
                        <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-600">Decision comment<textarea className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" rows={2} value={positionComment} onChange={(e) => setPositionComment(e.target.value)} maxLength={2000} /></label>
                        <button type="button" disabled={positionBusy} onClick={() => decidePosition(true)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                        <button type="button" disabled={positionBusy || !positionComment.trim()} onClick={() => decidePosition(false)} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 hover:bg-rose-50">Reject</button>
                      </div>
                    )}
                    {positionAuthorization.approval_status === "approved" && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs text-gray-600">Document readiness and missing fields can be checked here; issue documents from Generated documents.</span>
                        <GenerateDocumentButton canonicalId="HR-ORG-004" subjectType="org" subjectId={positionAuthorization.id} sourceRef={`designation:${positionAuthorization.id}`} label="Check / generate position document" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDetail(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition-colors"
            >
              Close Panel
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Designation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-gray-100"
          >
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">{editingId ? "Edit Designation" : "Add New Designation"}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Define role parameters, department alignment, and hierarchy level</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  required
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
              <div>
                <label htmlFor="designation-department" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department (optional)</label>
                <select
                  id="designation-department"
                  value={formData.department_name}
                  onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all"
                >
                  <option value="">Any department</option>
                  {formData.department_name && !departments.some((d) => d.name === formData.department_name) && (
                    <option value={formData.department_name}>{formData.department_name}</option>
                  )}
                  {departments.length === 0 ? (
                    <option value="" disabled>No departments available. Please create a department first.</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="designation-level" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Hierarchy Level</label>
                  <select
                    id="designation-level"
                    aria-label="Hierarchy Level"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all"
                  >
                    <option value="">No level yet</option>
                    {levelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all"
                  >
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              {!editingId ? (
                <PeopleMultiPicker id="designation-new-people" label="Give it to employees (optional)" value={newPeople} onChange={setNewPeople} />
              ) : (
                <p className="rounded-xl bg-gray-50 px-3.5 py-2.5 text-xs text-gray-600 border border-gray-100">
                  {peopleCount(records.find((r) => r.id === editingId)?.employees_count)} hold this designation. Use <strong>Assign</strong> in the list to give it to more people.
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  placeholder="Brief details about responsibilities..."
                />
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-gray-100 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-[0.98]"
              >
                Save Designation
              </button>
            </div>
          </form>
        </div>
      )}

      {assigning && (
        <AssignPeopleDialog designation={assigning} onClose={() => setAssigning(null)} onDone={assignedDone} />
      )}
    </DesignationLayout>
  );
}
