import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowUp, Sparkles } from "lucide-react";

import { errorMessage } from "../../lib/api";

const SUGGESTIONS = ["Do I need an umbrella today?", "Best time for a run?", "Is the air safe outside?", "What should I wear?", "How does the week look?"];

/**
 * Today's briefing plus a question box. The text always comes from the real forecast: from Claude when
 * the server has a key, otherwise from the rule engine. The badge tells which one wrote it.
 */
export default function Briefing({ place, unit }) {
  const [brief, setBrief] = useState(null);
  const [briefError, setBriefError] = useState("");
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState(null); // { question, text, source } | { question, loading } | { question, error }
  const abort = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    setBrief(null);
    setBriefError("");
    setThread(null);
    axios
      .get("/api/ai/briefing", { params: { lat: place.latitude, lon: place.longitude, name: place.name, unit }, signal: controller.signal, timeout: 20000 })
      .then(({ data }) => setBrief(data.data))
      .catch((error) => {
        if (!axios.isCancel(error)) setBriefError(errorMessage(error, "The briefing isn't available right now."));
      });

    return () => controller.abort();
  }, [place.latitude, place.longitude, place.name, unit]);

  const ask = async (text) => {
    const q = text.trim();

    if (q.length < 3) return;

    abort.current?.abort();
    abort.current = new AbortController();
    setQuestion("");
    setThread({ question: q, loading: true });

    try {
      const { data } = await axios.post("/api/ai/ask", { lat: place.latitude, lon: place.longitude, name: place.name, unit, question: q }, { signal: abort.current.signal, timeout: 25000 });

      setThread({ question: q, ...data.data });
    } catch (error) {
      if (!axios.isCancel(error)) setThread({ question: q, error: errorMessage(error, "That question couldn't be answered. Please try again.") });
    }
  };

  const badge = (source) => (source === "claude" ? "AI briefing" : "Smart summary");

  return (
    <section className="card briefing" aria-labelledby="brief-title">
      <div className="briefing__head">
        <h2 id="brief-title" className="card__title">
          {brief?.headline || "Today's briefing"}
        </h2>
        {brief && (
          <span className={`briefing__badge ${brief.source === "claude" ? "is-ai" : ""}`}>
            <Sparkles size={13} aria-hidden="true" /> {badge(brief.source)}
          </span>
        )}
      </div>

      {briefError ? <p className="muted">{briefError}</p> : brief ? <p className="briefing__text">{brief.text}</p> : <div className="skeleton briefing__skeleton" aria-label="Preparing your briefing" />}

      <form
        className="briefing__ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder={`Ask about the weather in ${place.name}`} aria-label="Ask a weather question" />
        <button type="submit" className="briefing__send" aria-label="Ask" disabled={question.trim().length < 3}>
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>

      {!thread && (
        <div className="briefing__chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="briefing__chip" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {thread && (
        <div className="briefing__answer" role="status" aria-live="polite">
          <p className="briefing__q">{thread.question}</p>
          {thread.loading ? <div className="skeleton briefing__skeleton" /> : thread.error ? <p className="muted">{thread.error}</p> : <p className="briefing__text">{thread.text}</p>}
          {!thread.loading && (
            <button type="button" className="link-btn" onClick={() => setThread(null)}>
              Ask something else
            </button>
          )}
        </div>
      )}
    </section>
  );
}
