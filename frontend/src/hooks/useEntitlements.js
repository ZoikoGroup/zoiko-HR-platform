import { useState, useEffect, useCallback, useRef } from "react";
import { billingService } from "../service/billingService";
import { getStoredUser, organizationIdOf } from "../service/api";

export const GRANTED_STATES = new Set(["ENTITLED_AVAILABLE", "READ_ONLY"]);

const CACHE_PREFIX = "zoiko_entitlements_v1:";
const RETRY_DELAYS_MS = [3000, 8000];

function readCache(orgId) {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + orgId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && parsed.map ? parsed.map : null;
  } catch {
    return null;
  }
}

function writeCache(orgId, map) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + orgId, JSON.stringify({ map, at: Date.now() }));
  } catch {
    /* storage full or blocked: the in-memory map still works */
  }
}

function toMap(states) {
  const mapped = {};
  Object.entries(states || {}).forEach(([key, state]) => {
    mapped[key] = { state, granted: GRANTED_STATES.has(state) };
  });
  return mapped;
}

/**
 * Batch entitlement map for an organization, from the server-authoritative snapshot endpoint.
 *
 * Returns:
 *   entitlements — { featureKey: { state, granted } } for every resolved key
 *   granted(key) — helper: true when the key resolves to a granted state
 *   loading, error, refetch
 *
 * A slow or failed request must not empty the sidebar (it hid Recruitment, Onboarding… whenever the server timed out):
 * - the last map that loaded for this organization is kept (in memory and in the browser) and used until a fresh one
 *   arrives; a failure never replaces a known map with an empty one;
 * - a failed load is retried (3 s, then 8 s) and again when the tab regains focus.
 * With no map ever loaded the hook still fails closed (empty map). Display only: every page and API stays gated by the
 * server.
 */
export function useEntitlements() {
  const orgIdRef = useRef(organizationIdOf(getStoredUser()));
  const cached = orgIdRef.current ? readCache(orgIdRef.current) : null;
  const [entitlements, setEntitlements] = useState(cached || {});
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const known = useRef(Boolean(cached));
  const retryTimer = useRef(null);
  const live = useRef(true);

  const fetchAll = useCallback(async (attempt = 0) => {
    const orgId = organizationIdOf(getStoredUser());
    orgIdRef.current = orgId;
    if (!orgId) {
      setEntitlements({});
      setLoading(false);
      return;
    }
    clearTimeout(retryTimer.current);
    try {
      if (!known.current) setLoading(true);
      setError(null);
      // the self-serve read works for every member of the organization (the per-org snapshot is for billing roles)
      const mine = await billingService.getMyEntitlements();
      if (!live.current) return;
      const mapped = toMap(mine?.states);
      setEntitlements(mapped);
      known.current = true;
      writeCache(orgId, mapped);
    } catch (err) {
      if (!live.current) return;
      if (!known.current) {                              // nothing known yet: fail closed, and say so (Sidebar notice + Retry)
        setEntitlements({});
        setError(err);
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        retryTimer.current = setTimeout(() => fetchAll(attempt + 1), RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      if (live.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    live.current = true;
    fetchAll();
    const onFocus = () => { if (document.visibilityState !== "hidden") fetchAll(); };
    window.addEventListener("focus", onFocus);
    return () => {
      live.current = false;
      clearTimeout(retryTimer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchAll]);

  const granted = useCallback(
    (featureKey) => Boolean(entitlements[featureKey]?.granted),
    [entitlements],
  );

  return { entitlements, granted, loading, error, refetch: () => fetchAll() };
}
