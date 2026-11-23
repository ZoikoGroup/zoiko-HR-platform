import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";

const TYPE_LABELS = { online: "Online", classroom: "Classroom", workshop: "Workshop", webinar: "Webinar", self_paced: "Self-paced", "self-paced": "Self-paced", blended: "Blended" };
const typeLabel = (t) => TYPE_LABELS[String(t || "").toLowerCase()] || String(t || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const ENROLLMENT_LABELS = { enrolled: "Enrolled", in_progress: "In progress", completed: "Completed", dropped: "Dropped" };

/** Enroll yourself, or see that you already are (audit L4). */
function EnrollControl({ course, enrollment, onEnroll }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (enrollment) {
    const pct = Math.max(0, Math.min(100, Number(enrollment.progress_pct) || 0));
    return (
      <div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
          {ENROLLMENT_LABELS[enrollment.status] || "Enrolled"}
        </span>
        {enrollment.status !== "dropped" && (
          // progress = the course's quizzes passed (set by the server; a course without quizzes is updated by an admin)
          <div className="mt-2" aria-label={`Progress ${pct}%`}>
            <div className="flex justify-between text-[11px] text-gray-500 dark:text-[#94a3b8] mb-1">
              <span>Progress</span><span className="font-semibold text-gray-700 dark:text-[#e2e8f0]">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#334155] overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }
  if (!onEnroll) return null;
  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onEnroll(course);
    } catch (err) {
      setError(err?.message || "You could not be enrolled. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} aria-label={`Enroll in ${course.course_name}`}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-xs font-semibold">
        {busy ? "Enrolling..." : "Enroll"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** A course as the organization set it up: its details and where to learn it. Quizzes are on the Assessments tab. */
function CourseCard({ course, enrollment, onEnroll }) {
  const meta = [
    course.duration_hours != null && course.duration_hours !== "" ? `${course.duration_hours} hour${Number(course.duration_hours) === 1 ? "" : "s"}` : null,
    course.provider || null,
  ].filter(Boolean);

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col" data-testid="course-card">
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 shrink-0">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{course.course_name}</h3>
            {course.category && <p className="text-xs text-gray-400 dark:text-[#94a3b8] mt-0.5 capitalize">{course.category}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {course.course_type && <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">{typeLabel(course.course_type)}</span>}
          <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold capitalize">{course.department ? course.department : "Everyone"}</span>
        </div>

        {course.description && <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-3">{course.description}</p>}

        {meta.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-4">
            {meta.map((m) => <span key={m}>{m}</span>)}
          </div>
        )}

        <div className="mb-3"><EnrollControl course={course} enrollment={enrollment} onEnroll={onEnroll} /></div>

        {course.resource_link && (
          <a href={course.resource_link} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
            Open course material &rarr;
          </a>
        )}
      </div>
    </div>
  );
}

export default function LearnerCourses({ courses, department, enrollments = {}, onEnroll }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (courses || []).filter((c) => !term || (c.course_name || "").toLowerCase().includes(term)),
    [courses, term],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label="Search courses"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm pl-4 pr-4 py-2 border border-gray-200 dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#f1f5f9] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {department && (
          <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#94a3b8]">
            <span className="text-xs font-semibold text-gray-400 dark:text-[#94a3b8] uppercase tracking-wide">Department:</span>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold capitalize">{department}</span>
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-[#475569] mx-auto mb-4" />
          <p className="text-base font-semibold text-gray-700 dark:text-[#cbd5e1] mb-1">{search ? "No courses match your search" : "No courses available yet"}</p>
          <p className="text-sm text-gray-400 dark:text-[#64748b]">{search ? "Try a different search term." : "Courses for everyone and for your department will appear here."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} enrollment={enrollments?.[course.id]} onEnroll={onEnroll} />
          ))}
        </div>
      )}
    </div>
  );
}
