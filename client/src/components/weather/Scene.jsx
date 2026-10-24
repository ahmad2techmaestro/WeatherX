import { useEffect, useMemo, useRef, useState } from "react";

import Precipitation from "./Precipitation";
import { seeded } from "../../lib/color";
import { cloudCount, cloudTint, familyOf, landFor, moonPath, precipitationIntensity, precipitationKind, skyFor } from "../../lib/scenes";
import { phaseOfDay } from "../../lib/weather";

/* ───────────── sky bodies ───────────── */

function bodyPosition(progress) {
  const p = Math.max(-0.08, Math.min(1.08, progress));

  return { x: 9 + 82 * p, y: 66 - 50 * Math.sin(Math.PI * Math.max(0, Math.min(1, p))) };
}

function Sun({ progress, dim }) {
  const { x, y } = bodyPosition(progress);

  return (
    <div className="wx-sun" style={{ left: `${x}%`, top: `${y}%`, opacity: dim }}>
      <span className="wx-sun__glow" />
      <span className="wx-sun__disc" />
    </div>
  );
}

function Moon({ progress, moon, dim }) {
  const { x, y } = bodyPosition(progress);
  const r = 18;

  return (
    <div className="wx-moon" style={{ left: `${x}%`, top: `${y}%`, opacity: dim }}>
      <svg viewBox="-30 -30 60 60" width="64" height="64" aria-hidden="true">
        <defs>
          <radialGradient id="moon-glow">
            <stop offset="0" stopColor="#fff6d8" stopOpacity=".28" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r="30" fill="url(#moon-glow)" />
        <circle r={r} fill="#10182c" opacity=".55" />
        <path d={moonPath(moon?.phase ?? 0.5, r)} fill="#f6efd8" />
      </svg>
    </div>
  );
}

function Stars({ opacity }) {
  const stars = useMemo(() => {
    const rand = seeded(7);

    return Array.from({ length: 70 }, (_, i) => ({ id: i, x: rand() * 100, y: rand() * 60, s: 1 + rand() * 1.8, d: rand() * 5, o: 0.4 + rand() * 0.6 }));
  }, []);

  return (
    <div className="wx-stars" style={{ opacity }} aria-hidden="true">
      {stars.map((s) => (
        <i key={s.id} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
}

/* ───────────── clouds ───────────── */

const PUFF = "M14 58a14 14 0 0 1 4-27 20 20 0 0 1 37-6 17 17 0 0 1 28 12 13 13 0 0 1 5 21z";

function Clouds({ count, tint, windSpeed, dark }) {
  const clouds = useMemo(() => {
    const rand = seeded(count * 13 + 5);

    return Array.from({ length: count }, (_, i) => ({
      id: i,
      top: 4 + rand() * 34,
      scale: 0.8 + rand() * 1.5,
      delay: -rand() * 160,
      opacity: 0.55 + rand() * 0.4,
    }));
  }, [count]);

  // Stronger wind → faster drift (one crossing takes 70–200 s).
  const base = Math.max(70, 200 - windSpeed * 3);

  return (
    <div className="wx-clouds" aria-hidden="true">
      {clouds.map((c) => (
        <svg
          key={c.id}
          className="wx-cloud"
          viewBox="0 0 100 70"
          style={{ top: `${c.top}%`, width: `${130 * c.scale}px`, opacity: c.opacity, animationDuration: `${base * (0.75 + c.scale * 0.3)}s`, animationDelay: `${c.delay}s` }}
        >
          <path d={PUFF} fill={tint} />
          {dark && <path d={PUFF} fill="#000" opacity=".12" />}
        </svg>
      ))}
    </div>
  );
}

/* ───────────── fog, lightning, landscape ───────────── */

function Fog() {
  return (
    <div className="wx-fog" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

function Lightning() {
  const [flash, setFlash] = useState(0);
  const [bolt, setBolt] = useState(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    let timer;
    let off;

    const strike = () => {
      const rand = seeded(Date.now() % 100000);
      const x0 = 20 + rand() * 60;
      let x = x0;
      let y = 0;
      const points = [[x, y]];

      while (y < 62) {
        y += 6 + rand() * 8;
        x += (rand() - 0.5) * 12;
        points.push([x, y]);
      }

      setBolt(points.map((p) => p.join(",")).join(" "));
      setFlash((n) => n + 1);
      off = setTimeout(() => setBolt(null), 220);
      timer = setTimeout(strike, 3500 + Math.random() * 6500);
    };

    timer = setTimeout(strike, 1800);

    return () => {
      clearTimeout(timer);
      clearTimeout(off);
    };
  }, []);

  return (
    <>
      <div key={flash} className={`wx-flash-layer ${flash ? "is-on" : ""}`} aria-hidden="true" />
      {bolt && (
        <svg className="wx-bolt" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={bolt} fill="none" stroke="#fff" strokeWidth="0.7" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
}

function Landscape({ colors, condition }) {
  const [far, mid, near] = colors;
  const trees = useMemo(() => {
    const rand = seeded(11);

    return Array.from({ length: 9 }, (_, i) => ({ id: i, x: 40 + i * 128 + rand() * 60, s: 0.7 + rand() * 0.8 }));
  }, []);
  const snowy = condition === "snow";

  return (
    <svg className="wx-land" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path fill={far} d="M0 206 L90 160 L160 188 L260 120 L350 176 L430 142 L540 196 L640 128 L750 190 L850 150 L960 196 L1060 140 L1200 198 V300 H0Z" />
      <path fill={mid} d="M0 238 C150 194 280 252 430 226 C600 196 700 262 860 236 C1000 214 1100 238 1200 222 V300 H0Z" />
      <path fill={near} d="M0 274 C200 248 360 288 560 268 C760 248 940 288 1200 262 V300 H0Z" />
      {!snowy &&
        trees.map((t) => (
          <g key={t.id} transform={`translate(${t.x} ${262 - t.s * 4}) scale(${t.s})`} fill={near}>
            <rect x="-1.6" y="-6" width="3.2" height="16" />
            <circle cx="0" cy="-16" r="11" />
            <circle cx="-9" cy="-10" r="8" />
            <circle cx="9" cy="-10" r="8" />
          </g>
        ))}
    </svg>
  );
}

/* ───────────── scene ───────────── */

/**
 * A full-bleed weather scene: sky, sun/moon at their real position for the
 * place's local time, stars, drifting clouds, precipitation, fog, lightning and
 * a landscape. Everything is driven by the actual conditions.
 */
export default function Scene({ weather, astronomy, now, children, className = "", compact = false, forcePhase, parallax = false }) {
  const root = useRef(null);
  const frame = useRef(0);

  // Pointer-driven depth: layers shift by different amounts, so the scene reads as 3D.
  const onPointerMove = parallax
    ? (event) => {
        if (event.pointerType === "touch") return;

        const { clientX, clientY } = event;

        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const el = root.current;

          if (!el) return;

          const r = el.getBoundingClientRect();

          el.style.setProperty("--px", (((clientX - r.left) / r.width) * 2 - 1).toFixed(3));
          el.style.setProperty("--py", (((clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        });
      }
    : undefined;
  const onPointerLeave = parallax
    ? () => {
        cancelAnimationFrame(frame.current);
        root.current?.style.setProperty("--px", "0");
        root.current?.style.setProperty("--py", "0");
      }
    : undefined;

  const condition = weather?.condition ?? "clear";
  const sunrise = astronomy?.sunrise;
  const sunset = astronomy?.sunset;
  const t = now ?? weather?.time ?? Math.floor(Date.now() / 1000);
  const phase = forcePhase || phaseOfDay(t, sunrise, sunset, weather?.isDay ?? true);
  const [top, middle, horizon] = skyFor(condition, phase);
  const land = landFor(condition, phase);
  const family = familyOf(condition);
  const kind = precipitationKind(condition);
  const intensity = precipitationIntensity(condition, weather?.precipitation);
  const windDirection = weather?.windDirection ?? 0;
  const windSpeed = weather?.windSpeed ?? 0;
  // Wind blows *from* windDirection; precipitation drifts the opposite way.
  const drift = (-Math.sin((windDirection * Math.PI) / 180) * Math.min(windSpeed, 45)) / 45;
  const clouds = cloudCount(condition, weather?.cloudCover);
  const hasSun = (phase === "day" || phase === "dawn" || phase === "dusk") && sunrise && sunset;
  const sunProgress = hasSun ? (t - sunrise) / (sunset - sunrise) : 0.5;
  const nightProgress = sunrise && sunset ? (phase === "night" ? ((t < sunrise ? t + 86400 : t) - sunset) / (sunrise + 86400 - sunset) : 0.5) : 0.5;
  const obscured = family === "storm" || family === "rain" || condition === "overcast" || condition === "fog" || condition === "snow";
  const bodyOpacity = condition === "overcast" ? 0.28 : obscured ? 0.12 : condition === "partly-cloudy" ? 0.9 : 1;
  const starOpacity = phase === "night" ? (obscured ? 0.12 : condition === "partly-cloudy" ? 0.7 : 1) : phase === "dawn" || phase === "dusk" ? 0.18 : 0;

  return (
    <div
      ref={root}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      data-parallax={parallax ? "" : undefined}
      className={`wx-scene wx-scene--${phase} wx-scene--${family} ${compact ? "wx-scene--compact" : ""} ${className}`}
      style={{ "--sky-top": top, "--sky-mid": middle, "--sky-low": horizon }}
    >
      <div className="wx-scene__sky" aria-hidden="true">
        <Stars opacity={starOpacity} />
        {hasSun && <Sun progress={sunProgress} dim={bodyOpacity} />}
        {phase === "night" && <Moon progress={nightProgress} moon={astronomy?.moon} dim={obscured ? 0.18 : 1} />}
        {clouds > 0 && <Clouds count={compact ? Math.min(clouds, 4) : clouds} tint={cloudTint(condition, phase)} windSpeed={windSpeed} dark={family === "storm"} />}
        {condition === "fog" && <Fog />}
        {kind && <Precipitation kind={kind} intensity={intensity} wind={drift} />}
        {(condition === "thunderstorm" || condition === "hail") && !compact && <Lightning />}
      </div>
      {!compact && <Landscape colors={land} condition={condition} />}
      <div className="wx-scene__scrim" aria-hidden="true" />
      <div className="wx-scene__content">{children}</div>
    </div>
  );
}
