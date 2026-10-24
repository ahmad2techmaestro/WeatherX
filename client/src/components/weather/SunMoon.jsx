import { Moon as MoonIcon, Sunrise, Sunset } from "lucide-react";

import useNow from "../../hooks/useNow";
import { clockLabel, durationLabel } from "../../lib/format";
import { moonPath } from "../../lib/scenes";

function SunArc({ sunrise, sunset, now, tz }) {
  const W = 300;
  const H = 130;
  const progress = Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise)));
  const up = now >= sunrise && now <= sunset;
  // Point on a half-ellipse from (20,110) over the top to (280,110).
  const angle = Math.PI * (1 - progress);
  const x = 150 + 130 * Math.cos(angle);
  const y = 110 - 90 * Math.sin(angle);

  return (
    <figure className="sunarc">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sunrise ${clockLabel(sunrise, tz)}, sunset ${clockLabel(sunset, tz)}`}>
        <line x1="8" y1="110" x2="292" y2="110" className="sunarc__horizon" />
        <path d="M20 110 A130 90 0 0 1 280 110" className="sunarc__path" />
        {up && <path d={`M20 110 A130 90 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} className="sunarc__done" />}
        <circle cx={up ? x : progress >= 1 ? 280 : 20} cy={up ? y : 110} r="8" className={`sunarc__sun ${up ? "" : "is-down"}`} />
      </svg>
      <figcaption>
        <span>
          <Sunrise size={16} aria-hidden="true" /> {clockLabel(sunrise, tz)}
        </span>
        <span>
          {up ? `${durationLabel(sunset - now)} of daylight left` : now < sunrise ? `Sun rises in ${durationLabel(sunrise - now)}` : "Sun has set"}
        </span>
        <span>
          <Sunset size={16} aria-hidden="true" /> {clockLabel(sunset, tz)}
        </span>
      </figcaption>
    </figure>
  );
}

export default function SunMoon({ overview }) {
  const now = useNow();
  const { astronomy, location } = overview;
  const tz = location.timezone;
  const moon = astronomy.moon;

  return (
    <div className="suncard">
      <section className="card" aria-labelledby="sun-title">
        <h2 id="sun-title" className="card__title">
          Sun
        </h2>
        {astronomy.sunrise && astronomy.sunset ? <SunArc sunrise={astronomy.sunrise} sunset={astronomy.sunset} now={Math.max(now, overview.current.time)} tz={tz} /> : <p className="muted">Sun times aren't available for this location (polar day or night).</p>}
        {astronomy.daylightSeconds && <p className="muted center">Day length {durationLabel(astronomy.daylightSeconds)}</p>}
      </section>

      <section className="card moon" aria-labelledby="moon-title">
        <h2 id="moon-title" className="card__title">
          Moon
        </h2>
        <div className="moon__body">
          <svg viewBox="-30 -30 60 60" width="96" height="96" role="img" aria-label={`${moon.name}, ${moon.illumination}% lit`}>
            <circle r="26" className="moon__dark" />
            <path d={moonPath(moon.phase, 26)} className="moon__lit" />
          </svg>
          <div>
            <strong>{moon.name}</strong>
            <p className="muted">
              <MoonIcon size={14} aria-hidden="true" /> {moon.illumination}% illuminated · {moon.waxing ? "waxing" : "waning"}
            </p>
          </div>
        </div>
        {(moon.rise || moon.set) && (
          <dl className="moon__times">
            {moon.rise && <div><dt>Moonrise</dt><dd>{clockLabel(moon.rise, tz)}</dd></div>}
            {moon.set && <div><dt>Moonset</dt><dd>{clockLabel(moon.set, tz)}</dd></div>}
          </dl>
        )}
      </section>
    </div>
  );
}
