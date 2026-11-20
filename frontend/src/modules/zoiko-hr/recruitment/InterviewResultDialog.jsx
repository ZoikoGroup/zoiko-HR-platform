/*
 * The interview's feedback & result. Opens by itself when an interview is marked completed: HR picks "Interview cleared" or
 * "Rejected", adds a rating and internal feedback, and optionally a short note for the candidate. Saving records the result
 * (final once recorded) and e-mails the candidate (interview_cleared / interview_rejected templates); HR admins and the
 * interviewer are told it was recorded.
 */
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CircleX, Loader2, Lock, Mail, Star, X } from "lucide-react";
import { updateInterviewFeedback } from "../../../service/hrService";

const OPTIONS = [
  {
    value: "cleared", label: "Interview cleared", icon: CheckCircle2,
    hint: "The candidate moves on. They receive a congratulations e-mail and hear the next steps from you.",
    on: "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20", iconOn: "text-emerald-600",
  },
  {
    value: "rejected", label: "Rejected", icon: CircleX,
    hint: "The candidate is not taken forward. They receive a courteous e-mail and move to Rejected in the pipeline.",
    on: "border-rose-500 bg-rose-50 ring-2 ring-rose-500/20", iconOn: "text-rose-600",
  },
];

export const RESULT_LABEL = { cleared: "Cleared", rejected: "Rejected" };

export default function InterviewResultDialog({ interview, candidateEmail, onClose, onSaved }) {
  const uid = useId();
  const recorded = interview.result || null;
  const [result, setResult] = useState(recorded);
  const [rating, setRating] = useState(interview.rating || 0);
  const [feedback, setFeedback] = useState(interview.feedback || "");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const canEmail = Boolean(interview.candidate_id && candidateEmail);
  const willEmail = !recorded && result && notify && canEmail;
  const save = async () => {
    if (!recorded && !result) {
      setError("Choose Interview cleared or Rejected.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { feedback: feedback.trim() || null, rating: rating || null };
      if (interview.status !== "completed") body.status = "completed";
      if (!recorded) {
        body.result = result;
        body.result_message = message.trim() || null;
        body.notify_candidate = notify && canEmail;
      }
      const res = await updateInterviewFeedback(interview.id, body);
      onSaved?.(res, { recordedNow: !recorded, result: recorded || result });
    } catch (err) {
      setError(err?.message || "The result could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = recorded ? "Save feedback" : willEmail ? `Save result & email candidate` : "Save result";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${uid}-title`} className="break-words text-lg font-semibold text-gray-900">Interview result · {interview.candidate_name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{[interview.position, interview.interview_date].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close dialog" className="-m-1.5 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-900">Result</legend>
            {recorded ? (
              <div className={`flex items-start gap-3 rounded-xl border p-3 ${recorded === "cleared" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <p className="text-sm text-gray-700">
                  <strong className="text-gray-900">{recorded === "cleared" ? "Interview cleared" : "Rejected"}</strong> was recorded
                  {interview.result_emailed ? " and the candidate was e-mailed" : ""}. A result is final; you can still update the feedback.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Interview result">
                {OPTIONS.map((o, i) => {
                  const on = result === o.value;
                  const Icon = o.icon;
                  return (
                    <button key={o.value} ref={i === 0 ? firstRef : undefined} type="button" role="radio" aria-checked={on}
                      onClick={() => { setResult(o.value); setError(""); }}
                      className={`rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? o.on : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Icon className={`h-5 w-5 ${on ? o.iconOn : "text-gray-400"}`} aria-hidden="true" />{o.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500">{o.hint}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={n <= rating}
                  onClick={() => setRating(n === rating ? 0 : n)}>
                  <Star className={`h-6 w-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-fb`} className="text-xs font-medium text-gray-500">Internal feedback <span className="text-gray-400">(never shared with the candidate)</span></label>
            <textarea id={`${uid}-fb`} rows={4} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          {!recorded && result && (
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={notify && canEmail} disabled={!canEmail} onChange={(e) => setNotify(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-gray-900"><Mail className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    E-mail the candidate the result</span>
                  <span className="block text-xs text-gray-500">
                    {canEmail ? `Sends the "${result === "cleared" ? "You've cleared your interview" : "An update on your interview"}" e-mail to ${candidateEmail}.`
                      : "This interview is not linked to a candidate with an e-mail address, so no e-mail can be sent."}
                  </span>
                </span>
              </label>
              {notify && canEmail && (
                <div>
                  <label htmlFor={`${uid}-msg`} className="text-xs font-medium text-gray-500">Note for the candidate <span className="text-gray-400">(optional, included in the e-mail)</span></label>
                  <textarea id={`${uid}-msg`} rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder={result === "cleared" ? "e.g. We'll share the details of the final round tomorrow." : "e.g. Thank you for your time; we'll keep your profile for future roles."}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              )}
              <p className="text-xs text-gray-500">HR admins and the interviewer are also told the result. Once saved, the result cannot be changed.</p>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            {recorded ? "Close" : "Decide later"}
          </button>
          <button type="button" onClick={save} disabled={saving || (!recorded && !result)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
