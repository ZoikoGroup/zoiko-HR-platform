
import { humanizeValidationError } from "../utils/validationMessage";

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "zoiko_access_token";
const REFRESH_KEY = "zoiko_refresh_token";
const USER_KEY = "zoiko_user";
const AUTH_INVALID_EVENT = "zoiko-auth-session-invalid";
// A stalled request must never wedge a loading spinner forever.
const REQUEST_TIMEOUT_MS = 20000;

let refreshPromise = null;
let sessionInvalidNotified = false;

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession({ accessToken, refreshToken, user } = {}) {
  sharedGets.clear();
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (accessToken || refreshToken || user) sessionInvalidNotified = false;
}

export function clearSession() {
  sharedGets.clear();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function notifySessionInvalid(reason) {
  if (sessionInvalidNotified) return;
  sessionInvalidNotified = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, { detail: { reason } }));
  }
}

function createApiError(message, status, extra = {}) {
  const error = new Error(message || `Request failed with status ${status}`);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

/**
 * Low level request helper. Talks to the FastAPI backend at VITE_API_BASE_URL.
 * Automatically attaches the bearer token (if present) and JSON headers,
 * and attempts a single silent refresh on a 401 response.
 */
export async function apiRequest(path, { method = "GET", body, headers = {}, auth = true, retry = true, params, signal } = {}) {
  let url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (query) url += `${url.includes("?") ? "&" : "?"}${query}`;
  }

  // a header explicitly set to undefined / null means "do not send it": fetch would otherwise send the text "undefined"
  // (that broke every multipart upload, which needs the browser to add its own Content-Type with the boundary)
  const finalHeaders = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined && v !== null));
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  // A caller-supplied signal cancels a superseded request (newer search,
  // filter or page); the timeout keeps a stalled call from hanging forever.
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const finalSignal =
    signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: finalSignal,
  }).catch((e) => {
    if (e?.name === "TimeoutError") throw createApiError("The server took too long to respond. Please try again.", 0);
    throw e;
  });

  if (res.status === 401 && auth && retry) {
    const refreshResult = await tryRefreshToken();
    if (refreshResult.ok) {
      return apiRequest(path, { method, body, headers, auth, retry: false, signal });
    }
    if (refreshResult.invalidSession) {
      clearSession();
      notifySessionInvalid(refreshResult.reason);
      throw createApiError("Your session has expired. Please sign in again.", 401, {
        authInvalid: true,
        refreshStatus: refreshResult.status,
      });
    }
  }

  if (!res.ok) {
    let detail;
    let extra = {};
    try {
      const data = await res.json();
      detail = data?.detail || data?.message || data?.error;
      if (Array.isArray(detail)) {
        // Handle FastAPI 422 validation errors nicely; the raw list stays on the error so a form can show each one
        // next to its own field.
        extra = { validation: detail };
        detail = detail.map(humanizeValidationError).join(", ");
      } else if (typeof detail === "object" && detail !== null) {
        // A feature the plan does not include comes back as an object with a ready-to-show message.
        if (detail.entitlement_state) extra = { entitlement: detail };
        detail = detail.message || JSON.stringify(detail);
      }
      if (typeof data?.error === "string") extra = { ...extra, code: data.error };
      if (data?.feature_key && data?.upgrade_url) {
        extra = { entitlement: { entitlement_state: data.state, feature_key: data.feature_key, required_plan: data.required_plan, upgrade_url: data.upgrade_url } };
      }
    } catch {
      detail = res.statusText;
    }
    throw createApiError(detail, res.status, extra);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

async function tryRefreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Silent token refresh for callers outside apiRequest (e.g. XHR uploads). */
export async function refreshSession() {
  const result = await tryRefreshToken();
  return result.ok;
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { ok: false, invalidSession: true, reason: "missing_refresh_token" };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((e) => {
      if (e?.name === "TimeoutError") return { ok: false, invalidSession: false, reason: "refresh_timeout" };
      throw e;
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        invalidSession: true,
        status: res.status,
        reason: "refresh_rejected",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        invalidSession: false,
        status: res.status,
        reason: "refresh_transient_failure",
      };
    }

    const data = await res.json();
    if (data?.access_token) {
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        user: data.employee || data.user,
      });
      return { ok: true };
    }
    return { ok: false, invalidSession: false, reason: "refresh_missing_access_token" };
  } catch (error) {
    return { ok: false, invalidSession: false, reason: "refresh_network_error", error };
  }
}

// Reference lists that many pages load at once (every performance/assets/recruitment page asks for the same
// 200 employees). Identical GETs in flight share one request, and the answer is reused for a few seconds.
// Any write, login or logout clears it, so a page never shows data older than the user's own last change.
const SHARED_GET = /^\/hr\/(employees|departments|designations|attendance\/shifts)(\?|$)/;
const SHARED_GET_TTL_MS = 10000;
const sharedGets = new Map(); // key -> { promise, expires }

export function clearApiCache() {
  sharedGets.clear();
}

function sharedKey(path, opts) {
  const query = opts?.params
    ? Object.entries(opts.params).filter(([, v]) => v !== undefined && v !== null && v !== "").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&")
    : "";
  return `${getAccessToken() || ""}|${path}?${query}`;
}

function cachedGet(path, opts) {
  const request = () => apiRequest(path, { ...opts, method: "GET" });
  // a caller-supplied abort signal means "this answer may be thrown away": never share those
  if (opts?.signal || !SHARED_GET.test(path)) return request();
  const key = sharedKey(path, opts);
  const hit = sharedGets.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise.then((data) => (data && typeof data === "object" ? structuredClone(data) : data));
  const promise = request();
  sharedGets.set(key, { promise, expires: Date.now() + SHARED_GET_TTL_MS });
  promise.catch(() => sharedGets.delete(key));
  return promise.then((data) => (data && typeof data === "object" ? structuredClone(data) : data));
}

const writing = (fn) => (...args) => {
  clearApiCache();
  return fn(...args).finally(clearApiCache);
};

export const api = {
  get: cachedGet,
  post: writing((path, body, opts) => apiRequest(path, { ...opts, method: "POST", body })),
  put: writing((path, body, opts) => apiRequest(path, { ...opts, method: "PUT", body })),
  patch: writing((path, body, opts) => apiRequest(path, { ...opts, method: "PATCH", body })),
  delete: writing((path, opts) => apiRequest(path, { ...opts, method: "DELETE" })),
};

export { API_BASE_URL, AUTH_INVALID_EVENT };
