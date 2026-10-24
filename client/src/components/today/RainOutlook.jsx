import { hourLabel } from "../../lib/format";
import { precip, precipUnitLabel } from "../../lib/units";

export default function RainOutlook({ data, units }) {
  const r = data.intelligence?.today?.rain;
  const tz = data.location.timezone;

  if (!r) return null;

  return (
    <section id="tc-rain" className="pnl tc" aria-labelledby="tc-rain-t">
      <h2 id="tc-rain-t" className="pnl__title">Rain, next 12 hours</h2>
      <p className="tc__headline">{r.headline}</p>

      <ol className="rbars" role="list" aria-label="Chance of rain for each of the next 12 hours">
        {r.bars.map((b, i) => (
          <li key={b.time} title={`${hourLabel(b.time, tz)} · ${b.prob}% chance${b.mm ? ` · ${precip(b.mm, units)} ${precipUnitLabel(units)}` : ""}`}>
            <span className="rbars__pct">{b.prob >= 20 ? `${b.prob}%` : ""}</span>
            <span className="rbars__col"><i style={{ height: `${Math.max(b.prob, b.prob ? 5 : 0)}%` }} data-wet={b.mm >= 0.2 ? "1" : "0"} /></span>
            <span className="rbars__time">{i % 2 === 0 ? (i === 0 ? "Now" : hourLabel(b.time, tz).replace(" ", "")) : ""}</span>
          </li>
        ))}
      </ol>

      <ul className="tc__facts" role="list">
        <li><span>Expected</span><strong>{precip(r.totalMm, units)} {precipUnitLabel(units)}</strong></li>
        {r.peak && <li><span>Heaviest hour</span><strong>{hourLabel(r.peak.time, tz)} · {precip(r.peak.mm, units)} {precipUnitLabel(units)}</strong></li>}
      </ul>
    </section>
  );
}
