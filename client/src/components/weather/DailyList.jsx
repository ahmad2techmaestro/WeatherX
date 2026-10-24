import { useMemo, useState } from "react";
import { ChevronDown, Droplets, Sunrise, Sunset, Wind } from "lucide-react";

import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { clockLabel, dayMonth, relativeDay, weekdayLong } from "../../lib/format";
import { compass, precip, precipUnitLabel, temp, tempLabel, wind, windUnitLabel } from "../../lib/units";
import { uvLevel } from "../../lib/weather";

export default function DailyList({ overview, days = 10 }) {
  const { units } = useSettings();
  const [open, setOpen] = useState(null);
  const tz = overview.location.timezone;
  const list = overview.daily.slice(0, days);

  const { lo, hi } = useMemo(() => {
    const mins = list.map((d) => d.temperatureMin).filter((v) => v !== null);
    const maxs = list.map((d) => d.temperatureMax).filter((v) => v !== null);

    return { lo: Math.min(...mins), hi: Math.max(...maxs) };
  }, [list]);

  const span = Math.max(1, hi - lo);

  return (
    <ol role="list" className="daily">
      {list.map((day, index) => {
        const expanded = open === day.date;
        const left = ((day.temperatureMin - lo) / span) * 100;
        const width = Math.max(6, ((day.temperatureMax - day.temperatureMin) / span) * 100);
        const nowMark = index === 0 && overview.current.temperature !== null ? ((overview.current.temperature - lo) / span) * 100 : null;

        return (
          <li key={day.date} className={`daily__row ${expanded ? "is-open" : ""}`}>
            <button type="button" className="daily__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : day.date)}>
              <span className="daily__day">
                <strong>{relativeDay(day.time, overview.current.time, tz)}</strong>
                <small>{dayMonth(day.time, tz)}</small>
              </span>
              <span className="daily__icon">
                <WeatherIcon condition={day.condition} isDay size={34} title={day.label} />
                <span className={`daily__rain ${day.precipProbability >= 20 ? "" : "is-quiet"}`}>{day.precipProbability >= 10 ? `${day.precipProbability}%` : ""}</span>
              </span>
              <span className="daily__lo">{tempLabel(day.temperatureMin, units)}</span>
              <span className="daily__bar" aria-hidden="true">
                <i style={{ left: `${left}%`, width: `${width}%` }} />
                {nowMark !== null && <b style={{ left: `${Math.min(100, Math.max(0, nowMark))}%` }} />}
              </span>
              <span className="daily__hi">{tempLabel(day.temperatureMax, units)}</span>
              <ChevronDown size={18} aria-hidden="true" className="daily__chev" />
              <span className="sr-only">
                {day.label}, low {temp(day.temperatureMin, units)}, high {temp(day.temperatureMax, units)}, {day.precipProbability}% chance of rain.
              </span>
            </button>

            {expanded && (
              <dl className="daily__detail">
                <div>
                  <dt>{weekdayLong(day.time, tz)}</dt>
                  <dd>{day.label}</dd>
                </div>
                <div>
                  <dt>
                    <Droplets size={14} aria-hidden="true" /> Rain
                  </dt>
                  <dd>
                    {precip(day.precipitationSum, units)} {precipUnitLabel(units)} · {day.precipitationHours} h
                  </dd>
                </div>
                <div>
                  <dt>
                    <Wind size={14} aria-hidden="true" /> Wind
                  </dt>
                  <dd>
                    {wind(day.windSpeedMax, units)} {windUnitLabel(units)} {compass(day.windDirection)}, gusts {wind(day.windGustMax, units)}
                  </dd>
                </div>
                <div>
                  <dt>UV peak</dt>
                  <dd>
                    {Math.round(day.uvIndexMax ?? 0)} · {uvLevel(day.uvIndexMax).label}
                  </dd>
                </div>
                <div>
                  <dt>Feels like</dt>
                  <dd>
                    {tempLabel(day.feelsLikeMin, units)} to {tempLabel(day.feelsLikeMax, units)}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Sunrise size={14} aria-hidden="true" /> / <Sunset size={14} aria-hidden="true" />
                  </dt>
                  <dd>
                    {day.sunrise ? clockLabel(day.sunrise, tz) : "—"} / {day.sunset ? clockLabel(day.sunset, tz) : "—"}
                  </dd>
                </div>
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
