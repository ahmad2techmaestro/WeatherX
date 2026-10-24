import { Droplets, Eye, Gauge, Thermometer, Wind, Sun, Cloud, CloudRain } from "lucide-react";

import { useSettings } from "../../context/SettingsContext";
import { compass, distance, distanceUnitLabel, precip, precipUnitLabel, pressure, pressureUnitLabel, tempLabel, wind, windUnitLabel } from "../../lib/units";
import { UV_LEVELS, uvLevel } from "../../lib/weather";

function Tile({ icon: Icon, title, children, foot, className = "" }) {
  return (
    <article className={`tile ${className}`}>
      <h3>
        <Icon size={15} aria-hidden="true" /> {title}
      </h3>
      <div className="tile__body">{children}</div>
      {foot && <p className="tile__foot">{foot}</p>}
    </article>
  );
}

/** Compass showing the direction the wind is blowing *towards* (arrow) and where it comes *from* (label). */
function WindCompass({ degrees, speed, unit, gust }) {
  const to = ((degrees ?? 0) + 180) % 360;

  return (
    <div className="compass" role="img" aria-label={`Wind ${speed} ${unit} from the ${compass(degrees)}, gusts ${gust}`}>
      <svg viewBox="-60 -60 120 120" aria-hidden="true">
        <circle r="52" className="compass__ring" />
        {Array.from({ length: 36 }, (_, i) => (
          <line key={i} x1="0" y1="-52" x2="0" y2={i % 9 === 0 ? -44 : -48.5} transform={`rotate(${i * 10})`} className={i % 9 === 0 ? "compass__tick compass__tick--major" : "compass__tick"} />
        ))}
        {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([label, angle]) => (
          <text key={label} x={Math.sin((angle * Math.PI) / 180) * 33} y={-Math.cos((angle * Math.PI) / 180) * 33 + 4} textAnchor="middle" className="compass__label">
            {label}
          </text>
        ))}
        <g transform={`rotate(${to})`} className="compass__arrow">
          <path d="M0 -30 L7 -12 L2 -12 L2 24 L-2 24 L-2 -12 L-7 -12 Z" />
        </g>
      </svg>
      <div className="compass__center">
        <strong>{speed}</strong>
        <small>{unit}</small>
      </div>
    </div>
  );
}

function UvBar({ value }) {
  const pct = Math.min(100, ((value ?? 0) / 12) * 100);

  return (
    <div className="uvbar" role="img" aria-label={`UV index ${Math.round(value ?? 0)}, ${uvLevel(value).label}`}>
      <div className="uvbar__track">
        <i style={{ left: `${pct}%` }} />
      </div>
      <div className="uvbar__scale" aria-hidden="true">
        {UV_LEVELS.map((l) => (
          <span key={l.label}>{l.label.split(" ")[0]}</span>
        ))}
      </div>
    </div>
  );
}

function Ring({ value }) {
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <svg className="hring" viewBox="0 0 88 88" role="img" aria-label={`${value}%`}>
      <circle cx="44" cy="44" r={r} className="hring__bg" />
      <circle cx="44" cy="44" r={r} className="hring__fg" strokeDasharray={`${(c * Math.min(100, value ?? 0)) / 100} ${c}`} transform="rotate(-90 44 44)" />
      <text x="44" y="50" textAnchor="middle">
        {value}%
      </text>
    </svg>
  );
}

export default function Metrics({ overview, omit = [] }) {
  const { units } = useSettings();
  const { current, hourly, daily } = overview;
  const uv = uvLevel(current.uvIndex);
  const rain24 = hourly.slice(0, 24).reduce((sum, h) => sum + (h.precipitation || 0), 0);

  // Pressure trend over the next three hours.
  const p0 = hourly[0]?.pressure;
  const p3 = hourly[3]?.pressure;
  const delta = p0 != null && p3 != null ? p3 - p0 : null;
  const trend = delta === null ? null : delta > 0.8 ? "Rising" : delta < -0.8 ? "Falling" : "Steady";

  const humidityNote = current.humidity >= 80 ? "Very humid, close air" : current.humidity >= 60 ? "Humid" : current.humidity >= 30 ? "Comfortable" : "Dry air";

  return (
    <div className="tiles">
      <Tile icon={Wind} title="Wind" className="tile--wind" foot={`From the ${compass(current.windDirection)} · gusts ${wind(current.windGust, units)} ${windUnitLabel(units)}`}>
        <WindCompass degrees={current.windDirection} speed={wind(current.windSpeed, units)} unit={windUnitLabel(units)} gust={wind(current.windGust, units)} />
      </Tile>

{!omit.includes("UV index") && (
      <Tile icon={Sun} title="UV index" className="tile--uv" foot={uv.advice}>
        <div className="tile__big">
          {Math.round(current.uvIndex)} <small>{uv.label}</small>
        </div>
        <UvBar value={current.uvIndex} />
        {daily[0]?.uvIndexMax != null && <p className="tile__sub">Today's peak {Math.round(daily[0].uvIndexMax)}</p>}
      </Tile>
)}

      <Tile icon={Droplets} title="Humidity" foot={`Dew point ${tempLabel(current.dewPoint, units)} · ${humidityNote}`}>
        <Ring value={current.humidity} />
      </Tile>

      <Tile icon={Thermometer} title="Feels like" className="tile--heat" foot={current.feelsLike - current.temperature >= 3 ? "Humidity makes it feel warmer" : current.feelsLike - current.temperature <= -3 ? "Wind makes it feel cooler" : "Close to the actual temperature"}>
        <div className="tile__big">{tempLabel(current.feelsLike, units)}</div>
        <p className="tile__sub">Air temperature {tempLabel(current.temperature, units)}</p>
      </Tile>

{!omit.includes("Rain") && (
      <Tile icon={CloudRain} title="Rain" className="tile--rain" foot={hourly.slice(0, 24).some((h) => (h.precipProbability ?? 0) >= 50) ? "Showers likely in the next 24 h" : "No significant rain expected"}>
        <div className="tile__big">
          {precip(rain24, units)} <small>{precipUnitLabel(units)}</small>
        </div>
        <p className="tile__sub">expected in the next 24 h</p>
      </Tile>
)}

{!omit.includes("Visibility") && (
      <Tile icon={Eye} title="Visibility" foot={current.visibilityKm !== null && current.visibilityKm < 2 ? "Low — drive carefully" : current.visibilityKm !== null && current.visibilityKm < 6 ? "Hazy" : "Clear view"}>
        <div className="tile__big">
          {distance(current.visibilityKm, units) ?? "—"} <small>{distanceUnitLabel(units)}</small>
        </div>
      </Tile>
)}

      <Tile icon={Gauge} title="Pressure" className="tile--press" foot={trend ? `${trend} over the next 3 h` : undefined}>
        <div className="tile__big">
          {pressure(current.pressure, units) ?? "—"} <small>{pressureUnitLabel(units)}</small>
        </div>
      </Tile>

      <Tile icon={Cloud} title="Cloud cover" foot={current.cloudCover < 20 ? "Mostly clear skies" : current.cloudCover < 60 ? "Partly cloudy" : "Mostly cloudy"}>
        <div className="tile__big">
          {current.cloudCover}
          <small>%</small>
        </div>
        <div className="bar">
          <i style={{ width: `${current.cloudCover}%` }} />
        </div>
      </Tile>
    </div>
  );
}
