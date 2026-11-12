import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, CloudRain, Cpu, Flame, Sparkles, TrendingDown, TrendingUp, Wind } from "lucide-react";

import { errorMessage, isCanceled, callWithRelay } from "../../lib/api";
import { clockLabel, dayMonth } from "../../lib/format";
import { readJson, writeJson } from "../../lib/storage";

const LEVEL = {
  none: { tone: "great", en: "No risk", hi: "कोई खतरा नहीं" },
  watch: { tone: "fair", en: "Watch", hi: "नज़र रखें" },
  heatwave: { tone: "poor", en: "Heatwave likely", hi: "लू की संभावना" },
  severe: { tone: "poor", en: "Severe heatwave", hi: "भीषण लू" },
};
const SUDDEN = {
  temperature: { en: "Sharp temperature swing", hi: "तापमान में तेज़ बदलाव" },
  pressure: { en: "Fast pressure fall", hi: "दबाव में तेज़ गिरावट" },
  wind: { en: "Strong gusts", hi: "तेज़ झोंके" },
  rain: { en: "Sudden heavy rain", hi: "अचानक तेज़ बारिश" },
  thunderstorm: { en: "Thunderstorm", hi: "आंधी-तूफ़ान" },
};
const T = {
  title: { en: "Prediction & anomalies", hi: "पूर्वानुमान और असामान्यताएँ" },
  heat: { en: "Heatwave risk", hi: "लू का खतरा" },
  vs: { en: "Hottest day vs normal", hi: "सबसे गर्म दिन बनाम सामान्य" },
  trend: { en: "Recent trend", hi: "हाल का रुझान" },
  rain: { en: "Rain this week", hi: "इस हफ़्ते बारिश" },
  sudden: { en: "Sudden changes (48 h)", hi: "अचानक बदलाव (48 घंटे)" },
  chart: { en: "Daily high against the usual range for this time of year", hi: "साल के इस समय की सामान्य सीमा के मुकाबले दैनिक अधिकतम" },
};

/** Daily highs against the usual range (10th to 90th percentile) and the average, in the user's unit. */
function NormalChart({ rows, deg, lang }) {
  const w = 640, h = 220, pad = { l: 38, r: 12, t: 14, b: 28 };
  const vals = rows.flatMap((r) => [r.max, r.p10, r.p90, r.normal]).filter(Number.isFinite);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / (rows.length - 1);
  const y = (v) => pad.t + ((hi - v) * (h - pad.t - pad.b)) / (hi - lo);
  const hasBand = rows.every((r) => Number.isFinite(r.p10) && Number.isFinite(r.p90));
  const band = hasBand ? `${rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.p90)}`).join(" ")} ${[...rows].reverse().map((r, i) => `L${x(rows.length - 1 - i)},${y(r.p10)}`).join(" ")} Z` : null;
  const line = (key) => rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[key])}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 3));
  const label = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", timeZone: "UTC" });

  return (
    <figure className="pred__chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={T.chart[lang]}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="pred__grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="pred__axis">{t}{deg}</text>
          </g>
        ))}
        {band && <path d={band} className="pred__band" />}
        {hasBand && <path d={line("normal")} className="pred__normal" fill="none" />}
        <path d={line("max")} className="pred__line" fill="none" />
        {rows.map((r, i) => (
          <g key={r.date}>
            <circle cx={x(i)} cy={y(r.max)} r={r.z !== null && Math.abs(r.z) >= 1.5 ? 6 : 4} className={`pred__dot ${r.z !== null && Math.abs(r.z) >= 1.5 ? (r.z > 0 ? "is-warm" : "is-cool") : ""}`}>
              <title>{`${r.date}: ${r.max}${deg}${r.normal !== null ? ` (usual ${r.normal}${deg})` : ""}`}</title>
            </circle>
            <text x={x(i)} y={h - 8} textAnchor="middle" className="pred__axis">{label(r.date)}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="pred__key pred__key--line" /> {lang === "hi" ? "पूर्वानुमान" : "Forecast high"}
        {hasBand && (<><span className="pred__key pred__key--band" /> {lang === "hi" ? "सामान्य सीमा (10–90%)" : "Usual range (10th to 90th percentile)"}<span className="pred__key pred__key--normal" /> {lang === "hi" ? "औसत" : "Average"}</>)}
      </figcaption>
    </figure>
  );
}

const ML_TEXT = {
  both_normal: { en: () => "ML cross-check: the multivariate model also sees nothing unusual in the next week.", hi: () => "ML जाँच: मल्टीवेरिएट मॉडल को भी अगले हफ़्ते में कुछ असामान्य नहीं दिखता।" },
  agree: { en: (m) => `ML cross-check: confirms ${m.bothFlagged} unusual day${m.bothFlagged === 1 ? "" : "s"} using day and night temperature together.`, hi: (m) => `ML जाँच: दिन और रात के तापमान को साथ देखकर ${m.bothFlagged} असामान्य दिन की पुष्टि होती है।` },
  partial: { en: (m) => `ML cross-check: the model flags ${m.mlFlagged} day${m.mlFlagged === 1 ? "" : "s"}, and ${m.bothFlagged} of them match the statistics.`, hi: (m) => `ML जाँच: मॉडल ${m.mlFlagged} दिन चिह्नित करता है, जिनमें से ${m.bothFlagged} सांख्यिकी से मेल खाते हैं।` },
  disagree: { en: () => "ML cross-check: the multivariate model does not flag the same days, so treat the anomaly as less certain.", hi: () => "ML जाँच: मल्टीवेरिएट मॉडल वही दिन चिह्नित नहीं करता, इसलिए इस असामान्यता को कम पक्का मानें।" },
};

function MlCheck({ ml, lang }) {
  const t = ML_TEXT[ml.agreement];
  if (!t) return null;
  return (
    <p className={`pred__ml pred__ml--${ml.agreement}`} title={ml.method}>
      <Cpu size={15} aria-hidden /> <span>{t[lang === "hi" ? "hi" : "en"](ml)}</span>
    </p>
  );
}

export default function PredictionPanel({ place, units }) {
  const unit = units.temperature === "fahrenheit" ? "fahrenheit" : "celsius";
  const deg = unit === "fahrenheit" ? "°F" : "°C";
  const [lang, setLang] = useState(() => readJson("wx.prediction.lang", "en"));
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => writeJson("wx.prediction.lang", lang), [lang]);
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: "" }));
    callWithRelay(() => axios.get("/api/prediction/analysis", { params: { lat: place.latitude, lon: place.longitude, name: place.name, unit, language: lang }, signal: ctl.signal, timeout: 40000 }))
      .then(({ data }) => setState({ loading: false, data: data.data, error: "" }))
      .catch((e) => !isCanceled(e) && setState((s) => ({ loading: false, data: s.data, error: errorMessage(e, "Couldn't analyse the forecast right now.") })));
    return () => ctl.abort();
  }, [place.latitude, place.longitude, place.name, unit, lang]);

  const { data, loading, error } = state;
  const f = data?.findings;
  const tiles = useMemo(() => {
    if (!f) return [];
    const warmest = f.temperatureVsNormal.filter((r) => r.departure !== null).sort((a, b) => b.departure - a.departure)[0];
    const r = f.trend.recent;
    const lvl = LEVEL[f.heatwave.level];
    return [
      { id: "heat", icon: Flame, label: T.heat[lang], value: lvl[lang], sub: f.heatwave.peak ? `${lang === "hi" ? "अधिकतम" : "Peak"} ${f.heatwave.peak.max}${deg}` : "", tone: lvl.tone },
      { id: "vs", icon: Activity, label: T.vs[lang], value: warmest ? `${warmest.departure > 0 ? "+" : ""}${warmest.departure}${deg}` : "—", sub: warmest ? `${lang === "hi" ? "सामान्य" : "usual"} ${warmest.normal}${deg}` : lang === "hi" ? "सामान्य उपलब्ध नहीं" : "No normal available", tone: warmest && warmest.departure >= 4 ? "poor" : warmest && warmest.departure >= 2 ? "fair" : "great" },
      { id: "trend", icon: r?.direction === "cooling" ? TrendingDown : TrendingUp, label: T.trend[lang], value: r ? { warming: lang === "hi" ? "गर्म हो रहा" : "Warming", cooling: lang === "hi" ? "ठंडा हो रहा" : "Cooling", steady: lang === "hi" ? "स्थिर" : "Steady" }[r.direction] : "—", sub: r ? `${r.delta > 0 ? "+" : ""}${r.delta}${deg} ${lang === "hi" ? "पिछले हफ़्ते से" : "vs the week before"}` : "", tone: undefined },
      { id: "rain", icon: CloudRain, label: T.rain[lang], value: `${f.rain.anyRainChance}%`, sub: `${f.rain.totalMm} mm${f.rain.comparison && f.rain.comparison !== "typical" ? ` · ${f.rain.comparison === "wetter" ? (lang === "hi" ? "सामान्य से ज़्यादा" : "wetter than usual") : lang === "hi" ? "सामान्य से कम" : "drier than usual"}` : ""}`, tone: undefined },
      { id: "sudden", icon: Wind, label: T.sudden[lang], value: String(f.suddenChanges.length), sub: f.suddenChanges.length ? SUDDEN[f.suddenChanges[0].type][lang] : lang === "hi" ? "कोई नहीं" : "None expected", tone: f.suddenChanges.some((e) => e.severity === "warning") ? "poor" : f.suddenChanges.length ? "fair" : "great" },
    ];
  }, [f, lang, deg]);

  return (
    <section className="pnl pred" aria-labelledby="pred-t">
      <div className="pred__head">
        <h2 id="pred-t" className="pnl__title"><Sparkles size={18} aria-hidden="true" /> {T.title[lang]}</h2>
        <div className="pred__lang" role="group" aria-label="Language">
          {[["en", "EN"], ["hi", "हिं"]].map(([id, label]) => (
            <button key={id} type="button" className={lang === id ? "is-on" : ""} aria-pressed={lang === id} onClick={() => setLang(id)}>{label}</button>
          ))}
        </div>
      </div>

      {loading && !data && <div className="skeleton" style={{ height: 180, borderRadius: 16 }} aria-busy="true" />}
      {error && !data && <p className="muted" role="alert">{error}</p>}

      {data && (
        <div className="pred__body" aria-busy={loading}>
          <div className="pred__summary">
            <span className={`pred__badge${data.explanation.source === "gemini" ? " is-ai" : ""}`}>
              <Sparkles size={13} aria-hidden="true" /> {data.explanation.source === "gemini" ? "Explained by Gemini" : lang === "hi" ? "स्मार्ट सारांश" : "Smart summary"}
            </span>
            <strong className="pred__headline">{data.explanation.headline}</strong>
            <p>{data.explanation.text}</p>
          </div>

          <ul className="kpis kpis--5 pred__tiles" role="list">
            {tiles.map(({ id, icon: Icon, label, value, sub, tone }) => (
              <li key={id} className="kpi" data-tone={tone}>
                <span className="kpi__label"><Icon size={14} aria-hidden="true" /> {label}</span>
                <strong className="kpi__text">{value}</strong>
                <small>{sub}</small>
              </li>
            ))}
          </ul>

          <NormalChart rows={f.temperatureVsNormal} deg={deg} lang={lang} />

          {f.suddenChanges.length > 0 && (
            <ul className="insights" role="list">
              {f.suddenChanges.map((e, i) => (
                <li key={i} className={`insight insight--${e.severity === "warning" ? "bad" : "warn"}`}>
                  <div>
                    <strong>{SUDDEN[e.type][lang]}</strong>
                    <p>{clockLabel(e.time, undefined)} · {dayMonth(e.time, undefined)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.ml?.available && <MlCheck ml={data.ml} lang={lang} />}

          <p className="pnl__note">
            {lang === "hi" ? "ये मौसम मॉडल के डेटा और पिछले वर्षों (ERA5) की तुलना से सांख्यिकीय अनुमान हैं, आधिकारिक चेतावनी नहीं। सामान्य = लगभग " : "Statistical estimates from weather-model data compared with the same time of year over about "}
            {f.basis.climatologyYears}{lang === "hi" ? " वर्षों का औसत।" : " previous years (ERA5). Not official warnings; see IMD for those."}
          </p>
        </div>
      )}
    </section>
  );
}
