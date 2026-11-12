import { useEffect, useState } from "react";
import axios from "axios";
import { Backpack, CalendarDays, MapPin, Plane, Plus, Sparkles, TriangleAlert, X } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { Segmented } from "../../components/ui/States";
import { usePlaces } from "../../context/PlacesContext";
import { useSettings } from "../../context/SettingsContext";
import { errorMessage, callWithRelay } from "../../lib/api";
import { tempLabel } from "../../lib/units";

const NIGHTS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}` }));
const tone = (v) => ({ Great: "great", Good: "good", Fair: "fair", Poor: "poor" })[v] || "fair";
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const todayISO = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);

function Score({ value, verdict }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className={`tp__score tp__score--${tone(verdict)}`} role="img" aria-label={`Score ${value} out of 100, ${verdict}`}>
      <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r={r} className="tp__ring" /><circle cx="32" cy="32" r={r} className="tp__arc" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 32 32)" /></svg>
      <strong>{value}</strong>
    </div>
  );
}

function PlanCard({ p, units, best }) {
  if (p.error) return <article className="pnl tp__card"><h3><MapPin size={16} aria-hidden /> {p.place}</h3><p className="rs__error">{p.error}</p></article>;
  return (
    <article className={`pnl tp__card${best ? " is-best" : ""}`}>
      <header className="tp__head">
        <Score value={p.score} verdict={p.verdict} />
        <div>
          <h3><MapPin size={16} aria-hidden /> {p.place}{best && <span className="tp__best">Best pick</span>}</h3>
          <p className="muted">{p.verdict} for {dayLabel(p.startDate)} to {dayLabel(p.endDate)}</p>
        </div>
      </header>
      <ol className="tp__days" aria-label={`Day by day for ${p.place}`}>
        {p.days.map((d) => (
          <li key={d.date} className={`tp__day tp__day--${tone(d.verdict)}${d.date === p.best.date && p.days.length > 1 ? " is-top" : ""}`}>
            <small>{dayLabel(d.date)}</small>
            <strong>{tempLabel(d.high, units)}</strong>
            <span className="muted">{tempLabel(d.low, units)}</span>
            <span>{d.rainChance}% rain</span>
            <i className="tp__bar" style={{ "--w": `${d.score}%` }} aria-hidden />
            <small className="tp__verdict">{d.verdict} · {d.score}</small>
          </li>
        ))}
      </ol>
      {p.hazards.length > 0 && <p className="tp__haz"><TriangleAlert size={14} aria-hidden /> {p.hazards.join("; ")}</p>}
      <p className="tp__pack"><Backpack size={14} aria-hidden /> {p.packing.join(" · ")}</p>
      {!p.airCoverage && <small className="muted">Air quality is not part of this score for these dates.</small>}
    </article>
  );
}

export default function Travel() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const [dest, setDest] = useState(["Jaipur"]);
  const [draft, setDraft] = useState("");
  const [nights, setNights] = useState(2);
  const [start, setStart] = useState("");
  const [state, setState] = useState({ busy: false, error: "", data: null });

  useEffect(() => { document.title = "Travel Planner — WeatherX"; }, []);

  const add = () => {
    const v = draft.trim();
    if (v.length < 2 || dest.length >= 3 || dest.some((d) => d.toLowerCase() === v.toLowerCase())) return;
    setDest([...dest, v]);
    setDraft("");
  };

  const plan = async (e) => {
    e?.preventDefault();
    const list = draft.trim().length >= 2 && dest.length < 3 ? [...dest, draft.trim()] : dest;
    if (!list.length) return setState({ busy: false, error: "Add at least one destination.", data: null });
    if (list !== dest) { setDest(list); setDraft(""); }
    setState({ busy: true, error: "", data: null });
    try {
      const { data } = await callWithRelay(() => axios.post("/api/travel/plan", { destinations: list, nights, startDate: start || undefined, unit: units.temperature, lat: place.latitude, lon: place.longitude, name: place.name }, { timeout: 45000 }));
      setState({ busy: false, error: "", data: data.data });
    } catch (err) {
      setState({ busy: false, error: errorMessage(err, "Couldn't build the plan. Please try again."), data: null });
    }
  };

  const d = state.data;

  return (
    <>
      <PageHero eyebrow="AI Travel Planner" title="Pick the right days to go" subtitle="Compare up to three destinations. Every day is scored from the forecast with clear reasons, then you get a packing list." />
      <form className="pnl tp" onSubmit={plan}>
        <h2 className="pnl__title"><Plane size={18} aria-hidden /> Your trip</h2>
        <div className="tp__fields">
          <div className="tp__field tp__field--wide">
            <label htmlFor="tp-d">Destinations (up to 3)</label>
            <div className="tp__chips">
              {dest.map((x) => <span key={x} className="tp__chip">{x}<button type="button" onClick={() => setDest(dest.filter((y) => y !== x))} aria-label={`Remove ${x}`}><X size={12} /></button></span>)}
              {dest.length < 3 && (
                <span className="tp__add">
                  <input id="tp-d" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add a place" maxLength={60} />
                  <button type="button" onClick={add} aria-label="Add destination" disabled={draft.trim().length < 2}><Plus size={14} /></button>
                </span>
              )}
            </div>
          </div>
          <div className="tp__field"><label>Nights</label><Segmented label="Nights" options={NIGHTS} value={nights} onChange={setNights} size="sm" /></div>
          <div className="tp__field"><label htmlFor="tp-s"><CalendarDays size={13} aria-hidden /> Start date (optional)</label><input id="tp-s" type="date" min={todayISO()} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <button type="submit" className="btn btn--primary tp__go" disabled={state.busy}>{state.busy ? "Planning…" : "Plan my trip"}</button>
        </div>
        {state.error && <p className="rs__error" role="alert">{state.error}</p>}
      </form>

      {d && (
        <>
          <section className="pnl rs__answer tp__story" aria-label="Summary">
            <span className={`pred__badge${d.narrative.engine === "gemini" ? " is-ai" : ""}`}><Sparkles size={12} aria-hidden /> {d.narrative.engine === "gemini" ? "Written by Gemini from the scores" : "Summary from the scores"}</span>
            <p className="ag__answer">{d.narrative.text}</p>
          </section>
          <div className="tp__grid">
            {d.plans.map((p) => <PlanCard key={p.place} p={p} units={units} best={d.ranking.length > 1 && d.ranking[0] === p.place} />)}
          </div>
          <p className="rs__note"><TriangleAlert size={14} aria-hidden /> Scores are guidance from model forecasts. Check again before you travel.</p>
        </>
      )}
    </>
  );
}
