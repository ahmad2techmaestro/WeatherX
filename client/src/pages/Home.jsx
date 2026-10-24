import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Crosshair } from "lucide-react";

import Hero from "../components/weather/Hero";
import Briefing from "../components/weather/Briefing";
import Advisories from "../components/weather/Advisories";
import HourlyTimeline from "../components/weather/HourlyTimeline";
import RainOutlook from "../components/today/RainOutlook";
import VisibilityCard from "../components/today/VisibilityCard";
import UvCard from "../components/today/UvCard";
import DayParts from "../components/today/DayParts";
import PlacesStrip from "../components/today/PlacesStrip";
import Metrics from "../components/weather/Metrics";
import SunMoon from "../components/weather/SunMoon";
import AirQuality from "../components/weather/AirQuality";
import { useSettings } from "../context/SettingsContext";
import WeatherGate from "../components/weather/WeatherGate";
import useOverview from "../hooks/useOverview";
import { usePlaces } from "../context/PlacesContext";
import { coordLabel } from "../lib/place";

export default function Home() {
  const { units } = useSettings();
  const { place, setPlace, follow, gps, placeSource, pauseFollow } = usePlaces();
  const [params, setParams] = useSearchParams();
  const waitingForFix = follow && gps === "locating" && placeSource !== "gps";
  const { data, error, loading, fetchedAt, refresh } = useOverview(waitingForFix ? null : place);

  // A shared link (/?lat=..&lon=..&name=..) opens that place, then tidies the URL.
  useEffect(() => {
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));

    if (params.get("lat") && params.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const name = (params.get("name") || "").slice(0, 80) || "Shared location";

      setPlace({ name, subtitle: params.get("name") ? "" : coordLabel(lat, lon), kind: "locality", latitude: lat, longitude: lon });
      setParams({}, { replace: true });
    }
  }, [params, setParams, setPlace]);

  useEffect(() => {
    document.title = data ? `${Math.round(data.current.temperature)}° ${place.name} — WeatherX` : `${place.name} — WeatherX`;
  }, [data, place.name]);

  // Opening on the device location: wait for the first GPS fix rather than flashing a stale city.
  if (waitingForFix) {
    return (
      <div className="page page--home">
        <section className="pnl locating" role="status" aria-live="polite">
          <Crosshair size={26} aria-hidden="true" />
          <h1>Finding your exact location</h1>
          <p>Allow location access if your browser asks, and the weather for where you are will appear here.</p>
          <button type="button" className="link-btn" onClick={pauseFollow}>Use the last place instead</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page pg page--home">
      <WeatherGate data={data} error={error} loading={loading} fetchedAt={fetchedAt} onRetry={refresh}>
        {data && (
          <div className="stack">
            <Hero place={place} overview={data} fetchedAt={fetchedAt} onRefresh={refresh} refreshing={loading} />

            <Briefing place={place} unit={units.temperature} />

            <Advisories advisories={data.advisories} timezone={data.location.timezone} />

            <section className="pnl" aria-labelledby="hourly-title">
              <div className="pnl__head">
                <h2 id="hourly-title" className="pnl__title">Next 24 hours</h2>
                <Link to="/forecast" className="link-btn">
                  Full outlook <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <HourlyTimeline overview={data} hours={24} />
            </section>

            <div className="split">
              <RainOutlook data={data} units={units} />
              <VisibilityCard data={data} units={units} />
            </div>

            <div className="split">
              <UvCard data={data} />
              <DayParts data={data} units={units} />
            </div>

            <PlacesStrip units={units} />

            <section aria-labelledby="cond-title" className="stack">
              <h2 id="cond-title" className="pnl__title">Conditions right now</h2>
              <Metrics overview={data} />
            </section>

            <div className="split">
              <AirQuality overview={data} />
              <SunMoon overview={data} />
            </div>
          </div>
        )}
      </WeatherGate>
    </div>
  );
}
