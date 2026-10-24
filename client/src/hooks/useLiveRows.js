import { useEffect, useState } from "react";

import { fetchMulti } from "../lib/api";
import { placeKey } from "../lib/place";

/** Live summary rows (current, 24 h, 7 days, air quality) for a list of places, keyed by placeKey. */
export default function useLiveRows(places) {
  const [state, setState] = useState({ rows: {}, loading: false });
  const sig = places.map(placeKey).join("|");

  useEffect(() => {
    if (!places.length) {
      setState({ rows: {}, loading: false });

      return undefined;
    }

    const controller = new AbortController();
    const chunks = [];

    for (let i = 0; i < places.length; i += 5) chunks.push(places.slice(i, i + 5));

    setState((s) => ({ ...s, loading: true }));

    // Sequential chunks keep the upstream request rate gentle.
    (async () => {
      const rows = {};

      for (const chunk of chunks) {
        const data = await fetchMulti(chunk, { signal: controller.signal }).catch(() => []);

        data.forEach((row, i) => row?.ok && chunk[i] && (rows[placeKey(chunk[i])] = row));

        if (controller.signal.aborted) return;
      }

      setState({ rows, loading: false });
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return state;
}
