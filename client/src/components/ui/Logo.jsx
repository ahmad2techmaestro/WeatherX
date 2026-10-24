import { useId } from "react";

/** WeatherX mark: a sun rising over a "W" ridge line on a deep-ink tile. Same artwork as /favicon.svg. */
export default function Logo({ size = 30, wordmark = true }) {
  const id = useId().replace(/:/g, "");

  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="logo__mark">
        <defs>
          <linearGradient id={`${id}bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1d3340" />
            <stop offset="1" stopColor="#091218" />
          </linearGradient>
          <radialGradient id={`${id}sun`} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#ffe29a" />
            <stop offset="0.55" stopColor="#ffb81c" />
            <stop offset="1" stopColor="#e08a00" />
          </radialGradient>
          <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#b9cdd6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill={`url(#${id}bg)`} />
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="1.5" />
        <circle cx="32" cy="22" r="14" fill="#ffb81c" opacity=".14" />
        <circle cx="32" cy="22" r="8.5" fill={`url(#${id}sun)`} />
        <path d="M13 26 L23 49 L32 32 L41 49 L51 26" fill="none" stroke={`url(#${id}w)`} strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 55.5 H52" stroke="#ffb81c" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {wordmark && (
        <span className="logo__word">
          Weather<span className="logo__x">X</span>
        </span>
      )}
    </span>
  );
}
