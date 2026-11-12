import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BookOpen, BrainCircuit, Search, Sparkles, Trash2, ShieldCheck } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { EmptyState } from "../../components/ui/States";
import { errorMessage } from "../../lib/api";

const KIND = { health: "Health", routine: "Routine", preference: "Preference", note: "Note" };

/** Answers weather-safety questions from a curated knowledge base, with the sources shown. */
function Ask({ status }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ busy: false, error: "", data: null, asked: "" });
  const abort = useRef(null);

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (question.length < 3 || state.busy) return;
    setQ(question);
    abort.current?.abort();
    abort.current = new AbortController();
    setState({ busy: true, error: "", data: null, asked: question });
    try {
      const { data } = await axios.post("/api/research/ask", { question }, { signal: abort.current.signal, timeout: 40000 });
      setState({ busy: false, error: "", data: data.data, asked: question });
    } catch (error) {
      const msg = errorMessage(error, "Couldn't search just now. Please try again.");
      if (msg) setState({ busy: false, error: msg, data: null, asked: question });
    }
  };

  const d = state.data;

  return (
    <section className="pnl rs" aria-labelledby="rs-ask">
      <div className="rs__head">
        <h2 id="rs-ask" className="pnl__title"><BookOpen size={18} aria-hidden /> Ask the knowledge base</h2>
        {status && <span className="rs__chip">{status.documents} guides · {status.embeddings === "gemini" ? "semantic search" : "keyword search"}</span>}
      </div>
      <form className="rs__form" onSubmit={(e) => { e.preventDefault(); ask(); }} role="search">
        <Search size={18} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How do I recognise heat stroke?" maxLength={300} aria-label="Question" />
        <button type="submit" className="btn btn--primary" disabled={state.busy || q.trim().length < 3}>{state.busy ? "Searching…" : "Ask"}</button>
      </form>

      {!d && !state.busy && !state.error && (
        <div className="rs__examples">
          {(status?.examples || []).map((e) => <button key={e} type="button" onClick={() => ask(e)}>{e}</button>)}
        </div>
      )}
      {state.busy && <p className="muted" role="status">Looking through the guides…</p>}
      {state.error && <p className="rs__error" role="alert">{state.error}</p>}

      {d && (
        <div className="rs__result">
          <div className="rs__answer">
            <span className={`pred__badge${d.engine === "gemini" ? " is-ai" : ""}`}><Sparkles size={12} aria-hidden /> {d.engine === "gemini" ? "Explained by Gemini from the sources" : d.found ? "Passage from the guides" : "No source found"}</span>
            <p>{d.answer}</p>
            {d.notes?.length > 0 && <small className="muted">Personalised with your notes: {d.notes.map((n) => n.text).join("; ")}</small>}
          </div>
          {d.sources.length > 0 && (
            <ol className="rs__sources" aria-label="Sources">
              {d.sources.map((s) => (
                <li key={s.id} className={s.cited ? "is-cited" : ""}>
                  <span className="rs__n">{s.n}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.topic} · {s.source}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <p className="rs__note"><ShieldCheck size={14} aria-hidden /> General safety information from summarised public guidance, not official advisories or medical advice.</p>
    </section>
  );
}

/** Everything WeatherX remembers about you, with a delete button on each item. */
function Memory() {
  const [items, setItems] = useState(null);
  const [max, setMax] = useState(40);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { data } = await axios.get("/api/memory", { timeout: 12000 });
      setItems(data.data.items);
      setMax(data.data.max);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (text.trim().length < 4) return;
    setError("");
    try {
      await axios.post("/api/memory", { text }, { timeout: 12000 });
      setText("");
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async (id) => {
    setItems((list) => list.filter((m) => m.id !== id));
    try { await axios.delete(`/api/memory/${id}`, { timeout: 12000 }); } catch (e) { setError(errorMessage(e)); load(); }
  };

  return (
    <section className="pnl rs" id="memory" aria-labelledby="rs-mem">
      <div className="rs__head">
        <h2 id="rs-mem" className="pnl__title"><BrainCircuit size={18} aria-hidden /> What WeatherX remembers</h2>
        {items && <span className="rs__chip">{items.length}/{max}</span>}
      </div>
      <p className="muted rs__lead">Facts you share, like "I have asthma" or "I commute by bike", are used to tailor answers. Only what you say plainly is saved. Delete anything anytime.</p>
      <form className="rs__form" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note, e.g. I run in the morning" maxLength={160} aria-label="New memory" />
        <button type="submit" className="btn" disabled={text.trim().length < 4}>Save</button>
      </form>
      {error && <p className="rs__error" role="alert">{error}</p>}
      {items && items.length === 0 && <EmptyState icon={<BrainCircuit />} title="Nothing saved yet" message="Tell the assistant something about yourself, or add a note above." />}
      {items?.length > 0 && (
        <ul className="rs__mem" role="list">
          {items.map((m) => (
            <li key={m.id}>
              <span className={`rs__kind rs__kind--${m.kind}`}>{KIND[m.kind] || "Note"}</span>
              <span className="rs__text">{m.text}</span>
              <button type="button" className="icon-btn" onClick={() => remove(m.id)} aria-label={`Delete memory: ${m.text}`}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Research() {
  const [status, setStatus] = useState(null);
  useEffect(() => { axios.get("/api/research/status", { timeout: 12000 }).then((r) => setStatus(r.data.data)).catch(() => {}); }, []);

  return (
    <>
      <PageHero eyebrow="Weather Research" title="Ask, with sources" subtitle="Safety and weather guidance retrieved from a curated knowledge base. Every answer shows where it came from." />
      <div className="rs__layout">
        <Ask status={status} />
        <Memory />
      </div>
    </>
  );
}
