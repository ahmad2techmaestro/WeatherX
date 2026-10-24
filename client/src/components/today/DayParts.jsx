import { useMemo } from "react";

import WeatherIcon from "../weather/WeatherIcon";
import { dateKey } from "../../lib/format";
import { dayParts } from "../../lib/dayParts";
import { tempLabel } from "../../lib/units";

/** Today split into night, morning, afternoon and evening (only the parts that are still ahead). */
export default function DayParts({ data, units }) {
  const tz = data.location.timezone;
  const parts = useMemo(() => {
    const key = dateKey(data.current.time, tz);

    return dayParts(data.hourly.filter((h) => dateKey(h.time, tz) === key), tz);
  }, [data, tz]);

  if (!parts.length) return null;

  return (
    <section className="pnl tc" aria-labelledby="tc-parts-t">
      <h2 id="tc-parts-t" className="pnl__title">Rest of today</h2>
      <ul className="parts" role="list">
        {parts.map((p) => (
          <li key={p.key}>
            <small>{p.label}</small>
            <WeatherIcon condition={p.mid.condition} isDay={p.mid.isDay} size={34} />
            <b>{tempLabel(p.t, units)}</b>
            <span className={p.rain >= 40 ? "is-wet" : ""}>{p.rain >= 10 ? `${Math.round(p.rain)}% rain` : "Dry"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
