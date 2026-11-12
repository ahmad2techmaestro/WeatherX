import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { ArrowUp, Mic, MessageCircle, RotateCcw, Sparkles, Volume2, VolumeX, X } from "lucide-react";

import { usePlaces } from "../../context/PlacesContext";
import { useSettings } from "../../context/SettingsContext";
import { errorMessage, callWithRelay } from "../../lib/api";
import { readJson, writeJson } from "../../lib/storage";

const KEY = "wx.assistant.v1";
const LANGS = [
  { id: "auto", label: "Auto" },
  { id: "en", label: "EN" },
  { id: "hi", label: "हिं" },
];
const SUGGESTIONS = {
  en: ["Should I carry an umbrella today?", "Best time to go running?", "Is it safe to travel by bike today?", "What should I wear today?", "Compare today with yesterday"],
  hi: ["क्या आज छाता चाहिए?", "दौड़ने का सबसे अच्छा समय क्या है?", "आज बाइक से जाना सुरक्षित है?", "आज क्या पहनूँ?", "आज का मौसम कल से कैसा है?"],
};

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Floating weather assistant. Voice input/output use the browser's own speech features (feature-detected);
 * nothing is recorded or uploaded by WeatherX - the browser vendor's speech service handles the audio.
 */
/* Floating weather assistant. The conversation (last few turns) is sent with every question so follow-ups
 * like "and tomorrow?" work; it is kept in this browser only. The badge says whether Gemini or the built-in
 * rule engine wrote the answer. Every figure in an answer comes from the real forecast on the server.
 */
export default function AssistantChat() {
  const { place } = usePlaces();
  const { units } = useSettings();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(() => readJson(`${KEY}.lang`, "auto"));
  const [messages, setMessages] = useState(() => {
    const saved = readJson(KEY, []);
    return Array.isArray(saved) ? saved.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-30) : [];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);
  const abort = useRef(null);
  const rec = useRef(null);
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [speak, setSpeak] = useState(() => readJson(`${KEY}.speak`, false) === true);
  useEffect(() => writeJson(`${KEY}.speak`, speak), [speak]);
  useEffect(() => () => { rec.current?.abort?.(); if (canSpeak) window.speechSynthesis.cancel(); }, []);

  useEffect(() => writeJson(KEY, messages.slice(-30)), [messages]);
  useEffect(() => writeJson(`${KEY}.lang`, lang), [lang]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (text) => {
    const q = text.trim();
    if (q.length < 2 || busy) return;

    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    abort.current?.abort();
    abort.current = new AbortController();

    try {
      const { data } = await callWithRelay(() =>
        axios.post(
          "/api/assistant/chat",
          { messages: next.slice(-8).map(({ role, text: t }) => ({ role, text: t })), lat: place.latitude, lon: place.longitude, name: place.name, unit: units.temperature, language: lang },
          { signal: abort.current.signal, timeout: 40000 }
        )
      );
      if (speak && canSpeak) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(data.data.reply);
        u.lang = lang === "hi" || /[\u0900-\u097F]/.test(data.data.reply) ? "hi-IN" : "en-IN";
        window.speechSynthesis.speak(u);
      }
      setMessages((m) => [...m, { role: "assistant", text: data.data.reply, engine: data.data.engine, places: data.data.places, sources: data.data.sources, remembered: data.data.remembered, usedNotes: data.data.usedNotes }]);
    } catch (error) {
      const msg = errorMessage(error, "I couldn't answer that just now. Please try again.");
      if (msg) setMessages((m) => [...m, { role: "assistant", text: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    if (!SR || busy) return;
    if (listening) { rec.current?.stop(); return; }
    setVoiceErr("");
    const r = new SR();
    r.lang = lang === "hi" ? "hi-IN" : "en-IN";
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setInput(t.slice(0, 300));
      if (e.results[e.results.length - 1].isFinal) send(t);
    };
    r.onerror = (e) => setVoiceErr(e.error === "not-allowed" ? "Microphone permission was denied." : e.error === "no-speech" ? "I didn't hear anything." : "Voice input isn't available right now.");
    r.onend = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };

  const chips = SUGGESTIONS[lang === "hi" ? "hi" : "en"];

  return (
    <div className="wxa">
      {open && (
        <section className="wxa__panel" role="dialog" aria-label="WeatherX Assistant">
          <header className="wxa__head">
            <div className="wxa__title">
              <Sparkles size={16} aria-hidden="true" /> <strong>Weather Assistant</strong>
              <span className="wxa__where">{place.name}</span>
            </div>
            <div className="wxa__tools">
              <div className="wxa__lang" role="group" aria-label="Answer language">
                {LANGS.map((l) => (
                  <button key={l.id} type="button" className={lang === l.id ? "is-on" : ""} aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
              {canSpeak && (
                <button type="button" className={`wxa__icon${speak ? " is-on" : ""}`} onClick={() => { if (speak) window.speechSynthesis.cancel(); setSpeak(!speak); }} aria-pressed={speak} aria-label="Read answers aloud" title="Read answers aloud">
                  {speak ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
                </button>
              )}
              {messages.length > 0 && (
                <button type="button" className="wxa__icon" onClick={() => setMessages([])} aria-label="Start a new chat" title="New chat">
                  <RotateCcw size={15} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="wxa__icon" onClick={() => setOpen(false)} aria-label="Close assistant">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="wxa__log" ref={scroller} aria-live="polite">
            {messages.length === 0 && (
              <div className="wxa__welcome">
                <p>{lang === "hi" ? `नमस्ते! मैं ${place.name} के असली मौसम डेटा से जवाब देता हूँ।` : `Hi! I answer from the real forecast for ${place.name}. Ask in English or Hindi.`}</p>
                <div className="wxa__chips">
                  {chips.map((c) => (
                    <button key={c} type="button" onClick={() => send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`wxa__msg wxa__msg--${m.role}${m.error ? " is-error" : ""}`}>
                <p>{m.text}</p>
                {m.role === "assistant" && m.engine && !m.error && (
                  <small>
                    {m.engine === "gemini" ? "AI answer (Gemini)" : "Smart summary"}
                    {m.places?.length ? ` · ${m.places.join(", ")}` : ""}
                    {m.sources?.length ? ` · Source: ${[...new Set(m.sources.map((x) => x.title))].slice(0, 2).join("; ")}` : ""}
                    {m.usedNotes ? " · Personalised" : ""}
                  </small>
                )}
                {m.remembered?.length > 0 && (
                  <small className="wxa__saved">
                    Saved to memory: {m.remembered.map((x) => x.text).join("; ")}. <Link to="/ai/research#memory">Manage</Link>
                  </small>
                )}
              </div>
            ))}
            {busy && (
              <div className="wxa__msg wxa__msg--assistant" aria-label="Thinking">
                <span className="wxa__dots"><i /><i /><i /></span>
              </div>
            )}
          </div>

          <form className="wxa__form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={300} placeholder={lang === "hi" ? "मौसम के बारे में पूछें…" : "Ask about the weather…"} aria-label="Your question" disabled={busy} />
            {SR && (
              <button type="button" className={`wxa__mic${listening ? " is-live" : ""}`} onClick={listen} disabled={busy} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Ask by voice"} title="Ask by voice">
                <Mic size={17} aria-hidden="true" />
              </button>
            )}
            <button type="submit" className="wxa__send" disabled={busy || input.trim().length < 2} aria-label="Send">
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </form>
          {(listening || voiceErr) && <p className="wxa__voice" role="status">{listening ? (lang === "hi" ? "सुन रहा हूँ…" : "Listening…") : voiceErr}</p>}
          <p className="wxa__note">Forecasts are model output, not official warnings.</p>
        </section>
      )}

      <button type="button" className="wxa__fab" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close weather assistant" : "Open weather assistant"} aria-expanded={open}>
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
      </button>
    </div>
  );
}
