import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Camera, CloudSun, ImageUp, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

import PageHero from "../../components/ui/PageHero";
import { usePlaces } from "../../context/PlacesContext";
import { errorMessage } from "../../lib/api";

const MAX_SIDE = 1280;

/** Phone photos can be 8 MB+: shrink to a 1280 px JPEG in the browser before uploading (falls back to the original). */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    return blob || file;
  } catch {
    return file;
  }
}

const TONE = { clear: "good", partly_cloudy: "good", overcast: "quiet", dark_clouds: "bad", hazy: "warn", night_or_dark: "quiet", uncertain: "quiet" };
const VERDICT = { consistent: "Matches the forecast", photo_cloudier: "Cloudier than forecast", photo_clearer: "Clearer than forecast" };

export default function Sky() {
  const { place } = usePlaces();
  const [ml, setMl] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [describe, setDescribe] = useState(false);
  const [state, setState] = useState({ busy: false, error: "", data: null });
  const input = useRef(null);

  useEffect(() => {
    document.title = "Sky Check — WeatherX";
    axios.get("/api/ml/status", { timeout: 8000 }).then((r) => setMl(r.data.data)).catch(() => setMl({ enabled: false, healthy: false }));
  }, []);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (f) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setState({ busy: false, error: "Choose a JPEG, PNG or WebP photo.", data: null });
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setState({ busy: false, error: "", data: null });
  };

  const analyse = async () => {
    if (!file || state.busy) return;
    setState({ busy: true, error: "", data: null });
    try {
      const blob = await shrink(file);
      const { data } = await axios.post("/api/vision/sky", blob, { params: { lat: place.latitude, lon: place.longitude, describe: describe ? 1 : 0 }, headers: { "Content-Type": blob.type || "image/jpeg" }, timeout: 60000, transformRequest: [(d) => d] });
      setState({ busy: false, error: "", data: data.data });
    } catch (e) {
      setState({ busy: false, error: errorMessage(e, "Couldn't analyse the photo."), data: null });
    }
  };

  const d = state.data;
  const offline = ml && !ml.healthy;

  return (
    <>
      <PageHero eyebrow="Sky Check · computer vision" title="Does your sky match the forecast?" subtitle="Take or upload a photo of the sky. Image analysis estimates cloud cover and haze, then compares it with the forecast for your place." meta={[place.name, ml?.healthy && `ML service ${ml.version || ""}`.trim()]} />

      {offline && (
        <section className="pnl sk__off" role="status">
          <h2 className="pnl__title"><TriangleAlert size={18} aria-hidden /> The ML service isn't running</h2>
          <p className="muted">{ml.enabled ? "WeatherX can't reach the Python ML service right now." : "Sky Check uses the optional Python ML service (ML_SERVICE_URL is not set)."} Start it with <code>npm run ml</code> and set <code>ML_SERVICE_URL=http://127.0.0.1:8001</code> in <code>server/.env</code>. Everything else in the app works without it.</p>
        </section>
      )}

      <section className="pnl sk" aria-labelledby="sk-up">
        <h2 id="sk-up" className="pnl__title"><Camera size={18} aria-hidden /> Your photo</h2>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a sky photo" />
        <div className="sk__drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
          {preview ? <img src={preview} alt="Your sky photo" className="sk__img" /> : (
            <button type="button" className="sk__pick" onClick={() => input.current?.click()}><ImageUp size={28} aria-hidden /><strong>Take or choose a photo</strong><small>JPEG, PNG or WebP. Point the camera up so most of the photo is sky.</small></button>
          )}
        </div>
        <div className="sk__row">
          {preview && <button type="button" className="btn" onClick={() => input.current?.click()}>Change photo</button>}
          <button type="button" className="btn btn--primary" onClick={analyse} disabled={!file || state.busy || offline}>{state.busy ? "Analysing…" : "Analyse sky"}</button>
          <label className="sk__check"><input type="checkbox" checked={describe} onChange={(e) => setDescribe(e.target.checked)} /> Also ask Gemini to describe it <small>(sends the photo to Google)</small></label>
        </div>
        {state.error && <p className="rs__error" role="alert">{state.error}</p>}
      </section>

      {d && (
        <section className="pnl sk__result" aria-labelledby="sk-res">
          <h2 id="sk-res" className="pnl__title"><CloudSun size={18} aria-hidden /> What the photo shows</h2>
          <div className="sk__top">
            <span className={`sa__pill sa__pill--${TONE[d.label] === "good" ? "good" : TONE[d.label] === "bad" ? "bad" : "quiet"} sk__label`}>{d.labelText}</span>
            <span className="muted">Confidence {Math.round(d.confidence * 100)}%</span>
          </div>
          {d.cloudCoverPercent != null && (
            <div className="sk__meter" role="img" aria-label={`About ${d.cloudCoverPercent}% cloud cover`}>
              <div><span>Cloud cover in photo</span><strong>{d.cloudCoverPercent}%</strong></div>
              <i style={{ "--w": `${d.cloudCoverPercent}%` }} />
              {d.comparison && <div><span>Forecast now ({d.comparison.forecastCondition})</span><strong>{d.comparison.forecastCloudCover}%</strong></div>}
            </div>
          )}
          {d.comparison && <p className={`sk__cmp sk__cmp--${d.comparison.verdict}`}><strong>{VERDICT[d.comparison.verdict]}.</strong> {d.comparison.text}</p>}
          {d.note && <p className="muted">{d.note}</p>}
          {d.description && <p className="rs__answer sk__desc"><span className="pred__badge is-ai"><Sparkles size={12} aria-hidden /> Gemini's description (not verified)</span>{d.description.text}</p>}
          <details className="sk__feat"><summary>How this was measured</summary>
            <p className="muted">{d.method}</p>
            <ul>{Object.entries(d.features).map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}</ul>
          </details>
          <p className="rs__note"><ShieldCheck size={14} aria-hidden /> {d.caveat} The photo is analysed and not stored.</p>
        </section>
      )}
    </>
  );
}
