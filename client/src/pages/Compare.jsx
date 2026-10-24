import { useEffect, useMemo, useState } from "react";
import { Award, Plus, RefreshCw, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import PageHero from "../components/ui/PageHero";
import Tabs from "../components/ui/Tabs";
import SearchBox from "../components/layout/SearchBox";
import WeatherIcon from "../components/weather/WeatherIcon";
import { EmptyState } from "../components/ui/States";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { errorMessage, fetchMulti, isCanceled } from "../lib/api";
import { clockLabel, weekdayShort } from "../lib/format";
import { placeKey, POPULAR_PLACES, slimPlace } from "../lib/place";
import { currentScore, dayFigures, forecastDayScore, scoreTone, verdictFor } from "../lib/scoring";
import { readJson, writeJson } from "../lib/storage";
import { precip, precipUnitLabel, temp, tempLabel, wind, windUnitLabel } from "../lib/units";

const KEY = "wx.compare";
const MAX = 4;
const COLORS = ["var(--cmp-1)", "var(--cmp-2)", "var(--cmp-3)", "var(--cmp-4)"];
const SERIES = [
  { value: "temp", label: "Temperature" },
  { value: "rain", label: "Rain" },
  { value: "wind", label: "Wind" },
];

const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;

export default function Compare() {
  const { place, favourites } = usePlaces();
  const { units } = useSettings();
  const [list, setList] = useState(() => {
    const saved = readJson(KEY, []).filter((p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)));

    return saved.length ? saved.slice(0, MAX) : [slimPlace(place)];
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [series, setSeries] = useState("temp");
  const [attempt, setAttempt] = useState(0);
  const sig = list.map(placeKey).join("|");

  useEffect(() => writeJson(KEY, list), [list]);

  useEffect(() => {
    document.title = "City benchmark — WeatherX";
  }, []);

  useEffect(() => {
    if (!list.length) {
      setRows([]);

      return undefined;
    }

    const controller = new AbortController();

    setLoading(true);
    setError("");
    fetchMulti(list, { signal: controller.signal })
      .then((data) => setRows(data))
      .catch((e) => !isCanceled(e) && setError(errorMessage(e, "The comparison couldn't be loaded.")))
      .finally(() => !controller.signal.aborted && setLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, attempt]);

  const add = (p) => setList((l) => (l.length >= MAX || l.some((x) => placeKey(x) === placeKey(p)) ? l : [...l, slimPlace(p)]));
  const remove = (p) => setList((l) => l.filter((x) => placeKey(x) !== placeKey(p)));
  const retry = () => setAttempt((n) => n + 1);

  const cols = useMemo(
    () =>
      list.map((p, i) => {
        const r = rows[i];

        if (!r?.ok) return { place: p, color: COLORS[i], row: null, message: r?.message || "" };

        return { place: p, color: COLORS[i], row: r, message: "", score: currentScore(r), figures: dayFigures(r) };
      }),
    [list, rows]
  );
  const ready = cols.filter((c) => c.row);

  const ranked = [...ready].sort((a, b) => b.score - a.score);
  const winner = ready.length > 1 ? ranked[0] : null;

  const leaders = useMemo(() => {
    if (ready.length < 2) return [];

    const best = (fn, dir) => ready.reduce((b, c) => (dir === "min" ? fn(c) < fn(b) : fn(c) > fn(b)) ? c : b, ready[0]);

    return [
      { key: "warm", label: "Warmest", col: best((c) => c.row.current.temperature, "max"), value: (c) => tempLabel(c.row.current.temperature, units) },
      { key: "cool", label: "Coolest", col: best((c) => c.row.current.temperature, "min"), value: (c) => tempLabel(c.row.current.temperature, units) },
      { key: "air", label: "Cleanest air", col: best((c) => c.figures.aqi ?? Infinity, "min"), value: (c) => (c.figures.aqi == null ? "—" : `AQI ${c.figures.aqi}`), skip: ready.every((c) => c.figures.aqi == null) },
      { key: "dry", label: "Driest next 24 h", col: best((c) => c.figures.rainMm, "min"), value: (c) => `${precip(c.figures.rainMm, units)} ${precipUnitLabel(units)}` },
      { key: "calm", label: "Calmest wind", col: best((c) => c.row.current.windSpeed, "min"), value: (c) => `${wind(c.row.current.windSpeed, units)} ${windUnitLabel(units)}` },
    ].filter((l) => !l.skip);
  }, [ready, units]);

  const reasons = useMemo(() => {
    if (!winner) return [];

    const out = [];
    const others = ready.filter((c) => c !== winner);

    if (others.every((c) => winner.figures.rainMm < c.figures.rainMm)) out.push(winner.figures.rainMm < 0.1 ? "no rain expected in the next 24 hours" : "the least rain in the next 24 hours");
    if (others.every((c) => (winner.figures.aqi ?? Infinity) < (c.figures.aqi ?? Infinity)) && winner.figures.aqi != null) out.push("the cleanest air");
    if (others.every((c) => Math.abs(winner.row.current.feelsLike - 24) < Math.abs(c.row.current.feelsLike - 24))) out.push("the most comfortable temperature");
    if (others.every((c) => winner.row.current.windSpeed < c.row.current.windSpeed)) out.push("the calmest wind");

    return out.slice(0, 3);
  }, [winner, ready]);

  const rowsDef = useMemo(() => {
    const tz = (c) => c.row.location.timezone;
    const num = (fn) => (c) => fn(c);

    return [
      { label: "Conditions", cell: (c) => <span className="mx__cond"><WeatherIcon condition={c.row.current.condition} isDay={c.row.current.isDay} size={22} /> {c.row.current.label}</span> },
      { label: "Temperature", value: num((c) => c.row.current.temperature), cell: (c) => tempLabel(c.row.current.temperature, units) },
      { label: "Feels like", value: num((c) => c.row.current.feelsLike), cell: (c) => tempLabel(c.row.current.feelsLike, units) },
      { label: "Today's range", cell: (c) => `${tempLabel(c.row.daily[0].temperatureMin, units)} – ${tempLabel(c.row.daily[0].temperatureMax, units)}` },
      { label: "Humidity", value: num((c) => c.row.current.humidity), best: "min", cell: (c) => `${c.row.current.humidity}%` },
      { label: "Wind", value: num((c) => c.row.current.windSpeed), best: "min", cell: (c) => `${wind(c.row.current.windSpeed, units)} ${windUnitLabel(units)}` },
      { label: "Rain, next 24 h", value: num((c) => c.figures.rainMm), best: "min", cell: (c) => `${precip(c.figures.rainMm, units)} ${precipUnitLabel(units)}` },
      { label: "Chance of rain", value: num((c) => c.figures.rainChance), best: "min", cell: (c) => `${Math.round(c.figures.rainChance)}%` },
      { label: "UV index", value: num((c) => c.row.current.uvIndex ?? 0), best: "min", cell: (c) => (c.row.current.uvIndex == null ? "—" : Math.round(c.row.current.uvIndex)) },
      { label: "Air quality (NAQI)", value: num((c) => c.figures.aqi ?? Infinity), best: "min", cell: (c) => (c.figures.aqi == null ? "—" : `${c.figures.aqi} · ${c.row.airQuality.naqi.label}`) },
      { label: "Visibility", value: num((c) => c.row.current.visibilityKm ?? -1), best: "max", cell: (c) => (c.row.current.visibilityKm == null ? "—" : `${Number(c.row.current.visibilityKm).toFixed(1)} km`) },
      { label: "Sunrise / sunset", cell: (c) => `${clockLabel(c.row.astronomy.sunrise, tz(c))} · ${clockLabel(c.row.astronomy.sunset, tz(c))}` },
    ];
  }, [units]);

  const chartData = useMemo(() => {
    if (!ready.length) return [];

    return ready[0].row.daily.slice(0, 7).map((d, i) => {
      const point = { label: weekdayShort(d.time, ready[0].row.location.timezone) };

      ready.forEach((c) => {
        const day = c.row.daily[i];

        point[`k${list.indexOf(c.place)}`] = !day ? null : series === "temp" ? Number(temp(day.temperatureMax, units)) : series === "rain" ? Number(precip(day.precipitationSum || 0, units)) : Number(wind(day.windSpeedMax, units));
      });

      return point;
    });
  }, [ready, series, units]);

  const unitText = series === "temp" ? `°${units.temperature === "fahrenheit" ? "F" : "C"}` : series === "rain" ? precipUnitLabel(units) : windUnitLabel(units);
  const chartTip = { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 13 };
  const axis = { fontSize: 12, fill: "var(--ink-3)" };
  const suggestions = [...favourites, ...POPULAR_PLACES].filter((p, i, a) => !list.some((x) => placeKey(x) === placeKey(p)) && a.findIndex((x) => placeKey(x) === placeKey(p)) === i).slice(0, 8);

  return (
    <div className="page pg">
      <PageHero eyebrow="City benchmark" title="Compare places side by side" subtitle={`Rank up to ${MAX} places on today's conditions, air quality and the week ahead.`}>
        {list.length < MAX && (
          <div className="phero__search">
            <SearchBox variant="page" onSelect={add} placeholder="Add a place to compare" />
          </div>
        )}
      </PageHero>

      <section className="pnl" aria-label="Places being compared">
        <ul className="cmp-chips" role="list">
          {cols.map((c) => (
            <li key={placeKey(c.place)} className="cmp-chip" style={{ "--chip": c.color }}>
              <i aria-hidden="true" />
              <span>
                <strong>{c.place.name}</strong>
                <small>{c.place.state || c.place.subtitle}</small>
              </span>
              <button type="button" onClick={() => remove(c.place)} aria-label={`Remove ${c.place.name}`}>
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {list.length < MAX && suggestions.length > 0 && (
          <div className="cmp-suggest">
            <span>Quick add</span>
            {suggestions.map((p) => (
              <button key={placeKey(p)} type="button" className="chip" onClick={() => add(p)}>
                <Plus size={13} aria-hidden="true" /> {p.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="pnl pnl--error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--small" onClick={retry}>
            <RefreshCw size={15} aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {!list.length && <EmptyState icon={<Plus size={28} aria-hidden="true" />} title="Start a comparison" message="Search above or use Quick add to choose your first place." />}

      {loading && !rows.length && list.length > 0 && (
        <div className="cmp-cards" aria-busy="true">
          {list.map((p) => (
            <div key={placeKey(p)} className="cmp-card cmp-card--skeleton" />
          ))}
        </div>
      )}

      {cols.length > 0 && rows.length > 0 && (
        <div className="cmp-cards">
          {cols.map((c) => (
            <article key={placeKey(c.place)} className={`cmp-card ${winner === c ? "is-winner" : ""}`} style={{ "--chip": c.color }}>
              <header>
                <div>
                  <h2>{c.place.name}</h2>
                  <p>{c.place.state || c.place.subtitle}</p>
                </div>
                {winner === c && (
                  <span className="cmp-badge">
                    <Award size={14} aria-hidden="true" /> Best today
                  </span>
                )}
              </header>

              {c.row ? (
                <>
                  <div className="cmp-card__now">
                    <WeatherIcon condition={c.row.current.condition} isDay={c.row.current.isDay} size={46} />
                    <div>
                      <strong>{tempLabel(c.row.current.temperature, units)}</strong>
                      <span>{c.row.current.label}</span>
                    </div>
                  </div>
                  <div className="cmp-score" data-tone={scoreTone(c.score)}>
                    <div className="cmp-score__bar" role="img" aria-label={`Outdoor score ${c.score} out of 100`}>
                      <i style={{ width: `${c.score}%` }} />
                    </div>
                    <p>
                      <b>{c.score}</b>/100 · {verdictFor(c.score)} for outdoors
                    </p>
                  </div>
                </>
              ) : (
                <div className="cmp-card__fail">
                  <p>{c.message || "Live conditions for this place aren't available right now."}</p>
                  <button type="button" className="btn btn--small" onClick={retry}>
                    <RefreshCw size={15} aria-hidden="true" /> Retry
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {ready.length > 0 && (
        <>
          <section className="pnl verdict" aria-labelledby="verdict-t">
            <h2 id="verdict-t" className="pnl__title">Verdict</h2>
            {winner ? (
              <>
                <p className="verdict__line">
                  <strong>{winner.place.name}</strong> is the best choice today{reasons.length ? `, with ${reasons.join(", ").replace(/, ([^,]*)$/, " and $1")}` : ""}.
                </p>
                <ol className="rank" role="list">
                  {ranked.map((c, i) => (
                    <li key={placeKey(c.place)} style={{ "--chip": c.color }}>
                      <span className="rank__n">{i + 1}</span>
                      <span className="rank__name">{c.place.name}</span>
                      <span className="rank__bar" aria-hidden="true">
                        <i style={{ width: `${c.score}%` }} />
                      </span>
                      <b>{c.score}</b>
                    </li>
                  ))}
                </ol>
                <ul className="leaders" role="list">
                  {leaders.map((l) => (
                    <li key={l.key}>
                      <span>{l.label}</span>
                      <strong>{l.col.place.name}</strong>
                      <small>{l.value(l.col)}</small>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Add one more place to see which is the best choice today.</p>
            )}
            <p className="pnl__note">Outdoor score blends feels-like temperature, rain, wind, air quality and UV. It is guidance from forecast data, not a measurement.</p>
          </section>

          <section className="pnl" aria-labelledby="mx-t">
            <h2 id="mx-t" className="pnl__title">Conditions matrix</h2>
            <div className="mx-wrap">
              <table className="mx">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Measure</span></th>
                    {ready.map((c) => (
                      <th key={placeKey(c.place)} scope="col" style={{ "--chip": c.color }}>
                        <i aria-hidden="true" /> {c.place.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsDef.map((def) => {
                    const values = def.value ? ready.map(def.value) : [];
                    const target = def.best && ready.length > 1 ? (def.best === "min" ? Math.min(...values) : Math.max(...values)) : null;
                    const tie = target !== null && values.every((v) => v === target);

                    return (
                      <tr key={def.label}>
                        <th scope="row">{def.label}</th>
                        {ready.map((c, i) => (
                          <td key={placeKey(c.place)} className={target !== null && !tie && values[i] === target ? "is-best" : ""}>
                            {def.cell(c)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pnl" aria-labelledby="wk-t">
            <h2 id="wk-t" className="pnl__title">Outdoor score, next 7 days</h2>
            <div className="mx-wrap">
              <table className="heat">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Place</span></th>
                    {ready[0].row.daily.slice(0, 7).map((d) => (
                      <th key={d.date} scope="col">{weekdayShort(d.time, ready[0].row.location.timezone)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ready.map((c) => {
                    const scores = c.row.daily.slice(0, 7).map(forecastDayScore);
                    const top = Math.max(...scores);
                    const flat = top === Math.min(...scores);

                    return (
                      <tr key={placeKey(c.place)}>
                        <th scope="row" style={{ "--chip": c.color }}><i aria-hidden="true" /> {c.place.name}</th>
                        {scores.map((s, i) => (
                          <td key={i} data-tone={scoreTone(s)} className={!flat && s === top ? "is-top" : ""} title={`${verdictFor(s)} · ${s}/100`}>
                            {s}
                          </td>
                        ))}
                        <td className="heat__avg"><small>avg</small> {Math.round(mean(scores))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pnl" aria-labelledby="ch-t">
            <div className="pnl__head">
              <h2 id="ch-t" className="pnl__title">Seven-day trend ({unitText})</h2>
              <Tabs label="Chart measure" options={SERIES} value={series} onChange={setSeries} />
            </div>
            <div role="img" aria-label={`${SERIES.find((s) => s.value === series).label} for the next seven days, by place`}>
              <ResponsiveContainer width="100%" height={300}>
                {series === "rain" ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTip} cursor={{ fill: "var(--surface-2)" }} />
                    <Legend />
                    {ready.map((c, i) => (
                      <Bar key={placeKey(c.place)} dataKey={`k${list.indexOf(c.place)}`} name={c.place.name} fill={COLORS[list.indexOf(c.place) % 4]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} domain={series === "temp" ? ["dataMin - 2", "dataMax + 2"] : [0, "auto"]} />
                    <Tooltip contentStyle={chartTip} />
                    <Legend />
                    {ready.map((c) => (
                      <Line key={placeKey(c.place)} type="monotone" dataKey={`k${list.indexOf(c.place)}`} name={c.place.name} stroke={COLORS[list.indexOf(c.place) % 4]} strokeWidth={2.5} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
