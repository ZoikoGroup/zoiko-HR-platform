import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import useLearnerLearning from "./useLearnerLearning";
import { LEARNING_TABS, learningTabFromPath } from "./learningTabs";
import LearnerDashboard from "./LearnerDashboard";
import LearnerCourses from "./LearnerCourses";
import LearnerTrainingPrograms from "./LearnerTrainingPrograms";
import LearnerAssessments from "./LearnerAssessments";
import QuizModal from "./QuizModal";

export default function EmployeeLearningModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = learningTabFromPath(location.pathname);
  const learning = useLearnerLearning();
  const [quiz, setQuiz] = useState(null);

  const openTab = (key) => {
    const tab = LEARNING_TABS.find((t) => t.key === key);
    if (tab) navigate(tab.href);
  };

  const startQuiz = (course, assessment) => setQuiz({ course, assessment });

  return (
    <EmployeePageShell title="Learning" subtitle="Explore your courses, training programs, and quizzes. Learn at your own pace.">
      <nav className="mb-7 flex gap-1 overflow-x-auto border-b border-[#E5E7EB] dark:border-[#334155]" aria-label="Learning sections">
        {LEARNING_TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              to={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-[#6B7280] dark:text-[#94a3b8] hover:text-[#111827] dark:hover:text-[#f1f5f9]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {learning.error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
          <AlertCircle size={16} /> {learning.error}
        </div>
      )}
      {learning.notice && !learning.error && (
        <div role="status" className="mb-6 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-amber-700 dark:text-amber-300 text-sm font-semibold">
          <AlertCircle size={16} /> {learning.notice}
        </div>
      )}

      {learning.loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-gray-500 dark:text-[#94a3b8] font-medium">Loading learning modules...</span>
        </div>
      ) : learning.error ? null : (
        <>
          {active === "dashboard" && (
            <LearnerDashboard
              courses={learning.courses}
              programs={learning.programs}
              assessmentsByCourse={learning.assessmentsByCourse}
              attemptsByAssessment={learning.attemptsByAssessment}
              department={learning.department}
              onStartQuiz={startQuiz}
              onOpenTab={openTab}
            />
          )}
          {active === "courses" && (
            <LearnerCourses
              courses={learning.courses}
              assessmentsByCourse={learning.assessmentsByCourse}
              attemptsByAssessment={learning.attemptsByAssessment}
              department={learning.department}
              onStartQuiz={startQuiz}
            />
          )}
          {active === "training-programs" && <LearnerTrainingPrograms programs={learning.programs} />}
          {active === "assessments" && (
            <LearnerAssessments
              courses={learning.courses}
              assessmentsByCourse={learning.assessmentsByCourse}
              attemptsByAssessment={learning.attemptsByAssessment}
              onStartQuiz={startQuiz}
            />
          )}
        </>
      )}

      {quiz && (
        <QuizModal
          course={quiz.course}
          assessment={quiz.assessment}
          employeeId={learning.employeeId}
          onClose={() => setQuiz(null)}
          onFinished={learning.refreshAttempts}
        />
      )}
    </EmployeePageShell>
  );
}
