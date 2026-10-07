import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseById,
} from "../../../service/hrService";
import {
  COURSE_TYPES, COURSE_STATUSES, EMPTY_COURSE, courseToForm, validateCourseForm, coursePayload,
  serverCourseErrors, missingDetails, typeLabel,
} from "../../../utils/courseForm";

const ITEMS_PER_PAGE = 8;

const inputBase = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// One form for adding and editing, so both ask for (and check) exactly the same things.
function CourseForm({ title, form, setForm, errors, setErrors, submitting, submitLabel, busyLabel, onSubmit, onCancel, showStatus }) {
  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const star = <span className="text-red-500"> *</span>;

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
            <label htmlFor="c-title" className="block text-sm font-medium text-gray-700 mb-1">Course Name{star}</label>
            <input id="c-title" type="text" value={form.title} maxLength={200} aria-invalid={!!errors.title} onChange={set("title")} className={box("title")} />
            {err("title")}
          </div>

          <div>
            <label htmlFor="c-desc" className="block text-sm font-medium text-gray-700 mb-1">Description{star}</label>
            <textarea id="c-desc" rows={3} value={form.description} maxLength={5000} aria-invalid={!!errors.description} onChange={set("description")} className={box("description")} />
            {err("description")}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="c-category" className="block text-sm font-medium text-gray-700 mb-1">Category{star}</label>
              <input id="c-category" type="text" value={form.category} maxLength={100} aria-invalid={!!errors.category} onChange={set("category")} placeholder="e.g. Compliance, Technical" className={box("category")} />
              {err("category")}
            </div>
            <div>
              <label htmlFor="c-provider" className="block text-sm font-medium text-gray-700 mb-1">Provider{star}</label>
              <input id="c-provider" type="text" value={form.provider} maxLength={150} aria-invalid={!!errors.provider} onChange={set("provider")} placeholder="e.g. Coursera, Internal" className={box("provider")} />
              {err("provider")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="c-type" className="block text-sm font-medium text-gray-700 mb-1">Course Type{star}</label>
              <select id="c-type" value={form.course_type} aria-invalid={!!errors.course_type} onChange={set("course_type")} className={box("course_type")}>
                <option value="">Select type</option>
                {COURSE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {err("course_type")}
            </div>
            <div>
              <label htmlFor="c-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (hours){star}</label>
              <input id="c-duration" type="number" min={1} max={1000} step={1} value={form.duration} aria-invalid={!!errors.duration} onChange={set("duration")} placeholder="e.g. 10" className={box("duration")} />
              {err("duration")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="c-dept" className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input id="c-dept" type="text" value={form.department} maxLength={100} aria-invalid={!!errors.department} onChange={set("department")} placeholder="e.g. Engineering" className={box("department")} />
              {err("department")}
            </div>
            <div>
              <label htmlFor="c-link" className="block text-sm font-medium text-gray-700 mb-1">Resource Link</label>
              <input id="c-link" type="text" value={form.resource_link} maxLength={500} aria-invalid={!!errors.resource_link} onChange={set("resource_link")} placeholder="https://example.com/course" className={box("resource_link")} />
              {err("resource_link")}
            </div>
          </div>

          {showStatus && (
            <div>
              <label htmlFor="c-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select id="c-status" value={form.status} onChange={set("status")} className={box("status")}>
                {COURSE_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Learners only see active courses.</p>
              {err("status")}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:bg-blue-400">
              {submitting ? busyLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LearningCourses({ isTab }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_COURSE });
  const [formErrors, setFormErrors] = useState({});

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourses({ per_page: 200 });
      const items = data?.items || (Array.isArray(data) ? data : []);
      setCourses(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(err.message || "Failed to load courses");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const stats = useMemo(() => {
    const total = courses.length;
    const categories = new Set(courses.map((c) => c.category).filter(Boolean)).size;
    const incomplete = courses.filter((c) => missingDetails(c).length > 0).length;
    return { total, categories, incomplete };
  }, [courses]);

  const categories = useMemo(() => [...new Set(courses.map((c) => c.category).filter(Boolean))], [courses]);

  const filtered = useMemo(() => {
    let result = courses;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.course_name?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q) || c.provider?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter((c) => c.category === categoryFilter);
    return result;
  }, [courses, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const openCreate = () => { setFormData({ ...EMPTY_COURSE }); setFormErrors({}); setShowCreateModal(true); };
  const closeForm = () => { setShowCreateModal(false); setEditItem(null); setFormErrors({}); };

  const openEdit = (course) => {
    setEditItem(course);
    setFormData(courseToForm(course));
    setFormErrors({});
  };

  const save = async (e, existing) => {
    e.preventDefault();
    const errors = validateCourseForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = coursePayload(formData);
      if (existing) await updateCourse(existing.id, payload);
      else await createCourse({ ...payload, status: undefined });
      closeForm();
      await fetchCourses();
    } catch (err) {
      // the server's refusal appears under its own field; the dialog stays open so nothing typed is lost
      const fields = serverCourseErrors(err?.validation);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || (existing ? "The course could not be updated." : "The course could not be created.") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (course) => {
    if (!window.confirm(`Delete "${course.course_name}"?`)) return;
    try {
      await deleteCourse(course.id);
      await fetchCourses();
    } catch (err) {
      setError(err.message || "Failed to delete course");
    }
  };

  const openDetail = async (id) => {
    try {
      const data = await getCourseById(id);
      setDetailItem(data);
    } catch (err) {
      setError(err.message || "Failed to load course details");
    }
  };

  if (loading && courses.length === 0) {
    const loadingEl = (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading courses...</span>
      </div>
    );
    if (isTab) return loadingEl;
    return (
      <HRPage title="Courses" subtitle="Manage course catalog, categories, and providers.">
        {loadingEl}
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
            <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Total: </span>
              <span className="font-bold text-gray-800">{stats.total}</span>
            </div>
            <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Categories: </span>
              <span className="font-bold text-blue-600">{stats.categories}</span>
            </div>
            {stats.incomplete > 0 && (
              <div className="bg-amber-50 px-4 py-2 border border-amber-200 rounded-lg shadow-sm text-sm text-amber-800">
                <span className="font-bold">{stats.incomplete}</span> incomplete course{stats.incomplete === 1 ? "" : "s"}, edit to fill in the missing details
              </div>
            )}
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Course
          </button>
        </div>

        {courses.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by title, category, or provider..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-gray-500 font-medium">
              {courses.length === 0 ? "No courses yet. Add your first course to get started." : "No courses match your search criteria."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Title", "Type", "Department", "Category", "Provider", "Duration (hrs)", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((c) => {
                    const gaps = missingDetails(c);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <button onClick={() => openDetail(c.id)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left">
                            {c.course_name}
                          </button>
                          {gaps.length > 0 && (
                            <span title={`Missing: ${gaps.join(", ")}`} className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 align-middle">Incomplete</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{c.course_type ? typeLabel(c.course_type) : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3">
                          {c.department ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{c.department}</span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.category ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{c.category}</span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{c.provider || <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3 text-gray-500">{c.duration_hours != null ? c.duration_hours : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${c.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {c.status || "inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(c)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                            <button onClick={() => handleDelete(c)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center px-6 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {safePage} of {totalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1 text-xs border rounded ${p === safePage ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CourseForm title="Add New Course" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors}
          submitting={submitting} submitLabel="Add Course" busyLabel="Adding..." onSubmit={(e) => save(e, null)} onCancel={closeForm} showStatus={false} />
      )}

      {editItem && (
        <CourseForm title="Edit Course" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors}
          submitting={submitting} submitLabel="Update Course" busyLabel="Updating..." onSubmit={(e) => save(e, editItem)} onCancel={closeForm} showStatus />
      )}

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailItem(null)}>
          <div role="dialog" aria-label="Course details" className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detailItem.course_name}</h2>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${detailItem.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{detailItem.status}</span>
              </div>
              <button aria-label="Close" onClick={() => setDetailItem(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {missingDetails(detailItem).length > 0 && (
                <p role="alert" className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                  This course is missing: {missingDetails(detailItem).join(", ")}. Edit it to complete the information.
                </p>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-1">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap">{detailItem.description || "Not provided"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["Course type", detailItem.course_type ? typeLabel(detailItem.course_type) : "Not provided"],
                  ["Category", detailItem.category || "Not provided"],
                  ["Provider", detailItem.provider || "Not provided"],
                  ["Duration", detailItem.duration_hours != null ? `${detailItem.duration_hours} hour${detailItem.duration_hours === 1 ? "" : "s"}` : "Not provided"],
                  ["Department", detailItem.department || "Not specified"],
                ].map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="font-medium text-gray-800">{value}</dd></div>
                ))}
                <div>
                  <dt className="text-xs text-gray-400">Resource</dt>
                  <dd className="font-medium">
                    {detailItem.resource_link ? <a href={detailItem.resource_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">Open course link</a> : <span className="text-gray-800">Not provided</span>}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isTab) return content;

  return (
    <HRPage title="Courses" subtitle="Manage course catalog, categories, and providers.">
      {content}
    </HRPage>
  );
}
