import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Bell, CloudRain, Flame, Wind, Thermometer, Zap, TrendingUp, Sunrise, Play, Trash2, Plus, CheckCircle2, CircleDot, TriangleAlert } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { EmptyState, Skeleton } from "../../components/ui/States";
import { usePlaces } from "../../context/PlacesContext";
import { useSettings } from "../../context/SettingsContext";
import { errorMessage } from "../../lib/api";

const ICON = { heatwave: Flame, rain: CloudRain, air: Wind, temperature_above: Thermometer, sudden_change: Zap, anomaly: TrendingUp, briefing: Sunrise };
const STATUS = { triggered: ["Sent", "good"], quiet: ["All clear", "quiet"], skipped: ["Already sent today", "quiet"], error: ["Check failed", "bad"], "": ["Not checked yet", "quiet"] };
const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const hourText = (h) => `${String(h).padStart(2, "0")}:00`;

function ruleText(w, tpl) {
  if (!tpl) return "";
  if (w.kind === "briefing") return `Every day at ${hourText(w.hourLocal)} local time`;
  const opt = tpl.options?.find((o) => o.value === w.threshold);
  if (opt) return opt.label;
  return `At ${w.kind === "temperature_above" ? `${w.threshold}°C` : w.kind === "rain" ? `${w.threshold}% chance of rain` : `NAQI ${w.threshold}`} or more`;
}

function Workflow({ w, tpl, onChange, onDelete }) {
  const Icon = ICON[w.kind] || Bell;
  const [test, setTest] = useState({ busy: false, result: null, error: "" });
  const [label, tone] = STATUS[w.lastResult?.status || ""] || STATUS[""];

  const toggle = () => axios.patch(`/api/automation/workflows/${w.id}`, { enabled: !w.enabled }).then(onChange).catch(() => {});
  const runTest = async () => {
    setTest({ busy: true, result: null, error: "" });
    try {
      const { data } = await axios.post(`/api/automation/workflows/${w.id}/test`, null, { timeout: 60000 });
      setTest({ busy: false, result: data.data, error: "" });
    } catch (e) {
      setTest({ busy: false, result: null, error: errorMessage(e, "The test couldn't run.") });
    }
  };

  return (
    <li className={`sa__item${w.enabled ? "" : " is-off"}`}>
      <span className="sa__icon" aria-hidden><Icon size={20} /></span>
      <div className="sa__main">
        <div className="sa__top">
          <strong>{w.name}</strong>
          <button type="button" role="switch" aria-checked={w.enabled} className="sa__switch" onClick={toggle} aria-label={`${w.enabled ? "Pause" : "Resume"} ${w.name}`}><i /></button>
        </div>
        <p className="muted">{ruleText(w, tpl)} · {w.place.name}</p>
        <p className="sa__status"><span className={`sa__pill sa__pill--${tone}`}>{tone === "good" ? <CheckCircle2 size={12} aria-hidden /> : tone === "bad" ? <TriangleAlert size={12} aria-hidden /> : <CircleDot size={12} aria-hidden />} {label}</span> <small className="muted">Checked {ago(w.lastRunAt)} · sent {w.triggerCount}×</small></p>
        {w.lastResult?.message && <p className="sa__msg">{w.lastResult.message}</p>}
        {test.result && <p className={`sa__test${test.result.wouldNotify ? " is-fire" : ""}`}><strong>{test.result.wouldNotify ? "Would notify:" : "Right now:"}</strong> {test.result.title ? `${test.result.title}. ` : ""}{test.result.message}</p>}
        {test.error && <p className="rs__error" role="alert">{test.error}</p>}
        <div className="sa__actions">
          <button type="button" className="btn" onClick={runTest} disabled={test.busy}><Play size={14} aria-hidden /> {test.busy ? "Checking…" : "Test now"}</button>
          <button type="button" className="btn btn--ghost" onClick={onDelete} aria-label={`Delete ${w.name}`}><Trash2 size={14} aria-hidden /> Delete</button>
        </div>
      </div>
    </li>
  );
}

function Builder({ templates, onCreated, count, max }) {
  const { place, favourites = [] } = usePlaces();
  const { units } = useSettings();
  const [kind, setKind] = useState("rain");
  const [where, setWhere] = useState("current");
  const [value, setValue] = useState(null);
  const [goal, setGoal] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const tpl = templates.find((t) => t.kind === kind);
  const places = [{ key: "current", ...place }, ...favourites.filter((f) => f.name !== place.name).slice(0, 8).map((f, i) => ({ key: `f${i}`, ...f }))];
  const chosen = places.find((p) => p.key === where) || places[0];
  const v = value ?? tpl?.default;

  const create = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await axios.post("/api/automation/workflows", { kind, place: { name: chosen.name, latitude: chosen.latitude, longitude: chosen.longitude }, unit: units.temperature, threshold: kind === "briefing" ? undefined : Number(v), hourLocal: kind === "briefing" ? Number(v) : undefined, goal: goal || undefined }, { timeout: 15000 });
      setState({ busy: false, error: "" });
      setGoal("");
      onCreated();
    } catch (err) {
      setState({ busy: false, error: errorMessage(err, "Couldn't create the automation.") });
    }
  };

  return (
    <section className="pnl sa__builder" aria-labelledby="sa-add">
      <h2 id="sa-add" className="pnl__title"><Plus size={18} aria-hidden /> Add an automation</h2>
      <div className="sa__tpls" role="radiogroup" aria-label="Automation type">
        {templates.map((t) => {
          const Icon = ICON[t.kind] || Bell;
          return (
            <button key={t.kind} type="button" role="radio" aria-checked={kind === t.kind} className={kind === t.kind ? "is-on" : ""} onClick={() => { setKind(t.kind); setValue(null); }}>
              <Icon size={18} aria-hidden /> <strong>{t.title}</strong>
            </button>
          );
        })}
      </div>
      {tpl && (
        <form onSubmit={create} className="sa__form">
          <p className="muted">{tpl.description}</p>
          <div className="tp__fields">
            <div className="tp__field">
              <label htmlFor="sa-place">Place</label>
              <select id="sa-place" value={where} onChange={(e) => setWhere(e.target.value)}>{places.map((p) => <option key={p.key} value={p.key}>{p.name}{p.key === "current" ? " (current)" : ""}</option>)}</select>
            </div>
            <div className="tp__field">
              <label htmlFor="sa-val">{tpl.kind === "briefing" ? "Send at (local time)" : tpl.options ? "Notify at" : `Threshold (${tpl.unitLabel})`}</label>
              {tpl.options ? (
                <select id="sa-val" value={v} onChange={(e) => setValue(Number(e.target.value))}>{tpl.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : tpl.kind === "briefing" ? (
                <select id="sa-val" value={v} onChange={(e) => setValue(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourText(h)}</option>)}</select>
              ) : (
                <input id="sa-val" type="number" min={tpl.min} max={tpl.max} value={v} onChange={(e) => setValue(e.target.value)} />
              )}
            </div>
            <button type="submit" className="btn btn--primary tp__go" disabled={state.busy || count >= max}>{state.busy ? "Adding…" : "Add automation"}</button>
          </div>
          {tpl.kind === "briefing" && (
            <div className="tp__field"><label htmlFor="sa-goal">What should the briefing cover? (optional)</label><input id="sa-goal" className="sa__goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} placeholder="Default: a morning briefing for today" /></div>
          )}
          {count >= max && <p className="rs__error">You have reached the limit of {max} automations.</p>}
          {state.error && <p className="rs__error" role="alert">{state.error}</p>}
        </form>
      )}
    </section>
  );
}

export default function SmartAlerts() {
  const [templates, setTemplates] = useState([]);
  const [max, setMax] = useState(8);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => axios.get("/api/automation/workflows", { timeout: 12000 }).then((r) => { setItems(r.data.data); setError(""); }).catch((e) => { setError(errorMessage(e, "Couldn't load your automations.")); setItems([]); }), []);
  useEffect(() => {
    document.title = "Smart Alerts — WeatherX";
    axios.get("/api/automation/templates", { timeout: 12000 }).then((r) => { setTemplates(r.data.data.templates); setMax(r.data.data.max); }).catch(() => {});
    load();
  }, [load]);

  const remove = (id) => axios.delete(`/api/automation/workflows/${id}`).then(load).catch((e) => setError(errorMessage(e)));

  return (
    <>
      <PageHero eyebrow="Smart Alerts" title="Automations that watch for you" subtitle="Pick what matters. A background job checks real forecasts every 30 minutes and notifies you through the channels you turned on, at most once a day per automation." />
      <section className="pnl" aria-labelledby="sa-list">
        <h2 id="sa-list" className="pnl__title"><Bell size={18} aria-hidden /> Your automations {items && <span className="rs__chip">{items.length}/{max}</span>}</h2>
        {error && <p className="rs__error" role="alert">{error}</p>}
        {!items && <Skeleton height={120} radius={16} />}
        {items?.length === 0 && !error && <EmptyState icon={<Bell />} title="No automations yet" message="Add one below, then use Test now to see what it would do with today's data." />}
        {items?.length > 0 && (
          <ul className="sa__list" role="list">
            {items.map((w) => <Workflow key={w.id} w={w} tpl={templates.find((t) => t.kind === w.kind)} onChange={load} onDelete={() => remove(w.id)} />)}
          </ul>
        )}
      </section>
      {templates.length > 0 && <Builder templates={templates} onCreated={load} count={items?.length ?? 0} max={max} />}
      <p className="rs__note"><TriangleAlert size={14} aria-hidden /> Alerts come from model forecasts and statistics, not official warnings. Notifications use the channels in your settings; with none enabled, checks still run but nothing is sent.</p>
    </>
  );
}
