import { Fragment } from "react";

import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { dayMonth, relativeDay } from "../../lib/format";
import { rampColor } from "../../lib/mapLayers";
import { precip, precipUnitLabel, temp, tempLabel } from "../../lib/units";

/** One row per day: where its low-to-high range sits against the whole period, with rain alongside. */
export default function RangeRibbon({ overview, days = 14, onSelect }) {
  const { units } = useSettings();
  const tz = overview.location.timezone;
  const list = overview.daily.slice(0, days);
  const lo = Math.floor(Math.min(...list.map((d) => d.temperatureMin)));
  const hi = Math.ceil(Math.max(...list.map((d) => d.temperatureMax)));
  const span = hi - lo || 1;
  const now = overview.current.temperature;
  const maxRain = Math.max(5, ...list.map((d) => d.precipitationSum || 0));
  const ticks = [0, 1, 2, 3].map((i) => lo + (span * i) / 3);
  const hottest = list.reduce((b, d) => (d.temperatureMax > b.temperatureMax ? d : b), list[0]);
  const coolest = list.reduce((b, d) => (d.temperatureMin < b.temperatureMin ? d : b), list[0]);

  return (
    <div className="ribbon">
      <div className="ribbon__axis" aria-hidden="true">
        <span />
        <span className="ribbon__ticks">
          {ticks.map((t, i) => (
            <b key={i} style={{ left: `${(i / 3) * 100}%` }}>{tempLabel(t, units)}</b>
          ))}
        </span>
        <span>Rain</span>
      </div>

      <ol role="list">
        {list.map((d, i) => {
          const left = ((d.temperatureMin - lo) / span) * 100;
          const width = Math.max(3, ((d.temperatureMax - d.temperatureMin) / span) * 100);
          const grad = `linear-gradient(90deg, ${rampColor("temperature", d.temperatureMin)}, ${rampColor("temperature", d.temperatureMax)})`;
          const rain = d.precipitationSum || 0;

          return (
            <Fragment key={d.date}>
              {(i === 0 || i === 7) && <li className="ribbon__group" aria-hidden="true">{i === 0 ? "This week" : "Next week"}</li>}
              <li className={i === 0 ? "is-today" : ""}>
                <button type="button" onClick={() => onSelect?.(d.date)} aria-label={`${relativeDay(d.time, overview.current.time, tz)}: ${d.label}, ${tempLabel(d.temperatureMin, units)} to ${tempLabel(d.temperatureMax, units)}. Show details`}>
                  <span className="ribbon__day">
                    <strong>{relativeDay(d.time, overview.current.time, tz)}</strong>
                    <small>{dayMonth(d.time, tz)}</small>
                  </span>
                  <span className="ribbon__cond">
                    <WeatherIcon condition={d.condition} isDay size={26} />
                    <em>{d.label}</em>
                  </span>
                  <span className="ribbon__min">{tempLabel(d.temperatureMin, units)}</span>
                  <span className="ribbon__track">
                    <i style={{ left: `${left}%`, width: `${width}%`, background: grad }} />
                    {i === 0 && now >= lo && now <= hi && <b style={{ left: `${((now - lo) / span) * 100}%` }} title={`Now ${tempLabel(now, units)}`} />}
                    {d === hottest && <u className="is-hot" style={{ left: `${left + width}%` }}>Hottest</u>}
                    {d === coolest && d !== hottest && <u className="is-cool" style={{ left: `${left}%` }}>Coolest</u>}
                  </span>
                  <span className="ribbon__max">{tempLabel(d.temperatureMax, units)}</span>
                  <span className="ribbon__rain" title={`${Math.round(d.precipProbability ?? 0)}% chance of precipitation`}>
                    <span className="ribbon__rbar"><i style={{ width: `${Math.min(100, (rain / maxRain) * 100)}%` }} /></span>
                    <small>{d.precipProbability >= 10 ? `${Math.round(d.precipProbability)}%` : "–"}{rain >= 0.5 ? ` · ${precip(rain, units)} ${precipUnitLabel(units)}` : ""}</small>
                  </span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
