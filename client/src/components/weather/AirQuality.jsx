import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { hourLabel } from "../../lib/format";
import { AQI_BANDS, aqiColor, POLLUTANTS } from "../../lib/weather";

function AqiGauge({ value, band }) {
  // Semicircle gauge 0–500. Segments are drawn in band order; the needle sits at `value`.
  const R = 78;
  const cx = 100;
  const cy = 96;
  const point = (v, r = R) => {
    const a = Math.PI * (1 - Math.min(500, v) / 500);

    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };

  return (
    <svg className="aqigauge" viewBox="0 0 200 118" role="img" aria-label={`Indian AQI ${value}, ${band.label}`}>
      {AQI_BANDS.map((b) => {
        const [x1, y1] = point(b.from === 0 ? 0 : b.from - 1);
        const [x2, y2] = point(b.to);

        return <path key={b.key} d={`M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`} stroke={b.color} strokeWidth="13" fill="none" strokeLinecap="butt" opacity={b.key === band.key ? 1 : 0.38} />;
      })}
      {(() => {
        const [nx, ny] = point(value, R - 18);

        return (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="6" fill="var(--ink)" />
          </>
        );
      })()}
    </svg>
  );
}

function Spark({ data, timezone }) {
  const rows = data.slice(0, 48).map((h) => ({ t: h.time, v: h.naqi ?? h.usAqi }));

  return (
    <div className="aqispark" role="img" aria-label="Air quality over the next 48 hours">
      <ResponsiveContainer width="100%" height={86}>
        <AreaChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="aqi-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".45" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" tickFormatter={(t) => hourLabel(t, timezone)} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} interval={11} />
          <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }} labelFormatter={(t) => hourLabel(t, timezone)} formatter={(v) => [v, "AQI"]} />
          <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#aqi-fill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AirQuality({ overview }) {
  const air = overview.airQuality;

  if (!air || !air.naqi) {
    return (
      <section className="card" aria-labelledby="aq-title">
        <h2 id="aq-title" className="card__title">
          Air quality
        </h2>
        <p className="muted">Air quality isn't available for this location right now. Weather data is unaffected.</p>
      </section>
    );
  }

  const { naqi } = air;
  const band = AQI_BANDS.find((b) => b.key === naqi.key);
  const dominant = POLLUTANTS.find((p) => p.key === naqi.dominant);

  return (
    <section className="card aq" aria-labelledby="aq-title">
      <div className="card__headline">
        <h2 id="aq-title" className="card__title">
          Air quality
        </h2>
        <span className="chip" style={{ background: `${aqiColor(naqi.key)}26`, color: "var(--ink)", borderColor: `${aqiColor(naqi.key)}88` }}>
          Indicative · CPCB scale
        </span>
      </div>

      <div className="aq__top">
        <div className="aq__gauge">
          <AqiGauge value={naqi.value} band={band} />
          <div className="aq__value">
            <strong>{naqi.value}</strong>
            <span style={{ color: aqiColor(naqi.key) }}>● </span>
            <span>{naqi.label}</span>
          </div>
        </div>
        <div className="aq__text">
          <p>{naqi.advice}</p>
          {dominant && (
            <p className="muted">
              Main pollutant: <strong>{dominant.label}</strong> ({dominant.name})
            </p>
          )}
          {air.usAqi !== null && (
            <p className="muted">
              US AQI {air.usAqi} · {air.usLabel}
            </p>
          )}
        </div>
      </div>

      <ul className="pollutants" role="list">
        {POLLUTANTS.map((p) => {
          const value = air.pollutants[p.key];

          if (value === null || value === undefined) return null;

          const pct = Math.min(100, (value / p.limit) * 100);

          return (
            <li key={p.key}>
              <span title={p.name}>
                <strong>{p.label}</strong>
              </span>
              <span className="bar bar--thin" aria-hidden="true">
                <i style={{ width: `${pct}%`, background: pct > 100 ? "var(--bad)" : pct > 66 ? "var(--warn)" : "var(--good)" }} />
              </span>
              <span className="pollutants__v">
                {value} <small>{p.unit}</small>
              </span>
            </li>
          );
        })}
      </ul>

      {air.hourly.length > 4 && <Spark data={air.hourly} timezone={overview.location.timezone} />}
      <p className="muted small">{air.note}</p>
    </section>
  );
}
