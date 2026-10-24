/** Shared weather vocabulary: scene phases, scale labels and colours. */

export const PHASES = ["dawn", "day", "dusk", "night"];

/** Which part of the day it is at the place, from sunrise/sunset (unix seconds). */
export function phaseOfDay(now, sunrise, sunset, isDayFallback = true) {
  if (!sunrise || !sunset) return isDayFallback ? "day" : "night";

  const DAWN_BEFORE = 40 * 60;
  const DAWN_AFTER = 55 * 60;
  const DUSK_BEFORE = 55 * 60;
  const DUSK_AFTER = 40 * 60;

  if (now >= sunrise - DAWN_BEFORE && now < sunrise + DAWN_AFTER) return "dawn";
  if (now >= sunset - DUSK_BEFORE && now < sunset + DUSK_AFTER) return "dusk";
  if (now >= sunrise && now < sunset) return "day";

  return "night";
}

export const UV_LEVELS = [
  { max: 2.9, label: "Low", advice: "No protection needed for most people." },
  { max: 5.9, label: "Moderate", advice: "Wear sunglasses; use sunscreen if outside for long." },
  { max: 7.9, label: "High", advice: "Sunscreen, hat and shade around midday." },
  { max: 10.9, label: "Very high", advice: "Avoid midday sun; SPF 30+ and cover up." },
  { max: Infinity, label: "Extreme", advice: "Stay in shade; unprotected skin burns in minutes." },
];

export const uvLevel = (value) => UV_LEVELS.find((l) => (value ?? 0) <= l.max);

// India's National AQI categories (CPCB). Colours chosen to stay distinguishable without hue alone
// (the label and number are always shown next to the colour).
export const AQI_BANDS = [
  { key: "good", label: "Good", from: 0, to: 50, color: "#2e9e5b" },
  { key: "satisfactory", label: "Satisfactory", from: 51, to: 100, color: "#8fbf3a" },
  { key: "moderate", label: "Moderate", from: 101, to: 200, color: "#e6b422" },
  { key: "poor", label: "Poor", from: 201, to: 300, color: "#ea7c1e" },
  { key: "very-poor", label: "Very poor", from: 301, to: 400, color: "#d6453d" },
  { key: "severe", label: "Severe", from: 401, to: 500, color: "#8f2043" },
];

export const aqiColor = (key) => AQI_BANDS.find((b) => b.key === key)?.color ?? "#8a9099";

export const POLLUTANTS = [
  { key: "pm2_5", label: "PM2.5", name: "Fine particles", unit: "µg/m³", limit: 60 },
  { key: "pm10", label: "PM10", name: "Coarse particles", unit: "µg/m³", limit: 100 },
  { key: "no2", label: "NO₂", name: "Nitrogen dioxide", unit: "µg/m³", limit: 80 },
  { key: "o3", label: "O₃", name: "Ozone", unit: "µg/m³", limit: 100 },
  { key: "so2", label: "SO₂", name: "Sulphur dioxide", unit: "µg/m³", limit: 80 },
  { key: "co", label: "CO", name: "Carbon monoxide", unit: "µg/m³", limit: 2000 },
];

export const KIND_LABEL = {
  state: "State",
  district: "District",
  city: "City",
  town: "Town",
  village: "Village",
  locality: "Locality",
};

/** Short sentence for the hero: the most important thing to know right now. */
export function headline(overview) {
  if (!overview) return "";

  const warning = overview.advisories?.find((a) => a.severity === "warning");

  if (warning) return warning.title;

  const first = overview.insights?.find((i) => i.tone === "warn") || overview.insights?.[0];

  return first ? first.title : "";
}
