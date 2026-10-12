import { useMemo } from "react";
import { Award, ChevronRight, FileText } from "lucide-react";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import { attemptsLeft, quizResult } from "../../../../utils/employeeLearning";

export default function LearnerAssessments({ courses, assessmentsByCourse, attemptsByAssessment, onStartQuiz }) {
  const rows = useMemo(() => {
    const courseById = new Map((courses || []).map((c) => [c.id, c]));
    const out = [];
    Object.entries(assessmentsByCourse || {}).forEach(([courseId, assessments]) => {
      const course = courseById.get(Number(courseId));
      if (!course) return;
      (assessments || []).forEach((assessment) => out.push({ course, assessment }));
    });
    return out;
  }, [courses, assessmentsByCourse]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-12 h-12 text-gray-300 dark:text-[#475569] mx-auto mb-4" />
        <p className="text-base font-semibold text-gray-700 dark:text-[#cbd5e1] mb-1">No assessments yet</p>
        <p className="text-sm text-gray-400 dark:text-[#64748b]">Quizzes attached to your courses will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(({ course, assessment }) => {
        const attempts = attemptsByAssessment[assessment.id] || [];
        const result = quizResult(assessment, attempts);
        const left = attemptsLeft(assessment, attempts);
        const canTake = !result?.passed && left !== 0;
        const status = result?.passed ? "completed" : result ? "in_progress" : "not_started";

        return (
          <div key={assessment.id} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{assessment.title || course.course_name}</h3>
                <EmployeeStatusBadge status={status} />
                {result?.passed && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Award size={13} /> {result.score}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-[#94a3b8]">
                {course.course_name}
                {assessment.questions_count != null ? ` · ${assessment.questions_count} question${assessment.questions_count === 1 ? "" : "s"}` : ""}
                {assessment.duration_minutes ? ` · ${assessment.duration_minutes} min` : ""}
                {` · ${left === null ? "Unlimited tries" : `${left} ${left === 1 ? "try" : "tries"} left`}`}
              </p>
              {assessment.resource_link && (
                <a href={assessment.resource_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 mt-2">
                  Open resource &rarr;
                </a>
              )}
            </div>

            <div className="shrink-0">
              {canTake ? (
                <button
                  onClick={() => onStartQuiz(course, assessment)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileText size={13} /> {result ? "Retake quiz" : "Take quiz"} <ChevronRight size={13} />
                </button>
              ) : (
                <span className="text-xs font-semibold text-gray-400 dark:text-[#64748b]">
                  {result?.passed ? "Passed" : "No tries left"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
