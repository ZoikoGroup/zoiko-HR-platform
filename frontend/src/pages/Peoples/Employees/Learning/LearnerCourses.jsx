import { useMemo, useState } from "react";
import { Award, BookOpen, ChevronRight, FileText } from "lucide-react";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { courseProgress, attemptsLeft, openQuizzes } from "../../../../utils/employeeLearning";

function CourseCard({ course, assessments, attemptsByAssessment, onStartQuiz }) {
  const progress = courseProgress(assessments, attemptsByAssessment);
  const status = progress.status;
  const open = openQuizzes(assessments, attemptsByAssessment);

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${status === "completed" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-blue-50 dark:bg-blue-900/30"}`}>
              <BookOpen className={`w-5 h-5 ${status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{course.course_name}</h3>
              {course.category && <p className="text-xs text-gray-400 dark:text-[#94a3b8] mt-0.5 capitalize">{course.category}</p>}
            </div>
          </div>
          <EmployeeStatusBadge status={status} />
        </div>

        {course.description && <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-2">{course.description}</p>}

        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-4">
          {course.duration_hours != null && <span>{course.duration_hours}h</span>}
          {course.provider && <span>{course.provider}</span>}
          {assessments.length > 0 && <span>{assessments.length} quiz{assessments.length > 1 ? "zes" : ""}</span>}
        </div>

        {course.resource_link && (
          <a href={course.resource_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 mb-3">
            Open course material &rarr;
          </a>
        )}

        {progress.passedCount > 0 && (
          <div className="mb-3 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <Award size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Badge earned — {progress.passedCount} quiz{progress.passedCount > 1 ? "zes" : ""} passed</span>
          </div>
        )}

        {open.map((a) => {
          const left = attemptsLeft(a, attemptsByAssessment[a.id]);
          return (
            <button
              key={a.id}
              onClick={() => onStartQuiz(course, a)}
              className="w-full mb-2 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <FileText size={13} /> {a.title || "Take Quiz"}{left !== null ? ` (${left} ${left === 1 ? "try" : "tries"} left)` : ""} <ChevronRight size={13} />
            </button>
          );
        })}
        {assessments.length > 0 && open.length === 0 && status !== "completed" && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">You have used all your tries for this course's quizzes.</p>
        )}
      </div>
    </div>
  );
}

export default function LearnerCourses({ courses, assessmentsByCourse, attemptsByAssessment, department, onStartQuiz }) {
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
            <CourseCard
              key={course.id}
              course={course}
              assessments={assessmentsByCourse[course.id] || []}
              attemptsByAssessment={attemptsByAssessment}
              onStartQuiz={onStartQuiz}
            />
          ))}
        </div>
      )}
    </div>
  );
}
