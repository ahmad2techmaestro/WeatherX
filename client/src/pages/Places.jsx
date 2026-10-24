import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Columns3, Compass, Droplets, Heart, Map as MapIcon, Plus, Wind, X } from "lucide-react";

import PageHero from "../components/ui/PageHero";
import Tabs from "../components/ui/Tabs";
import Spark from "../components/ui/Spark";
import WeatherIcon from "../components/weather/WeatherIcon";
import SearchBox from "../components/layout/SearchBox";
import { EmptyState } from "../components/ui/States";
import useLiveRows from "../hooks/useLiveRows";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { EXPLORE } from "../lib/explore";
import { placeKey, slimPlace } from "../lib/place";
import { currentScore, dayFigures, scoreTone } from "../lib/scoring";
import { readJson, writeJson } from "../lib/storage";
import { tempLabel, wind, windUnitLabel } from "../lib/units";

const SORTS = [
  { value: "name", label: "Name" },
  { value: "temp", label: "Warmest" },
  { value: "air", label: "Air quality" },
];

function Stat({ icon: Icon, label, value, note }) {
  return (
    <li className="kpi">
      <span className="kpi__label">
        <Icon size={15} aria-hidden="true" /> {label}
      </span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </li>
  );
}

function SavedCard({ place, row, loading, onOpen, onCompare, onMap, onRemove }) {
  const { units } = useSettings();
  const figures = row ? dayFigures(row) : null;
  const score = row ? currentScore(row) : null;
  const today = row?.daily?.[0];

  return (
    <li className="scard">
      <button type="button" className="scard__main" onClick={onOpen} aria-label={`Open weather for ${place.name}`}>
        <span className="scard__title">
          <strong>{place.name}</strong>
          <small>{place.state || place.subtitle}</small>
        </span>

        {row ? (
          <>
            <span className="scard__now">
              <WeatherIcon condition={row.current.condition} isDay={row.current.isDay} size={40} />
              <span>
                <b>{tempLabel(row.current.temperature, units)}</b>
                <em>{row.current.label}</em>
              </span>
            </span>
            <Spark values={row.hourly.slice(0, 24).map((h) => h.temperature)} width={220} height={36} />
            <span className="scard__facts">
              <span>H {tempLabel(today.temperatureMax, units)} · L {tempLabel(today.temperatureMin, units)}</span>
              <span><Droplets size={13} aria-hidden="true" /> {Math.round(figures.rainChance)}%</span>
              <span><Wind size={13} aria-hidden="true" /> {wind(row.current.windSpeed, units)} {windUnitLabel(units)}</span>
            </span>
            <span className="scard__tags">
              {figures.aqi != null && <span className="tag" data-tone={figures.aqi <= 100 ? "great" : figures.aqi <= 200 ? "fair" : "poor"}>AQI {figures.aqi}</span>}
              <span className="tag" data-tone={scoreTone(score)}>Outdoor {score}</span>
            </span>
          </>
        ) : (
          <span className="scard__loading">{loading ? "Loading conditions…" : "Live conditions are unavailable right now."}</span>
        )}
      </button>

      <div className="scard__actions">
        <button type="button" onClick={onCompare}><Columns3 size={15} aria-hidden="true" /> Compare</button>
        <button type="button" onClick={onMap}><MapIcon size={15} aria-hidden="true" /> Map</button>
        {onRemove && (
          <button type="button" className="is-danger" onClick={onRemove} aria-label={`Remove ${place.name} from saved locations`}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function Places() {
  const navigate = useNavigate();
  const { units } = useSettings();
  const { favourites, recents, setPlace, addFavourite, removeFavourite, clearRecents, isFavourite } = usePlaces();
  const [sort, setSort] = useState("name");
  const [explore, setExplore] = useState(EXPLORE[0].value);
  const [error, setError] = useState("");

  const group = EXPLORE.find((g) => g.value === explore);
  const trackList = useMemo(() => [...favourites, ...recents.filter((r) => !favourites.some((f) => placeKey(f) === placeKey(r)))], [favourites, recents]);
  const saved = useLiveRows(trackList);
  const discover = useLiveRows(group.places);

  useEffect(() => {
    document.title = "Saved locations — WeatherX";
  }, []);

  const open = (p) => {
    setPlace(p);
    navigate("/");
  };

  const compare = (list) => {
    const current = readJson("wx.compare", []);
    const merged = [...list, ...current].filter((p, i, a) => a.findIndex((x) => placeKey(x) === placeKey(p)) === i).slice(0, 4);

    writeJson("wx.compare", merged.map(slimPlace));
    navigate("/compare");
  };

  const onMap = (p) => navigate(`/map?lat=${p.latitude}&lon=${p.longitude}&z=9`);
  const save = (p) => addFavourite(p).catch(() => setError("Couldn't save that place. Try again."));

  const sorted = useMemo(() => {
    const list = [...favourites];
    const row = (p) => saved.rows[placeKey(p)];

    if (sort === "name") return list.sort((a, b) => a.name.localeCompare(b.name));

    return list.sort((a, b) => {
      const ra = row(a);
      const rb = row(b);

      if (!ra || !rb) return ra ? -1 : rb ? 1 : 0;

      return sort === "temp" ? rb.current.temperature - ra.current.temperature : (ra.airQuality?.naqi?.value ?? Infinity) - (rb.airQuality?.naqi?.value ?? Infinity);
    });
  }, [favourites, sort, saved.rows]);

  const live = favourites.map((p) => ({ p, row: saved.rows[placeKey(p)] })).filter((x) => x.row);
  const stats = useMemo(() => {
    if (!live.length) return null;

    const by = (fn, dir) => live.reduce((b, x) => (dir === "min" ? fn(x) < fn(b) : fn(x) > fn(b)) ? x : b, live[0]);
    const warm = by((x) => x.row.current.temperature, "max");
    const cool = by((x) => x.row.current.temperature, "min");
    const wet = live.filter((x) => dayFigures(x.row).rainChance >= 50);
    const air = live.filter((x) => x.row.airQuality?.naqi);
    const clean = air.length ? by((x) => x.row.airQuality.naqi.value, "min") : null;

    return { warm, cool, wet, clean };
  }, [live]);

  return (
    <div className="page pg">
      <PageHero eyebrow="Saved locations" title="Your places, live" subtitle="Conditions, air quality and the next 24 hours for everywhere you follow." meta={[favourites.length ? `${favourites.length} saved` : null]}>
        <div className="phero__search">
          <SearchBox variant="page" placeholder="Search and open a place" />
        </div>
      </PageHero>

      {error && <p className="notice notice--error" role="alert">{error}</p>}

      {stats && favourites.length > 1 && (
        <ul className="kpis" role="list">
          <Stat icon={Compass} label="Warmest" value={stats.warm.p.name} note={tempLabel(stats.warm.row.current.temperature, units)} />
          <Stat icon={Compass} label="Coolest" value={stats.cool.p.name} note={tempLabel(stats.cool.row.current.temperature, units)} />
          <Stat icon={Droplets} label="Rain likely today" value={stats.wet.length ? `${stats.wet.length} of ${live.length}` : "None"} note={stats.wet.length ? stats.wet.map((x) => x.p.name).slice(0, 2).join(", ") : "Dry across your places"} />
          {stats.clean && <Stat icon={Wind} label="Cleanest air" value={stats.clean.p.name} note={`AQI ${stats.clean.row.airQuality.naqi.value}`} />}
        </ul>
      )}

      <section className="pnl" aria-labelledby="fav-t">
        <div className="pnl__head">
          <h2 id="fav-t" className="pnl__title"><Heart size={18} aria-hidden="true" /> Saved</h2>
          {favourites.length > 1 && (
            <div className="pnl__tools">
              <Tabs label="Sort saved places" options={SORTS} value={sort} onChange={setSort} />
              <button type="button" className="btn btn--small" onClick={() => compare(sorted.slice(0, 4))}>
                <Columns3 size={15} aria-hidden="true" /> Compare top 4
              </button>
            </div>
          )}
        </div>

        {favourites.length === 0 ? (
          <EmptyState icon={<Heart size={28} aria-hidden="true" />} title="No saved places yet" message="Save a place from Today or from Explore below and it will show up here with live conditions." />
        ) : (
          <ul className="sgrid" role="list">
            {sorted.map((p) => (
              <SavedCard key={placeKey(p)} place={p} row={saved.rows[placeKey(p)]} loading={saved.loading} onOpen={() => open(p)} onCompare={() => compare([p])} onMap={() => onMap(p)} onRemove={() => removeFavourite(p).catch(() => setError("Couldn't remove that place. Try again."))} />
            ))}
          </ul>
        )}
      </section>

      <section className="pnl" aria-labelledby="exp-t">
        <div className="pnl__head">
          <h2 id="exp-t" className="pnl__title"><Compass size={18} aria-hidden="true" /> Explore India</h2>
          <Tabs label="Destination type" options={EXPLORE} value={explore} onChange={setExplore} />
        </div>
        <ul className="xgrid" role="list">
          {group.places.map((p) => {
            const row = discover.rows[placeKey(p)];
            const fav = isFavourite(p);

            return (
              <li key={placeKey(p)} className="xcard">
                <button type="button" className="xcard__main" onClick={() => open(p)}>
                  <strong>{p.name}</strong>
                  <small>{p.state}</small>
                  {row ? (
                    <span className="xcard__now">
                      <WeatherIcon condition={row.current.condition} isDay={row.current.isDay} size={28} />
                      <b>{tempLabel(row.current.temperature, units)}</b>
                      <em>{row.current.label}</em>
                    </span>
                  ) : (
                    <span className="xcard__now muted">{discover.loading ? "Loading…" : "Unavailable"}</span>
                  )}
                </button>
                <button type="button" className={`xcard__save ${fav ? "is-saved" : ""}`} disabled={fav} onClick={() => save(p)} aria-label={fav ? `${p.name} is saved` : `Save ${p.name}`}>
                  {fav ? <Heart size={16} fill="currentColor" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {recents.length > 0 && (
        <section className="pnl" aria-labelledby="rec-t">
          <div className="pnl__head">
            <h2 id="rec-t" className="pnl__title"><Clock size={18} aria-hidden="true" /> Recently viewed</h2>
            <button type="button" className="link-btn" onClick={clearRecents}>Clear</button>
          </div>
          <ul className="rlist" role="list">
            {recents.map((p) => {
              const row = saved.rows[placeKey(p)];

              return (
                <li key={placeKey(p)}>
                  <button type="button" onClick={() => open(p)}>
                    <span><strong>{p.name}</strong> <small>{p.state || p.subtitle}</small></span>
                    {row && <span className="rlist__t">{tempLabel(row.current.temperature, units)} · {row.current.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
