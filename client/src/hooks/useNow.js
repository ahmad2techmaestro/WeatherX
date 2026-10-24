import { useEffect, useState } from "react";

/** Current unix time in seconds, refreshed every 30 s so clocks and "sun position" stay live. */
export default function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), interval);

    return () => clearInterval(timer);
  }, [interval]);

  return now;
}
