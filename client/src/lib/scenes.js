import { mix } from "./color";

/** Sky gradient stops [top, middle, horizon] by weather family and phase of day. */
const SKY = {
  fair: {
    dawn: ["#2f4a78", "#d3818a", "#f7c98f"],
    day: ["#2a78c2", "#6fb1e0", "#cfe7f1"],
    dusk: ["#2e2f66", "#b9547a", "#f4a85c"],
    night: ["#060a16", "#0e1a35", "#1d2c4e"],
  },
  overcast: {
    dawn: ["#4b5568", "#8d8794", "#c9b9a4"],
    day: ["#5f6e7d", "#8794a1", "#b9c3cb"],
    dusk: ["#3d4254", "#7a6a7c", "#b78b78"],
    night: ["#0a0f18", "#161e2b", "#242f3f"],
  },
  rain: {
    dawn: ["#3a4658", "#6d7886", "#a09a9a"],
    day: ["#4a5a6b", "#6c7b8a", "#98a5b0"],
    dusk: ["#323848", "#5f5f73", "#8c7c84"],
    night: ["#080c14", "#111925", "#1d2836"],
  },
  storm: {
    dawn: ["#262d3a", "#4a4f5e", "#775e62"],
    day: ["#2d3643", "#4a5565", "#6c7886"],
    dusk: ["#1f2431", "#3f3d52", "#6a5058"],
    night: ["#05070c", "#0c111a", "#161e2a"],
  },
  fog: {
    dawn: ["#6b6f7a", "#a29ca0", "#d0c4b8"],
    day: ["#8a96a1", "#b2bcc4", "#d5dbe0"],
    dusk: ["#555766", "#8a8290", "#b7a6a2"],
    night: ["#1c232e", "#2c3542", "#3d4857"],
  },
  snow: {
    dawn: ["#59667d", "#a39db0", "#e2c9c0"],
    day: ["#7e91a8", "#aebdcc", "#e0e8ef"],
    dusk: ["#50546e", "#8d80a0", "#d6aeb0"],
    night: ["#111a2a", "#1e2b42", "#34445f"],
  },
};

export const familyOf = (condition) => {
  switch (condition) {
    case "clear":
    case "mostly-clear":
    case "partly-cloudy":
      return "fair";
    case "fog":
      return "fog";
    case "drizzle":
    case "rain":
    case "freezing-rain":
      return "rain";
    case "heavy-rain":
    case "thunderstorm":
    case "hail":
      return "storm";
    case "snow":
      return "snow";
    default:
      return "overcast";
  }
};

export function skyFor(condition, phase) {
  return SKY[familyOf(condition)][phase];
}

/** Colours for the three landscape layers, derived from the sky so scene and ground always agree. */
export function landFor(condition, phase) {
  const family = familyOf(condition);
  const [, , horizon] = skyFor(condition, phase);
  const night = phase === "night";

  if (family === "snow") {
    return [mix(horizon, "#c9d4e2", 0.5), mix(horizon, "#aebccd", night ? 0.1 : 0.45), mix(horizon, "#8d9db3", night ? 0.1 : 0.5)];
  }

  const far = mix(horizon, "#33546c", night ? 0.55 : 0.4);
  const mid = mix(horizon, "#244a44", night ? 0.8 : 0.58);
  const near = mix(horizon, "#102a25", night ? 0.9 : 0.76);

  return [far, mid, near];
}

export function cloudTint(condition, phase) {
  const family = familyOf(condition);

  if (family === "storm") return phase === "night" ? "#2a3240" : "#5b6573";
  if (family === "rain") return phase === "night" ? "#303a49" : "#8693a1";
  if (phase === "night") return "#3a4660";
  if (phase === "dusk") return "#f2c9c0";
  if (phase === "dawn") return "#f6d5c4";

  return family === "overcast" ? "#d3d9df" : "#ffffff";
}

/** Fraction of the sky covered, driving how many clouds are drawn. */
export function cloudCount(condition, cover = 0) {
  if (condition === "clear") return 0;
  if (condition === "mostly-clear") return 2;
  if (condition === "partly-cloudy") return 4;

  if (["overcast", "rain", "heavy-rain", "thunderstorm", "hail", "snow", "drizzle", "freezing-rain"].includes(condition)) {
    return cover > 85 ? 8 : 6;
  }

  return Math.max(1, Math.round(cover / 18));
}

export function precipitationKind(condition) {
  if (condition === "snow") return "snow";
  if (condition === "hail") return "hail";
  if (["drizzle", "rain", "heavy-rain", "thunderstorm", "freezing-rain"].includes(condition)) return "rain";

  return null;
}

export function precipitationIntensity(condition, mm = 0) {
  const base = { drizzle: 0.22, rain: 0.5, "freezing-rain": 0.4, "heavy-rain": 0.9, thunderstorm: 0.85, hail: 0.7, snow: 0.55 }[condition] ?? 0;

  return Math.min(1, base + Math.min(0.2, mm / 20));
}

/** Path for the lit part of the moon at `phase` (0 new → 0.5 full → 1 new), radius r, centred on 0,0. */
export function moonPath(phase, r) {
  const waxing = phase < 0.5;
  const k = Math.cos(phase * 2 * Math.PI);
  const rx = Math.abs(k) * r;
  const outer = waxing ? 1 : 0;
  const back = k > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0;

  return `M0 ${-r} A${r} ${r} 0 0 ${outer} 0 ${r} A${rx.toFixed(2)} ${r} 0 0 ${back} 0 ${-r}Z`;
}
