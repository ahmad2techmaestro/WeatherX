import { clockLabel, hourLabel } from "../../lib/format";

const band = (uv) => (uv < 3 ? "low" : uv < 6 ? "mod" : uv < 8 ? "high" : uv < 11 ? "vhigh" : "ext");

export default function UvCard({ data }) {
  const u = data.intelligence?.today?.uv;
  const tz = data.location.timezone;

  if (!u) return null;

  const top = Math.max(11, u.peak.uv);

  return (
    <section id="tc-uv" className="pnl tc" aria-labelledby="tc-uv-t">
      <h2 id="tc-uv-t" className="pnl__title">Sun and UV</h2>
      <p className="tc__headline">{u.headline}</p>

      <ol className="uvstrip" role="list" aria-label="UV index for the next 24 hours">
        {u.series.map((s, i) => (
          <li key={s.time} data-band={band(s.uv)} className={u.window && s.time >= u.window.start && s.time < u.window.end ? "is-protect" : ""} title={`${hourLabel(s.time, tz)} · UV ${s.uv}`}>
            <i style={{ height: `${Math.max(4, (s.uv / top) * 100)}%` }} />
            <span>{i % 6 === 0 ? (i === 0 ? "Now" : hourLabel(s.time, tz).replace(" ", "")) : ""}</span>
          </li>
        ))}
      </ol>

      <ul className="tc__facts" role="list">
        <li><span>Peak</span><strong>UV {Math.round(u.peak.uv)} · {u.level} at {clockLabel(u.peak.time, tz)}</strong></li>
        {u.window && <li><span>Protection advised</span><strong>{clockLabel(u.window.start, tz)} – {clockLabel(u.window.end, tz)}</strong></li>}
      </ul>
    </section>
  );
}
