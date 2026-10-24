import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudRain, Sun, Thermometer, Wind } from "lucide-react";

import PageHero from "../components/ui/PageHero";
import LocationBadge from "../components/ui/LocationBadge";
import DayCards from "../components/weather/DayCards";
import RangeRibbon from "../components/weather/RangeRibbon";
import WeatherGate from "../components/weather/WeatherGate";
import HourlyChart from "../components/charts/HourlyChart";
import useOverview from "../hooks/useOverview";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { fullDate, timeAgo, weekdayLong } from "../lib/format";
import { precip, precipUnitLabel, tempLabel, wind, windUnitLabel } from "../lib/units";

function Highlights({ data, units }) {
  const tz = data.location.timezone;
  const week = data.daily.slice(0, 7);
  const pick = (fn, dir = "max") => week.reduce((b, d) => ((dir === "min" ? fn(d) < fn(b) : fn(d) > fn(b)) ? d : b), week[0]);
  const warm = pick((d) => d.temperatureMax);
  const cool = pick((d) => d.temperatureMin, "min");
  const wet = pick((d) => d.precipitationSum || 0);
  const windy = pick((d) => d.windSpeedMax);
  const uv = pick((d) => d.uvIndexMax || 0);
  const day = (d) => weekdayLong(d.time, tz);

  const items = [
    { icon: Thermometer, label: "Warmest day", value: tempLabel(warm.temperatureMax, units), note: day(warm) },
    { icon: Thermometer, label: "Coolest night", value: tempLabel(cool.temperatureMin, units), note: day(cool) },
    wet.precipitationSum >= 1
      ? { icon: CloudRain, label: "Wettest day", value: `${precip(wet.precipitationSum, units)} ${precipUnitLabel(units)}`, note: day(wet) }
      : { icon: CloudRain, label: "Rain this week", value: "Dry", note: "No significant rain" },
    { icon: Wind, label: "Windiest day", value: `${wind(windy.windSpeedMax, units)} ${windUnitLabel(units)}`, note: day(windy) },
    { icon: Sun, label: "Peak UV", value: Math.round(uv.uvIndexMax || 0), note: day(uv) },
  ];

  return (
    <ul className="kpis kpis--5" role="list">
      {items.map((k) => (
        <li key={k.label} className="kpi">
          <span className="kpi__label">
            <k.icon size={15} aria-hidden="true" /> {k.label}
          </span>
          <strong>{k.value}</strong>
          <small>{k.note}</small>
        </li>
      ))}
    </ul>
  );
}

export default function Forecast() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const { data, error, loading, fetchedAt, refresh } = useOverview(place);
  const tz = data?.location.timezone;
  const [focus, setFocus] = useState(null);
  const [allDays, setAllDays] = useState(false);

  useEffect(() => {
    document.title = `Forecast · ${place.name} — WeatherX`;
  }, [place.name]);

  const meta = useMemo(() => (data ? [fullDate(data.current.time, tz), fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : null] : []), [data, tz, fetchedAt]);

  return (
    <div className="page pg">
      <PageHero eyebrow="Forecast outlook" title={place.name} subtitle={`The next 14 days${place.subtitle ? ` for ${place.subtitle}` : ""}, at a glance and in detail.`} meta={[<LocationBadge key="loc" />, ...meta]} />

      <WeatherGate data={data} error={error} loading={loading} fetchedAt={fetchedAt} onRetry={refresh}>
        {data && (
          <div className="stack">
            <Highlights data={data} units={units} />

            <section className="pnl" aria-labelledby="h72">
              <h2 id="h72" className="pnl__title">Next 72 hours</h2>
              <HourlyChart overview={data} hours={72} />
            </section>

            <section className="pnl" aria-labelledby="rb">
              <div className="pnl__head">
                <h2 id="rb" className="pnl__title">{allDays ? "14-day" : "7-day"} temperature range</h2>
                <button type="button" className="link-btn" aria-expanded={allDays} onClick={() => setAllDays((v) => !v)}>
                  {allDays ? "Show 7 days" : "Show 14 days"} <ChevronDown size={15} aria-hidden="true" className={allDays ? "flip" : ""} />
                </button>
              </div>
              <RangeRibbon overview={data} days={allDays ? 14 : 7} onSelect={(d) => setFocus({ d, n: Date.now() })} />
            </section>

            <section className="pnl" aria-labelledby="dl">
              <h2 id="dl" className="pnl__title">Day by day</h2>
              <DayCards overview={data} days={7} focusDate={focus?.d} focusKey={focus?.n} />
            </section>
          </div>
        )}
      </WeatherGate>
    </div>
  );
}
