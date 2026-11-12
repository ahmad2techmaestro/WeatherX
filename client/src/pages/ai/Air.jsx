import { useEffect, useState } from "react";
import axios from "axios";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HeartPulse, ShieldCheck, TrendingDown, TrendingUp, Minus, Wind } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { ErrorState, Skeleton } from "../../components/ui/States";
import { usePlaces } from "../../context/PlacesContext";
import { errorMessage } from "../../lib/api";

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };
const TIP = { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12 };
const tone = (v) => (v <= 50 ? "great" : v <= 100 ? "good" : v <= 200 ? "fair" : "poor");
const POLL = [["pm2_5", "PM2.5", "µg/m³"], ["pm10", "PM10", "µg/m³"], ["no2", "NO₂", "µg/m³"], ["o3", "Ozone", "µg/m³"], ["so2", "SO₂", "µg/m³"], ["co", "CO", "µg/m³"]];
const hour = (t, off = 19800) => { const h = new Date((t + off) * 1000).getUTCHours(); return `${h % 12 || 12}${h < 12 ? "a" : "p"}`; };

export default function Air() {
  const { place } = usePlaces();
  const [s, setS] = useState({ loading: true, error: "", data: null });

  useEffect(() => { document.title = "Air Quality — WeatherX"; }, []);
  useEffect(() => {
    const c = new AbortController();
    setS((x) => ({ ...x, loading: true, error: "" }));
    axios.get("/api/air/analysis", { params: { lat: place.latitude, lon: place.longitude, name: place.name }, signal: c.signal, timeout: 25000 })
      .then((r) => setS({ loading: false, error: "", data: r.data.data }))
      .catch((e) => !axios.isCancel(e) && setS({ loading: false, error: errorMessage(e, "Couldn't load air quality."), data: null }));
    return () => c.abort();
  }, [place.latitude, place.longitude, place.name]);

  const { data, loading, error } = s;
  const a = data?.analysis;
  const Trend = a?.trend?.direction === "improving" ? TrendingDown : a?.trend?.direction === "worsening" ? TrendingUp : Minus;
  const rows = (a?.series || []).map((p) => ({ t: p.time, label: hour(p.time), naqi: p.naqi }));

  return (
    <>
      <PageHero eyebrow="Air Quality Intelligence" title="What you are breathing" subtitle="Indian AQI from modelled pollutants, the next two days hour by hour, and when it is cleanest to be outside." meta={[place.name, data?.personalised && "Tuned for sensitive health from your notes"]} />
      {loading && <Skeleton height={320} radius={20} />}
      {error && <ErrorState message={error} />}
      {a && !a.available && <ErrorState title="No air quality data" message={a.reason} />}
      {a?.available && (
        <>
          <ul className="kpis kpis--5 air__kpis" role="list">
            <li className={`kpi air__kpi air__kpi--${tone(a.now.value)}`}><span className="kpi__label"><Wind size={14} aria-hidden /> NAQI now</span><strong>{a.now.value}</strong><small className="muted">{a.now.label} · {a.now.dominantName}</small></li>
            <li className="kpi"><span className="kpi__label"><Trend size={14} aria-hidden /> Next 24 h</span><strong className="kpi__text">{a.trend.direction === "unknown" ? "–" : a.trend.direction[0].toUpperCase() + a.trend.direction.slice(1)}</strong><small className="muted">{a.trend.delta === null ? "" : `${a.trend.delta > 0 ? "+" : ""}${a.trend.delta} NAQI`}</small></li>
            <li className="kpi"><span className="kpi__label">Cleanest hour</span><strong className="kpi__text">{a.next24h.best.hour}</strong><small className="muted">NAQI {a.next24h.best.naqi}</small></li>
            <li className="kpi"><span className="kpi__label">Worst hour</span><strong className="kpi__text">{a.next24h.worst.hour}</strong><small className="muted">NAQI {a.next24h.worst.naqi}</small></li>
            <li className="kpi"><span className="kpi__label">Outdoor window</span><strong className="kpi__text">{a.cleanWindow ? `${a.cleanWindow.from}–${a.cleanWindow.to}` : "None"}</strong><small className="muted">{a.cleanWindow ? `${a.cleanWindow.hours} h at or below NAQI ${a.next24h.limit}` : `all hours over ${a.next24h.limit}`}</small></li>
          </ul>

          <section className="pnl" aria-labelledby="air-chart">
            <h2 id="air-chart" className="pnl__title">Next 48 hours</h2>
            <div role="img" aria-label={`Hourly Indian AQI for ${place.name} over the next 48 hours`}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                  <defs><linearGradient id="airg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={5} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TIP} formatter={(v) => [v, "NAQI"]} />
                  <ReferenceLine y={100} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: "Sensitive limit 100", fill: "var(--ink-3)", fontSize: 11, position: "insideTopRight" }} />
                  <ReferenceLine y={200} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: "Poor above 200", fill: "var(--bad)", fontSize: 11, position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="naqi" stroke="var(--ink)" strokeWidth={2} fill="url(#airg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="ag__cols">
            <section className="pnl" aria-labelledby="air-adv">
              <h2 id="air-adv" className="pnl__title"><HeartPulse size={18} aria-hidden /> What to do</h2>
              <p className="ag__answer">{data.summary}</p>
              <ul className="air__verdicts" role="list">
                <li><strong>Healthy adults</strong><span>{a.verdict.general}</span></li>
                <li className={a.sensitiveMode ? "is-on" : ""}><strong>Sensitive groups{a.sensitiveMode ? " (your notes)" : ""}</strong><span>{a.verdict.sensitive}</span></li>
                {a.mask && <li><strong>Mask</strong><span>{a.mask}</span></li>}
              </ul>
            </section>
            <section className="pnl" aria-labelledby="air-poll">
              <h2 id="air-poll" className="pnl__title">Pollutants now</h2>
              <ul className="air__poll" role="list">
                {POLL.filter(([k]) => Number.isFinite(a.now.pollutants[k])).map(([k, name, u]) => (
                  <li key={k} className={a.now.dominant === k ? "is-dom" : ""}><span>{name}</span><strong>{a.now.pollutants[k]}<small> {u}</small></strong>{a.now.dominant === k && <em>main driver</em>}</li>
                ))}
              </ul>
            </section>
          </div>
          <p className="rs__note"><ShieldCheck size={14} aria-hidden /> {a.caveat} Not a medical or official advisory.</p>
        </>
      )}
    </>
  );
}
