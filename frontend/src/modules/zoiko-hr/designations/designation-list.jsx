import { useState, useMemo, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, RefreshCw, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
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
  const [search, setSearch] = useState("");
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
      if (!q) return true;
      return [r.title, r.department_name, r.level].some((v) => String(v || "").toLowerCase().includes(q));
    });
    return sortDesignations(rows, settings.default_sort_field, settings.default_sort_direction);
  }, [records, search, sourceFilter, settings.default_sort_field, settings.default_sort_direction]);

  const pageSize = settings.items_per_page;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);
  useEffect(() => { setPage(1); }, [search, sourceFilter, pageSize]);

  const cell = settings.compact_mode ? "px-4 py-1.5" : "px-4 py-3";
  const levelOptions = useMemo(() => {
    const allowed = LEVEL_OPTIONS.filter((_, i) => i + 1 <= settings.max_hierarchy_depth);
    // an existing designation keeps its current level selectable even if it is now beyond the limit
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
    if (showDetail && detailItem?.id === item.id) openDetail(item);
  };

  const fetchRecords = useCallback((opts = {}) => {
    setLoading(true);
    // A manual refresh must show the database, not a copy the server cached for up to two minutes:
    // the unique query value gives that request its own cache key.
    const fresh = opts.fresh ? { _: Date.now() } : undefined;
    return Promise.all([
      getDesignations(fresh),
      getDepartments(fresh),
      // the list still works with the defaults if the settings cannot be read
      getDesignationSettings(fresh).then(normalizeDesignationSettings).catch(() => null),
    ])
      .then(([desigRes, deptRes, settingsRes]) => {
        if (settingsRes) setSettings(settingsRes);
        const desigItems = desigRes?.items || desigRes?.data || (Array.isArray(desigRes) ? desigRes : []);
        setRecords(Array.isArray(desigItems) ? desigItems : []);
        const deptItems = deptRes?.data || deptRes?.items || (Array.isArray(deptRes) ? deptRes : []);
        setDepartments(Array.isArray(deptItems) ? deptItems : []);
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
    setFormData({ ...initialForm, status: settings.default_status });
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
    // codes are generated by the server; department and level are optional ("No level yet" groups it on the Structure page)
    const payload = { ...formData, department_name: formData.department_name || null, level: formData.level || null };
    const action = editingId
      ? updateDesignation(editingId, payload)
      : createDesignation(payload);
    let given = 0;

    action
      .then((res) => {
        const saved = res?.data || res;
        // a new designation can be given to people at once (one call; the server checks each person)
        if (!editingId && newPeople.length && saved?.id && (saved.status || "active") === "active" && saved.approval_status !== "pending") {
          return assignDesignation(saved.id, { employee_ids: newPeople.map((p) => p.id), sync_job_title: true })
            .then((r) => { given = r?.assigned ?? 0; });
        }
      })
      .then(() => {
        setShowModal(false);
        setNotice({ type: "success", text: editingId ? "Designation updated."
          : `Designation created.${given ? ` Given to ${given} ${given === 1 ? "person" : "people"}.` : newPeople.length ? " It needs approval or is inactive, so nobody was assigned yet." : ""}` });
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
          return fetchRecords({ fresh: true });
        })
        .catch((err) => {
          // e.g. "N employee(s) hold this designation" - say why instead of failing silently.
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

  return (
    <HRPage title="Designation List" breadcrumbs={[{ label: "HR" }, { label: "Designations", href: "/zoiko-hr/designations" }, { label: "List" }]}>
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} to={item.href} className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"}`}>{item.label}</NavLink>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button onClick={handleOpenCreate} className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"><Plus className="w-4 h-4" /> Add Designation</button>
          <button type="button" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh designations" title="Refresh from the server"
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or department..." aria-label="Search designations"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by source"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
            <option value="all">All sources</option>
            <option value="manual">Added manually</option>
            <option value="import">Employee import</option>
            <option value="user_form">Add User form</option>
            <option value="none">Before tracking</option>
          </select>
        </div>
      </div>

      {notice && (
        <div role={notice.type === "error" ? "alert" : "status"}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            notice.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
          }`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                {settings.show_salary_range && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary Range</th>}
                {settings.show_employee_count && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employees</th>}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading && records.length === 0 ? (
                <tr><td colSpan={6 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-4 py-10 text-center text-sm text-gray-400" role="status">Loading designations...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6 + (settings.show_salary_range ? 1 : 0) + (settings.show_employee_count ? 1 : 0)} className="px-4 py-10 text-center text-sm text-gray-500">
                  {records.length === 0
                    ? "No designations yet. Click \"Add Designation\" or upload employees with a Designation column."
                    : "No designations match your search or filter."}
                </td></tr>
              ) : null}
              {visible.map((item) => (
                  <tr key={item.id} onClick={() => openDetail(item)} className="hover:bg-gray-50/80 cursor-pointer transition-colors">
                  <td className={`${cell} text-sm font-medium text-gray-900`}>{item.title}</td>
                  <td className={`${cell} text-sm text-gray-600`}>{item.department_name || "—"}</td>
                  <td className={`${cell} text-sm text-gray-600`}>{item.level || <span className="text-gray-400">No level</span>}</td>
                  {settings.show_salary_range && (
                    <td className={`${cell} text-sm text-gray-600`}>
                      {item.min_salary != null || item.max_salary != null
                        ? `${item.min_salary != null ? Number(item.min_salary).toLocaleString() : "?"} – ${item.max_salary != null ? Number(item.max_salary).toLocaleString() : "?"}`
                        : "—"}
                    </td>
                  )}
                  {settings.show_employee_count && (
                    <td className={`${cell} text-sm text-gray-600`}>
                      {peopleCount(item.employees_count)}
                    </td>
                  )}
                  <td className={`${cell} text-xs text-gray-500`} title={item.created_by_name ? `Created by ${item.created_by_name}` : undefined}>
                    <span className="block text-gray-700">{sourceLabel(item.source)}</span>
                    {item.created_at ? <span>{formatDate(item.created_at)}{item.created_by_name ? ` · ${item.created_by_name}` : ""}</span> : null}
                  </td>
                  <td className={`${cell} text-sm`}>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className={`${cell} whitespace-nowrap text-sm flex gap-3`}>
                    <button onClick={(e) => handleOpenEdit(item, e)} className="text-blue-600 hover:underline">Edit</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAssigning(item); }} disabled={!canAssign(item)}
                      aria-label={`Assign ${item.title} to employees`}
                      title={canAssign(item) ? "Give this designation to existing employees" : "Only an active, approved designation can be assigned"}
                      className="text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">Assign</button>
                    <button onClick={(e) => handleDelete(item.id, e)} disabled={item.employees_count > 0}
                      title={item.employees_count > 0 ? `${item.employees_count} employee(s) hold this designation; reassign them first` : "Delete designation"}
                      className="text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
            <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <span>Page {safePage} of {totalPages}</span>
              <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {showDetail && detailItem && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-full p-6 shadow-xl overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{detailItem.title}</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-500">Department</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.department_name || "—"}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Hierarchy Level</label>
                <p className="text-sm text-gray-900 font-medium">{detailItem.level || "No level yet"}</p>
              </div>
              <section aria-label="People with this designation">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-gray-500">People with this designation</h3>
                  {canAssign(detailItem) && (
                    <button type="button" onClick={() => setAssigning(detailItem)} className="text-sm font-medium text-blue-600 hover:underline">Assign to employees</button>
                  )}
                </div>
                {holders === null ? (
                  <p className="text-sm text-gray-400" role="status">Loading...</p>
                ) : holders.length === 0 ? (
                  <p className="text-sm text-gray-700">Nobody yet.</p>
                ) : (
                  <ul className="mt-1 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                    {holders.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-gray-900">{h.name}{h.employee_code ? <span className="text-gray-400"> · {h.employee_code}</span> : null}</span>
                        {h.status !== "active" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">{String(h.status || "").replace(/_/g, " ")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div>
                <label className="block text-sm font-medium text-gray-500">Description</label>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border">{detailItem.description || "N/A"}</p>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold text-gray-900">Position authorization</h3><p className="text-xs text-gray-600">Approval is required before this designation can become active.</p></div>
                <button type="button" disabled={positionBusy} onClick={() => openPositionAuthorization(detailItem)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">View authorization</button>
              </div>
              {positionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{positionError}</p>}
              {positionAuthorization?.id === detailItem.id && <div className="mt-4 space-y-3 border-t border-blue-100 pt-3">
                <p className="text-sm text-gray-700">Status: <strong className="capitalize">{positionAuthorization.approval_status || "not requested"}</strong></p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-gray-500">Reason</dt><dd>{positionAuthorization.position_reason || "—"}</dd></div>
                  <div><dt className="text-gray-500">Requested by</dt><dd>{positionAuthorization.requested_by || "—"}</dd></div>
                  <div><dt className="text-gray-500">Decided by</dt><dd>{positionAuthorization.decided_by || "—"}</dd></div>
                  <div><dt className="text-gray-500">Decision comment</dt><dd>{positionAuthorization.decision_comment || "—"}</dd></div>
                </dl>
                {positionAuthorization.approval_status !== "pending" && <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-600">Reason for position request<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={positionReason} onChange={(e) => setPositionReason(e.target.value)} maxLength={4000} /></label>
                  <label className="text-xs font-medium text-gray-600">Reports to designation ID<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" value={reportsToId} onChange={(e) => setReportsToId(e.target.value)} /></label>
                  <label className="text-xs font-medium text-gray-600">Pay grade ID<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" value={payGradeId} onChange={(e) => setPayGradeId(e.target.value)} /></label>
                  <label className="text-xs font-medium text-gray-600">Employment type<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} maxLength={30} /></label>
                  <label className="text-xs font-medium text-gray-600">Location<input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={positionLocation} onChange={(e) => setPositionLocation(e.target.value)} maxLength={200} /></label>
                  <label className="text-xs font-medium text-gray-600">Approved job description<select className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={jobDescriptionId} onChange={(e) => setJobDescriptionId(e.target.value)}><option value="">No job description linked</option>{jobDescriptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.reference} · {jd.title} · v{jd.version}</option>)}</select></label>
                  <div className="flex items-end"><button type="button" disabled={positionBusy || !positionReason.trim()} onClick={requestPosition} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Submit position request</button></div>
                </div>}
                {positionAuthorization.approval_status === "pending" && <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-600">Decision comment<textarea className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={positionComment} onChange={(e) => setPositionComment(e.target.value)} maxLength={2000} /></label>
                  <button type="button" disabled={positionBusy} onClick={() => decidePosition(true)} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">Approve</button>
                  <button type="button" disabled={positionBusy || !positionComment.trim()} onClick={() => decidePosition(false)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Reject</button>
                </div>}
                {positionAuthorization.approval_status === "approved" && <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-600">Document readiness and missing fields can be checked here; issue documents from Generated documents.</span>
                  <GenerateDocumentButton canonicalId="HR-ORG-004" subjectType="org" subjectId={positionAuthorization.id} sourceRef={`designation:${positionAuthorization.id}`} label="Check / generate position document" />
                </div>}
              </div>}
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
              {modalError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation Title</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" required placeholder="e.g. Senior Software Engineer" />
              </div>
              <div>
                <label htmlFor="designation-department" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department (optional)</label>
                <select id="designation-department" value={formData.department_name} onChange={(e) => setFormData({ ...formData, department_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="designation-level" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Hierarchy Level</label>
                  <select id="designation-level" value={formData.level} onChange={(e) => setFormData({ ...formData, level: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">No level yet</option>
                    {levelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              {!editingId ? (
                <PeopleMultiPicker id="designation-new-people" label="Give it to employees (optional)" value={newPeople} onChange={setNewPeople} />
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {peopleCount(records.find((r) => r.id === editingId)?.employees_count)} hold this designation. Use <strong>Assign</strong> in the list to give it to more people.
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="Brief details about responsibilities..."></textarea>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">Save Designation</button>
            </div>
          </form>
        </div>
      )}
      {assigning && <AssignPeopleDialog designation={assigning} onClose={() => setAssigning(null)} onDone={assignedDone} />}
    </HRPage>
  );
}