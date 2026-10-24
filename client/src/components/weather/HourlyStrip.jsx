import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Sunrise, Sunset } from "lucide-react";

import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { clockLabel, hourLabel } from "../../lib/format";
import { tempLabel } from "../../lib/units";

export default function HourlyStrip({ overview, hours = 24 }) {
  const { units } = useSettings();
  const scroller = useRef(null);
  const tz = overview.location.timezone;
  const { sunrise, sunset } = overview.astronomy;
  const tomorrow = overview.daily[1];

  // Walk the hours and slot sunrise/sunset markers in where they actually fall.
  const items = useMemo(() => {
    const out = [];
    const events = [
      sunrise && { t: sunrise, kind: "sunrise" },
      sunset && { t: sunset, kind: "sunset" },
      tomorrow?.sunrise && { t: tomorrow.sunrise, kind: "sunrise" },
      tomorrow?.sunset && { t: tomorrow.sunset, kind: "sunset" },
    ].filter(Boolean);

    overview.hourly.slice(0, hours).forEach((hour, index) => {
      out.push({ type: "hour", hour, index });

      events.filter((e) => e.t >= hour.time && e.t < hour.time + 3600).forEach((e) => out.push({ type: e.kind, t: e.t }));
    });

    return out;
  }, [overview.hourly, hours, sunrise, sunset, tomorrow]);

  const scrollBy = (dir) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <div className="hourly">
      <button type="button" className="hourly__nav hourly__nav--prev icon-btn" onClick={() => scrollBy(-1)} aria-label="Scroll earlier hours">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <div className="hourly__scroll" ref={scroller} tabIndex={0} role="region" aria-label={`Hourly forecast, next ${hours} hours`}>
        <ol role="list">
          {items.map((item) =>
            item.type === "hour" ? (
              <li key={item.hour.time} className={`hourly__item ${item.index === 0 ? "is-now" : ""}`}>
                <span className="hourly__time">{item.index === 0 ? "Now" : hourLabel(item.hour.time, tz)}</span>
                <WeatherIcon condition={item.hour.condition} isDay={item.hour.isDay} size={34} title={item.hour.label} />
                <strong>{tempLabel(item.hour.temperature, units)}</strong>
                <span className={`hourly__rain ${(item.hour.precipProbability ?? 0) >= 20 ? "" : "is-quiet"}`}>{(item.hour.precipProbability ?? 0) >= 10 ? `${item.hour.precipProbability}%` : "–"}</span>
              </li>
            ) : (
              <li key={`${item.type}-${item.t}`} className="hourly__item hourly__item--event">
                <span className="hourly__time">{clockLabel(item.t, tz)}</span>
                {item.type === "sunrise" ? <Sunrise size={28} aria-hidden="true" /> : <Sunset size={28} aria-hidden="true" />}
                <strong>{item.type === "sunrise" ? "Sunrise" : "Sunset"}</strong>
                <span className="hourly__rain is-quiet">&nbsp;</span>
              </li>
            )
          )}
        </ol>
      </div>
      <button type="button" className="hourly__nav hourly__nav--next icon-btn" onClick={() => scrollBy(1)} aria-label="Scroll later hours">
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
