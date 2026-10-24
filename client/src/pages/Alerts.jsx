import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertOctagon, AlertTriangle, BellRing, CheckCheck, Info } from "lucide-react";

import Advisories from "../components/weather/Advisories";
import { EmptyState, ErrorState } from "../components/ui/States";
import useOverview from "../hooks/useOverview";
import { usePlaces } from "../context/PlacesContext";
import { errorMessage } from "../lib/api";

const ICON = { info: Info, warning: AlertTriangle, danger: AlertOctagon };

/**
 * Two kinds of alert, kept visibly separate:
 *  - Forecast advisories for the selected place (computed from forecast thresholds, not official).
 *  - Your alerts for the signed-in user, evaluated against current conditions and stored on the server.
 */
export default function Alerts() {
  const { place } = usePlaces();
  const { data } = useOverview(place);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (data) {
        const c = data.current;

        await axios.post("/api/alerts/evaluate", {
          weatherData: { temperature: c.temperature, humidity: c.humidity, windSpeed: c.windSpeed, condition: `${c.label}` },
          location: { city: place.name, country: place.countryCode || place.country || "IN" },
        });
      }

      const res = await axios.get("/api/alerts");

      setAlerts(res.data?.data || []);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load your alerts."));
    } finally {
      setLoading(false);
    }
  }, [data, place.name, place.countryCode, place.country]);

  useEffect(() => {
    document.title = "Alerts — WeatherX";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id) => {
    try {
      await axios.patch(`/api/alerts/${id}/read`);
      setAlerts((list) => list.map((a) => (a._id === id ? { ...a, isRead: true } : a)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const markAll = async () => {
    try {
      await axios.patch("/api/alerts/read-all");
      setAlerts((list) => list.map((a) => ({ ...a, isRead: true })));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Alerts</h1>
          <p>For {place.name}. Use the search bar to change place.</p>
        </div>
        {alerts.some((a) => !a.isRead) && (
          <button type="button" className="btn btn--ghost btn--small" onClick={markAll}>
            <CheckCheck size={16} aria-hidden="true" /> Mark all read
          </button>
        )}
      </header>

      <section aria-labelledby="fc-adv">
        <h2 id="fc-adv" className="section-title">Forecast advisories</h2>
        {data?.advisories?.length ? <Advisories advisories={data.advisories} timezone={data.location.timezone} limit={20} /> : <p className="muted">No advisory-level conditions are forecast for {place.name} at the moment.</p>}
      </section>

      <section aria-labelledby="saved">
        <h2 id="saved" className="section-title">Your alerts</h2>
        {error && <ErrorState compact title="Alerts are unavailable" message={error} onRetry={load} />}
        {!error && loading && <p className="muted">Loading…</p>}
        {!error && !loading && alerts.length === 0 && <EmptyState icon={<BellRing size={28} aria-hidden="true" />} title="All clear" message="Nothing is currently triggering an alert for your places." />}
        <ul className="insights" role="list">
          {alerts.map((a) => {
            const Icon = ICON[a.severity] || Info;

            return (
              <li key={a._id} className={`insight insight--${a.severity === "danger" ? "bad" : a.severity === "warning" ? "warn" : "info"}`} style={{ opacity: a.isRead ? 0.65 : 1 }}>
                <span className="insight__icon" aria-hidden="true"><Icon size={20} /></span>
                <div style={{ flex: 1 }}>
                  <strong>{a.title}{a.location?.city ? ` · ${a.location.city}` : ""}</strong>
                  <p>{a.message}</p>
                  <small className="muted">{a.status === "resolved" ? "Resolved" : "Active"} · {new Date(a.lastDetectedAt).toLocaleString()}</small>
                </div>
                {!a.isRead && <button type="button" className="link-btn" onClick={() => markRead(a._id)}>Mark read</button>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
