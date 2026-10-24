import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Droplets, Sunrise, Sunset, Thermometer, Wind } from "lucide-react";

import Tabs from "../ui/Tabs";
import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { clockLabel, dateKey, hourLabel, relativeDay, weekdayShort, dayMonth } from "../../lib/format";
import { compass, distance, distanceUnitLabel, precip, precipUnitLabel, temp, tempLabel, wind, windUnitLabel } from "../../lib/units";

const COL = 68;
const CURVE_H = 120;
const PAD = 26;

const METRICS = [
  { value: "temperature", label: "Temperature" },
  { value: "feelsLike", label: "Feels like" },
  { value: "precipProbability", label: "Rain chance" },
  { value: "windSpeed", label: "Wind" },
  { value: "visibilityKm", label: "Visibility" },
];

/** Smooth path through points using horizontal tangents (no overshoot between hours). */
function smooth(points) {
  if (points.length < 2) return "";

  let d = `M${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;

    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }

  return d;
}

/** Hour-by-hour timeline: a live curve for the chosen measure, with rain, wind and day/night per hour. */
export default function HourlyTimeline({ overview, hours = 48 }) {
  const { units } = useSettings();
  const scroller = useRef(null);
  const [metric, setMetric] = useState("temperature");
  const tz = overview.location.timezone;
  const list = useMemo(() => overview.hourly.slice(0, hours), [overview.hourly, hours]);
  const width = list.length * COL;

  const display = (h) => {
    const v = h[metric];

    if (v === null || v === undefined) return null;
    if (metric === "temperature" || metric === "feelsLike") return temp(v, units);
    if (metric === "windSpeed") return wind(v, units);
    if (metric === "visibilityKm") return distance(v, units);

    return Math.round(v);
  };

  const unitText = metric === "precipProbability" ? "%" : metric === "windSpeed" ? ` ${windUnitLabel(units)}` : metric === "visibilityKm" ? ` ${distanceUnitLabel(units)}` : "°";

  const curve = useMemo(() => {
    const vals = list.map((h) => h[metric]).filter((v) => Number.isFinite(v));

    if (!vals.length) return null;

    const lo = metric === "precipProbability" || metric === "visibilityKm" ? 0 : Math.min(...vals);
    const hi = metric === "precipProbability" ? 100 : Math.max(...vals);
    const span = hi - lo || 1;
    const pts = list.map((h, i) => [i * COL + COL / 2, PAD + (1 - ((Number.isFinite(h[metric]) ? h[metric] : lo) - lo) / span) * (CURVE_H - PAD * 2)]);
    const line = smooth(pts);

    return { pts, line, area: `${line} L${pts[pts.length - 1][0]} ${CURVE_H} L${pts[0][0]} ${CURVE_H}Z`, lo, hi };
  }, [list, metric]);

  const groups = useMemo(() => {
    const out = [];

    list.forEach((h, i) => {
      const key = dateKey(h.time, tz);
      const last = out[out.length - 1];

      if (last && last.key === key) last.count += 1;
      else out.push({ key, start: i, count: 1, time: h.time });
    });

    return out;
  }, [list, tz]);

  const events = useMemo(() => {
    const e = new Map();
    const days = [overview.astronomy, ...overview.daily.slice(1, 3)];

    days.forEach((d) => {
      [[d.sunrise, "sunrise"], [d.sunset, "sunset"]].forEach(([t, kind]) => {
        if (!t) return;

        const idx = list.findIndex((h) => t >= h.time && t < h.time + 3600);

        if (idx >= 0) e.set(idx, { kind, t });
      });
    });

    return e;
  }, [list, overview.astronomy, overview.daily]);

  const summary = useMemo(() => {
    const temps = list.filter((h) => Number.isFinite(h.temperature));
    const peak = temps.reduce((b, h) => (h.temperature > b.temperature ? h : b), temps[0]);
    const low = temps.reduce((b, h) => (h.temperature < b.temperature ? h : b), temps[0]);
    const wet = list.findIndex((h) => (h.precipitation ?? 0) >= 0.3 || (h.precipProbability ?? 0) >= 60);
    let wetEnd = wet;

    while (wet >= 0 && wetEnd + 1 < list.length && ((list[wetEnd + 1].precipitation ?? 0) >= 0.3 || (list[wetEnd + 1].precipProbability ?? 0) >= 60)) wetEnd += 1;

    const gust = list.reduce((b, h) => ((h.windGust ?? 0) > (b?.windGust ?? 0) ? h : b), null);
    const total = list.reduce((s, h) => s + (h.precipitation || 0), 0);

    return { peak, low, wet: wet >= 0 ? { from: list[wet], to: list[wetEnd] } : null, gust, total };
  }, [list]);

  const scrollBy = (dir) => scroller.current?.scrollBy({ left: dir * COL * 5, behavior: "smooth" });

  const when = (h) => `${relativeDay(h.time, overview.current.time, tz)} ${hourLabel(h.time, tz)}`;

  return (
    <div className="tl">
      <ul className="tl__facts" role="list">
        <li><Thermometer size={16} aria-hidden="true" /> <span>High <b>{tempLabel(summary.peak.temperature, units)}</b> · {when(summary.peak)}</span></li>
        <li><Thermometer size={16} aria-hidden="true" /> <span>Low <b>{tempLabel(summary.low.temperature, units)}</b> · {when(summary.low)}</span></li>
        <li><Droplets size={16} aria-hidden="true" /> <span>{summary.wet ? <>Rain <b>{when(summary.wet.from)}</b> to {hourLabel(summary.wet.to.time + 3600, tz)} · {precip(summary.total, units)} {precipUnitLabel(units)}</> : <>No rain expected in the next {list.length} hours</>}</span></li>
        {summary.gust?.windGust >= 25 && <li><Wind size={16} aria-hidden="true" /> <span>Gusts to <b>{wind(summary.gust.windGust, units)} {windUnitLabel(units)}</b> · {when(summary.gust)}</span></li>}
      </ul>

      <div className="tl__bar">
        <Tabs label="Measure shown on the curve" options={METRICS} value={metric} onChange={setMetric} />
        <div className="tl__nav">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Earlier hours"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Later hours"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="tl__scroll" ref={scroller} tabIndex={0} role="region" aria-label="Hourly forecast, scrolls sideways">
        <div className="tl__inner" style={{ width }}>
          <div className="tl__days" aria-hidden="true">
            {groups.map((g) => (
              <span key={g.key} style={{ width: g.count * COL }}>
                <b>{relativeDay(g.time, overview.current.time, tz)}</b> {weekdayShort(g.time, tz) !== relativeDay(g.time, overview.current.time, tz) ? dayMonth(g.time, tz) : ""}
              </span>
            ))}
          </div>

          <div className="tl__cols" style={{ gridTemplateColumns: `repeat(${list.length}, ${COL}px)` }}>
            {list.map((h, i) => (
              <div key={h.time} className={`tl__col${h.isDay ? "" : " is-night"}${i === 0 ? " is-now" : ""}`}>
                <span className="tl__time">{i === 0 ? "Now" : hourLabel(h.time, tz)}</span>
                {events.get(i) ? (
                  <span className="tl__event" title={`${events.get(i).kind === "sunrise" ? "Sunrise" : "Sunset"} ${clockLabel(events.get(i).t, tz)}`}>
                    {events.get(i).kind === "sunrise" ? <Sunrise size={14} aria-hidden="true" /> : <Sunset size={14} aria-hidden="true" />}
                    {clockLabel(events.get(i).t, tz).replace(" ", "").toLowerCase()}
                  </span>
                ) : (
                  <WeatherIcon condition={h.condition} isDay={h.isDay} size={28} />
                )}
              </div>
            ))}
          </div>

          {curve && (
            <svg className="tl__curve" width={width} height={CURVE_H} viewBox={`0 0 ${width} ${CURVE_H}`} role="img" aria-label={`${METRICS.find((m) => m.value === metric).label} over the next ${list.length} hours`}>
              <defs>
                <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={curve.area} fill="url(#tl-fill)" />
              <path d={curve.line} className="tl__line" />
              {curve.pts.map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r={i === 0 ? 5 : 3} className={i === 0 ? "tl__dot is-now" : "tl__dot"} />
                  {display(list[i]) !== null && (
                    <text x={x} y={Math.max(13, y - 11)} textAnchor="middle" className="tl__val">
                      {display(list[i])}
                      {i % 2 === 0 ? unitText.trim() : ""}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}

          <div className="tl__cols tl__cols--detail" style={{ gridTemplateColumns: `repeat(${list.length}, ${COL}px)` }}>
            {list.map((h, i) => {
              const p = Math.round(h.precipProbability ?? 0);

              return (
                <div key={h.time} className={`tl__col${h.isDay ? "" : " is-night"}`}>
                  <span className="tl__rain" title={`${p}% chance of rain`}>
                    <i style={{ height: `${Math.max(p, p ? 6 : 0)}%` }} />
                  </span>
                  <span className="tl__pct">{p >= 10 ? `${p}%` : ""}</span>
                  <span className="tl__mm">{h.precipitation >= 0.1 ? `${precip(h.precipitation, units)} ${precipUnitLabel(units)}` : ""}</span>
                  <span className="tl__wind" title={`Wind from the ${compass(h.windDirection)}`}>
                    <svg width="14" height="14" viewBox="-7 -7 14 14" style={{ transform: `rotate(${((h.windDirection ?? 0) + 180) % 360}deg)` }} aria-hidden="true"><path d="M0 -6 L4 5 L0 2.5 L-4 5Z" fill="currentColor" /></svg>
                    {wind(h.windSpeed, units)}
                  </span>
                  <span className="tl__hum">{Math.round(h.humidity ?? 0)}%</span>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      <div className="tl__legend" aria-hidden="true">
        <span><i className="rain" /> Rain chance</span>
        <span><i className="wind" /> Wind ({windUnitLabel(units)})</span>
        <span><i className="hum" /> Humidity</span>
        <span><i className="night" /> Night</span>
      </div>
    </div>
  );
}
