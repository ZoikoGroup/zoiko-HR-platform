import { useState } from "react";
import { errorMessage, scheduleProbation } from "../../../service/onboardingPrompt2Service";

const emptyReview = () => ({ label: "", date: "", with_id: "" });

export default function ProbationScheduleForm({ employeeId, reviewers = [], onScheduled }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviews, setReviews] = useState([emptyReview()]);
  const [objectives, setObjectives] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const setReview = (index, key, value) =>
    setReviews((current) => current.map((review, i) => i === index ? { ...review, [key]: value } : review));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!employeeId) { setError("Select an employee before scheduling probation."); return; }
    if (!startDate || !endDate || endDate <= startDate) {
      setError("Enter a probation end date later than the start date.");
      return;
    }
    const datedReviews = reviews.filter((review) => review.date);
    if (datedReviews.some((review) => review.date < startDate || review.date > endDate)) {
      setError("Review dates must fall within the probation period.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        start_date: startDate,
        end_date: endDate,
        review_dates: datedReviews.map((review, index) => ({
          label: review.label.trim() || `Review ${index + 1}`,
          date: review.date,
          ...(review.with_id || reviewerId ? { with_id: Number(review.with_id || reviewerId) } : {}),
        })),
        objectives_summary: objectives.trim() || null,
        reviewer_id: reviewerId ? Number(reviewerId) : null,
      };
      await scheduleProbation(employeeId, payload);
      setSuccess("Probation schedule created.");
      onScheduled?.();
    } catch (err) {
      setError(errorMessage(err, "The probation schedule could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Schedule probation</h2>
        <p className="mt-1 text-sm text-slate-500">Set the probation period, reviewer and any review milestones.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="probation-start" className="block text-sm font-medium text-slate-700">Start date</label>
          <input id="probation-start" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="probation-end" className="block text-sm font-medium text-slate-700">End date</label>
          <input id="probation-end" type="date" required min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="probation-reviewer" className="block text-sm font-medium text-slate-700">Overall reviewer</label>
          <select id="probation-reviewer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Choose a reviewer (optional)</option>
            {reviewers.map((person) => <option key={person.id} value={person.id}>{person.full_name || [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800">Review dates</legend>
        {reviews.map((review, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <div>
              <label htmlFor={`review-label-${index}`} className="block text-xs text-slate-600">Milestone name</label>
              <input id={`review-label-${index}`} value={review.label} maxLength={100} placeholder={`Review ${index + 1}`}
                onChange={(event) => setReview(index, "label", event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </div>
            <div>
              <label htmlFor={`review-date-${index}`} className="block text-xs text-slate-600">Date</label>
              <input id={`review-date-${index}`} type="date" min={startDate || undefined} max={endDate || undefined}
                value={review.date} onChange={(event) => setReview(index, "date", event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </div>
            <div>
              <label htmlFor={`reviewer-${index}`} className="block text-xs text-slate-600">Review owner</label>
              <select id={`reviewer-${index}`} value={review.with_id} onChange={(event) => setReview(index, "with_id", event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="">Use overall reviewer</option>
                {reviewers.map((person) => <option key={person.id} value={person.id}>{person.full_name || [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email}</option>)}
              </select>
            </div>
            {reviews.length > 1 && <button type="button" onClick={() => setReviews((current) => current.filter((_, i) => i !== index))}
              className="min-h-10 rounded-lg border px-3 text-sm text-slate-600">Remove</button>}
          </div>
        ))}
        {reviews.length < 12 && <button type="button" onClick={() => setReviews((current) => [...current, emptyReview()])}
          className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm">Add review date</button>}
      </fieldset>
      <div>
        <label htmlFor="probation-objectives" className="block text-sm font-medium text-slate-700">Objectives summary</label>
        <textarea id="probation-objectives" maxLength={2000} rows={3} value={objectives} onChange={(event) => setObjectives(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving || !employeeId} className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Scheduling…" : "Create probation schedule"}
        </button>
      </div>
    </form>
  );
}
