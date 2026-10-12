import { useEffect, useState } from "react";
import { Award, FileText, Loader2, X } from "lucide-react";
import { getQuestions, startQuiz, submitQuiz } from "../../../../service/employee";
import { answerList } from "../../../../utils/employeeLearning";

const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data?.items || r?.data || []);

export default function QuizModal({ course, assessment, employeeId, onClose, onFinished }) {
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
