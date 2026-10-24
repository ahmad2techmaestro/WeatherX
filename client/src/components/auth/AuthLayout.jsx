import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BellRing, Map as MapIcon, Sparkles } from "lucide-react";

import Logo from "../ui/Logo";
import { useAuth } from "../../context/AuthContext";
import { AUTHOR } from "../../lib/author";

const POINTS = [
  { icon: Sparkles, title: "A briefing, every morning", text: "What to expect, what to plan around and the best hour to be outside." },
  { icon: MapIcon, title: "A map that reads at a glance", text: "Live layers, wind flow and satellite views for any place in India." },
  { icon: BellRing, title: "Alerts before the weather", text: "Heat, rain, wind and storms for the places you care about." },
];

/** Split-screen frame for sign in and sign up: brand and proof on the left, the form on the right. */
export default function AuthLayout() {
  const { isAuthenticated, loading } = useAuth();
  const { state } = useLocation();

  if (!loading && isAuthenticated) return <Navigate to={state?.from || "/"} replace />;

  return (
    <div className="auth">
      <aside className="auth__brand" aria-hidden="false">
        <svg className="auth__art" viewBox="0 0 800 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="au-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#08121a" />
              <stop offset="0.55" stopColor="#10303b" />
              <stop offset="1" stopColor="#3b4f4c" />
            </linearGradient>
            <radialGradient id="au-sun" cx="0.72" cy="0.74" r="0.5">
              <stop offset="0" stopColor="#ffd37a" stopOpacity="0.95" />
              <stop offset="0.25" stopColor="#ffb81c" stopOpacity="0.45" />
              <stop offset="1" stopColor="#ffb81c" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="800" height="900" fill="url(#au-sky)" />
          <rect width="800" height="900" fill="url(#au-sun)" />
          <circle cx="576" cy="666" r="34" fill="#ffe3a1" />
          <g fill="none" stroke="#fff" strokeOpacity="0.07">
            <circle cx="576" cy="666" r="120" />
            <circle cx="576" cy="666" r="220" />
            <circle cx="576" cy="666" r="340" />
            <circle cx="576" cy="666" r="480" />
          </g>
          <path d="M0 700 L110 610 L210 668 L340 560 L470 650 L560 600 L700 690 L800 630 V900 H0Z" fill="#0e2630" opacity="0.9" />
          <path d="M0 770 C140 700 250 790 400 744 C560 694 650 790 800 736 V900 H0Z" fill="#0a1b23" />
          <path d="M0 838 C180 800 320 868 520 834 C660 810 740 846 800 830 V900 H0Z" fill="#06121a" />
        </svg>

        <div className="auth__brand-inner">
          <Logo size={34} />

          <div className="auth__pitch">
            <h2>Weather you can plan a day around.</h2>
            <p>Precise forecasts, air quality and live maps for every town and village in India.</p>
          </div>

          <ul className="auth__points" role="list">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="auth__point-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="auth__credit">Designed and developed by {AUTHOR.name}</p>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__mobile-logo">
          <Logo size={30} />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
