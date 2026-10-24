import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import WeatherIcon from "../weather/WeatherIcon";
import useLiveRows from "../../hooks/useLiveRows";
import { usePlaces } from "../../context/PlacesContext";
import { CITIES } from "../../lib/cities";
import { distanceM, placeKey, slimPlace } from "../../lib/place";
import { compass, tempLabel } from "../../lib/units";

const bearing = (a, b) => {
  const rad = Math.PI / 180;
  const y = Math.sin((b.longitude - a.longitude) * rad) * Math.cos(b.latitude * rad);
  const x = Math.cos(a.latitude * rad) * Math.sin(b.latitude * rad) - Math.sin(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.cos((b.longitude - a.longitude) * rad);

  return ((Math.atan2(y, x) / rad) + 360) % 360;
};

function Chip({ title, sub, row, units, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick}>
        <span className="pchip__name"><strong>{title}</strong><small>{sub}</small></span>
        {row ? (
          <span className="pchip__now">
            <WeatherIcon condition={row.current.condition} isDay={row.current.isDay} size={30} />
            <b>{tempLabel(row.current.temperature, units)}</b>
          </span>
        ) : (
          <span className="pchip__now muted">…</span>
        )}
      </button>
    </li>
  );
}

/** Saved places and the nearest major cities, each with live conditions. */
export default function PlacesStrip({ units }) {
  const navigate = useNavigate();
  const { place, setPlace, favourites } = usePlaces();

  const saved = useMemo(() => favourites.filter((f) => placeKey(f) !== placeKey(place)).slice(0, 6), [favourites, place]);
  const near = useMemo(
    () =>
      CITIES.map((c) => ({ ...c, d: distanceM(place, c) }))
        .filter((c) => c.d > 12000)
        .sort((a, b) => a.d - b.d)
        .slice(0, 5),
    [place]
  );
  const all = useMemo(() => [...saved, ...near.map((c) => ({ ...c, state: "" }))], [saved, near]);
  const { rows } = useLiveRows(all);

  const open = (p) => {
    setPlace(slimPlace({ kind: "city", country: "India", countryCode: "IN", state: "", ...p }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!saved.length && !near.length) return null;

  return (
    <section className="pnl" aria-labelledby="ps-t">
      <div className="pnl__head">
        <h2 id="ps-t" className="pnl__title">Around you</h2>
        <button type="button" className="link-btn" onClick={() => navigate("/places")}>All locations</button>
      </div>

      {saved.length > 0 && (
        <div>
          <p className="pstrip__label">Your places</p>
          <ul className="pstrip" role="list">
            {saved.map((p) => <Chip key={placeKey(p)} title={p.name} sub={p.state || p.subtitle} row={rows[placeKey(p)]} units={units} onClick={() => open(p)} />)}
          </ul>
        </div>
      )}

      {near.length > 0 && (
        <div>
          <p className="pstrip__label">Nearest cities</p>
          <ul className="pstrip" role="list">
            {near.map((c) => (
              <Chip key={c.name} title={c.name} sub={`${Math.round(c.d / 1000)} km ${compass(bearing(place, c))}`} row={rows[placeKey(c)]} units={units} onClick={() => open(c)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
