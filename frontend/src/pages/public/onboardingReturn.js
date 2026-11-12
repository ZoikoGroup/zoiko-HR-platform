// Where a new hire's "Back" button on the signing page goes. The onboarding portal remembers its own address for this
// browser tab (sessionStorage), so the signing page (/sign/:token) can send the hire back to it. Storage can be blocked
// (private windows, previews), so every access is guarded and the caller falls back to the browser history.

const KEY = "zhr.onboardingPortalPath";
const PORTAL_PATH = /^\/onboarding-portal\/[A-Za-z0-9_-]{1,200}$/;

export function rememberOnboardingPortal(token) {
  try {
    const path = `/onboarding-portal/${token}`;
    if (PORTAL_PATH.test(path)) window.sessionStorage.setItem(KEY, path);
  } catch { /* storage unavailable */ }
}

export function onboardingPortalPath() {
  try {
    const path = window.sessionStorage.getItem(KEY);
    return path && PORTAL_PATH.test(path) ? path : null;
  } catch {
    return null;
  }
}
