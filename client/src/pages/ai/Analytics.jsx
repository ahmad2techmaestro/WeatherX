import { useEffect, useState } from "react";
import axios from "axios";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Gauge, ShieldCheck, Sparkles, Timer } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { ErrorState, Skeleton } from "../../components/ui/States";
import { errorMessage } from "../../lib/api";

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };
const TIP = { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12 };
const NAME = { assistant: "Assistant", agents: "Agents", prediction: "Weather intelligence", research: "Research", air: "Air quality", travel: "Travel", vision: "Sky Check", automation: "Smart Alerts", ai: "Briefing" };
const fmt = (n) => (n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const ms = (n) => (n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

export default function AiAnalytics() {
  const [days, setDays] = useState(7);
  const [s, setS] = useState({ loading: true, error: "", data: null });
  useEffect(() => { document.title = "AI Analytics — WeatherX"; }, []);
  useEffect(() => {
    const c = new AbortController();
    setS((x) => ({ ...x, loading: true, error: "" }));
    axios.get("/api/ai-ops/overview", { params: { days }, signal: c.signal, timeout: 15000 })
      .then((r) => setS({ loading: false, error: "", data: r.data.data }))
      .catch((e) => !axios.isCancel(e) && setS({ loading: false, error: errorMessage(e, "Couldn't load analytics."), data: null }));
    return () => c.abort();
  }, [days]);

  const u = s.data?.usage;
  const rows = (u?.series || []).map((p) => ({ label: p.date.slice(5), requests: p.requests }));

  return (
    <>
      <PageHero eyebrow="AI Analytics" title="How the AI is performing" subtitle="Your own usage: how fast answers are, how often Gemini was used, errors, tokens, and what the safety guards caught.">
        <div className="sa__seg" role="group" aria-label="Time range">
          {[7, 14, 30].map((n) => <button key={n} type="button" className={days === n ? "is-on" : ""} aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>)}
        </div>
      </PageHero>

      {s.loading && !u && <Skeleton height={220} radius={20} />}
      {s.error && <ErrorState message={s.error} />}

      {u && (
        <>
          <ul className="kpis kpis--5" role="list">
            <li className="kpi"><span className="kpi__label"><Activity size={14} aria-hidden /> Requests</span><strong>{fmt(u.total)}</strong><small>last {u.days} days</small></li>
            <li className="kpi"><span className="kpi__label"><Timer size={14} aria-hidden /> Typical speed</span><strong className="kpi__text">{ms(u.p50)}</strong><small>slowest 5%: {ms(u.p95)}</small></li>
            <li className="kpi"><span className="kpi__label"><AlertTriangle size={14} aria-hidden /> Errors</span><strong>{u.total ? `${Math.round((u.errors / u.total) * 100)}%` : "–"}</strong><small>{u.errors} failed requests</small></li>
            <li className="kpi"><span className="kpi__label"><Sparkles size={14} aria-hidden /> Gemini share</span><strong>{u.total ? `${Math.round((u.geminiRequests / u.total) * 100)}%` : "–"}</strong><small>{u.geminiCalls} model calls{u.geminiErrors ? `, ${u.geminiErrors} failed` : ""}</small></li>
            <li className="kpi"><span className="kpi__label"><Gauge size={14} aria-hidden /> Tokens</span><strong>{fmt(u.promptTokens + u.outputTokens)}</strong><small>{fmt(u.promptTokens)} in, {fmt(u.outputTokens)} out</small></li>
          </ul>

          <section className="pnl" aria-labelledby="an-chart">
            <h2 id="an-chart" className="pnl__title">Requests per day</h2>
            {u.total === 0 ? <p className="muted">No AI requests in this period yet.</p> : (
              <div role="img" aria-label={`Daily AI requests over the last ${u.days} days`}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                    <defs><linearGradient id="ang" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TIP} />
                    <Area type="monotone" dataKey="requests" name="Requests" stroke="var(--accent)" strokeWidth={2.4} fill="url(#ang)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="pnl" aria-labelledby="an-feat">
            <h2 id="an-feat" className="pnl__title">By feature</h2>
            <div className="an__wrap">
              <table className="an__table">
                <thead><tr><th>Feature</th><th>Requests</th><th>Typical</th><th>Slowest 5%</th><th>Errors</th><th>Gemini / Rules</th><th>Tokens</th></tr></thead>
                <tbody>
                  {u.byFeature.map((f) => (
                    <tr key={f.feature}><th scope="row">{NAME[f.feature] || f.feature}</th><td>{f.requests}</td><td>{ms(f.p50)}</td><td>{ms(f.p95)}</td><td className={f.errors ? "an__bad" : ""}>{f.errors}</td><td>{f.gemini} / {f.rules}</td><td>{fmt(f.tokens)}</td></tr>
                  ))}
                  {u.byFeature.length === 0 && <tr><td colSpan={7} className="muted">No data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pnl an__guard" aria-labelledby="an-guard">
            <h2 id="an-guard" className="pnl__title"><ShieldCheck size={16} aria-hidden /> Safety guards</h2>
            <p>{u.flagged === 0 ? "Nothing needed blocking in this period." : `${u.flagged} request${u.flagged === 1 ? "" : "s"} triggered a guard (an instruction-like input, a hostile saved note, or a reply that echoed internal instructions). The app answered from its built-in rules instead.`}</p>
            <p className="muted">Token counts come from Gemini's own usage report. Cost is not shown because prices differ by model and change over time. Data is kept for 30 days and holds no question or answer text.</p>
          </section>
        </>
      )}
    </>
  );
}
