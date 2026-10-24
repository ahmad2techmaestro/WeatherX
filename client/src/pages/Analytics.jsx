import { useEffect, useState } from "react";
import axios from "axios";
import { BarChart3 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState, ErrorState, Segmented } from "../components/ui/States";
import { usePlaces } from "../context/PlacesContext";
import { useSettings } from "../context/SettingsContext";
import { errorMessage } from "../lib/api";
import { temp } from "../lib/units";

const DAYS = [
  { value: 7, label: "7 d" },
  { value: 14, label: "14 d" },
  { value: 30, label: "30 d" },
];
const AXIS = { fontSize: 12, fill: "var(--ink-3)" };
const TIP = { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12 };

function Chart({ title, rows, children, label }) {
  return (
    <section className="card">
      <h2 className="card__title">{title}</h2>
      <div role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TIP} />
            {children}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/**
 * History of what *you* have looked up: each signed-in weather view stores a snapshot,
 * and these charts aggregate those snapshots per day. It fills up as you use the app.
 */
export default function Analytics() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const [days, setDays] = useState(7);
  const [state, setState] = useState({ loading: true, error: "", trends: null, aqi: null, rain: null });

  useEffect(() => {
    document.title = "Analytics — WeatherX";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = { city: place.name, days };

    setState((s) => ({ ...s, loading: true, error: "" }));

    Promise.all([
      axios.get("/api/analytics/trends", { params, signal: controller.signal }),
      axios.get("/api/analytics/aqi", { params, signal: controller.signal }),
      axios.get("/api/analytics/rainfall-temperature", { params, signal: controller.signal }),
    ])
      .then(([t, a, r]) => setState({ loading: false, error: "", trends: t.data?.data, aqi: a.data?.data, rain: r.data?.data }))
      .catch((e) => !axios.isCancel(e) && setState({ loading: false, error: errorMessage(e, "Couldn't load analytics."), trends: null, aqi: null, rain: null }));

    return () => controller.abort();
  }, [place.name, days]);

  const { trends, aqi, rain, loading, error } = state;
  const tempRows = (trends?.trends || []).map((d) => ({ date: d.date, avg: Number(temp(d.temperature?.average, units)), min: Number(temp(d.temperature?.minimum, units)), max: Number(temp(d.temperature?.maximum, units)) }));
  const aqiRows = (aqi?.trends || []).map((d) => ({ date: d.date, avg: d.aqi?.average }));
  const rainRows = (rain?.trends || []).map((d) => ({ date: d.date, rain: d.rainfall?.total, temp: Number(temp(d.temperature?.average, units)) }));
  const empty = !loading && !error && !tempRows.length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Your recorded weather history for {place.name}.</p>
        </div>
        <Segmented label="Period" options={DAYS} value={days} onChange={setDays} />
      </header>

      {error && <ErrorState title="Analytics are unavailable" message={error} />}
      {loading && <p className="muted">Loading…</p>}
      {empty && <EmptyState icon={<BarChart3 size={28} aria-hidden="true" />} title="No history yet" message={`Open ${place.name}'s weather while signed in and snapshots will start collecting here.`} />}

      {tempRows.length > 0 && (
        <div className="grid-2">
          <Chart title="Temperature" rows={tempRows} label="Daily temperature history">
            <Line dataKey="max" stroke="var(--c-temp)" strokeWidth={2} dot={false} name="High" />
            <Line dataKey="avg" stroke="var(--ink-2)" strokeWidth={2} dot={false} name="Average" />
            <Line dataKey="min" stroke="var(--c-rain)" strokeWidth={2} dot={false} name="Low" />
          </Chart>
          {aqiRows.length > 0 && (
            <Chart title="Air quality (avg)" rows={aqiRows} label="Daily air quality history">
              <Bar dataKey="avg" fill="var(--c-humid)" radius={[4, 4, 0, 0]} name="AQI (1–5)" />
            </Chart>
          )}
          {rainRows.length > 0 && (
            <Chart title="Rain vs temperature" rows={rainRows} label="Daily rainfall and temperature">
              <Bar dataKey="rain" fill="var(--c-rain)" radius={[4, 4, 0, 0]} name="Rain (mm)" />
              <Line dataKey="temp" stroke="var(--c-temp)" strokeWidth={2} dot={false} name="Temp" />
            </Chart>
          )}
        </div>
      )}
    </div>
  );
}
