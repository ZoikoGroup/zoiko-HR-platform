import { useCallback, useEffect, useRef, useState } from "react";

// Stale-while-revalidate for page data that is not on React Query yet. Coming back to a page shows the last answer at
// once (no spinner) and asks the server again behind it; the fresh answer replaces it when it arrives. The cache lives in
// memory only, is emptied on any write (clearApiCache in service/api.js calls clearCachedLoads) and on sign-in/out, and
// an entry older than MAX_AGE_MS is not shown at all.
const MAX_AGE_MS = 5 * 60_000;
const cache = new Map(); // key -> { data, at }

export function clearCachedLoads() {
  cache.clear();
}

/** Warm an entry before the page opens (hovering its sidebar link): skipped when a fresh one is already there. */
export function primeCachedLoad(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS / 5) return Promise.resolve(hit.data);
  return Promise.resolve().then(load).then((data) => { cache.set(key, { data, at: Date.now() }); return data; });
}

/**
 * useCachedLoad(key, load) -> { data, loading, error, reload }
 * key: a string naming the data (include every parameter the load uses); null/undefined disables the cache.
 * load: () => Promise<data>
 */
export function useCachedLoad(key, load) {
  const hit = key != null ? cache.get(key) : null;
  const fresh = hit && Date.now() - hit.at < MAX_AGE_MS ? hit : null;
  const [state, setState] = useState(() => ({ data: fresh ? fresh.data : null, loading: !fresh, error: "" }));
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const run = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await loadRef.current();
      if (key != null) cache.set(key, { data, at: Date.now() });
      if (mine === seq.current) setState({ data, loading: false, error: "" });
      return data;
    } catch (e) {
      if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: e?.message || "The data could not be loaded." }));
      return null;
    }
  }, [key]);

  useEffect(() => {
    const cached = key != null ? cache.get(key) : null;
    const usable = cached && Date.now() - cached.at < MAX_AGE_MS;
    if (usable) setState({ data: cached.data, loading: false, error: "" });
    run({ quiet: Boolean(usable) });            // shown from cache: refresh behind it without a spinner
  }, [key, run]);

  return { ...state, reload: () => run() };
}
