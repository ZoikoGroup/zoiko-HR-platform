import { api, setSession, clearSession, getStoredUser, getAccessToken } from "./api";

/**
 * Expects a FastAPI backend exposing:
 * POST /auth/login        { email, password }            -> { access_token, refresh_token, user }
 *                                                           or { requires_org_selection, organizations, selection_token }
 * POST /auth/login/select-organization { selection_token, organization_id } -> { access_token, refresh_token, user }
 * POST /auth/register      { name, email, password, ... } -> { access_token, refresh_token, user }
 * GET  /auth/me             (bearer token)                -> user
 * POST /auth/logout         (bearer token)                -> 204
 * POST /auth/refresh        { refresh_token }             -> { access_token, refresh_token }
 *
 * Adjust the paths/payload shapes here if your FastAPI routes differ —
 * this file is the single integration point for authentication.
 */

/**
 * The address has a matching account in more than one organization: no session yet. The caller shows the organizations
 * and finishes with selectOrganization(). Returned instead of a user, so callers can tell the two apart.
 */
function organizationChoice(data) {
  if (!data?.requires_org_selection) return null;
  return {
    requiresOrgSelection: true,
    organizations: Array.isArray(data.organizations) ? data.organizations : [],
    selectionToken: data.selection_token,
    message: data.message || "",
  };
}

export async function login({ email, password, mfaCode, organizationId }) {
  try {
    const body = { email, password };
    if (mfaCode) body.mfa_code = mfaCode;                       // platform accounts: the 6-digit authenticator code
    if (organizationId !== undefined && organizationId !== null) body.organization_id = organizationId;
    const data = await api.post("/auth/login", body, { auth: false });
    const choice = organizationChoice(data);
    if (choice) return choice;
    const user = data.employee || data.user;
    setSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user,
    });
    return user;
  } catch (err) {
    console.error("Login request failed:", err);
    throw err;
  }
}

/**
 * Second step when the address has accounts in several organizations: signs in to the one chosen from the list the
 * server returned. organizationId is null for the platform administration account (which then needs mfaCode).
 */
export async function selectOrganization({ selectionToken, organizationId, mfaCode }) {
  const body = { selection_token: selectionToken, organization_id: organizationId ?? null };
  if (mfaCode) body.mfa_code = mfaCode;
  const data = await api.post("/auth/login/select-organization", body, { auth: false });
  const user = data.employee || data.user;
  setSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
  return user;
}

/** Platform accounts: the secret for the authenticator app (shown once; it is not active until confirmed). */
export async function mfaEnrollStart({ email, password }) {
  return await api.post("/auth/mfa/enroll/start", { email, password }, { auth: false });
}

/** Platform accounts: proves the app has the secret, turns the second factor on, and signs the person in. */
export async function mfaEnrollConfirm({ email, password, code }) {
  const data = await api.post("/auth/mfa/enroll/confirm", { email, password, code }, { auth: false });
  const user = data.employee || data.user;
  setSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
  return user;
}

/**
 * Platform accounts: a fresh authenticator check for a sensitive action. The server answers with a short-lived access token
 * that carries the check (`mfa_at`); it replaces the current one, and the refresh token is kept.
 */
export async function mfaStepUp(code) {
  const data = await api.post("/auth/mfa/step-up", { code });
  setSession({ accessToken: data.access_token });
  return data;
}

/** Confirms an e-mail address from the link that was e-mailed. */
export async function verifyEmail(token) {
  return await api.post("/auth/verify-email", { token }, { auth: false });
}

/** Asks for a new confirmation link (the answer is the same whether or not the address has an account). */
export async function resendVerification(email) {
  return await api.post("/auth/resend-verification", { email }, { auth: false });
}

/** Is Sign in with Google set up on this server? (false when the server cannot be reached: the button then says so) */
/** true/false as the server says; null when the server could not be asked (starting up, offline), so a blip does not
 *  switch the button off. If Google really is not set up, the server's /auth/google/login says so after the click. */
export async function googleSignInEnabled() {
  try {
    const data = await api.get("/auth/google/status", { auth: false });
    return !!data?.enabled;
  } catch {
    return null;
  }
}

/** Trades the one-time ticket the server handed back after Google for the same session a password sign-in gives. */
export async function loginWithGoogleTicket(ticket) {
  const data = await api.post("/auth/google/exchange", { ticket }, { auth: false });
  const choice = organizationChoice(data);                     // the Google address has accounts in several organizations
  if (choice) return choice;
  const user = data.employee || data.user;
  setSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
  return user;
}

export async function sendRegistrationOtp({ registeredEmail, orgName }) {
  try {
    const payload = { registered_email: registeredEmail };
    if (orgName) payload.org_name = orgName;
    const data = await api.post("/auth/send-registration-otp", payload, { auth: false });
    return data;
  } catch (err) {
    console.error("Send registration OTP failed:", err);
    throw err;
  }
}

export async function verifyRegistrationOtp({ registeredEmail, otp }) {
  try {
    const data = await api.post(
      "/auth/verify-registration-otp",
      { registered_email: registeredEmail, otp },
      { auth: false }
    );
    return data;
  } catch (err) {
    console.error("Verify registration OTP failed:", err);
    throw err;
  }
}

export async function register({ name, email, password, organization, planCode, orgType, phone, address, city, state, country, timezone, industry, taxNumber, taxIdType, registeredEmail, googleProof, otp }) {
  try {
    const payload = { name, email, password, organization, plan_code: planCode };
    if (orgType) payload.org_type = orgType;
    if (phone) payload.phone = phone;
    if (address) payload.address = address;
    if (city) payload.city = city;
    if (state) payload.state = state;
    if (country) payload.country = country;
    if (timezone) payload.timezone = timezone;
    if (industry) payload.industry = industry;
    if (taxNumber) payload.tax_number = taxNumber;
    if (taxIdType) payload.tax_id_type = taxIdType;
    if (registeredEmail) payload.registered_email = registeredEmail;
    if (googleProof) payload.google_proof = googleProof;
    if (otp) payload.otp = otp;
    const data = await api.post(
      "/auth/register",
      payload,
      { auth: false }
    );
    return data;
  } catch (err) {
    console.error("Register request failed:", err);
    throw err;
  }
}

// One in-flight /auth/me at a time; the shell and the route guards both mount
// in dev, and /auth/me is a slow round trip to the database.
let currentUserRequest = null;

export async function fetchCurrentUser() {
  if (currentUserRequest) return currentUserRequest;
  currentUserRequest = (async () => {
    try {
      const user = await api.get("/auth/me");
      return user;
    } catch (err) {
      if (err?.authInvalid) {
        clearSession();
        throw err;
      }
      if (isAuthenticated()) {
        const cached = getCachedUser();
        if (cached) return cached;
      }
      throw err;
    }
  })().finally(() => {
    currentUserRequest = null;
  });
  return currentUserRequest;
}

export async function logout() {
  try {
    if (getAccessToken()) {
      await api.post("/auth/logout", undefined);
    }
  } catch (err) {
    console.error("[Auth] Logout error (non-fatal):", err);
  } finally {
    clearSession();
  }
}

export function getCachedUser() {
  return getStoredUser();
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export async function getProducts() {
  try {
    return await api.get("/auth/products", { auth: false });
  } catch (err) {
    console.error("Failed to fetch products:", err);
    throw err;
  }
}

export async function forgotPassword({ email }) {
  try {
    return await api.post("/auth/forgot-password", { email }, { auth: false });
  } catch (err) {
    console.error("Forgot password request failed:", err);
    throw err;
  }
}

/** Sets a new password from the single-use token in an emailed reset link. */
export async function resetPasswordWithToken({ token, password }) {
  return await api.post("/auth/reset-password", { token, password }, { auth: false });
}

export async function forgotMyPassword() {
  return await api.post("/auth/me/forgot-password", {});
}

export async function changePassword({ currentPassword, newPassword }) {
  try {
    const data = await api.post("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // If backend returns new tokens (session rotation), update them
    if (data?.access_token) {
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
    }
    return data;
  } catch (err) {
    console.error("Change password failed:", err);
    throw err;
  }
}
