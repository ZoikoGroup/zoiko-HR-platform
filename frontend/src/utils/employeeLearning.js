// My Learning: what a person sees and how progress is worked out. Kept apart from the page so it can be tested.

/** The department name from whatever shape the profile has: a name, an object with a name, or nothing. */
export function departmentName(profile) {
  const p = profile || {};
  const d = p.departmentName || p.department_name || p.department;
  if (typeof d === "string") return d.trim();
  if (d && typeof d === "object") return String(d.name || d.department_name || "").trim();
  return "";
}

/** Items for everybody (no department set) or for this person's department. */
export function forMyDepartment(items, dept) {
  const mine = String(dept || "").trim().toLowerCase();
  return (items || []).filter((i) => {
    const d = String(i.department || "").trim().toLowerCase();
    return !d || !mine || d === mine;
  });
}

/** One course's progress from its quizzes and this person's attempts: not_started, in_progress or completed. */
export function courseProgress(assessments, attemptsByAssessment) {
  const list = assessments || [];
  const mine = (a) => attemptsByAssessment?.[a.id] || [];
  const passed = list.filter((a) => mine(a).some((t) => t.passed));
  const tried = list.filter((a) => mine(a).some((t) => t.status === "completed"));
  return {
    passedCount: passed.length,
    status: list.length > 0 && passed.length === list.length ? "completed" : tried.length > 0 ? "in_progress" : "not_started",
  };
}

/** A submitted attempt: scored (completed) or waiting for a reviewer to mark its essays (pending_review). */
export const isSubmitted = (t) => t?.status === "completed" || t?.status === "pending_review";

/** How many more tries the person has on a quiz (null = unlimited). Only a submitted try counts: an opened but unsent
 * attempt is resumed the next time the quiz is opened, so it does not use up a try. */
export function attemptsLeft(assessment, attempts) {
  const max = assessment?.max_attempts;
  if (!max || max <= 0) return null;
  const used = (attempts || []).filter(isSubmitted).length;
  return Math.max(max - used, 0);
}

/** True when the person's latest submission is waiting for a reviewer and nothing has passed yet. */
export function awaitingReview(attempts) {
  const list = attempts || [];
  return !list.some((t) => t.passed) && list.some((t) => t.status === "pending_review");
}

/** Answers for the server: [{question_id, answer}]. */
export function answerList(answers) {
  return Object.entries(answers).map(([id, answer]) => ({ question_id: Number(id), answer }));
}

/** The quizzes grouped under the course they belong to: { [course_id]: assessment[] }. */
export function groupAssessmentsByCourse(assessments) {
  const byCourse = {};
  (assessments || []).forEach((a) => { (byCourse[a.course_id] = byCourse[a.course_id] || []).push(a); });
  return byCourse;
}

/** This person's best result on one quiz: passed, score, or null when never finished. */
export function quizResult(assessment, attempts) {
  const finished = (attempts || []).filter((t) => t.status === "completed");
  if (finished.length === 0) return null;
  const best = finished.reduce((top, t) => Math.max(top, Number(t.score) || 0), 0);
  return { passed: finished.some((t) => t.passed), score: best };
}

/** The quizzes a learner can still sit: tries left and not already passed. */
export function openQuizzes(assessments, attemptsByAssessment) {
  return (assessments || []).filter((a) => {
    const attempts = attemptsByAssessment?.[a.id] || [];
    return !attempts.some((t) => t.passed) && !awaitingReview(attempts) && attemptsLeft(a, attempts) !== 0;
  });
}

/** The headline numbers across a learner's courses: total, finished, underway, not started, badges earned. */
export function learnerSummary(courses, assessmentsByCourse, attemptsByAssessment) {
  const list = courses || [];
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let badges = 0;
  list.forEach((c) => {
    const assessments = assessmentsByCourse?.[c.id] || [];
    const progress = courseProgress(assessments, attemptsByAssessment);
    if (progress.status === "completed") completed += 1;
    else if (progress.status === "in_progress") inProgress += 1;
    else notStarted += 1;
    badges += progress.passedCount;
  });
  return { total: list.length, completed, inProgress, notStarted, badges };
}
