import { api, setSession, clearSession, getStoredUser, getAccessToken } from "./api";

/**
 * Expects a FastAPI backend exposing:
 * POST /auth/login        { email, password }            -> { access_token, refresh_token, user }
 * POST /auth/register      { name, email, password, ... } -> { access_token, refresh_token, user }
 * GET  /auth/me             (bearer token)                -> user
 * POST /auth/logout         (bearer token)                -> 204
 * POST /auth/refresh        { refresh_token }             -> { access_token, refresh_token }
 *
 * Adjust the paths/payload shapes here if your FastAPI routes differ —
 * this file is the single integration point for authentication.
 */

export async function login({ email, password }) {
  try {
    const data = await api.post("/auth/login", { email, password }, { auth: false });
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

export async function register({ name, email, password, organization, products, orgType, phone, address, city, state, country, timezone, industry, taxNumber, registeredEmail }) {
  try {
    const payload = { name, email, password, organization, products };
    if (orgType) payload.org_type = orgType;
    if (phone) payload.phone = phone;
    if (address) payload.address = address;
    if (city) payload.city = city;
    if (state) payload.state = state;
    if (country) payload.country = country;
    if (timezone) payload.timezone = timezone;
    if (industry) payload.industry = industry;
    if (taxNumber) payload.tax_number = taxNumber;
    if (registeredEmail) payload.registered_email = registeredEmail;
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

export async function fetchCurrentUser() {
  try {
    const user = await api.get("/auth/me");
    return user;
  } catch (err) {
    const cached = getCachedUser();
    if (cached) return cached;
    if (err?.authInvalid) clearSession();
    throw err;
  }
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
