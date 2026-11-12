import { useEffect, useState } from "react";

/** True while the media query matches (e.g. "(max-width: 720px)"). */
export default function useMedia(query) {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);

  return match;
}
