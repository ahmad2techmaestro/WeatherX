import { useEffect, useMemo, useState } from "react";
import { Droplets, Sun, Sunrise, Sunset, Wind } from "lucide-react";

import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { clockLabel, dateKey, dayMonth, relativeDay, weekdayLong } from "../../lib/format";
import { compass, precip, precipUnitLabel, tempLabel, wind, windUnitLabel } from "../../lib/units";
import { dayParts } from "../../lib/dayParts";
import { uvLevel } from "../../lib/weather";

/** Day-by-day cards: headline, four parts of the day (where hourly data exists) and the details that matter. */
export default function DayCards({ overview, days = 14, focusDate, focusKey }) {
  const { units } = useSettings();
  const tz = overview.location.timezone;
  const [flash, setFlash] = useState(null);

  const byDay = useMemo(() => {
    const map = new Map();

    overview.hourly.forEach((h) => {
      const key = dateKey(h.time, tz);

      if (!map.has(key)) map.set(key, []);

      map.get(key).push(h);
    });

    return map;
  }, [overview.hourly, tz]);

  useEffect(() => {
    if (!focusDate) return undefined;

    document.getElementById(`day-${focusDate}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(focusDate);

    const timer = setTimeout(() => setFlash(null), 1800);

    return () => clearTimeout(timer);
  }, [focusDate, focusKey]);

  return (
    <ol className="dcards" role="list">
      {overview.daily.slice(0, days).map((d, i) => {
        const hours = byDay.get(d.date) || [];
        const uv = uvLevel(d.uvIndexMax);
        const parts = dayParts(hours, tz);
        const chance = Math.round(d.precipProbability ?? 0);
        const rainAmount = d.precipitationSum >= 0.1 ? `${precip(d.precipitationSum, units)} ${precipUnitLabel(units)}` : "None";

        return (
          <li key={d.date} id={`day-${d.date}`} className={`dcard${i === 0 ? " is-today" : ""}${flash === d.date ? " is-flash" : ""}`}>
            <header className="dcard__head">
              <div>
                <h3>{relativeDay(d.time, overview.current.time, tz)}</h3>
                <p>{weekdayLong(d.time, tz)}, {dayMonth(d.time, tz)}</p>
              </div>
              <WeatherIcon condition={d.condition} isDay size={46} />
            </header>

            <div className="dcard__temps">
              <div>
                <small>High</small>
                <b>{tempLabel(d.temperatureMax, units)}</b>
              </div>
              <div>
                <small>Low</small>
                <b className="is-low">{tempLabel(d.temperatureMin, units)}</b>
              </div>
              <p>
                {d.label}
                <span>Feels {tempLabel(d.feelsLikeMin, units)} to {tempLabel(d.feelsLikeMax, units)}</span>
              </p>
            </div>

            {parts.length > 0 && (
              <ul className="dcard__parts" role="list" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }} aria-label="Temperature through the day">
                {parts.map((p) => (
                  <li key={p.key}>
                    <small>{p.label}</small>
                    <WeatherIcon condition={p.mid.condition} isDay={p.mid.isDay} size={24} />
                    <b>{tempLabel(p.t, units)}</b>
                  </li>
                ))}
              </ul>
            )}

            <dl className="dcard__facts">
              <div>
                <dt><Droplets size={14} aria-hidden="true" /> Rain</dt>
                <dd>{chance >= 10 ? `${chance}%` : "Dry"}</dd>
                <small>{d.precipitationSum >= 0.1 ? rainAmount : "No rain expected"}</small>
              </div>
              <div>
                <dt><Wind size={14} aria-hidden="true" /> Wind</dt>
                <dd>{wind(d.windSpeedMax, units)} <em>{windUnitLabel(units)}</em></dd>
                <small>From the {compass(d.windDirection)}</small>
              </div>
              <div>
                <dt><Sun size={14} aria-hidden="true" /> UV index</dt>
                <dd>{Math.round(d.uvIndexMax ?? 0)}</dd>
                <small>{uv.label}</small>
              </div>
            </dl>

            <p className="dcard__sun">
              <span><Sunrise size={14} aria-hidden="true" /> {clockLabel(d.sunrise, tz)}</span>
              <span><Sunset size={14} aria-hidden="true" /> {clockLabel(d.sunset, tz)}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
