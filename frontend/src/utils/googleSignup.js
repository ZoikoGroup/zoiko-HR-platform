// "Continue with Google" for a person who has no account yet: the server sends them to the Register page with what Google
// confirmed (their email address and name) and a signed proof of it. The proof is bound to that address, so the organization
// they register starts with the address already confirmed.

/** { email, name, proof } from the Register page's address, or null when they did not arrive through Google. */
export function readGoogleSignup(search) {
  const params = new URLSearchParams(search || "");
  const email = (params.get("google_email") || "").trim();
  const proof = params.get("google_proof") || "";
  if (!email || !proof) return null;
  return { email, name: (params.get("google_name") || "").trim(), proof };
}

/** The same address without the Google parameters, so the proof does not stay in the address bar or the history. */
export function withoutGoogleSignupParams(search) {
  const params = new URLSearchParams(search || "");
  for (const key of ["google_email", "google_name", "google_proof"]) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
