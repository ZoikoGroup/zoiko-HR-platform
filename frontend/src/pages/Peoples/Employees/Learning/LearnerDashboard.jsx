import { useMemo } from "react";
import { Award, BookOpen, ChevronRight, FileText } from "lucide-react";
import StatCard from "../../../../components/employee/StatCard";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { courseProgress, openQuizzes, learnerSummary } from "../../../../utils/employeeLearning";

export default function LearnerDashboard({ courses, programs, assessmentsByCourse, attemptsByAssessment, department, onStartQuiz, onOpenTab }) {
  const summary = useMemo(
    () => learnerSummary(courses, assessmentsByCourse, attemptsByAssessment),
    [courses, assessmentsByCourse, attemptsByAssessment],
  );

  const inProgress = useMemo(
    () => (courses || []).filter((c) => courseProgress(assessmentsByCourse[c.id] || [], attemptsByAssessment).status === "in_progress"),
    [courses, assessmentsByCourse, attemptsByAssessment],
  );

  const nextQuiz = useMemo(() => {
    for (const course of courses || []) {
      const open = openQuizzes(assessmentsByCourse[course.id] || [], attemptsByAssessment);
      if (open.length > 0) return { course, assessment: open[0] };
    }
    return null;
  }, [courses, assessmentsByCourse, attemptsByAssessment]);

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Courses" value={summary.total} sub={department ? `For ${department}` : "Available to you"} accentColor="text-blue-600 dark:text-blue-400" />
        <StatCard label="Completed" value={summary.completed} sub="Courses finished" accentColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="In Progress" value={summary.inProgress} sub="Underway" accentColor="text-amber-600 dark:text-amber-400" />
        <StatCard label="Badges Earned" value={summary.badges} sub="Quizzes passed" accentColor="text-violet-600 dark:text-violet-400" />
      </div>

      {nextQuiz && (
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/15">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Continue learning</p>
              <p className="text-lg font-bold">{nextQuiz.assessment.title || nextQuiz.course.course_name}</p>
              <p className="text-sm text-blue-100">{nextQuiz.course.course_name}</p>
            </div>
          </div>
          <button
            onClick={() => onStartQuiz(nextQuiz.course, nextQuiz.assessment)}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            Start quiz <ChevronRight size={15} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] flex items-center gap-2">
              <BookOpen size={15} className="text-blue-500" /> In progress
            </h3>
            <button onClick={() => onOpenTab("courses")} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">View all courses</button>
          </div>
          {inProgress.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#64748b] py-6">Nothing underway yet. Start a course from the Courses tab.</p>
          ) : (
            <div className="space-y-2">
              {inProgress.map((c) => {
                const progress = courseProgress(assessmentsByCourse[c.id] || [], attemptsByAssessment);
                const open = openQuizzes(assessmentsByCourse[c.id] || [], attemptsByAssessment);
                return (
                  <div key={c.id} className="flex items-center justify-between bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9] truncate">{c.course_name}</p>
                      <p className="text-xs text-gray-400 dark:text-[#94a3b8]">{progress.passedCount} quiz{progress.passedCount === 1 ? "" : "zes"} passed</p>
                    </div>
                    {open[0] ? (
                      <button onClick={() => onStartQuiz(c, open[0])} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 shrink-0 ml-3">Continue</button>
                    ) : (
                      <EmployeeStatusBadge status="in_progress" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] flex items-center gap-2">
              <Award size={15} className="text-amber-500" /> Training programs
            </h3>
            <button onClick={() => onOpenTab("training-programs")} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">View all</button>
          </div>
          {(programs || []).length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#64748b] py-6">No training programs available yet.</p>
          ) : (
            <div className="space-y-2">
              {programs.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9] truncate">{p.name}</p>
                    {p.start_date && <p className="text-xs text-gray-400 dark:text-[#94a3b8]">Starts {p.start_date}</p>}
                  </div>
                  {p.status && <EmployeeStatusBadge status={p.status} />}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
