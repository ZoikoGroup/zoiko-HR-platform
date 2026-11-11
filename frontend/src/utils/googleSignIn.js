// Sign in with Google: what the login page tells the person. The server sends back a short reason code in the address
// (?google_error=...) after a failed attempt; this turns it into a sentence. Mirrors backend/app/modules/employee/google_auth.ERRORS.
export const GOOGLE_ERRORS = {
  not_configured: "Sign in with Google is not set up for this site yet. Use your email and password.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in did not complete. Please try again.",
  unverified: "Google could not confirm this email address. Use an account whose email is verified.",
  no_account: "No Zoiko HR account uses this Google email address. Ask your administrator to add you, then try again.",
  expired: "That sign-in link expired. Please try again.",
};

export const googleErrorMessage = (code) => GOOGLE_ERRORS[code] || GOOGLE_ERRORS.failed;

export const GOOGLE_NEEDS_PASSWORD =
  "This account needs a code from your authenticator app, which Google sign-in cannot ask for. Sign in with your email and password.";

/** What to show when trading the ticket for a session fails (A1): the server's own reason (deactivated account, suspended
 * organization, expired link, …), a clear sentence for accounts that need a second factor, never silence. */
export function googleExchangeMessage(err) {
  if (err?.code === "MFA_REQUIRED" || err?.code === "MFA_ENROLLMENT_REQUIRED") return GOOGLE_NEEDS_PASSWORD;
  if (err?.status === 0 || !err?.message) return GOOGLE_ERRORS.failed;
  return err.message;
}

/** What the address of the login page carries after Google sends the person back. */
export function readGoogleReturn(search) {
  const params = new URLSearchParams(search || "");
  return { ticket: params.get("google_ticket") || "", error: params.get("google_error") || "" };
}

/** The same address without the Google parameters, so a refresh does not try them again. */
export function withoutGoogleParams(search) {
  const params = new URLSearchParams(search || "");
  params.delete("google_ticket");
  params.delete("google_error");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** Where the "Continue with Google" button sends the browser. return_to names this app, so the server sends the person back
 * here (it checks the origin against its own allow-list) even when its FRONTEND_URL setting is missing (A1). */
export function googleLoginUrl(apiBase, origin) {
  const base = `${String(apiBase || "").replace(/\/$/, "")}/auth/google/login`;
  return origin ? `${base}?return_to=${encodeURIComponent(origin)}` : base;
}
