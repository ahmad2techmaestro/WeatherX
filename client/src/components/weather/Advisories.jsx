import { useState } from "react";
import { AlertOctagon, AlertTriangle, ChevronDown } from "lucide-react";

import { clockLabel, dayMonth } from "../../lib/format";

/**
 * Forecast-based advisories. They are computed from thresholds on the forecast and
 * say so — they are not official warnings, and the footer of each list points to IMD.
 */
export default function Advisories({ advisories, timezone, limit = 3 }) {
  const [all, setAll] = useState(false);

  if (!advisories?.length) return null;

  const shown = all ? advisories : advisories.slice(0, limit);

  return (
    <section className="advisories" aria-label="Weather advisories">
      <ul role="list">
        {shown.map((a) => (
          <li key={a.id} className={`advisory advisory--${a.severity}`}>
            {a.severity === "warning" ? <AlertOctagon size={22} aria-hidden="true" /> : <AlertTriangle size={22} aria-hidden="true" />}
            <div>
              <strong>
                <span className="sr-only">{a.severity === "warning" ? "Warning: " : "Watch: "}</span>
                {a.title}
              </strong>
              <p>{a.detail}</p>
              <small>
                {dayMonth(a.start, timezone)}, {clockLabel(a.start, timezone)} – {a.end - a.start >= 86400 ? "end of day" : clockLabel(a.end, timezone)}
              </small>
            </div>
          </li>
        ))}
      </ul>

      <div className="advisories__foot">
        <span>Advisories are derived from the forecast and are not official warnings. For official alerts, see the </span>
        <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">
          India Meteorological Department
        </a>
        .
        {advisories.length > limit && (
          <button type="button" className="link-btn" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? "Show fewer" : `Show all ${advisories.length}`} <ChevronDown size={14} aria-hidden="true" className={all ? "flip" : ""} />
          </button>
        )}
      </div>
    </section>
  );
}
