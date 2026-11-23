// Who may use the Learning admin screens, and which Learning tabs a person sees (audit L4 / L16).
// The API is the authority (records, reports and the dashboard answer 403 to anyone else); this only keeps people from
// being shown links that would open onto an error.
import { getStoredUser } from "../service/api";

const ADMIN_ROLES = new Set(["admin", "hr_admin", "super_admin"]);

export function roleOf(user) {
  const role = user?.role?.value ?? user?.role ?? user?.userRole ?? "";
  return String(role).trim().toLowerCase();
}

export function isLearningAdmin(user = safeStoredUser()) {
  return ADMIN_ROLES.has(roleOf(user));
}

function safeStoredUser() {
  try { return getStoredUser(); } catch { return null; }
}

/** Every Learning tab: `path` tabs have their own /zoiko-hr/learning/<key> route; the rest open with ?tab=<key>. */
export const LEARNING_TABS = [
  { key: "dashboard", label: "Dashboard", adminOnly: true, path: true },
  { key: "courses", label: "Courses", path: true },
  { key: "enrollments", label: "Enrollments", adminOnly: true, path: true },
  { key: "training-programs", label: "Training Programs", path: true },
  { key: "assessments", label: "Assessments", path: true },
  { key: "certifications", label: "Certifications", adminOnly: true, path: true },
  { key: "skills", label: "Skills", adminOnly: true, path: true },
  { key: "reports", label: "Reports", adminOnly: true, path: true },
];

export function learningTabsFor(user) {
  const admin = isLearningAdmin(user);
  return LEARNING_TABS.filter((t) => admin || !t.adminOnly);
}

/** The open tab from the address: ?tab= first, then /zoiko-hr/learning/<key>, else the first tab this person may see. */
export function activeLearningTab(pathname, search, tabs) {
  const keys = tabs.map((t) => t.key);
  const fromQuery = new URLSearchParams(search || "").get("tab");
  if (fromQuery && keys.includes(fromQuery)) return fromQuery;
  const parts = String(pathname || "").split("/").filter(Boolean);
  const i = parts.indexOf("learning");
  const fromPath = i >= 0 ? parts[i + 1] : undefined;
  if (fromPath && keys.includes(fromPath)) return fromPath;
  return keys[0];
}

/** Where a tab lives. The HR admin portal has one route (/hr-admin/learning), so its tabs are query tabs. */
export function learningTabHref(pathname, key) {
  const base = String(pathname || "").startsWith("/hr-admin/") ? "/hr-admin/learning" : "/zoiko-hr/learning";
  const tab = LEARNING_TABS.find((t) => t.key === key);
  if (base === "/zoiko-hr/learning" && tab?.path) return key === "dashboard" ? base : `${base}/${key}`;
  return `${base}?tab=${key}`;
}
