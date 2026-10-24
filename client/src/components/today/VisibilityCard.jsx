import { clockLabel, hourLabel } from "../../lib/format";
import { distance, distanceUnitLabel } from "../../lib/units";

const MAX_KM = 20;

function Gauge({ km, tone }) {
  const r = 62;
  const c = Math.PI * r;
  const frac = Math.min(1, Math.max(0, km / MAX_KM));

  return (
    <svg className="vgauge" viewBox="0 0 150 86" role="img" aria-label={`Visibility ${km} kilometres`} data-tone={tone}>
      <path d="M13 77 A62 62 0 0 1 137 77" className="vgauge__track" />
      <path d="M13 77 A62 62 0 0 1 137 77" className="vgauge__fill" strokeDasharray={`${c * frac} ${c}`} />
    </svg>
  );
}

export default function VisibilityCard({ data, units }) {
  const v = data.intelligence?.today?.visibility;
  const tz = data.location.timezone;

  if (!v) return null;

  const inFog = (t) => v.windows.some((w) => t >= w.start && t < w.end);

  return (
    <section id="tc-vis" className="pnl tc" aria-labelledby="tc-vis-t">
      <h2 id="tc-vis-t" className="pnl__title">Visibility</h2>

      <div className="vis">
        <div className="vis__gauge">
          <Gauge km={v.current.km} tone={v.current.tone} />
          <div className="vis__read" data-tone={v.current.tone}>
            <strong>{distance(v.current.km, units)}</strong>
            <small>{distanceUnitLabel(units)}</small>
          </div>
        </div>
        <div className="vis__text">
          <span className="pill-tone" data-tone={v.current.tone}>{v.current.label}</span>
          <p className="tc__headline">{v.headline}</p>
          <p className="tc__sub">{v.advice}</p>
        </div>
      </div>

      <div>
        <ol className="vstrip" role="list" aria-label="Visibility over the next 24 hours">
          {v.series.map((s, i) => (
            <li key={s.time} data-fog={inFog(s.time) ? "1" : "0"} title={`${hourLabel(s.time, tz)} · ${s.km === null ? "no data" : `${distance(s.km, units)} ${distanceUnitLabel(units)}`}`}>
              <i style={{ height: `${s.km === null ? 0 : Math.max(6, Math.min(100, (s.km / MAX_KM) * 100))}%` }} />
              <span>{i % 6 === 0 ? (i === 0 ? "Now" : hourLabel(s.time, tz).replace(" ", "")) : ""}</span>
            </li>
          ))}
        </ol>
      </div>

      {v.windows.length > 0 ? (
        <ul className="tc__facts" role="list">
          {v.windows.slice(0, 2).map((w) => (
            <li key={w.start}>
              <span>{w.cause === "fog" ? "Fog" : w.cause === "haze" ? "Haze" : "Mist"} window</span>
              <strong>{clockLabel(w.start, tz)} – {clockLabel(w.end, tz)}{w.minKm !== null ? ` · down to ${distance(w.minKm, units)} ${distanceUnitLabel(units)}` : ""}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="tc__facts" role="list">
          <li><span>Lowest in 24 h</span><strong>{v.lowest ? `${distance(v.lowest.km, units)} ${distanceUnitLabel(units)} · ${hourLabel(v.lowest.time, tz)}` : "—"}</strong></li>
        </ul>
      )}
    </section>
  );
}
