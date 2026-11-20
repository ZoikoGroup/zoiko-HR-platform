import { useEffect, useRef, useState } from "react";
import { getCourses, getEnrollments, createEnrollment, updateEnrollment, deleteEnrollment } from "../../../service/hrService";
import { fetchAllPages } from "../../../utils/learningPaging";
import EmployeePicker from "./EmployeePicker.jsx";
import { Banner, Dialog, DialogButtons, Pager, Table, asPage, inputCls, PER_PAGE } from "./recordsKit.jsx";

export const ENROLLMENT_STATUSES = [
  { value: "enrolled", label: "Enrolled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];
const statusLabel = (s) => ENROLLMENT_STATUSES.find((o) => o.value === s)?.label || s || "-";

/** Admin screen (audit L4): who is enrolled in which course, enrolling people, moving them along, removing them. */
export default function LearningEnrollments() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);

  const load = async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const res = asPage(await getEnrollments({ page, per_page: PER_PAGE, course_id: courseFilter || undefined, status: statusFilter || undefined }));
      if (ticket !== latest.current) return;
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      if (ticket === latest.current) { setRows([]); setError(err?.message || "Enrollments could not be loaded."); }
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, courseFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchAllPages(getCourses).then((list) => setCourses(list || [])).catch(() => setCourses([]));
  }, []);

  const changeStatus = async (row, status) => {
    setError(""); setNotice("");
    try {
      await updateEnrollment(row.id, { status });
      setNotice(`${row.employee_name || "The enrollment"} is now ${statusLabel(status).toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err?.message || "The enrollment could not be updated.");
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.employee_name || "this person"} from "${row.course_name || "the course"}"?`)) return;
    setError(""); setNotice("");
    try {
      await deleteEnrollment(row.id);
      setNotice("The enrollment was removed.");
      await load();
    } catch (err) {
      setError(err?.message || "The enrollment could not be removed.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError("")} />
      <Banner message={notice} tone="ok" onClose={() => setNotice("")} />
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Filter by course" value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1); }} className="border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 text-sm">
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="border border-gray-200 dark:border-[#334155] rounded-lg px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {ENROLLMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setAdding(true)} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">+ Enroll Employee</button>
      </div>

      <Table headers={["Employee", "Course", "Status", "Progress", "Enrolled", "Actions"]}
        empty={<>
          {!loading && rows.length === 0 && <p className="text-center py-10 text-gray-500 dark:text-[#94a3b8]">{courseFilter || statusFilter ? "No enrollments match these filters." : "No one is enrolled yet. Use Enroll Employee to add someone."}</p>}
          <Pager page={page} total={total} onPage={setPage} />
        </>}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-[#0f172a]">
            <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f1f5f9]">{r.employee_name || `Employee #${r.employee_id}`}</td>
            <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{r.course_name || `Course #${r.course_id}`}</td>
            <td className="px-4 py-3">
              <select aria-label={`Status of ${r.employee_name || r.id}`} value={r.status} onChange={(e) => changeStatus(r, e.target.value)} className="border border-gray-200 dark:border-[#334155] rounded px-2 py-1 text-xs">
                {ENROLLMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </td>
            <td className="px-4 py-3 text-gray-700 dark:text-[#e2e8f0]">{r.progress_pct ?? 0}%</td>
            <td className="px-4 py-3 text-xs text-gray-500 dark:text-[#94a3b8]">{r.enrolled_at ? String(r.enrolled_at).slice(0, 10) : "-"}</td>
            <td className="px-4 py-3 text-right"><button type="button" onClick={() => remove(r)} className="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button></td>
          </tr>
        ))}
      </Table>

      {adding && (
        <EnrollDialog courses={courses} onClose={() => setAdding(false)}
          onDone={async (msg) => { setAdding(false); setNotice(msg); setPage(1); await load(); }} />
      )}
    </div>
  );
}

function EnrollDialog({ courses, onClose, onDone }) {
  const [courseId, setCourseId] = useState("");
  const [person, setPerson] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!courseId) next.course = "Choose a course.";
    if (!person) next.person = "Choose who to enroll.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await createEnrollment(Number(courseId), person.id);
      const course = courses.find((c) => String(c.id) === String(courseId));
      await onDone(`${person.name} is enrolled in "${course?.course_name || "the course"}".`);
    } catch (err) {
      setErrors({ submit: err?.message || "The enrollment could not be saved." });      // e.g. 409 already enrolled
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Enroll Employee" onClose={onClose}>
      <form noValidate onSubmit={submit} className="space-y-4">
        {errors.submit && <p role="alert" className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg">{errors.submit}</p>}
        <div>
          <label htmlFor="enroll-course" className="block text-sm font-medium text-gray-700 dark:text-[#e2e8f0] mb-1">Course<span className="text-red-500"> *</span></label>
          <select id="enroll-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
            <option value="">Select a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}{c.status && c.status !== "active" ? ` (${c.status})` : ""}</option>)}
          </select>
          {errors.course && <p role="alert" className="text-red-500 text-xs mt-1">{errors.course}</p>}
        </div>
        <EmployeePicker id="enroll-person" label="Employee" required value={person} onChange={setPerson} error={errors.person} />
        <DialogButtons busy={busy} label="Enroll" busyLabel="Enrolling..." onCancel={onClose} />
      </form>
    </Dialog>
  );
}
