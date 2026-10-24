import { useState } from "react";
import { ArrowDown, ArrowUp, Droplets, Eye, Heart, Link2, RefreshCw, Sun as SunIcon, Wind as WindIcon, Leaf } from "lucide-react";

import Scene from "./Scene";
import LocationBadge from "../ui/LocationBadge";
import WeatherIcon from "./WeatherIcon";
import { useSettings } from "../../context/SettingsContext";
import { usePlaces } from "../../context/PlacesContext";
import useNow from "../../hooks/useNow";
import { clockLabel, fullDate, timeAgo } from "../../lib/format";
import { headline, uvLevel } from "../../lib/weather";
import { distance, distanceUnitLabel, temp, tempLabel, wind, windUnitLabel } from "../../lib/units";

export default function Hero({ place, overview, fetchedAt, onRefresh, refreshing }) {
  const { units } = useSettings();
  const { isFavourite, toggleFavourite } = usePlaces();
  const [copied, setCopied] = useState(false);
  const [favError, setFavError] = useState("");
  const now = useNow();

  const { current, astronomy, daily, location, airQuality } = overview;
  const tz = location.timezone;
  // Keep the scene's clock moving between refreshes (sun and light follow real time).
  const sceneNow = Math.max(current.time, now);
  const fav = isFavourite(place);
  const today = daily[0];
  const line = headline(overview);
  const uv = uvLevel(current.uvIndex);

  const share = async () => {
    const url = `${window.location.origin}/?lat=${place.latitude}&lon=${place.longitude}&name=${encodeURIComponent(place.name)}`;

    try {
      if (navigator.share) await navigator.share({ title: `Weather in ${place.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const onFav = async () => {
    setFavError("");

    try {
      await toggleFavourite(place);
    } catch {
      setFavError("Couldn't update favourites. Try again.");
    }
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Scene weather={current} astronomy={astronomy} now={sceneNow} className="hero__scene" parallax>
        <div className="hero__inner">
          <div className="hero__top">
            <div className="hero__place">
              <h1 id="hero-title">{place.name}</h1>
              <p>{place.subtitle || [place.state, place.country].filter(Boolean).join(", ")}</p>
              <LocationBadge onGlass />
            </div>

            <div className="hero__actions">
              <button type="button" className={`icon-btn icon-btn--glass ${fav ? "is-on" : ""}`} onClick={onFav} aria-pressed={fav} aria-label={fav ? `Remove ${place.name} from favourites` : `Add ${place.name} to favourites`} title={fav ? "Remove from favourites" : "Add to favourites"}>
                <Heart size={19} aria-hidden="true" fill={fav ? "currentColor" : "none"} />
              </button>
              <button type="button" className="icon-btn icon-btn--glass" onClick={share} aria-label="Copy a link to this weather" title={copied ? "Link copied" : "Share"}>
                <Link2 size={19} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn icon-btn--glass" onClick={onRefresh} aria-label="Refresh weather" title="Refresh" disabled={refreshing}>
                <RefreshCw size={19} aria-hidden="true" className={refreshing ? "spin" : ""} />
              </button>
            </div>
          </div>

          <p className="hero__clock">
            {fullDate(sceneNow, tz)} · {clockLabel(sceneNow, tz)}
            {copied && <span className="hero__toast" role="status"> · Link copied</span>}
            {favError && <span className="hero__toast" role="alert"> · {favError}</span>}
          </p>

          <div className="hero__main">
            <div className="hero__temp">
              <span className="hero__deg" aria-label={`${temp(current.temperature, units)} degrees`}>
                {temp(current.temperature, units)}
                <sup>°{units.temperature === "fahrenheit" ? "F" : "C"}</sup>
              </span>
              <div className="hero__cond">
                <WeatherIcon condition={current.condition} isDay={current.isDay} size={46} animated />
                <div>
                  <strong>{current.label}</strong>
                  <span>
                    Feels like {tempLabel(current.feelsLike, units)}
                    {today && (
                      <>
                        {" · "}
                        <ArrowUp size={13} aria-label="High" className="inline-icon" />
                        {tempLabel(today.temperatureMax, units)} <ArrowDown size={13} aria-label="Low" className="inline-icon" />
                        {tempLabel(today.temperatureMin, units)}
                      </>
                    )}
                  </span>
                </div>
              </div>
              {line && <p className="hero__line">{line}</p>}
            </div>

            <dl className="hero__stats">
              <div>
                <dt>
                  <WindIcon size={15} aria-hidden="true" /> Wind
                </dt>
                <dd>
                  {wind(current.windSpeed, units)} <small>{windUnitLabel(units)}</small>
                </dd>
              </div>
              <div>
                <dt>
                  <Droplets size={15} aria-hidden="true" /> Humidity
                </dt>
                <dd>
                  {current.humidity}
                  <small>%</small>
                </dd>
              </div>
              <div>
                <dt>
                  <SunIcon size={15} aria-hidden="true" /> UV
                </dt>
                <dd>
                  {Math.round(current.uvIndex)} <small>{uv.label}</small>
                </dd>
              </div>
              {current.visibilityKm != null && (
                <div>
                  <dt>
                    <Eye size={15} aria-hidden="true" /> Visibility
                  </dt>
                  <dd>
                    {distance(current.visibilityKm, units)} <small>{distanceUnitLabel(units)}</small>
                  </dd>
                </div>
              )}
              {airQuality?.naqi && (
                <div>
                  <dt>
                    <Leaf size={15} aria-hidden="true" /> AQI
                  </dt>
                  <dd>
                    {airQuality.naqi.value} <small>{airQuality.naqi.label}</small>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <p className="hero__updated">{fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : ""}</p>
        </div>
      </Scene>
    </section>
  );
}
