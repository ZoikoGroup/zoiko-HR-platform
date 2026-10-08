import { useEffect, useRef, useState } from "react";
import { BookOpen, Award, Loader2, AlertCircle, ChevronRight, FileText, X } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import EmployeeStatusBadge from "../../../../components/employee/EmployeeStatusBadge";
import StatCard from "../../../../components/employee/StatCard";
import { getCourses, getTrainingPrograms, getAssessments, getQuizAttempts, getMyProfile, getQuestions, startQuiz, submitQuiz } from "../../../../service/employee";
import { departmentName, forMyDepartment, courseProgress, attemptsLeft, answerList } from "../../../../utils/employeeLearning";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data?.items || r?.data || []);

function CourseCard({ course, assessments, attemptsByAssessment, onStartQuiz }) {
  const progress = courseProgress(assessments, attemptsByAssessment);
  const status = progress.status;
  const hasQuiz = assessments.length > 0;
  const open = assessments.filter((a) => attemptsLeft(a, attemptsByAssessment[a.id]) !== 0 && !(attemptsByAssessment[a.id] || []).some((t) => t.passed));

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
          {hasQuiz && <span>{assessments.length} quiz{assessments.length > 1 ? "zes" : ""}</span>}
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
        {hasQuiz && open.length === 0 && status !== "completed" && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">You have used all your tries for this course's quizzes.</p>
        )}
      </div>
    </div>
  );
}

function QuizModal({ course, assessment, employeeId, onClose, onFinished }) {
  const [questions, setQuestions] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = asList(await getQuestions(assessment.id));
        if (!alive) return;
        if (list.length === 0) { setQuestions([]); return; }
        const att = await startQuiz(assessment.id, employeeId);
        if (!alive) return;
        setAttempt(att);
        setQuestions(list);
      } catch (err) {
        if (alive) { setError(err?.message || "The quiz could not be opened."); setQuestions([]); }
      }
    })();
    return () => { alive = false; };
  }, [assessment.id, employeeId]);

  const handleSubmit = async () => {
    if (busy || !attempt) return;
    setBusy(true);
    setError("");
    try {
      const done = await submitQuiz(assessment.id, attempt.id, answerList(answers));
      setResult(done);
      onFinished();
    } catch (err) {
      setError(err?.message || "Your answers could not be submitted. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const total = questions?.length || 0;
  return (
    <div role="dialog" aria-modal="true" aria-label="Quiz" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#334155]">
          <h3 className="text-base font-bold text-gray-900 dark:text-[#f1f5f9] flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> {assessment.title || course.course_name}
          </h3>
          <button onClick={onClose} aria-label="Close quiz" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#0f172a] text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>}
          {assessment.resource_link && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Assessment resource:</p>
              <a href={assessment.resource_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium block break-all">{assessment.resource_link}</a>
            </div>
          )}
          {questions === null ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
          ) : result ? (
            <div className="text-center py-8">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${result.passed ? "bg-emerald-50" : "bg-amber-50"}`}>
                <span className={`text-3xl font-bold ${result.passed ? "text-emerald-600" : "text-amber-600"}`}>{result.score}%</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-[#f1f5f9] mb-1">{result.passed ? "Congratulations! Quiz passed" : "Quiz not passed"}</p>
              <p className="text-sm text-gray-500 dark:text-[#94a3b8] mb-4">
                Pass mark: {assessment.passing_score ?? "-"}%. {result.passed ? "" : "You can try again if tries are left."}
              </p>
              {result.passed && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm font-semibold">
                  <Award size={16} /> Badge earned!
                </div>
              )}
            </div>
          ) : total === 0 ? (
            !error && <p className="text-center py-8 text-gray-500 dark:text-[#94a3b8]">No quiz questions are available for this course yet.</p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-gray-500 dark:text-[#94a3b8]">{total} question{total > 1 ? "s" : ""}{assessment.duration_minutes ? ` · ${assessment.duration_minutes} minutes` : ""}</p>
              {questions.map((q, idx) => {
                const options = q.options && q.options.length ? q.options : ["True", "False"];
                return (
                  <fieldset key={q.id} className="p-4 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-[#334155]">
                    <legend className="sr-only">Question {idx + 1}</legend>
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#f1f5f9] mb-3">{idx + 1}. {q.question_text}</p>
                    <div className="space-y-2">
                      {options.map((opt) => (
                        <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${answers[q.id] === opt ? "border-blue-300 bg-blue-50 dark:bg-blue-500/20" : "border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1e293b] hover:border-slate-300"}`}>
                          <input type="radio" name={`q_${q.id}`} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))} className="w-4 h-4 text-blue-600" />
                          <span className="text-sm text-gray-700 dark:text-[#e2e8f0]">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>

        {!result && total > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-[#334155] flex justify-between items-center">
            <span className="text-xs text-gray-400">{Object.keys(answers).length} of {total} answered</span>
            <button onClick={handleSubmit} disabled={busy || Object.keys(answers).length < total} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors">
              {busy ? "Submitting..." : "Submit Quiz"}
            </button>
          </div>
        )}
        {(result || total === 0) && questions !== null && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-[#334155] flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors">Close</button>
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
  const [employeeId, setEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [quiz, setQuiz] = useState(null);
  const mounted = useRef(true);

  const loadAttempts = async (assessments, myId) => {
    const map = {};
    await Promise.all(assessments.map(async (a) => {
      try { map[a.id] = asList(await getQuizAttempts(a.id, myId)); } catch { map[a.id] = []; }
    }));
    return map;
  };

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const profileRes = await getMyProfile();
        const profile = profileRes?.data || profileRes || {};
        const dept = departmentName(profile);
        if (!mounted.current) return;
        setEmployeeDept(dept);
        setEmployeeId(profile.id ?? null);

        const [coursesRes, progsRes, assessRes] = await Promise.allSettled([getCourses({ per_page: 100 }), getTrainingPrograms({ per_page: 100 }), getAssessments()]);
        if (coursesRes.status === "rejected") throw coursesRes.reason;
        const myCourses = forMyDepartment(asList(coursesRes.value), dept);
        const myPrograms = progsRes.status === "fulfilled" ? forMyDepartment(asList(progsRes.value), dept) : [];
        const ids = new Set(myCourses.map((c) => c.id));
        const allAssessments = assessRes.status === "fulfilled" ? asList(assessRes.value).filter((a) => ids.has(a.course_id)) : [];
        const byCourse = {};
        allAssessments.forEach((a) => { (byCourse[a.course_id] = byCourse[a.course_id] || []).push(a); });
        const attempts = await loadAttempts(allAssessments, profile.id);
        if (!mounted.current) return;
        setCourses(myCourses);
        setPrograms(myPrograms);
        setAssessmentsMap(byCourse);
        setAttemptsMap(attempts);
        if (progsRes.status === "rejected" || assessRes.status === "rejected") setNotice("Some learning details could not be loaded. Refresh to try again.");
      } catch (err) {
        if (mounted.current) setError(err?.message || "Failed to load learning data");
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    load();
    return () => { mounted.current = false; };
  }, []);

  const filtered = courses.filter((c) => !search || (c.course_name || "").toLowerCase().includes(search.trim().toLowerCase()));
  const completedCount = courses.filter((c) => courseProgress(assessmentsMap[c.id] || [], attemptsMap).status === "completed").length;
  const badges = Object.values(attemptsMap).flat().filter((a) => a.passed).length;

  const refreshAttempts = async () => {
    const all = Object.values(assessmentsMap).flat();
    const fresh = await loadAttempts(all, employeeId);
    if (mounted.current) setAttemptsMap(fresh);
  };

  if (loading) {
    return (
      <EmployeePageShell title="Learning" subtitle="Access your courses, take quizzes, and earn badges.">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-gray-500 dark:text-[#94a3b8] font-medium">Loading learning modules...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Learning" subtitle="Access your courses, take quizzes, and earn badges.">
      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mb-6 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-amber-700 dark:text-amber-300 text-sm font-semibold">
          <AlertCircle size={16} /> {notice}
        </div>
      )}

      {!error && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Courses" value={courses.length} accentColor="text-blue-600 dark:text-blue-400" />
            <StatCard label="Completed" value={completedCount} accentColor="text-emerald-600 dark:text-emerald-400" />
            <StatCard label="Badges Earned" value={badges} accentColor="text-amber-600 dark:text-amber-400" />
          </div>

          {programs.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-[#f1f5f9] mb-3 flex items-center gap-2">
                <BookOpen size={15} className="text-blue-500" />
                Training Programs
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {programs.map((p) => (
                  <div key={p.id} className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm hover:shadow-md transition-all p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                        <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-[#f1f5f9]">{p.name}</p>
                        {p.department && <p className="text-xs text-gray-400 dark:text-[#94a3b8] capitalize">{p.department}</p>}
                      </div>
                    </div>
                    {p.description && <p className="text-xs text-gray-500 dark:text-[#94a3b8] mb-3 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-[#94a3b8] mb-3">
                      {p.start_date && <span>Start: {p.start_date}</span>}
                      {p.end_date && <span>End: {p.end_date}</span>}
                      {p.status && <EmployeeStatusBadge status={p.status} />}
                    </div>
                    {p.resource_link && (
                      <a href={p.resource_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                        Open Resource &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="relative max-w-sm">
            <input
              type="text"
              aria-label="Search courses"
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-4 py-2 border border-gray-200 dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#f1f5f9] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {employeeDept && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#94a3b8]">
              <span className="text-xs font-semibold text-gray-400 dark:text-[#94a3b8] uppercase tracking-wide">Department:</span>
              <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold capitalize">{employeeDept}</span>
            </div>
          )}

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
                  assessments={assessmentsMap[course.id] || []}
                  attemptsByAssessment={attemptsMap}
                  onStartQuiz={(c, a) => setQuiz({ course: c, assessment: a })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {quiz && (
        <QuizModal
          course={quiz.course}
          assessment={quiz.assessment}
          employeeId={employeeId}
          onClose={() => setQuiz(null)}
          onFinished={refreshAttempts}
        />
      )}
    </EmployeePageShell>
  );
}
