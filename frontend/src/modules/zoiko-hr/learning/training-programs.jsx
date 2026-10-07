import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  deleteTrainingProgram,
  getTrainingProgramById,
  getHrEmployees,
} from "../../../service/hrService";
import { formatDateTime } from "../../../utils/dateTime";
import {
  PROGRAM_STATUSES, EMPTY_PROGRAM, statusOptions, programToForm, validateProgramForm, programPayload,
  serverProgramErrors, missingProgramDetails, dateText,
} from "../../../utils/programForm";

const STATUS_COLORS = {
  planned: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

const ITEMS_PER_PAGE = 10;
const inputBase = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function personName(e) {
  const first = e.firstName || e.first_name;
  const last = e.lastName || e.last_name;
  return e.fullName || e.full_name || (first || last ? `${first || ""} ${last || ""}`.trim() : null) || e.email || `#${e.id}`;
}

// One form for adding and editing, so both ask for (and check) exactly the same things.
function ProgramForm({ title, form, setForm, errors, setErrors, instructors, editing, submitting, submitLabel, busyLabel, onSubmit, onCancel }) {
  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const star = <span className="text-red-500"> *</span>;
  // someone already named as instructor stays selectable even when they are not in the loaded list
  const options = instructors.some((i) => String(i.id) === String(form.instructor_id)) || !form.instructor_id
    ? instructors
    : [{ id: form.instructor_id, name: `Employee #${form.instructor_id}` }, ...instructors];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form noValidate onSubmit={onSubmit} className="p-6 space-y-4">
          {errors.submit && <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{errors.submit}</div>}
          <p className="text-xs text-gray-400">Fields marked <span className="text-red-500">*</span> are required. Learners see all of them.</p>

          <div>
            <label htmlFor="p-name" className="block text-sm font-medium text-gray-700 mb-1">Program Name{star}</label>
            <input id="p-name" type="text" value={form.name} maxLength={200} aria-invalid={!!errors.name} onChange={set("name")} className={box("name")} />
            {err("name")}
          </div>

          <div>
            <label htmlFor="p-desc" className="block text-sm font-medium text-gray-700 mb-1">Description{star}</label>
            <textarea id="p-desc" rows={3} value={form.description} maxLength={5000} aria-invalid={!!errors.description} onChange={set("description")} className={box("description")} />
            {err("description")}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-instructor" className="block text-sm font-medium text-gray-700 mb-1">Instructor{star}</label>
              <select id="p-instructor" value={form.instructor_id} aria-invalid={!!errors.instructor_id} onChange={set("instructor_id")} className={box("instructor_id")}>
                <option value="">Select instructor</option>
                {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {err("instructor_id")}
            </div>
            <div>
              <label htmlFor="p-max" className="block text-sm font-medium text-gray-700 mb-1">Max Participants{star}</label>
              <input id="p-max" type="number" min={1} max={10000} step={1} value={form.max_participants} aria-invalid={!!errors.max_participants} onChange={set("max_participants")} placeholder="e.g. 20" className={box("max_participants")} />
              {err("max_participants")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-start" className="block text-sm font-medium text-gray-700 mb-1">Start Date{star}</label>
              <input id="p-start" type="date" min="2000-01-01" max="2100-12-31" value={form.start_date} aria-invalid={!!errors.start_date} onChange={set("start_date")} className={box("start_date")} />
              {err("start_date")}
            </div>
            <div>
              <label htmlFor="p-end" className="block text-sm font-medium text-gray-700 mb-1">End Date{star}</label>
              <input id="p-end" type="date" min={form.start_date || "2000-01-01"} max="2100-12-31" value={form.end_date} aria-invalid={!!errors.end_date} onChange={set("end_date")} className={box("end_date")} />
              {err("end_date")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-dept" className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input id="p-dept" type="text" value={form.department} maxLength={100} aria-invalid={!!errors.department} onChange={set("department")} placeholder="e.g. Engineering" className={box("department")} />
              {err("department")}
            </div>
            <div>
              <label htmlFor="p-link" className="block text-sm font-medium text-gray-700 mb-1">Resource Link</label>
              <input id="p-link" type="text" value={form.resource_link} maxLength={500} aria-invalid={!!errors.resource_link} onChange={set("resource_link")} placeholder="https://..." className={box("resource_link")} />
              {err("resource_link")}
            </div>
          </div>

          <div>
            <label htmlFor="p-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            {editing ? (
              <select id="p-status" value={form.status} disabled={statusOptions(editing.status).length === 1} onChange={set("status")} className={box("status")}>
                {statusOptions(editing.status).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <p id="p-status" className="px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg border border-gray-100">Planned</p>
            )}
            {editing && statusOptions(editing.status).length === 1 ? <p className="text-[11px] text-gray-400 mt-1">A completed program is final.</p> : null}
            {err("status")}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
              {submitting ? busyLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TrainingPrograms({ isTab }) {
  const [programs, setPrograms] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_PROGRAM });
  const [formErrors, setFormErrors] = useState({});

  const fetchPrograms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrainingPrograms({ per_page: 100 });
      const items = data?.items || (Array.isArray(data) ? data : []);
      setPrograms(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(err.message || "Failed to load training programs");
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
    getHrEmployees({ per_page: 200, include_all_roles: true })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.items || res?.data || [];
        setInstructors(list.map((e) => ({ id: e.id, name: personName(e) })));
      })
      .catch(() => setInstructors([]));
  }, []);

  const nameOf = (p) => p.instructor_name || instructors.find((i) => i.id === p.instructor_id)?.name || (p.instructor_id ? `Employee #${p.instructor_id}` : "");

  const stats = useMemo(() => ({
    total: programs.length,
    planned: programs.filter((p) => p.status === "planned").length,
    active: programs.filter((p) => p.status === "active").length,
    completed: programs.filter((p) => p.status === "completed").length,
    incomplete: programs.filter((p) => missingProgramDetails(p).length > 0).length,
  }), [programs]);

  const filtered = useMemo(() => {
    let result = programs;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || nameOf(p).toLowerCase().includes(q) || p.department?.toLowerCase().includes(q));
    }
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, search, statusFilter, instructors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const openCreate = () => { setFormData({ ...EMPTY_PROGRAM }); setFormErrors({}); setShowCreateModal(true); };
  const closeForm = () => { setShowCreateModal(false); setEditItem(null); setFormErrors({}); };
  const openEdit = (program) => { setEditItem(program); setFormData(programToForm(program)); setFormErrors({}); };

  const save = async (e, existing) => {
    e.preventDefault();
    const errors = validateProgramForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = programPayload(formData);
      if (existing) {
        // the status is sent only when it was changed
        if (payload.status === (existing.status || "planned")) delete payload.status;
        await updateTrainingProgram(existing.id, payload);
      } else {
        delete payload.status;
        await createTrainingProgram(payload);
      }
      closeForm();
      await fetchPrograms();
    } catch (err) {
      // the server's refusal appears under its own field; the dialog stays open so nothing typed is lost
      const fields = serverProgramErrors(err?.validation);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || (existing ? "The program could not be updated." : "The program could not be created.") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (program) => {
    if (!window.confirm(`Delete "${program.name}"?`)) return;
    try {
      await deleteTrainingProgram(program.id);
      await fetchPrograms();
    } catch (err) {
      setError(err.message || "Failed to delete training program");
    }
  };

  const openDetail = async (id) => {
    try {
      setDetailItem(await getTrainingProgramById(id));
    } catch (err) {
      setError(err.message || "Failed to load training program details");
    }
  };

  if (loading && programs.length === 0) {
    const loadingContent = (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading training programs...</span>
      </div>
    );
    if (isTab) return loadingContent;
    return (
      <HRPage title="Training Programs" subtitle="Manage instructor-led training sessions and workshops.">
        {loadingContent}
      </HRPage>
    );
  }

  const content = (
    <>
      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Total: </span><span className="font-bold text-gray-800">{stats.total}</span></div>
            <div className="bg-white px-4 py-2 border border-yellow-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Planned: </span><span className="font-bold text-yellow-600">{stats.planned}</span></div>
            <div className="bg-white px-4 py-2 border border-green-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Active: </span><span className="font-bold text-green-600">{stats.active}</span></div>
            <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Completed: </span><span className="font-bold text-blue-600">{stats.completed}</span></div>
            {stats.incomplete > 0 && (
              <div className="bg-amber-50 px-4 py-2 border border-amber-200 rounded-lg shadow-sm text-sm text-amber-800">
                <span className="font-bold">{stats.incomplete}</span> incomplete program{stats.incomplete === 1 ? "" : "s"}, edit to fill in the missing details
              </div>
            )}
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Program
          </button>
        </div>

        {programs.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name, instructor or department..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {PROGRAM_STATUSES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">🎓</div>
            <p className="text-gray-500 font-medium">
              {programs.length === 0 ? "No training programs yet. Add your first program to get started." : "No programs match your search criteria."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Name", "Department", "Instructor", "Start Date", "End Date", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                      ))}
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Participants</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((p) => {
                      const gaps = missingProgramDetails(p);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            <button onClick={() => openDetail(p.id)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left">{p.name}</button>
                            {gaps.length > 0 && (
                              <span title={`Missing: ${gaps.join(", ")}`} className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 align-middle">Incomplete</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {p.department ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{p.department}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{nameOf(p) || <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{p.start_date ? dateText(p.start_date) : <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{p.end_date ? dateText(p.end_date) : <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status] || STATUS_COLORS.planned}`}>{p.status}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {p.max_participants ? `${p.participants_count || 0}/${p.max_participants}` : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>
                              <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700 text-xs font-medium px-1">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <ProgramForm title="Add Training Program" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} instructors={instructors}
          editing={null} submitting={submitting} submitLabel="Create Program" busyLabel="Creating..." onSubmit={(e) => save(e, null)} onCancel={closeForm} />
      )}

      {editItem && (
        <ProgramForm title="Update Training Program" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} instructors={instructors}
          editing={editItem} submitting={submitting} submitLabel="Update Program" busyLabel="Updating..." onSubmit={(e) => save(e, editItem)} onCancel={closeForm} />
      )}

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailItem(null)}>
          <div role="dialog" aria-label="Program details" className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detailItem.name}</h2>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[detailItem.status] || STATUS_COLORS.planned}`}>{detailItem.status}</span>
              </div>
              <button aria-label="Close" onClick={() => setDetailItem(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {missingProgramDetails(detailItem).length > 0 && (
                <p role="alert" className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                  This program is missing: {missingProgramDetails(detailItem).join(", ")}. Edit it to complete the information.
                </p>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-1">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap">{detailItem.description || "Not provided"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["Instructor", nameOf(detailItem) || "Not provided"],
                  ["Department", detailItem.department || "Not specified"],
                  ["Start date", detailItem.start_date ? dateText(detailItem.start_date) : "Not provided"],
                  ["End date", detailItem.end_date ? dateText(detailItem.end_date) : "Not provided"],
                  ["Participants", `${detailItem.participants_count ?? 0}${detailItem.max_participants ? ` of ${detailItem.max_participants}` : ""}`],
                ].map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="font-medium text-gray-800">{value}</dd></div>
                ))}
                <div>
                  <dt className="text-xs text-gray-400">Resource</dt>
                  <dd className="font-medium">
                    {detailItem.resource_link ? <a href={detailItem.resource_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">Open program link</a> : <span className="text-gray-800">Not provided</span>}
                  </dd>
                </div>
              </dl>
              <div className="pt-4 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                <div>Created: {detailItem.created_at ? formatDateTime(detailItem.created_at) : "-"}</div>
                <div>Updated: {detailItem.updated_at ? formatDateTime(detailItem.updated_at) : "-"}</div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setDetailItem(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
                <button onClick={() => { const item = detailItem; setDetailItem(null); openEdit(item); }} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Edit Program</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isTab) return content;

  return (
    <HRPage title="Training Programs" subtitle="Manage instructor-led training sessions and workshops.">
      {content}
    </HRPage>
  );
}
