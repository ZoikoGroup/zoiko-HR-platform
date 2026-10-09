// The employee Learning module's tabs. Kept in one place so the shell, the sidebar and the
// tests all agree on the same keys and URLs.

export const LEARNING_TABS = [
  { key: "dashboard", label: "Dashboard", href: "/employee/learning" },
  { key: "courses", label: "Courses", href: "/employee/learning/courses" },
  { key: "training-programs", label: "Training Programs", href: "/employee/learning/training-programs" },
  { key: "assessments", label: "Assessments", href: "/employee/learning/assessments" },
];

/** Which tab a URL belongs to, defaulting to the dashboard. */
export function learningTabFromPath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const key = parts[2];
  return LEARNING_TABS.some((t) => t.key === key) ? key : "dashboard";
}
