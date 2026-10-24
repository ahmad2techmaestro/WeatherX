import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ShieldCheck } from "lucide-react";

import { airRanking, readout, summarise, watchlist } from "../../lib/atlasModel";
import { legendFor, pinLabel } from "../../lib/mapLayers";
import { distance, distanceUnitLabel, precip, precipUnitLabel, temp, tempLabel, wind, windUnitLabel } from "../../lib/units";

const COLUMNS = [
  { key: "name", label: "City", get: (c) => c.name },
  { key: "cond", label: "Conditions", get: (c) => c.current.label },
  { key: "temp", label: "Temp", get: (c) => c.current.temperature, num: true },
  { key: "wind", label: "Wind", get: (c) => c.current.windSpeed, num: true },
  { key: "rain", label: "Rain", get: (c) => c.current.precipitation, num: true },
  { key: "vis", label: "Visibility", get: (c) => c.current.visibilityKm, num: true },
  { key: "aqi", label: "AQI", get: (c) => c.aqi, num: true },
];

const PREVIEW = 6;
const aqiTone = (v) => (v == null ? "" : v <= 100 ? "great" : v <= 200 ? "fair" : "poor");

/** Intelligence below the map: national snapshot, watchlist, air quality ranking and a live city board. */
export default function AtlasInsights({ cities, layer, units, onFocus }) {
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState({ key: "temp", dir: "desc" });
  const fmt = useMemo(
    () => ({
      temp: (v) => tempLabel(v, units),
      tempDelta: (v) => `${Math.round(units.temperature === "fahrenheit" ? v * 1.8 : v)}°`,
      wind: (v) => `${wind(v, units)} ${windUnitLabel(units)}`,
      rain: (v) => `${precip(v, units)} ${precipUnitLabel(units)}`,
    }),
    [units]
  );

  const snap = useMemo(() => summarise(cities, layer), [cities, layer]);
  const lines = useMemo(() => readout(cities, fmt), [cities, fmt]);
  const flags = useMemo(() => watchlist(cities, fmt), [cities, fmt]);
  const air = useMemo(() => airRanking(cities), [cities]);
  const legend = legendFor(layer, units);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;

    return [...cities].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);

      if (x == null || y == null) return x == null ? 1 : -1;

      return (col.num ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [cities, sort]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "cond" ? "asc" : "desc" }));

  if (!cities.length) {
    return (
      <section className="pnl" aria-live="polite">
        <h2 className="pnl__title">Atlas insights</h2>
        <p className="muted">Loading live readings for {`India's`} major cities…</p>
      </section>
    );
  }

  const worst = air[0]?.aqi || 1;

  return (
    <div className="stack">
      <section className="pnl" aria-labelledby="at-snap">
        <div className="pnl__head">
          <h2 id="at-snap" className="pnl__title">National snapshot · {layer.label}</h2>
          <span className="pnl__aside">{snap?.count ?? 0} cities · {legend.unit}</span>
        </div>

        {snap && (
          <ul className="kpis" role="list">
            <li className="kpi"><span className="kpi__label">Average</span><strong>{pinLabel(layer, { [layer.field]: snap.avg }, units)}</strong><small>across major cities</small></li>
            <li className="kpi"><span className="kpi__label">Highest</span><strong>{pinLabel(layer, snap.high.current, units)}</strong><small><button type="button" className="link-btn" onClick={() => onFocus(snap.high)}>{snap.high.name}</button></small></li>
            <li className="kpi"><span className="kpi__label">Lowest</span><strong>{pinLabel(layer, snap.low.current, units)}</strong><small><button type="button" className="link-btn" onClick={() => onFocus(snap.low)}>{snap.low.name}</button></small></li>
          </ul>
        )}

        <ul className="readout" role="list">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <div className="split">
        <section className="pnl" aria-labelledby="at-watch">
          <h2 id="at-watch" className="pnl__title">Watchlist</h2>
          {flags.length ? (
            <ul className="watch" role="list">
              {flags.map((f) => (
                <li key={f.id} data-tone={f.tone}>
                  <strong>{f.title}</strong>
                  <span className="watch__cities">
                    {f.cities.map((c) => (
                      <button key={c.name} type="button" onClick={() => onFocus(c)}>
                        {c.name} <b>{c.text}</b>
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="watch-clear">
              <ShieldCheck size={18} aria-hidden="true" /> No city is under severe heat, cold, strong wind, heavy rain, low visibility or very poor air right now.
            </p>
          )}
        </section>

        <section className="pnl" aria-labelledby="at-air">
          <h2 id="at-air" className="pnl__title">Air quality ranking</h2>
          {air.length ? (
            <ol className="airrank" role="list">
              {air.slice(0, 7).map((c) => (
                <li key={c.name} data-tone={aqiTone(c.aqi)}>
                  <button type="button" onClick={() => onFocus(c)}>{c.name}</button>
                  <span className="airrank__bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (c.aqi / worst) * 100)}%` }} /></span>
                  <b>{c.aqi}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Air quality readings aren't available right now.</p>
          )}
          <p className="pnl__note">Highest first, on the Indian NAQI scale. Values come from an atmospheric model, not ground stations.</p>
        </section>
      </div>

      <section className="pnl" aria-labelledby="at-board">
        <button type="button" className="board-toggle" aria-expanded={expanded} aria-controls="at-board-body" onClick={() => setExpanded((v) => !v)}>
          <h2 id="at-board" className="pnl__title">Live city board</h2>
          <span className="pnl__aside">{expanded ? "Sort by any column" : `Top ${PREVIEW} of ${cities.length} cities`}</span>
          <ChevronDown size={18} aria-hidden="true" className="board-toggle__chev" />
        </button>
        <div className="mx-wrap" id="at-board-body">
          <table className="board">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={c.num ? "is-num" : ""}>
                    <button type="button" onClick={() => toggle(c.key)}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(expanded ? sorted : sorted.slice(0, PREVIEW)).map((c) => (
                <tr key={c.name}>
                  <th scope="row"><button type="button" onClick={() => onFocus(c)}>{c.name}</button></th>
                  <td>{c.current.label}</td>
                  <td className="is-num">{temp(c.current.temperature, units)}°</td>
                  <td className="is-num">{wind(c.current.windSpeed, units)}<small> {windUnitLabel(units)}</small></td>
                  <td className="is-num">{precip(c.current.precipitation, units)}<small> {precipUnitLabel(units)}</small></td>
                  <td className="is-num">{c.current.visibilityKm == null ? "—" : <>{distance(c.current.visibilityKm, units)}<small> {distanceUnitLabel(units)}</small></>}</td>
                  <td className="is-num">{c.aqi == null ? "—" : <span className="tag" data-tone={aqiTone(c.aqi)}>{c.aqi}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cities.length > PREVIEW && (
          <button type="button" className="link-btn board-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show all ${cities.length} cities`}
          </button>
        )}
      </section>
    </div>
  );
}
