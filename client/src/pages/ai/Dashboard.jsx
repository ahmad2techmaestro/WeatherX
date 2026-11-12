import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Bell, BookOpen, Bot, BrainCircuit, Camera, CloudSun, MessageCircle, Mic, Plane, ShieldCheck, Sparkles, Wind } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { ErrorState, Skeleton } from "../../components/ui/States";
import { errorMessage } from "../../lib/api";

const FEATURES = [
  { to: "/ai/agents", icon: Bot, title: "AI Agent Center", text: "Give a goal; a supervisor picks the right specialist agents and shows its working." },
  { to: "/ai/travel", icon: Plane, title: "AI Travel Planner", text: "Compare destinations and nights by weather, with a score and reasons." },
  { to: "/ai/air", icon: Wind, title: "Air Quality Intelligence", text: "NAQI hour by hour, the cleanest window, and sensitive-group advice." },
  { to: "/ai/alerts", icon: Bell, title: "Smart Alerts", text: "Automations that check in the background and notify you once a day." },
  { to: "/ai/research", icon: BookOpen, title: "Weather Research", text: "Cited answers from a safety guide library, plus the notes the assistant remembers." },
  { to: "/ai/sky", icon: Camera, title: "Sky Check", text: "Photograph the sky and compare it with the forecast cloud cover." },
  { to: "/planner", icon: CloudSun, title: "Weather Intelligence", text: "Heatwave risk, anomalies and sudden changes against ten years of normals." },
  { action: "assistant", icon: MessageCircle, title: "AI Assistant & Voice", text: "Ask in English or Hindi, by typing or speaking. Answers come from the real forecast." },
  { to: "/ai/analytics", icon: Activity, title: "AI Analytics", text: "Your AI usage: speed, errors, tokens, and what the guards blocked." },
];

const openAssistant = () => document.querySelector(".wxa__fab")?.click();
const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - new Date(t)) / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const LABEL = { assistant: "Assistant", agents: "Agent run", prediction: "Weather intelligence", research: "Research", air: "Air quality", travel: "Travel plan", vision: "Sky Check", automation: "Smart Alerts", ai: "Briefing" };

export default function Dashboard() {
  const [s, setS] = useState({ loading: true, error: "", data: null });
  useEffect(() => { document.title = "AI Dashboard — WeatherX"; }, []);
  useEffect(() => {
    const c = new AbortController();
    axios.get("/api/ai-ops/overview", { params: { days: 7 }, signal: c.signal, timeout: 15000 })
      .then((r) => setS({ loading: false, error: "", data: r.data.data }))
      .catch((e) => !axios.isCancel(e) && setS({ loading: false, error: errorMessage(e, "Couldn't load the AI status."), data: null }));
    return () => c.abort();
  }, []);

  const d = s.data;
  const st = d?.status;
  const chips = st && [
    { ok: st.gemini.enabled, label: "Gemini", detail: st.gemini.enabled ? st.gemini.model : "Not configured. Built-in rules answer instead." },
    { ok: true, label: "Search", detail: st.embeddings === "gemini" ? "Gemini embeddings" : "Built-in word matching" },
    { ok: st.ml.healthy, off: !st.ml.enabled, label: "ML service", detail: !st.ml.enabled ? "Optional, not set up" : st.ml.healthy ? "Running" : "Not reachable" },
  ];

  return (
    <>
      <PageHero eyebrow="AI Dashboard" title="Your weather intelligence hub" subtitle="Everything AI in WeatherX in one place: what is switched on, what you have set up, and where to go next." />

      {s.loading && <Skeleton height={140} radius={20} />}
      {s.error && <ErrorState message={s.error} />}

      {d && (
        <>
          <ul className="kpis dash__status" role="list" aria-label="AI system status">
            {chips.map((c) => (
              <li key={c.label} className="kpi">
                <span className="kpi__label"><span className={`dash__dot ${c.off ? "is-off" : c.ok ? "is-on" : "is-warn"}`} aria-hidden /> {c.label}</span>
                <strong className="kpi__text">{c.off ? "Off" : c.ok ? "On" : "Fallback"}</strong>
                <small>{c.detail}</small>
              </li>
            ))}
            <li className="kpi"><span className="kpi__label"><Bell size={14} aria-hidden /> Smart Alerts</span><strong>{d.counts.activeWorkflows ?? "–"}</strong><small>{d.counts.workflows != null ? `active of ${d.counts.workflows} automations` : "unavailable"}</small></li>
            <li className="kpi"><span className="kpi__label"><BrainCircuit size={14} aria-hidden /> Memory</span><strong>{d.counts.memories ?? "–"}</strong><small>notes the assistant may use</small></li>
            <li className="kpi"><span className="kpi__label"><ShieldCheck size={14} aria-hidden /> Blocked (7 d)</span><strong>{d.usage.flagged}</strong><small>risky inputs or replies caught</small></li>
          </ul>
        </>
      )}

      <section aria-labelledby="dash-feat">
        <h2 id="dash-feat" className="dash__h">Explore</h2>
        <ul className="dash__grid" role="list">
          {FEATURES.map(({ to, action, icon: Icon, title, text }) => (
            <li key={title}>
              {to ? (
                <Link className="dash__card" to={to}><Icon size={20} aria-hidden /><strong>{title}</strong><span>{text}</span><ArrowRight size={16} className="dash__go" aria-hidden /></Link>
              ) : (
                <button type="button" className="dash__card" onClick={openAssistant}><Icon size={20} aria-hidden /><strong>{title}</strong><span>{text}</span><span className="dash__go dash__voice"><Mic size={14} aria-hidden /> Open</span></button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {d && (
        <section className="pnl" aria-labelledby="dash-recent">
          <h2 id="dash-recent" className="pnl__title"><Sparkles size={16} aria-hidden /> Recent AI activity</h2>
          {d.recent.length === 0 ? <p className="muted">Nothing yet. Ask the assistant a question or run an agent and it will show up here.</p> : (
            <ul className="dash__recent" role="list">
              {d.recent.slice(0, 8).map((r, i) => (
                <li key={i}>
                  <span>{LABEL[r.feature] || r.feature}</span>
                  <span className={`dash__eng ${r.engine === "gemini" ? "is-ai" : ""}`}>{r.engine === "gemini" ? "Gemini" : "Rules"}</span>
                  <span className="muted">{r.ms} ms</span>
                  {!r.ok && <span className="dash__err">error</span>}
                  {r.flags.length > 0 && <span className="dash__err">guard: {r.flags.join(", ").replaceAll("_", " ")}</span>}
                  <span className="muted dash__when">{ago(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted dash__note">Only timings and labels are kept, never your questions or the answers.</p>
        </section>
      )}
    </>
  );
}
