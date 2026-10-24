import { useEffect, useMemo } from "react";
import { CloudRain, Shirt, Sunrise, Sunset, Waves } from "lucide-react";

import PageHero from "../components/ui/PageHero";
import LocationBadge from "../components/ui/LocationBadge";
import Lifestyle from "../components/weather/Lifestyle";
import WeatherGate from "../components/weather/WeatherGate";
import { Activities, BestDays, BodyConditions, RainTotals } from "../components/weather/Intelligence";
import useOverview from "../hooks/useOverview";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { clockLabel, dayMonth, hourLabel } from "../lib/format";
import { outdoorScore, scoreTone, verdictFor } from "../lib/scoring";
import { tempLabel } from "../lib/units";

/** Suitability for each of the next 24 hours, and the best three-hour window. */
function useDayShape(data) {
  return useMemo(() => {
    if (!data) return null;

    const aq = new Map((data.airQuality?.hourly || []).map((h) => [h.time, h.naqi ?? null]));
    const hours = data.hourly.slice(0, 24).map((h) => ({
      time: h.time,
      isDay: h.isDay,
      temp: h.temperature,
      score: outdoorScore({ temp: h.temperature, feels: h.feelsLike, windKmh: h.windSpeed, rainMm: h.precipitation, aqi: aq.get(h.time) ?? data.airQuality?.naqi?.value ?? null, uv: h.uvIndex, humidity: h.humidity }),
    }));

    let best = null;

    for (let i = 0; i + 2 < hours.length; i += 1) {
      const win = hours.slice(i, i + 3);

      if (!win.every((h) => h.isDay)) continue;

      const avg = win.reduce((s, h) => s + h.score, 0) / 3;

      if (!best || avg > best.avg) best = { start: win[0].time, end: win[2].time + 3600, avg: Math.round(avg), from: i };
    }

    return { hours, best, now: hours[0]?.score ?? null };
  }, [data]);
}

function DayShape({ shape, tz }) {
  return (
    <div>
      <ol className="shape" role="list" aria-label="Outdoor suitability for each of the next 24 hours">
        {shape.hours.map((h, i) => {
          const inBest = shape.best && i >= shape.best.from && i < shape.best.from + 3;

          return (
            <li key={h.time} data-tone={scoreTone(h.score)} className={inBest ? "is-best" : ""} title={`${hourLabel(h.time, tz)} · ${h.score}/100 · ${verdictFor(h.score)}`}>
              <i style={{ height: `${Math.max(8, h.score)}%` }} />
              <span>{i % 3 === 0 ? hourLabel(h.time, tz).replace(" ", "") : ""}</span>
            </li>
          );
        })}
      </ol>
      <p className="pnl__note">
        {shape.best ? (
          <>
            Best daytime window: <strong>{clockLabel(shape.best.start, tz)} to {clockLabel(shape.best.end, tz)}</strong> (average {shape.best.avg}/100). The score combines feels-like temperature, rain, wind, air quality and UV; it is guidance, not a measurement.
          </>
        ) : (
          "No comfortable daytime window in the next 24 hours."
        )}
      </p>
    </div>
  );
}

export default function Planner() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const { data, error, loading, fetchedAt, refresh } = useOverview(place);
  const shape = useDayShape(data);

  useEffect(() => {
    document.title = `Insights · ${place.name} — WeatherX`;
  }, [place.name]);

  const ai = data?.intelligence;
  const tz = data?.location.timezone;
  const topActivity = ai?.activities.filter((a) => a.bestScore > 0 && !/spray|dry/i.test(a.label)).sort((a, b) => b.bestScore - a.bestScore)[0];

  return (
    <div className="page pg">
      <PageHero eyebrow="Weather insights" title={`Plan around ${place.name}`} subtitle="Comfort, air quality and the best hours for what you have in mind, worked out from the forecast." meta={[<LocationBadge key="loc" />]} />

      <WeatherGate data={data} error={error} loading={loading} fetchedAt={fetchedAt} onRetry={refresh}>
        {ai && shape && (
          <div className="stack">
            <ul className="kpis" role="list">
              <li className="kpi" data-tone={scoreTone(shape.now)}>
                <span className="kpi__label">Outdoor score now</span>
                <strong>{shape.now}<small>/100</small></strong>
                <small>{verdictFor(shape.now)}</small>
              </li>
              <li className="kpi">
                <span className="kpi__label">Comfort</span>
                <strong>{ai.comfort ? ai.comfort.value : "—"}<small>/100</small></strong>
                <small>{ai.comfort?.label}</small>
              </li>
              <li className="kpi" data-tone={data.airQuality?.naqi ? (data.airQuality.naqi.value <= 100 ? "great" : data.airQuality.naqi.value <= 200 ? "fair" : "poor") : undefined}>
                <span className="kpi__label">Air quality</span>
                <strong>{data.airQuality?.naqi ? data.airQuality.naqi.value : "—"}</strong>
                <small>{data.airQuality?.naqi?.label || "Not available"}</small>
              </li>
              <li className="kpi">
                <span className="kpi__label">Best activity today</span>
                <strong className="kpi__text">{topActivity ? topActivity.label : "Stay flexible"}</strong>
                <small>{topActivity?.bestTime ? `Around ${clockLabel(topActivity.bestTime, tz)}` : "No strong window"}</small>
              </li>
            </ul>

            <section className="pnl" aria-labelledby="life-t">
              <h2 id="life-t" className="pnl__title">Lifestyle</h2>
              <Lifestyle data={data} />
            </section>

            <section className="pnl" aria-labelledby="shape">
              <h2 id="shape" className="pnl__title">Best hours to be outside</h2>
              <p className="pnl__note pnl__note--top">Each bar is how pleasant that hour is outdoors, from 0 to 100, over the next 24 hours. Taller and greener is better.</p>
              <DayShape shape={shape} tz={tz} />
            </section>

            {(ai.changes.length > 0 || ai.rainySpell) && (
              <section className="pnl" aria-labelledby="chg">
                <h2 id="chg" className="pnl__title">What's changing</h2>
                <ul className="insights" role="list">
                  {ai.changes.map((c) => (
                    <li key={c.id} className={`insight insight--${c.tone}`}>
                      <div>
                        <strong>{c.title}</strong>
                        <p>{c.detail}{c.time ? ` · around ${clockLabel(c.time, tz)}` : ""}</p>
                      </div>
                    </li>
                  ))}
                  {ai.rainySpell && (
                    <li className="insight insight--info">
                      <div>
                        <strong><Waves size={15} aria-hidden="true" /> Extended rain ahead</strong>
                        <p>
                          {ai.rainySpell.days} wet days in a row ({dayMonth(data.daily.find((d) => d.date === ai.rainySpell.startDate)?.time, tz)} to {dayMonth(data.daily.find((d) => d.date === ai.rainySpell.endDate)?.time, tz)}), about {ai.rainySpell.totalMm} mm in total. Check local advisories for flooding risk.
                        </p>
                      </div>
                    </li>
                  )}
                </ul>
              </section>
            )}

            <div className="split">
              <section className="pnl" aria-labelledby="body">
                <h2 id="body" className="pnl__title">Heat stress and comfort</h2>
                <BodyConditions data={data} units={units} />
                <p className="pnl__note">Wet-bulb readings above 28° indicate severe heat stress, and above 31° are dangerous. Heat index follows the NOAA formula.</p>
              </section>

              <section className="pnl" aria-labelledby="rt">
                <h2 id="rt" className="pnl__title"><CloudRain size={18} aria-hidden="true" /> Rain totals</h2>
                <RainTotals data={data} />
              </section>
            </div>

            <section className="pnl" aria-labelledby="act">
              <h2 id="act" className="pnl__title">Best time for</h2>
              <Activities data={data} />
            </section>

            <section className="pnl" aria-labelledby="bd">
              <h2 id="bd" className="pnl__title">The week ahead</h2>
              <BestDays data={data} units={units} />
              <p className="pnl__note">Daytime outdoor suitability from 0 to 100. The highlighted day is the best of the week.</p>
            </section>

            <div className="split">
              {ai.goldenHours && (
                <section className="pnl" aria-labelledby="gh">
                  <h2 id="gh" className="pnl__title">Golden hour</h2>
                  <p className="gh"><Sunrise size={17} aria-hidden="true" /> <span>Morning</span> <strong>{clockLabel(ai.goldenHours.morning.start, tz)} to {clockLabel(ai.goldenHours.morning.end, tz)}</strong></p>
                  <p className="gh"><Sunset size={17} aria-hidden="true" /> <span>Evening</span> <strong>{clockLabel(ai.goldenHours.evening.start, tz)} to {clockLabel(ai.goldenHours.evening.end, tz)}</strong></p>
                </section>
              )}

              <section className="pnl" aria-labelledby="gear">
                <h2 id="gear" className="pnl__title"><Shirt size={18} aria-hidden="true" /> Carry today</h2>
                {ai.gear.length ? <ul className="gear" role="list">{ai.gear.map((g) => <li key={g}>{g}</li>)}</ul> : <p className="muted">Nothing special. Dress for {tempLabel(data.current.temperature, units)}.</p>}
                {data.airQuality?.naqi?.advice && <p className="pnl__note">{data.airQuality.naqi.advice}</p>}
              </section>
            </div>
          </div>
        )}
      </WeatherGate>
    </div>
  );
}
