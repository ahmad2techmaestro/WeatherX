import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage, fetchOverview, isCanceled } from "../lib/api";
// ~100 m precision, so a live location that has moved gets its own forecast.
const placeKey = (p) => `${Number(p.latitude).toFixed(3)},${Number(p.longitude).toFixed(3)}`;

const FRESH_MS = 5 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;

// Shared across pages: moving Today → Forecast → Map must not refetch the same place.
const cache = new Map();

/**
 * Overview for one place with stale-while-revalidate: cached data shows instantly
 * while a fresh copy loads, errors keep the last good data on screen, and the data
 * quietly refreshes every ten minutes while the tab is visible.
 */
export default function useOverview(place) {
  const key = place ? placeKey(place) : null;
  const [state, setState] = useState(() => ({ key, data: cache.get(key)?.data ?? null, error: "", loading: !cache.get(key), fetchedAt: cache.get(key)?.at ?? null }));
  const controller = useRef(null);
  const placeRef = useRef(place);

  placeRef.current = place;

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const current = placeRef.current;

      if (!current) return;

      const requestKey = placeKey(current);

      controller.current?.abort();
      controller.current = new AbortController();

      setState((s) => (s.key === requestKey ? { ...s, loading: !silent && !s.data, error: silent ? s.error : "" } : s));

      try {
        const data = await fetchOverview(current, { signal: controller.current.signal });

        cache.set(requestKey, { data, at: Date.now() });
        setState((s) => (s.key === requestKey ? { key: requestKey, data, error: "", loading: false, fetchedAt: Date.now() } : s));
      } catch (error) {
        if (isCanceled(error)) return;

        setState((s) => (s.key === requestKey ? { ...s, loading: false, error: errorMessage(error, "Couldn't load the weather right now.") } : s));
      }
    },
    []
  );

  // Place changed: show cached data immediately (if any), then revalidate.
  useEffect(() => {
    if (!key) return undefined;

    const hit = cache.get(key);

    setState({ key, data: hit?.data ?? null, error: "", loading: !hit, fetchedAt: hit?.at ?? null });

    if (!hit || Date.now() - hit.at > FRESH_MS) load({ silent: Boolean(hit) });

    return () => controller.current?.abort();
  }, [key, load]);

  // Background refresh while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, REFRESH_MS);

    const onVisible = () => {
      const hit = cache.get(placeRef.current ? placeKey(placeRef.current) : "");

      if (document.visibilityState === "visible" && hit && Date.now() - hit.at > REFRESH_MS) load({ silent: true });
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { data: state.data, error: state.error, loading: state.loading, fetchedAt: state.fetchedAt, refresh: () => load({ silent: false }) };
}

/** Test helper / manual invalidation. */
export const clearOverviewCache = () => cache.clear();
