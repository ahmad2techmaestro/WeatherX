import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { Check, Crosshair, Expand, Layers, Link2, Minimize2, Wind } from "lucide-react";
import "leaflet/dist/leaflet.css";

import PageHero from "../components/ui/PageHero";
import AtlasInsights from "../components/map/AtlasInsights";
import SearchBox from "../components/layout/SearchBox";
import WindFlow from "../components/map/WindFlow";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { BASEMAPS } from "../lib/basemaps";
import { errorMessage, fetchMulti, reversePlace } from "../lib/api";
import { CITIES } from "../lib/cities";
import { LAYERS, legendFor, pinLabel, rampColor, readableOn } from "../lib/mapLayers";
import { coordLabel } from "../lib/place";
import { tempLabel, wind, windUnitLabel } from "../lib/units";

const params = () => new URLSearchParams(window.location.search);

/** Reports the visible area (debounced), the zoom, and forwards clicks. */
function MapEvents({ onBounds, onProbe, onView }) {
  const timer = useRef(null);
  const map = useMapEvents({
    click: (e) => onProbe(e.latlng.lat, e.latlng.lng),
    moveend: () => schedule(),
  });

  function schedule() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const b = map.getBounds();
      const c = map.getCenter();

      onBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
      onView({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    }, 350);
  }

  useEffect(() => {
    schedule();

    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Keeps the map in step with the searched/selected place. */
function Follow({ target }) {
  const map = useMap();

  useEffect(() => {
    if (target) map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 8), { duration: 1.1 });
  }, [target, map]);

  return null;
}

const pinIcon = (text, bg, fg, rotation, cls = "") => {
  const arrow = rotation === undefined ? "" : `<i style="transform:rotate(${rotation}deg)"></i>`;

  return L.divIcon({ className: `wxpin ${cls}`, html: `<span style="background:${bg};color:${fg}">${arrow}${text}</span>`, iconSize: [0, 0] });
};

const cityIcon = (name, text, bg, fg, rotation) => {
  const arrow = rotation === undefined ? "" : `<i style="transform:rotate(${rotation}deg)"></i>`;

  return L.divIcon({ className: "wxpin wxpin--city", html: `<span><b style="background:${bg};color:${fg}">${arrow}${text}</b><em>${name}</em></span>`, iconSize: [0, 0] });
};

const FIELD_LABEL = { temperature: "Hottest", rain: "Wettest", wind: "Windiest", clouds: "Cloudiest", pressure: "Highest pressure" };
const LOW_LABEL = { temperature: "Coolest", rain: "Driest", wind: "Calmest", clouds: "Clearest", pressure: "Lowest pressure" };

export default function MapPage() {
  const { place, setPlace, favourites } = usePlaces();
  const { resolvedTheme, units } = useSettings();
  const q = useMemo(params, []);

  const [layerKey, setLayerKey] = useState(LAYERS.some((l) => l.value === q.get("layer")) ? q.get("layer") : "temperature");
  const [basemap, setBasemap] = useState("standard");
  const [bounds, setBounds] = useState(null);
  const [view, setView] = useState(null);
  const [grid, setGrid] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: "" });
  const [probe, setProbe] = useState(null);
  const [owm, setOwm] = useState(null);
  const [showOwm, setShowOwm] = useState(true);
  const [opacity, setOpacity] = useState(0.7);
  const [showFlow, setShowFlow] = useState(true);
  const [showCities, setShowCities] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showSaved, setShowSaved] = useState(true);
  const [cities, setCities] = useState([]);
  const [saved, setSaved] = useState([]);
  const [full, setFull] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [mapRef, setMapRef] = useState(null);
  const [follow, setFollow] = useState(null);
  const [toast, setToast] = useState("");

  const layer = LAYERS.find((l) => l.value === layerKey);
  const start = useMemo(() => {
    const lat = Number(q.get("lat"));
    const lon = Number(q.get("lon"));
    const zoom = Number(q.get("z"));

    return Number.isFinite(lat) && Number.isFinite(lon) && q.has("lat") ? { center: [lat, lon], zoom: Number.isFinite(zoom) ? zoom : 6 } : { center: [place.latitude, place.longitude], zoom: 6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = "Weather atlas — WeatherX";
  }, []);

  // The status call also issues a short-lived tile token; refresh it before it expires.
  useEffect(() => {
    const load = () =>
      axios
        .get("/api/weather/map/status", { timeout: 15000 })
        .then(({ data }) => setOwm(data.data))
        .catch(() => setOwm((prev) => prev || { ok: false, message: "The weather overlay status couldn't be checked." }));

    load();
    const timer = setInterval(load, 20 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Live grid for the visible area.
  useEffect(() => {
    if (!bounds) return undefined;

    const controller = new AbortController();

    setStatus({ loading: true, error: "" });
    axios
      .get("/api/weather/grid", { params: bounds, signal: controller.signal, timeout: 20000 })
      .then(({ data }) => {
        setGrid(data.data || []);
        setStatus({ loading: false, error: "" });
      })
      .catch((error) => {
        if (axios.isCancel(error)) return;

        setStatus({ loading: false, error: errorMessage(error, "Map data couldn't be loaded.") });
      });

    return () => controller.abort();
  }, [bounds]);

  // City hotspots: loaded once, five per request.
  useEffect(() => {
    let cancelled = false;
    const chunks = [];

    for (let i = 0; i < CITIES.length; i += 5) chunks.push(CITIES.slice(i, i + 5));

    Promise.allSettled(chunks.map((c) => fetchMulti(c))).then((results) => {
      if (cancelled) return;

      const out = [];

      results.forEach((r, ci) => {
        if (r.status !== "fulfilled") return;

        r.value.forEach((row, i) => row?.ok && out.push({ ...chunks[ci][i], current: row.current, aqi: row.airQuality?.naqi?.value ?? null }));
      });
      setCities(out);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const list = (favourites || []).slice(0, 5);

    if (list.length === 0) {
      setSaved([]);
      return undefined;
    }

    let cancelled = false;

    fetchMulti(list)
      .then((rows) => !cancelled && setSaved(list.map((f, i) => ({ place: f, row: rows[i]?.ok ? rows[i] : null })).filter((x) => x.row)))
      .catch(() => !cancelled && setSaved([]));

    return () => {
      cancelled = true;
    };
  }, [favourites]);

  // Shareable link: the address bar always reflects the view and layer.
  useEffect(() => {
    if (!view) return;

    const next = new URLSearchParams({ lat: view.lat.toFixed(3), lon: view.lon.toFixed(3), z: String(view.zoom), layer: layerKey });

    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [view, layerKey]);

  useEffect(() => {
    if (mapRef) setTimeout(() => mapRef.invalidateSize(), 60);
  }, [full, mapRef]);

  useEffect(() => {
    if (!full) return undefined;

    const onKey = (e) => e.key === "Escape" && setFull(false);

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const onProbe = useCallback(async (lat, lon) => {
    setProbe({ lat, lon, loading: true });

    try {
      const [rows, named] = await Promise.all([fetchMulti([{ latitude: lat, longitude: lon }]), reversePlace(lat, lon).catch(() => null)]);
      const row = rows[0];

      setProbe({ lat, lon, named, row: row?.ok ? row : null, error: row?.ok ? "" : "No data available for this point." });
    } catch {
      setProbe({ lat, lon, error: "Weather isn't available for this point." });
    }
  }, []);

  const locateMe = () => {
    if (!navigator.geolocation) return flash("This browser doesn't support location access.");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        mapRef?.flyTo([coords.latitude, coords.longitude], 9, { duration: 1.2 });
        onProbe(coords.latitude, coords.longitude);
      },
      () => flash("Location access was denied."),
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("Link to this view copied");
    } catch {
      flash("Copy the address from your browser bar");
    }
  };

  const base = BASEMAPS.find((b) => b.value === basemap);
  const valueOf = (obj) => obj?.[layer.field];

  const gridPins = useMemo(
    () =>
      grid.map((point) => {
        const bg = rampColor(layer.ramp, point[layer.field]);

        return { key: `${point.latitude},${point.longitude}`, point, icon: pinIcon(pinLabel(layer, point, units), bg, readableOn(bg), layer.value === "wind" ? (point.windDirection + 180) % 360 : undefined) };
      }),
    [grid, layer, units]
  );

  const cityPins = useMemo(
    () =>
      cities.map((c) => {
        const v = c.current[layer.field];
        const bg = rampColor(layer.ramp, v);

        return { c, icon: cityIcon(c.name, pinLabel(layer, c.current, units), bg, readableOn(bg), layer.value === "wind" ? (c.current.windDirection + 180) % 360 : undefined) };
      }),
    [cities, layer, units]
  );

  // "In view": named extremes among the cities on screen, and averages from the live grid.
  const area = useMemo(() => {
    if (!bounds) return null;

    const inView = cities.filter((c) => c.latitude >= bounds.south && c.latitude <= bounds.north && c.longitude >= bounds.west && c.longitude <= bounds.east && Number.isFinite(c.current[layer.field]));
    const vals = grid.map((p) => p[layer.field]).filter(Number.isFinite);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const sorted = [...inView].sort((a, b) => b.current[layer.field] - a.current[layer.field]);

    return { count: inView.length, high: sorted[0], low: sorted.length > 1 ? sorted[sorted.length - 1] : null, avg };
  }, [bounds, cities, grid, layer]);

  const legend = legendFor(layer, units);
  const fmt = (c) => pinLabel(layer, c.current, units);
  const avgText = area?.avg == null ? "–" : pinLabel(layer, { [layer.field]: area.avg }, units);

  const focusCity = (c) => {
    document.getElementById("atlas-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
    mapRef?.flyTo([c.latitude, c.longitude], 8, { duration: 1.1 });
  };

  return (
    <div className="page pg atlas">
      <PageHero eyebrow="Weather atlas" title="Live weather across India" subtitle="Temperature, rain, wind, cloud and pressure on one map, with the readings behind them below." />

    <div id="atlas-map" className={`map-page ${full ? "is-full" : ""} map-shell--${resolvedTheme} map-base--${basemap}`}>
      <MapContainer ref={setMapRef} center={start.center} zoom={start.zoom} minZoom={3} zoomControl={false} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer key={basemap} className="base-tiles" url={base.url} attribution={base.attribution} maxZoom={base.maxZoom} />
        {owm?.ok && showOwm && <TileLayer key={`${layer.owm}-${owm.tileToken}`} url={`/api/weather/map/${layer.owm}/{z}/{x}/{y}?t=${encodeURIComponent(owm.tileToken || "")}`} opacity={opacity} maxNativeZoom={10} maxZoom={19} attribution='Weather overlay &copy; <a href="https://openweathermap.org">OpenWeather</a>' />}
        <ZoomControl position="bottomright" />
        <Follow target={follow} />
        <MapEvents onBounds={setBounds} onProbe={onProbe} onView={setView} />
        <WindFlow grid={grid} enabled={layerKey === "wind" && showFlow} />

        {showGrid && gridPins.map((pin) => <Marker key={`g-${layerKey}-${pin.key}`} position={[pin.point.latitude, pin.point.longitude]} icon={pin.icon} interactive={false} keyboard={false} />)}

        {showCities &&
          cityPins.map(({ c, icon }) => (
            <Marker key={`c-${layerKey}-${c.name}`} position={[c.latitude, c.longitude]} icon={icon} eventHandlers={{ click: () => onProbe(c.latitude, c.longitude) }} />
          ))}

        {showSaved &&
          saved.map(({ place: p, row }) => (
            <Marker key={`s-${p.latitude},${p.longitude}`} position={[p.latitude, p.longitude]} icon={L.divIcon({ className: "wxpin wxpin--saved", html: `<span><b>${p.name}</b> ${tempLabel(row.current.temperature, units)}</span>`, iconSize: [0, 0] })} eventHandlers={{ click: () => setPlace(p) }} />
          ))}

        <CircleMarker center={[place.latitude, place.longitude]} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#0e1820", fillOpacity: 1 }}>
          <Popup>{place.name}</Popup>
        </CircleMarker>

        {probe && (
          <CircleMarker center={[probe.lat, probe.lon]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#f0a500", fillOpacity: 1 }}>
            <Popup eventHandlers={{ remove: () => setProbe(null) }}>
              {probe.loading ? (
                "Fetching conditions…"
              ) : probe.error ? (
                probe.error
              ) : (
                <div className="map-popup">
                  <strong>{probe.named?.name || coordLabel(probe.lat, probe.lon)}</strong>
                  <span className="map-popup__temp">{tempLabel(probe.row.current.temperature, units)}</span>
                  <span>
                    {probe.row.current.label} · wind {wind(probe.row.current.windSpeed, units)} {windUnitLabel(units)}
                  </span>
                  <button type="button" className="link-btn" onClick={() => setPlace(probe.named ? { ...probe.named, latitude: probe.lat, longitude: probe.lon } : { name: coordLabel(probe.lat, probe.lon), kind: "locality", latitude: probe.lat, longitude: probe.lon, state: "", country: "", countryCode: "" })}>
                    View full forecast
                  </button>
                </div>
              )}
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Search + layers */}
      <div className="mp mp--left">
        <div className="mp__card mp__search">
          <SearchBox variant="page" onSelect={(p) => setFollow({ ...p })} placeholder="Search a place on the map" />
        </div>

        <div className="mp__card mp__layers" role="radiogroup" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={layerKey === l.value} className={`mp__layer ${layerKey === l.value ? "is-active" : ""}`} onClick={() => setLayerKey(l.value)}>
              <i style={{ background: rampColor(l.ramp, l.value === "temperature" ? 32 : l.value === "rain" ? 4 : l.value === "wind" ? 40 : l.value === "clouds" ? 80 : 1018) }} aria-hidden="true" />
              {l.label}
            </button>
          ))}
        </div>

        <div className="mp__card mp__stats" aria-live="polite">
          <div className="mp__stats-head">
            <strong>In view</strong>
            <span className="muted small">{status.loading ? "Refreshing…" : status.error ? "Update failed" : `${area?.count ?? 0} cities`}</span>
          </div>
          <dl>
            <div><dt>Average</dt><dd>{avgText}</dd></div>
            {area?.high && (
              <div className="is-link"><dt>{FIELD_LABEL[layerKey]}</dt><dd><button type="button" onClick={() => mapRef?.flyTo([area.high.latitude, area.high.longitude], 8)}>{area.high.name} <b>{fmt(area.high)}</b></button></dd></div>
            )}
            {area?.low && (
              <div className="is-link"><dt>{LOW_LABEL[layerKey]}</dt><dd><button type="button" onClick={() => mapRef?.flyTo([area.low.latitude, area.low.longitude], 8)}>{area.low.name} <b>{fmt(area.low)}</b></button></dd></div>
            )}
          </dl>
          {status.error && <p className="muted small">{status.error}</p>}
        </div>
      </div>

      {/* Right-hand tools */}
      <div className="mp mp--tools">
        <button type="button" className="mp__tool" onClick={() => setDockOpen((v) => !v)} aria-expanded={dockOpen} aria-label="Map options" title="Map options"><Layers size={18} /></button>
        <button type="button" className="mp__tool" onClick={locateMe} aria-label="Show my location" title="My location"><Crosshair size={18} /></button>
        <button type="button" className="mp__tool" onClick={copyLink} aria-label="Copy link to this view" title="Copy link"><Link2 size={18} /></button>
        <button type="button" className="mp__tool" onClick={() => setFull((v) => !v)} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"}>{full ? <Minimize2 size={18} /> : <Expand size={18} />}</button>
      </div>

      {dockOpen && (
        <div className="mp__card mp__options">
          <p className="mp__opt-title">Base map</p>
          <div className="mp__chips" role="radiogroup" aria-label="Base map">
            {BASEMAPS.map((b) => (
              <button key={b.value} type="button" role="radio" aria-checked={basemap === b.value} className={`mp__chip ${basemap === b.value ? "is-active" : ""}`} onClick={() => setBasemap(b.value)}>{b.label}</button>
            ))}
          </div>

          <p className="mp__opt-title">Overlay</p>
          <label className="mp__switch"><input type="checkbox" checked={showOwm} disabled={!owm?.ok} onChange={(e) => setShowOwm(e.target.checked)} /> Weather overlay</label>
          <label className="mp__range">Opacity<input type="range" min="0.2" max="1" step="0.05" value={opacity} disabled={!owm?.ok || !showOwm} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Overlay opacity" /></label>
          {owm && !owm.ok && <p className="mp__warn">{owm.message}</p>}
          <label className="mp__switch"><input type="checkbox" checked={showFlow} disabled={layerKey !== "wind"} onChange={(e) => setShowFlow(e.target.checked)} /> <Wind size={14} aria-hidden="true" /> Wind flow (wind layer)</label>

          <p className="mp__opt-title">Markers</p>
          <label className="mp__switch"><input type="checkbox" checked={showCities} onChange={(e) => setShowCities(e.target.checked)} /> Major cities</label>
          <label className="mp__switch"><input type="checkbox" checked={showSaved} onChange={(e) => setShowSaved(e.target.checked)} /> My places</label>
          <label className="mp__switch"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Value grid</label>
        </div>
      )}

      <div className="mp__legend" aria-label={`${layer.label} scale`}>
        <span className="mp__legend-title">{layer.label}</span>
        <span className="mp__legend-bar" style={{ background: legend.gradient }} />
        <span className="mp__legend-ends">
          <span>{legend.from}</span>
          <span>{legend.unit}</span>
          <span>{legend.to}</span>
        </span>
      </div>

      {toast && (
        <p className="mp__toast" role="status">
          <Check size={14} aria-hidden="true" /> {toast}
        </p>
      )}
    </div>

      <AtlasInsights cities={cities} layer={layer} units={units} onFocus={focusCity} />
    </div>
  );
}
