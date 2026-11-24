/* My Exit → Exit Interview: answer the questionnaire HR sent (draft, then submit once). HR sees the answers, not the manager. */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Save, Send } from "lucide-react";
import { errorMessage, getMyExitInterview, saveMyExitInterview } from "../../../../../service/offboardingService";
import MyExitLayout, { useMyExit } from "./MyExitLayout";

const YESNO = [["yes", "Yes"], ["no", "No"], ["not_sure", "Not sure"]];
const pill = (on) => `rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;

function Question({ q, value, onChange, labels, readOnly }) {
  const name = `q-${q.id}`;
  const group = (options) => (
    <div role="radiogroup" aria-labelledby={`${name}-label`} className="mt-2 flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} disabled={readOnly}
          onClick={() => onChange(v)} className={pill(value === v)}>{label}</button>
      ))}
    </div>
  );
  let input;
  if (q.type === "rating") input = group([1, 2, 3, 4, 5].map((n) => [n, String(n)]));
  else if (q.type === "nps") input = group(Array.from({ length: 11 }, (_, n) => [n, String(n)]));
  else if (q.type === "yesno") input = group(YESNO);
  else if (q.type === "choice") input = group((q.options || []).map((o) => [o, labels[o] || o.replace(/_/g, " ")]));
  else input = (
    <textarea id={name} rows={3} value={value || ""} readOnly={readOnly} onChange={(e) => onChange(e.target.value)}
      aria-labelledby={`${name}-label`} maxLength={4000} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
  );
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p id={`${name}-label`} className="text-sm font-medium text-slate-900">{q.text}{q.required && <span className="text-red-600" aria-label="required"> *</span>}</p>
      {q.type === "rating" && <p className="text-xs text-slate-500">1 = very unsatisfied, 5 = very satisfied</p>}
      {input}
    </div>
  );
}

function InterviewTab() {
  const { data, reload } = useMyExit();
  const [iv, setIv] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const labels = Object.fromEntries((data.reason_categories || []).map((c) => [c.key, c.label]));

  const load = useCallback(() => {
    getMyExitInterview().then((r) => { setIv(r?.interview || null); setAnswers(r?.interview?.answers || {}); })
      .catch((e) => setError(errorMessage(e, "The exit interview could not be loaded.")));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !iv) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>;
  if (iv === null) return <p role="status" className="text-sm text-slate-600">Loading…</p>;
  const done = iv.status === "submitted";
  if (iv.status === "declined") return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">HR marked the exit interview as not needed.</p>;

  const save = async (submit) => {
    setError(null); setNotice(null);
    if (submit) {
      const missing = (iv.questions || []).filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""));
      if (missing.length) { setError(`Answer every required question (${missing.length} left).`); return; }
    }
    setBusy(true);
    try {
      const r = await saveMyExitInterview(answers, submit);
      setIv(r.interview);
      setNotice(submit ? null : "Your answers are saved as a draft.");
      if (submit) reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <Lock size={16} aria-hidden="true" /> Your answers are seen by HR only, not your manager.
      </p>
      {done && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} aria-hidden="true" /> Thank you. Your exit interview is submitted.
        </p>
      )}
      {(iv.questions || []).map((q) => (
        <Question key={q.id} q={q} value={answers[q.id]} labels={labels} readOnly={done}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      ))}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {!done && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => save(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Save size={16} aria-hidden="true" /> Save draft
          </button>
          <button type="button" disabled={busy} onClick={() => save(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            <Send size={16} aria-hidden="true" /> Submit
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExitInterview() {
  return <MyExitLayout tab="interview"><InterviewTab /></MyExitLayout>;
}
