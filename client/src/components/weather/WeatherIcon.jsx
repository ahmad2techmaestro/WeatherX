import { useId } from "react";

/**
 * Hand-drawn weather glyphs (64×64). Colours are fixed (not theme-driven) so a
 * cloud reads as a cloud on paper and on ink; outlines keep them legible on both.
 */

const SUN = "#ffb21e";
const SUN_DEEP = "#ff8a1f";
const MOON = "#f3e9c6";
const MOON_SHADE = "#d9ccA0";
const CLOUD = "#f4f7fa";
const CLOUD_DARK = "#aeb8c4";
const CLOUD_STORM = "#7f8a98";
const OUTLINE = "rgba(56,70,88,.38)";
const DROP = "#49a6e8";
const ICE = "#cfe9ff";
const BOLT = "#ffd23f";

const CLOUD_PATH = "M19 47a10 10 0 0 1-1.4-19.9A14.5 14.5 0 0 1 45.6 25 11.5 11.5 0 0 1 46 47z";

function Sun({ cx = 32, cy = 32, r = 11, rays = true, spin }) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <g>
      {rays && (
        <g className={spin ? "wx-spin" : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {angles.map((a) => (
            <rect key={a} x={cx - 1.6} y={cy - r - 8.5} width="3.2" height="6" rx="1.6" fill={SUN_DEEP} transform={`rotate(${a} ${cx} ${cy})`} />
          ))}
        </g>
      )}
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={SUN_DEEP} strokeOpacity=".45" strokeWidth="1.2" />
    </g>
  );
}

function Moon({ cx = 32, cy = 32, r = 12, id }) {
  return (
    <g>
      <defs>
        <mask id={`${id}-m`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx={cx + 8} cy={cy - 5} r={r * 0.92} fill="#000" />
        </mask>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={MOON} mask={`url(#${id}-m)`} />
      <circle cx={cx - 4} cy={cy + 5} r="1.6" fill={MOON_SHADE} opacity=".7" />
      <circle cx={cx - 1} cy={cy - 3} r="1.1" fill={MOON_SHADE} opacity=".6" />
    </g>
  );
}

function Cloud({ x = 0, y = 0, scale = 1, fill = CLOUD, drift }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={drift ? "wx-drift" : undefined}>
        <path d={CLOUD_PATH} fill={fill} stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M24 44.5c3.2 1.4 9 1.6 16 0" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>
    </g>
  );
}

function Drops({ count = 3, heavy, tiltDeg = 14, color = DROP, animate }) {
  const xs = count === 2 ? [26, 38] : count === 3 ? [22, 32, 42] : [19, 27, 35, 43];

  return (
    <g>
      {xs.map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={heavy ? 49 : 50}
          x2={x - 3 * Math.tan((tiltDeg * Math.PI) / 180) * 2}
          y2={heavy ? 59 : 57}
          stroke={color}
          strokeWidth={heavy ? 3.2 : 2.6}
          strokeLinecap="round"
          className={animate ? "wx-fall" : undefined}
          style={animate ? { animationDelay: `${i * 0.22}s` } : undefined}
        />
      ))}
    </g>
  );
}

function Flakes({ animate }) {
  return (
    <g>
      {[22, 32, 42].map((x, i) => (
        <g key={x} className={animate ? "wx-fall-soft" : undefined} style={animate ? { animationDelay: `${i * 0.35}s` } : undefined}>
          <circle cx={x} cy={54 + (i % 2) * 3} r="2.4" fill={ICE} stroke="#8fb9de" strokeWidth=".9" />
        </g>
      ))}
    </g>
  );
}

function Bolt({ animate }) {
  return <path className={animate ? "wx-flash" : undefined} d="M34 44l-7 11h6l-3 9 11-14h-6.5z" fill={BOLT} stroke="#d99a00" strokeWidth="1" strokeLinejoin="round" />;
}

function Haze() {
  return (
    <g stroke="#9aa6b3" strokeWidth="3" strokeLinecap="round">
      <line x1="16" y1="51" x2="42" y2="51" />
      <line x1="24" y1="57.5" x2="50" y2="57.5" />
    </g>
  );
}

export default function WeatherIcon({ condition = "clear", isDay = true, size = 48, animated = false, title, className = "" }) {
  const id = useId().replace(/:/g, "");
  const night = !isDay;

  let art;

  switch (condition) {
    case "clear":
      art = night ? <Moon id={id} cx={32} cy={32} r={14} /> : <Sun cx={32} cy={32} r={13} spin={animated} />;
      break;
    case "mostly-clear":
      art = (
        <>
          {night ? <Moon id={id} cx={28} cy={27} r={12} /> : <Sun cx={28} cy={27} r={9.5} spin={animated} />}
          <Cloud x={14} y={10} scale={0.62} drift={animated} />
        </>
      );
      break;
    case "partly-cloudy":
      art = (
        <>
          {night ? <Moon id={id} cx={25} cy={24} r={11} /> : <Sun cx={25} cy={24} r={9} spin={animated} />}
          <Cloud x={4} y={4} scale={0.9} drift={animated} />
        </>
      );
      break;
    case "overcast":
      art = (
        <>
          <Cloud x={14} y={-6} scale={0.7} fill={CLOUD_DARK} />
          <Cloud x={0} y={4} scale={0.92} fill="#dfe5ec" drift={animated} />
        </>
      );
      break;
    case "fog":
      art = (
        <>
          <Cloud x={2} y={-6} scale={0.9} fill="#e6ebf0" />
          <Haze />
        </>
      );
      break;
    case "drizzle":
      art = (
        <>
          <Cloud x={2} y={-6} scale={0.92} />
          <Drops count={3} animate={animated} />
        </>
      );
      break;
    case "rain":
      art = (
        <>
          <Cloud x={2} y={-7} scale={0.92} fill="#e3e9f0" />
          <Drops count={3} animate={animated} />
        </>
      );
      break;
    case "heavy-rain":
      art = (
        <>
          <Cloud x={2} y={-8} scale={0.92} fill={CLOUD_DARK} />
          <Drops count={4} heavy animate={animated} />
        </>
      );
      break;
    case "freezing-rain":
      art = (
        <>
          <Cloud x={2} y={-8} scale={0.92} fill="#dbe3ec" />
          <Drops count={2} animate={animated} />
          <circle cx="44" cy="56" r="2.3" fill={ICE} stroke="#8fb9de" strokeWidth=".9" />
        </>
      );
      break;
    case "snow":
      art = (
        <>
          <Cloud x={2} y={-8} scale={0.92} fill="#e9eff5" />
          <Flakes animate={animated} />
        </>
      );
      break;
    case "thunderstorm":
      art = (
        <>
          <Cloud x={2} y={-9} scale={0.92} fill={CLOUD_STORM} />
          <Bolt animate={animated} />
          <Drops count={2} animate={animated} />
        </>
      );
      break;
    case "hail":
      art = (
        <>
          <Cloud x={2} y={-9} scale={0.92} fill={CLOUD_STORM} />
          <Bolt animate={animated} />
          <circle cx="20" cy="56" r="2.4" fill={ICE} stroke="#8fb9de" strokeWidth=".9" />
          <circle cx="46" cy="55" r="2.4" fill={ICE} stroke="#8fb9de" strokeWidth=".9" />
        </>
      );
      break;
    default:
      art = <Cloud x={2} y={2} />;
  }

  return (
    <svg
      className={`wx-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {art}
    </svg>
  );
}
