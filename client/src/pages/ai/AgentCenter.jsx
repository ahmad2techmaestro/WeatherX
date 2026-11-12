import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { AlertTriangle, Bot, CheckCircle2, Clock, Network, Send, Sparkles } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { usePlaces } from "../../context/PlacesContext";
import { useSettings } from "../../context/SettingsContext";
import { errorMessage } from "../../lib/api";

const EXAMPLES = [
  "Is the air safe for a run, and will it rain later?",
  "Plan a weekend trip to Jaipur or Shimla",
  "Is a heatwave coming and how do I stay safe?",
  "How do I recognise heat stroke?",
];
const ICON = { supervisor: Network, synthesizer: Sparkles };

function Step({ s }) {
  const Icon = ICON[s.agent] || Bot;
  const bad = s.status === "error";
  return (
    <li className={`ag__step${bad ? " is-bad" : ""}`}>
      <span className="ag__dot" aria-hidden>{bad ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}</span>
      <div className="ag__stepbody">
        <div className="ag__steptitle">
          <Icon size={15} aria-hidden /> <strong>{s.name}</strong>
          {s.engine && <span className="ag__tag">{s.engine === "gemini" ? "Gemini" : "Rules"}</span>}
          <span className="ag__ms"><Clock size={12} aria-hidden /> {s.ms} ms</span>
        </div>
        {s.agent === "supervisor" && <p>{s.reason} Called: {s.plan.agents.join(", ")}{s.plan.places?.length ? ` · places: ${s.plan.places.join(", ")}` : ""}.</p>}
        {s.summary && <p>{s.summary}</p>}
        {bad && <p>{s.error}</p>}
      </div>
    </li>
  );
}

export default function AgentCenter() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const [info, setInfo] = useState(null);
  const [goal, setGoal] = useState("");
  const [state, setState] = useState({ busy: false, error: "", run: null });
  const [history, setHistory] = useState([]);
  const abort = useRef(null);

  const load = () => {
    axios.get("/api/agents", { timeout: 12000 }).then((r) => setInfo(r.data.data)).catch(() => {});
    axios.get("/api/agents/runs", { timeout: 12000 }).then((r) => setHistory(r.data.data)).catch(() => {});
  };
  useEffect(() => { document.title = "Agent Center — WeatherX"; load(); }, []);

  const go = async (text) => {
    const g = (text ?? goal).trim();
    if (g.length < 3 || state.busy) return;
    setGoal(g);
    abort.current?.abort();
    abort.current = new AbortController();
    setState({ busy: true, error: "", run: null });
    try {
      const { data } = await axios.post("/api/agents/run", { goal: g, lat: place.latitude, lon: place.longitude, name: place.name, unit: units.temperature }, { signal: abort.current.signal, timeout: 60000 });
      setState({ busy: false, error: "", run: data.data });
      load();
    } catch (e) {
      const msg = errorMessage(e, "The agents couldn't finish. Please try again.");
      if (msg) setState({ busy: false, error: msg, run: null });
    }
  };

  const { run } = state;

  return (
    <>
      <PageHero eyebrow="AI Agent Center" title="A team of weather agents" subtitle="Give a goal. A supervisor picks specialist agents, they fetch real data in parallel, and one answer comes back with the full trace." meta={[place.name, info && `${info.framework} · ${info.engine === "gemini" ? "Gemini routing" : "rule routing"}`]} />

      <section className="pnl ag" aria-labelledby="ag-goal">
        <h2 id="ag-goal" className="pnl__title"><Bot size={18} aria-hidden /> Your goal</h2>
        <form className="rs__form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={`e.g. Plan a trip to Goa this weekend`} maxLength={300} aria-label="Goal" />
          <button type="submit" className="btn btn--primary" disabled={state.busy || goal.trim().length < 3}><Send size={15} aria-hidden /> {state.busy ? "Working…" : "Run"}</button>
        </form>
        {!run && !state.busy && <div className="rs__examples">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => go(e)}>{e}</button>)}</div>}
        {state.busy && <p className="muted" role="status">The supervisor is choosing agents…</p>}
        {state.error && <p className="rs__error" role="alert">{state.error}</p>}

        {run && (
          <div className="ag__run">
            <div className="rs__answer">
              <span className={`pred__badge${run.engine === "gemini" ? " is-ai" : ""}`}><Sparkles size={12} aria-hidden /> {run.engine === "gemini" ? "Merged by Gemini" : "Combined from the agents"} · {run.steps.filter((s) => s.agent !== "supervisor" && s.agent !== "synthesizer").length} agents · {run.ms} ms</span>
              <p className="ag__answer">{run.answer}</p>
              {run.usedNotes > 0 && <small className="muted">Personalised with your saved notes.</small>}
            </div>
            <h3 className="ag__h">Agent trace</h3>
            <ol className="ag__steps" aria-label="Agent trace">{run.steps.map((s) => <Step key={s.agent} s={s} />)}</ol>
          </div>
        )}
      </section>

      <div className="ag__cols">
        <section className="pnl" aria-labelledby="ag-team">
          <h2 id="ag-team" className="pnl__title">The team</h2>
          <ul className="ag__team" role="list">
            {(info?.agents || []).map((a) => {
              const st = info.stats.agents[a.key];
              return (
                <li key={a.key}>
                  <strong>{a.name}</strong>
                  <p>{a.role}</p>
                  <small>Tools: {a.tools.join(" · ")}</small>
                  <small className="ag__stat">{st ? `${st.runs} ${st.runs === 1 ? "run" : "runs"} · ${st.avgMs} ms avg${st.errors ? ` · ${st.errors} errors` : ""}` : "Not used yet"}</small>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="pnl" aria-labelledby="ag-hist">
          <h2 id="ag-hist" className="pnl__title">Recent runs</h2>
          {history.length === 0 && <p className="muted">Runs appear here (kept until the server restarts).</p>}
          <ul className="ag__hist" role="list">
            {history.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => { setGoal(h.goal); setState({ busy: false, error: "", run: h }); }}>
                  <strong>{h.goal}</strong>
                  <small>{h.plan.agents.join(" + ")} · {h.ms} ms · {new Date(h.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
