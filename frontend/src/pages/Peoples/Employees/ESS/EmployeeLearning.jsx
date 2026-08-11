import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle, Clock, Award, Loader2, AlertCircle, ChevronRight, FileText } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getCourses, getTrainingPrograms, getAssessments, getQuizAttempts, getMyProfile } from "../../../../service/employee";

function CourseCard({ course, assessments, attempts, onStartQuiz }) {
  const status = course.completion_status || "not_started";
  const hasQuiz = assessments.length > 0;
  const passedAttempts = (Array.isArray(attempts) ? attempts : []).filter(a => a.status === "passed" || a.score >= (course.passing_score || 70));

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${status === "completed" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-indigo-50 dark:bg-indigo-900/30"}`}>
              <BookOpen className={`w-5 h-5 ${status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-600 dark:text-indigo-400"}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{course.course_name || course.title || course.name}</h3>
              {course.category && (
                <p className="text-xs text-gray-400 dark:text-[#94a3b8] mt-0.5 capitalize">{course.category}</p>
              )}
            </div>
          </div>
          <EmployeeStatusBadge status={status} />
        </div>

        {course.description && (
          <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-2">{course.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-4">
          {course.duration_hours != null && <span>{course.duration_hours}h</span>}
          {course.provider && <span>{course.provider}</span>}
          {hasQuiz && <span>{assessments.length} quiz{assessments.length > 1 ? "zes" : ""}</span>}
        </div>

        {passedAttempts.length > 0 && (
          <div className="mb-3 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <Award size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Badge earned — {passedAttempts.length} quiz{passedAttempts.length > 1 ? "zes" : ""} passed</span>
          </div>
        )}

        {hasQuiz && status !== "completed" && (
          <button
            onClick={() => onStartQuiz(course, assessments)}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <FileText size={13} /> Take Quiz <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function QuizModal({ course, assessments, onClose }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  const allQuestions = assessments.flatMap(a => a.questions || []);
  const filteredQuestions = allQuestions.filter(q => q.question_type === "multiple_choice" || q.question_type === "true_false");

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = () => {
    let correct = 0;
    filteredQuestions.forEach(q => {
      if (answers[q.id] === q.correct_answer) correct++;
    });
    const pct = filteredQuestions.length > 0 ? Math.round((correct / filteredQuestions.length) * 100) : 0;
    setScore(pct);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> {course.title || "Quiz"}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <AlertCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {assessments.some(a => a.resource_link) && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-700 mb-1">Assessment Resource:</p>
              {assessments.filter(a => a.resource_link).map((a, i) => (
                <a key={i} href={a.resource_link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium block break-all">
                  {a.resource_link}
                </a>
              ))}
            </div>
          )}
          {filteredQuestions.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No quiz questions available for this course.</p>
          ) : submitted ? (
            <div className="text-center py-8">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${score >= 70 ? "bg-emerald-50" : "bg-amber-50"}`}>
                <span className={`text-3xl font-bold ${score >= 70 ? "text-emerald-600" : "text-amber-600"}`}>{score}%</span>
              </div>
              <p className="text-lg font-bold text-gray-900 mb-1">
                {score >= 70 ? "Congratulations! Quiz Passed 🎉" : "Quiz Not Passed"}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                You answered {filteredQuestions.filter(q => answers[q.id] === q.correct_answer).length} of {filteredQuestions.length} correctly
              </p>
              {score >= 70 && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm font-semibold">
                  <Award size={16} /> Badge Earned!
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">{filteredQuestions.length} question{filteredQuestions.length > 1 ? "s" : ""}</p>
              {filteredQuestions.map((q, idx) => (
                <div key={q.id || idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm font-semibold text-gray-900 mb-3">
                    {idx + 1}. {q.question_text}
                  </p>
                  <div className="space-y-2">
                    {(q.options || []).map((opt, oi) => {
                      const optValue = typeof opt === "string" ? opt : opt.value || opt;
                      return (
                        <label key={oi} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          answers[q.id] === optValue
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}>
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={optValue}
                            checked={answers[q.id] === optValue}
                            onChange={() => handleAnswer(q.id, optValue)}
                            className="w-4 h-4 text-indigo-600"
                          />
                          <span className="text-sm text-gray-700">{typeof opt === "string" ? opt : opt.label || opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!submitted && filteredQuestions.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-400">
              {Object.keys(answers).length} of {filteredQuestions.length} answered
            </span>
            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length < filteredQuestions.length}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Submit Quiz
            </button>
          </div>
        )}

        {submitted && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EmployeeLearning() {
  const [courses, setCourses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [assessmentsMap, setAssessmentsMap] = useState({});
  const [attemptsMap, setAttemptsMap] = useState({});
  const [employeeDept, setEmployeeDept] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [quizCourse, setQuizCourse] = useState(null);
  const [quizAssessments, setQuizAssessments] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const profileRes = await getMyProfile();
        const profile = profileRes.data || profileRes;
        const dept = profile.department || profile.department_name || profile.departmentId || "";
        if (mounted.current) setEmployeeDept(dept);

        const coursesRes = await getCourses();
        const allCourses = Array.isArray(coursesRes) ? coursesRes : coursesRes?.data || coursesRes?.items || [];
        const filtered = dept ? allCourses.filter(c => {
          const cDept = c.department || c.department_name || c.category || "";
          return cDept.toLowerCase() === dept.toLowerCase() || cDept === "";
        }) : allCourses;

        if (!mounted.current) return;
        setCourses(filtered);

        const progsRes = await getTrainingPrograms();
        const allProgs = Array.isArray(progsRes) ? progsRes : progsRes?.data || progsRes?.items || [];
        const filteredProgs = dept ? allProgs.filter(p => {
          const pDept = p.department || p.department_name || "";
          return pDept.toLowerCase() === dept.toLowerCase() || pDept === "";
        }) : allProgs;
        if (mounted.current) setPrograms(filteredProgs);

        const amap = {};
        const amap2 = {};
        for (const course of filtered) {
          try {
            const aRes = await getAssessments(course.id);
            const aData = Array.isArray(aRes) ? aRes : aRes?.data || aRes?.items || [];
            amap[course.id] = aData;

            const storedUser = JSON.parse(localStorage.getItem("zoiko_user") || "{}");
            if (storedUser?.id) {
              for (const assessment of aData) {
                try {
                  const attRes = await getQuizAttempts(assessment.id, storedUser.id);
                  const attData = Array.isArray(attRes) ? attRes : attRes?.data || attRes?.items || [];
                  amap2[assessment.id] = attData;
                } catch { /* ignore */ }
              }
            }
          } catch { /* ignore */ }
        }
        if (mounted.current) {
          setAssessmentsMap(amap);
          setAttemptsMap(amap2);
        }
      } catch (err) {
        if (mounted.current) setError(err?.message || "Failed to load learning data");
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    load();
    return () => { mounted.current = false; };
  }, []);

  const filtered = courses.filter(c =>
    !search || (c.title || c.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const completedCount = courses.filter(c => c.completion_status === "completed").length;

  const handleStartQuiz = (course, assessments) => {
    setQuizCourse(course);
    setQuizAssessments(assessments);
  };

  if (loading) {
    return (
      <EmployeePageShell title="Learning" subtitle="Access your courses, take quizzes, and earn badges.">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-3 text-sm text-gray-500 dark:text-[#94a3b8] font-medium">Loading learning modules...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Learning" subtitle="Access your courses, take quizzes, and earn badges.">
      {error && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Courses" value={courses.length} accentColor="text-indigo-600 dark:text-indigo-400" />
          <StatCard label="Completed" value={completedCount} accentColor="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Badges Earned" value={Object.values(attemptsMap).flat().filter(a => a.status === "passed").length} accentColor="text-amber-600 dark:text-amber-400" />
        </div>

        {/* Training Programs */}
        {programs.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-3 flex items-center gap-2">
              <BookOpen size={15} className="text-indigo-500" />
              Training Programs
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {programs.map(p => (
                <div key={p.id} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                      <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{p.name}</p>
                      {p.department && <p className="text-xs text-gray-400 dark:text-[#94a3b8] capitalize">{p.department}</p>}
                    </div>
                  </div>
                  {p.description && (
                    <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-3">
                    {p.start_date && <span>Start: {p.start_date}</span>}
                    {p.status && (
                      <EmployeeStatusBadge status={p.status} />
                    )}
                  </div>
                  {p.resource_link && (
                    <a href={p.resource_link} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800">
                      Open Resource &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-sm">
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-4 pr-4 py-2 border border-gray-200 dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#f1f5f9] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        {employeeDept && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#94a3b8]">
            <span className="text-xs font-semibold text-gray-400 dark:text-[#94a3b8] uppercase tracking-wide">Department:</span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold capitalize">{employeeDept}</span>
          </div>
        )}

        {/* Course Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-300 dark:text-[#475569] mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-700 dark:text-[#cbd5e1] mb-1">
              {search ? "No courses match your search" : "No courses available yet"}
            </p>
            <p className="text-sm text-gray-400 dark:text-[#64748b]">
              {search ? "Try a different search term." : "Courses assigned to your department will appear here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(course => {
              const courseAssessments = assessmentsMap[course.id] || [];
              // attemptsMap is keyed by assessment id, not course id, and a
              // course can have several assessments — flatten all of that
              // course's attempts into one array before handing it down.
              const courseAttempts = courseAssessments.flatMap(a => attemptsMap[a.id] || []);
              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  assessments={courseAssessments}
                  attempts={courseAttempts}
                  onStartQuiz={handleStartQuiz}
                />
              );
            })}
          </div>
        )}
      </div>

      {quizCourse && (
        <QuizModal
          course={quizCourse}
          assessments={quizAssessments}
          onClose={() => { setQuizCourse(null); setQuizAssessments([]); }}
        />
      )}
    </EmployeePageShell>
  );
}