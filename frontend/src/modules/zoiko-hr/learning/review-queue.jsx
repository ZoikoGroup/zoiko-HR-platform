import { useEffect, useState } from "react";
import { getQuizReviewQueue, getQuestions, gradeQuizAttempt } from "../../../service/hrService";
import { formatDateTime } from "../../../utils/dateTime";

const isEssay = (q) => String(q?.question_type || "").toLowerCase() === "essay";

/** The learner's answers keyed by question id, from the attempt's stored JSON. */
export function answersById(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch { list = []; }
  }
  const map = {};
  (Array.isArray(list) ? list : []).forEach((e) => { if (e && e.question_id != null) map[Number(e.question_id)] = e.answer; });
  return map;
}

/** Every essay needs whole points from 0 to its maximum; returns { errors, points } with points keyed by question id. */
export function checkMarks(essays, marks) {
  const errors = {};
  const points = {};
  essays.forEach((q) => {
    const raw = String(marks[q.id] ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 0 || n > (q.points || 0)) errors[q.id] = `Give a whole number from 0 to ${q.points || 0}.`;
    else points[q.id] = n;
  });
  return { errors, points };
}

/**
 * Admin queue of quiz attempts with essay answers waiting for a mark (status pending_review), and the form that marks one
 * through POST /assessments/attempts/{id}/grade. Grading scores and completes the attempt.
 */
export default function ReviewQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(null);

  const load = async () => {
    try {
      const res = await getQuizReviewQueue();
      setRows(Array.isArray(res) ? res : res?.items || []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "The review queue could not be loaded.");
    }
  };
  useEffect(() => { load(); }, []);

  if (rows === null) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}
      {notice && <div role="status" className="px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-lg">{notice}</div>}
      {rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No answers are waiting for review.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Employee", "Assessment", "Course", "Attempt", "Submitted", ""].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{a.employee_name || `Employee #${a.employee_id}`}</td>
                  <td className="px-4 py-3 text-gray-700">{a.assessment_title || `Assessment #${a.assessment_id}`}</td>
                  <td className="px-4 py-3 text-gray-500">{a.course_name || "-"}</td>
                  <td className="px-4 py-3 text-gray-700">#{a.attempt_number}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.completed_at ? formatDateTime(a.completed_at) : "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { setNotice(""); setOpen(a); }} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Grade</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <GradeDialog attempt={open} onClose={() => setOpen(null)}
          onGraded={async (done) => {
            const who = open.employee_name || "The attempt";
            setOpen(null);
            setNotice(`${who} scored ${done?.score ?? "-"}% (${done?.passed ? "passed" : "not passed"}).`);
            await load();
          }} />
      )}
    </div>
  );
}

function GradeDialog({ attempt, onClose, onGraded }) {
  const [essays, setEssays] = useState(null);
  const [marks, setMarks] = useState({});
  const [errors, setErrors] = useState({});
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const answers = answersById(attempt.answers);

  useEffect(() => {
    getQuestions(attempt.assessment_id)
      .then((res) => setEssays((Array.isArray(res) ? res : res?.items || []).filter(isEssay)))
      .catch((err) => { setEssays([]); setFailed(err?.message || "The questions could not be loaded."); });
  }, [attempt.assessment_id]);

  const submit = async (e) => {
    e.preventDefault();
    const { errors: found, points } = checkMarks(essays || [], marks);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailed("");
    try {
      const done = await gradeQuizAttempt(attempt.id, points);
      await onGraded(done);
    } catch (err) {
      setFailed(err?.message || "The grades could not be saved.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-label="Grade essay answers" className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Grade: {attempt.assessment_title || "quiz"}</h2>
            <p className="text-xs text-gray-500">{attempt.employee_name || `Employee #${attempt.employee_id}`} · attempt #{attempt.attempt_number}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form noValidate onSubmit={submit} className="p-6 space-y-5 text-sm">
          {failed && <p role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg">{failed}</p>}
          {essays === null ? <p className="text-gray-400">Loading questions...</p> : essays.length === 0 ? (
            <p className="text-gray-500">This quiz has no essay questions left to mark.</p>
          ) : essays.map((q, i) => (
            <fieldset key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <legend className="sr-only">Essay {i + 1}</legend>
              <p className="font-semibold text-gray-900">{i + 1}. {q.question_text}</p>
              <p className="whitespace-pre-wrap text-gray-700 bg-white border border-slate-200 rounded-lg px-3 py-2">{String(answers[q.id] ?? "").trim() || <span className="text-gray-400">No answer given</span>}</p>
              <label htmlFor={`mark-${q.id}`} className="block text-xs font-medium text-gray-600">Points (0 to {q.points || 0})</label>
              <input id={`mark-${q.id}`} type="number" min={0} max={q.points || 0} step={1} value={marks[q.id] ?? ""}
                aria-invalid={!!errors[q.id]}
                onChange={(e) => { const v = e.target.value; setMarks((m) => ({ ...m, [q.id]: v })); setErrors((x) => ({ ...x, [q.id]: undefined })); }}
                className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
              {errors[q.id] && <p role="alert" className="text-red-500 text-xs">{errors[q.id]}</p>}
            </fieldset>
          ))}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={busy || !essays || essays.length === 0} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:bg-blue-400">
              {busy ? "Saving..." : "Save Grades"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
