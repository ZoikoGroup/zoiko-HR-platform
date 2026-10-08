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

/** How many more tries the person has on a quiz (null = unlimited). */
export function attemptsLeft(assessment, attempts) {
  const max = assessment?.max_attempts;
  if (!max || max <= 0) return null;
  const used = (attempts || []).filter((t) => t.status === "completed" || t.status === "in_progress").length;
  return Math.max(max - used, 0);
}

/** Answers for the server: [{question_id, answer}]. */
export function answerList(answers) {
  return Object.entries(answers).map(([id, answer]) => ({ question_id: Number(id), answer }));
}
