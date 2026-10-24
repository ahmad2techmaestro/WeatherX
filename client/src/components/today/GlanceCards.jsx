import { CloudFog, CloudRain, Sun, Trees } from "lucide-react";

import { clockLabel } from "../../lib/format";
import { distance, distanceUnitLabel } from "../../lib/units";

/** Four things worth knowing in a second. Each jumps to its detailed card below. */
export default function GlanceCards({ data, units }) {
  const t = data.intelligence?.today;
  const tz = data.location.timezone;

  if (!t) return null;

  const items = [
    {
      key: "outside",
      icon: Trees,
      label: "Best time outside",
      value: t.outside ? `${clockLabel(t.outside.start, tz).replace(":00", "")} – ${clockLabel(t.outside.end, tz).replace(":00", "")}` : "No good window",
      note: t.outside ? `Comfort score ${t.outside.avg}/100` : "Not comfortable in the next 24 hours",
      tone: t.outside ? (t.outside.avg >= 70 ? "good" : "ok") : "warn",
      target: "tc-outside",
    },
    t.rain && {
      key: "rain",
      icon: CloudRain,
      label: "Rain",
      value: t.rain.firstWetInHours === -1 ? "Dry" : t.rain.firstWetInHours === 0 ? "Raining" : `In ${t.rain.firstWetInHours} h`,
      note: t.rain.headline,
      tone: t.rain.firstWetInHours === -1 ? "good" : "ok",
      target: "tc-rain",
    },
    t.visibility && {
      key: "vis",
      icon: CloudFog,
      label: "Visibility",
      value: `${distance(t.visibility.current.km, units)} ${distanceUnitLabel(units)}`,
      note: t.visibility.headline,
      tone: t.visibility.windows.length && t.visibility.current.tone === "good" ? "ok" : t.visibility.current.tone,
      target: "tc-vis",
    },
    t.uv && {
      key: "uv",
      icon: Sun,
      label: "UV peak",
      value: `${Math.round(t.uv.peak.uv)} · ${t.uv.level}`,
      note: t.uv.window ? `Protect ${clockLabel(t.uv.window.start, tz).replace(":00", "")} – ${clockLabel(t.uv.window.end, tz).replace(":00", "")}` : "No protection needed",
      tone: t.uv.peak.uv >= 8 ? "bad" : t.uv.peak.uv >= 6 ? "warn" : t.uv.peak.uv >= 3 ? "ok" : "good",
      target: "tc-uv",
    },
  ].filter(Boolean);

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <ul className="glance" role="list">
      {items.map((i) => (
        <li key={i.key} data-tone={i.tone}>
          <button type="button" onClick={() => jump(i.target)}>
            <span className="glance__icon"><i.icon size={19} aria-hidden="true" /></span>
            <span className="glance__label">{i.label}</span>
            <strong>{i.value}</strong>
            <small>{i.note}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
